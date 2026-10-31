-- V90: ISOLATED POSTGRESQL TEST MARKET ONLY. Unified opening+supplier+returned
-- LOT balance with FEFO SQL checkout and allocation-aware restocking.
-- Does NOT authorize production cashier, privileged SQL role or real refunds.
-- Requires migrations 001,002,003,029,030,032,033,034,035.
BEGIN;
CREATE TABLE zhirox_local.lot_cutovers_v90 (
 store_id uuid PRIMARY KEY REFERENCES zhirox_local.stores(id),
 activated_by uuid NOT NULL,
 activated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(store_id,activated_by) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE TABLE zhirox_local.lot_checkouts_v90 (
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
CREATE TABLE zhirox_local.lot_sale_allocations_v90 (
 store_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 line_no integer NOT NULL,
 allocation_no integer NOT NULL CHECK(allocation_no BETWEEN 1 AND 100),
 opening_id uuid,
 receipt_id uuid,
 receipt_line_no integer,
 product_id uuid NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units BETWEEN 1 AND 1000000),
 PRIMARY KEY(store_id,sale_id,line_no,allocation_no),
 FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.lot_checkouts_v90(store_id,sale_id),
 FOREIGN KEY(store_id,sale_id,line_no) REFERENCES zhirox_local.sale_lines(store_id,sale_id,line_no),
 FOREIGN KEY(store_id,opening_id) REFERENCES zhirox_local.opening_lot_counts_v88(store_id,opening_id),
 FOREIGN KEY(store_id,receipt_id,receipt_line_no) REFERENCES zhirox_local.lot_receipt_lines_v89(store_id,receipt_id,line_no),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id),
 CHECK ((opening_id IS NOT NULL AND receipt_id IS NULL AND receipt_line_no IS NULL)
    OR (opening_id IS NULL AND receipt_id IS NOT NULL AND receipt_line_no IS NOT NULL))
);
CREATE TABLE zhirox_local.lot_returns_v90 (
 store_id uuid NOT NULL,
 return_id uuid NOT NULL,
 request_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 line_no integer NOT NULL,
 allocation_no integer NOT NULL,
 actor_id uuid NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units BETWEEN 1 AND 1000000),
 restocked boolean NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 160),
 returned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,return_id),
 UNIQUE(store_id,request_id),
 FOREIGN KEY(store_id,return_id) REFERENCES zhirox_local.sale_returns_v84(store_id,return_id),
 FOREIGN KEY(store_id,sale_id,line_no,allocation_no) REFERENCES zhirox_local.lot_sale_allocations_v90(store_id,sale_id,line_no,allocation_no),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX lot_allocations_v90_opening ON zhirox_local.lot_sale_allocations_v90(store_id,opening_id);
CREATE INDEX lot_allocations_v90_receipt ON zhirox_local.lot_sale_allocations_v90(store_id,receipt_id,receipt_line_no);
CREATE INDEX lot_returns_v90_allocation ON zhirox_local.lot_returns_v90(store_id,sale_id,line_no,allocation_no);

-- This view derives the single truthful *test tracking balance* from actual SQL
-- opening snapshots, supplier receipts, old/new sale allocations and restocks.
-- It does NOT certify a physical count performed at the real supermarket.
CREATE VIEW zhirox_local.lot_inventory_v90 AS
 SELECT b.store_id,b.product_id,'opening'::text AS lot_origin,
   b.opening_id,b.lot_code,b.expires_on,
   NULL::uuid AS receipt_id,NULL::integer AS receipt_line_no,
   b.counted_qty::bigint AS starting_qty,
   (b.counted_qty::numeric
    -COALESCE((SELECT sum(a.quantity_base_units) FROM zhirox_local.lot_sale_allocations_v88 a
       WHERE a.store_id=b.store_id AND a.opening_id=b.opening_id),0)
    -COALESCE((SELECT sum(a.quantity_base_units) FROM zhirox_local.lot_sale_allocations_v90 a
       WHERE a.store_id=b.store_id AND a.opening_id=b.opening_id),0)
    +COALESCE((SELECT sum(r.quantity_base_units) FROM zhirox_local.lot_returns_v89 r
       WHERE r.store_id=b.store_id AND r.opening_id=b.opening_id AND r.restocked),0)
    +COALESCE((SELECT sum(r.quantity_base_units) FROM zhirox_local.lot_returns_v90 r
       JOIN zhirox_local.lot_sale_allocations_v90 a
       ON a.store_id=r.store_id AND a.sale_id=r.sale_id AND a.line_no=r.line_no
       AND a.allocation_no=r.allocation_no
       WHERE r.store_id=b.store_id AND a.opening_id=b.opening_id AND r.restocked),0)
   )::bigint AS tracked_remaining
 FROM zhirox_local.opening_lot_counts_v88 b
 UNION ALL
 SELECT n.store_id,n.product_id,'received'::text AS lot_origin,
   NULL::uuid AS opening_id,n.lot_code,n.expires_on,n.receipt_id,n.line_no AS receipt_line_no,
   n.received_qty_base_units::bigint AS starting_qty,
   (n.received_qty_base_units::numeric
    -COALESCE((SELECT sum(a.quantity_base_units) FROM zhirox_local.lot_sale_allocations_v90 a
       WHERE a.store_id=n.store_id AND a.receipt_id=n.receipt_id
       AND a.receipt_line_no=n.line_no),0)
    +COALESCE((SELECT sum(r.quantity_base_units) FROM zhirox_local.lot_returns_v90 r
       JOIN zhirox_local.lot_sale_allocations_v90 a
       ON a.store_id=r.store_id AND a.sale_id=r.sale_id AND a.line_no=r.line_no
       AND a.allocation_no=r.allocation_no
       WHERE r.store_id=n.store_id AND a.receipt_id=n.receipt_id
       AND a.receipt_line_no=n.line_no AND r.restocked),0)
   )::bigint AS tracked_remaining
 FROM zhirox_local.lot_receipt_lines_v89 n;

-- When the V90 test cutover is active, earlier V88 FEFO sales are no longer
-- accepted. Manager-only V89 LOT receiving and V89 original-sale returns
-- remain supported and continue to appear in the unified balance.
CREATE OR REPLACE FUNCTION zhirox_local.block_legacy_lot_mutations_v88()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE route text:=COALESCE(current_setting('zhirox.v88_fefo_route',true),'');
  v90_active boolean;
BEGIN
 SELECT EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v90 c
    WHERE c.store_id=NEW.store_id) INTO v90_active;
 IF EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v88 c WHERE c.store_id=NEW.store_id)
 AND NOT (
   (TG_TABLE_NAME='sales' AND
       ((NOT v90_active AND route='test_v88_authorized')
        OR(v90_active AND route='test_v90_authorized')))
   OR (TG_TABLE_NAME='goods_receipts_v83' AND route='test_v89_receive_authorized')
   OR (TG_TABLE_NAME='sale_returns_v84' AND
       route IN('test_v89_return_authorized','test_v90_return_authorized'))
 ) THEN
  RAISE EXCEPTION 'legacy stock route blocked by isolated FEFO test pilot'
   USING ERRCODE='P8808';
 END IF;
 RETURN NEW;
END $fn$;

CREATE FUNCTION zhirox_local.activate_unified_fefo_v90(p_store uuid,p_actor uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE product_record record; total numeric; checked integer:=0;
BEGIN
 PERFORM zhirox_local.require_test_lot_manager_v88(p_store,p_actor);
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v88 WHERE store_id=p_store)
 OR EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v90 WHERE store_id=p_store)
 THEN RAISE EXCEPTION 'invalid unified test pilot activation' USING ERRCODE='P9003'; END IF;
 FOR product_record IN SELECT id,active,stock_base_units
 FROM zhirox_local.products WHERE store_id=p_store ORDER BY id FOR UPDATE LOOP
  SELECT COALESCE(sum(tracked_remaining::numeric),0) INTO total
  FROM zhirox_local.lot_inventory_v90
  WHERE store_id=p_store AND product_id=product_record.id;
  IF total<>product_record.stock_base_units OR
   EXISTS(SELECT 1 FROM zhirox_local.lot_inventory_v90 WHERE store_id=p_store
     AND product_id=product_record.id AND tracked_remaining<0) OR
   (NOT product_record.active AND product_record.stock_base_units>0) THEN
   RAISE EXCEPTION 'unified LOT and global stock not reconciled' USING ERRCODE='P9005';
  END IF;
  checked:=checked+1;
 END LOOP;
 IF checked=0 THEN RAISE EXCEPTION 'empty product catalog' USING ERRCODE='P9005'; END IF;
 INSERT INTO zhirox_local.lot_cutovers_v90(store_id,activated_by)
 VALUES(p_store,p_actor);
 RETURN true;
END $fn$;

CREATE FUNCTION zhirox_local.checkout_unified_fefo_v90(
 p_store uuid,p_actor uuid,p_request uuid,p_lines jsonb
) RETURNS TABLE(sale_id uuid,receipt_no bigint,total_minor bigint,replayed boolean)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 v_old zhirox_local.sales%ROWTYPE;
 v_payload jsonb; v_item jsonb; v_sale record;
 v_line record; v_lot record;
 v_need bigint; v_take bigint; v_allocation_no integer;
BEGIN
 IF p_store IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_lines IS NULL
 OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'invalid V90 test checkout' USING ERRCODE='P9002'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users
 WHERE store_id=p_store AND id=p_actor AND enabled AND role IN('owner','manager','cashier')
 AND (locked_until IS NULL OR locked_until<now()))
 THEN RAISE EXCEPTION 'local cashier not authorized' USING ERRCODE='P9001'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(v_item)<>'object' OR NOT(v_item ? 'product_id') OR NOT(v_item ? 'qty')
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) k
      WHERE k NOT IN('product_id','qty')) THEN
   RAISE EXCEPTION 'unsupported checkout field' USING ERRCODE='P9002'; END IF;
  BEGIN
   IF (v_item->>'product_id')::uuid IS NULL
   OR (v_item->>'qty')::bigint NOT BETWEEN 1 AND 1000000 THEN
    RAISE EXCEPTION 'bad quantity' USING ERRCODE='P9002'; END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid product or quantity' USING ERRCODE='P9002';
  END;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('product_id',product_id,'qty',qty)
 ORDER BY product_id) INTO v_payload FROM (
  SELECT (x->>'product_id')::uuid AS product_id,sum((x->>'qty')::bigint) AS qty
  FROM jsonb_array_elements(p_lines) x GROUP BY 1) normalized;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_payload) x
    WHERE (x->>'qty')::bigint NOT BETWEEN 1 AND 1000000)
 THEN RAISE EXCEPTION 'aggregate quantity invalid' USING ERRCODE='P9002'; END IF;
 -- Mutating functions V1, V88 and V89 all serialize via the same store row.
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v90 WHERE store_id=p_store)
 THEN RAISE EXCEPTION 'unified FEFO test pilot not active' USING ERRCODE='P9005'; END IF;
 SELECT * INTO v_old FROM zhirox_local.sales
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF v_old.cashier_id IS DISTINCT FROM p_actor
   OR v_old.request_payload IS DISTINCT FROM v_payload OR
   NOT EXISTS(SELECT 1 FROM zhirox_local.lot_checkouts_v90 c
     WHERE c.store_id=p_store AND c.sale_id=v_old.id
       AND c.request_id=p_request AND c.actor_id=p_actor)
  THEN RAISE EXCEPTION 'changed or legacy sale replay' USING ERRCODE='P9003'; END IF;
  RETURN QUERY SELECT v_old.id,v_old.receipt_no,v_old.total_minor,true;
  RETURN;
 END IF;
 PERFORM set_config('zhirox.v88_fefo_route','test_v90_authorized',true);
 BEGIN
  SELECT * INTO v_sale FROM zhirox_local.checkout_cash_v1(
    p_store,p_actor,p_request,v_payload);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('zhirox.v88_fefo_route','',true);
  RAISE;
 END;
 PERFORM set_config('zhirox.v88_fefo_route','',true);
 IF v_sale.replayed THEN RAISE EXCEPTION 'unexpected V1 replay' USING ERRCODE='P9003'; END IF;
 INSERT INTO zhirox_local.lot_checkouts_v90(store_id,sale_id,request_id,actor_id)
 VALUES(p_store,v_sale.sale_id,p_request,p_actor);
 FOR v_line IN SELECT l.line_no,l.product_id,l.quantity_base_units
 FROM zhirox_local.sale_lines l WHERE l.store_id=p_store AND l.sale_id=v_sale.sale_id
 ORDER BY l.product_id,l.line_no LOOP
  v_need:=v_line.quantity_base_units;
  v_allocation_no:=0;
  FOR v_lot IN SELECT opening_id,receipt_id,receipt_line_no,
    product_id,lot_code,tracked_remaining
   FROM zhirox_local.lot_inventory_v90
   WHERE store_id=p_store AND product_id=v_line.product_id
     AND expires_on>=current_date AND tracked_remaining>0
   ORDER BY expires_on,lot_origin,lot_code,
    opening_id NULLS LAST,receipt_id NULLS LAST,receipt_line_no NULLS LAST LOOP
   v_take:=LEAST(v_need,v_lot.tracked_remaining);
   v_allocation_no:=v_allocation_no+1;
   INSERT INTO zhirox_local.lot_sale_allocations_v90
    (store_id,sale_id,line_no,allocation_no,opening_id,receipt_id,
      receipt_line_no,product_id,quantity_base_units)
   VALUES(p_store,v_sale.sale_id,v_line.line_no,v_allocation_no,
     v_lot.opening_id,v_lot.receipt_id,v_lot.receipt_line_no,
     v_line.product_id,v_take);
   v_need:=v_need-v_take;
   EXIT WHEN v_need=0;
  END LOOP;
  IF v_need<>0 THEN
   RAISE EXCEPTION 'insufficient nonexpired unified LOT balance'
   USING ERRCODE='P9007';
  END IF;
 END LOOP;
 RETURN QUERY SELECT v_sale.sale_id,v_sale.receipt_no,v_sale.total_minor,false;
END $fn$;

CREATE FUNCTION zhirox_local.return_unified_lot_v90(
 p_store uuid,p_actor uuid,p_sale uuid,p_line integer,p_allocation integer,
 p_request uuid,p_qty bigint,p_restock boolean,p_reason text
) RETURNS TABLE(return_id uuid,face_value_minor bigint,replayed boolean)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 v_old zhirox_local.lot_returns_v90%ROWTYPE;
 v_allocation zhirox_local.lot_sale_allocations_v90%ROWTYPE;
 v_previous numeric; v_result record;
BEGIN
 PERFORM zhirox_local.require_test_lot_manager_v88(p_store,p_actor);
 IF p_sale IS NULL OR p_line IS NULL OR p_allocation IS NULL
 OR p_line<1 OR p_allocation<1 OR p_request IS NULL OR
 p_qty IS NULL OR p_qty NOT BETWEEN 1 AND 1000000 OR
 p_restock IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 160
 THEN RAISE EXCEPTION 'invalid V90 LOT return request' USING ERRCODE='P9002'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v90 WHERE store_id=p_store)
 THEN RAISE EXCEPTION 'unified LOT test pilot not active' USING ERRCODE='P9005'; END IF;
 SELECT * INTO v_old FROM zhirox_local.lot_returns_v90
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF v_old.actor_id IS DISTINCT FROM p_actor OR v_old.sale_id IS DISTINCT FROM p_sale
   OR v_old.line_no IS DISTINCT FROM p_line OR v_old.allocation_no IS DISTINCT FROM p_allocation
   OR v_old.quantity_base_units IS DISTINCT FROM p_qty
   OR v_old.restocked IS DISTINCT FROM p_restock
   OR v_old.reason IS DISTINCT FROM btrim(p_reason)
  THEN RAISE EXCEPTION 'changed return replay' USING ERRCODE='P9003'; END IF;
  RETURN QUERY SELECT v_old.return_id,r.amount_minor,true
    FROM zhirox_local.sale_returns_v84 r
    WHERE r.store_id=p_store AND r.return_id=v_old.return_id;
  RETURN;
 END IF;
 SELECT * INTO v_allocation FROM zhirox_local.lot_sale_allocations_v90
 WHERE store_id=p_store AND sale_id=p_sale
  AND line_no=p_line AND allocation_no=p_allocation;
 IF NOT FOUND THEN RAISE EXCEPTION 'original sale LOT not found' USING ERRCODE='P9002'; END IF;
 SELECT COALESCE(sum(quantity_base_units::numeric),0) INTO v_previous
 FROM zhirox_local.lot_returns_v90
 WHERE store_id=p_store AND sale_id=p_sale
  AND line_no=p_line AND allocation_no=p_allocation;
 IF v_previous+p_qty>v_allocation.quantity_base_units
 THEN RAISE EXCEPTION 'return exceeds original LOT allocation' USING ERRCODE='P9005'; END IF;
 PERFORM set_config('zhirox.v88_fefo_route','test_v90_return_authorized',true);
 BEGIN
  SELECT * INTO v_result FROM zhirox_local.record_sale_return_v84(
    p_store,p_actor,p_sale,p_line,p_request,p_qty,p_restock,p_reason);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('zhirox.v88_fefo_route','',true);
  RAISE;
 END;
 PERFORM set_config('zhirox.v88_fefo_route','',true);
 IF v_result.replayed THEN RAISE EXCEPTION 'unattributed prior return' USING ERRCODE='P9003'; END IF;
 INSERT INTO zhirox_local.lot_returns_v90(
 store_id,return_id,request_id,sale_id,line_no,allocation_no,actor_id,
 quantity_base_units,restocked,reason)
 VALUES(p_store,v_result.return_id,p_request,p_sale,p_line,p_allocation,p_actor,
  p_qty,p_restock,btrim(p_reason));
 RETURN QUERY SELECT v_result.return_id,v_result.refund_amount_minor,false;
END $fn$;

CREATE FUNCTION zhirox_local.block_lot_v90_mutation()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'immutable unified test LOT journal' USING ERRCODE='P9004';
END $fn$;
CREATE TRIGGER lot_cutover_v90_immutable BEFORE UPDATE OR DELETE ON zhirox_local.lot_cutovers_v90
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_lot_v90_mutation();
CREATE TRIGGER lot_checkout_v90_immutable BEFORE UPDATE OR DELETE ON zhirox_local.lot_checkouts_v90
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_lot_v90_mutation();
CREATE TRIGGER lot_allocation_v90_immutable BEFORE UPDATE OR DELETE ON zhirox_local.lot_sale_allocations_v90
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_lot_v90_mutation();
CREATE TRIGGER lot_returns_v90_immutable BEFORE UPDATE OR DELETE ON zhirox_local.lot_returns_v90
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_lot_v90_mutation();
REVOKE ALL ON TABLE zhirox_local.lot_cutovers_v90,zhirox_local.lot_checkouts_v90,
 zhirox_local.lot_sale_allocations_v90,zhirox_local.lot_returns_v90 FROM PUBLIC;
REVOKE ALL ON zhirox_local.lot_inventory_v90 FROM PUBLIC;
REVOKE ALL ON FUNCTION
 zhirox_local.activate_unified_fefo_v90(uuid,uuid),
 zhirox_local.checkout_unified_fefo_v90(uuid,uuid,uuid,jsonb),
 zhirox_local.return_unified_lot_v90(uuid,uuid,uuid,integer,integer,uuid,bigint,boolean,text),
 zhirox_local.block_lot_v90_mutation() FROM PUBLIC;
COMMENT ON VIEW zhirox_local.lot_inventory_v90 IS
 'ISOLATED TEST ONLY: computed opening+received-restocked-allocated LOT balances. NOT certified real supermarket physical inventory.';
COMMIT;
