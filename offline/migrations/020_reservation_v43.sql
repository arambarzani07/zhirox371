-- V43 ISOLATED TEST ONLY: stock and price holds while external tender awaits.
-- Absolutely no bank API, payment collection or formal deployment.
BEGIN;
CREATE TABLE zhirox_local.inventory_reservation_sessions_v43(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 request_id uuid NOT NULL, cashier_id uuid NOT NULL,
 quoted_total_minor bigint NOT NULL CHECK(quoted_total_minor BETWEEN 1 AND 9999999999999),
 state text NOT NULL DEFAULT 'held' CHECK(state IN('held','consumed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 state_changed_at timestamptz,
 PRIMARY KEY(store_id,request_id),
 FOREIGN KEY(store_id,request_id)
 REFERENCES zhirox_local.tender_plans_v41(store_id,request_id),
 CHECK(expires_at>created_at)
);
CREATE TABLE zhirox_local.inventory_reservation_items_v43(
 store_id uuid NOT NULL,request_id uuid NOT NULL,product_id uuid NOT NULL,
 qty_base bigint NOT NULL CHECK(qty_base>0),
 PRIMARY KEY(store_id,request_id,product_id),
 FOREIGN KEY(store_id,request_id)
 REFERENCES zhirox_local.inventory_reservation_sessions_v43(store_id,request_id),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE INDEX v43_product_holds
 ON zhirox_local.inventory_reservation_items_v43(store_id,product_id);

CREATE OR REPLACE FUNCTION zhirox_local.protect_reserved_product_v43()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v43$
DECLARE held numeric;
BEGIN
 SELECT COALESCE(SUM(r.qty_base),0) INTO held
 FROM zhirox_local.inventory_reservation_items_v43 r
 WHERE r.store_id=OLD.store_id AND r.product_id=OLD.id;
 IF TG_OP='DELETE' THEN
  IF held>0 THEN RAISE EXCEPTION 'reserved product cannot be removed'
   USING ERRCODE='P4302'; END IF;
  RETURN OLD;
 END IF;
 IF held>0 AND (NEW.price_minor<>OLD.price_minor OR
    NEW.active<>OLD.active OR NEW.base_unit<>OLD.base_unit OR
    NEW.plu IS DISTINCT FROM OLD.plu)
 THEN RAISE EXCEPTION 'reserved product price or identity locked'
  USING ERRCODE='P4302'; END IF;
 IF NEW.stock_base_units<held THEN
  RAISE EXCEPTION 'reserved stock cannot be spent by other checkout'
   USING ERRCODE='P4301'; END IF;
 RETURN NEW;
END $v43$;
CREATE TRIGGER v43_product_holds BEFORE UPDATE OR DELETE
 ON zhirox_local.products FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.protect_reserved_product_v43();

CREATE OR REPLACE FUNCTION zhirox_local.protect_reserved_barcode_v43()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v43$
BEGIN
 IF EXISTS(SELECT 1 FROM zhirox_local.inventory_reservation_items_v43 r
   WHERE r.store_id=OLD.store_id AND r.product_id=OLD.product_id)
 THEN RAISE EXCEPTION 'reserved barcode definition cannot change'
  USING ERRCODE='P4302'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $v43$;
CREATE TRIGGER v43_barcode_holds BEFORE UPDATE OR DELETE
 ON zhirox_local.barcodes FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.protect_reserved_barcode_v43();

CREATE OR REPLACE FUNCTION zhirox_local.hold_checkout_reservation_v43(
 p_store uuid,p_cashier uuid,p_request uuid
) RETURNS TABLE(request_id uuid,expires_at timestamptz,state text,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v43$
DECLARE intent zhirox_local.checkout_intents_v31%ROWTYPE;
 tender zhirox_local.tender_plans_v41%ROWTYPE;
 previous zhirox_local.inventory_reservation_sessions_v43%ROWTYPE;
 item jsonb; code text; q bigint; base_qty bigint;amount numeric:=0;
 b zhirox_local.barcodes%ROWTYPE;p zhirox_local.products%ROWTYPE;
 held numeric; one record;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_request IS NULL
 THEN RAISE EXCEPTION 'invalid reservation ID' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='P4303'; END IF;
 SELECT x.* INTO previous FROM zhirox_local.inventory_reservation_sessions_v43 x
 WHERE x.store_id=p_store AND x.request_id=p_request;
 IF FOUND THEN
  IF previous.cashier_id<>p_cashier OR previous.state<>'held'
  THEN RAISE EXCEPTION 'reservation already resolved' USING ERRCODE='P4303'; END IF;
  RETURN QUERY SELECT previous.request_id,previous.expires_at,previous.state,true;
  RETURN;
 END IF;
 SELECT x.* INTO intent FROM zhirox_local.checkout_intents_v31 x
 WHERE x.store_id=p_store AND x.request_id=p_request AND x.cashier_id=p_cashier
 AND x.state='prepared' FOR UPDATE;
 SELECT x.* INTO tender FROM zhirox_local.tender_plans_v41 x
 WHERE x.store_id=p_store AND x.request_id=p_request AND x.cashier_id=p_cashier
 AND x.external_minor>0;
 IF intent.request_id IS NULL OR tender.request_id IS NULL
 THEN RAISE EXCEPTION 'prepared external tender required' USING ERRCODE='P4303'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.external_settlements_v42 e
 WHERE e.store_id=p_store AND e.request_id=p_request)
 THEN RAISE EXCEPTION 'hold must precede external capture' USING ERRCODE='P4303'; END IF;
 IF jsonb_typeof(intent.lines) IS DISTINCT FROM 'array' OR
 jsonb_array_length(intent.lines) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'invalid quoted basket' USING ERRCODE='22023'; END IF;
 INSERT INTO zhirox_local.inventory_reservation_sessions_v43
 (store_id,request_id,cashier_id,quoted_total_minor,expires_at)
 VALUES(p_store,p_request,p_cashier,intent.expected_total_minor,
 clock_timestamp()+interval '15 minutes');
 FOR item IN SELECT value FROM jsonb_array_elements(intent.lines) LOOP
  IF jsonb_typeof(item->'barcode') IS DISTINCT FROM 'string' OR
    jsonb_typeof(item->'qty') IS DISTINCT FROM 'number' OR
    (item->>'qty') !~ '^[1-9][0-9]{0,2}$'
  THEN RAISE EXCEPTION 'invalid reserved barcode or quantity'
   USING ERRCODE='22023'; END IF;
  code:=item->>'barcode'; q:=(item->>'qty')::bigint;
  IF code ~ '^27[0-9]{11}$' THEN
   RAISE EXCEPTION 'scale barcode reservations not implemented'
   USING ERRCODE='P4304'; END IF;
  SELECT x.* INTO b FROM zhirox_local.barcodes x
   WHERE x.store_id=p_store AND x.code=code AND x.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'barcode unavailable' USING ERRCODE='P4302'; END IF;
  SELECT x.* INTO p FROM zhirox_local.products x
   WHERE x.store_id=p_store AND x.id=b.product_id
    AND x.active AND x.base_unit='unit' FOR UPDATE;
  IF NOT FOUND OR (b.sale_mode='unit' AND b.quantity_base_units<>1) OR
  (b.sale_mode='carton' AND (b.quantity_base_units<2 OR b.sale_price_minor IS NULL))
  THEN RAISE EXCEPTION 'package changed' USING ERRCODE='P4302'; END IF;
  base_qty:=b.quantity_base_units::bigint*q;
  amount:=amount+COALESCE(b.sale_price_minor,p.price_minor)::numeric*q;
  IF amount>9999999999999 OR base_qty<1
  THEN RAISE EXCEPTION 'basket overflow' USING ERRCODE='22003'; END IF;
  INSERT INTO zhirox_local.inventory_reservation_items_v43
    (store_id,request_id,product_id,qty_base)
  VALUES(p_store,p_request,p.id,base_qty)
  ON CONFLICT(store_id,request_id,product_id) DO UPDATE SET qty_base=
   zhirox_local.inventory_reservation_items_v43.qty_base+EXCLUDED.qty_base;
 END LOOP;
 IF amount<>intent.expected_total_minor THEN
  RAISE EXCEPTION 'prepared quote differs from current prices'
  USING ERRCODE='P4302'; END IF;
 FOR one IN SELECT product_id FROM zhirox_local.inventory_reservation_items_v43
 WHERE store_id=p_store AND request_id=p_request LOOP
  SELECT COALESCE(SUM(qty_base),0) INTO held
  FROM zhirox_local.inventory_reservation_items_v43
  WHERE store_id=p_store AND product_id=one.product_id;
  SELECT x.* INTO p FROM zhirox_local.products x
  WHERE x.store_id=p_store AND x.id=one.product_id FOR UPDATE;
  IF p.stock_base_units<held THEN RAISE EXCEPTION 'stock already reserved'
    USING ERRCODE='P4301'; END IF;
 END LOOP;
 RETURN QUERY SELECT x.request_id,x.expires_at,x.state,false
 FROM zhirox_local.inventory_reservation_sessions_v43 x
 WHERE x.store_id=p_store AND x.request_id=p_request;
END $v43$;

CREATE OR REPLACE FUNCTION zhirox_local.consume_reservation_v43(
 p_store uuid,p_cashier uuid,p_request uuid
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v43$
DECLARE held zhirox_local.inventory_reservation_sessions_v43%ROWTYPE;
BEGIN
 SELECT x.* INTO held FROM zhirox_local.inventory_reservation_sessions_v43 x
 WHERE x.store_id=p_store AND x.request_id=p_request FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF held.cashier_id<>p_cashier OR held.state<>'held'
 THEN RAISE EXCEPTION 'hold not available' USING ERRCODE='P4303'; END IF;
 IF clock_timestamp()>=held.expires_at
 THEN RAISE EXCEPTION 'expired hold requires payment reconciliation'
   USING ERRCODE='P4305'; END IF;
 DELETE FROM zhirox_local.inventory_reservation_items_v43
 WHERE store_id=p_store AND request_id=p_request;
 UPDATE zhirox_local.inventory_reservation_sessions_v43
 SET state='consumed',state_changed_at=clock_timestamp()
 WHERE store_id=p_store AND request_id=p_request;
END $v43$;
CREATE OR REPLACE FUNCTION zhirox_local.release_cancelled_reservation_v43()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v43$
BEGIN
 IF NEW.state='cancelled' AND OLD.state='prepared' THEN
  DELETE FROM zhirox_local.inventory_reservation_items_v43
   WHERE store_id=NEW.store_id AND request_id=NEW.request_id;
  UPDATE zhirox_local.inventory_reservation_sessions_v43
   SET state='cancelled',state_changed_at=clock_timestamp()
  WHERE store_id=NEW.store_id AND request_id=NEW.request_id AND state='held';
 END IF;
 RETURN NEW;
END $v43$;
CREATE TRIGGER v43_after_cancel AFTER UPDATE OF state
 ON zhirox_local.checkout_intents_v31 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.release_cancelled_reservation_v43();

CREATE OR REPLACE FUNCTION zhirox_local.commit_checkout_v31(
 p_store uuid,p_cashier uuid,p_request uuid
) RETURNS TABLE(sale_id uuid,receipt_no bigint,total_minor bigint,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v43$
DECLARE intent zhirox_local.checkout_intents_v31%ROWTYPE;
 result record;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_request IS NULL
 THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='22023'; END IF;
 SELECT * INTO intent FROM zhirox_local.checkout_intents_v31
 WHERE store_id=p_store AND request_id=p_request AND cashier_id=p_cashier FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'request was not durably prepared'
   USING ERRCODE='P3101'; END IF;
 IF intent.state='cancelled' THEN RAISE EXCEPTION 'request cancelled'
   USING ERRCODE='P3103'; END IF;
 IF intent.state='committed' THEN
   RETURN QUERY SELECT intent.sale_id,intent.receipt_no,intent.total_minor,true;
   RETURN;
 END IF;
 PERFORM zhirox_local.consume_reservation_v43(p_store,p_cashier,p_request);
 SELECT * INTO STRICT result
 FROM zhirox_local.checkout_packs_scale_v26(
   p_store,p_cashier,p_request,intent.lines,intent.expected_total_minor);
 UPDATE zhirox_local.checkout_intents_v31
 SET state='committed',sale_id=result.sale_id,
    receipt_no=result.receipt_no,total_minor=result.total_minor,updated_at=now()
 WHERE store_id=p_store AND request_id=p_request AND cashier_id=p_cashier;
 RETURN QUERY SELECT result.sale_id,result.receipt_no,result.total_minor,result.replayed;
END $v43$;


CREATE OR REPLACE FUNCTION zhirox_local.block_unverified_tender_v41()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $v43$
DECLARE plan zhirox_local.tender_plans_v41%ROWTYPE;
 proof zhirox_local.external_settlements_v42%ROWTYPE;
BEGIN
 SELECT p.* INTO plan FROM zhirox_local.tender_plans_v41 p
 WHERE p.store_id=NEW.store_id AND p.request_id=NEW.request_id;
 IF FOUND THEN
  IF plan.cashier_id<>NEW.cashier_id OR
    plan.cash_minor+plan.external_minor<>NEW.total_minor
  THEN RAISE EXCEPTION 'tender does not equal receipt'
    USING ERRCODE='P4101'; END IF;
  IF plan.external_minor>0 THEN
   IF NOT EXISTS(SELECT 1 FROM zhirox_local.inventory_reservation_sessions_v43 h
      WHERE h.store_id=NEW.store_id AND h.request_id=NEW.request_id
        AND h.state='consumed')
   THEN RAISE EXCEPTION 'mixed sale without consumed stock hold'
    USING ERRCODE='P4303'; END IF;
   SELECT s.* INTO proof FROM zhirox_local.external_settlements_v42 s
    WHERE s.store_id=NEW.store_id AND s.request_id=NEW.request_id;
   IF NOT FOUND OR proof.amount_minor<>plan.external_minor OR
     proof.external_method<>plan.external_method
   THEN RAISE EXCEPTION 'provider receipt absent: refuse mixed sale'
    USING ERRCODE='P4101'; END IF;
  ELSIF plan.cash_minor<>NEW.total_minor OR plan.external_method<>'none'
  THEN RAISE EXCEPTION 'cash-only tender mismatch'
    USING ERRCODE='P4101'; END IF;
 END IF;
 RETURN NEW;
END $v43$;


REVOKE ALL ON zhirox_local.inventory_reservation_sessions_v43 FROM PUBLIC;
REVOKE ALL ON zhirox_local.inventory_reservation_items_v43 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.hold_checkout_reservation_v43(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.consume_reservation_v43(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.protect_reserved_product_v43() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.protect_reserved_barcode_v43() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.release_cancelled_reservation_v43() FROM PUBLIC;
COMMIT;
