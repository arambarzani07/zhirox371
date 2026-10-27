-- v19 resolves exact codes and verified prefix 27 five-digit grams scale labels.
-- No list of scale barcodes is materialized: barcode 2700001002451 => 0.245 kg.
CREATE OR REPLACE FUNCTION public.retail_resolve_barcode_v18(p_store uuid,p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid:=(SELECT auth.uid());
 v_code text:=btrim(coalesce(p_code,''));
 v_scale boolean:=false;
 v_grams int;v_weight numeric(14,3);v_i int;v_digit int;v_sum int:=0;
 v_row record;v_stock numeric;v_aliases jsonb;
 v_prefix boolean:=false;v_package_price bigint;
BEGIN
 IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager','cashier'])
 THEN RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501'; END IF;
 IF v_code='' OR length(v_code)>60
 THEN RAISE EXCEPTION 'Invalid barcode' USING ERRCODE='22023'; END IF;
 v_scale:=v_code ~ '^27[0-9]{11}$';
 IF v_scale THEN
   FOR v_i IN 1..12 LOOP
     v_digit:=substring(v_code FROM v_i FOR 1)::int;
     v_sum:=v_sum+v_digit*CASE WHEN v_i%2=0 THEN 3 ELSE 1 END;
   END LOOP;
   IF (10-v_sum%10)%10<>substring(v_code FROM 13 FOR 1)::int
   THEN RETURN jsonb_build_object('found',false,'valid_ean13',false,'has_longer_prefix',false);END IF;
   v_grams:=substring(v_code FROM 8 FOR 5)::int;
   IF v_grams<=0 THEN RETURN jsonb_build_object('found',false);END IF;
   v_weight:=v_grams::numeric/1000;
 END IF;
 SELECT p.id AS product_id,p.name AS product_name,p.sku,p.plu,p.base_unit,
   p.currency,p.price_minor AS unit_price_minor,
   b.code AS registered_code,b.unit_type,b.units_per_scan,b.price_minor,
   p.unit_primary_barcode
 INTO v_row
 FROM public.retail_barcodes b
 JOIN public.retail_products p ON p.id=b.product_id AND p.store_id=b.store_id
 WHERE p.store_id=p_store AND p.active AND b.active
   AND (b.code=v_code OR (v_scale AND p.base_unit='kg' AND b.code=left(v_code,7) AND b.unit_type='unit'))
 ORDER BY (b.code=v_code) DESC LIMIT 1;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('found',false,'has_longer_prefix',false);
 END IF;
 IF v_scale AND v_row.registered_code<>v_code AND v_row.base_unit<>'kg'
 THEN RETURN jsonb_build_object('found',false); END IF;
 IF v_scale AND v_row.registered_code<>v_code THEN
   v_package_price:=round(v_weight*v_row.unit_price_minor)::bigint;
 ELSE
   v_scale:=false;
   v_package_price:=coalesce(v_row.price_minor,v_row.unit_price_minor);
 END IF;
 SELECT coalesce(sb.quantity,0) INTO v_stock FROM public.retail_stock_balances sb
  WHERE sb.store_id=p_store AND sb.product_id=v_row.product_id;
 v_stock:=coalesce(v_stock,0);
 SELECT coalesce(jsonb_agg(jsonb_build_object(
     'code',b.code,'product_id',b.product_id,'unit_type',b.unit_type,
     'units_per_scan',b.units_per_scan,'price_minor',coalesce(b.price_minor,v_row.unit_price_minor),
     'active',b.active
   ) ORDER BY b.code),'[]'::jsonb) INTO v_aliases
 FROM public.retail_barcodes b WHERE b.store_id=p_store
   AND b.product_id=v_row.product_id AND b.active;
 v_prefix:=v_row.base_unit='kg' AND length(v_code)=7;
 RETURN jsonb_build_object(
   'found',true,'code',v_code,'product_id',v_row.product_id,
   'product_name',v_row.product_name,'sku',v_row.sku,'plu',v_row.plu,
   'currency',v_row.currency,'base_unit',v_row.base_unit,
   'unit_type',v_row.unit_type,'unit_price_minor',v_row.unit_price_minor,
   'scale_unit_price_minor',CASE WHEN v_scale THEN v_row.unit_price_minor ELSE NULL END,
   'price_minor',v_package_price,
   'units_per_scan',CASE WHEN v_scale THEN 1 ELSE v_row.units_per_scan END,
   'stock_quantity',v_stock,'product_barcodes',v_aliases,
   'is_scale',v_scale,'scale_grams',CASE WHEN v_scale THEN v_grams ELSE NULL END,
   'scale_weight_kg',CASE WHEN v_scale THEN v_weight ELSE NULL END,
   'scale_label',CASE WHEN v_scale THEN to_char(v_weight,'FM999990.000')||' کگم' ELSE NULL END,
   'has_longer_prefix',v_prefix);
END $fn$;
REVOKE ALL ON FUNCTION public.retail_resolve_barcode_v18(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_resolve_barcode_v18(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';