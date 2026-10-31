-- V88: ISOLATED TEST MARKET ONLY. Operator-asserted physical LOT opening,
-- one-way FEFO test activation and opt-in blocking of legacy SQL routes.
-- NOT a production security boundary. Trusted PG owner can spoof custom GUC,
-- invoke lower-level functions or UPDATE product stock; real release needs a
-- least-privilege server role and mandatory authenticated API routing.
-- Requires 001,002,003,029,030,032,033. Never apply to production.
BEGIN;
CREATE TABLE zhirox_local.opening_lot_counts_v88(
 store_id uuid NOT NULL,
 opening_id uuid NOT NULL,
 product_id uuid NOT NULL,
 lot_code text NOT NULL CHECK(length(btrim(lot_code)) BETWEEN 2 AND 50),
 expires_on date NOT NULL,
 counted_qty bigint NOT NULL CHECK(counted_qty BETWEEN 1 AND 100000000),
 counted_by uuid NOT NULL,
 counted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,opening_id),
 UNIQUE(store_id,product_id,lot_code),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id),
 FOREIGN KEY(store_id,counted_by) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE TABLE zhirox_local.lot_cutovers_v88(
 store_id uuid PRIMARY KEY REFERENCES zhirox_local.stores(id),
 activated_by uuid NOT NULL,
 activated_at timestamptz NOT NULL DEFAULT now(),
 mode text NOT NULL DEFAULT 'isolated_fefo_test' CHECK(mode='isolated_fefo_test'),
 FOREIGN KEY(store_id,activated_by) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE TABLE zhirox_local.lot_checkouts_v88(
 store_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,sale_id),
 UNIQUE(store_id,request_id),
 FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.sales(store_id,id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE TABLE zhirox_local.lot_sale_allocations_v88(
 store_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 line_no integer NOT NULL,
 opening_id uuid NOT NULL,
 product_id uuid NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units BETWEEN 1 AND 1000000),
 PRIMARY KEY(store_id,sale_id,line_no,opening_id),
 FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.lot_checkouts_v88(store_id,sale_id),
 FOREIGN KEY(store_id,sale_id,line_no) REFERENCES zhirox_local.sale_lines(store_id,sale_id,line_no),
 FOREIGN KEY(store_id,opening_id) REFERENCES zhirox_local.opening_lot_counts_v88(store_id,opening_id),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE INDEX lot_allocations_v88_opening ON zhirox_local.lot_sale_allocations_v88(store_id,opening_id);
CREATE INDEX lot_opening_v88_fefo ON zhirox_local.opening_lot_counts_v88(store_id,product_id,expires_on,opening_id);

CREATE FUNCTION zhirox_local.require_test_lot_manager_v88(p_store uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
BEGIN
 IF current_database() NOT IN('zhirox_v80_disposable','zhirox_test_market')
  OR(SELECT count(*) FROM zhirox_local.stores)<>1
  OR NOT EXISTS(SELECT 1 FROM zhirox_local.stores WHERE id=p_store
   AND name='مارکێتی تاقیکردنەوە')
 THEN RAISE EXCEPTION 'lot cutover forbidden outside isolated test market' USING ERRCODE='P8801'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users WHERE store_id=p_store
  AND id=p_actor AND role IN('owner','manager') AND enabled
  AND (locked_until IS NULL OR locked_until<now()))
 THEN RAISE EXCEPTION 'manager approval required' USING ERRCODE='P8801'; END IF;
END $fn$;

CREATE FUNCTION zhirox_local.register_opening_lot_v88(
 p_store uuid,p_actor uuid,p_id uuid,p_product uuid,p_code text,p_exp date,p_count bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE old zhirox_local.opening_lot_counts_v88%ROWTYPE;
BEGIN
 PERFORM zhirox_local.require_test_lot_manager_v88(p_store,p_actor);
 IF p_id IS NULL OR p_product IS NULL OR p_code IS NULL OR
 length(btrim(p_code)) NOT BETWEEN 2 AND 50 OR p_exp IS NULL OR
 p_count IS NULL OR p_count NOT BETWEEN 1 AND 100000000 THEN
  RAISE EXCEPTION 'invalid opening LOT' USING ERRCODE='P8802';
 END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v88 WHERE store_id=p_store)
 THEN RAISE EXCEPTION 'opening counts locked after cutover' USING ERRCODE='P8803'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.products
  WHERE store_id=p_store AND id=p_product AND active)
 THEN RAISE EXCEPTION 'product unavailable' USING ERRCODE='P8802'; END IF;
 SELECT * INTO old FROM zhirox_local.opening_lot_counts_v88
 WHERE store_id=p_store AND opening_id=p_id;
 IF FOUND THEN
  IF old.counted_by IS DISTINCT FROM p_actor OR old.product_id IS DISTINCT FROM p_product
  OR old.lot_code IS DISTINCT FROM btrim(p_code) OR old.expires_on IS DISTINCT FROM p_exp
  OR old.counted_qty IS DISTINCT FROM p_count THEN
   RAISE EXCEPTION 'opening idempotency mismatch' USING ERRCODE='P8803'; END IF;
  RETURN p_id;
 END IF;
 INSERT INTO zhirox_local.opening_lot_counts_v88(
 store_id,opening_id,product_id,lot_code,expires_on,counted_qty,counted_by)
 VALUES(p_store,p_id,p_product,btrim(p_code),p_exp,p_count,p_actor);
 RETURN p_id;
END $fn$;

CREATE FUNCTION zhirox_local.activate_fefo_test_v88(
 p_store uuid,p_actor uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE p record; total numeric; matched integer:=0;
BEGIN
 PERFORM zhirox_local.require_test_lot_manager_v88(p_store,p_actor);
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v88 WHERE store_id=p_store)
 THEN RAISE EXCEPTION 'test cutover already activated' USING ERRCODE='P8803'; END IF;
 -- Product locks and store lock protect against concurrent checkouts and
 -- activations. Supplier receiving has an insertion guard once active.
 FOR p IN SELECT id,stock_base_units,active FROM zhirox_local.products
 WHERE store_id=p_store ORDER BY id FOR UPDATE LOOP
  IF NOT p.active AND p.stock_base_units>0 THEN
   RAISE EXCEPTION 'inactive stock requires inventory resolution' USING ERRCODE='P8805'; END IF;
  IF p.active THEN
   SELECT coalesce(sum(counted_qty::numeric),0) INTO total
   FROM zhirox_local.opening_lot_counts_v88
   WHERE store_id=p_store AND product_id=p.id;
   IF total<>p.stock_base_units THEN
    RAISE EXCEPTION 'opening LOT counts do not reconcile with product stock'
     USING ERRCODE='P8805'; END IF;
   matched:=matched+1;
  END IF;
 END LOOP;
 IF matched=0 THEN RAISE EXCEPTION 'no active products to reconcile' USING ERRCODE='P8805'; END IF;
 INSERT INTO zhirox_local.lot_cutovers_v88(store_id,activated_by)
 VALUES(p_store,p_actor);
 RETURN true;
END $fn$;

-- Guards are deliberately fail-closed for the selected test store.
-- A privileged PG user can spoof this custom GUC; it is NOT a production
-- authorization boundary. API remains read-only; no app role gets writes.
CREATE FUNCTION zhirox_local.block_legacy_lot_mutations_v88()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v88 c WHERE c.store_id=NEW.store_id)
 AND NOT(TG_TABLE_NAME='sales' AND
   current_setting('zhirox.v88_fefo_route',true)='test_v88_authorized') THEN
  RAISE EXCEPTION 'legacy sale, return or goods receipt blocked after test FEFO cutover'
  USING ERRCODE='P8808';
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER block_legacy_sale_v88 BEFORE INSERT ON zhirox_local.sales
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_legacy_lot_mutations_v88();
CREATE TRIGGER block_legacy_return_v88 BEFORE INSERT ON zhirox_local.sale_returns_v84
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_legacy_lot_mutations_v88();
CREATE TRIGGER block_legacy_goods_v88 BEFORE INSERT ON zhirox_local.goods_receipts_v83
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_legacy_lot_mutations_v88();
CREATE TRIGGER block_legacy_lot_registration_v88 BEFORE INSERT ON zhirox_local.expiry_lots_v86
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_legacy_lot_mutations_v88();

CREATE FUNCTION zhirox_local.checkout_fefo_test_v88(
 p_store uuid,p_actor uuid,p_request uuid,p_lines jsonb
) RETURNS TABLE(sale_id uuid,receipt_no bigint,total_minor bigint,replayed boolean)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 existing zhirox_local.sales%ROWTYPE;
 norm jsonb;
 item jsonb;
 sale_result record;
 sale_line record;
 batch record;
 qty_need bigint; can_take bigint; qty_free bigint;
BEGIN
 IF p_store IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_lines IS NULL
 OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'invalid checkout payload' USING ERRCODE='P8802'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users WHERE store_id=p_store
  AND id=p_actor AND enabled AND role IN('owner','manager','cashier')
  AND (locked_until IS NULL OR locked_until<now()))
 THEN RAISE EXCEPTION 'unauthorized local cashier' USING ERRCODE='P8801'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(item)<>'object' OR NOT(item ? 'product_id')
   OR NOT(item ? 'qty')
   OR (SELECT count(*) FROM jsonb_object_keys(item) k
    WHERE k NOT IN('product_id','qty'))>0 THEN
    RAISE EXCEPTION 'unsupported FEFO fields' USING ERRCODE='P8802'; END IF;
  BEGIN
   IF (item->>'product_id')::uuid IS NULL OR
      (item->>'qty')::bigint NOT BETWEEN 1 AND 1000000 THEN
     RAISE EXCEPTION 'bad FEFO quantity' USING ERRCODE='P8802'; END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid product or qty' USING ERRCODE='P8802';
  END;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('product_id',product_id,'qty',qty)
 ORDER BY product_id) INTO norm FROM (
  SELECT (v->>'product_id')::uuid AS product_id,sum((v->>'qty')::bigint) AS qty
  FROM jsonb_array_elements(p_lines) v GROUP BY 1) q;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(norm) v
  WHERE (v->>'qty')::bigint NOT BETWEEN 1 AND 1000000) THEN
  RAISE EXCEPTION 'aggregated FEFO quantity overflow' USING ERRCODE='P8802'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v88 WHERE store_id=p_store)
 THEN RAISE EXCEPTION 'FEFO cutover not activated' USING ERRCODE='P8805'; END IF;
 SELECT * INTO existing FROM zhirox_local.sales
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF existing.cashier_id IS DISTINCT FROM p_actor
   OR existing.request_payload IS DISTINCT FROM norm
   OR NOT EXISTS(SELECT 1 FROM zhirox_local.lot_checkouts_v88 lc
    WHERE lc.store_id=p_store AND lc.sale_id=existing.id
     AND lc.request_id=p_request AND lc.actor_id=p_actor)
  THEN RAISE EXCEPTION 'checkout replay conflicts' USING ERRCODE='P8803'; END IF;
  RETURN QUERY SELECT existing.id,existing.receipt_no,existing.total_minor,true;
  RETURN;
 END IF;
 -- Authorize only this one nested V1 SQL call, then immediately clear the
 -- transaction-local flag. Deliberately a test-only routing interlock.
 PERFORM set_config('zhirox.v88_fefo_route','test_v88_authorized',true);
 BEGIN
  SELECT * INTO sale_result FROM zhirox_local.checkout_cash_v1(p_store,p_actor,p_request,norm);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('zhirox.v88_fefo_route','',true);
  RAISE;
 END;
 PERFORM set_config('zhirox.v88_fefo_route','',true);
 IF sale_result.replayed THEN RAISE EXCEPTION 'legacy replay disallowed' USING ERRCODE='P8803'; END IF;
 INSERT INTO zhirox_local.lot_checkouts_v88(store_id,sale_id,request_id,actor_id)
 VALUES(p_store,sale_result.sale_id,p_request,p_actor);
 FOR sale_line IN SELECT l.line_no,l.product_id,l.quantity_base_units
  FROM zhirox_local.sale_lines l WHERE l.store_id=p_store
   AND l.sale_id=sale_result.sale_id ORDER BY l.product_id,l.line_no LOOP
  qty_need:=sale_line.quantity_base_units;
  FOR batch IN
   SELECT b.opening_id,b.counted_qty,
    COALESCE((SELECT sum(a.quantity_base_units) FROM zhirox_local.lot_sale_allocations_v88 a
     WHERE a.store_id=b.store_id AND a.opening_id=b.opening_id),0) AS used_units
   FROM zhirox_local.opening_lot_counts_v88 b
   WHERE b.store_id=p_store AND b.product_id=sale_line.product_id
    AND b.expires_on>=current_date
   ORDER BY b.expires_on,b.opening_id FOR UPDATE OF b LOOP
   qty_free:=batch.counted_qty-batch.used_units;
   IF qty_free<=0 THEN CONTINUE; END IF;
   can_take:=LEAST(qty_need,qty_free);
   INSERT INTO zhirox_local.lot_sale_allocations_v88(
   store_id,sale_id,line_no,opening_id,product_id,quantity_base_units)
   VALUES(p_store,sale_result.sale_id,sale_line.line_no,batch.opening_id,
    sale_line.product_id,can_take);
   qty_need:=qty_need-can_take;
   EXIT WHEN qty_need=0;
  END LOOP;
  IF qty_need<>0 THEN
   RAISE EXCEPTION 'insufficient unexpired counted opening LOT stock'
   USING ERRCODE='P8807'; END IF;
 END LOOP;
 RETURN QUERY SELECT sale_result.sale_id,sale_result.receipt_no,
  sale_result.total_minor,false;
END $fn$;

CREATE FUNCTION zhirox_local.block_v88_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'immutable test opening/FEFO allocation history' USING ERRCODE='P8804';
END $fn$;
CREATE TRIGGER opening_v88_immutable BEFORE UPDATE OR DELETE
 ON zhirox_local.opening_lot_counts_v88 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_v88_audit_mutation();
CREATE TRIGGER cutover_v88_immutable BEFORE UPDATE OR DELETE
 ON zhirox_local.lot_cutovers_v88 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_v88_audit_mutation();
CREATE TRIGGER checkout_v88_immutable BEFORE UPDATE OR DELETE
 ON zhirox_local.lot_checkouts_v88 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_v88_audit_mutation();
CREATE TRIGGER allocation_v88_immutable BEFORE UPDATE OR DELETE
 ON zhirox_local.lot_sale_allocations_v88 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_v88_audit_mutation();
REVOKE ALL ON TABLE zhirox_local.opening_lot_counts_v88,
 zhirox_local.lot_cutovers_v88,zhirox_local.lot_checkouts_v88,
 zhirox_local.lot_sale_allocations_v88 FROM PUBLIC;
REVOKE ALL ON FUNCTION
 zhirox_local.require_test_lot_manager_v88(uuid,uuid),
 zhirox_local.register_opening_lot_v88(uuid,uuid,uuid,uuid,text,date,bigint),
 zhirox_local.activate_fefo_test_v88(uuid,uuid),
 zhirox_local.checkout_fefo_test_v88(uuid,uuid,uuid,jsonb),
 zhirox_local.block_legacy_lot_mutations_v88(),
 zhirox_local.block_v88_audit_mutation() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.opening_lot_counts_v88 IS
 'LAB ONLY operator-asserted LOT opening counts. CI uses synthetic values, not actual physical verified market stock.';
COMMENT ON TABLE zhirox_local.lot_cutovers_v88 IS
 'LAB ONLY test FEFO routing interlock. Not production security: PG privileged actors can bypass custom GUC/SQL ownership.';
COMMIT;
