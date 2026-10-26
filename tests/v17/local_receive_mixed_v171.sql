-- V17.1 ISOLATED QA ONLY: mixed carton + unit stock receipt in ONE transaction.
-- Absolutely no hosted Supabase migrations and no PC Relay writes.
CREATE TABLE public.retail_stock_mixed_receipts_v171(
 store_id uuid NOT NULL, request_id uuid NOT NULL, actor_id uuid NOT NULL,
 product_id uuid NOT NULL, lines jsonb NOT NULL,
 reason text NOT NULL CHECK(reason IN('opening','purchase')),
 base_units numeric(14,3) NOT NULL CHECK(base_units>0),
 total_stock numeric(14,3) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,request_id),
 FOREIGN KEY(store_id,product_id) REFERENCES public.retail_products(store_id,id)
);
ALTER TABLE public.retail_stock_mixed_receipts_v171 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.retail_stock_mixed_receipts_v171 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.retail_receive_mixed_v171(
 p_store uuid,p_request uuid,p_lines jsonb,p_reason text
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mixed$
DECLARE
 v_actor uuid:=(select auth.uid());
 v_existing public.retail_stock_mixed_receipts_v171%ROWTYPE;
 v_entry jsonb;v_barcode text;v_packages bigint;v_expected integer;
 v_product uuid;v_found uuid;v_type text;v_units integer;v_active boolean;
 v_seen_unit boolean:=false;v_seen_carton boolean:=false;
 v_base numeric(14,3):=0;v_total numeric(14,3);
BEGIN
 IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,array['manager'])
 THEN RAISE EXCEPTION 'Manager permission required' USING errcode='42501';END IF;
 IF p_store IS NULL OR p_request IS NULL OR p_lines IS NULL
    OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)<>2
    OR p_reason IS NULL OR p_reason NOT IN('opening','purchase')
 THEN RAISE EXCEPTION 'Invalid mixed receipt' USING errcode='22023';END IF;
 -- Committed replay is validated before live barcode lookup, so retirement
 -- of a scanned barcode does not cause a second stock mutation.
 SELECT * INTO v_existing FROM public.retail_stock_mixed_receipts_v171
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
   IF v_existing.actor_id IS DISTINCT FROM v_actor
     OR v_existing.lines IS DISTINCT FROM p_lines
     OR v_existing.reason IS DISTINCT FROM p_reason
   THEN RAISE EXCEPTION 'Mixed request reused' USING errcode='23505';END IF;
   RETURN v_existing.total_stock;
 END IF;
 -- Sorted barcode locks avoid lock-order inversions across concurrent receipts.
 FOR v_entry IN SELECT value FROM jsonb_array_elements(p_lines) ORDER BY value->>'barcode'
 LOOP
  IF jsonb_typeof(v_entry)<>'object'
    OR jsonb_typeof(v_entry->'barcode')<>'string'
    OR jsonb_typeof(v_entry->'packages')<>'number'
    OR jsonb_typeof(v_entry->'expected_units')<>'number'
    OR (v_entry->>'barcode') IS NULL
    OR length(v_entry->>'barcode') NOT BETWEEN 1 AND 60
    OR (v_entry->>'barcode')~'[[:space:],;]'
    OR (v_entry->>'packages') !~ '^[1-9][0-9]{0,5}$'
    OR (v_entry->>'expected_units') !~ '^[1-9][0-9]{0,5}$'
  THEN RAISE EXCEPTION 'Invalid mixed line' USING errcode='22023';END IF;
  v_barcode=v_entry->>'barcode';
  v_packages=(v_entry->>'packages')::bigint;
  v_expected=(v_entry->>'expected_units')::integer;
  SELECT b.product_id,b.unit_type,b.units_per_scan,p.active
  INTO v_found,v_type,v_units,v_active
  FROM public.retail_barcodes b
  JOIN public.retail_products p ON p.store_id=b.store_id AND p.id=b.product_id
  WHERE b.store_id=p_store AND b.code=v_barcode AND b.active
  FOR SHARE OF b,p;
  IF NOT FOUND OR NOT v_active OR v_units IS NULL OR v_expected<>v_units
    OR (v_type='unit' AND v_units<>1)
    OR (v_type='carton' AND (v_units<2 OR NOT EXISTS(
      SELECT 1 FROM public.retail_product_cartons c
      WHERE c.store_id=p_store AND c.product_id=v_found AND c.units_per_carton=v_units)))
    OR v_type NOT IN('unit','carton')
  THEN RAISE EXCEPTION 'Inactive or changed mixed barcode' USING errcode='22023';END IF;
  IF v_product IS NULL THEN v_product=v_found;END IF;
  IF v_product<>v_found THEN
    RAISE EXCEPTION 'Mixed receipt must be one product' USING errcode='22023';END IF;
  IF v_type='unit' THEN
    IF v_seen_unit THEN RAISE EXCEPTION 'Duplicate unit line' USING errcode='22023';END IF;
    v_seen_unit=true;
  ELSE
    IF v_seen_carton THEN RAISE EXCEPTION 'Duplicate carton line' USING errcode='22023';END IF;
    v_seen_carton=true;
  END IF;
  v_base=v_base+v_packages::numeric*v_units;
  IF v_base>1000000 THEN
    RAISE EXCEPTION 'Mixed base units exceed maximum' USING errcode='22023';END IF;
 END LOOP;
 IF NOT v_seen_unit OR NOT v_seen_carton OR v_base<2
 THEN RAISE EXCEPTION 'Both unit and carton required' USING errcode='22023';END IF;
 -- The unique request key fences simultaneous retries. All downstream stock
 -- balance, event, manager audit and mixed receipt commit/rollback together.
 INSERT INTO public.retail_stock_mixed_receipts_v171(
  store_id,request_id,actor_id,product_id,lines,reason,base_units,total_stock)
 VALUES(p_store,p_request,v_actor,v_product,p_lines,p_reason,v_base,0)
 ON CONFLICT(store_id,request_id) DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO v_existing FROM public.retail_stock_mixed_receipts_v171
   WHERE store_id=p_store AND request_id=p_request;
   IF NOT FOUND OR v_existing.actor_id IS DISTINCT FROM v_actor
       OR v_existing.lines IS DISTINCT FROM p_lines
       OR v_existing.reason IS DISTINCT FROM p_reason
       OR v_existing.product_id IS DISTINCT FROM v_product
   THEN RAISE EXCEPTION 'Mixed request reused' USING errcode='23505';END IF;
   RETURN v_existing.total_stock;
 END IF;
 v_total=retail_internal.receive_stock(p_store,v_product,v_base,p_reason);
 UPDATE public.retail_stock_mixed_receipts_v171 SET total_stock=v_total
 WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 VALUES(p_store,v_actor,'stock.receive_mixed_v171',v_product,
   jsonb_build_object('request_id',p_request,'lines',p_lines,
       'base_units',v_base,'total_stock',v_total));
 RETURN v_total;
END;
$mixed$;
REVOKE ALL ON FUNCTION public.retail_receive_mixed_v171(uuid,uuid,jsonb,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_receive_mixed_v171(uuid,uuid,jsonb,text)
 TO authenticated;
