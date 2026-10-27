-- ZHIROX 371 V14: additive, no product or sale deletion.
ALTER TABLE public.retail_products
  ADD COLUMN IF NOT EXISTS plu text,
  ADD COLUMN IF NOT EXISTS purchase_price_minor bigint,
  ADD COLUMN IF NOT EXISTS sale_mode text NOT NULL DEFAULT 'unit';
ALTER TABLE public.retail_barcodes
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_minor bigint;
CREATE UNIQUE INDEX IF NOT EXISTS retail_products_store_plu_unique
  ON public.retail_products(store_id, plu) WHERE plu IS NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.retail_products'::regclass AND conname='retail_products_purchase_price_valid') THEN
   ALTER TABLE public.retail_products ADD CONSTRAINT retail_products_purchase_price_valid CHECK (purchase_price_minor IS NULL OR purchase_price_minor BETWEEN 0 AND 999999999);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.retail_products'::regclass AND conname='retail_products_sale_mode_valid') THEN
   ALTER TABLE public.retail_products ADD CONSTRAINT retail_products_sale_mode_valid CHECK (sale_mode IN ('unit','carton','both'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.retail_barcodes'::regclass AND conname='retail_barcodes_price_valid') THEN
   ALTER TABLE public.retail_barcodes ADD CONSTRAINT retail_barcodes_price_valid CHECK (price_minor IS NULL OR price_minor BETWEEN 0 AND 999999999);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.retail_product_cartons (
 store_id uuid NOT NULL, product_id uuid NOT NULL, carton_name text, barcode text NOT NULL,
 units_per_carton integer NOT NULL CHECK (units_per_carton BETWEEN 2 AND 100000),
 sale_price_minor bigint NOT NULL CHECK (sale_price_minor BETWEEN 0 AND 999999999),
 purchase_price_minor bigint CHECK (purchase_price_minor IS NULL OR purchase_price_minor BETWEEN 0 AND 999999999),
 PRIMARY KEY (store_id, product_id), UNIQUE (store_id, barcode),
 FOREIGN KEY (store_id, product_id) REFERENCES public.retail_products(store_id,id)
);
ALTER TABLE public.retail_product_cartons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retail_product_cartons FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.retail_product_cartons TO authenticated;
DROP POLICY IF EXISTS retail_product_cartons_read ON public.retail_product_cartons;
CREATE POLICY retail_product_cartons_read ON public.retail_product_cartons
 FOR SELECT TO authenticated
 USING (retail_internal.has_role(store_id, ARRAY['manager','cashier']));

CREATE OR REPLACE FUNCTION public.retail_register_product_v14(p_store_id uuid,p_catalog jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_actor uuid := (select auth.uid());
 v_id uuid;
 v_name text := nullif(btrim(p_catalog->>'name'),'');
 v_mode text := p_catalog->>'sale_mode';
 v_sku text := nullif(btrim(p_catalog->>'sku'),'');
 v_plu text := nullif(btrim(p_catalog->>'plu'),'');
 v_unit_code text := nullif(btrim(p_catalog->>'unit_barcode'),'');
 v_unit_price numeric; v_unit_cost numeric;
 v_carton jsonb := p_catalog->'carton';
 v_carton_code text; v_carton_name text;
 v_carton_price numeric; v_carton_cost numeric; v_carton_units numeric;
 v_code text; v_codes text[] := ARRAY[]::text[];
 v_unit_aliases jsonb := coalesce(p_catalog->'unit_alias_barcodes','[]'::jsonb);
 v_carton_aliases jsonb;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS
   (SELECT 1 FROM public.retail_stores s WHERE s.id=p_store_id AND s.owner_user_id=v_actor)
 THEN RAISE EXCEPTION 'Store not accessible' USING ERRCODE='42501'; END IF;
 IF p_catalog IS NULL OR jsonb_typeof(p_catalog)<>'object' OR v_name IS NULL
   OR length(v_name)>160 OR v_mode IS NULL OR v_mode NOT IN ('unit','carton','both')
   OR (p_catalog->>'currency') IS DISTINCT FROM 'IQD'
   OR length(coalesce(v_sku,''))>80 OR length(coalesce(v_plu,''))>30
 THEN RAISE EXCEPTION 'Invalid catalog identity or mode' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(v_unit_aliases)<>'array' OR jsonb_array_length(v_unit_aliases)>30
 THEN RAISE EXCEPTION 'Invalid unit aliases' USING ERRCODE='22023'; END IF;
 IF v_mode IN ('unit','both') THEN
   IF v_unit_code IS NULL THEN RAISE EXCEPTION 'Unit barcode required' USING ERRCODE='22023'; END IF;
   IF p_catalog->>'unit_sale_price_iqd' IS NULL OR (p_catalog->>'unit_sale_price_iqd') !~ '^[0-9]{1,9}$'
   THEN RAISE EXCEPTION 'Invalid unit sale price' USING ERRCODE='22023'; END IF;
   v_unit_price := (p_catalog->>'unit_sale_price_iqd')::numeric;
   IF p_catalog->>'unit_purchase_price_iqd' IS NOT NULL THEN
     IF (p_catalog->>'unit_purchase_price_iqd') !~ '^[0-9]{1,9}$'
     THEN RAISE EXCEPTION 'Invalid unit purchase price' USING ERRCODE='22023'; END IF;
     v_unit_cost := (p_catalog->>'unit_purchase_price_iqd')::numeric;
   END IF;
   v_codes := array_append(v_codes,v_unit_code);
 ELSIF v_unit_code IS NOT NULL OR jsonb_array_length(v_unit_aliases)<>0
   OR p_catalog->>'unit_sale_price_iqd' IS NOT NULL OR p_catalog->>'unit_purchase_price_iqd' IS NOT NULL
 THEN RAISE EXCEPTION 'Unit fields not allowed in carton mode' USING ERRCODE='22023'; END IF;
 IF v_mode IN ('carton','both') THEN
   IF jsonb_typeof(v_carton)<>'object' THEN RAISE EXCEPTION 'Carton required' USING ERRCODE='22023'; END IF;
   v_carton_code := nullif(btrim(v_carton->>'barcode'),'');
   v_carton_name := nullif(btrim(v_carton->>'name'),'');
   IF length(coalesce(v_carton_name,''))>100 OR v_carton_code IS NULL
     OR v_carton->>'units_per_carton' IS NULL OR (v_carton->>'units_per_carton') !~ '^[0-9]{1,6}$'
     OR v_carton->>'sale_price_iqd' IS NULL OR (v_carton->>'sale_price_iqd') !~ '^[0-9]{1,9}$'
   THEN RAISE EXCEPTION 'Invalid carton fields' USING ERRCODE='22023'; END IF;
   v_carton_units := (v_carton->>'units_per_carton')::numeric;
   v_carton_price := (v_carton->>'sale_price_iqd')::numeric;
   IF v_carton_units<2 OR v_carton_units>100000 THEN RAISE EXCEPTION 'Invalid carton units' USING ERRCODE='22023'; END IF;
   IF v_carton->>'purchase_price_iqd' IS NOT NULL THEN
     IF (v_carton->>'purchase_price_iqd') !~ '^[0-9]{1,9}$'
     THEN RAISE EXCEPTION 'Invalid carton purchase price' USING ERRCODE='22023'; END IF;
     v_carton_cost := (v_carton->>'purchase_price_iqd')::numeric;
   END IF;
   v_carton_aliases := coalesce(v_carton->'alias_barcodes','[]'::jsonb);
   IF jsonb_typeof(v_carton_aliases)<>'array' OR jsonb_array_length(v_carton_aliases)>30
   THEN RAISE EXCEPTION 'Invalid carton aliases' USING ERRCODE='22023'; END IF;
   v_codes := array_append(v_codes,v_carton_code);
 ELSIF v_carton IS NOT NULL AND v_carton<>'null'::jsonb
 THEN RAISE EXCEPTION 'Carton fields not allowed in unit mode' USING ERRCODE='22023'; END IF;
 FOR v_code IN SELECT value FROM jsonb_array_elements_text(v_unit_aliases) AS x(value) LOOP
   v_codes := array_append(v_codes,btrim(v_code));
 END LOOP;
 IF v_mode IN ('carton','both') THEN
   FOR v_code IN SELECT value FROM jsonb_array_elements_text(v_carton_aliases) AS x(value) LOOP
     v_codes := array_append(v_codes,btrim(v_code));
   END LOOP;
 END IF;
 IF EXISTS (SELECT 1 FROM unnest(v_codes) AS x(code) WHERE code IS NULL OR code=''
    OR length(code)>60 OR code ~ '[[:space:],;،]')
    OR (SELECT count(*) FROM unnest(v_codes)) <> (SELECT count(DISTINCT code) FROM unnest(v_codes) AS x(code))
    OR array_length(v_codes,1) IS NULL
 THEN RAISE EXCEPTION 'Invalid or duplicate barcodes' USING ERRCODE='22023'; END IF;
 INSERT INTO public.retail_products
   (store_id,name,sku,plu,price_minor,purchase_price_minor,sale_mode,currency,active)
   VALUES (p_store_id,v_name,v_sku,v_plu,coalesce(v_unit_price,0)::bigint,
      v_unit_cost::bigint,v_mode,'IQD',true)
   RETURNING id INTO v_id;
 IF v_mode IN ('unit','both') THEN
   INSERT INTO public.retail_barcodes(store_id,product_id,code,unit_type,units_per_scan,price_minor,active)
     VALUES (p_store_id,v_id,v_unit_code,'unit',1,v_unit_price::bigint,true);
   FOR v_code IN SELECT value FROM jsonb_array_elements_text(v_unit_aliases) AS x(value) LOOP
     INSERT INTO public.retail_barcodes(store_id,product_id,code,unit_type,units_per_scan,price_minor,active)
       VALUES (p_store_id,v_id,btrim(v_code),'unit',1,v_unit_price::bigint,true);
   END LOOP;
 END IF;
 IF v_mode IN ('carton','both') THEN
   INSERT INTO public.retail_product_cartons
     (store_id,product_id,carton_name,barcode,units_per_carton,purchase_price_minor,sale_price_minor)
     VALUES (p_store_id,v_id,v_carton_name,v_carton_code,v_carton_units::int,
       v_carton_cost::bigint,v_carton_price::bigint);
   INSERT INTO public.retail_barcodes(store_id,product_id,code,unit_type,units_per_scan,price_minor,active)
     VALUES (p_store_id,v_id,v_carton_code,'carton',v_carton_units,v_carton_price::bigint,true);
   FOR v_code IN SELECT value FROM jsonb_array_elements_text(v_carton_aliases) AS x(value) LOOP
     INSERT INTO public.retail_barcodes(store_id,product_id,code,unit_type,units_per_scan,price_minor,active)
       VALUES (p_store_id,v_id,btrim(v_code),'carton',v_carton_units,v_carton_price::bigint,true);
   END LOOP;
 END IF;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
   VALUES (p_store_id,v_actor,'product.register_v14',v_id,jsonb_build_object('after',p_catalog));
 RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.retail_register_product_v14(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_register_product_v14(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
