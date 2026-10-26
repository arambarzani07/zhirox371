-- V17 ISOLATED QA ONLY. Never apply to hosted Supabase / old POS.
-- One product and one stock ledger in base units; input may be unit or carton.
CREATE TABLE public.retail_stock_receipt_requests_v17 (
 store_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 product_id uuid NOT NULL,
 barcode text NOT NULL,
 package_type text NOT NULL CHECK(package_type IN ('unit','carton')),
 packages bigint NOT NULL CHECK(packages BETWEEN 1 AND 1000000),
 units_per_package integer NOT NULL CHECK(units_per_package BETWEEN 1 AND 1000000),
 base_units numeric(14,3) NOT NULL CHECK(base_units>0),
 reason text NOT NULL CHECK(reason IN ('opening','purchase')),
 total_stock numeric(14,3) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,request_id),
 FOREIGN KEY (store_id,product_id) REFERENCES public.retail_products(store_id,id)
);
ALTER TABLE public.retail_stock_receipt_requests_v17 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retail_stock_receipt_requests_v17 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.retail_receive_packs_v17(
 p_store uuid,p_request uuid,p_barcode text,p_packages bigint,
 p_expected_units integer,p_reason text
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $v17$
DECLARE
 v_actor uuid:=(select auth.uid());
 v_product uuid;v_mode text;v_units integer;v_active boolean;
 v_increment numeric;v_total numeric;v_existing public.retail_stock_receipt_requests_v17%ROWTYPE;
BEGIN
 IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,array['manager'])
 THEN RAISE EXCEPTION 'Manager permission required' USING errcode='42501';END IF;
 IF p_store IS NULL OR p_request IS NULL OR p_barcode IS NULL
   OR length(p_barcode) NOT BETWEEN 1 AND 60 OR p_barcode~'[[:space:],;]'
   OR p_packages IS NULL OR p_packages NOT BETWEEN 1 AND 1000000
   OR p_expected_units IS NULL OR p_expected_units NOT BETWEEN 1 AND 1000000
   OR p_reason IS NULL OR p_reason NOT IN ('opening','purchase')
 THEN RAISE EXCEPTION 'Invalid stock receipt' USING errcode='22023';END IF;
 SELECT b.product_id,b.unit_type,b.units_per_scan,p.active
 INTO v_product,v_mode,v_units,v_active
 FROM public.retail_barcodes b JOIN public.retail_products p
 ON p.id=b.product_id AND p.store_id=b.store_id
 WHERE b.store_id=p_store AND b.code=p_barcode AND b.active
 FOR SHARE OF b,p;
 IF NOT FOUND OR NOT v_active OR v_mode NOT IN ('unit','carton')
  OR (v_mode='unit' AND v_units<>1)
  OR (v_mode='carton' AND
    (v_units<2 OR NOT EXISTS(SELECT 1 FROM public.retail_product_cartons c
      WHERE c.product_id=v_product AND c.store_id=p_store
      AND c.units_per_carton=v_units)))
  OR p_expected_units<>v_units
 THEN RAISE EXCEPTION 'Inactive or changed pack barcode' USING errcode='22023';END IF;
 v_increment=p_packages::numeric*v_units;
 IF v_increment>1000000 THEN
  RAISE EXCEPTION 'Base unit receipt exceeds maximum' USING errcode='22023';END IF;
 -- Unique request identity serializes retries from concurrent clients.
 INSERT INTO public.retail_stock_receipt_requests_v17(
  store_id,request_id,actor_id,product_id,barcode,package_type,
  packages,units_per_package,base_units,reason,total_stock
 )VALUES(p_store,p_request,v_actor,v_product,p_barcode,v_mode,p_packages,v_units,
   v_increment,p_reason,0)
 ON CONFLICT(store_id,request_id) DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_existing FROM public.retail_stock_receipt_requests_v17
    WHERE store_id=p_store AND request_id=p_request;
   IF NOT FOUND OR v_existing.actor_id IS DISTINCT FROM v_actor
    OR v_existing.product_id IS DISTINCT FROM v_product
    OR v_existing.barcode IS DISTINCT FROM p_barcode
    OR v_existing.package_type IS DISTINCT FROM v_mode
    OR v_existing.packages IS DISTINCT FROM p_packages
    OR v_existing.units_per_package IS DISTINCT FROM v_units
    OR v_existing.reason IS DISTINCT FROM p_reason
   THEN RAISE EXCEPTION 'Stock receipt request reused' USING errcode='23505';END IF;
   RETURN v_existing.total_stock;
 END IF;
 -- Calls preexisting manager-only transactional base-unit receipt. Its one
 -- stock balance, stock event and immutable actor audit are the source of truth.
 v_total=retail_internal.receive_stock(p_store,v_product,v_increment,p_reason);
 UPDATE public.retail_stock_receipt_requests_v17 SET total_stock=v_total
 WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 VALUES(p_store,v_actor,'stock.receive_packs_v17',v_product,
  jsonb_build_object('request_id',p_request,'barcode',p_barcode,
  'package_type',v_mode,'packages',p_packages,
  'units_per_package',v_units,'base_units',v_increment,'total_stock',v_total));
 RETURN v_total;
END;
$v17$;
REVOKE ALL ON FUNCTION public.retail_receive_packs_v17(uuid,uuid,text,bigint,integer,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_receive_packs_v17(uuid,uuid,text,bigint,integer,text)
 TO authenticated;
