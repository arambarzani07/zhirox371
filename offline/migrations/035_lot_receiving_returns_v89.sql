-- V89 ISOLATED PostgreSQL test market only. Additive LOT-aware receiving
-- and return journals. Retains V88's FEFO opening-baseline test, NOT a production
-- cashier release. REQUIRE 001,002,003,029,030,032,033,034.
BEGIN;
CREATE TABLE zhirox_local.lot_receipt_batches_v89(
 store_id uuid NOT NULL,
 request_id uuid NOT NULL,
 receipt_id uuid NOT NULL,
 order_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 original_lines jsonb NOT NULL CHECK(jsonb_typeof(original_lines)='array'),
 registered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,request_id),
 UNIQUE(store_id,receipt_id),
 FOREIGN KEY(store_id,receipt_id) REFERENCES zhirox_local.goods_receipts_v83(store_id,receipt_id),
 FOREIGN KEY(store_id,order_id) REFERENCES zhirox_local.purchase_orders_v83(store_id,order_id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE TABLE zhirox_local.lot_receipt_lines_v89(
 store_id uuid NOT NULL,
 receipt_id uuid NOT NULL,
 line_no integer NOT NULL,
 product_id uuid NOT NULL,
 lot_code text NOT NULL CHECK(length(btrim(lot_code)) BETWEEN 2 AND 50),
 expires_on date NOT NULL,
 received_qty_base_units bigint NOT NULL CHECK(received_qty_base_units BETWEEN 1 AND 1000000),
 PRIMARY KEY(store_id,receipt_id,line_no),
 FOREIGN KEY(store_id,receipt_id) REFERENCES zhirox_local.lot_receipt_batches_v89(store_id,receipt_id),
 FOREIGN KEY(store_id,receipt_id,line_no) REFERENCES zhirox_local.goods_receipt_lines_v83(store_id,receipt_id,line_no),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE TABLE zhirox_local.lot_returns_v89(
 store_id uuid NOT NULL,
 return_id uuid NOT NULL,
 request_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 line_no integer NOT NULL,
 opening_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units BETWEEN 1 AND 1000000),
 restocked boolean NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 160),
 returned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,return_id),
 UNIQUE(store_id,request_id),
 FOREIGN KEY(store_id,return_id) REFERENCES zhirox_local.sale_returns_v84(store_id,return_id),
 FOREIGN KEY(store_id,sale_id,line_no,opening_id)
   REFERENCES zhirox_local.lot_sale_allocations_v88(store_id,sale_id,line_no,opening_id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX lot_returns_v89_allocation ON zhirox_local.lot_returns_v89(store_id,sale_id,line_no,opening_id);
CREATE INDEX lot_receipt_lines_v89_expiration ON zhirox_local.lot_receipt_lines_v89(store_id,expires_on);

-- Replace ONLY the V88 lab routing guard. Unknown/NULL route is denied.
-- The GUC is a laboratory interlock, spoofable by a privileged PG account:
-- DO NOT interpret this as robust release authorization.
CREATE OR REPLACE FUNCTION zhirox_local.block_legacy_lot_mutations_v88()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE route text:=COALESCE(current_setting('zhirox.v88_fefo_route',true),'');
BEGIN
 IF EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v88 c
  WHERE c.store_id=NEW.store_id)
 AND NOT (
  (TG_TABLE_NAME='sales' AND route='test_v88_authorized')
  OR (TG_TABLE_NAME='goods_receipts_v83' AND route='test_v89_receive_authorized')
  OR (TG_TABLE_NAME='sale_returns_v84' AND route='test_v89_return_authorized')
 ) THEN
  RAISE EXCEPTION 'legacy stock/financial route blocked during LOT test cutover'
   USING ERRCODE='P8808';
 END IF;
 RETURN NEW;
END $fn$;

CREATE FUNCTION zhirox_local.receive_order_lots_v89(
 p_store uuid,p_actor uuid,p_order uuid,p_request uuid,p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE previous zhirox_local.lot_receipt_batches_v89%ROWTYPE;
 v_order zhirox_local.purchase_orders_v83%ROWTYPE;
 v_line jsonb;
 v_no integer;
 v_qty bigint;
 v_exp date;
 v_code text;
 v_receipt uuid;
 v_count integer:=0;
BEGIN
 PERFORM zhirox_local.require_test_lot_manager_v88(p_store,p_actor);
 IF p_order IS NULL OR p_request IS NULL OR p_lines IS NULL
  OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'invalid LOT receiving payload' USING ERRCODE='P8902'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v88 WHERE store_id=p_store)
 THEN RAISE EXCEPTION 'no test LOT cutover' USING ERRCODE='P8902'; END IF;
 SELECT * INTO previous FROM zhirox_local.lot_receipt_batches_v89
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF previous.order_id IS DISTINCT FROM p_order OR previous.actor_id IS DISTINCT FROM p_actor
   OR previous.original_lines IS DISTINCT FROM p_lines
  THEN RAISE EXCEPTION 'LOT receipt request conflict' USING ERRCODE='P8903'; END IF;
  RETURN previous.receipt_id;
 END IF;
 SELECT * INTO v_order FROM zhirox_local.purchase_orders_v83
 WHERE store_id=p_store AND order_id=p_order FOR UPDATE;
 IF NOT FOUND OR v_order.status<>'ordered'
 THEN RAISE EXCEPTION 'order not available for LOT receiving' USING ERRCODE='P8902'; END IF;
 IF (SELECT count(*) FROM zhirox_local.purchase_order_lines_v83
  WHERE store_id=p_store AND order_id=p_order)<>jsonb_array_length(p_lines)
 THEN RAISE EXCEPTION 'every purchase line needs one LOT record' USING ERRCODE='P8902'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(v_line)<>'object'
   OR NOT(v_line ? 'line_no') OR NOT(v_line ? 'lot_code')
   OR NOT(v_line ? 'expires_on') OR NOT(v_line ? 'quantity_base_units')
   OR (SELECT count(*) FROM jsonb_object_keys(v_line) k
       WHERE k NOT IN('line_no','lot_code','expires_on','quantity_base_units'))>0
  THEN RAISE EXCEPTION 'unexpected LOT receipt fields' USING ERRCODE='P8902'; END IF;
  BEGIN
   v_no:=(v_line->>'line_no')::integer;
   v_qty:=(v_line->>'quantity_base_units')::bigint;
   v_exp:=(v_line->>'expires_on')::date;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'invalid LOT receipt quantity or date' USING ERRCODE='P8902';
  END;
  v_code:=btrim(v_line->>'lot_code');
  IF v_no IS NULL OR v_qty IS NULL OR v_exp IS NULL OR v_exp<current_date
   OR v_code IS NULL OR length(v_code) NOT BETWEEN 2 AND 50
   OR NOT EXISTS(SELECT 1 FROM zhirox_local.purchase_order_lines_v83 l
       WHERE l.store_id=p_store AND l.order_id=p_order AND l.line_no=v_no
       AND l.quantity_base_units=v_qty)
  THEN RAISE EXCEPTION 'LOT receiving line mismatch, expired, or invalid' USING ERRCODE='P8902'; END IF;
  v_count:=v_count+1;
 END LOOP;
 IF (SELECT count(DISTINCT (x->>'line_no')::integer) FROM jsonb_array_elements(p_lines) x)<>v_count
 THEN RAISE EXCEPTION 'duplicate LOT receipt line' USING ERRCODE='P8902'; END IF;
 -- V83's stock increments and receipt header are nested within same
 -- PostgreSQL transaction. Trigger route is deliberately cleared at once.
 PERFORM set_config('zhirox.v88_fefo_route','test_v89_receive_authorized',true);
 BEGIN
  v_receipt:=zhirox_local.receive_purchase_order_v83(p_store,p_actor,p_order,p_request);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('zhirox.v88_fefo_route','',true);
  RAISE;
 END;
 PERFORM set_config('zhirox.v88_fefo_route','',true);
 INSERT INTO zhirox_local.lot_receipt_batches_v89
 (store_id,request_id,receipt_id,order_id,actor_id,original_lines)
 VALUES(p_store,p_request,v_receipt,p_order,p_actor,p_lines);
 INSERT INTO zhirox_local.lot_receipt_lines_v89
 (store_id,receipt_id,line_no,product_id,lot_code,expires_on,received_qty_base_units)
 SELECT p_store,v_receipt,(x->>'line_no')::integer,l.product_id,
    btrim(x->>'lot_code'),(x->>'expires_on')::date,(x->>'quantity_base_units')::bigint
 FROM jsonb_array_elements(p_lines) x
 JOIN zhirox_local.purchase_order_lines_v83 l
 ON l.store_id=p_store AND l.order_id=p_order AND l.line_no=(x->>'line_no')::integer;
 RETURN v_receipt;
END $fn$;

CREATE FUNCTION zhirox_local.return_opening_lot_v89(
 p_store uuid,p_actor uuid,p_sale uuid,p_line integer,p_opening uuid,
 p_request uuid,p_qty bigint,p_restock boolean,p_reason text
) RETURNS TABLE(return_id uuid,face_value_minor bigint,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE old zhirox_local.lot_returns_v89%ROWTYPE;
 allocation zhirox_local.lot_sale_allocations_v88%ROWTYPE;
 previous_count numeric;
 v_record record;
BEGIN
 PERFORM zhirox_local.require_test_lot_manager_v88(p_store,p_actor);
 IF p_sale IS NULL OR p_line IS NULL OR p_line<1 OR p_opening IS NULL OR p_request IS NULL
  OR p_qty IS NULL OR p_qty NOT BETWEEN 1 AND 1000000
  OR p_restock IS NULL OR p_reason IS NULL
  OR length(btrim(p_reason)) NOT BETWEEN 3 AND 160
 THEN RAISE EXCEPTION 'invalid LOT return request' USING ERRCODE='P8902'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v88 WHERE store_id=p_store)
 THEN RAISE EXCEPTION 'no test LOT cutover' USING ERRCODE='P8902'; END IF;
 SELECT * INTO old FROM zhirox_local.lot_returns_v89
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF old.sale_id IS DISTINCT FROM p_sale OR old.line_no IS DISTINCT FROM p_line
   OR old.opening_id IS DISTINCT FROM p_opening OR old.actor_id IS DISTINCT FROM p_actor
   OR old.quantity_base_units IS DISTINCT FROM p_qty OR old.restocked IS DISTINCT FROM p_restock
   OR old.reason IS DISTINCT FROM btrim(p_reason)
  THEN RAISE EXCEPTION 'LOT return replay conflict' USING ERRCODE='P8903'; END IF;
  RETURN QUERY SELECT old.return_id,r.amount_minor,true
   FROM zhirox_local.sale_returns_v84 r WHERE r.store_id=p_store AND r.return_id=old.return_id;
  RETURN;
 END IF;
 SELECT * INTO allocation FROM zhirox_local.lot_sale_allocations_v88
 WHERE store_id=p_store AND sale_id=p_sale AND line_no=p_line AND opening_id=p_opening;
 IF NOT FOUND THEN RAISE EXCEPTION 'original V88 allocation not found' USING ERRCODE='P8902'; END IF;
 SELECT COALESCE(sum(quantity_base_units::numeric),0) INTO previous_count
 FROM zhirox_local.lot_returns_v89 WHERE store_id=p_store AND sale_id=p_sale
  AND line_no=p_line AND opening_id=p_opening;
 IF previous_count+p_qty>allocation.quantity_base_units
 THEN RAISE EXCEPTION 'LOT return exceeds originally allocated units' USING ERRCODE='P8905'; END IF;
 PERFORM set_config('zhirox.v88_fefo_route','test_v89_return_authorized',true);
 BEGIN
  SELECT * INTO v_record FROM zhirox_local.record_sale_return_v84(
   p_store,p_actor,p_sale,p_line,p_request,p_qty,p_restock,p_reason);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('zhirox.v88_fefo_route','',true);
  RAISE;
 END;
 PERFORM set_config('zhirox.v88_fefo_route','',true);
 IF v_record.replayed THEN RAISE EXCEPTION 'historical return cannot be attributed after cutover' USING ERRCODE='P8903'; END IF;
 INSERT INTO zhirox_local.lot_returns_v89
 (store_id,return_id,request_id,sale_id,line_no,opening_id,actor_id,
  quantity_base_units,restocked,reason)
 VALUES(p_store,v_record.return_id,p_request,p_sale,p_line,p_opening,p_actor,
  p_qty,p_restock,btrim(p_reason));
 RETURN QUERY SELECT v_record.return_id,v_record.refund_amount_minor,false;
END $fn$;

CREATE FUNCTION zhirox_local.block_lot_v89_mutation()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'immutable isolated LOT receiving/return history' USING ERRCODE='P8904';
END $fn$;
CREATE TRIGGER lot_receipts_v89_immutable BEFORE UPDATE OR DELETE ON zhirox_local.lot_receipt_batches_v89
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_lot_v89_mutation();
CREATE TRIGGER lot_receipt_lines_v89_immutable BEFORE UPDATE OR DELETE ON zhirox_local.lot_receipt_lines_v89
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_lot_v89_mutation();
CREATE TRIGGER lot_returns_v89_immutable BEFORE UPDATE OR DELETE ON zhirox_local.lot_returns_v89
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_lot_v89_mutation();

REVOKE ALL ON TABLE zhirox_local.lot_receipt_batches_v89,
 zhirox_local.lot_receipt_lines_v89,zhirox_local.lot_returns_v89 FROM PUBLIC;
REVOKE ALL ON FUNCTION
 zhirox_local.receive_order_lots_v89(uuid,uuid,uuid,uuid,jsonb),
 zhirox_local.return_opening_lot_v89(uuid,uuid,uuid,integer,uuid,uuid,bigint,boolean,text),
 zhirox_local.block_lot_v89_mutation() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.lot_receipt_lines_v89 IS
 'TEST ONLY: immutable lot assigned to one received order line. V88 checkout does not yet sell these new lots.';
COMMENT ON TABLE zhirox_local.lot_returns_v89 IS
 'TEST ONLY: original V88 sale opening-LOT return link. Cash repayment NOT performed and current V88 FEFO allocation does not yet consume returned stock.';
COMMIT;
