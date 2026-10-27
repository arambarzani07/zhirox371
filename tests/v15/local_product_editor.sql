-- V15 ISOLATED LOCAL SUPABASE ONLY. Never run on hosted databases.
-- Amend registered items atomically, preserve prior sales and immutable audit.
ALTER TABLE public.retail_products
 ADD COLUMN catalog_version integer NOT NULL DEFAULT 1 CHECK (catalog_version>=1),
 ADD COLUMN unit_primary_barcode text;
ALTER TABLE public.retail_barcodes
 ADD COLUMN active boolean NOT NULL DEFAULT true;

-- Owner-only read: product purchase costs cannot be exposed through this endpoint.
CREATE FUNCTION public.retail_product_snapshot_v15(p_store_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_product public.retail_products%rowtype;
        v_carton public.retail_product_cartons%rowtype;
        v_unit_code text; v_aliases jsonb; v_carton_aliases jsonb;
BEGIN
 IF (select auth.uid()) IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.retail_stores WHERE id=p_store_id AND owner_user_id=(select auth.uid()))
 THEN RAISE EXCEPTION 'Owner permission required' USING errcode='42501';END IF;
 SELECT * INTO v_product FROM public.retail_products WHERE id=p_product_id AND store_id=p_store_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING errcode='22023';END IF;
 SELECT * INTO v_carton FROM public.retail_product_cartons
  WHERE store_id=p_store_id AND product_id=p_product_id;
 SELECT coalesce(v_product.unit_primary_barcode,
                 (SELECT min(code) FROM public.retail_barcodes
                  WHERE store_id=p_store_id AND product_id=p_product_id
                    AND unit_type='unit' AND active)) INTO v_unit_code;
 SELECT coalesce(jsonb_agg(code ORDER BY code),'[]'::jsonb) INTO v_aliases
 FROM public.retail_barcodes WHERE store_id=p_store_id AND product_id=p_product_id
   AND active AND unit_type='unit' AND code IS DISTINCT FROM v_unit_code;
 SELECT coalesce(jsonb_agg(code ORDER BY code),'[]'::jsonb) INTO v_carton_aliases
 FROM public.retail_barcodes WHERE store_id=p_store_id AND product_id=p_product_id
   AND active AND unit_type='carton' AND code IS DISTINCT FROM v_carton.barcode;
 RETURN jsonb_build_object(
  'id',v_product.id,'version',v_product.catalog_version,
  'sale_mode',CASE WHEN v_carton.product_id IS NOT NULL AND v_unit_code IS NOT NULL THEN 'both' WHEN v_carton.product_id IS NOT NULL THEN 'carton' ELSE 'unit' END,
  'name',v_product.name,'sku',v_product.sku,'plu',v_product.plu,
  'unit_barcode',coalesce(v_unit_code,''),
  'unit_alias_barcodes',v_aliases,
  'unit_purchase_price_iqd',CASE WHEN v_unit_code IS NULL AND v_carton.product_id IS NOT NULL THEN NULL ELSE v_product.purchase_price_minor END,
  'unit_sale_price_iqd',CASE WHEN v_unit_code IS NULL AND v_carton.product_id IS NOT NULL THEN NULL ELSE v_product.price_minor END,'currency',v_product.currency,
  'carton',CASE WHEN v_carton.product_id IS NULL THEN 'null'::jsonb
    ELSE jsonb_build_object('name',v_carton.carton_name,'barcode',v_carton.barcode,
      'alias_barcodes',v_carton_aliases,
      'units_per_carton',v_carton.units_per_carton,
      'purchase_price_iqd',v_carton.purchase_price_minor,
      'sale_price_iqd',v_carton.sale_price_minor) END
 );
END;
$$;

CREATE FUNCTION public.retail_product_history_v15(p_store_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 IF (select auth.uid()) IS NULL OR NOT EXISTS(
 SELECT 1 FROM public.retail_stores WHERE id=p_store_id AND owner_user_id=(select auth.uid()))
 THEN RAISE EXCEPTION 'Owner permission required' USING errcode='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'actor_id',actor_id,
    'action',action,'created_at',created_at,'details',details) ORDER BY created_at DESC),'[]'::jsonb)
 FROM (SELECT id,actor_id,action,created_at,details FROM public.retail_audit_events
 WHERE store_id=p_store_id AND subject_id=p_product_id
  AND action IN ('product.update_v15','product.register_v14')
 ORDER BY created_at DESC LIMIT 50) AS events);
END;
$$;

-- SECURITY DEFINER because the normal client has no write grants for the
-- protected ledger/audit; explicit owner ACL and optimistic revision are enforced.
CREATE FUNCTION public.retail_update_product_v15(
 p_store_id uuid,p_product_id uuid,p_expected_version integer,p_catalog jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
 v_owner uuid:=(select auth.uid());
 v_old jsonb;v_new jsonb;v_actual_version integer;
 v_name text;v_sku text;v_plu text;v_unit_code text;v_sale_mode text;
 v_unit_price numeric;v_unit_cost numeric;v_carton_price numeric;v_carton_cost numeric;
 v_carton jsonb;v_carton_code text;v_carton_name text;v_units numeric;
 v_unit_aliases jsonb;v_carton_aliases jsonb;
 v_codes text[]:=array[]::text[];v_alias text;
 v_carton_codes text[]:=array[]::text[];
BEGIN
 IF v_owner IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.retail_stores WHERE id=p_store_id AND owner_user_id=v_owner)
 THEN RAISE EXCEPTION 'Owner permission required' USING errcode='42501';END IF;
 IF p_expected_version IS NULL OR p_expected_version<1
 THEN RAISE EXCEPTION 'Invalid expected version' USING errcode='22023';END IF;
 PERFORM 1 FROM public.retail_products WHERE store_id=p_store_id
   AND id=p_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING errcode='22023';END IF;
 SELECT catalog_version INTO v_actual_version FROM public.retail_products
  WHERE store_id=p_store_id AND id=p_product_id;
 IF v_actual_version<>p_expected_version
 THEN RAISE EXCEPTION 'Stale catalog revision' USING errcode='40001';END IF;
 v_old=public.retail_product_snapshot_v15(p_store_id,p_product_id);
 IF p_catalog IS NULL OR jsonb_typeof(p_catalog)<>'object'
    OR p_catalog->>'currency' IS DISTINCT FROM 'IQD'
 THEN RAISE EXCEPTION 'Invalid catalog payload' USING errcode='22023';END IF;
 v_sale_mode=coalesce(p_catalog->>'sale_mode',CASE WHEN p_catalog->'carton' IS NOT NULL AND jsonb_typeof(p_catalog->'carton')<>'null' THEN 'both' ELSE 'unit' END);
 IF v_sale_mode NOT IN ('unit','carton','both') THEN RAISE EXCEPTION 'Invalid sale mode' USING errcode='22023';END IF;
 v_name=nullif(btrim(p_catalog->>'name'),'');
 v_sku=nullif(btrim(p_catalog->>'sku'),'');
 v_plu=nullif(btrim(p_catalog->>'plu'),'');
 v_unit_code=nullif(btrim(p_catalog->>'unit_barcode'),'');
 IF v_sale_mode='unit' AND v_unit_code IS NULL THEN
   IF v_plu IS NULL OR v_plu !~ '^[0-9]{1,5}$'
   THEN RAISE EXCEPTION 'Scale item requires 1..5 digit PLU' USING errcode='22023';END IF;
   IF v_plu::integer=0
   THEN RAISE EXCEPTION 'Scale PLU 00000 is invalid' USING errcode='22023';END IF;
   v_plu=lpad(v_plu,5,'0');
 END IF;
 IF v_unit_code ~ '^27[0-9]{5}$'
 THEN RAISE EXCEPTION 'Incomplete scale barcode must not be a unit code' USING errcode='22023';END IF;
 IF v_name IS NULL OR length(v_name)>160
   OR length(coalesce(v_sku,''))>80 OR length(coalesce(v_plu,''))>30
   OR (v_sale_mode='both' AND v_unit_code IS NULL)
   OR length(v_unit_code)>60 OR v_unit_code~'[[:space:],;]'
 THEN RAISE EXCEPTION 'Invalid item identity' USING errcode='22023';END IF;
 IF v_sale_mode='carton' THEN
  IF v_unit_code IS NOT NULL THEN RAISE EXCEPTION 'Unit barcode not allowed' USING errcode='22023';END IF;
  v_unit_price=0;
 ELSE
  IF jsonb_typeof(p_catalog->'unit_sale_price_iqd')<>'number'
  THEN RAISE EXCEPTION 'Missing unit price' USING errcode='22023';END IF;
  v_unit_price=(p_catalog->>'unit_sale_price_iqd')::numeric;
 END IF;
 IF v_unit_price<0 OR v_unit_price>999999999 OR v_unit_price<>trunc(v_unit_price)
 THEN RAISE EXCEPTION 'Invalid unit price' USING errcode='22023';END IF;
 IF jsonb_typeof(p_catalog->'unit_purchase_price_iqd')='number' THEN
   v_unit_cost=(p_catalog->>'unit_purchase_price_iqd')::numeric;
   IF v_unit_cost<0 OR v_unit_cost>999999999 OR v_unit_cost<>trunc(v_unit_cost)
   THEN RAISE EXCEPTION 'Invalid unit cost' USING errcode='22023';END IF;
 ELSIF p_catalog->'unit_purchase_price_iqd' IS NOT NULL
 AND jsonb_typeof(p_catalog->'unit_purchase_price_iqd')<>'null'
 THEN RAISE EXCEPTION 'Invalid cost type' USING errcode='22023';END IF;
 v_unit_aliases=p_catalog->'unit_alias_barcodes';
 IF jsonb_typeof(v_unit_aliases)<>'array' OR jsonb_array_length(v_unit_aliases)>30
 THEN RAISE EXCEPTION 'Invalid unit aliases' USING errcode='22023';END IF;
 IF v_sale_mode='carton' THEN
  IF jsonb_array_length(v_unit_aliases)>0 OR (p_catalog->'unit_purchase_price_iqd' IS NOT NULL AND jsonb_typeof(p_catalog->'unit_purchase_price_iqd')<>'null')
  THEN RAISE EXCEPTION 'Unit aliases or cost not allowed' USING errcode='22023';END IF;
 ELSE
  IF v_unit_code IS NOT NULL THEN v_codes:=array_append(v_codes,v_unit_code);END IF;
  IF v_unit_code IS NULL AND jsonb_array_length(v_unit_aliases)>0
  THEN RAISE EXCEPTION 'Scale-only item cannot have unit aliases without primary' USING errcode='22023';END IF;
 END IF;
 FOR v_alias IN SELECT value FROM jsonb_array_elements_text(v_unit_aliases) LOOP
  IF v_alias IS NULL OR length(v_alias)<1 OR length(v_alias)>60
  OR v_alias~'[[:space:],;]'
  THEN RAISE EXCEPTION 'Invalid unit alias' USING errcode='22023';END IF;
  v_codes:=array_append(v_codes,v_alias);
 END LOOP;
 v_carton=p_catalog->'carton';
 IF (v_sale_mode='unit' AND v_carton IS NOT NULL AND jsonb_typeof(v_carton)<>'null')
 OR (v_sale_mode IN ('both','carton') AND (v_carton IS NULL OR jsonb_typeof(v_carton)='null'))
 THEN RAISE EXCEPTION 'Carton mode mismatch' USING errcode='22023';END IF;
 IF v_carton IS NOT NULL AND jsonb_typeof(v_carton)<>'null' THEN
  IF jsonb_typeof(v_carton)<>'object'
   OR jsonb_typeof(v_carton->'units_per_carton')<>'number'
   OR jsonb_typeof(v_carton->'sale_price_iqd')<>'number'
  THEN RAISE EXCEPTION 'Invalid carton' USING errcode='22023';END IF;
  v_carton_code=nullif(btrim(v_carton->>'barcode'),'');
  v_carton_name=nullif(btrim(v_carton->>'name'),'');
  v_units=(v_carton->>'units_per_carton')::numeric;
  v_carton_price=(v_carton->>'sale_price_iqd')::numeric;
  v_carton_aliases=v_carton->'alias_barcodes';
  IF v_carton_code IS NULL OR length(v_carton_code)>60
   OR v_carton_code~'[[:space:],;]' OR length(coalesce(v_carton_name,''))>100
   OR v_units<2 OR v_units>100000 OR v_units<>trunc(v_units)
   OR v_carton_price<0 OR v_carton_price>999999999
   OR v_carton_price<>trunc(v_carton_price)
   OR jsonb_typeof(v_carton_aliases)<>'array'
   OR jsonb_array_length(v_carton_aliases)>30
  THEN RAISE EXCEPTION 'Invalid carton fields' USING errcode='22023';END IF;
  IF jsonb_typeof(v_carton->'purchase_price_iqd')='number' THEN
   v_carton_cost=(v_carton->>'purchase_price_iqd')::numeric;
   IF v_carton_cost<0 OR v_carton_cost>999999999 OR v_carton_cost<>trunc(v_carton_cost)
   THEN RAISE EXCEPTION 'Invalid carton cost' USING errcode='22023';END IF;
  ELSIF v_carton->'purchase_price_iqd' IS NOT NULL
     AND jsonb_typeof(v_carton->'purchase_price_iqd')<>'null'
  THEN RAISE EXCEPTION 'Invalid carton cost' USING errcode='22023';END IF;
  v_carton_codes:=array_append(v_carton_codes,v_carton_code);
  FOR v_alias IN SELECT value FROM jsonb_array_elements_text(v_carton_aliases) LOOP
   IF v_alias IS NULL OR length(v_alias)<1 OR length(v_alias)>60
   OR v_alias~'[[:space:],;]'
   THEN RAISE EXCEPTION 'Invalid carton alias' USING errcode='22023';END IF;
   v_carton_codes:=array_append(v_carton_codes,v_alias);
  END LOOP;
 ELSIF v_carton IS NOT NULL AND jsonb_typeof(v_carton)<>'null' THEN
  RAISE EXCEPTION 'Invalid carton type' USING errcode='22023';
 END IF;
 v_codes:=v_codes||v_carton_codes;
 IF (SELECT count(DISTINCT code) FROM unnest(v_codes) AS t(code))<>cardinality(v_codes)
 THEN RAISE EXCEPTION 'Duplicate barcode in catalog' USING errcode='23505';END IF;
 IF EXISTS(SELECT 1 FROM public.retail_barcodes
    WHERE store_id=p_store_id AND code=ANY(v_codes) AND product_id<>p_product_id)
 THEN RAISE EXCEPTION 'Barcode belongs to another product' USING errcode='23505';END IF;

 -- Never DELETE barcodes. Removed aliases become inactive, remain reserved and audited.
 UPDATE public.retail_barcodes SET active=false
 WHERE store_id=p_store_id AND product_id=p_product_id AND active;
 FOREACH v_alias IN ARRAY v_codes LOOP
  INSERT INTO public.retail_barcodes(store_id,product_id,code,unit_type,units_per_scan,active)
  VALUES(p_store_id,p_product_id,v_alias,
         CASE WHEN v_alias=ANY(v_carton_codes) THEN 'carton' ELSE 'unit' END,
         CASE WHEN v_alias=ANY(v_carton_codes) THEN v_units::integer ELSE 1 END,true)
  ON CONFLICT(store_id,code) DO UPDATE SET
    active=true,unit_type=excluded.unit_type,units_per_scan=excluded.units_per_scan
    WHERE public.retail_barcodes.product_id=excluded.product_id;
 END LOOP;
 UPDATE public.retail_products SET
  name=v_name,sku=v_sku,plu=v_plu,
  price_minor=v_unit_price::bigint,purchase_price_minor=v_unit_cost::bigint,
  unit_primary_barcode=v_unit_code,catalog_version=catalog_version+1
 WHERE store_id=p_store_id AND id=p_product_id;
 IF v_carton_code IS NULL THEN
  DELETE FROM public.retail_product_cartons WHERE store_id=p_store_id AND product_id=p_product_id;
 ELSE
  INSERT INTO public.retail_product_cartons(
   store_id,product_id,carton_name,barcode,units_per_carton,purchase_price_minor,sale_price_minor)
  VALUES(p_store_id,p_product_id,v_carton_name,v_carton_code,
   v_units::integer,v_carton_cost::bigint,v_carton_price::bigint)
  ON CONFLICT(store_id,product_id) DO UPDATE SET
   carton_name=excluded.carton_name,barcode=excluded.barcode,
   units_per_carton=excluded.units_per_carton,
   purchase_price_minor=excluded.purchase_price_minor,sale_price_minor=excluded.sale_price_minor;
 END IF;
 v_new=public.retail_product_snapshot_v15(p_store_id,p_product_id);
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 VALUES(p_store_id,v_owner,'product.update_v15',p_product_id,
  jsonb_build_object('before',v_old,'after',v_new,
    'old_version',p_expected_version,'new_version',p_expected_version+1));
 RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.retail_product_snapshot_v15(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.retail_product_history_v15(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.retail_update_product_v15(uuid,uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_product_snapshot_v15(uuid,uuid),
 public.retail_product_history_v15(uuid,uuid),
 public.retail_update_product_v15(uuid,uuid,integer,jsonb) TO authenticated;
-- Prevent direct UPDATE/DELETE bypass of the audited owner-only RPC in local QA.
-- V14 registration INSERT remains authorized through its existing pathway.
REVOKE UPDATE, DELETE ON public.retail_products, public.retail_barcodes,
 public.retail_product_cartons FROM authenticated;

