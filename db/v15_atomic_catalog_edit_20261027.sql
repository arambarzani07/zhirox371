-- ZHIROX371 V15 product editor: atomic, owner-only, optimistic concurrency.
-- Preserves historic products, stock, receipts and retired barcode records.
ALTER TABLE public.retail_products
  ADD COLUMN IF NOT EXISTS catalog_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_primary_barcode text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.retail_products'::regclass
      AND conname='retail_products_catalog_version_positive'
  ) THEN
    ALTER TABLE public.retail_products
      ADD CONSTRAINT retail_products_catalog_version_positive CHECK(catalog_version>=1);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION retail_internal.product_snapshot_v15(
  p_store_id uuid,p_product_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE
  v_p public.retail_products%ROWTYPE;
  v_primary text;
  v_aliases jsonb;
  v_carton jsonb;
  v_carton_code text;
  v_carton_aliases jsonb;
  v_c public.retail_product_cartons%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.retail_stores s WHERE s.id=p_store_id AND s.owner_user_id=(SELECT auth.uid()))
  THEN RAISE EXCEPTION 'Owner permission required' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_p FROM public.retail_products p WHERE p.store_id=p_store_id AND p.id=p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='22023'; END IF;

  SELECT b.code INTO v_primary
    FROM public.retail_barcodes b
    WHERE b.store_id=p_store_id AND b.product_id=p_product_id AND b.unit_type='unit'
      AND b.active=true
    ORDER BY
      (b.code=v_p.unit_primary_barcode) DESC NULLS LAST,
      (b.code=v_p.sku) DESC NULLS LAST,b.code LIMIT 1;
  SELECT COALESCE(jsonb_agg(b.code ORDER BY b.code),'[]'::jsonb) INTO v_aliases
    FROM public.retail_barcodes b
    WHERE b.store_id=p_store_id AND b.product_id=p_product_id AND b.unit_type='unit'
      AND b.active=true AND b.code IS DISTINCT FROM v_primary;

  v_carton:=NULL;
  IF v_p.sale_mode IN ('carton','both') THEN
    SELECT * INTO v_c FROM public.retail_product_cartons c
      WHERE c.store_id=p_store_id AND c.product_id=p_product_id;
    IF FOUND THEN
      v_carton_code:=v_c.barcode;
      SELECT COALESCE(jsonb_agg(b.code ORDER BY b.code),'[]'::jsonb) INTO v_carton_aliases
        FROM public.retail_barcodes b
        WHERE b.store_id=p_store_id AND b.product_id=p_product_id AND b.unit_type='carton'
          AND b.active=true AND b.code<>v_carton_code;
      v_carton:=jsonb_build_object(
        'name',v_c.carton_name,'barcode',v_carton_code,
        'alias_barcodes',v_carton_aliases,
        'units_per_carton',v_c.units_per_carton,
        'sale_price_iqd',v_c.sale_price_minor,
        'purchase_price_iqd',v_c.purchase_price_minor
      );
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'id',v_p.id,'version',v_p.catalog_version,'name',v_p.name,
    'sku',v_p.sku,'plu',v_p.plu,'sale_mode',v_p.sale_mode,
    'currency',v_p.currency,'unit_barcode',v_primary,
    'unit_alias_barcodes',v_aliases,
    'unit_sale_price_iqd',CASE WHEN v_p.sale_mode IN ('unit','both') THEN v_p.price_minor ELSE NULL END,
    'unit_purchase_price_iqd',v_p.purchase_price_minor,
    'carton',v_carton
  );
END $body$;
REVOKE ALL ON FUNCTION retail_internal.product_snapshot_v15(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION retail_internal.product_snapshot_v15(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_product_snapshot_v15(
  p_store_id uuid,p_product_id uuid
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $body$ SELECT retail_internal.product_snapshot_v15(p_store_id,p_product_id); $body$;
REVOKE ALL ON FUNCTION public.retail_product_snapshot_v15(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_product_snapshot_v15(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION retail_internal.update_product_v15(
  p_store_id uuid,p_product_id uuid,p_expected_version bigint,p_catalog jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE
 v_p public.retail_products%ROWTYPE;
 v_before jsonb;
 v_after jsonb;
 v_name text;v_sku text;v_plu text;v_mode text;
 v_unit_code text; v_unit_price bigint; v_unit_cost bigint;
 v_ca jsonb;v_u_aliases jsonb;v_c_aliases jsonb;
 v_c_code text;v_c_name text;v_c_units integer;v_c_price bigint;v_c_cost bigint;
 v_code text;v_code_list text[]:=ARRAY[]::text[];v_unit_codes text[]:=ARRAY[]::text[];v_carton_codes text[]:=ARRAY[]::text[];
 v_in text;v_units_string text;
BEGIN
 IF (SELECT auth.uid()) IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.retail_stores s
     WHERE s.id=p_store_id AND s.owner_user_id=(SELECT auth.uid()))
 THEN RAISE EXCEPTION 'Owner permission required' USING ERRCODE='42501'; END IF;
 IF p_expected_version IS NULL OR p_expected_version<1 THEN
   RAISE EXCEPTION 'Expected version required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_p FROM public.retail_products p
    WHERE p.store_id=p_store_id AND p.id=p_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='22023'; END IF;
 IF v_p.catalog_version<>p_expected_version THEN
   RAISE EXCEPTION 'Product version changed' USING ERRCODE='40001'; END IF;
 IF p_catalog IS NULL OR jsonb_typeof(p_catalog) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'Catalog required' USING ERRCODE='22023'; END IF;

 v_name:=NULLIF(btrim(p_catalog->>'name'),'');
 v_sku:=NULLIF(btrim(p_catalog->>'sku'),'');
 v_plu:=NULLIF(btrim(p_catalog->>'plu'),'');
 v_mode:=p_catalog->>'sale_mode';
 v_unit_code:=NULLIF(btrim(p_catalog->>'unit_barcode'),'');
 v_ca:=p_catalog->'carton';
 v_u_aliases:=COALESCE(p_catalog->'unit_alias_barcodes','[]'::jsonb);
 IF v_name IS NULL OR length(v_name)>160 OR length(COALESCE(v_sku,''))>80
    OR length(COALESCE(v_plu,''))>30
    OR v_mode NOT IN ('unit','carton','both') OR v_mode IS NULL
    OR p_catalog->>'currency' IS DISTINCT FROM 'IQD'
    OR jsonb_typeof(v_u_aliases) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_u_aliases)>30
 THEN RAISE EXCEPTION 'Invalid catalog identity' USING ERRCODE='22023'; END IF;
 IF v_mode IN ('unit','both') THEN
   v_in:=p_catalog->>'unit_sale_price_iqd';
   IF v_unit_code IS NULL OR v_in IS NULL OR v_in !~ '^[0-9]{1,9}$'
   THEN RAISE EXCEPTION 'Invalid unit barcode or price' USING ERRCODE='22023'; END IF;
   v_unit_price:=v_in::bigint;
   v_in:=p_catalog->>'unit_purchase_price_iqd';
   IF v_in IS NOT NULL AND v_in !~ '^[0-9]{1,9}$'
   THEN RAISE EXCEPTION 'Invalid unit purchase price' USING ERRCODE='22023'; END IF;
   v_unit_cost:=v_in::bigint;
   v_unit_codes:=ARRAY[v_unit_code];
 ELSIF v_unit_code IS NOT NULL OR jsonb_array_length(v_u_aliases)>0
   OR p_catalog->>'unit_sale_price_iqd' IS NOT NULL
   OR p_catalog->>'unit_purchase_price_iqd' IS NOT NULL
 THEN RAISE EXCEPTION 'Unit fields incompatible with carton-only mode' USING ERRCODE='22023'; END IF;

 IF v_mode IN ('carton','both') THEN
   IF jsonb_typeof(v_ca) IS DISTINCT FROM 'object' THEN
     RAISE EXCEPTION 'Carton details required' USING ERRCODE='22023'; END IF;
   v_c_code:=NULLIF(btrim(v_ca->>'barcode'),'');
   v_c_name:=NULLIF(btrim(v_ca->>'name'),'');
   v_units_string:=v_ca->>'units_per_carton';
   v_in:=v_ca->>'sale_price_iqd';
   IF v_c_code IS NULL OR length(COALESCE(v_c_name,''))>100
     OR v_units_string IS NULL OR v_units_string !~ '^[0-9]{1,6}$'
     OR v_in IS NULL OR v_in !~ '^[0-9]{1,9}$'
   THEN RAISE EXCEPTION 'Invalid carton details' USING ERRCODE='22023'; END IF;
   v_c_units:=v_units_string::integer;
   IF v_c_units<2 OR v_c_units>100000 THEN
     RAISE EXCEPTION 'Invalid carton size' USING ERRCODE='22023'; END IF;
   v_c_price:=v_in::bigint;
   v_in:=v_ca->>'purchase_price_iqd';
   IF v_in IS NOT NULL AND v_in !~ '^[0-9]{1,9}$'
   THEN RAISE EXCEPTION 'Invalid carton purchase price' USING ERRCODE='22023'; END IF;
   v_c_cost:=v_in::bigint;
   v_c_aliases:=COALESCE(v_ca->'alias_barcodes','[]'::jsonb);
   IF jsonb_typeof(v_c_aliases) IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_c_aliases)>30
   THEN RAISE EXCEPTION 'Invalid carton aliases' USING ERRCODE='22023'; END IF;
   v_carton_codes:=ARRAY[v_c_code];
 ELSIF v_ca IS NOT NULL AND v_ca<>'null'::jsonb
 THEN RAISE EXCEPTION 'Carton fields incompatible with unit-only mode' USING ERRCODE='22023'; END IF;

 FOR v_in IN SELECT value FROM jsonb_array_elements_text(v_u_aliases) AS x(value) LOOP
   v_unit_codes:=array_append(v_unit_codes,btrim(v_in));
 END LOOP;
 IF v_mode IN ('carton','both') THEN
   FOR v_in IN SELECT value FROM jsonb_array_elements_text(v_c_aliases) AS x(value) LOOP
     v_carton_codes:=array_append(v_carton_codes,btrim(v_in));
   END LOOP;
 END IF;
 v_code_list:=v_unit_codes||v_carton_codes;
 IF cardinality(v_code_list)<1 OR EXISTS(
      SELECT 1 FROM unnest(v_code_list) AS x(code)
      WHERE code IS NULL OR code='' OR length(code)>60 OR code~'[[:space:],;،]'
   ) OR cardinality(v_code_list)<>(SELECT COUNT(DISTINCT code) FROM unnest(v_code_list) x(code))
 THEN RAISE EXCEPTION 'Invalid or duplicate barcodes' USING ERRCODE='22023'; END IF;

 -- Prevent binding this product to another product's retired or current codes.
 IF EXISTS(SELECT 1 FROM public.retail_barcodes b
    WHERE b.store_id=p_store_id AND b.code=ANY(v_code_list) AND b.product_id<>p_product_id)
 THEN RAISE EXCEPTION 'Barcode already used by another product' USING ERRCODE='23505'; END IF;
 v_before:=retail_internal.product_snapshot_v15(p_store_id,p_product_id);

 UPDATE public.retail_products SET
   name=v_name,sku=v_sku,plu=v_plu,sale_mode=v_mode,
   price_minor=COALESCE(v_unit_price,0),
   purchase_price_minor=v_unit_cost,
   unit_primary_barcode=CASE WHEN v_mode IN ('unit','both') THEN v_unit_code ELSE NULL END,
   catalog_version=catalog_version+1
 WHERE id=p_product_id AND store_id=p_store_id;

 -- Retire old barcode rows, never delete them: historic receipts remain intact.
 UPDATE public.retail_barcodes SET active=false
 WHERE store_id=p_store_id AND product_id=p_product_id AND active=true;

 FOREACH v_code IN ARRAY v_unit_codes LOOP
   INSERT INTO public.retail_barcodes
      (store_id,product_id,code,unit_type,units_per_scan,price_minor,active)
   VALUES(p_store_id,p_product_id,v_code,'unit',1,v_unit_price,true)
   ON CONFLICT (store_id,code) DO UPDATE SET
     unit_type='unit',units_per_scan=1,price_minor=excluded.price_minor,active=true
     WHERE public.retail_barcodes.product_id=excluded.product_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Barcode conflicts with another product' USING ERRCODE='23505'; END IF;
 END LOOP;

 IF v_mode IN ('carton','both') THEN
   INSERT INTO public.retail_product_cartons
      (store_id,product_id,carton_name,barcode,units_per_carton,purchase_price_minor,sale_price_minor)
   VALUES(p_store_id,p_product_id,v_c_name,v_c_code,v_c_units,v_c_cost,v_c_price)
   ON CONFLICT (store_id,product_id) DO UPDATE SET
      carton_name=excluded.carton_name,barcode=excluded.barcode,
      units_per_carton=excluded.units_per_carton,purchase_price_minor=excluded.purchase_price_minor,
      sale_price_minor=excluded.sale_price_minor;
   FOREACH v_code IN ARRAY v_carton_codes LOOP
     INSERT INTO public.retail_barcodes
       (store_id,product_id,code,unit_type,units_per_scan,price_minor,active)
     VALUES(p_store_id,p_product_id,v_code,'carton',v_c_units,v_c_price,true)
     ON CONFLICT (store_id,code) DO UPDATE SET
       unit_type='carton',units_per_scan=excluded.units_per_scan,
       price_minor=excluded.price_minor,active=true
       WHERE public.retail_barcodes.product_id=excluded.product_id;
     IF NOT FOUND THEN RAISE EXCEPTION 'Carton barcode conflicts with another product' USING ERRCODE='23505'; END IF;
   END LOOP;
 END IF;
 v_after:=retail_internal.product_snapshot_v15(p_store_id,p_product_id);
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 VALUES (p_store_id,(SELECT auth.uid()),'product.update_v15',p_product_id,
   jsonb_build_object('before',v_before,'after',v_after));
 RETURN v_after;
END $body$;
REVOKE ALL ON FUNCTION retail_internal.update_product_v15(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION retail_internal.update_product_v15(uuid,uuid,bigint,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_update_product_v15(
 p_store_id uuid,p_product_id uuid,p_expected_version bigint,p_catalog jsonb
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $body$
 SELECT retail_internal.update_product_v15(p_store_id,p_product_id,p_expected_version,p_catalog);
$body$;
REVOKE ALL ON FUNCTION public.retail_update_product_v15(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_update_product_v15(uuid,uuid,bigint,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION retail_internal.product_history_v15(p_store_id uuid,p_product_id uuid)
RETURNS TABLE(created_at timestamptz,actor_id uuid,action text,details jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $body$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
     SELECT 1 FROM public.retail_stores s
     WHERE s.id=p_store_id AND s.owner_user_id=(SELECT auth.uid()))
 THEN RAISE EXCEPTION 'Owner permission required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT e.created_at,e.actor_id,e.action,e.details
 FROM public.retail_audit_events e
 WHERE e.store_id=p_store_id AND e.subject_id=p_product_id
   AND e.action IN ('product.register_v14','product.update_v15')
 ORDER BY e.created_at DESC LIMIT 200;
END $body$;
REVOKE ALL ON FUNCTION retail_internal.product_history_v15(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION retail_internal.product_history_v15(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_product_history_v15(p_store_id uuid,p_product_id uuid)
RETURNS TABLE(created_at timestamptz,actor_id uuid,action text,details jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $body$
 SELECT h.created_at,h.actor_id,h.action,h.details
 FROM retail_internal.product_history_v15(p_store_id,p_product_id) h;
$body$;
REVOKE ALL ON FUNCTION public.retail_product_history_v15(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_product_history_v15(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';