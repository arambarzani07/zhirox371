-- V87: isolated TEST-MARKET ONLY. New LOT-aware cash checkout laboratory.
-- The old checkout_cash_v1 remains unchanged and can bypass LOT routing.
-- All amounts and payments in this fixture are synthetic; no bank/cash movement.
-- Requires 001,002,003,029,032. NEVER run on production.
BEGIN;
CREATE TABLE zhirox_local.lot_checkouts_v87(
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
CREATE TABLE zhirox_local.lot_sale_allocations_v87(
 store_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 line_no integer NOT NULL,
 batch_id uuid NOT NULL,
 product_id uuid NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units BETWEEN 1 AND 1000000),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,sale_id,line_no,batch_id),
 FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.lot_checkouts_v87(store_id,sale_id),
 FOREIGN KEY(store_id,sale_id,line_no)
   REFERENCES zhirox_local.sale_lines(store_id,sale_id,line_no),
 FOREIGN KEY(store_id,batch_id) REFERENCES zhirox_local.expiry_lots_v86(store_id,batch_id),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE INDEX lot_sale_allocations_batch_v87
 ON zhirox_local.lot_sale_allocations_v87(store_id,batch_id);

CREATE FUNCTION zhirox_local.checkout_fefo_test_v87(
 p_store uuid,p_actor uuid,p_request uuid,p_lines jsonb
) RETURNS TABLE(sale_id uuid,receipt_no bigint,total_minor bigint,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 existing zhirox_local.sales%ROWTYPE;
 v_payload jsonb;
 v_line jsonb;
 v_result record;
 v_sale_line record;
 v_batch record;
 v_need bigint;
 v_take bigint;
 v_free bigint;
BEGIN
 IF p_store IS NULL OR p_actor IS NULL OR p_request IS NULL
 OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array'
 OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'invalid FEFO request' USING ERRCODE='P8702';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users
  WHERE store_id=p_store AND id=p_actor AND enabled
   AND role IN('owner','manager','cashier')
   AND (locked_until IS NULL OR locked_until<now())) THEN
  RAISE EXCEPTION 'inactive or unregistered actor' USING ERRCODE='P8701';
 END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(v_line)<>'object'
  OR NOT(v_line ? 'product_id') OR NOT(v_line ? 'qty')
  OR (SELECT count(*) FROM jsonb_object_keys(v_line) k
      WHERE k NOT IN('product_id','qty'))>0
  THEN RAISE EXCEPTION 'unsupported FEFO line fields' USING ERRCODE='P8702'; END IF;
  BEGIN
   IF (v_line->>'product_id')::uuid IS NULL
   OR (v_line->>'qty')::bigint NOT BETWEEN 1 AND 1000000 THEN
    RAISE EXCEPTION 'invalid line quantity' USING ERRCODE='P8702'; END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'bad quantity or product ID' USING ERRCODE='P8702';
  END;
 END LOOP;
 -- Normalize identical to V1; duplicate products aggregate once.
 SELECT jsonb_agg(jsonb_build_object('product_id',product_id,'qty',qty)
   ORDER BY product_id) INTO v_payload FROM (
   SELECT (v->>'product_id')::uuid AS product_id,sum((v->>'qty')::bigint) AS qty
   FROM jsonb_array_elements(p_lines) v GROUP BY 1
 ) normalized;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_payload) x
   WHERE (x->>'qty')::bigint NOT BETWEEN 1 AND 1000000)
 THEN RAISE EXCEPTION 'aggregated quantity too large' USING ERRCODE='P8702'; END IF;
 -- Same store-level serialization as the legacy checkout. Guarantees safe
 -- V87 allocation races and use of existing V1 sale/receipt/stock/outbox.
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'test store missing' USING ERRCODE='P8702'; END IF;
 SELECT * INTO existing FROM zhirox_local.sales
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF existing.cashier_id IS DISTINCT FROM p_actor
   OR existing.request_payload IS DISTINCT FROM v_payload
   OR NOT EXISTS(SELECT 1 FROM zhirox_local.lot_checkouts_v87
    WHERE store_id=p_store AND sale_id=existing.id AND request_id=p_request
      AND actor_id=p_actor)
  THEN RAISE EXCEPTION 'request conflicts with existing sale' USING ERRCODE='P8703'; END IF;
  RETURN QUERY SELECT existing.id,existing.receipt_no,existing.total_minor,true;
  RETURN;
 END IF;
 -- Test-only: execute original V1 cash sale and then batch attribution
 -- in the SAME PostgreSQL transaction. Failure to allocate rolls back
 -- sale, receipt number, product stock change, ledger and outbox together.
 SELECT * INTO v_result FROM zhirox_local.checkout_cash_v1(
   p_store,p_actor,p_request,v_payload);
 IF v_result.replayed THEN
  RAISE EXCEPTION 'legacy replay cannot be attributed to FEFO' USING ERRCODE='P8703';
 END IF;
 INSERT INTO zhirox_local.lot_checkouts_v87(store_id,sale_id,request_id,actor_id)
 VALUES(p_store,v_result.sale_id,p_request,p_actor);
 FOR v_sale_line IN SELECT l.line_no,l.product_id,l.quantity_base_units
  FROM zhirox_local.sale_lines l
  WHERE l.store_id=p_store AND l.sale_id=v_result.sale_id
  ORDER BY l.product_id,l.line_no LOOP
  v_need:=v_sale_line.quantity_base_units;
  FOR v_batch IN
   SELECT b.batch_id,b.received_qty_base_units,
    COALESCE((SELECT sum(a.quantity_base_units)
     FROM zhirox_local.lot_sale_allocations_v87 a
     WHERE a.store_id=b.store_id AND a.batch_id=b.batch_id),0) AS used_units
   FROM zhirox_local.expiry_lots_v86 b
   WHERE b.store_id=p_store AND b.product_id=v_sale_line.product_id
     AND b.expires_on>=current_date
   ORDER BY b.expires_on ASC,b.batch_id ASC
   FOR UPDATE OF b
  LOOP
   v_free:=v_batch.received_qty_base_units-v_batch.used_units;
   IF v_free<=0 THEN CONTINUE; END IF;
   v_take:=LEAST(v_need,v_free);
   INSERT INTO zhirox_local.lot_sale_allocations_v87
    (store_id,sale_id,line_no,batch_id,product_id,quantity_base_units)
   VALUES(p_store,v_result.sale_id,v_sale_line.line_no,v_batch.batch_id,
      v_sale_line.product_id,v_take);
   v_need:=v_need-v_take;
   EXIT WHEN v_need=0;
  END LOOP;
  IF v_need<>0 THEN
   RAISE EXCEPTION 'insufficient non-expired tracked LOT allocation'
   USING ERRCODE='P8705';
  END IF;
 END LOOP;
 RETURN QUERY SELECT v_result.sale_id,v_result.receipt_no,
  v_result.total_minor,false;
END $fn$;

CREATE FUNCTION zhirox_local.block_lot_allocation_mutation_v87()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'immutable tracked LOT sale' USING ERRCODE='P8704';
END $fn$;
CREATE TRIGGER lot_allocation_immutable_v87 BEFORE UPDATE OR DELETE
 ON zhirox_local.lot_sale_allocations_v87 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.block_lot_allocation_mutation_v87();
CREATE TRIGGER lot_checkout_immutable_v87 BEFORE UPDATE OR DELETE
 ON zhirox_local.lot_checkouts_v87 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.block_lot_allocation_mutation_v87();
REVOKE ALL ON TABLE zhirox_local.lot_checkouts_v87,
 zhirox_local.lot_sale_allocations_v87 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.checkout_fefo_test_v87(
 uuid,uuid,uuid,jsonb),zhirox_local.block_lot_allocation_mutation_v87() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.lot_sale_allocations_v87 IS
 'TEST ONLY: FEFO allocations of new V87 checkout, not all historical sales. Does not prove physical stock by LOT.';
COMMIT;
