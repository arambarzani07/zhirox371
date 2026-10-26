-- V14: isolated local QA schema and atomic product registration.
-- NOT a Supabase migration. NEVER apply to a hosted project.
-- Product identities, all barcodes, costs and pack-specific prices belong
-- to Products. The existing cashier checkout remains unit-only.
ALTER TABLE public.retail_products
 ADD COLUMN sku text,
 ADD COLUMN plu text,
 ADD COLUMN purchase_price_minor bigint CHECK(purchase_price_minor>=0);

CREATE TABLE public.retail_product_cartons(
 store_id uuid NOT NULL,
 product_id uuid NOT NULL,
 carton_name text,
 barcode text NOT NULL,
 units_per_carton integer NOT NULL CHECK(units_per_carton>=2 AND units_per_carton<=100000),
 purchase_price_minor bigint CHECK(purchase_price_minor>=0),
 sale_price_minor bigint NOT NULL CHECK(sale_price_minor>=0),
 PRIMARY KEY(store_id,product_id),
 FOREIGN KEY(store_id,product_id) REFERENCES public.retail_products(store_id,id),
 UNIQUE(store_id,barcode)
);
ALTER TABLE public.retail_product_cartons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retail_product_cartons FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.retail_product_cartons TO authenticated;
CREATE POLICY retail_carton_owner_manager_view ON public.retail_product_cartons FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager']));
-- Never expose pack purchase costs to cashiers via direct SELECT.

CREATE OR REPLACE FUNCTION public.retail_register_product_v14(p_store_id uuid,p_catalog jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_actor uuid:=(select auth.uid());
 v_product uuid;
 v_name text;
 v_sale_mode text;
 v_unit_code text;
 v_alias text;
 v_cost bigint;
 v_unit_price numeric;
 v_raw_cost numeric;
 v_carton jsonb;
 v_carton_code text;
 v_carton_units numeric;
 v_carton_price numeric;
 v_carton_cost numeric;
 v_carton_name text;
 v_aliases jsonb;
 v_carton_aliases jsonb;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.retail_stores WHERE id=p_store_id AND owner_user_id=v_actor)
 THEN RAISE EXCEPTION 'Owner permission required' USING errcode='42501';END IF;
 IF p_catalog IS NULL OR jsonb_typeof(p_catalog)<>'object'
 THEN RAISE EXCEPTION 'Invalid catalog payload' USING errcode='22023';END IF;
 IF p_catalog->>'currency' IS DISTINCT FROM 'IQD'
 THEN RAISE EXCEPTION 'IQD catalog required' USING errcode='22023';END IF;
 v_sale_mode=coalesce(p_catalog->>'sale_mode',CASE WHEN p_catalog->'carton' IS NOT NULL AND jsonb_typeof(p_catalog->'carton')<>'null' THEN 'both' ELSE 'unit' END);
 IF v_sale_mode NOT IN ('unit','carton','both') THEN
  RAISE EXCEPTION 'Invalid sale mode' USING errcode='22023';END IF;
 v_name=nullif(btrim(p_catalog->>'name'),'');
 v_unit_code=nullif(btrim(p_catalog->>'unit_barcode'),'');
 IF v_name IS NULL OR length(v_name)>160 OR (v_sale_mode<>'carton' AND v_unit_code IS NULL)
    OR length(v_unit_code)>60 OR v_unit_code~'[[:space:],;]'
 THEN RAISE EXCEPTION 'Invalid item name or barcode' USING errcode='22023';END IF;
 IF v_sale_mode='carton' THEN
  IF v_unit_code IS NOT NULL OR jsonb_array_length(coalesce(p_catalog->'unit_alias_barcodes','[]'::jsonb))>0
     OR (p_catalog->'unit_purchase_price_iqd' IS NOT NULL AND jsonb_typeof(p_catalog->'unit_purchase_price_iqd')<>'null')
  THEN RAISE EXCEPTION 'Carton-only must not include unit barcodes or costs' USING errcode='22023';END IF;
  v_unit_price=0;
 ELSE
  IF jsonb_typeof(p_catalog->'unit_sale_price_iqd')<>'number'
  THEN RAISE EXCEPTION 'Missing unit sale price' USING errcode='22023';END IF;
  v_unit_price=(p_catalog->>'unit_sale_price_iqd')::numeric;
 END IF;
 IF v_unit_price<0 OR v_unit_price>999999999 OR v_unit_price<>trunc(v_unit_price)
 THEN RAISE EXCEPTION 'Invalid unit price' USING errcode='22023';END IF;
 IF jsonb_typeof(p_catalog->'unit_purchase_price_iqd')='number' THEN
   v_raw_cost=(p_catalog->>'unit_purchase_price_iqd')::numeric;
   IF v_raw_cost<0 OR v_raw_cost>999999999 OR v_raw_cost<>trunc(v_raw_cost)
   THEN RAISE EXCEPTION 'Invalid unit cost' USING errcode='22023';END IF;
   v_cost=v_raw_cost::bigint;
 ELSIF p_catalog->'unit_purchase_price_iqd' IS NOT NULL AND
       jsonb_typeof(p_catalog->'unit_purchase_price_iqd')<>'null'
 THEN RAISE EXCEPTION 'Invalid unit cost type' USING errcode='22023';END IF;
 IF length(coalesce(p_catalog->>'sku',''))>80 OR length(coalesce(p_catalog->>'plu',''))>30
 THEN RAISE EXCEPTION 'Invalid SKU or PLU' USING errcode='22023';END IF;
 v_aliases=p_catalog->'unit_alias_barcodes';
 IF v_aliases IS NULL OR jsonb_typeof(v_aliases)<>'array'
    OR jsonb_array_length(v_aliases)>30
 THEN RAISE EXCEPTION 'Invalid unit aliases' USING errcode='22023';END IF;
 v_carton=p_catalog->'carton';
 IF (v_sale_mode='unit' AND v_carton IS NOT NULL AND jsonb_typeof(v_carton)<>'null')
    OR (v_sale_mode IN ('carton','both') AND (v_carton IS NULL OR jsonb_typeof(v_carton)='null'))
 THEN RAISE EXCEPTION 'Sale mode carton definition mismatch' USING errcode='22023';END IF;
 IF v_carton IS NOT NULL AND jsonb_typeof(v_carton)<>'null' THEN
  IF jsonb_typeof(v_carton)<>'object' OR jsonb_typeof(v_carton->'units_per_carton')<>'number'
     OR jsonb_typeof(v_carton->'sale_price_iqd')<>'number'
  THEN RAISE EXCEPTION 'Invalid carton definition' USING errcode='22023';END IF;
  v_carton_aliases=coalesce(v_carton->'alias_barcodes','[]'::jsonb);
  IF jsonb_typeof(v_carton_aliases)<>'array'
     OR jsonb_array_length(v_carton_aliases)>30
  THEN RAISE EXCEPTION 'Invalid carton aliases' USING errcode='22023';END IF;
  v_carton_code=nullif(btrim(v_carton->>'barcode'),'');
  v_carton_name=nullif(btrim(v_carton->>'name'),'');
  v_carton_units=(v_carton->>'units_per_carton')::numeric;
  v_carton_price=(v_carton->>'sale_price_iqd')::numeric;
  IF v_carton_code IS NULL OR length(v_carton_code)>60 OR v_carton_code~'[[:space:],;]'
     OR length(coalesce(v_carton_name,''))>100
     OR v_carton_units<2 OR v_carton_units>100000 OR v_carton_units<>trunc(v_carton_units)
     OR v_carton_price<0 OR v_carton_price>999999999 OR v_carton_price<>trunc(v_carton_price)
  THEN RAISE EXCEPTION 'Invalid carton barcode, quantity or price' USING errcode='22023';END IF;
  IF jsonb_typeof(v_carton->'purchase_price_iqd')='number' THEN
    v_carton_cost=(v_carton->>'purchase_price_iqd')::numeric;
    IF v_carton_cost<0 OR v_carton_cost>999999999 OR v_carton_cost<>trunc(v_carton_cost)
    THEN RAISE EXCEPTION 'Invalid carton cost' USING errcode='22023';END IF;
  ELSIF v_carton->'purchase_price_iqd' IS NOT NULL AND jsonb_typeof(v_carton->'purchase_price_iqd')<>'null'
  THEN RAISE EXCEPTION 'Invalid carton cost' USING errcode='22023';END IF;
 END IF;

 INSERT INTO public.retail_products(store_id,name,sku,plu,price_minor,purchase_price_minor,currency,active)
 VALUES(p_store_id,v_name,nullif(p_catalog->>'sku',''),nullif(p_catalog->>'plu',''),
        v_unit_price::bigint,v_cost,'IQD',true) RETURNING id INTO v_product;

 IF v_sale_mode<>'carton' THEN
  INSERT INTO public.retail_barcodes(store_id,product_id,code,unit_type,units_per_scan)
  VALUES(p_store_id,v_product,v_unit_code,'unit',1);
 END IF;

 FOR v_alias IN SELECT value FROM jsonb_array_elements_text(v_aliases)
 LOOP
   IF v_alias IS NULL OR length(v_alias)<1 OR length(v_alias)>60 OR v_alias~'[[:space:],;]'
   THEN RAISE EXCEPTION 'Invalid alias barcode' USING errcode='22023';END IF;
   INSERT INTO public.retail_barcodes(store_id,product_id,code,unit_type,units_per_scan)
   VALUES(p_store_id,v_product,v_alias,'unit',1);
 END LOOP;

 IF v_carton_code IS NOT NULL THEN
   INSERT INTO public.retail_barcodes(store_id,product_id,code,unit_type,units_per_scan)
   VALUES(p_store_id,v_product,v_carton_code,'carton',v_carton_units::integer);
   INSERT INTO public.retail_product_cartons(
    store_id,product_id,carton_name,barcode,units_per_carton,purchase_price_minor,sale_price_minor)
   VALUES(p_store_id,v_product,v_carton_name,v_carton_code,
          v_carton_units::integer,v_carton_cost::bigint,v_carton_price::bigint);
   -- Carton aliases share the SAME product, pack size and pack price.
   FOR v_alias IN SELECT value FROM jsonb_array_elements_text(v_carton_aliases)
   LOOP
     IF v_alias IS NULL OR length(v_alias)<1 OR length(v_alias)>60
        OR v_alias~'[[:space:],;]'
     THEN RAISE EXCEPTION 'Invalid carton alias barcode' USING errcode='22023';END IF;
     INSERT INTO public.retail_barcodes(store_id,product_id,code,unit_type,units_per_scan)
     VALUES(p_store_id,v_product,v_alias,'carton',v_carton_units::integer);
   END LOOP;
 END IF;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 VALUES(p_store_id,v_actor,'product.register_v14',v_product,
        jsonb_build_object('barcodes',(v_sale_mode<>'carton')::int+jsonb_array_length(v_aliases)
       +(v_carton_code IS NOT NULL)::int
       +CASE WHEN v_carton_code IS NOT NULL THEN jsonb_array_length(v_carton_aliases) ELSE 0 END));
 RETURN v_product;
END;
$fn$;
REVOKE ALL ON FUNCTION public.retail_register_product_v14(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_register_product_v14(uuid,jsonb) TO authenticated;
