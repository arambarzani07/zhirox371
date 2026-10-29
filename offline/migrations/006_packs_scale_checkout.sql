-- V26 isolated PostgreSQL test migration. NEVER run on Supabase production.
-- Stores units as single items, weighed products as integer grams.
BEGIN;
ALTER TABLE zhirox_local.products
  ADD COLUMN IF NOT EXISTS base_unit text NOT NULL DEFAULT 'unit'
    CHECK (base_unit IN ('unit','gram')),
  ADD COLUMN IF NOT EXISTS plu text CHECK (plu ~ '^[0-9]{5}$' AND plu <> '00000');
CREATE UNIQUE INDEX IF NOT EXISTS zhirox_v26_store_plu
  ON zhirox_local.products(store_id,plu) WHERE plu IS NOT NULL;
ALTER TABLE zhirox_local.barcodes
  ADD COLUMN IF NOT EXISTS sale_mode text NOT NULL DEFAULT 'unit'
    CHECK (sale_mode IN ('unit','carton')),
  ADD COLUMN IF NOT EXISTS sale_price_minor bigint
    CHECK (sale_price_minor IS NULL OR sale_price_minor >= 0);
-- For base_unit='gram', inventory is grams and price_minor is IQD per 1,000g.
-- There is NO automatic legacy unit->gram conversion, to prevent corrupt stock.
-- A carton barcode specifies units_per_scan via quantity_base_units and
-- an independent sale_price_minor; unit aliases must map to one unit.
-- Preserve the scanned package/weight on receipt lines (legacy rows stay NULL).
ALTER TABLE zhirox_local.sale_lines
  ADD COLUMN IF NOT EXISTS barcode_snapshot text,
  ADD COLUMN IF NOT EXISTS sale_mode_snapshot text,
  ADD COLUMN IF NOT EXISTS scan_quantity integer;
CREATE OR REPLACE FUNCTION zhirox_local.checkout_packs_scale_v26(
  p_store uuid,p_cashier uuid,p_request uuid,p_lines jsonb,
  p_expected_total_minor bigint
) RETURNS TABLE(sale_id uuid,receipt_no bigint,total_minor bigint,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local
AS $$
DECLARE
 v_old zhirox_local.sales%ROWTYPE;
 v_product zhirox_local.products%ROWTYPE;
 v_barcode zhirox_local.barcodes%ROWTYPE;
 v_id uuid := gen_random_uuid();
 v_no bigint;
 v_total numeric := 0;
 v_price bigint;
 v_line_total numeric;
 v_base_qty bigint;
 v_qty bigint;
 v_grams bigint;
 v_digit integer;
 v_checksum integer;
 v_sum integer;
 v_code text;
 v_mode text;
 v_payload jsonb := '[]'::jsonb;
 v_items jsonb := '[]'::jsonb;
 v_seen_scale text[] := ARRAY[]::text[];
 v_index integer := 0;
 v_line jsonb;
 v_rec record;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_request IS NULL
   OR p_expected_total_minor IS NULL OR p_expected_total_minor<0
   OR p_expected_total_minor>9999999999999
   OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'invalid checkout' USING ERRCODE='22023'; END IF;
 -- Store-scoped serialization; independent checkouts cannot oversell.
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='22023'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_line->'qty') IS DISTINCT FROM 'number'
     OR (v_line->>'qty') !~ '^[1-9][0-9]{0,2}$'
     OR (v_line->>'qty')::integer>100
     OR jsonb_typeof(v_line->'barcode') IS DISTINCT FROM 'string'
   THEN RAISE EXCEPTION 'invalid barcode line or quantity' USING ERRCODE='22023'; END IF;
   v_code := v_line->>'barcode';
   IF length(v_code)>80 OR length(v_code)<4 OR v_code !~ '^[A-Za-z0-9._-]+$'
   THEN RAISE EXCEPTION 'invalid barcode' USING ERRCODE='22023'; END IF;
   v_qty := (v_line->>'qty')::integer;
   v_payload := v_payload || jsonb_build_array(jsonb_build_object('barcode',v_code,'qty',v_qty));
 END LOOP;
 -- Replay always returns the ORIGINAL receipt even if the catalog changed.
 SELECT * INTO v_old FROM zhirox_local.sales WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
   IF v_old.cashier_id<>p_cashier OR v_old.request_payload IS DISTINCT FROM v_payload
     OR v_old.total_minor IS DISTINCT FROM p_expected_total_minor
   THEN RAISE EXCEPTION 'idempotency mismatch' USING ERRCODE='23505'; END IF;
   RETURN QUERY SELECT v_old.id,v_old.receipt_no,v_old.total_minor,true;
   RETURN;
 END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(v_payload) LOOP
   v_code:=v_line->>'barcode';v_qty:=(v_line->>'qty')::bigint;
   IF v_code ~ '^27[0-9]{11}$' THEN
     -- Prefix 27 + five-digit PLU + five-digit grams + EAN-13 check digit.
     v_sum:=0;
     FOR v_digit IN 1..12 LOOP
       v_sum:=v_sum+substring(v_code,v_digit,1)::integer
         * CASE WHEN v_digit % 2=0 THEN 3 ELSE 1 END;
     END LOOP;
     v_checksum:=(10-v_sum%10)%10;
     v_grams:=substring(v_code,8,5)::bigint;
     IF v_checksum<>substring(v_code,13,1)::integer
       OR substring(v_code,3,5)='00000'
       OR v_grams<1 OR v_qty<>1
     THEN RAISE EXCEPTION 'invalid scale label' USING ERRCODE='22023'; END IF;
     IF v_code=ANY(v_seen_scale)
     THEN RAISE EXCEPTION 'duplicate weighed label' USING ERRCODE='23505'; END IF;
     v_seen_scale:=array_append(v_seen_scale,v_code);
     SELECT * INTO v_product FROM zhirox_local.products
       WHERE store_id=p_store AND plu=substring(v_code,3,5)
          AND base_unit='gram' AND active FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'unknown weighed PLU' USING ERRCODE='22023'; END IF;
     v_mode:='scale';v_base_qty:=v_grams;v_price:=v_product.price_minor;
     -- Integer IQD rounding is HALF UP for positive gram weight.
     v_line_total:=floor(v_base_qty::numeric*v_price::numeric/1000+0.5);
   ELSE
     SELECT * INTO v_barcode FROM zhirox_local.barcodes
       WHERE store_id=p_store AND code=v_code AND active;
     IF NOT FOUND THEN RAISE EXCEPTION 'barcode not found' USING ERRCODE='22023'; END IF;
     SELECT * INTO v_product FROM zhirox_local.products
       WHERE store_id=p_store AND id=v_barcode.product_id AND base_unit='unit'
          AND active FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'unit product not available' USING ERRCODE='22023'; END IF;
     IF (v_barcode.sale_mode='unit' AND v_barcode.quantity_base_units<>1)
       OR (v_barcode.sale_mode='carton' AND v_barcode.quantity_base_units<2)
     THEN RAISE EXCEPTION 'invalid package definition' USING ERRCODE='22023'; END IF;
     v_mode:=v_barcode.sale_mode;
     v_base_qty:=v_barcode.quantity_base_units::bigint*v_qty;
     v_price:=COALESCE(v_barcode.sale_price_minor,v_product.price_minor);
     v_line_total:=v_price::numeric*v_qty;
   END IF;
   IF v_base_qty<1 OR v_line_total<0 OR v_line_total>9999999999999
   THEN RAISE EXCEPTION 'quantity or price overflow' USING ERRCODE='22003'; END IF;
   v_total:=v_total+v_line_total;
   IF v_total>9999999999999
   THEN RAISE EXCEPTION 'total overflow' USING ERRCODE='22003'; END IF;
   v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id,'barcode',v_code,'mode',v_mode,
      'qty',v_qty,'base_qty',v_base_qty,'unit_price',v_price,
      'line_total',v_line_total::bigint,'name',v_product.name));
 END LOOP;
 IF v_total::bigint<>p_expected_total_minor
 THEN RAISE EXCEPTION 'server total changed' USING ERRCODE='P2501'; END IF;
 -- All products are held under FOR UPDATE; check cumulative units/grams.
 FOR v_rec IN
   SELECT (x->>'product_id')::uuid AS product_id,
          sum((x->>'base_qty')::bigint) AS need
   FROM jsonb_array_elements(v_items) x
   GROUP BY 1 ORDER BY 1
 LOOP
   IF v_rec.need>COALESCE((
        SELECT stock_base_units FROM zhirox_local.products
        WHERE store_id=p_store AND id=v_rec.product_id),-1)
   THEN RAISE EXCEPTION 'insufficient stock' USING ERRCODE='23514'; END IF;
 END LOOP;
 INSERT INTO zhirox_local.receipt_counters(store_id,next_no)
 VALUES(p_store,1) ON CONFLICT(store_id) DO NOTHING;
 UPDATE zhirox_local.receipt_counters SET next_no=next_no+1
 WHERE store_id=p_store RETURNING next_no-1 INTO v_no;
 INSERT INTO zhirox_local.sales(store_id,id,request_id,receipt_no,cashier_id,total_minor,request_payload)
 VALUES(p_store,v_id,p_request,v_no,p_cashier,v_total::bigint,v_payload);
 FOR v_rec IN SELECT value AS item FROM jsonb_array_elements(v_items) LOOP
   v_index:=v_index+1;
   INSERT INTO zhirox_local.sale_lines(store_id,sale_id,line_no,product_id,
      name_snapshot,quantity_base_units,unit_price_minor,line_total_minor,
      barcode_snapshot,sale_mode_snapshot,scan_quantity)
   VALUES(p_store,v_id,v_index,(v_rec.item->>'product_id')::uuid,
      v_rec.item->>'name',(v_rec.item->>'base_qty')::bigint,
      (v_rec.item->>'unit_price')::bigint,(v_rec.item->>'line_total')::bigint,
      v_rec.item->>'barcode',v_rec.item->>'mode',(v_rec.item->>'qty')::integer);
 END LOOP;
 FOR v_rec IN
   SELECT (x->>'product_id')::uuid AS product_id,
          sum((x->>'base_qty')::bigint) AS need
   FROM jsonb_array_elements(v_items) x GROUP BY 1 ORDER BY 1
 LOOP
   UPDATE zhirox_local.products SET stock_base_units=stock_base_units-v_rec.need,
      version=version+1 WHERE store_id=p_store AND id=v_rec.product_id;
   INSERT INTO zhirox_local.stock_ledger(store_id,id,product_id,sale_id,delta_base_units)
   VALUES(p_store,gen_random_uuid(),v_rec.product_id,v_id,-v_rec.need);
 END LOOP;
 INSERT INTO zhirox_local.event_outbox(store_id,event_id,aggregate_id,event_type,payload)
 VALUES(p_store,gen_random_uuid(),v_id,'sale.completed',
      jsonb_build_object('sale_id',v_id,'receipt_no',v_no,'total_minor',v_total::bigint,
        'package_breakdown',v_items));
 RETURN QUERY SELECT v_id,v_no,v_total::bigint,false;
END $$;
REVOKE ALL ON FUNCTION zhirox_local.checkout_packs_scale_v26(uuid,uuid,uuid,jsonb,bigint) FROM PUBLIC;
COMMIT;
