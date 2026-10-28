-- ZHIROX LOCAL-ONLY TEST MIGRATION 002
-- Atomic multi-cashier checkout with idempotency and durable outbox.
-- Apply to an ISOLATED PostgreSQL database, never production Supabase.
BEGIN;
ALTER TABLE zhirox_local.sales ADD COLUMN IF NOT EXISTS request_payload jsonb;
CREATE OR REPLACE FUNCTION zhirox_local.checkout_cash_v1(
 p_store uuid, p_cashier uuid, p_request uuid, p_lines jsonb
) RETURNS TABLE(sale_id uuid, receipt_no bigint, total_minor bigint, replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, zhirox_local
AS $$
DECLARE
 v_existing zhirox_local.sales%ROWTYPE;
 v_id uuid := gen_random_uuid();
 v_receipt bigint;
 v_total numeric := 0;
 v_count bigint;
 v_p record;
 v_product zhirox_local.products%ROWTYPE;
 v_i integer := 0;
 v_payload jsonb;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_request IS NULL
    OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0
    OR jsonb_array_length(p_lines) > 100 THEN
   RAISE EXCEPTION 'invalid checkout' USING ERRCODE='22023';
 END IF;
 -- Serialize checkout operations at the store level, including idempotency replay.
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'store not found' USING ERRCODE='22023'; END IF;
 -- Normalize a line to (product_id, positive integer base-unit qty);
 -- duplicates aggregate deterministically before calculating total.
 BEGIN
   SELECT jsonb_agg(jsonb_build_object('product_id',product_id,'qty',qty)
                      ORDER BY product_id)
   INTO v_payload
   FROM (
     SELECT (x->>'product_id')::uuid AS product_id,
            sum((x->>'qty')::bigint) AS qty
       FROM jsonb_array_elements(p_lines) x
      GROUP BY 1
   ) q;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'invalid checkout line' USING ERRCODE='22023';
 END;
 IF v_payload IS NULL OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(v_payload) x WHERE (x->>'qty')::bigint <= 0
 ) THEN RAISE EXCEPTION 'invalid quantity' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_existing FROM zhirox_local.sales
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF v_existing.cashier_id <> p_cashier OR v_existing.request_payload IS DISTINCT FROM v_payload
  THEN RAISE EXCEPTION 'request reused with different actor or payload' USING ERRCODE='23505'; END IF;
  RETURN QUERY SELECT v_existing.id, v_existing.receipt_no, v_existing.total_minor, true;
  RETURN;
 END IF;
 FOR v_p IN
   SELECT (x->>'product_id')::uuid product_id, (x->>'qty')::bigint qty
   FROM jsonb_array_elements(v_payload) x ORDER BY 1
 LOOP
   IF v_p.qty <= 0 THEN RAISE EXCEPTION 'invalid quantity' USING ERRCODE='22023'; END IF;
   SELECT * INTO v_product FROM zhirox_local.products
   WHERE store_id=p_store AND id=v_p.product_id AND active FOR UPDATE;
   IF NOT FOUND OR v_product.stock_base_units < v_p.qty THEN
     RAISE EXCEPTION 'insufficient stock or inactive product' USING ERRCODE='23514';
   END IF;
   v_total := v_total + v_p.qty::numeric * v_product.price_minor::numeric;
   IF v_total > 9223372036854775807 THEN
     RAISE EXCEPTION 'total overflow' USING ERRCODE='22003';
   END IF;
 END LOOP;
 INSERT INTO zhirox_local.receipt_counters(store_id,next_no)
 VALUES(p_store,1) ON CONFLICT(store_id) DO NOTHING;
 UPDATE zhirox_local.receipt_counters SET next_no=next_no+1
 WHERE store_id=p_store RETURNING next_no-1 INTO v_receipt;
 INSERT INTO zhirox_local.sales(store_id,id,request_id,receipt_no,cashier_id,total_minor,request_payload)
 VALUES(p_store,v_id,p_request,v_receipt,p_cashier,v_total::bigint,v_payload);
 FOR v_p IN SELECT (x->>'product_id')::uuid product_id, (x->>'qty')::bigint qty
            FROM jsonb_array_elements(v_payload) x ORDER BY 1 LOOP
   UPDATE zhirox_local.products SET stock_base_units=stock_base_units-v_p.qty,
     version=version+1 WHERE store_id=p_store AND id=v_p.product_id
   RETURNING * INTO v_product;
   v_i:=v_i+1;
   INSERT INTO zhirox_local.sale_lines(store_id,sale_id,line_no,product_id,name_snapshot,
       quantity_base_units,unit_price_minor,line_total_minor)
   VALUES (p_store,v_id,v_i,v_p.product_id,v_product.name,v_p.qty,v_product.price_minor,
           (v_p.qty::numeric*v_product.price_minor::numeric)::bigint);
   INSERT INTO zhirox_local.stock_ledger(store_id,id,product_id,sale_id,delta_base_units)
   VALUES(p_store,gen_random_uuid(),v_p.product_id,v_id,-v_p.qty);
 END LOOP;
 INSERT INTO zhirox_local.event_outbox(store_id,event_id,aggregate_id,event_type,payload)
 VALUES(p_store,gen_random_uuid(),v_id,'sale.completed',
    jsonb_build_object('sale_id',v_id,'receipt_no',v_receipt,'total_minor',v_total::bigint));
 RETURN QUERY SELECT v_id,v_receipt,v_total::bigint,false;
END $$;
REVOKE ALL ON FUNCTION zhirox_local.checkout_cash_v1(uuid,uuid,uuid,jsonb) FROM PUBLIC;
COMMIT;
