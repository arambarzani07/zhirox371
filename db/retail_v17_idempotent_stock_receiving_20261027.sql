-- ZHIROX371: V17/V17.1 idempotent stock receipts, non-destructive.
-- Private request receipts ensure that network retries cannot add stock twice.
CREATE TABLE IF NOT EXISTS retail_internal.stock_receive_requests (
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  fingerprint jsonb NOT NULL,
  base_units numeric(14,3),
  result_quantity numeric(14,3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, request_id),
  CONSTRAINT retail_receive_result_pair CHECK
    ((base_units IS NULL AND result_quantity IS NULL)
      OR (base_units IS NOT NULL AND result_quantity IS NOT NULL))
);
ALTER TABLE retail_internal.stock_receive_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON retail_internal.stock_receive_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION retail_internal.receive_packages_v17(
  p_store uuid, p_request uuid, p_reason text, p_lines jsonb
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $body$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_n integer;
  v_item jsonb;
  v_barcode text;
  v_package_text text;
  v_units_text text;
  v_packages numeric;
  v_units numeric;
  v_rows jsonb := '[]'::jsonb;
  v_fingerprint jsonb;
  v_previous record;
  v_line record;
  v_product uuid := null;
  v_code_type text;
  v_seen_codes text[] := ARRAY[]::text[];
  v_seen_types text[] := ARRAY[]::text[];
  v_total numeric := 0;
  v_final numeric;
BEGIN
  IF v_actor IS NULL OR p_store IS NULL OR p_request IS NULL OR p_reason IS NULL
    OR NOT retail_internal.has_role(p_store,ARRAY['manager'])
  THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501'; END IF;
  IF p_reason NOT IN ('opening','purchase') OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid receiving request' USING ERRCODE='22023'; END IF;
  v_n := jsonb_array_length(p_lines);
  IF v_n < 1 OR v_n > 2 THEN
    RAISE EXCEPTION 'Receiving request requires one or two lines' USING ERRCODE='22023';
  END IF;

  -- Canonicalize input first: a repeated committed request is returned even if
  -- product or barcode definitions changed since its original submission.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) x(value) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid stock line' USING ERRCODE='22023'; END IF;
    v_barcode := NULLIF(btrim(v_item->>'barcode'),'');
    v_package_text := v_item->>'packages';
    v_units_text := v_item->>'expected_units';
    IF v_barcode IS NULL OR length(v_barcode)>60 OR
       v_package_text IS NULL OR v_package_text !~ '^[0-9]{1,7}$' OR
       v_units_text IS NULL OR v_units_text !~ '^[0-9]{1,6}$'
    THEN RAISE EXCEPTION 'Invalid barcode, package quantity or expected units' USING ERRCODE='22023'; END IF;
    v_packages := v_package_text::numeric;
    v_units := v_units_text::numeric;
    IF v_packages < 1 OR v_packages > 1000000 OR v_units < 1 OR v_units > 100000
      OR v_barcode=ANY(v_seen_codes)
    THEN RAISE EXCEPTION 'Invalid or duplicated stock input' USING ERRCODE='22023'; END IF;
    v_seen_codes := array_append(v_seen_codes,v_barcode);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'barcode',v_barcode,'packages',v_packages,'expected_units',v_units));
  END LOOP;
  v_fingerprint := jsonb_build_object('reason',p_reason,'lines',v_rows);

  INSERT INTO retail_internal.stock_receive_requests
    (store_id,request_id,actor_id,fingerprint)
    VALUES (p_store,p_request,v_actor,v_fingerprint)
    ON CONFLICT (store_id,request_id) DO NOTHING;
  SELECT actor_id,fingerprint,base_units,result_quantity INTO v_previous
    FROM retail_internal.stock_receive_requests
    WHERE store_id=p_store AND request_id=p_request FOR UPDATE;
  IF v_previous.actor_id IS DISTINCT FROM v_actor
     OR v_previous.fingerprint IS DISTINCT FROM v_fingerprint
  THEN RAISE EXCEPTION 'Request reused with different actor or payload' USING ERRCODE='22023'; END IF;
  IF v_previous.result_quantity IS NOT NULL THEN
    RETURN v_previous.result_quantity;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_rows) x(value) LOOP
    v_barcode := v_item->>'barcode';
    v_packages := (v_item->>'packages')::numeric;
    v_units := (v_item->>'expected_units')::numeric;
    SELECT b.product_id,b.unit_type,b.units_per_scan
      INTO v_line
      FROM public.retail_barcodes b
      JOIN public.retail_products p
        ON p.id=b.product_id AND p.store_id=b.store_id
      WHERE b.store_id=p_store AND b.code=v_barcode
        AND b.active=true AND p.active=true;
    IF NOT FOUND OR v_line.unit_type NOT IN ('unit','carton')
      OR v_line.units_per_scan IS DISTINCT FROM v_units
      OR (v_line.unit_type='unit' AND v_units<>1)
      OR (v_line.unit_type='carton' AND v_units<2)
    THEN RAISE EXCEPTION 'Barcode inactive or pack size changed' USING ERRCODE='22023'; END IF;
    IF v_product IS NULL THEN v_product:=v_line.product_id;
    ELSIF v_line.product_id IS DISTINCT FROM v_product THEN
      RAISE EXCEPTION 'Mixed request products differ' USING ERRCODE='22023';
    END IF;
    v_seen_types := array_append(v_seen_types,v_line.unit_type);
    v_total := v_total + v_packages*v_units;
    IF v_total>1000000 THEN
      RAISE EXCEPTION 'Receiving quantity exceeds maximum base units' USING ERRCODE='22023';
    END IF;
  END LOOP;

  IF v_n=2 AND
     (v_seen_types[1] IS DISTINCT FROM 'unit' OR v_seen_types[2] IS DISTINCT FROM 'carton')
  THEN RAISE EXCEPTION 'Mixed receipt must contain unit then carton' USING ERRCODE='22023'; END IF;
  INSERT INTO public.retail_stock_balances(store_id,product_id,quantity)
    VALUES (p_store,v_product,v_total)
    ON CONFLICT (store_id,product_id) DO UPDATE
      SET quantity=public.retail_stock_balances.quantity+excluded.quantity,
          updated_at=now()
    RETURNING quantity INTO v_final;
  INSERT INTO public.retail_stock_events(store_id,product_id,delta,reason)
    VALUES(p_store,v_product,v_total,p_reason);
  INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
    VALUES(p_store,v_actor,'stock.receive.v17',v_product,
      jsonb_build_object('request_id',p_request,'base_units',v_total,'reason',p_reason,'lines',v_rows));
  UPDATE retail_internal.stock_receive_requests
    SET base_units=v_total,result_quantity=v_final
    WHERE store_id=p_store AND request_id=p_request;
  RETURN v_final;
END
$body$;
REVOKE ALL ON FUNCTION retail_internal.receive_packages_v17(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION retail_internal.receive_packages_v17(uuid,uuid,text,jsonb) TO authenticated;

-- Public entry points run with invoker permissions; privileged stock writes
-- remain inside the private, explicitly authorized and audited function.
CREATE OR REPLACE FUNCTION public.retail_receive_packs_v17(
  p_store uuid, p_barcode text, p_packages numeric, p_expected_units numeric,
  p_reason text, p_request uuid
) RETURNS numeric LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $body$
 SELECT retail_internal.receive_packages_v17(
   p_store,p_request,p_reason,
   jsonb_build_array(jsonb_build_object(
     'barcode',p_barcode,'packages',p_packages,'expected_units',p_expected_units)));
$body$;
REVOKE ALL ON FUNCTION public.retail_receive_packs_v17(uuid,text,numeric,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_receive_packs_v17(uuid,text,numeric,numeric,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_receive_mixed_v171(
  p_store uuid, p_lines jsonb, p_reason text, p_request uuid
) RETURNS numeric LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $body$
 SELECT retail_internal.receive_packages_v17(p_store,p_request,p_reason,p_lines);
$body$;
REVOKE ALL ON FUNCTION public.retail_receive_mixed_v171(uuid,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_receive_mixed_v171(uuid,jsonb,text,uuid) TO authenticated;

-- The existing frontend expects the per-barcode price and package size.
-- RLS on the joined tables controls which store's codes are visible.
CREATE OR REPLACE FUNCTION public.retail_scan_catalog_v16(p_store uuid)
RETURNS TABLE (product_id uuid, code text, unit_type text,
  units_per_scan numeric, price_minor bigint, active boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $body$
 SELECT b.product_id,b.code,b.unit_type,b.units_per_scan,
   COALESCE(b.price_minor,p.price_minor),b.active
 FROM public.retail_barcodes b
 JOIN public.retail_products p ON p.id=b.product_id AND p.store_id=b.store_id
 WHERE b.store_id=p_store AND p.active=true AND b.active=true;
$body$;
REVOKE ALL ON FUNCTION public.retail_scan_catalog_v16(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_scan_catalog_v16(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
