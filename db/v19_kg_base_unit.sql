-- ZHIROX V19: exact base units. Existing stock quantities remain unchanged.
-- The owner-confirmed 11000 for tomato is 11000 KG (not grams).
ALTER TABLE public.retail_products ADD COLUMN IF NOT EXISTS base_unit text NOT NULL DEFAULT 'unit';
DO $check$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.retail_products'::regclass
    AND conname='retail_products_base_unit_check') THEN
    ALTER TABLE public.retail_products ADD CONSTRAINT retail_products_base_unit_check
      CHECK (base_unit IN ('unit','kg'));
  END IF;
END $check$;

CREATE OR REPLACE FUNCTION retail_internal.set_product_base_unit_v19(
 p_store uuid,p_product uuid,p_expected_version bigint,p_expected_stock numeric,p_unit text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE
 v_actor uuid:=(SELECT auth.uid());
 v_before text; v_version bigint; v_stock numeric(14,3);
BEGIN
 IF v_actor IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.retail_stores s WHERE s.id=p_store AND s.owner_user_id=v_actor
 ) THEN RAISE EXCEPTION 'Owner permission required' USING ERRCODE='42501'; END IF;
 IF p_unit NOT IN ('unit','kg') OR p_unit IS NULL OR p_expected_version IS NULL
   OR p_expected_stock IS NULL OR p_expected_stock<0 OR p_expected_stock<>round(p_expected_stock,3)
 THEN RAISE EXCEPTION 'Invalid unit conversion request' USING ERRCODE='22023'; END IF;

 SELECT p.base_unit,p.catalog_version INTO v_before,v_version
 FROM public.retail_products p WHERE p.id=p_product AND p.store_id=p_store
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='22023'; END IF;
 IF v_version IS DISTINCT FROM p_expected_version
 THEN RAISE EXCEPTION 'Product version changed' USING ERRCODE='40001'; END IF;
 SELECT COALESCE((
   SELECT b.quantity FROM public.retail_stock_balances b
   WHERE b.store_id=p_store AND b.product_id=p_product FOR UPDATE
 ),0) INTO v_stock;
 IF v_stock<>p_expected_stock THEN
   RAISE EXCEPTION 'Stock changed: verify unit quantity before conversion' USING ERRCODE='40001'; END IF;
 IF v_before IS DISTINCT FROM p_unit THEN
   -- Carton conversions require defining a separate packaging and unit policy.
   IF EXISTS (SELECT 1 FROM public.retail_product_cartons c
     WHERE c.store_id=p_store AND c.product_id=p_product)
   THEN RAISE EXCEPTION 'Remove carton configuration before changing base unit' USING ERRCODE='22023'; END IF;
   UPDATE public.retail_products SET base_unit=p_unit,catalog_version=catalog_version+1
    WHERE store_id=p_store AND id=p_product;
   INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
    VALUES (p_store,v_actor,'product.base_unit_v19',p_product,
      jsonb_build_object('from',v_before,'to',p_unit,'stock_kept',v_stock,'stock_unit',p_unit));
 END IF;
 RETURN jsonb_build_object('base_unit',p_unit,'quantity',v_stock,'version',
   (SELECT catalog_version FROM public.retail_products WHERE id=p_product AND store_id=p_store));
END $body$;
REVOKE ALL ON FUNCTION retail_internal.set_product_base_unit_v19(uuid,uuid,bigint,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION retail_internal.set_product_base_unit_v19(uuid,uuid,bigint,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_set_product_base_unit_v19(
 p_store uuid,p_product uuid,p_expected_version bigint,p_expected_stock numeric,p_unit text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $body$
 SELECT retail_internal.set_product_base_unit_v19(p_store,p_product,p_expected_version,p_expected_stock,p_unit);
$body$;
REVOKE ALL ON FUNCTION public.retail_set_product_base_unit_v19(uuid,uuid,bigint,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_set_product_base_unit_v19(uuid,uuid,bigint,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_product_snapshot_v19(p_store_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $body$
 SELECT retail_internal.product_snapshot_v15(p_store_id,p_product_id) ||
 jsonb_build_object('base_unit',p.base_unit,'stock_quantity',
 COALESCE((SELECT sb.quantity FROM public.retail_stock_balances sb
   WHERE sb.store_id=p.store_id AND sb.product_id=p.id),0))
 FROM public.retail_products p
 WHERE p.store_id=p_store_id AND p.id=p_product_id;
$body$;
REVOKE ALL ON FUNCTION public.retail_product_snapshot_v19(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_product_snapshot_v19(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';