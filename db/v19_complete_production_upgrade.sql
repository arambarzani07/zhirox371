-- ==============================================================================
-- سوپەرمارکێتی کانی چنار — Kani Chinar Supermarket
-- V19 Production Complete Migration & System Upgrade Script
-- ==============================================================================
-- ئەم فایلی SQLە هەموو مایگرەیشنەکانی داتابەیس لە یەک فایلی تەواودا کۆدەکاتەوە:
-- ١. زیادکردنی ستوونی نرخی کڕین، کۆدی تەرازوو (PLU)، بارکۆدی کارتۆن و کۆگا
-- ٢. دروستکردنی خشتەکانی کارتۆن و ڕووداوەکانی کۆگا (retail_stock_events)
-- ٣. دروستکردنی ئیندێکسە خێراکان بۆ زیاتر لە ١٥٠ هەزار بارکۆد
-- ٤. فانکشنەکانی تۆمارکردن، دەستکاری، گەڕاندنەوەی فرۆش، پەڕەبەندی و بارکۆدی تەرازوو
-- ==============================================================================

-- ١. نوێکردنەوەی خشتەی کاڵاکان و بارکۆدەکان
ALTER TABLE public.retail_products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS plu text,
  ADD COLUMN IF NOT EXISTS purchase_price_minor bigint CHECK (purchase_price_minor >= 0),
  ADD COLUMN IF NOT EXISTS catalog_version integer NOT NULL DEFAULT 1 CHECK (catalog_version >= 1),
  ADD COLUMN IF NOT EXISTS unit_primary_barcode text,
  ADD COLUMN IF NOT EXISTS min_stock_level numeric(14,3) DEFAULT 5 CHECK (min_stock_level >= 0);

ALTER TABLE public.retail_barcodes
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS units_per_scan integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_minor bigint CHECK (price_minor >= 0);

ALTER TABLE public.retail_sales
  ADD COLUMN IF NOT EXISTS refunded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_request_id uuid;

ALTER TABLE public.retail_sale_items
  ADD COLUMN IF NOT EXISTS package_type text DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS package_barcode text,
  ADD COLUMN IF NOT EXISTS units_per_package integer,
  ADD COLUMN IF NOT EXISTS base_units numeric(14,3);

-- ٢. دروستکردنی خشتەی کارتۆن و فرەبارکۆد
CREATE TABLE IF NOT EXISTS public.retail_product_cartons(
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  carton_name text,
  barcode text NOT NULL,
  units_per_carton integer NOT NULL CHECK (units_per_carton >= 2 AND units_per_carton <= 100000),
  purchase_price_minor bigint CHECK (purchase_price_minor >= 0),
  sale_price_minor bigint NOT NULL CHECK (sale_price_minor >= 0),
  PRIMARY KEY (store_id, product_id),
  FOREIGN KEY (store_id, product_id) REFERENCES public.retail_products(store_id, id),
  UNIQUE (store_id, barcode)
);
ALTER TABLE public.retail_product_cartons ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.retail_product_cartons TO authenticated;

-- ٣. دروستکردنی خشتەی ڕووداوەکانی کۆگا (Stock Events)
CREATE TABLE IF NOT EXISTS public.retail_stock_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  product_id uuid NOT NULL REFERENCES public.retail_products(id),
  delta numeric(14,3) NOT NULL,
  reason text NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  sale_id uuid REFERENCES public.retail_sales(id),
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_stock_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.retail_stock_events TO authenticated;

-- ٤. دروستکردنی ئیندێکسە بەهێزەکان بۆ خێرایی خوێندنەوەی ١٥٠ هەزار بارکۆد
CREATE INDEX IF NOT EXISTS retail_barcodes_store_active_code_pattern_idx
  ON public.retail_barcodes(store_id, code text_pattern_ops)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS retail_barcodes_store_product_active_idx
  ON public.retail_barcodes(store_id, product_id, active);

CREATE INDEX IF NOT EXISTS retail_products_store_created_id_idx
  ON public.retail_products(store_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS retail_products_store_name_lower_idx
  ON public.retail_products(store_id, lower(name) text_pattern_ops);

CREATE INDEX IF NOT EXISTS retail_products_store_sku_idx
  ON public.retail_products(store_id, sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS retail_products_store_plu_idx
  ON public.retail_products(store_id, plu)
  WHERE plu IS NOT NULL;

-- ٥. پشکنەری چێک-دیجیتی بارکۆدی EAN-13
CREATE OR REPLACE FUNCTION retail_internal.is_valid_ean13(p_code text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $$
DECLARE
  v_sum integer := 0;
  v_i integer;
  v_digit integer;
  v_check integer;
BEGIN
  IF p_code IS NULL OR p_code !~ '^[0-9]{13}$' THEN
    RETURN false;
  END IF;
  FOR v_i IN 1..12 LOOP
    v_digit := substring(p_code FROM v_i FOR 1)::integer;
    IF (v_i % 2) = 1 THEN
      v_sum := v_sum + v_digit;
    ELSE
      v_sum := v_sum + (v_digit * 3);
    END IF;
  END LOOP;
  v_check := (10 - (v_sum % 10)) % 10;
  RETURN v_check = substring(p_code FROM 13 FOR 1)::integer;
END;
$$;
GRANT EXECUTE ON FUNCTION retail_internal.is_valid_ean13(text) TO authenticated;

-- ٦. فانکشنی تۆمارکردنی پێشکەوتووی کاڵا (V14)
CREATE OR REPLACE FUNCTION public.retail_register_product_v14(p_store_id uuid, p_catalog jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_actor uuid := (select auth.uid());
 v_product uuid;
 v_name text;
 v_unit_code text;
 v_unit_price numeric;
 v_raw_cost numeric;
 v_cost bigint;
 v_sku text;
 v_plu text;
 v_carton jsonb;
 v_carton_code text;
 v_carton_units integer;
 v_carton_price numeric;
 v_carton_cost numeric;
 v_carton_name text;
 v_aliases jsonb;
 v_alias text;
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.retail_stores WHERE id = p_store_id AND owner_user_id = v_actor)
 THEN RAISE EXCEPTION 'Owner permission required' USING errcode = '42501'; END IF;

 v_name := trim(coalesce(p_catalog->>'name', ''));
 v_unit_code := trim(coalesce(p_catalog->>'unit_barcode', ''));
 v_unit_price := NULLIF(trim(coalesce(p_catalog->>'unit_sale_price_iqd', '')), '')::numeric;
 v_raw_cost := NULLIF(trim(coalesce(p_catalog->>'unit_purchase_price_iqd', '')), '')::numeric;
 v_cost := CASE WHEN v_raw_cost IS NOT NULL THEN v_raw_cost::bigint ELSE NULL END;
 v_sku := NULLIF(trim(coalesce(p_catalog->>'sku', '')), '');
 v_plu := NULLIF(trim(coalesce(p_catalog->>'plu', '')), '');

 INSERT INTO public.retail_products(store_id, name, price_minor, currency, active, sku, plu, purchase_price_minor)
 VALUES(p_store_id, v_name, coalesce(v_unit_price::bigint, 0), 'IQD', true, v_sku, v_plu, v_cost)
 RETURNING id INTO v_product;

 IF v_unit_code <> '' THEN
   INSERT INTO public.retail_barcodes(store_id, product_id, code, unit_type, units_per_scan, is_primary, active)
   VALUES(p_store_id, v_product, v_unit_code, 'unit', 1, true, true);
 END IF;

 v_aliases := p_catalog->'unit_alias_barcodes';
 IF v_aliases IS NOT NULL AND jsonb_typeof(v_aliases) = 'array' THEN
   FOR v_alias IN SELECT jsonb_array_elements_text(v_aliases) LOOP
     v_alias := trim(v_alias);
     IF v_alias <> '' THEN
       INSERT INTO public.retail_barcodes(store_id, product_id, code, unit_type, units_per_scan, is_primary, active)
       VALUES(p_store_id, v_product, v_alias, 'unit', 1, false, true);
     END IF;
   END LOOP;
 END IF;

 v_carton := p_catalog->'carton';
 IF v_carton IS NOT NULL AND jsonb_typeof(v_carton) = 'object' THEN
   v_carton_code := trim(coalesce(v_carton->>'barcode', ''));
   v_carton_units := (v_carton->>'units_per_carton')::integer;
   v_carton_price := (v_carton->>'sale_price_iqd')::numeric;
   v_carton_cost := NULLIF(trim(coalesce(v_carton->>'purchase_price_iqd', '')), '')::numeric;
   v_carton_name := NULLIF(trim(coalesce(v_carton->>'name', '')), '');

   IF v_carton_code <> '' AND v_carton_units >= 2 THEN
     INSERT INTO public.retail_product_cartons(
       store_id, product_id, carton_name, barcode, units_per_carton, purchase_price_minor, sale_price_minor
     ) VALUES (
       p_store_id, v_product, v_carton_name, v_carton_code, v_carton_units,
       CASE WHEN v_carton_cost IS NOT NULL THEN v_carton_cost::bigint ELSE NULL END,
       v_carton_price::bigint
     );

     INSERT INTO public.retail_barcodes(store_id, product_id, code, unit_type, units_per_scan, is_primary, price_minor, active)
     VALUES(p_store_id, v_product, v_carton_code, 'carton', v_carton_units, true, v_carton_price::bigint, true);

     v_aliases := v_carton->'alias_barcodes';
     IF v_aliases IS NOT NULL AND jsonb_typeof(v_aliases) = 'array' THEN
       FOR v_alias IN SELECT jsonb_array_elements_text(v_aliases) LOOP
         v_alias := trim(v_alias);
         IF v_alias <> '' THEN
           INSERT INTO public.retail_barcodes(store_id, product_id, code, unit_type, units_per_scan, is_primary, price_minor, active)
           VALUES(p_store_id, v_product, v_alias, 'carton', v_carton_units, false, v_carton_price::bigint, true);
         END IF;
       END LOOP;
     END IF;
   END IF;
 END IF;

 RETURN v_product;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.retail_register_product_v14(uuid, jsonb) TO authenticated;

-- ٧. فانکشنی ناسینەوەی بارکۆد بە شێوەی سێرڤەر (V18)
CREATE OR REPLACE FUNCTION public.retail_resolve_barcode_v18(
  p_store uuid,
  p_code text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_code, ''));
  v_match record;
  v_plu_raw text;
  v_plu_num text;
  v_grams integer;
  v_weight_kg numeric(8,3);
  v_product record;
  v_calculated_price bigint;
BEGIN
  -- ١. بارکۆدی ئاسایی
  SELECT b.code, b.product_id, b.unit_type, b.units_per_scan, b.is_primary, b.price_minor,
         p.name AS product_name, p.price_minor AS base_price_minor
  INTO v_match
  FROM public.retail_barcodes b
  JOIN public.retail_products p ON p.id = b.product_id AND p.store_id = b.store_id
  WHERE b.store_id = p_store AND b.active = true AND b.code = v_clean
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'code', v_match.code,
      'product_id', v_match.product_id,
      'unit_type', v_match.unit_type,
      'units_per_scan', v_match.units_per_scan,
      'is_primary', v_match.is_primary,
      'price_minor', coalesce(v_match.price_minor, v_match.base_price_minor),
      'product_name', v_match.product_name,
      'is_scale', false
    );
  END IF;

  -- ٢. بارکۆدی تەرازوو: Prefix 27 + 5-digit PLU + 5-digit weight in grams + EAN-13 checksum
  IF v_clean ~ '^27[0-9]{11}$' AND retail_internal.is_valid_ean13(v_clean) THEN
    v_plu_raw := substring(v_clean FROM 3 FOR 5);
    v_plu_num := trim(leading '0' FROM v_plu_raw);
    v_grams := substring(v_clean FROM 8 FOR 5)::integer;

    IF v_grams > 0 THEN
      v_weight_kg := round((v_grams::numeric / 1000.0), 3);

      SELECT id, name, price_minor, sku, plu
      INTO v_product
      FROM public.retail_products
      WHERE store_id = p_store AND active = true
        AND (
          plu = v_plu_raw OR plu = v_plu_num OR plu = ('27' || v_plu_raw) OR sku = v_plu_raw OR sku = v_plu_num
          OR id IN (
            SELECT product_id FROM public.retail_barcodes
            WHERE store_id = p_store AND active = true
              AND (code = ('27' || v_plu_raw) OR code = v_plu_raw OR code = v_plu_num)
          )
        )
      LIMIT 1;

      IF FOUND THEN
        v_calculated_price := round((v_product.price_minor::numeric * v_weight_kg))::bigint;
        RETURN jsonb_build_object(
          'code', v_clean,
          'product_id', v_product.id,
          'unit_type', 'unit',
          'units_per_scan', 1,
          'is_primary', true,
          'price_minor', v_calculated_price,
          'product_name', v_product.name,
          'is_scale', true,
          'scale_grams', v_grams,
          'scale_weight_kg', v_weight_kg,
          'scale_plu', v_plu_raw,
          'scale_unit_price_minor', v_product.price_minor,
          'scale_label', v_weight_kg::text || ' kg'
        );
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.retail_resolve_barcode_v18(uuid, text) TO authenticated;

-- ٨. فانکشنی فرۆشتنی پاکێج، کارتۆن و بارکۆدی تەرازوو (V16)
DROP FUNCTION IF EXISTS public.retail_checkout_packs_v16(uuid,uuid,jsonb,bigint);
CREATE OR REPLACE FUNCTION public.retail_checkout_packs_v16(
  p_store uuid,
  p_request uuid,
  p_items jsonb,
  p_cash_received bigint,
  p_discount bigint DEFAULT 0
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := (select auth.uid());
  v_sale uuid; v_prior_status text; v_prior_payload jsonb; v_prior_actor uuid;
  v_request_payload jsonb; v_cash_session uuid;
  v_entry jsonb; v_barcode text; v_qty bigint; v_expected_price bigint; v_expected_units numeric;
  v_product uuid; v_name text; v_pack_type text; v_pack_units integer; v_pack_price bigint;
  v_pactive boolean; v_currency text; v_unit_kg_price bigint;
  v_plu_raw text; v_weight_grams integer; v_weight_kg numeric(14,3); v_plu_count integer;
  v_line_base_units numeric(14,3); v_snapshot_name text;
  v_discount bigint := greatest(coalesce(p_discount, 0), 0);
  v_need jsonb := '{}'::jsonb; v_old_units numeric; v_total numeric := 0; v_net_total numeric := 0;
  v_stock numeric; v_record record; v_receipt_number bigint;
BEGIN
  IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,array['manager','cashier'])
  THEN RAISE EXCEPTION 'Cashier permission required' USING errcode='42501';END IF;
  IF p_request IS NULL OR p_items IS NULL OR jsonb_typeof(p_items)<>'array'
    OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>100
    OR p_cash_received IS NULL OR p_cash_received<0 OR p_cash_received>9999999999999
    OR coalesce(p_discount,0)<0
  THEN RAISE EXCEPTION 'Invalid checkout' USING errcode='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.retail_stores WHERE id=p_store AND currency='IQD')
  THEN RAISE EXCEPTION 'IQD store required' USING errcode='22023';END IF;

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
  END LOOP;

  IF v_discount > 0 THEN
    v_request_payload := jsonb_build_object('items',p_items,'cash_received',p_cash_received,'discount',v_discount);
  ELSE
    v_request_payload := jsonb_build_object('items',p_items,'cash_received',p_cash_received);
  END IF;

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

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_barcode := v_entry->>'barcode';
    v_qty := (v_entry->>'quantity')::bigint;
    v_expected_price := (v_entry->>'expected_price_minor')::bigint;
    v_expected_units := (v_entry->>'expected_units')::numeric;

    SELECT b.product_id,b.unit_type,b.units_per_scan,p.name,p.active,p.currency,
     CASE WHEN b.unit_type='carton' THEN c.sale_price_minor ELSE p.price_minor END
    INTO v_product,v_pack_type,v_pack_units,v_name,v_pactive,v_currency,v_pack_price
    FROM public.retail_barcodes b
     JOIN public.retail_products p ON p.store_id=b.store_id AND p.id=b.product_id
     LEFT JOIN public.retail_product_cartons c ON c.store_id=b.store_id AND c.product_id=b.product_id
    WHERE b.store_id=p_store AND b.code=v_barcode AND b.active
    FOR SHARE OF b,p;

    IF FOUND THEN
      IF NOT v_pactive OR v_currency<>'IQD'
         OR v_pack_type NOT IN ('unit','carton')
         OR v_pack_units IS NULL OR v_pack_units<1
         OR v_pack_price IS NULL
         OR (v_pack_type='unit' AND v_pack_units<>1)
         OR v_expected_price<>v_pack_price OR v_expected_units<>v_pack_units
      THEN RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';END IF;
      v_line_base_units := (v_qty * v_pack_units)::numeric(14,3);
      v_snapshot_name := v_name || CASE WHEN v_pack_type='carton' THEN ' (کارتۆن)' ELSE ' (دانە)' END;
    ELSE
      IF v_barcode !~ '^27[0-9]{11}$' OR NOT retail_internal.is_valid_ean13(v_barcode) THEN
        RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';
      END IF;
      v_plu_raw := substring(v_barcode FROM 3 FOR 5);
      v_weight_grams := substring(v_barcode FROM 8 FOR 5)::integer;
      IF v_plu_raw = '00000' OR v_weight_grams <= 0 THEN
        RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';
      END IF;

      SELECT count(*)
      INTO v_plu_count
      FROM public.retail_products p
      WHERE p.store_id = p_store AND p.active = true AND p.currency = 'IQD'
        AND p.price_minor IS NOT NULL AND p.price_minor > 0
        AND (
          (p.plu IS NOT NULL AND (
            btrim(p.plu) = v_plu_raw
            OR (btrim(p.plu) ~ '^[0-9]{1,5}$' AND lpad(btrim(p.plu), 5, '0') = v_plu_raw)
            OR btrim(p.plu) = ('27' || v_plu_raw)
          ))
          OR EXISTS (
            SELECT 1 FROM public.retail_barcodes bu
            WHERE bu.store_id = p.store_id AND bu.product_id = p.id
              AND (bu.code = ('27' || v_plu_raw) OR bu.code = v_plu_raw OR bu.code = trim(leading '0' from v_plu_raw))
              AND bu.active = true
          )
        );

      IF v_plu_count <> 1 THEN
        RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';
      END IF;

      SELECT p.id, p.name, p.active, p.currency, p.price_minor
      INTO v_product, v_name, v_pactive, v_currency, v_unit_kg_price
      FROM public.retail_products p
      WHERE p.store_id = p_store AND p.active = true AND p.currency = 'IQD'
        AND p.price_minor IS NOT NULL AND p.price_minor > 0
        AND (
          (p.plu IS NOT NULL AND (
            btrim(p.plu) = v_plu_raw
            OR (btrim(p.plu) ~ '^[0-9]{1,5}$' AND lpad(btrim(p.plu), 5, '0') = v_plu_raw)
            OR btrim(p.plu) = ('27' || v_plu_raw)
          ))
          OR EXISTS (
            SELECT 1 FROM public.retail_barcodes bu
            WHERE bu.store_id = p.store_id AND bu.product_id = p.id
              AND (bu.code = ('27' || v_plu_raw) OR bu.code = v_plu_raw OR bu.code = trim(leading '0' from v_plu_raw))
              AND bu.active = true
          )
        )
      FOR SHARE OF p;

      v_pack_price := round((v_unit_kg_price::numeric * v_weight_grams::numeric) / 1000.0)::bigint;
      v_weight_kg := round((v_weight_grams::numeric / 1000.0), 3);
      v_pack_type := 'unit';
      v_pack_units := 1;

      IF v_pack_price <= 0 OR v_expected_price <> v_pack_price
         OR (v_expected_units <> 1 AND v_expected_units <> v_weight_kg)
      THEN RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';END IF;

      v_line_base_units := round(v_qty::numeric * v_weight_kg, 3);
      v_snapshot_name := v_name || ' (' || to_char(v_weight_kg, 'FM999990.000') || ' کگم)';
    END IF;

    v_total := v_total + v_qty * v_pack_price;
    v_old_units := coalesce((v_need->>v_product::text)::numeric, 0);
    v_need := jsonb_set(v_need, array[v_product::text], to_jsonb(round(v_old_units + v_line_base_units, 3)));

    INSERT INTO public.retail_sale_items(
     store_id,sale_id,product_id,quantity,unit_price_minor,product_name_snapshot,
     package_type,package_barcode,units_per_package,base_units)
    VALUES(p_store,v_sale,v_product,v_qty,v_pack_price,
      v_snapshot_name,v_pack_type,v_barcode,v_pack_units,v_line_base_units);
  END LOOP;

  IF v_discount > v_total THEN RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';END IF;
  v_net_total := v_total - v_discount;
  IF p_cash_received < v_net_total THEN RAISE EXCEPTION 'Cash amount is below total' USING errcode='22023';END IF;

  FOR v_record IN SELECT key AS product_id, value::numeric(14,3) AS units
                  FROM jsonb_each_text(v_need) ORDER BY key
  LOOP
    SELECT quantity INTO v_stock FROM public.retail_stock_balances
    WHERE store_id=p_store AND product_id=v_record.product_id::uuid FOR UPDATE;
    IF NOT FOUND OR v_stock < v_record.units
    THEN RAISE EXCEPTION 'Insufficient stock' USING errcode='22023';END IF;
    UPDATE public.retail_stock_balances SET
     quantity = round(quantity - v_record.units, 3), updated_at = now()
    WHERE store_id=p_store AND product_id=v_record.product_id::uuid;
    INSERT INTO public.retail_stock_events(store_id,product_id,delta,reason,sale_id)
    VALUES(p_store,v_record.product_id::uuid,-v_record.units,'sale',v_sale);
  END LOOP;

  INSERT INTO public.retail_receipt_counters(store_id,last_no) VALUES(p_store,1)
  ON CONFLICT(store_id) DO UPDATE SET last_no=public.retail_receipt_counters.last_no+1
  RETURNING last_no INTO v_receipt_number;

  UPDATE public.retail_sales SET status='posted',receipt_no=v_receipt_number,
    total_minor=v_net_total::bigint,discount_minor=v_discount,cash_received_minor=p_cash_received,
    change_due_minor=(p_cash_received-v_net_total)::bigint
  WHERE store_id=p_store AND id=v_sale;

  INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
  VALUES(p_store,v_actor,'sale.checkout_packs_v16',v_sale,
    jsonb_build_object('total_iqd',v_net_total,'discount_iqd',v_discount,'cash_iqd',p_cash_received,
     'receipt_no',v_receipt_number,'request_id',p_request,'base_units',v_need));
  RETURN v_sale;
END;
$$;
GRANT EXECUTE ON FUNCTION public.retail_checkout_packs_v16(uuid,uuid,jsonb,bigint,bigint) TO authenticated;

-- ٩. فانکشنی گەڕاندنەوەی فرۆشتن (V19 Return Sale)
CREATE OR REPLACE FUNCTION public.retail_return_sale_v19(
  p_store uuid,
  p_sale uuid,
  p_session uuid,
  p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := (select auth.uid());
  v_sale record;
  v_item record;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = '42501'; END IF;

  SELECT * INTO v_sale
  FROM public.retail_sales
  WHERE id = p_sale AND store_id = p_store FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found' USING errcode = '22023'; END IF;
  IF v_sale.refunded THEN
    RETURN jsonb_build_object('success', true, 'sale_id', p_sale, 'receipt_no', v_sale.receipt_no, 'already_refunded', true);
  END IF;

  -- گەڕاندنەوەی بڕی کاڵاکان بۆ ناو کۆگا
  FOR v_item IN
    SELECT product_id, base_units, quantity
    FROM public.retail_sale_items
    WHERE sale_id = p_sale AND store_id = p_store
  LOOP
    UPDATE public.retail_stock_balances
    SET quantity = quantity + coalesce(v_item.base_units, v_item.quantity::numeric),
        updated_at = now()
    WHERE store_id = p_store AND product_id = v_item.product_id;

    INSERT INTO public.retail_stock_events(
      store_id, product_id, delta, reason, actor_id, sale_id, request_id
    ) VALUES (
      p_store, v_item.product_id, coalesce(v_item.base_units, v_item.quantity::numeric),
      'sale_return', v_actor, p_sale, p_request
    );
  END LOOP;

  -- نوێکردنەوەی دۆخی پسوولە
  UPDATE public.retail_sales
  SET refunded = true, refund_request_id = p_request
  WHERE id = p_sale AND store_id = p_store;

  RETURN jsonb_build_object('success', true, 'sale_id', p_sale, 'receipt_no', v_sale.receipt_no);
END;
$$;
GRANT EXECUTE ON FUNCTION public.retail_return_sale_v19(uuid, uuid, uuid, uuid) TO authenticated;

-- ١٠. فانکشنەکانی دەستکاریکردنی کاڵا (V15 Product Snapshot & Editor)
CREATE OR REPLACE FUNCTION public.retail_product_snapshot_v15(p_store_id uuid, p_product_id uuid)
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
  'unit_purchase_price_iqd',CASE WHEN v_unit_code IS NULL THEN NULL ELSE v_product.purchase_price_minor END,
  'unit_sale_price_iqd',CASE WHEN v_unit_code IS NULL THEN NULL ELSE v_product.price_minor END,'currency',v_product.currency,
  'carton',CASE WHEN v_carton.product_id IS NULL THEN 'null'::jsonb
    ELSE jsonb_build_object('name',v_carton.carton_name,'barcode',v_carton.barcode,
      'alias_barcodes',v_carton_aliases,
      'units_per_carton',v_carton.units_per_carton,
      'purchase_price_iqd',v_carton.purchase_price_minor,
      'sale_price_iqd',v_carton.sale_price_minor) END
 );
END;
$$;

-- Overload for reverse parameter ordering
CREATE OR REPLACE FUNCTION public.retail_product_snapshot_v15(p_product_id uuid, p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT public.retail_product_snapshot_v15(p_store_id, p_product_id);
$$;

CREATE OR REPLACE FUNCTION public.retail_product_history_v15(p_store_id uuid, p_product_id uuid)
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

CREATE OR REPLACE FUNCTION public.retail_product_history_v15(p_product_id uuid, p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT public.retail_product_history_v15(p_store_id, p_product_id);
$$;

CREATE OR REPLACE FUNCTION public.retail_update_product_v15(
 p_store_id uuid, p_product_id uuid, p_expected_version integer, p_catalog jsonb)
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
 IF v_name IS NULL OR length(v_name)>160
   OR length(coalesce(v_sku,''))>80 OR length(coalesce(v_plu,''))>30
   OR (v_sale_mode<>'carton' AND v_unit_code IS NULL)
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
  v_codes:=array_append(v_codes,v_unit_code);
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

GRANT EXECUTE ON FUNCTION public.retail_product_snapshot_v15(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.retail_product_snapshot_v15(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retail_product_history_v15(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.retail_product_history_v15(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retail_update_product_v15(uuid, uuid, integer, jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.retail_update_product_v15(uuid, uuid, integer, jsonb) TO service_role;

-- ١١. فانکشنی وەرگرتنی زانیاری کاڵا و گۆڕینی یەکە (V19 Snapshot & Base Unit)
CREATE OR REPLACE FUNCTION public.retail_product_snapshot_v19(p_store_id uuid, p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $body$
 SELECT public.retail_product_snapshot_v15(p_store_id, p_product_id) ||
 jsonb_build_object('base_unit', coalesce(p.base_unit, 'unit'), 'stock_quantity',
 COALESCE((SELECT sb.quantity FROM public.retail_stock_balances sb
   WHERE sb.store_id = p.store_id AND sb.product_id = p.id), 0))
 FROM public.retail_products p
 WHERE p.store_id = p_store_id AND p.id = p_product_id;
$body$;
REVOKE ALL ON FUNCTION public.retail_product_snapshot_v19(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_product_snapshot_v19(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_set_product_base_unit_v19(
 p_store uuid, p_product uuid, p_expected_version bigint, p_expected_stock numeric, p_unit text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE
 v_actor uuid := (SELECT auth.uid());
 v_before text; v_version bigint; v_stock numeric(14,3);
BEGIN
 IF v_actor IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.retail_stores s WHERE s.id = p_store AND s.owner_user_id = v_actor
 ) THEN RAISE EXCEPTION 'Owner permission required' USING ERRCODE = '42501'; END IF;
 IF p_unit NOT IN ('unit','kg') OR p_unit IS NULL OR p_expected_version IS NULL
   OR p_expected_stock IS NULL OR p_expected_stock < 0 OR p_expected_stock <> round(p_expected_stock, 3)
 THEN RAISE EXCEPTION 'Invalid unit conversion request' USING ERRCODE = '22023'; END IF;

 SELECT p.base_unit, p.catalog_version INTO v_before, v_version
 FROM public.retail_products p WHERE p.id = p_product AND p.store_id = p_store
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE = '22023'; END IF;
 IF v_version IS DISTINCT FROM p_expected_version
 THEN RAISE EXCEPTION 'Product version changed' USING ERRCODE = '40001'; END IF;
 SELECT COALESCE((
   SELECT b.quantity FROM public.retail_stock_balances b
   WHERE b.store_id = p_store AND b.product_id = p_product FOR UPDATE
 ), 0) INTO v_stock;
 IF v_stock <> p_expected_stock THEN
   RAISE EXCEPTION 'Stock changed: verify unit quantity before conversion' USING ERRCODE = '40001'; END IF;
 IF v_before IS DISTINCT FROM p_unit THEN
   IF EXISTS (SELECT 1 FROM public.retail_product_cartons c
     WHERE c.store_id = p_store AND c.product_id = p_product)
   THEN RAISE EXCEPTION 'Remove carton configuration before changing base unit' USING ERRCODE = '22023'; END IF;
   UPDATE public.retail_products SET base_unit = p_unit, catalog_version = catalog_version + 1
    WHERE store_id = p_store AND id = p_product;
   INSERT INTO public.retail_audit_events(store_id, actor_id, action, subject_id, details)
    VALUES (p_store, v_actor, 'product.base_unit_v19', p_product,
      jsonb_build_object('from', v_before, 'to', p_unit, 'stock_kept', v_stock, 'stock_unit', p_unit));
 END IF;
 RETURN jsonb_build_object('base_unit', p_unit, 'quantity', v_stock, 'version',
   (SELECT catalog_version FROM public.retail_products WHERE id = p_product AND store_id = p_store));
END $body$;
REVOKE ALL ON FUNCTION public.retail_set_product_base_unit_v19(uuid, uuid, bigint, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_set_product_base_unit_v19(uuid, uuid, bigint, numeric, text) TO authenticated;

-- ١٢. خشتەی بەرواری بەسەرچوونی وەجبەکانی کۆگا (Stock Expiry & Batch Tracking)
CREATE TABLE IF NOT EXISTS public.retail_stock_expiries(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  product_id uuid NOT NULL REFERENCES public.retail_products(id),
  batch_no text,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  expiry_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','written_off','dismissed')),
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_stock_expiries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retail_stock_expiries_store_date_idx ON public.retail_stock_expiries(store_id, status, expiry_date);
DROP POLICY IF EXISTS retail_stock_expiries_policy ON public.retail_stock_expiries;
CREATE POLICY retail_stock_expiries_policy ON public.retail_stock_expiries
  FOR ALL TO authenticated
  USING (retail_internal.has_role(store_id, array['manager']))
  WITH CHECK (retail_internal.has_role(store_id, array['manager']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_stock_expiries TO authenticated;

-- ١٣. فانکشنی جەرد، ڕێکخستنی بڕی کۆگا، تەلەف و بەسەرچوون (V19 Stock Adjustment & Write-off)
CREATE OR REPLACE FUNCTION public.retail_adjust_stock_v19(
  p_store uuid,
  p_product uuid,
  p_mode text,
  p_quantity numeric,
  p_reason text,
  p_note text,
  p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_base_unit text;
  v_old_qty numeric(14,3);
  v_new_qty numeric(14,3);
  v_delta numeric(14,3);
  v_prior_payload jsonb;
  v_payload jsonb;
BEGIN
  IF v_actor IS NULL OR NOT retail_internal.has_role(p_store, array['manager']) THEN
    RAISE EXCEPTION 'Manager permission required' USING ERRCODE = '42501';
  END IF;
  IF p_request IS NULL OR p_product IS NULL OR p_quantity IS NULL
     OR p_mode NOT IN ('set_exact', 'delta_in', 'delta_out')
     OR p_quantity < 0 OR p_quantity > 1000000
     OR p_quantity <> round(p_quantity, 3)
  THEN
    RAISE EXCEPTION 'Invalid stock adjustment request' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(base_unit, 'unit') INTO v_base_unit
  FROM public.retail_products
  WHERE store_id = p_store AND id = p_product AND active = true
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = '22023';
  END IF;

  IF v_base_unit <> 'kg' AND p_quantity <> trunc(p_quantity) THEN
    RAISE EXCEPTION 'Unit product quantity must be integer' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'product_id', p_product,
    'mode', p_mode,
    'quantity', round(p_quantity, 3),
    'reason', coalesce(p_reason, 'inventory_count'),
    'note', left(coalesce(p_note, ''), 200)
  );

  SELECT details->'payload' INTO v_prior_payload
  FROM public.retail_audit_events
  WHERE store_id = p_store AND action = 'stock.adjust_v19'
    AND details->>'request_id' = p_request::text
  LIMIT 1;
  IF FOUND THEN
    IF v_prior_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Adjustment request reused with different payload' USING ERRCODE = '23505';
    END IF;
    SELECT coalesce(quantity, 0) INTO v_new_qty
    FROM public.retail_stock_balances
    WHERE store_id = p_store AND product_id = p_product;
    RETURN jsonb_build_object('product_id', p_product, 'quantity', coalesce(v_new_qty, 0), 'idempotent', true);
  END IF;

  INSERT INTO public.retail_stock_balances(store_id, product_id, quantity)
  VALUES (p_store, p_product, 0)
  ON CONFLICT (store_id, product_id) DO NOTHING;

  SELECT quantity INTO v_old_qty
  FROM public.retail_stock_balances
  WHERE store_id = p_store AND product_id = p_product
  FOR UPDATE;

  IF p_mode = 'set_exact' THEN
    v_new_qty := round(p_quantity, 3);
    v_delta := round(v_new_qty - v_old_qty, 3);
  ELSIF p_mode = 'delta_in' THEN
    IF p_quantity <= 0 THEN RAISE EXCEPTION 'Invalid stock adjustment request' USING ERRCODE = '22023'; END IF;
    v_delta := round(p_quantity, 3);
    v_new_qty := round(v_old_qty + v_delta, 3);
  ELSE
    IF p_quantity <= 0 THEN RAISE EXCEPTION 'Invalid stock adjustment request' USING ERRCODE = '22023'; END IF;
    IF v_old_qty < p_quantity THEN RAISE EXCEPTION 'Insufficient stock' USING ERRCODE = '22023'; END IF;
    v_delta := -round(p_quantity, 3);
    v_new_qty := round(v_old_qty + v_delta, 3);
  END IF;

  UPDATE public.retail_stock_balances
  SET quantity = v_new_qty, updated_at = now()
  WHERE store_id = p_store AND product_id = p_product;

  INSERT INTO public.retail_stock_events(store_id, product_id, delta, reason, actor_id, request_id)
  VALUES (p_store, p_product, v_delta, coalesce(nullif(btrim(p_reason), ''), 'inventory_count'), v_actor, p_request);

  INSERT INTO public.retail_audit_events(store_id, actor_id, action, subject_id, details)
  VALUES (
    p_store, v_actor, 'stock.adjust_v19', p_product,
    jsonb_build_object(
      'request_id', p_request,
      'payload', v_payload,
      'old_quantity', v_old_qty,
      'new_quantity', v_new_qty,
      'delta', v_delta,
      'reason', coalesce(nullif(btrim(p_reason), ''), 'inventory_count'),
      'note', left(coalesce(p_note, ''), 200)
    )
  );

  RETURN jsonb_build_object('product_id', p_product, 'old_quantity', v_old_qty, 'quantity', v_new_qty, 'delta', v_delta);
END $body$;
REVOKE ALL ON FUNCTION public.retail_adjust_stock_v19(uuid, uuid, text, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_adjust_stock_v19(uuid, uuid, text, numeric, text, text, uuid) TO authenticated;

-- ١٤. خشتەی کڕیاران و حیسابەکان (Customers & Accounts Ledger)
CREATE TABLE IF NOT EXISTS public.retail_customers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 140),
  phone text,
  address text,
  credit_limit_minor bigint NOT NULL DEFAULT 500000 CHECK (credit_limit_minor >= 0),
  balance_minor bigint NOT NULL DEFAULT 0,
  due_date date,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retail_customers_store_active_idx ON public.retail_customers(store_id, active, name);
DROP POLICY IF EXISTS retail_customers_policy ON public.retail_customers;
CREATE POLICY retail_customers_policy ON public.retail_customers
  FOR ALL TO authenticated
  USING (retail_internal.has_role(store_id, array['manager','cashier']))
  WITH CHECK (retail_internal.has_role(store_id, array['manager','cashier']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_customers TO authenticated;

CREATE TABLE IF NOT EXISTS public.retail_customer_ledger(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  customer_id uuid NOT NULL REFERENCES public.retail_customers(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('opening_balance','debt_sale','debt_add','payment_received','paid_purchase','adjustment')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  delta_minor bigint NOT NULL DEFAULT 0,
  balance_after_minor bigint NOT NULL DEFAULT 0,
  sale_id uuid REFERENCES public.retail_sales(id),
  receipt_no text,
  due_date date,
  payment_method text,
  note text,
  actor_id uuid REFERENCES auth.users(id),
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, request_id)
);
ALTER TABLE public.retail_customer_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retail_customer_ledger_store_cust_idx ON public.retail_customer_ledger(store_id, customer_id, created_at DESC);
DROP POLICY IF EXISTS retail_customer_ledger_policy ON public.retail_customer_ledger;
CREATE POLICY retail_customer_ledger_policy ON public.retail_customer_ledger
  FOR ALL TO authenticated
  USING (retail_internal.has_role(store_id, array['manager','cashier']))
  WITH CHECK (retail_internal.has_role(store_id, array['manager','cashier']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_customer_ledger TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_record_customer_ledger_v19(
  p_store uuid,
  p_customer uuid,
  p_entry_type text,
  p_amount bigint,
  p_note text DEFAULT NULL,
  p_receipt_no text DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_sale_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_request uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_req uuid := coalesce(p_request, gen_random_uuid());
  v_old_bal bigint;
  v_delta bigint;
  v_new_bal bigint;
  v_entry_id uuid;
  v_existing record;
BEGIN
  IF v_actor IS NULL OR NOT retail_internal.has_role(p_store, array['manager','cashier']) THEN
    RAISE EXCEPTION 'Permission required' USING ERRCODE = '42501';
  END IF;
  IF p_customer IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999999999
     OR p_entry_type NOT IN ('opening_balance','debt_sale','debt_add','payment_received','paid_purchase','adjustment')
  THEN
    RAISE EXCEPTION 'Invalid customer ledger entry' USING ERRCODE = '22023';
  END IF;

  SELECT id, delta_minor, balance_after_minor INTO v_existing
  FROM public.retail_customer_ledger
  WHERE store_id = p_store AND request_id = v_req
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'entry_id', v_existing.id,
      'customer_id', p_customer,
      'delta_minor', v_existing.delta_minor,
      'balance_after_minor', v_existing.balance_after_minor,
      'idempotent', true
    );
  END IF;

  SELECT balance_minor INTO v_old_bal
  FROM public.retail_customers
  WHERE store_id = p_store AND id = p_customer
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = '22023';
  END IF;

  IF p_entry_type IN ('opening_balance','debt_sale','debt_add') THEN
    v_delta := p_amount;
  ELSIF p_entry_type = 'payment_received' THEN
    v_delta := -p_amount;
  ELSIF p_entry_type = 'paid_purchase' THEN
    v_delta := 0;
  ELSE
    v_delta := p_amount;
  END IF;

  v_new_bal := greatest(0, v_old_bal + v_delta);

  UPDATE public.retail_customers
  SET balance_minor = v_new_bal,
      due_date = coalesce(p_due_date, due_date),
      updated_at = now()
  WHERE store_id = p_store AND id = p_customer;

  INSERT INTO public.retail_customer_ledger(
    store_id, customer_id, entry_type, amount_minor, delta_minor, balance_after_minor,
    sale_id, receipt_no, due_date, payment_method, note, actor_id, request_id
  ) VALUES (
    p_store, p_customer, p_entry_type, p_amount, v_delta, v_new_bal,
    p_sale_id, nullif(btrim(coalesce(p_receipt_no, '')), ''), p_due_date,
    coalesce(p_payment_method, 'cash_drawer'), left(coalesce(p_note, ''), 240), v_actor, v_req
  ) RETURNING id INTO v_entry_id;

  INSERT INTO public.retail_audit_events(store_id, actor_id, action, subject_id, details)
  VALUES (
    p_store, v_actor, 'customer.ledger_v19', p_customer,
    jsonb_build_object(
      'entry_id', v_entry_id,
      'request_id', v_req,
      'entry_type', p_entry_type,
      'amount_minor', p_amount,
      'delta_minor', v_delta,
      'balance_after_minor', v_new_bal,
      'receipt_no', p_receipt_no,
      'note', left(coalesce(p_note, ''), 200)
    )
  );

  RETURN jsonb_build_object(
    'entry_id', v_entry_id,
    'customer_id', p_customer,
    'delta_minor', v_delta,
    'balance_after_minor', v_new_bal
  );
END $body$;
REVOKE ALL ON FUNCTION public.retail_record_customer_ledger_v19(uuid, uuid, text, bigint, text, text, date, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_record_customer_ledger_v19(uuid, uuid, text, bigint, text, text, date, uuid, text, uuid) TO authenticated;

-- ١٥. خشتەکانی کڕین و دابینکەران (Suppliers, Purchase Orders & Supplier Accounts Ledger)
CREATE TABLE IF NOT EXISTS public.retail_suppliers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 140),
  company_name text,
  phone text,
  address text,
  category text DEFAULT 'گشتی',
  balance_minor bigint NOT NULL DEFAULT 0,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_suppliers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retail_suppliers_store_active_idx ON public.retail_suppliers(store_id, active, name);
DROP POLICY IF EXISTS retail_suppliers_policy ON public.retail_suppliers;
CREATE POLICY retail_suppliers_policy ON public.retail_suppliers
  FOR ALL TO authenticated
  USING (retail_internal.has_role(store_id, array['manager','cashier']))
  WITH CHECK (retail_internal.has_role(store_id, array['manager','cashier']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_suppliers TO authenticated;

CREATE TABLE IF NOT EXISTS public.retail_purchase_orders(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  supplier_id uuid REFERENCES public.retail_suppliers(id) ON DELETE SET NULL,
  order_no text NOT NULL,
  product_id uuid REFERENCES public.retail_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost_minor bigint NOT NULL DEFAULT 0 CHECK (unit_cost_minor >= 0),
  total_cost_minor bigint NOT NULL DEFAULT 0 CHECK (total_cost_minor >= 0),
  expected_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ordered','received','cancelled')),
  note text,
  actor_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retail_purchase_orders_store_status_idx ON public.retail_purchase_orders(store_id, status, created_at DESC);
DROP POLICY IF EXISTS retail_purchase_orders_policy ON public.retail_purchase_orders;
CREATE POLICY retail_purchase_orders_policy ON public.retail_purchase_orders
  FOR ALL TO authenticated
  USING (retail_internal.has_role(store_id, array['manager','cashier']))
  WITH CHECK (retail_internal.has_role(store_id, array['manager','cashier']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_purchase_orders TO authenticated;

CREATE TABLE IF NOT EXISTS public.retail_supplier_ledger(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  supplier_id uuid NOT NULL REFERENCES public.retail_suppliers(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('opening_balance','purchase_credit','purchase_cash','payment_sent','return_to_supplier','adjustment')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  delta_minor bigint NOT NULL DEFAULT 0,
  balance_after_minor bigint NOT NULL DEFAULT 0,
  invoice_no text,
  product_id uuid REFERENCES public.retail_products(id) ON DELETE SET NULL,
  quantity numeric(14,3),
  payment_method text,
  note text,
  actor_id uuid REFERENCES auth.users(id),
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, request_id)
);
ALTER TABLE public.retail_supplier_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS retail_supplier_ledger_store_sup_idx ON public.retail_supplier_ledger(store_id, supplier_id, created_at DESC);
DROP POLICY IF EXISTS retail_supplier_ledger_policy ON public.retail_supplier_ledger;
CREATE POLICY retail_supplier_ledger_policy ON public.retail_supplier_ledger
  FOR ALL TO authenticated
  USING (retail_internal.has_role(store_id, array['manager','cashier']))
  WITH CHECK (retail_internal.has_role(store_id, array['manager','cashier']));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_supplier_ledger TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_record_supplier_ledger_v19(
  p_store uuid,
  p_supplier uuid,
  p_entry_type text,
  p_amount bigint,
  p_note text DEFAULT NULL,
  p_invoice_no text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_request uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_req uuid := coalesce(p_request, gen_random_uuid());
  v_old_bal bigint;
  v_delta bigint;
  v_new_bal bigint;
  v_entry_id uuid;
  v_existing record;
BEGIN
  IF v_actor IS NULL OR NOT retail_internal.has_role(p_store, array['manager','cashier']) THEN
    RAISE EXCEPTION 'Permission required' USING ERRCODE = '42501';
  END IF;
  IF p_supplier IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999999999
     OR p_entry_type NOT IN ('opening_balance','purchase_credit','purchase_cash','payment_sent','return_to_supplier','adjustment')
  THEN
    RAISE EXCEPTION 'Invalid supplier ledger entry' USING ERRCODE = '22023';
  END IF;

  SELECT id, delta_minor, balance_after_minor INTO v_existing
  FROM public.retail_supplier_ledger
  WHERE store_id = p_store AND request_id = v_req
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'entry_id', v_existing.id,
      'supplier_id', p_supplier,
      'delta_minor', v_existing.delta_minor,
      'balance_after_minor', v_existing.balance_after_minor,
      'idempotent', true
    );
  END IF;

  SELECT balance_minor INTO v_old_bal
  FROM public.retail_suppliers
  WHERE store_id = p_store AND id = p_supplier
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier not found' USING ERRCODE = '22023';
  END IF;

  IF p_entry_type IN ('opening_balance','purchase_credit') THEN
    v_delta := p_amount;
  ELSIF p_entry_type IN ('payment_sent','return_to_supplier') THEN
    v_delta := -p_amount;
  ELSIF p_entry_type = 'purchase_cash' THEN
    v_delta := 0;
  ELSE
    v_delta := p_amount;
  END IF;

  v_new_bal := greatest(0, v_old_bal + v_delta);

  UPDATE public.retail_suppliers
  SET balance_minor = v_new_bal,
      updated_at = now()
  WHERE store_id = p_store AND id = p_supplier;

  INSERT INTO public.retail_supplier_ledger(
    store_id, supplier_id, entry_type, amount_minor, delta_minor, balance_after_minor,
    invoice_no, product_id, quantity, payment_method, note, actor_id, request_id
  ) VALUES (
    p_store, p_supplier, p_entry_type, p_amount, v_delta, v_new_bal,
    nullif(btrim(coalesce(p_invoice_no, '')), ''), p_product_id, p_quantity,
    coalesce(p_payment_method, 'cash_drawer'), left(coalesce(p_note, ''), 240), v_actor, v_req
  ) RETURNING id INTO v_entry_id;

  INSERT INTO public.retail_audit_events(store_id, actor_id, action, subject_id, details)
  VALUES (
    p_store, v_actor, 'supplier.ledger_v19', p_supplier,
    jsonb_build_object(
      'entry_id', v_entry_id,
      'request_id', v_req,
      'entry_type', p_entry_type,
      'amount_minor', p_amount,
      'delta_minor', v_delta,
      'balance_after_minor', v_new_bal,
      'invoice_no', p_invoice_no,
      'note', left(coalesce(p_note, ''), 200)
    )
  );

  RETURN jsonb_build_object(
    'entry_id', v_entry_id,
    'supplier_id', p_supplier,
    'delta_minor', v_delta,
    'balance_after_minor', v_new_bal
  );
END $body$;
REVOKE ALL ON FUNCTION public.retail_record_supplier_ledger_v19(uuid, uuid, text, bigint, text, text, uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_record_supplier_ledger_v19(uuid, uuid, text, bigint, text, text, uuid, numeric, text, uuid) TO authenticated;

-- 11. Finance, Treasury, Revenues & Expenses (دارایی: سندووق، داهات، خەرجی، جووڵەی پارە)
CREATE TABLE IF NOT EXISTS public.retail_finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id) ON DELETE CASCADE,
  entry_kind text NOT NULL CHECK (entry_kind IN ('revenue', 'expense', 'drawer_to_safe', 'safe_to_drawer', 'safe_deposit', 'safe_withdraw')),
  category text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  wallet text NOT NULL DEFAULT 'safe' CHECK (wallet IN ('safe', 'cash_drawer')),
  payee text,
  reference_no text,
  note text,
  actor_id uuid REFERENCES auth.users(id),
  request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS retail_finance_entries_store_req_idx
  ON public.retail_finance_entries(store_id, request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS retail_finance_entries_store_kind_idx
  ON public.retail_finance_entries(store_id, entry_kind, created_at DESC);
ALTER TABLE public.retail_finance_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retail_finance_entries' AND policyname = 'retail_finance_entries_member_all'
  ) THEN
    CREATE POLICY retail_finance_entries_member_all ON public.retail_finance_entries
      FOR ALL TO authenticated
      USING (public.retail_is_store_member(store_id))
      WITH CHECK (public.retail_is_store_member(store_id));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_finance_entries TO authenticated;

-- 12. Product Cost Tracking for Profit & Inventory Valuation Reports (ڕاپۆرت و شیکاری: تێچووی کاڵا و قازانج)
CREATE TABLE IF NOT EXISTS public.retail_product_costs (
  store_id uuid NOT NULL REFERENCES public.retail_stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.retail_products(id) ON DELETE CASCADE,
  unit_cost_minor bigint NOT NULL CHECK (unit_cost_minor >= 0),
  note text,
  actor_id uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, product_id)
);
ALTER TABLE public.retail_product_costs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retail_product_costs' AND policyname = 'retail_product_costs_member_all'
  ) THEN
    CREATE POLICY retail_product_costs_member_all ON public.retail_product_costs
      FOR ALL TO authenticated
      USING (public.retail_is_store_member(store_id))
      WITH CHECK (public.retail_is_store_member(store_id));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_product_costs TO authenticated;

-- 13. Staff Profiles & Store System Settings (ڕێکخستنەکان: بەکارهێنەران، دەسەڵاتەکان، ئامێرەکان، سیستەم)
CREATE TABLE IF NOT EXISTS public.retail_staff_profiles (
  store_id uuid NOT NULL REFERENCES public.retail_stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  job_title text,
  phone text,
  email text,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'manager', 'cashier')),
  active boolean NOT NULL DEFAULT true,
  pin_code text,
  note text,
  actor_id uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id)
);
ALTER TABLE public.retail_staff_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retail_staff_profiles' AND policyname = 'retail_staff_profiles_member_all'
  ) THEN
    CREATE POLICY retail_staff_profiles_member_all ON public.retail_staff_profiles
      FOR ALL TO authenticated
      USING (public.retail_is_store_member(store_id))
      WITH CHECK (public.retail_is_store_member(store_id));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_staff_profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.retail_store_settings (
  store_id uuid PRIMARY KEY REFERENCES public.retail_stores(id) ON DELETE CASCADE,
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_store_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retail_store_settings' AND policyname = 'retail_store_settings_member_all'
  ) THEN
    CREATE POLICY retail_store_settings_member_all ON public.retail_store_settings
      FOR ALL TO authenticated
      USING (public.retail_is_store_member(store_id))
      WITH CHECK (public.retail_is_store_member(store_id));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_store_settings TO authenticated;

-- 14. Offers, Discounts, Coupons & Marketing Campaigns (ئۆفەر و داشکاندن: ئۆفەری نوێ، داشکاندن، کوپۆن، کەمپەین)
CREATE TABLE IF NOT EXISTS public.retail_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  campaign_type text NOT NULL DEFAULT 'seasonal',
  start_date date,
  end_date date,
  budget_minor bigint NOT NULL DEFAULT 0 CHECK (budget_minor >= 0),
  default_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (default_pct >= 0 AND default_pct <= 100),
  channel text,
  slogan text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retail_campaigns' AND policyname = 'retail_campaigns_member_all'
  ) THEN
    CREATE POLICY retail_campaigns_member_all ON public.retail_campaigns
      FOR ALL TO authenticated
      USING (public.retail_is_store_member(store_id))
      WITH CHECK (public.retail_is_store_member(store_id));
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_campaigns TO authenticated;

CREATE TABLE IF NOT EXISTS public.retail_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id) ON DELETE CASCADE,
  title text NOT NULL,
  offer_type text NOT NULL DEFAULT 'item_special',
  product_id uuid REFERENCES public.retail_products(id) ON DELETE SET NULL,
  min_qty numeric(12,3) NOT NULL DEFAULT 1 CHECK (min_qty > 0),
  free_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (free_qty >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  start_date date,
  end_date date,
  campaign_id uuid REFERENCES public.retail_campaigns(id) ON DELETE SET NULL,
  used_count integer NOT NULL DEFAULT 0,
  total_saved_minor bigint NOT NULL DEFAULT 0,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_offers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retail_offers' AND policyname = 'retail_offers_member_all'
  ) THEN
    CREATE POLICY retail_offers_member_all ON public.retail_offers
      FOR ALL TO authenticated
      USING (public.retail_is_store_member(store_id))
      WITH CHECK (public.retail_is_store_member(store_id));
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_offers TO authenticated;

CREATE TABLE IF NOT EXISTS public.retail_discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  scope text NOT NULL DEFAULT 'basket_total',
  product_id uuid REFERENCES public.retail_products(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'percent' CHECK (mode IN ('percent', 'fixed_iqd')),
  value numeric(12,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  min_basket_minor bigint NOT NULL DEFAULT 0 CHECK (min_basket_minor >= 0),
  max_cap_minor bigint NOT NULL DEFAULT 0 CHECK (max_cap_minor >= 0),
  auto_pos boolean NOT NULL DEFAULT true,
  used_count integer NOT NULL DEFAULT 0,
  total_saved_minor bigint NOT NULL DEFAULT 0,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retail_discount_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retail_discount_rules' AND policyname = 'retail_discount_rules_member_all'
  ) THEN
    CREATE POLICY retail_discount_rules_member_all ON public.retail_discount_rules
      FOR ALL TO authenticated
      USING (public.retail_is_store_member(store_id))
      WITH CHECK (public.retail_is_store_member(store_id));
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_discount_rules TO authenticated;

CREATE TABLE IF NOT EXISTS public.retail_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'fixed_iqd' CHECK (kind IN ('fixed_iqd', 'percent')),
  value numeric(12,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  min_spend_minor bigint NOT NULL DEFAULT 0 CHECK (min_spend_minor >= 0),
  max_discount_minor bigint NOT NULL DEFAULT 0 CHECK (max_discount_minor >= 0),
  max_uses integer NOT NULL DEFAULT 0 CHECK (max_uses >= 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  total_saved_minor bigint NOT NULL DEFAULT 0 CHECK (total_saved_minor >= 0),
  expiry_date date,
  customer_id uuid REFERENCES public.retail_customers(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.retail_campaigns(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);
ALTER TABLE public.retail_coupons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'retail_coupons' AND policyname = 'retail_coupons_member_all'
  ) THEN
    CREATE POLICY retail_coupons_member_all ON public.retail_coupons
      FOR ALL TO authenticated
      USING (public.retail_is_store_member(store_id))
      WITH CHECK (public.retail_is_store_member(store_id));
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_coupons TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.retail_products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.retail_barcodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_product_cartons TO authenticated;
NOTIFY pgrst, 'reload schema';
