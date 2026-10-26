-- V16 ISOLATED QA ONLY. No hosted migrations or production mutations.
-- One stock ledger in base units, two independent selling prices.
ALTER TABLE public.retail_sale_items
  ADD COLUMN package_type text NOT NULL DEFAULT 'unit' CHECK(package_type IN ('unit','carton')),
  ADD COLUMN package_barcode text,
  ADD COLUMN units_per_package integer NOT NULL DEFAULT 1 CHECK(units_per_package>=1),
  ADD COLUMN base_units numeric(14,3);

-- Column-level protection: the regular Auth Data API must not expose unit
-- purchase costs. The owner-only snapshot RPC remains the safe cost reader.
REVOKE SELECT ON TABLE public.retail_products FROM authenticated;
GRANT SELECT(id,store_id,name,price_minor,currency,active,created_at,
  sku,plu,catalog_version,unit_primary_barcode)
ON TABLE public.retail_products TO authenticated;

-- Read-only cashier price lookup. Purchase costs NEVER appear in this result.
CREATE FUNCTION public.retail_scan_catalog_v16(p_store uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 IF (select auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store,array['manager','cashier'])
 THEN RAISE EXCEPTION 'Cashier permission required' USING errcode='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.code),'[]'::jsonb)
 FROM (
   SELECT b.code,b.product_id,b.unit_type,b.units_per_scan,
     CASE WHEN b.unit_type='carton' THEN c.sale_price_minor ELSE p.price_minor END AS price_minor
   FROM public.retail_barcodes b
   JOIN public.retail_products p ON p.store_id=b.store_id AND p.id=b.product_id
   LEFT JOIN public.retail_product_cartons c ON c.store_id=b.store_id AND c.product_id=b.product_id
   WHERE b.store_id=p_store AND b.active AND p.active AND p.currency='IQD'
   AND (b.unit_type='unit' AND b.units_per_scan=1
       OR b.unit_type='carton' AND c.product_id IS NOT NULL AND b.units_per_scan=c.units_per_carton)
   ORDER BY b.code LIMIT 2000
 ) x);
END;
$$;
REVOKE ALL ON FUNCTION public.retail_scan_catalog_v16(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_scan_catalog_v16(uuid) TO authenticated;

CREATE FUNCTION public.retail_checkout_packs_v16(
 p_store uuid,p_request uuid,p_items jsonb,p_cash_received bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
 v_actor uuid:=(select auth.uid());
 v_sale uuid;v_prior_status text;v_prior_payload jsonb;v_prior_actor uuid;
 v_request_payload jsonb;v_cash_session uuid;
 v_entry jsonb;v_barcode text;v_qty bigint;v_expected_price bigint;v_expected_units bigint;
 v_product uuid;v_name text;v_pack_type text;v_pack_units integer;v_pack_price bigint;
 v_pactive boolean;v_currency text;v_carton_price bigint;v_carton_units integer;
 v_need jsonb:='{}'::jsonb;v_old_units numeric;v_total numeric:=0;
 v_stock numeric;v_record record;v_receipt_number bigint;
BEGIN
 IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,array['manager','cashier'])
 THEN RAISE EXCEPTION 'Cashier permission required' USING errcode='42501';END IF;
 IF p_request IS NULL OR p_items IS NULL OR jsonb_typeof(p_items)<>'array'
   OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>100
   OR p_cash_received IS NULL OR p_cash_received<0 OR p_cash_received>9999999999999
 THEN RAISE EXCEPTION 'Invalid checkout' USING errcode='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.retail_stores WHERE id=p_store AND currency='IQD')
 THEN RAISE EXCEPTION 'IQD store required' USING errcode='22023';END IF;

 -- Validate every field before casting, and fence retries with exact same payload.
 FOR v_entry IN SELECT value FROM jsonb_array_elements(p_items)
 LOOP
   IF jsonb_typeof(v_entry)<>'object'
    OR jsonb_typeof(v_entry->'barcode')<>'string'
    OR length(coalesce(v_entry->>'barcode','')) NOT BETWEEN 1 AND 60
    OR (v_entry->>'barcode')~'[[:space:],;]'
    OR jsonb_typeof(v_entry->'quantity')<>'number'
    OR jsonb_typeof(v_entry->'expected_price_minor')<>'number'
    OR jsonb_typeof(v_entry->'expected_units')<>'number'
   THEN RAISE EXCEPTION 'Invalid barcode line' USING errcode='22023';END IF;
   IF (v_entry->>'quantity')!~'^[0-9]{1,6}$'
     OR (v_entry->>'expected_price_minor')!~'^[0-9]{1,10}$'
     OR (v_entry->>'expected_units')!~'^[0-9]{1,6}$'
   THEN RAISE EXCEPTION 'Invalid quantity or expected price' USING errcode='22023';END IF;
   IF (v_entry->>'quantity')::bigint NOT BETWEEN 1 AND 100000
     OR (v_entry->>'expected_price_minor')::bigint>999999999
     OR (v_entry->>'expected_units')::bigint NOT BETWEEN 1 AND 100000
   THEN RAISE EXCEPTION 'Invalid quantity or expected price' USING errcode='22023';END IF;
 END LOOP;
 v_request_payload=jsonb_build_object('items',p_items,'cash_received',p_cash_received);
 INSERT INTO public.retail_sales(store_id,cashier_id,request_id,status,currency,request_payload)
 VALUES(p_store,v_actor,p_request,'draft','IQD',v_request_payload)
 ON CONFLICT(store_id,request_id) DO NOTHING RETURNING id INTO v_sale;
 IF v_sale IS NULL THEN
   SELECT id,status,request_payload,cashier_id
    INTO v_sale,v_prior_status,v_prior_payload,v_prior_actor
   FROM public.retail_sales WHERE store_id=p_store AND request_id=p_request;
   IF v_sale IS NULL OR v_prior_status<>'posted'
     OR v_prior_payload IS DISTINCT FROM v_request_payload
     OR v_prior_actor IS DISTINCT FROM v_actor
   THEN RAISE EXCEPTION 'Checkout request reused with changed actor or payload' USING errcode='23505';END IF;
   RETURN v_sale;
 END IF;

 SELECT id INTO v_cash_session FROM public.retail_cash_sessions
 WHERE store_id=p_store AND cashier_id=v_actor AND status='open' FOR UPDATE;
 IF v_cash_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING errcode='22023';END IF;
 UPDATE public.retail_sales SET cash_session_id=v_cash_session WHERE id=v_sale AND store_id=p_store;

 -- Acquire barcode/product price locks first. Each sale line is priced on
 -- the server. Carton aliases all use the SAME carton price and pack size.
 FOR v_entry IN SELECT value FROM jsonb_array_elements(p_items)
 LOOP
   v_barcode=v_entry->>'barcode';v_qty=(v_entry->>'quantity')::bigint;
   v_expected_price=(v_entry->>'expected_price_minor')::bigint;
   v_expected_units=(v_entry->>'expected_units')::bigint;
   SELECT b.product_id,b.unit_type,b.units_per_scan,p.name,p.active,p.currency,
    CASE WHEN b.unit_type='carton' THEN c.sale_price_minor ELSE p.price_minor END
   INTO v_product,v_pack_type,v_pack_units,v_name,v_pactive,v_currency,v_pack_price
   FROM public.retail_barcodes b
    JOIN public.retail_products p ON p.store_id=b.store_id AND p.id=b.product_id
    LEFT JOIN public.retail_product_cartons c ON c.store_id=b.store_id AND c.product_id=b.product_id
   WHERE b.store_id=p_store AND b.code=v_barcode AND b.active
   FOR SHARE OF b,p;
   IF NOT FOUND OR NOT v_pactive OR v_currency<>'IQD'
      OR v_pack_type NOT IN ('unit','carton')
      OR v_pack_units IS NULL OR v_pack_units<1
      OR v_pack_price IS NULL
      OR (v_pack_type='unit' AND v_pack_units<>1)
      OR v_expected_price<>v_pack_price OR v_expected_units<>v_pack_units
   THEN RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';END IF;
   v_total=v_total+v_qty*v_pack_price;
   IF v_total>9999999999999 THEN RAISE EXCEPTION 'Sale total too large' USING errcode='22023';END IF;
   v_old_units=coalesce((v_need->>v_product::text)::numeric,0);
   v_need=jsonb_set(v_need,array[v_product::text],to_jsonb(v_old_units+v_qty*v_pack_units));
   INSERT INTO public.retail_sale_items(
    store_id,sale_id,product_id,quantity,unit_price_minor,product_name_snapshot,
    package_type,package_barcode,units_per_package,base_units)
   VALUES(p_store,v_sale,v_product,v_qty,v_pack_price,
     v_name||CASE WHEN v_pack_type='carton' THEN ' (کارتۆن)' ELSE ' (دانە)' END,
     v_pack_type,v_barcode,v_pack_units,v_qty*v_pack_units);
 END LOOP;
 IF p_cash_received<v_total THEN RAISE EXCEPTION 'Cash amount is below total' USING errcode='22023';END IF;

 -- Sorted product-level stock locks: mixed unit + carton cannot overdraw stock.
 FOR v_record IN SELECT key AS product_id,value::numeric AS units
                 FROM jsonb_each_text(v_need) ORDER BY key
 LOOP
   SELECT quantity INTO v_stock FROM public.retail_stock_balances
   WHERE store_id=p_store AND product_id=v_record.product_id::uuid FOR UPDATE;
   IF NOT FOUND OR v_stock<v_record.units
   THEN RAISE EXCEPTION 'Insufficient stock' USING errcode='22023';END IF;
   UPDATE public.retail_stock_balances SET
    quantity=quantity-v_record.units,updated_at=now()
   WHERE store_id=p_store AND product_id=v_record.product_id::uuid;
   INSERT INTO public.retail_stock_events(store_id,product_id,delta,reason,sale_id)
   VALUES(p_store,v_record.product_id::uuid,-v_record.units,'sale',v_sale);
 END LOOP;
 INSERT INTO public.retail_receipt_counters(store_id,last_no) VALUES(p_store,1)
 ON CONFLICT(store_id) DO UPDATE SET last_no=public.retail_receipt_counters.last_no+1
 RETURNING last_no INTO v_receipt_number;
 UPDATE public.retail_sales SET status='posted',receipt_no=v_receipt_number,
   total_minor=v_total::bigint,cash_received_minor=p_cash_received,
   change_due_minor=(p_cash_received-v_total)::bigint
 WHERE store_id=p_store AND id=v_sale;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 VALUES(p_store,v_actor,'sale.checkout_packs_v16',v_sale,
   jsonb_build_object('total_iqd',v_total,'cash_iqd',p_cash_received,
    'receipt_no',v_receipt_number,'request_id',p_request,'base_units',v_need));
 RETURN v_sale;
END;
$$;
REVOKE ALL ON FUNCTION public.retail_checkout_packs_v16(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_checkout_packs_v16(uuid,uuid,jsonb,bigint) TO authenticated;
