-- v19 checkout: scale weight in kilograms, stock in kilograms, IQD total rounded per scanned label.
-- All writes are atomic and idempotent by (store_id, request_id), requiring open shift.
CREATE OR REPLACE FUNCTION retail_internal.checkout_weight_v19(
 p_store uuid, p_request uuid, p_items jsonb, p_cash_received bigint, p_discount bigint DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid := (SELECT auth.uid());
 v_sale uuid; v_existing record; v_cash_session uuid; v_req jsonb;
 v_entry jsonb; v_count int; v_qty numeric;
 v_barcode text; v_row record; v_scale boolean; v_grams integer; v_kg numeric(14,3);
 v_price bigint; v_expected bigint; v_expected_units numeric; v_base_units numeric(14,3);
 v_line_total bigint; v_subtotal numeric:=0; v_net bigint;
 v_stock numeric(14,3); v_receipt bigint; v_sum integer; v_digit integer; v_i integer;
BEGIN
 IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager','cashier'])
 THEN RAISE EXCEPTION 'Cashier permission required' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR
    p_cash_received IS NULL OR p_cash_received<0 OR p_cash_received>9999999999999
    OR p_discount IS NULL OR p_discount<0 OR p_discount>9999999999999
 THEN RAISE EXCEPTION 'Invalid weight checkout' USING ERRCODE='22023'; END IF;
 v_count:=jsonb_array_length(p_items);
 IF v_count<1 OR v_count>100 THEN RAISE EXCEPTION 'Invalid number of items' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.retail_stores WHERE id=p_store AND currency='IQD')
 THEN RAISE EXCEPTION 'IQD store required' USING ERRCODE='22023'; END IF;
 v_req:=jsonb_build_object('items',p_items,'cash_received',p_cash_received,'discount',p_discount);
 INSERT INTO public.retail_sales(store_id,cashier_id,request_id,status,currency,request_payload)
 VALUES(p_store,v_actor,p_request,'draft','IQD',v_req)
 ON CONFLICT (store_id,request_id) DO NOTHING RETURNING id INTO v_sale;
 IF v_sale IS NULL THEN
   SELECT id,status,request_payload,cashier_id INTO v_existing
   FROM public.retail_sales WHERE store_id=p_store AND request_id=p_request FOR UPDATE;
   IF v_existing.status IS DISTINCT FROM 'posted' OR v_existing.request_payload IS DISTINCT FROM v_req
     OR v_existing.cashier_id IS DISTINCT FROM v_actor
   THEN RAISE EXCEPTION 'Checkout request reused with different actor or payload' USING ERRCODE='23505'; END IF;
   RETURN v_existing.id;
 END IF;

 SELECT id INTO v_cash_session FROM public.retail_cash_sessions
 WHERE store_id=p_store AND cashier_id=v_actor AND status='open' FOR UPDATE;
 IF v_cash_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING ERRCODE='22023'; END IF;
 UPDATE public.retail_sales SET cash_session_id=v_cash_session WHERE store_id=p_store AND id=v_sale;

 FOR v_entry IN SELECT value FROM jsonb_array_elements(p_items) AS x(value)
    ORDER BY value->>'barcode'
 LOOP
  IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' OR
    v_entry->>'barcode' IS NULL OR v_entry->>'quantity' IS NULL
    OR v_entry->>'expected_price_minor' IS NULL OR v_entry->>'expected_units' IS NULL
    OR (v_entry->>'quantity') !~ '^[0-9]{1,3}$'
    OR (v_entry->>'expected_price_minor') !~ '^[0-9]{1,12}$'
    OR (v_entry->>'expected_units') !~ '^[0-9]{1,6}(\.[0-9]{1,3})?$'
  THEN RAISE EXCEPTION 'Invalid checkout line' USING ERRCODE='22023'; END IF;
  v_barcode:=btrim(v_entry->>'barcode');
  v_qty:=(v_entry->>'quantity')::numeric;
  v_expected:=(v_entry->>'expected_price_minor')::bigint;
  v_expected_units:=(v_entry->>'expected_units')::numeric;
  IF v_qty<1 OR v_qty>100 OR length(v_barcode)>60
  THEN RAISE EXCEPTION 'Invalid quantity/barcode' USING ERRCODE='22023'; END IF;
  v_scale:=v_barcode ~ '^27[0-9]{11}$';
  IF v_scale THEN
    v_sum:=0;
    FOR v_i IN 1..12 LOOP
      v_digit:=substring(v_barcode FROM v_i FOR 1)::int;
      v_sum:=v_sum+v_digit*CASE WHEN v_i%2=0 THEN 3 ELSE 1 END;
    END LOOP;
    IF (10-v_sum%10)%10<>substring(v_barcode FROM 13 FOR 1)::int THEN
      RAISE EXCEPTION 'Invalid scale EAN13 checksum' USING ERRCODE='22023'; END IF;
    v_grams:=substring(v_barcode FROM 8 FOR 5)::int;
    IF v_grams<=0 OR v_qty<>1 OR v_expected_units<>1 THEN
      RAISE EXCEPTION 'Invalid scale weight or duplicate pack quantity' USING ERRCODE='22023'; END IF;
    v_kg:=v_grams::numeric/1000;
    SELECT p.id AS product_id,p.name,p.price_minor AS kg_price,
        p.base_unit,p.active,p.currency,
        b.active AS barcode_active
    INTO v_row
    FROM public.retail_products p
    JOIN public.retail_barcodes b ON b.store_id=p.store_id AND b.product_id=p.id
      AND b.code=left(v_barcode,7) AND b.unit_type='unit'
    WHERE p.store_id=p_store AND p.active=true AND p.base_unit='kg'
    ORDER BY (b.code=p.unit_primary_barcode) DESC LIMIT 1;
    IF NOT FOUND OR v_row.barcode_active IS NOT TRUE
    THEN RAISE EXCEPTION 'Weighted product barcode unavailable' USING ERRCODE='22023'; END IF;
    v_price:=v_row.kg_price;
    v_base_units:=v_kg;
    v_line_total:=round(v_base_units*v_price)::bigint;
    -- This is the server-computed label price; never trust the client's amount.
    IF v_expected<>v_line_total THEN
      RAISE EXCEPTION 'Weight price changed, rescan label' USING ERRCODE='22023'; END IF;
  ELSE
    SELECT p.id AS product_id,p.name,p.base_unit,p.active,p.currency,
      COALESCE(b.price_minor,p.price_minor) AS package_price,
      b.units_per_scan,b.unit_type,b.active AS barcode_active
    INTO v_row
    FROM public.retail_barcodes b
    JOIN public.retail_products p ON p.id=b.product_id AND p.store_id=b.store_id
    WHERE b.store_id=p_store AND b.code=v_barcode;
    IF NOT FOUND OR v_row.active IS NOT TRUE OR v_row.barcode_active IS NOT TRUE
       OR v_row.base_unit<>'unit' OR
       v_row.unit_type NOT IN ('unit','carton') OR
       v_expected_units<>v_row.units_per_scan OR
       v_row.units_per_scan<>trunc(v_row.units_per_scan)
    THEN RAISE EXCEPTION 'Unknown or incompatible package barcode' USING ERRCODE='22023'; END IF;
    v_price:=v_row.package_price;
    IF v_expected<>v_price THEN
      RAISE EXCEPTION 'Product price changed, rescan' USING ERRCODE='22023'; END IF;
    v_base_units:=v_qty*v_row.units_per_scan;
    v_line_total:=v_qty*v_price;
  END IF;
  IF v_row.currency<>'IQD' OR v_price IS NULL OR v_price<0 OR v_line_total>9999999999999
  THEN RAISE EXCEPTION 'Invalid price/currency' USING ERRCODE='22023'; END IF;
  SELECT quantity INTO v_stock FROM public.retail_stock_balances
    WHERE store_id=p_store AND product_id=v_row.product_id FOR UPDATE;
  IF NOT FOUND OR v_stock<v_base_units THEN
    RAISE EXCEPTION 'Insufficient stock' USING ERRCODE='22023'; END IF;
  UPDATE public.retail_stock_balances SET quantity=quantity-v_base_units,updated_at=now()
    WHERE store_id=p_store AND product_id=v_row.product_id;
  INSERT INTO public.retail_sale_items
    (store_id,sale_id,product_id,quantity,unit_price_minor,product_name_snapshot)
  VALUES(p_store,v_sale,v_row.product_id,v_base_units,v_price,v_row.name);
  INSERT INTO public.retail_stock_events(store_id,product_id,delta,reason,sale_id)
  VALUES(p_store,v_row.product_id,-v_base_units,'sale',v_sale);
  v_subtotal:=v_subtotal+v_line_total;
  IF v_subtotal>9999999999999 THEN RAISE EXCEPTION 'Checkout total too large' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_discount>v_subtotal THEN RAISE EXCEPTION 'Discount exceeds subtotal' USING ERRCODE='22023'; END IF;
 v_net:=(v_subtotal-p_discount)::bigint;
 IF p_cash_received<v_net THEN RAISE EXCEPTION 'Insufficient cash' USING ERRCODE='22023'; END IF;
 INSERT INTO public.retail_receipt_counters(store_id,last_no) VALUES(p_store,1)
 ON CONFLICT(store_id) DO UPDATE SET last_no=public.retail_receipt_counters.last_no+1
 RETURNING last_no INTO v_receipt;
 UPDATE public.retail_sales SET status='posted',receipt_no=v_receipt,total_minor=v_net,
   cash_received_minor=p_cash_received,change_due_minor=p_cash_received-v_net
 WHERE store_id=p_store AND id=v_sale;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 VALUES (p_store,v_actor,'sale.checkout_weight_v19',v_sale,
 jsonb_build_object('cash_iqd',p_cash_received,'total_iqd',v_net,
   'discount_iqd',p_discount,'request_id',p_request,'receipt_no',v_receipt));
 RETURN v_sale;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.checkout_weight_v19(uuid,uuid,jsonb,bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION retail_internal.checkout_weight_v19(uuid,uuid,jsonb,bigint,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.retail_checkout_weight_v19(
 p_store uuid,p_request uuid,p_items jsonb,p_cash_received bigint,p_discount bigint DEFAULT 0
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT retail_internal.checkout_weight_v19(p_store,p_request,p_items,p_cash_received,p_discount);
$fn$;
REVOKE ALL ON FUNCTION public.retail_checkout_weight_v19(uuid,uuid,jsonb,bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_checkout_weight_v19(uuid,uuid,jsonb,bigint,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';