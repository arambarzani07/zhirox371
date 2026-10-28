-- Upgrade the existing Retail OS V8+ schema. Review against a backup before hosted deployment.
-- This file is also executed in disposable PostgreSQL integration tests.
BEGIN;
ALTER TABLE public.retail_products ADD COLUMN IF NOT EXISTS base_unit text NOT NULL DEFAULT 'unit', ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.retail_stock_events ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES auth.users(id), ADD COLUMN IF NOT EXISTS request_id uuid, ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.retail_sale_items ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS base_unit_snapshot text NOT NULL DEFAULT 'unit';
CREATE OR REPLACE FUNCTION public.retail_is_store_member(p_store uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $member$
 SELECT retail_internal.has_role(p_store,ARRAY['manager','cashier']);
$member$;
REVOKE ALL ON FUNCTION public.retail_is_store_member(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_is_store_member(uuid) TO authenticated;
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

ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS refunded boolean NOT NULL DEFAULT false;
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS discount_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS return_request_id uuid;
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS return_session_id uuid;
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS return_actor_id uuid;
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS restored_units numeric(14,3);

CREATE UNIQUE INDEX IF NOT EXISTS retail_sales_store_return_request_idx
  ON public.retail_sales(store_id, return_request_id)
  WHERE return_request_id IS NOT NULL;


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
  v_sale uuid;v_prior_status text;v_prior_payload jsonb;v_prior_actor uuid;
  v_request_payload jsonb;v_cash_session uuid;
  v_entry jsonb;v_barcode text;v_qty bigint;v_expected_price bigint;v_expected_units numeric;
  v_product uuid;v_name text;v_pack_type text;v_pack_units integer;v_pack_price bigint;
  v_pactive boolean;v_currency text;v_unit_kg_price bigint;
  v_plu_raw text;v_weight_grams integer;v_weight_kg numeric(14,3);v_plu_count integer;
  v_line_base_units numeric(14,3);v_snapshot_name text;
  v_discount bigint := greatest(coalesce(p_discount, 0), 0);
  v_need jsonb := '{}'::jsonb;v_old_units numeric;v_total numeric := 0;v_net_total numeric := 0;
  v_stock numeric;v_record record;v_receipt_number bigint;
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
    IF (v_entry->>'quantity')!~'^[0-9]{1,6}$'
      OR (v_entry->>'expected_price_minor')!~'^[0-9]{1,10}$'
      OR (v_entry->>'expected_units')!~'^[0-9]{1,6}(\.[0-9]{1,3})?$'
    THEN RAISE EXCEPTION 'Invalid quantity or expected price' USING errcode='22023';END IF;
    IF (v_entry->>'quantity')::bigint NOT BETWEEN 1 AND 100000
      OR (v_entry->>'expected_price_minor')::bigint>999999999
      OR (v_entry->>'expected_units')::numeric<=0
      OR (v_entry->>'expected_units')::numeric>100000
    THEN RAISE EXCEPTION 'Invalid quantity or expected price' USING errcode='22023';END IF;
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
    v_weight_kg := NULL;
    v_barcode := v_entry->>'barcode';
    v_qty := (v_entry->>'quantity')::bigint;
    v_expected_price := (v_entry->>'expected_price_minor')::bigint;
    v_expected_units := (v_entry->>'expected_units')::numeric;

    -- Step 1: Check registered ordinary unit/carton barcodes FIRST
    SELECT b.product_id,b.unit_type,b.units_per_scan,p.name,p.active,p.currency,
     CASE WHEN b.unit_type='carton' THEN c.sale_price_minor ELSE p.price_minor END
    INTO v_product,v_pack_type,v_pack_units,v_name,v_pactive,v_currency,v_pack_price
    FROM public.retail_barcodes b
     JOIN public.retail_products p ON p.store_id=b.store_id AND p.id=b.product_id
     LEFT JOIN public.retail_product_cartons c ON c.store_id=b.store_id AND c.product_id=b.product_id
    WHERE b.store_id=p_store AND b.code=v_barcode AND b.active
    FOR SHARE OF b,p;

    IF FOUND THEN
      IF (SELECT base_unit FROM public.retail_products WHERE id=v_product AND store_id=p_store)<>'unit'
         OR NOT v_pactive OR v_currency<>'IQD'
         OR v_pack_type NOT IN ('unit','carton')
         OR v_pack_units IS NULL OR v_pack_units<1
         OR v_pack_price IS NULL
         OR (v_pack_type='unit' AND v_pack_units<>1)
         OR v_expected_price<>v_pack_price OR v_expected_units<>v_pack_units
      THEN RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';END IF;
      v_line_base_units := (v_qty * v_pack_units)::numeric(14,3);
      v_snapshot_name := v_name || CASE WHEN v_pack_type='carton' THEN ' (کارتۆن)' ELSE ' (دانە)' END;
    ELSE
      -- Step 2: Verified scale barcode format ONLY (Prefix 27 + 5-digit PLU + 5-digit weight in grams + EAN-13 checksum)
      IF v_barcode !~ '^27[0-9]{11}$' OR NOT retail_internal.is_valid_ean13(v_barcode) THEN
        RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';
      END IF;
      v_plu_raw := substring(v_barcode FROM 3 FOR 5);
      v_weight_grams := substring(v_barcode FROM 8 FOR 5)::integer;
      IF v_plu_raw = '00000' OR v_weight_grams <= 0 OR v_qty<>1 THEN
        RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';
      END IF;

      SELECT count(*)
      INTO v_plu_count
      FROM public.retail_products p
      WHERE p.store_id = p_store
        AND p.active = true
        AND p.base_unit = 'kg'
        AND p.currency = 'IQD'
        AND p.price_minor IS NOT NULL
        AND p.price_minor > 0
        AND p.plu IS NOT NULL
        AND (
          btrim(p.plu) = v_plu_raw
          OR (btrim(p.plu) ~ '^[0-9]{1,5}$' AND lpad(btrim(p.plu), 5, '0') = v_plu_raw)
        )
        AND (
          EXISTS (
            SELECT 1 FROM public.retail_barcodes bu
            WHERE bu.store_id = p.store_id AND bu.product_id = p.id
              AND bu.unit_type = 'unit' AND bu.active = true AND bu.units_per_scan = 1
          )
          OR NOT EXISTS (
            SELECT 1 FROM public.retail_barcodes bc
            WHERE bc.store_id = p.store_id AND bc.product_id = p.id
              AND bc.unit_type = 'carton' AND bc.active = true
          )
        );

      IF v_plu_count <> 1 THEN
        RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';
      END IF;

      SELECT p.id, p.name, p.active, p.currency, p.price_minor
      INTO v_product, v_name, v_pactive, v_currency, v_unit_kg_price
      FROM public.retail_products p
      WHERE p.store_id = p_store
        AND p.active = true
        AND p.base_unit = 'kg'
        AND p.currency = 'IQD'
        AND p.price_minor IS NOT NULL
        AND p.price_minor > 0
        AND p.plu IS NOT NULL
        AND (
          btrim(p.plu) = v_plu_raw
          OR (btrim(p.plu) ~ '^[0-9]{1,5}$' AND lpad(btrim(p.plu), 5, '0') = v_plu_raw)
        )
      FOR SHARE OF p;

      v_pack_price := round((v_unit_kg_price::numeric * v_weight_grams::numeric) / 1000.0)::bigint;
      v_weight_kg := round((v_weight_grams::numeric / 1000.0), 3);
      v_pack_type := 'unit';
      v_pack_units := 1;

      IF v_pack_price <= 0
         OR v_expected_price <> v_pack_price
         OR (v_expected_units <> 1 AND v_expected_units <> v_weight_kg)
      THEN
        RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';
      END IF;

      v_line_base_units := round(v_qty::numeric * v_weight_kg, 3);
      v_snapshot_name := v_name || ' (' || to_char(v_weight_kg, 'FM999990.000') || ' کگم)';
    END IF;

    v_total := v_total + v_qty * v_pack_price;
    IF v_total > 9999999999999 THEN RAISE EXCEPTION 'Sale total too large' USING errcode='22023';END IF;
    v_old_units := coalesce((v_need->>v_product::text)::numeric, 0);
    v_need := jsonb_set(v_need, array[v_product::text], to_jsonb(round(v_old_units + v_line_base_units, 3)));

    INSERT INTO public.retail_sale_items(
     store_id,sale_id,product_id,quantity,unit_price_minor,product_name_snapshot,
     package_type,package_barcode,units_per_package,base_units,base_unit_snapshot)
    VALUES(p_store,v_sale,v_product,CASE WHEN v_weight_kg IS NOT NULL THEN v_line_base_units ELSE v_qty END,
      CASE WHEN v_weight_kg IS NOT NULL THEN v_unit_kg_price ELSE v_pack_price END,
      v_snapshot_name,v_pack_type,v_barcode,v_pack_units,v_line_base_units,CASE WHEN v_weight_kg IS NOT NULL THEN 'kg' ELSE 'unit' END);
  END LOOP;

  IF v_discount > v_total THEN
    RAISE EXCEPTION 'Barcode price/pack changed or inactive' USING errcode='22023';
  END IF;
  v_net_total := v_total - v_discount;
  IF p_cash_received < v_net_total THEN
    RAISE EXCEPTION 'Cash amount is below total' USING errcode='22023';
  END IF;

  -- Sorted product-level stock locks: unit, carton, and fractional scale items share one stock balance.
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
REVOKE ALL ON FUNCTION public.retail_checkout_packs_v16(uuid,uuid,jsonb,bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_checkout_packs_v16(uuid,uuid,jsonb,bigint,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_return_sale_v19(
  p_store uuid,
  p_sale uuid,
  p_session uuid,
  p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_existing record;
  v_sale record;
  v_item record;
  v_restored numeric(14,3) := 0;
  v_base numeric(14,3) := 0;
  v_shift_status text;
  v_shift_cashier uuid;
BEGIN
  IF v_actor IS NULL OR NOT retail_internal.has_role(p_store, array['manager','cashier']) THEN
    RAISE EXCEPTION 'Cashier permission required' USING errcode = '42501';
  END IF;
  IF p_store IS NULL OR p_sale IS NULL OR p_session IS NULL OR p_request IS NULL THEN
    RAISE EXCEPTION 'Invalid sale return request' USING errcode = '22023';
  END IF;

  -- Check completed return request BEFORE locking the active shift so an ambiguous
  -- network retry succeeds idempotently even if the shift was subsequently closed.
  SELECT id, receipt_no, total_minor, status, refunded, return_request_id, return_session_id, return_actor_id, restored_units
  INTO v_existing
  FROM public.retail_sales
  WHERE store_id = p_store AND return_request_id = p_request;

  IF FOUND THEN
    IF v_existing.id IS DISTINCT FROM p_sale
       OR v_existing.return_session_id IS DISTINCT FROM p_session
       OR v_existing.return_actor_id IS DISTINCT FROM v_actor
    THEN
      RAISE EXCEPTION 'Return request reused with changed actor or payload' USING errcode = '23505';
    END IF;
    RETURN jsonb_build_object(
      'sale_id', v_existing.id,
      'receipt_no', v_existing.receipt_no,
      'refunded_minor', v_existing.total_minor,
      'restored_units', coalesce(v_existing.restored_units, 0),
      'request_id', p_request,
      'idempotent', true
    );
  END IF;

  SELECT id, receipt_no, total_minor, status, refunded, return_request_id, return_session_id, return_actor_id, restored_units
  INTO v_sale
  FROM public.retail_sales
  WHERE store_id = p_store AND id = p_sale
  FOR UPDATE;

  IF NOT FOUND OR v_sale.status <> 'posted' THEN
    RAISE EXCEPTION 'Receipt cannot be refunded' USING errcode = '22023';
  END IF;

  -- Re-check after acquiring row lock on retail_sales to serialize concurrent identical retries.
  IF v_sale.refunded THEN
    IF v_sale.return_request_id = p_request THEN
      IF v_sale.return_session_id IS DISTINCT FROM p_session
         OR v_sale.return_actor_id IS DISTINCT FROM v_actor
      THEN
        RAISE EXCEPTION 'Return request reused with changed actor or payload' USING errcode = '23505';
      END IF;
      RETURN jsonb_build_object(
        'sale_id', v_sale.id,
        'receipt_no', v_sale.receipt_no,
        'refunded_minor', v_sale.total_minor,
        'restored_units', coalesce(v_sale.restored_units, 0),
        'request_id', p_request,
        'idempotent', true
      );
    END IF;
    RAISE EXCEPTION 'Receipt cannot be refunded' USING errcode = '22023';
  END IF;

  -- Prevent hijacking a pre-existing unrelated cash movement UUID for a new sale return.
  IF EXISTS (
    SELECT 1 FROM public.retail_cash_movements
    WHERE store_id = p_store AND request_id = p_request
  ) THEN
    RAISE EXCEPTION 'Return request reused with changed actor or payload' USING errcode = '23505';
  END IF;

  IF v_sale.total_minor > 0 THEN
    PERFORM public.retail_cash_movement(
      p_store,
      p_session,
      p_request,
      'cash_out',
      v_sale.total_minor,
      'گەڕاندنەوەی پسووڵە #' || lpad(v_sale.receipt_no::text, 6, '0')
    );
  ELSE
    SELECT status, cashier_id INTO v_shift_status, v_shift_cashier
    FROM public.retail_cash_sessions
    WHERE id = p_session AND store_id = p_store
    FOR UPDATE;
    IF NOT FOUND OR v_shift_status <> 'open' OR v_shift_cashier <> v_actor THEN
      RAISE EXCEPTION 'Shift not open for user' USING errcode = '42501';
    END IF;
  END IF;

  -- Restore stock in deterministic product_id order and record an immutable,
  -- correlated positive stock movement in public.retail_stock_events.
  FOR v_item IN
    SELECT
      product_id,
      round(sum(coalesce(base_units, quantity * coalesce(units_per_package, 1)))::numeric, 3) AS units_to_restore
    FROM public.retail_sale_items
    WHERE store_id = p_store AND sale_id = p_sale
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    v_base := round(v_item.units_to_restore, 3);
    IF v_base <= 0 THEN
      RAISE EXCEPTION 'Invalid sale item units for return' USING errcode = '22023';
    END IF;
    INSERT INTO public.retail_stock_balances(store_id, product_id, quantity)
    VALUES (p_store, v_item.product_id, v_base)
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET
      quantity = round(public.retail_stock_balances.quantity + EXCLUDED.quantity, 3),
      updated_at = now();

    INSERT INTO public.retail_stock_events(store_id, product_id, delta, reason, sale_id)
    VALUES (p_store, v_item.product_id, v_base, 'sale_return', p_sale);

    v_restored := round(v_restored + v_base, 3);
  END LOOP;

  IF v_restored <= 0 THEN
    RAISE EXCEPTION 'Receipt cannot be refunded' USING errcode = '22023';
  END IF;

  UPDATE public.retail_sales
  SET refunded = true,
      return_request_id = p_request,
      return_session_id = p_session,
      return_actor_id = v_actor,
      refunded_at = now(),
      restored_units = v_restored
  WHERE store_id = p_store AND id = p_sale;

  INSERT INTO public.retail_audit_events(store_id, actor_id, subject_id, action, details)
  VALUES (
    p_store, v_actor, p_sale, 'sale.return_v19',
    jsonb_build_object(
      'receipt_no', v_sale.receipt_no,
      'refunded_minor', v_sale.total_minor,
      'restored_units', v_restored,
      'request_id', p_request,
      'session_id', p_session
    )
  );

  RETURN jsonb_build_object(
    'sale_id', v_sale.id,
    'receipt_no', v_sale.receipt_no,
    'refunded_minor', v_sale.total_minor,
    'restored_units', v_restored,
    'request_id', p_request,
    'idempotent', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.retail_return_sale_v19(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
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


DROP FUNCTION IF EXISTS public.retail_update_product_v15(uuid,uuid,bigint,jsonb);
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

GRANT EXECUTE ON FUNCTION public.retail_product_snapshot_v15(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retail_product_snapshot_v15(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retail_product_history_v15(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retail_product_history_v15(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.retail_update_product_v15(uuid, uuid, integer, jsonb) TO authenticated;
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
ALTER TABLE public.retail_customers
 ADD COLUMN IF NOT EXISTS address text,
 ADD COLUMN IF NOT EXISTS balance_minor bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS due_date date,
 ADD COLUMN IF NOT EXISTS note text,
 ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
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
  company text,
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
  po_no text NOT NULL,
  supplier_name text,
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
  supplier_name text,
  product_name text,
  unit_cost_minor bigint CHECK (unit_cost_minor >= 0),
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

CREATE OR REPLACE FUNCTION public.retail_catalog_page_v18(
  p_store uuid,
  p_search text DEFAULT '',
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50,
  p_stock_filter text DEFAULT 'all'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_search, '')));
  v_sf text := coalesce(p_stock_filter, 'all');
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store, array['manager','cashier']) THEN
    RAISE EXCEPTION 'Catalog permission required' USING errcode = '42501';
  END IF;

  SELECT count(*)
  INTO v_total
  FROM public.retail_products p
  LEFT JOIN public.retail_stock_balances s ON s.store_id = p.store_id AND s.product_id = p.id
  WHERE p.store_id = p_store
    AND (
      v_sf = 'all'
      OR (v_sf = 'low' AND coalesce(s.quantity, 0) <= 5)
      OR (v_sf = 'out' AND coalesce(s.quantity, 0) <= 0)
    )
    AND (
      v_q = ''
      OR lower(p.name) LIKE '%' || v_q || '%'
      OR (p.sku IS NOT NULL AND lower(p.sku) LIKE '%' || v_q || '%')
      OR (p.plu IS NOT NULL AND lower(p.plu) LIKE '%' || v_q || '%')
      OR EXISTS (
        SELECT 1 FROM public.retail_barcodes b
        WHERE b.store_id = p.store_id
          AND b.product_id = p.id
          AND b.active = true
          AND lower(b.code) LIKE '%' || v_q || '%'
      )
    );

  SELECT coalesce(jsonb_agg(row_to_json(row_item)::jsonb), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      p.id,
      p.base_unit,
      p.name,
      p.sku,
      p.plu,
      p.price_minor,
      CASE
        WHEN c.product_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.retail_barcodes bu
          WHERE bu.store_id = p.store_id AND bu.product_id = p.id AND bu.unit_type = 'unit' AND bu.active = true
        ) THEN 'both'
        WHEN c.product_id IS NOT NULL THEN 'carton'
        ELSE 'unit'
      END AS sale_mode,
      p.active,
      p.currency,
      c.carton_name,
      c.units_per_carton,
      c.sale_price_minor AS carton_price_minor,
      coalesce(s.quantity, 0) AS stock_quantity,
      coalesce((
        SELECT jsonb_agg(b.code ORDER BY b.unit_type DESC, b.code)
        FROM public.retail_barcodes b
        WHERE b.store_id = p.store_id AND b.product_id = p.id AND b.active = true
      ), '[]'::jsonb) AS barcodes,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'code', b.code,
          'unit_type', b.unit_type,
          'units_per_scan', b.units_per_scan,
          'price_minor', CASE WHEN b.unit_type = 'carton' THEN c.sale_price_minor ELSE p.price_minor END
        ) ORDER BY b.code)
        FROM public.retail_barcodes b
        WHERE b.store_id = p.store_id AND b.product_id = p.id AND b.active = true
      ), '[]'::jsonb) AS barcode_details
    FROM public.retail_products p
    LEFT JOIN public.retail_product_cartons c ON c.store_id = p.store_id AND c.product_id = p.id
    LEFT JOIN public.retail_stock_balances s ON s.store_id = p.store_id AND s.product_id = p.id
    WHERE p.store_id = p_store
      AND (
        v_sf = 'all'
        OR (v_sf = 'low' AND coalesce(s.quantity, 0) <= 5)
        OR (v_sf = 'out' AND coalesce(s.quantity, 0) <= 0)
      )
      AND (
        v_q = ''
        OR lower(p.name) LIKE '%' || v_q || '%'
        OR (p.sku IS NOT NULL AND lower(p.sku) LIKE '%' || v_q || '%')
        OR (p.plu IS NOT NULL AND lower(p.plu) LIKE '%' || v_q || '%')
        OR EXISTS (
          SELECT 1 FROM public.retail_barcodes b
          WHERE b.store_id = p.store_id
            AND b.product_id = p.id
            AND b.active = true
            AND lower(b.code) LIKE '%' || v_q || '%'
        )
      )
    ORDER BY p.created_at DESC, p.id ASC
    OFFSET v_off LIMIT v_lim
  ) row_item;

  RETURN jsonb_build_object(
    'total_count', v_total,
    'offset', v_off,
    'limit', v_lim,
    'items', v_items
  );
END;
$$;
REVOKE ALL ON FUNCTION public.retail_catalog_page_v18(uuid, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_catalog_page_v18(uuid, text, integer, integer, text) TO authenticated;

-- 4. Paginated Barcode Directory & Inspection RPC across 150,000+ barcodes
CREATE OR REPLACE FUNCTION public.retail_barcode_page_v18(
  p_store uuid,
  p_search text DEFAULT '',
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_q text := lower(btrim(coalesce(p_search, '')));
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store, array['manager','cashier']) THEN
    RAISE EXCEPTION 'Barcode directory permission required' USING errcode = '42501';
  END IF;

  SELECT count(*)
  INTO v_total
  FROM public.retail_barcodes b
  JOIN public.retail_products p ON p.store_id = b.store_id AND p.id = b.product_id
  WHERE b.store_id = p_store
    AND b.active = true
    AND (
      v_q = ''
      OR lower(b.code) LIKE '%' || v_q || '%'
      OR lower(p.name) LIKE '%' || v_q || '%'
      OR (p.sku IS NOT NULL AND lower(p.sku) LIKE '%' || v_q || '%')
      OR (p.plu IS NOT NULL AND lower(p.plu) LIKE '%' || v_q || '%')
    );

  SELECT coalesce(jsonb_agg(row_to_json(row_b)::jsonb), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      b.code,
      b.product_id,
      p.name AS product_name,
      b.unit_type,
      b.units_per_scan,
      CASE WHEN b.unit_type = 'carton' THEN c.sale_price_minor ELSE p.price_minor END AS price_minor,
      (
        b.code = coalesce(p.unit_primary_barcode, (
          SELECT min(bu.code) FROM public.retail_barcodes bu
          WHERE bu.store_id = p.store_id AND bu.product_id = p.id AND bu.unit_type = 'unit' AND bu.active = true
        ))
        OR b.code = c.barcode
      ) AS is_primary,
      b.active,
      p.active AS product_active
    FROM public.retail_barcodes b
    JOIN public.retail_products p ON p.store_id = b.store_id AND p.id = b.product_id
    LEFT JOIN public.retail_product_cartons c ON c.store_id = b.store_id AND c.product_id = b.product_id
    WHERE b.store_id = p_store
      AND b.active = true
      AND (
        v_q = ''
        OR lower(b.code) LIKE '%' || v_q || '%'
        OR lower(p.name) LIKE '%' || v_q || '%'
        OR (p.sku IS NOT NULL AND lower(p.sku) LIKE '%' || v_q || '%')
        OR (p.plu IS NOT NULL AND lower(p.plu) LIKE '%' || v_q || '%')
      )
    ORDER BY b.code ASC
    OFFSET v_off LIMIT v_lim
  ) row_b;

  RETURN jsonb_build_object(
    'total_count', v_total,
    'offset', v_off,
    'limit', v_lim,
    'items', v_items
  );
END;
$$;
REVOKE ALL ON FUNCTION public.retail_barcode_page_v18(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_barcode_page_v18(uuid, text, integer, integer) TO authenticated;


-- v19 resolves exact codes and verified prefix 27 five-digit grams scale labels.
-- No list of scale barcodes is materialized: barcode 2700001002451 => 0.245 kg.
CREATE OR REPLACE FUNCTION public.retail_resolve_barcode_v18(p_store uuid,p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
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
 v_scale:=v_code ~ '^27[0-9]{11}$' AND NOT EXISTS(SELECT 1 FROM public.retail_barcodes WHERE store_id=p_store AND code=v_code AND active);
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
   b.code AS registered_code,b.unit_type,b.units_per_scan,CASE WHEN b.unit_type='carton' THEN c.sale_price_minor ELSE p.price_minor END AS price_minor,
   p.unit_primary_barcode
 INTO v_row
 FROM public.retail_barcodes b
 JOIN public.retail_products p ON p.id=b.product_id AND p.store_id=b.store_id
 LEFT JOIN public.retail_product_cartons c ON c.store_id=p.store_id AND c.product_id=p.id
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
     'units_per_scan',b.units_per_scan,'price_minor',CASE WHEN b.unit_type='carton' THEN (SELECT c.sale_price_minor FROM public.retail_product_cartons c WHERE c.store_id=b.store_id AND c.product_id=b.product_id) ELSE v_row.unit_price_minor END,
     'active',b.active
   ) ORDER BY b.code),'[]'::jsonb) INTO v_aliases
 FROM public.retail_barcodes b WHERE b.store_id=p_store
   AND b.product_id=v_row.product_id AND b.active;
 v_prefix:=(v_row.base_unit='kg' AND length(v_code)=7) OR EXISTS(SELECT 1 FROM public.retail_barcodes WHERE store_id=p_store AND active AND length(code)>length(v_code) AND left(code,length(v_code))=v_code);
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
CREATE OR REPLACE FUNCTION public.retail_checkout_weight_v19(p_store uuid,p_request uuid,p_items jsonb,p_cash_received bigint,p_discount bigint DEFAULT 0)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $route$
 SELECT public.retail_checkout_packs_v16(p_store,p_request,p_items,p_cash_received,p_discount);
$route$;
REVOKE ALL ON FUNCTION public.retail_checkout_weight_v19(uuid,uuid,jsonb,bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_checkout_weight_v19(uuid,uuid,jsonb,bigint,bigint) TO authenticated;
-- Stock receiving RPCs copied from the transaction-tested V17/V17.1 contracts.
CREATE TABLE IF NOT EXISTS public.retail_stock_receipt_requests_v17 (
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

CREATE OR REPLACE FUNCTION public.retail_receive_packs_v17(
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
 -- A committed request must be replayable even if its source barcode was
 -- retired after the first successful stock receipt. Check the immutable
 -- request record before resolving current barcode definitions.
 SELECT * INTO v_existing FROM public.retail_stock_receipt_requests_v17
  WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
   IF v_existing.actor_id IS DISTINCT FROM v_actor
      OR v_existing.barcode IS DISTINCT FROM p_barcode
      OR v_existing.packages IS DISTINCT FROM p_packages
      OR v_existing.units_per_package IS DISTINCT FROM p_expected_units
      OR v_existing.reason IS DISTINCT FROM p_reason
   THEN RAISE EXCEPTION 'Stock receipt request reused' USING errcode='23505';END IF;
   RETURN v_existing.total_stock;
 END IF;
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
CREATE TABLE IF NOT EXISTS public.retail_stock_mixed_receipts_v171(
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

CREATE OR REPLACE FUNCTION public.retail_receive_mixed_v171(
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
CREATE TABLE IF NOT EXISTS retail_internal.stock_receive_requests(
 store_id uuid NOT NULL REFERENCES public.retail_stores(id),request_id uuid NOT NULL,actor_id uuid NOT NULL,
 fingerprint jsonb NOT NULL,base_units numeric(14,3),result_quantity numeric(14,3),PRIMARY KEY(store_id,request_id)
);
REVOKE ALL ON retail_internal.stock_receive_requests FROM PUBLIC,anon,authenticated;
-- V19 kilogram receipt: decimal kg precision, atomic stock and idempotent request UUID.
CREATE OR REPLACE FUNCTION retail_internal.receive_weight_v19(
 p_store uuid,p_barcode text,p_kg numeric,p_reason text,p_request uuid
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid:=(SELECT auth.uid());v_product uuid;v_stock numeric(14,3);v_prev record;
 v_payload jsonb;
BEGIN
 IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager'])
 THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_reason NOT IN ('purchase','opening') OR
    p_kg IS NULL OR p_kg<0.001 OR p_kg>1000000 OR p_kg<>round(p_kg,3)
 THEN RAISE EXCEPTION 'Invalid kg receipt' USING ERRCODE='22023'; END IF;
 SELECT p.id INTO v_product
 FROM public.retail_products p
 JOIN public.retail_barcodes b ON b.store_id=p.store_id AND b.product_id=p.id
 WHERE p.store_id=p_store AND b.code=p_barcode AND b.active
   AND b.unit_type='unit' AND b.units_per_scan=1
   AND p.active AND p.base_unit='kg';
 IF NOT FOUND THEN RAISE EXCEPTION 'Active kg product barcode required' USING ERRCODE='22023'; END IF;
 v_payload:=jsonb_build_object('mode','kg','product_id',v_product,
    'barcode',p_barcode,'kg',p_kg,'reason',p_reason);
 INSERT INTO retail_internal.stock_receive_requests(store_id,request_id,actor_id,fingerprint)
 VALUES(p_store,p_request,v_actor,v_payload)
 ON CONFLICT(store_id,request_id) DO NOTHING;
 SELECT actor_id,fingerprint,result_quantity INTO v_prev
 FROM retail_internal.stock_receive_requests
 WHERE store_id=p_store AND request_id=p_request FOR UPDATE;
 IF v_prev.actor_id IS DISTINCT FROM v_actor OR v_prev.fingerprint IS DISTINCT FROM v_payload
 THEN RAISE EXCEPTION 'Request reused with changed payload' USING ERRCODE='22023'; END IF;
 IF v_prev.result_quantity IS NOT NULL THEN RETURN v_prev.result_quantity; END IF;
 INSERT INTO public.retail_stock_balances(store_id,product_id,quantity)
 VALUES(p_store,v_product,p_kg)
 ON CONFLICT(store_id,product_id) DO UPDATE
 SET quantity=public.retail_stock_balances.quantity+excluded.quantity,updated_at=now()
 RETURNING quantity INTO v_stock;
 INSERT INTO public.retail_stock_events(store_id,product_id,delta,reason)
 VALUES(p_store,v_product,p_kg,p_reason);
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 VALUES(p_store,v_actor,'stock.receive_kg_v19',v_product,
  jsonb_build_object('request_id',p_request,'kg',p_kg,'reason',p_reason));
 UPDATE retail_internal.stock_receive_requests
 SET base_units=p_kg,result_quantity=v_stock
 WHERE store_id=p_store AND request_id=p_request;
 RETURN v_stock;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.receive_weight_v19(uuid,text,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION retail_internal.receive_weight_v19(uuid,text,numeric,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_receive_weight_v19(
 p_store uuid,p_barcode text,p_kg numeric,p_reason text,p_request uuid
) RETURNS numeric LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT retail_internal.receive_weight_v19(p_store,p_barcode,p_kg,p_reason,p_request);
$fn$;
REVOKE ALL ON FUNCTION public.retail_receive_weight_v19(uuid,text,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_receive_weight_v19(uuid,text,numeric,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
-- BEGIN EMBEDDED V21 INTEGRITY
-- Apply after the corrected db/v19_complete_production_upgrade.sql, in a reviewed maintenance window.
-- Never automatically applied to a hosted database by the web app.

CREATE TABLE IF NOT EXISTS retail_internal.financial_requests(
 store_id uuid NOT NULL REFERENCES public.retail_stores(id), request_id uuid NOT NULL,
 actor_id uuid NOT NULL, action text NOT NULL, payload jsonb NOT NULL, result jsonb,
 PRIMARY KEY(store_id,request_id)
);
REVOKE ALL ON retail_internal.financial_requests FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION retail_internal.claim_financial_request(
 p_store uuid,p_request uuid,p_action text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v record;v_actor uuid:=(SELECT auth.uid());
BEGIN
 IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager','cashier'])
 THEN RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023';END IF;
 INSERT INTO retail_internal.financial_requests(store_id,request_id,actor_id,action,payload)
 VALUES(p_store,p_request,v_actor,p_action,p_payload) ON CONFLICT DO NOTHING;
 SELECT * INTO v FROM retail_internal.financial_requests WHERE store_id=p_store AND request_id=p_request FOR UPDATE;
 IF v.actor_id IS DISTINCT FROM v_actor OR v.action IS DISTINCT FROM p_action OR v.payload IS DISTINCT FROM p_payload
 THEN RAISE EXCEPTION 'Request reused with different actor or payload' USING ERRCODE='22023';END IF;
 RETURN v.result;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.claim_financial_request(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

-- Customer balances cannot be edited through the Data API.
DO $customers$
DECLARE p record;
BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='retail_customers' LOOP
  EXECUTE format('DROP POLICY %I ON public.retail_customers',p.policyname);
 END LOOP;
END $customers$;
CREATE POLICY customer_read ON public.retail_customers FOR SELECT TO authenticated USING(retail_internal.has_role(store_id,ARRAY['manager','cashier']));
CREATE POLICY customer_insert ON public.retail_customers FOR INSERT TO authenticated WITH CHECK(retail_internal.has_role(store_id,ARRAY['manager']));
CREATE POLICY customer_update ON public.retail_customers FOR UPDATE TO authenticated USING(retail_internal.has_role(store_id,ARRAY['manager'])) WITH CHECK(retail_internal.has_role(store_id,ARRAY['manager']));
REVOKE INSERT,UPDATE,DELETE ON public.retail_customers FROM authenticated;
GRANT INSERT(id,store_id,name,phone,address,credit_limit_minor,note,active,created_at,updated_at) ON public.retail_customers TO authenticated;
GRANT UPDATE(name,phone,address,credit_limit_minor,note,active,updated_at) ON public.retail_customers TO authenticated;
-- Existing authenticated financial ledgers must be append-only through reviewed RPCs.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.retail_customer_ledger,public.retail_supplier_ledger FROM PUBLIC,anon,authenticated;
-- Remove broad member-write policies on finance, costs, settings and staff.
DO $secure$
DECLARE t text;p record;
BEGIN
 FOR t IN SELECT unnest(ARRAY['retail_finance_entries','retail_product_costs','retail_staff_profiles','retail_store_settings','retail_suppliers','retail_purchase_orders']) LOOP
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  EXECUTE format('CREATE POLICY manager_access ON public.%I FOR ALL TO authenticated USING (retail_internal.has_role(store_id,ARRAY[''manager''])) WITH CHECK (retail_internal.has_role(store_id,ARRAY[''manager'']))',t);
 END LOOP;
 -- TRUNCATE is not protected by RLS. Revoke on every current Retail OS public table.
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND left(tablename,7)='retail_' LOOP
  EXECUTE format('REVOKE TRUNCATE ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $secure$;
-- Settings are readable by active POS members, but owner-only controls stay owner-only.
DROP POLICY IF EXISTS manager_access ON public.retail_store_settings;
CREATE POLICY settings_read_v21 ON public.retail_store_settings FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,ARRAY['manager','cashier']));
CREATE POLICY settings_owner_v21 ON public.retail_store_settings FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.retail_stores s WHERE s.id=retail_store_settings.store_id AND s.owner_user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.retail_stores s WHERE s.id=retail_store_settings.store_id AND s.owner_user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS manager_access ON public.retail_staff_profiles;
CREATE POLICY staff_owner_v21 ON public.retail_staff_profiles FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.retail_stores s WHERE s.id=retail_staff_profiles.store_id AND s.owner_user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.retail_stores s WHERE s.id=retail_staff_profiles.store_id AND s.owner_user_id=(SELECT auth.uid())));
-- Keep PINs out of clear-text persistence. Current login continues to use Supabase Auth.
REVOKE SELECT,INSERT,UPDATE ON public.retail_staff_profiles FROM authenticated;
GRANT SELECT(store_id,user_id,full_name,job_title,phone,email,role,active,note,actor_id,updated_at) ON public.retail_staff_profiles TO authenticated;
GRANT INSERT(store_id,user_id,full_name,job_title,phone,email,role,active,note,actor_id,updated_at) ON public.retail_staff_profiles TO authenticated;
GRANT UPDATE(full_name,job_title,phone,email,role,active,note,actor_id,updated_at) ON public.retail_staff_profiles TO authenticated;
-- Costs remain owner/manager-only and product writes use owner-only atomic catalog RPCs.
REVOKE INSERT,UPDATE,DELETE ON public.retail_products,public.retail_barcodes,public.retail_product_cartons FROM authenticated;
REVOKE SELECT ON public.retail_products FROM authenticated;
GRANT SELECT(id,store_id,name,price_minor,currency,active,created_at,sku,plu,catalog_version,unit_primary_barcode,base_unit,min_stock_level) ON public.retail_products TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_record_customer_ledger_v19(
 p_store uuid,p_customer uuid,p_entry_type text,p_amount bigint,p_note text DEFAULT NULL,
 p_receipt_no text DEFAULT NULL,p_due_date date DEFAULT NULL,p_sale_id uuid DEFAULT NULL,
 p_payment_method text DEFAULT NULL,p_request uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_balance bigint;v_limit bigint;v_delta bigint;v_id uuid;v_session uuid;
 v_payload jsonb:=jsonb_build_object('customer',p_customer,'type',p_entry_type,'amount',p_amount,'note',p_note,
 'receipt',p_receipt_no,'due',p_due_date,'sale',p_sale_id,'method',p_payment_method);
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'customer.ledger',v_payload);
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>9999999999999 OR p_entry_type IS NULL
 OR p_entry_type NOT IN ('opening_balance','debt_add','adjustment','payment_received')
 THEN RAISE EXCEPTION 'Invalid customer ledger entry; sale links require atomic checkout' USING ERRCODE='22023';END IF;
 IF p_entry_type<>'payment_received' OR coalesce(p_payment_method,'ledger_only')<>'cash_drawer' THEN
  IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 END IF;
 IF p_sale_id IS NOT NULL THEN RAISE EXCEPTION 'Sale links require atomic checkout' USING ERRCODE='22023';END IF;
 IF p_entry_type='payment_received' AND p_payment_method='cash_drawer' THEN
  SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING ERRCODE='22023';END IF;
 END IF;
 SELECT balance_minor,credit_limit_minor INTO v_balance,v_limit FROM public.retail_customers WHERE store_id=p_store AND id=p_customer AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='22023';END IF;
 v_delta:=CASE WHEN p_entry_type='payment_received' THEN -p_amount ELSE p_amount END;
 IF v_balance+v_delta<0 THEN RAISE EXCEPTION 'Payment exceeds outstanding debt' USING ERRCODE='22023';END IF;
 IF v_delta>0 AND v_limit>0 AND v_balance+v_delta>v_limit THEN RAISE EXCEPTION 'Credit limit exceeded' USING ERRCODE='22023';END IF;
 IF v_session IS NOT NULL THEN
  PERFORM public.retail_cash_movement(p_store,v_session,p_request,'cash_in',p_amount,left(coalesce(p_note,'Customer payment'),160));
 END IF;
 UPDATE public.retail_customers SET balance_minor=v_balance+v_delta,due_date=coalesce(p_due_date,due_date),updated_at=now() WHERE store_id=p_store AND id=p_customer;
 INSERT INTO public.retail_customer_ledger(store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,receipt_no,due_date,payment_method,note,actor_id,request_id)
 VALUES(p_store,p_customer,p_entry_type,p_amount,v_delta,v_balance+v_delta,p_receipt_no,p_due_date,p_payment_method,p_note,auth.uid(),p_request) RETURNING id INTO v_id;
 v_result:=jsonb_build_object('entry_id',v_id,'balance_after_minor',v_balance+v_delta);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'customer.ledger_v21',p_customer,v_result||jsonb_build_object('request_id',p_request,'amount_minor',p_amount));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_record_customer_ledger_v19(uuid,uuid,text,bigint,text,text,date,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_record_customer_ledger_v19(uuid,uuid,text,bigint,text,text,date,uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_checkout_customer_v21(
 p_store uuid,p_request uuid,p_items jsonb,p_cash_received bigint,p_discount bigint,p_customer uuid,p_paid bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_sale uuid;v_total bigint;v_debt bigint;v_balance bigint;v_limit bigint;v_session uuid;
 v_payload jsonb:=jsonb_build_object('items',p_items,'cash',p_cash_received,'discount',p_discount,'customer',p_customer,'paid',p_paid);
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'checkout.customer',v_payload);
 IF v_result IS NOT NULL THEN RETURN (v_result->>'sale_id')::uuid;END IF;
 IF EXISTS(SELECT 1 FROM public.retail_sales WHERE store_id=p_store AND request_id=p_request) THEN RAISE EXCEPTION 'Existing sale request cannot be repurposed as customer checkout' USING ERRCODE='22023';END IF;
 IF p_customer IS NULL OR p_paid IS NULL OR p_paid<0 OR p_paid>9999999999999 THEN RAISE EXCEPTION 'Invalid customer checkout' USING ERRCODE='22023';END IF;
 SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
 IF v_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING ERRCODE='22023';END IF;
 SELECT balance_minor,credit_limit_minor INTO v_balance,v_limit FROM public.retail_customers WHERE store_id=p_store AND id=p_customer AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='22023';END IF;
 -- Base checkout validates prices, quantities and stock inside this same transaction.
 v_sale:=public.retail_checkout_packs_v16(p_store,p_request,p_items,p_cash_received,p_discount);
 SELECT total_minor INTO v_total FROM public.retail_sales WHERE store_id=p_store AND id=v_sale;
 IF p_cash_received IS DISTINCT FROM greatest(p_paid,v_total) THEN RAISE EXCEPTION 'Invalid payment split' USING ERRCODE='22023';END IF;
 v_debt:=greatest(0,v_total-p_paid);
 IF v_debt>0 THEN
  IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager required for credit sale' USING ERRCODE='42501';END IF;
  IF v_limit<=0 OR v_balance+v_debt>v_limit THEN RAISE EXCEPTION 'Credit limit exceeded' USING ERRCODE='22023';END IF;
  PERFORM public.retail_cash_movement(p_store,v_session,p_request,'cash_out',v_debt,'Credit sale offset');
  UPDATE public.retail_customers SET balance_minor=v_balance+v_debt,updated_at=now() WHERE store_id=p_store AND id=p_customer;
 END IF;
 INSERT INTO public.retail_customer_ledger(store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,sale_id,receipt_no,payment_method,actor_id,request_id)
 SELECT p_store,p_customer,CASE WHEN v_debt>0 THEN 'debt_sale' ELSE 'paid_purchase' END,
 CASE WHEN v_debt>0 THEN v_debt ELSE v_total END,v_debt,v_balance+v_debt,v_sale,receipt_no::text,
 CASE WHEN v_debt>0 THEN 'credit' ELSE 'cash_drawer' END,auth.uid(),p_request
 FROM public.retail_sales WHERE store_id=p_store AND id=v_sale AND v_total>0;
 UPDATE public.retail_sales SET customer_id=p_customer,credit_minor=v_debt,paid_minor=least(p_paid,v_total) WHERE store_id=p_store AND id=v_sale;
 v_result:=jsonb_build_object('sale_id',v_sale);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 RETURN v_sale;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_checkout_customer_v21(uuid,uuid,jsonb,bigint,bigint,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_checkout_customer_v21(uuid,uuid,jsonb,bigint,bigint,uuid,bigint) TO authenticated;
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.retail_customers(id), ADD COLUMN IF NOT EXISTS credit_minor bigint NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS paid_minor bigint;
-- Full returns of credit receipts need debt allocation; fail closed until that flow is delivered.
CREATE OR REPLACE FUNCTION retail_internal.guard_credit_refund_v21() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
 IF NEW.refunded AND NOT OLD.refunded AND OLD.credit_minor>0 THEN RAISE EXCEPTION 'Credit receipt return requires debt reconciliation' USING ERRCODE='22023';END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS retail_credit_refund_guard_v21 ON public.retail_sales;
CREATE TRIGGER retail_credit_refund_guard_v21 BEFORE UPDATE OF refunded ON public.retail_sales FOR EACH ROW EXECUTE FUNCTION retail_internal.guard_credit_refund_v21();
REVOKE ALL ON FUNCTION retail_internal.guard_credit_refund_v21() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.retail_record_supplier_ledger_v19(uuid,uuid,text,bigint,text,text,uuid,numeric,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_record_supplier_ledger_v21(
 p_store uuid,p_supplier uuid,p_entry_type text,p_amount bigint,p_note text,
 p_invoice_no text,p_product_id uuid,p_product_name text,p_quantity numeric,p_unit_cost bigint,
 p_payment_method text,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_balance bigint;v_delta bigint;v_id uuid;v_session uuid;
 v_payload jsonb:=jsonb_build_object('supplier',p_supplier,'type',p_entry_type,'amount',p_amount,'note',p_note,
 'invoice',p_invoice_no,'product',p_product_id,'name',p_product_name,'quantity',p_quantity,'cost',p_unit_cost,'method',p_payment_method);
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'supplier.ledger',v_payload);
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>9999999999999 OR p_entry_type IS NULL
 OR p_entry_type NOT IN ('opening_balance','payment_sent','adjustment')
 THEN RAISE EXCEPTION 'Purchases and supplier returns require atomic stock reconciliation' USING ERRCODE='22023';END IF;
 IF p_entry_type='payment_sent' AND p_payment_method='cash_drawer' THEN
  SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING ERRCODE='22023';END IF;
 END IF;
 SELECT balance_minor INTO v_balance FROM public.retail_suppliers WHERE store_id=p_store AND id=p_supplier AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='22023';END IF;
 v_delta:=CASE WHEN p_entry_type='payment_sent' THEN -p_amount ELSE p_amount END;
 IF v_balance+v_delta<0 THEN RAISE EXCEPTION 'Payment exceeds supplier debt' USING ERRCODE='22023';END IF;
 IF v_session IS NOT NULL THEN
  PERFORM public.retail_cash_movement(p_store,v_session,p_request,'cash_out',p_amount,left(coalesce(p_note,'Supplier payment'),160));
 END IF;
 UPDATE public.retail_suppliers SET balance_minor=v_balance+v_delta,updated_at=now() WHERE store_id=p_store AND id=p_supplier;
 INSERT INTO public.retail_supplier_ledger(store_id,supplier_id,entry_type,amount_minor,delta_minor,balance_after_minor,invoice_no,payment_method,note,actor_id,request_id)
 VALUES(p_store,p_supplier,p_entry_type,p_amount,v_delta,v_balance+v_delta,p_invoice_no,p_payment_method,p_note,auth.uid(),p_request) RETURNING id INTO v_id;
 v_result:=jsonb_build_object('entry_id',v_id,'balance_after_minor',v_balance+v_delta);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'supplier.ledger_v21',p_supplier,v_result||jsonb_build_object('request_id',p_request,'amount_minor',p_amount));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_record_supplier_ledger_v21(uuid,uuid,text,bigint,text,text,uuid,text,numeric,bigint,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_record_supplier_ledger_v21(uuid,uuid,text,bigint,text,text,uuid,text,numeric,bigint,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.retail_receive_purchase_v21(p_store uuid,p_request uuid,p_purchase jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_product record;v_supplier record;v_po record;v_session uuid;
 v_product_id uuid:=(p_purchase->>'product_id')::uuid;v_supplier_id uuid:=nullif(p_purchase->>'supplier_id','')::uuid;
 v_po_id uuid:=nullif(p_purchase->>'po_id','')::uuid;v_qty numeric:=(p_purchase->>'quantity')::numeric;
 v_cost bigint:=(p_purchase->>'unit_cost')::bigint;v_total bigint;v_invoice text:=p_purchase->>'invoice_no';
 v_method text:=p_purchase->>'payment_method';v_note text:=p_purchase->>'note';v_stock numeric;v_entry uuid;
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'purchase.receive',p_purchase);
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF v_qty IS NULL OR v_qty<=0 OR v_qty>1000000 OR v_qty<>round(v_qty,3) OR v_cost IS NULL OR v_cost<=0
 OR v_method IS NULL OR v_method NOT IN ('credit','cash_drawer','cash_external')
 OR nullif(btrim(v_invoice),'') IS NULL THEN RAISE EXCEPTION 'Invalid purchase receipt' USING ERRCODE='22023';END IF;
 v_total:=round(v_qty*v_cost);
 IF v_total>9999999999999 THEN RAISE EXCEPTION 'Purchase total too large' USING ERRCODE='22023';END IF;
 IF v_method='cash_drawer' THEN
  SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING ERRCODE='22023';END IF;
 END IF;
 IF v_supplier_id IS NOT NULL THEN
  SELECT * INTO v_supplier FROM public.retail_suppliers WHERE store_id=p_store AND id=v_supplier_id AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='22023';END IF;
 ELSIF v_method='credit' THEN RAISE EXCEPTION 'Supplier required for credit purchase' USING ERRCODE='22023';END IF;
 IF v_po_id IS NOT NULL THEN
  SELECT * INTO v_po FROM public.retail_purchase_orders WHERE store_id=p_store AND id=v_po_id FOR UPDATE;
  IF NOT FOUND OR v_po.status NOT IN ('pending','ordered') OR v_po.product_id IS DISTINCT FROM v_product_id
  OR v_po.supplier_id IS DISTINCT FROM v_supplier_id OR v_po.quantity IS DISTINCT FROM v_qty
  THEN RAISE EXCEPTION 'Purchase order changed or already received' USING ERRCODE='22023';END IF;
 END IF;
 SELECT * INTO v_product FROM public.retail_products WHERE store_id=p_store AND id=v_product_id AND active FOR SHARE;
 IF NOT FOUND OR (v_product.base_unit='unit' AND v_qty<>trunc(v_qty)) THEN RAISE EXCEPTION 'Invalid purchase product or quantity' USING ERRCODE='22023';END IF;
 v_result:=public.retail_adjust_stock_v19(p_store,v_product_id,'delta_in',v_qty,'purchase',v_invoice,p_request);
 SELECT quantity INTO v_stock FROM public.retail_stock_balances WHERE store_id=p_store AND product_id=v_product_id;
 IF v_session IS NOT NULL AND v_total>0 THEN
  PERFORM public.retail_cash_movement(p_store,v_session,p_request,'cash_out',v_total,left(v_invoice,160));
 ELSIF v_method='cash_external' AND v_total>0 THEN
  INSERT INTO public.retail_finance_entries(store_id,entry_kind,category,amount_minor,wallet,payee,reference_no,note,actor_id,request_id)
  VALUES(p_store,'safe_withdraw','purchase',v_total,'safe',v_supplier.name,v_invoice,v_note,auth.uid(),p_request);
 END IF;
 IF v_supplier_id IS NOT NULL AND v_method='credit' THEN
  UPDATE public.retail_suppliers SET balance_minor=balance_minor+v_total,updated_at=now() WHERE store_id=p_store AND id=v_supplier_id;
 END IF;
 INSERT INTO public.retail_supplier_ledger(store_id,supplier_id,supplier_name,entry_type,amount_minor,delta_minor,balance_after_minor,invoice_no,product_id,product_name,quantity,unit_cost_minor,payment_method,note,actor_id,request_id)
 VALUES(p_store,v_supplier_id,coalesce(v_supplier.name,'دابینکەری گشتی'),CASE WHEN v_method='credit' THEN 'purchase_credit' ELSE 'purchase_cash' END,v_total,CASE WHEN v_method='credit' THEN v_total ELSE 0 END,
 coalesce(v_supplier.balance_minor,0)+CASE WHEN v_method='credit' THEN v_total ELSE 0 END,v_invoice,v_product_id,v_product.name,v_qty,v_cost,v_method,v_note,auth.uid(),p_request) RETURNING id INTO v_entry;
 INSERT INTO public.retail_product_costs(store_id,product_id,unit_cost_minor,actor_id) VALUES(p_store,v_product_id,v_cost,auth.uid())
 ON CONFLICT(store_id,product_id) DO UPDATE SET unit_cost_minor=excluded.unit_cost_minor,updated_at=now(),actor_id=excluded.actor_id;
 IF nullif(p_purchase->>'expiry_date','') IS NOT NULL THEN
  INSERT INTO public.retail_stock_expiries(store_id,product_id,batch_no,quantity,expiry_date,note,actor_id)
  VALUES(p_store,v_product_id,v_invoice,v_qty,(p_purchase->>'expiry_date')::date,v_note,auth.uid());
 END IF;
 IF v_po_id IS NOT NULL THEN UPDATE public.retail_purchase_orders SET status='received',updated_at=now() WHERE store_id=p_store AND id=v_po_id;END IF;
 v_result:=jsonb_build_object('entry_id',v_entry,'quantity',v_stock,'total_minor',v_total);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'purchase.receive_v21',v_product_id,v_result||jsonb_build_object('request_id',p_request));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_receive_purchase_v21(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_receive_purchase_v21(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_save_party_v21(p_store uuid,p_request uuid,p_kind text,p_party jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_id uuid:=coalesce(nullif(p_party->>'id','')::uuid,gen_random_uuid());
 v_opening bigint:=coalesce((p_party->>'opening_balance')::bigint,0);v_limit bigint:=coalesce((p_party->>'credit_limit')::bigint,0);
 v_name text:=nullif(btrim(p_party->>'name'),'');v_new boolean:=nullif(p_party->>'id','') IS NULL;
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'party.save',jsonb_build_object('kind',p_kind,'party',p_party));
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF v_name IS NULL OR length(v_name)>140 OR v_opening<0 OR v_opening>9999999999999 OR v_limit<0 OR v_limit>9999999999999
 OR (NOT v_new AND v_opening<>0) THEN RAISE EXCEPTION 'Invalid account' USING ERRCODE='22023';END IF;
 IF p_kind='customer' THEN
  IF v_new THEN
   IF v_opening>0 AND (v_limit<=0 OR v_opening>v_limit) THEN RAISE EXCEPTION 'Credit limit exceeded' USING ERRCODE='22023';END IF;
   INSERT INTO public.retail_customers(id,store_id,name,phone,address,credit_limit_minor,balance_minor,note)
   VALUES(v_id,p_store,v_name,p_party->>'phone',p_party->>'address',v_limit,v_opening,p_party->>'note');
   IF v_opening>0 THEN INSERT INTO public.retail_customer_ledger(store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,note,actor_id,request_id)
    VALUES(p_store,v_id,'opening_balance',v_opening,v_opening,v_opening,p_party->>'note',auth.uid(),p_request);END IF;
  ELSE
   PERFORM 1 FROM public.retail_customers WHERE store_id=p_store AND id=v_id AND active FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='22023';END IF;
   IF EXISTS(SELECT 1 FROM public.retail_customers WHERE store_id=p_store AND id=v_id AND balance_minor>v_limit AND v_limit>0) THEN RAISE EXCEPTION 'Credit limit below outstanding balance' USING ERRCODE='22023';END IF;
   UPDATE public.retail_customers SET name=v_name,phone=p_party->>'phone',address=p_party->>'address',credit_limit_minor=v_limit,note=p_party->>'note',updated_at=now() WHERE store_id=p_store AND id=v_id;
  END IF;
 ELSIF p_kind='supplier' THEN
  IF v_new THEN
   INSERT INTO public.retail_suppliers(id,store_id,name,company,phone,address,category,balance_minor,note)
   VALUES(v_id,p_store,v_name,p_party->>'company',p_party->>'phone',p_party->>'address',p_party->>'category',v_opening,p_party->>'note');
   IF v_opening>0 THEN INSERT INTO public.retail_supplier_ledger(store_id,supplier_id,entry_type,amount_minor,delta_minor,balance_after_minor,note,actor_id,request_id)
    VALUES(p_store,v_id,'opening_balance',v_opening,v_opening,v_opening,p_party->>'note',auth.uid(),p_request);END IF;
  ELSE
   PERFORM 1 FROM public.retail_suppliers WHERE store_id=p_store AND id=v_id AND active FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='22023';END IF;
   UPDATE public.retail_suppliers SET name=v_name,company=p_party->>'company',phone=p_party->>'phone',address=p_party->>'address',category=p_party->>'category',note=p_party->>'note',updated_at=now() WHERE store_id=p_store AND id=v_id;
  END IF;
 ELSE RAISE EXCEPTION 'Invalid account kind' USING ERRCODE='22023';END IF;
 v_result:=jsonb_build_object('id',v_id);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'party.save_v21',v_id,jsonb_build_object('kind',p_kind,'request_id',p_request));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_save_party_v21(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_save_party_v21(uuid,uuid,text,jsonb) TO authenticated;
-- Prevent editing supplier balances independently of the financial ledger.
REVOKE INSERT,UPDATE,DELETE ON public.retail_suppliers FROM authenticated;
GRANT UPDATE(active) ON public.retail_suppliers TO authenticated;
-- The legacy product RPC already checks owner identity and validates its payload.
ALTER FUNCTION public.retail_create_product(uuid,text,text,bigint) SECURITY DEFINER;

DO $functions$
DECLARE f record;
BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,7)='retail_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 END LOOP;
END $functions$;
NOTIFY pgrst,'reload schema';

-- V22: receipt-linked returns, FIFO debt reconciliation and complete server reports.
-- Upgrade candidate only; requires V21. No hosted database changes are automated.

ALTER TABLE public.retail_sale_items
 ADD COLUMN IF NOT EXISTS returned_quantity numeric(14,3) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS returned_minor bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS unit_cost_minor_snapshot numeric(20,6);
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS returned_minor_total bigint NOT NULL DEFAULT 0;
ALTER TABLE public.retail_customer_ledger DROP CONSTRAINT IF EXISTS retail_customer_ledger_entry_type_check;
ALTER TABLE public.retail_customer_ledger ADD CONSTRAINT retail_customer_ledger_entry_type_check
 CHECK(entry_type IN ('opening_balance','debt_sale','debt_add','payment_received','paid_purchase','adjustment','sale_return'));
CREATE TABLE IF NOT EXISTS public.retail_sale_returns_v22(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,sale_id uuid NOT NULL,
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,
 refund_minor bigint NOT NULL CHECK(refund_minor>=0),cash_minor bigint NOT NULL CHECK(cash_minor>=0),
 debt_minor bigint NOT NULL CHECK(debt_minor>=0),note text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,request_id),UNIQUE(store_id,id),CHECK(refund_minor=cash_minor+debt_minor),
 FOREIGN KEY(store_id,sale_id) REFERENCES public.retail_sales(store_id,id),
 FOREIGN KEY(store_id,session_id) REFERENCES public.retail_cash_sessions(store_id,id)
);
CREATE TABLE IF NOT EXISTS public.retail_sale_return_lines_v22(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,return_id uuid NOT NULL,
 sale_item_id uuid NOT NULL REFERENCES public.retail_sale_items(id),product_id uuid NOT NULL REFERENCES public.retail_products(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),base_units numeric(14,3) NOT NULL CHECK(base_units>0),
 refund_minor bigint NOT NULL CHECK(refund_minor>=0),cost_minor bigint CHECK(cost_minor>=0),
 UNIQUE(return_id,sale_item_id),FOREIGN KEY(store_id,return_id) REFERENCES public.retail_sale_returns_v22(store_id,id)
);
ALTER TABLE public.retail_sale_returns_v22 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sale_return_lines_v22 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retail_sale_returns_v22,public.retail_sale_return_lines_v22 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.retail_sale_returns_v22,public.retail_sale_return_lines_v22 TO authenticated;
DROP POLICY IF EXISTS returns_member_read ON public.retail_sale_returns_v22;
CREATE POLICY returns_member_read ON public.retail_sale_returns_v22 FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,ARRAY['manager','cashier']));
DROP POLICY IF EXISTS return_lines_member_read ON public.retail_sale_return_lines_v22;
CREATE POLICY return_lines_member_read ON public.retail_sale_return_lines_v22 FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,ARRAY['manager','cashier']));
CREATE INDEX IF NOT EXISTS retail_returns_store_created_v22 ON public.retail_sale_returns_v22(store_id,created_at);
CREATE INDEX IF NOT EXISTS retail_sales_store_created_v22 ON public.retail_sales(store_id,created_at);
CREATE INDEX IF NOT EXISTS retail_items_store_sale_v22 ON public.retail_sale_items(store_id,sale_id);

-- Costs are captured once at checkout. Unknown historic costs remain unknown.
CREATE OR REPLACE FUNCTION retail_internal.snapshot_cost_v22() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 SELECT coalesce(pc.unit_cost_minor,p.purchase_price_minor,c.purchase_price_minor::numeric/nullif(c.units_per_carton,0))
 INTO NEW.unit_cost_minor_snapshot FROM public.retail_products p
 LEFT JOIN public.retail_product_costs pc ON pc.store_id=p.store_id AND pc.product_id=p.id
 LEFT JOIN public.retail_product_cartons c ON c.store_id=p.store_id AND c.product_id=p.id
 WHERE p.store_id=NEW.store_id AND p.id=NEW.product_id;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.snapshot_cost_v22() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS retail_cost_snapshot_v22 ON public.retail_sale_items;
CREATE TRIGGER retail_cost_snapshot_v22 BEFORE INSERT ON public.retail_sale_items FOR EACH ROW EXECUTE FUNCTION retail_internal.snapshot_cost_v22();

-- Allocate receipt-level discounts using cumulative rounding in immutable line-ID order.
CREATE OR REPLACE VIEW retail_internal.sale_line_values_v22 WITH(security_invoker=true) AS
WITH lines AS (
 SELECT i.id,i.store_id,i.sale_id,i.product_id,i.quantity,i.unit_price_minor,i.product_name_snapshot,
 i.package_type,i.package_barcode,i.units_per_package,i.base_units,i.base_unit_snapshot,i.returned_quantity,i.returned_minor,i.unit_cost_minor_snapshot,s.created_at AS sold_at,s.total_minor AS sale_net,s.discount_minor AS sale_discount,
  round(i.quantity*i.unit_price_minor) AS gross_minor,
  sum(round(i.quantity*i.unit_price_minor)) OVER(PARTITION BY i.store_id,i.sale_id) AS receipt_gross,
  sum(round(i.quantity*i.unit_price_minor)) OVER(PARTITION BY i.store_id,i.sale_id ORDER BY i.id ROWS UNBOUNDED PRECEDING) AS cumulative_gross
 FROM public.retail_sale_items i JOIN public.retail_sales s ON s.store_id=i.store_id AND s.id=i.sale_id WHERE s.status='posted'
)
SELECT lines.*,coalesce(base_units,quantity*coalesce(units_per_package,1)) AS sold_base_units,
 CASE WHEN receipt_gross=0 THEN 0 ELSE
 round(sale_net::numeric*cumulative_gross/receipt_gross)-round(sale_net::numeric*(cumulative_gross-gross_minor)/receipt_gross) END::bigint AS net_minor,
 CASE WHEN unit_cost_minor_snapshot IS NULL THEN NULL ELSE round(coalesce(base_units,quantity*coalesce(units_per_package,1))*unit_cost_minor_snapshot)::bigint END AS cost_minor
FROM lines;
REVOKE ALL ON retail_internal.sale_line_values_v22 FROM PUBLIC,anon,authenticated;

-- Preserve already completed legacy full returns without inventing new cash/stock entries.
UPDATE public.retail_sale_items i SET returned_quantity=i.quantity,returned_minor=v.net_minor
FROM retail_internal.sale_line_values_v22 v,public.retail_sales s
WHERE i.id=v.id AND s.id=i.sale_id AND s.store_id=i.store_id AND s.refunded
 AND NOT EXISTS(SELECT 1 FROM public.retail_sale_returns_v22 r WHERE r.sale_id=s.id AND r.store_id=s.store_id);
UPDATE public.retail_sales SET returned_minor_total=total_minor WHERE refunded AND returned_minor_total=0;

CREATE OR REPLACE FUNCTION retail_internal.sale_debt_remaining_v22(p_store uuid,p_customer uuid,p_sale uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_balance numeric;v_sum numeric;v_payments numeric;v_legacy numeric;v_entry record;v_prior numeric;v_effective numeric;v_count integer;
BEGIN
 SELECT balance_minor INTO v_balance FROM public.retail_customers WHERE id=p_customer AND store_id=p_store;
 SELECT coalesce(sum(delta_minor),0),coalesce(sum(-delta_minor) FILTER(WHERE delta_minor<0 AND entry_type<>'sale_return'),0)
 INTO v_sum,v_payments FROM public.retail_customer_ledger WHERE store_id=p_store AND customer_id=p_customer;
 v_legacy:=v_balance-v_sum;
 IF v_legacy<0 THEN RAISE EXCEPTION 'Customer ledger requires reconciliation' USING ERRCODE='22023';END IF;
 SELECT count(*) INTO v_count FROM public.retail_customer_ledger WHERE store_id=p_store AND customer_id=p_customer AND sale_id=p_sale AND entry_type='debt_sale' AND delta_minor>0;
 IF v_count<>1 THEN RAISE EXCEPTION 'Receipt debt requires reconciliation' USING ERRCODE='22023';END IF;
 SELECT * INTO v_entry FROM public.retail_customer_ledger WHERE store_id=p_store AND customer_id=p_customer AND sale_id=p_sale AND entry_type='debt_sale' AND delta_minor>0;
 SELECT v_legacy+coalesce(sum(l.delta_minor-coalesce((SELECT sum(r.debt_minor) FROM public.retail_sale_returns_v22 r WHERE r.store_id=p_store AND r.sale_id=l.sale_id),0)),0)
 INTO v_prior FROM public.retail_customer_ledger l WHERE l.store_id=p_store AND l.customer_id=p_customer AND l.delta_minor>0 AND (l.created_at,l.id)<(v_entry.created_at,v_entry.id);
 SELECT v_entry.delta_minor-coalesce(sum(debt_minor),0) INTO v_effective FROM public.retail_sale_returns_v22 WHERE store_id=p_store AND sale_id=p_sale;
 IF v_effective<0 OR v_prior<0 THEN RAISE EXCEPTION 'Receipt debt requires reconciliation' USING ERRCODE='22023';END IF;
 RETURN greatest(0,v_effective-greatest(0,v_payments-v_prior))::bigint;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.sale_debt_remaining_v22(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS retail_credit_refund_guard_v21 ON public.retail_sales;

DROP FUNCTION IF EXISTS retail_internal.return_receipt_v22(uuid,uuid,uuid,uuid,jsonb);
CREATE OR REPLACE FUNCTION retail_internal.return_receipt_v22(p_store uuid,p_sale uuid,p_session uuid,p_request uuid,p_lines jsonb,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=(SELECT auth.uid());v_result jsonb;v_sale record;v_line record;v_entry jsonb;v_customer uuid;
 v_qty numeric;v_stock numeric;v_base numeric;v_refund bigint:=0;v_cash bigint;v_debt bigint:=0;v_balance bigint;
 v_line_refund bigint;v_line_cost bigint;v_previous_cost bigint;v_return uuid:=gen_random_uuid();v_count int:=0;v_all boolean;
 v_prepared jsonb:='[]'::jsonb;v_payload jsonb:=jsonb_build_object('sale',p_sale,'session',p_session,'lines',p_lines,'note',p_note);
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'sale.return_v22',v_payload);
 IF v_result IS NOT NULL THEN RETURN v_result||jsonb_build_object('idempotent',true);END IF;
 IF length(coalesce(p_note,''))>240 THEN RAISE EXCEPTION 'Return note too long' USING ERRCODE='22023';END IF;
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) AND coalesce((SELECT settings_json->>'permCashierRefund' FROM public.retail_store_settings WHERE store_id=p_store),'allowed')<>'allowed' THEN RAISE EXCEPTION 'Cashier returns disabled by owner' USING ERRCODE='42501';END IF;
 IF p_sale IS NULL OR p_session IS NULL THEN RAISE EXCEPTION 'Receipt and shift required' USING ERRCODE='22023';END IF;
 SELECT * INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND id=p_sale;
 IF v_sale.refunded AND v_sale.return_request_id=p_request AND v_sale.return_actor_id=v_actor AND v_sale.return_session_id=p_session AND p_lines IS NULL THEN
  v_result:=jsonb_build_object('sale_id',p_sale,'receipt_no',v_sale.receipt_no,'refunded_minor',v_sale.total_minor,'idempotent',true,'legacy',true);
  UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;RETURN v_result;
 END IF;
 IF EXISTS(SELECT 1 FROM public.retail_cash_movements WHERE store_id=p_store AND request_id=p_request) THEN RAISE EXCEPTION 'Return request reused for another cash movement' USING ERRCODE='22023';END IF;
 SELECT customer_id INTO v_customer FROM public.retail_sales WHERE store_id=p_store AND id=p_sale;
 -- Same lock order as checkout/payment: shift, customer, sale, sorted stock rows.
 PERFORM 1 FROM public.retail_cash_sessions WHERE store_id=p_store AND id=p_session AND cashier_id=v_actor AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shift not open for user' USING ERRCODE='42501';END IF;
 IF v_customer IS NOT NULL THEN
  SELECT balance_minor INTO v_balance FROM public.retail_customers WHERE store_id=p_store AND id=v_customer FOR UPDATE;
 END IF;
 SELECT * INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND id=p_sale AND status='posted' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found' USING ERRCODE='22023';END IF;
 IF v_sale.refunded THEN
  IF v_sale.return_request_id=p_request AND v_sale.return_actor_id=v_actor AND v_sale.return_session_id=p_session AND p_lines IS NULL THEN
   v_result:=jsonb_build_object('sale_id',p_sale,'receipt_no',v_sale.receipt_no,'refunded_minor',v_sale.total_minor,'idempotent',true);
   UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;RETURN v_result;
  END IF;
  RAISE EXCEPTION 'Receipt already fully refunded' USING ERRCODE='22023';
 END IF;
 IF v_sale.credit_minor>0 AND NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required for credit return' USING ERRCODE='42501';END IF;
 IF p_lines IS NOT NULL THEN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)<1 OR jsonb_array_length(p_lines)>100 THEN RAISE EXCEPTION 'Invalid return lines' USING ERRCODE='22023';END IF;
  IF (SELECT count(DISTINCT value->>'line_id') FROM jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'Duplicate return line' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE NOT EXISTS(SELECT 1 FROM public.retail_sale_items i WHERE i.id=(x->>'line_id')::uuid AND i.sale_id=p_sale AND i.store_id=p_store)) THEN RAISE EXCEPTION 'Line does not belong to receipt' USING ERRCODE='22023';END IF;
 END IF;
 FOR v_line IN SELECT * FROM retail_internal.sale_line_values_v22 WHERE store_id=p_store AND sale_id=p_sale ORDER BY product_id,id LOOP
  IF v_line.receipt_gross IS DISTINCT FROM v_sale.total_minor+v_sale.discount_minor THEN RAISE EXCEPTION 'Receipt totals require reconciliation' USING ERRCODE='22023';END IF;
  IF p_lines IS NULL THEN v_qty:=v_line.quantity-v_line.returned_quantity;
  ELSE SELECT (value->>'quantity')::numeric INTO v_qty FROM jsonb_array_elements(p_lines) WHERE (value->>'line_id')::uuid=v_line.id;
  END IF;
  IF v_qty IS NULL THEN CONTINUE;END IF;
  IF p_lines IS NULL AND v_qty=0 THEN CONTINUE;END IF;
  IF v_qty<=0 OR v_qty>v_line.quantity-v_line.returned_quantity OR v_qty<>round(v_qty,3)
   OR (v_line.base_unit_snapshot<>'kg' AND v_qty<>trunc(v_qty)) THEN RAISE EXCEPTION 'Return exceeds remaining sold quantity or has invalid units' USING ERRCODE='22023';END IF;
  IF v_line.base_unit_snapshot='unit' AND v_line.sold_base_units<>v_line.quantity*coalesce(v_line.units_per_package,1) THEN RAISE EXCEPTION 'Legacy unit snapshot requires reconciliation' USING ERRCODE='22023';END IF;
  PERFORM 1 FROM public.retail_products WHERE store_id=p_store AND id=v_line.product_id AND base_unit=v_line.base_unit_snapshot FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product unit changed since sale; reconcile before return' USING ERRCODE='22023';END IF;
  v_base:=round(v_line.sold_base_units*v_qty/v_line.quantity,3);
  IF v_base<=0 THEN RAISE EXCEPTION 'Invalid base return quantity' USING ERRCODE='22023';END IF;
  v_line_refund:=round(v_line.net_minor::numeric*(v_line.returned_quantity+v_qty)/v_line.quantity)::bigint-v_line.returned_minor;
  IF v_line.cost_minor IS NULL THEN v_line_cost:=NULL;
  ELSE
   SELECT coalesce(sum(l.cost_minor),0) INTO v_previous_cost FROM public.retail_sale_return_lines_v22 l WHERE l.store_id=p_store AND l.sale_item_id=v_line.id;
   v_line_cost:=round(v_line.cost_minor::numeric*(v_line.returned_quantity+v_qty)/v_line.quantity)::bigint-v_previous_cost;
  END IF;
  v_refund:=v_refund+v_line_refund;v_count:=v_count+1;
  v_prepared:=v_prepared||jsonb_build_array(jsonb_build_object('line',v_line.id,'product',v_line.product_id,'quantity',v_qty,'base',v_base,'refund',v_line_refund,'cost',v_line_cost));
 END LOOP;
 IF v_count=0 THEN RAISE EXCEPTION 'No remaining items to return' USING ERRCODE='22023';END IF;
 IF v_sale.credit_minor>0 THEN
  v_debt:=least(v_refund,retail_internal.sale_debt_remaining_v22(p_store,v_customer,p_sale));
  IF v_balance IS NULL OR v_balance<v_debt THEN RAISE EXCEPTION 'Customer balance requires reconciliation' USING ERRCODE='22023';END IF;
 END IF;
 v_cash:=v_refund-v_debt;
 IF v_cash>0 THEN PERFORM public.retail_cash_movement(p_store,p_session,p_request,'cash_out',v_cash,'Receipt return #'||v_sale.receipt_no);END IF;
 INSERT INTO public.retail_sale_returns_v22(id,store_id,sale_id,request_id,actor_id,session_id,refund_minor,cash_minor,debt_minor,note)
 VALUES(v_return,p_store,p_sale,p_request,v_actor,p_session,v_refund,v_cash,v_debt,left(coalesce(p_note,''),240));
 FOR v_entry IN SELECT value FROM jsonb_array_elements(v_prepared) LOOP
  INSERT INTO public.retail_stock_balances(store_id,product_id,quantity) VALUES(p_store,(v_entry->>'product')::uuid,(v_entry->>'base')::numeric)
  ON CONFLICT(store_id,product_id) DO UPDATE SET quantity=public.retail_stock_balances.quantity+excluded.quantity,updated_at=now();
  INSERT INTO public.retail_stock_events(store_id,product_id,delta,reason,sale_id,actor_id,request_id)
  VALUES(p_store,(v_entry->>'product')::uuid,(v_entry->>'base')::numeric,'sale_return',p_sale,v_actor,p_request);
  INSERT INTO public.retail_sale_return_lines_v22(store_id,return_id,sale_item_id,product_id,quantity,base_units,refund_minor,cost_minor)
  VALUES(p_store,v_return,(v_entry->>'line')::uuid,(v_entry->>'product')::uuid,(v_entry->>'quantity')::numeric,(v_entry->>'base')::numeric,(v_entry->>'refund')::bigint,(v_entry->>'cost')::bigint);
  UPDATE public.retail_sale_items SET returned_quantity=returned_quantity+(v_entry->>'quantity')::numeric,returned_minor=returned_minor+(v_entry->>'refund')::bigint WHERE id=(v_entry->>'line')::uuid AND store_id=p_store;
 END LOOP;
 IF v_customer IS NOT NULL AND v_refund>0 THEN
  UPDATE public.retail_customers SET balance_minor=balance_minor-v_debt,updated_at=now() WHERE store_id=p_store AND id=v_customer;
  INSERT INTO public.retail_customer_ledger(store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,sale_id,receipt_no,payment_method,note,actor_id,request_id)
  VALUES(p_store,v_customer,'sale_return',v_refund,-v_debt,v_balance-v_debt,p_sale,v_sale.receipt_no::text,'credit_return','Receipt return',v_actor,p_request);
 END IF;
 SELECT bool_and(returned_quantity=quantity) INTO v_all FROM public.retail_sale_items WHERE store_id=p_store AND sale_id=p_sale;
 UPDATE public.retail_sales SET returned_minor_total=returned_minor_total+v_refund,refunded=v_all,
  refunded_at=CASE WHEN v_all THEN clock_timestamp() ELSE NULL END,
  return_request_id=CASE WHEN v_all THEN p_request ELSE return_request_id END,
  return_session_id=CASE WHEN v_all THEN p_session ELSE return_session_id END,
  return_actor_id=CASE WHEN v_all THEN v_actor ELSE return_actor_id END WHERE store_id=p_store AND id=p_sale;
 v_result:=jsonb_build_object('sale_id',p_sale,'receipt_no',v_sale.receipt_no,'return_id',v_return,'refunded_minor',v_refund,'cash_refunded_minor',v_cash,'debt_reduced_minor',v_debt,'fully_refunded',v_all,'request_id',p_request);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,v_actor,'sale.return_v22',p_sale,v_result);
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.return_receipt_v22(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_return_sale_v19(p_store uuid,p_sale uuid,p_session uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RETURN retail_internal.return_receipt_v22(p_store,p_sale,p_session,p_request,NULL,'');END $fn$;
REVOKE ALL ON FUNCTION public.retail_return_sale_v19(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_return_sale_v19(uuid,uuid,uuid,uuid) TO authenticated;
DROP FUNCTION IF EXISTS public.retail_return_item_v22(uuid,uuid,uuid,numeric,uuid,uuid);
CREATE OR REPLACE FUNCTION public.retail_return_item_v22(p_store uuid,p_sale uuid,p_line uuid,p_quantity numeric,p_session uuid,p_request uuid,p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RETURN retail_internal.return_receipt_v22(p_store,p_sale,p_session,p_request,jsonb_build_array(jsonb_build_object('line_id',p_line,'quantity',p_quantity)),p_note);END $fn$;
REVOKE ALL ON FUNCTION public.retail_return_item_v22(uuid,uuid,uuid,numeric,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_return_item_v22(uuid,uuid,uuid,numeric,uuid,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.retail_return_state_v22(p_store uuid,p_sale uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_sale jsonb;v_lines jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager','cashier']) THEN RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('id',id,'receipt_no',receipt_no,'total_minor',total_minor,'discount_minor',discount_minor,'cash_received_minor',cash_received_minor,'change_due_minor',change_due_minor,'created_at',created_at,'refunded',refunded,'returned_minor_total',returned_minor_total)
 INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND id=p_sale AND status='posted';
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'product_id',product_id,'quantity',quantity,'unit_price_minor',unit_price_minor,'product_name_snapshot',product_name_snapshot,'package_type',package_type,'package_barcode',package_barcode,'units_per_package',units_per_package,'base_unit_snapshot',base_unit_snapshot,'net_minor',net_minor,'returned_quantity',returned_quantity,'returned_minor',returned_minor,'remaining_quantity',quantity-returned_quantity) ORDER BY id),'[]')
 INTO v_lines FROM retail_internal.sale_line_values_v22 WHERE store_id=p_store AND sale_id=p_sale;
 RETURN jsonb_build_object('sale',v_sale,'items',v_lines);
END $fn$;
REVOKE ALL ON FUNCTION public.retail_return_state_v22(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_return_state_v22(uuid,uuid) TO authenticated;
CREATE OR REPLACE VIEW retail_internal.report_events_v22 WITH(security_invoker=true) AS
 SELECT l.store_id,l.sale_id,l.id AS sale_item_id,l.product_id,l.product_name_snapshot AS name,l.base_unit_snapshot AS base_unit,
 l.sold_at AS event_at,l.sale_id AS event_id,'sale'::text AS kind,l.net_minor AS revenue_minor,l.sold_base_units AS base_quantity,l.cost_minor,false AS unknown_date
 FROM retail_internal.sale_line_values_v22 l
 UNION ALL
 SELECT r.store_id,r.sale_id,l.id,rl.product_id,l.product_name_snapshot,l.base_unit_snapshot,r.created_at,r.id,'return',-rl.refund_minor,-rl.base_units,-rl.cost_minor,false
 FROM public.retail_sale_returns_v22 r JOIN public.retail_sale_return_lines_v22 rl ON rl.return_id=r.id AND rl.store_id=r.store_id
 JOIN public.retail_sale_items l ON l.id=rl.sale_item_id AND l.store_id=rl.store_id
 UNION ALL
 SELECT l.store_id,l.sale_id,l.id,l.product_id,l.product_name_snapshot,l.base_unit_snapshot,coalesce(s.refunded_at,s.created_at),s.id,'return',-l.net_minor,-l.sold_base_units,-l.cost_minor,s.refunded_at IS NULL
 FROM retail_internal.sale_line_values_v22 l JOIN public.retail_sales s ON s.id=l.sale_id AND s.store_id=l.store_id
 WHERE s.refunded AND NOT EXISTS(SELECT 1 FROM public.retail_sale_returns_v22 r WHERE r.store_id=s.store_id AND r.sale_id=s.id);
REVOKE ALL ON retail_internal.report_events_v22 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_report_v22(
 p_store uuid,p_kind text DEFAULT 'sales',p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,
 p_group text DEFAULT 'products',p_search text DEFAULT '',p_filter text DEFAULT 'all',p_sort text DEFAULT 'default',p_offset integer DEFAULT 0,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_summary jsonb;v_inventory jsonb;v_rows jsonb;v_count bigint;v_meta jsonb;
 v_offset integer:=greatest(0,coalesce(p_offset,0));v_limit integer:=least(100,greatest(1,coalesce(p_limit,50)));
 v_today date:=(current_timestamp AT TIME ZONE 'Asia/Baghdad')::date;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF p_kind NOT IN ('sales','profit','inventory','insights') OR p_group NOT IN ('products','daily','hourly','receipts')
 OR p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>=p_to OR length(coalesce(p_search,''))>120
 THEN RAISE EXCEPTION 'Invalid report request' USING ERRCODE='22023';END IF;
 WITH e AS MATERIALIZED(SELECT * FROM retail_internal.report_events_v22 WHERE store_id=p_store AND (p_from IS NULL OR event_at>=p_from) AND (p_to IS NULL OR event_at<p_to)),
 sold AS(SELECT coalesce(sum(total_minor),0) AS net,coalesce(sum(discount_minor),0) AS discount,count(*) AS count,coalesce(sum(credit_minor),0) AS credit
 FROM public.retail_sales WHERE store_id=p_store AND status='posted' AND (p_from IS NULL OR created_at>=p_from) AND (p_to IS NULL OR created_at<p_to)),
 returned AS(SELECT coalesce(sum(revenue_minor) FILTER(WHERE kind='return'),0) AS net,count(DISTINCT event_id) FILTER(WHERE kind='return') AS count,
 (SELECT count(*) FROM public.retail_sales old WHERE old.store_id=p_store AND old.refunded AND old.refunded_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.retail_sale_returns_v22 r WHERE r.store_id=p_store AND r.sale_id=old.id)) AS unknown_dates,coalesce(sum(cost_minor),0) AS cost,count(*) FILTER(WHERE cost_minor IS NULL) AS missing_cost FROM e),
 finance AS(SELECT coalesce(sum(amount_minor) FILTER(WHERE entry_kind='revenue'),0) AS revenue,coalesce(sum(amount_minor) FILTER(WHERE entry_kind='expense'),0) AS expense
 FROM public.retail_finance_entries WHERE store_id=p_store AND (p_from IS NULL OR created_at>=p_from) AND (p_to IS NULL OR created_at<p_to)),
 returned_credit AS(SELECT coalesce(sum(debt_minor),0) AS debt FROM public.retail_sale_returns_v22 WHERE store_id=p_store AND (p_from IS NULL OR created_at>=p_from) AND (p_to IS NULL OR created_at<p_to))
 SELECT jsonb_build_object('sales_minor',s.net,'discount_minor',s.discount,'sale_count',s.count,'refund_minor',-r.net,'refund_count',r.count,
 'net_minor',s.net+r.net,'cash_sales_minor',s.net-s.credit+r.net+rc.debt,'credit_sales_minor',s.credit-rc.debt,
 'cost_minor',CASE WHEN r.missing_cost=0 THEN r.cost ELSE NULL END,'unknown_cost_lines',r.missing_cost,'unknown_refund_dates',r.unknown_dates,
 'other_revenue_minor',f.revenue,'expense_minor',f.expense,
 'gross_profit_minor',CASE WHEN r.missing_cost=0 THEN s.net+r.net-r.cost ELSE NULL END,
 'net_profit_minor',CASE WHEN r.missing_cost=0 THEN s.net+r.net-r.cost+f.revenue-f.expense ELSE NULL END)
 INTO v_summary FROM sold s CROSS JOIN returned r CROSS JOIN finance f CROSS JOIN returned_credit rc;

 WITH stock AS(
 SELECT p.id,coalesce(b.quantity,0) AS qty,p.base_unit,
 coalesce(pc.unit_cost_minor,p.purchase_price_minor,c.purchase_price_minor::numeric/nullif(c.units_per_carton,0)) AS cost,
 coalesce(nullif(p.price_minor,0),c.sale_price_minor::numeric/nullif(c.units_per_carton,0),0) AS price,
 coalesce(p.min_stock_level,5) AS threshold,
 EXISTS(SELECT 1 FROM public.retail_stock_expiries x WHERE x.store_id=p_store AND x.product_id=p.id AND x.status='active' AND x.quantity>0 AND x.expiry_date<=v_today+30) AS expiry
 FROM public.retail_products p LEFT JOIN public.retail_stock_balances b ON b.store_id=p.store_id AND b.product_id=p.id
 LEFT JOIN public.retail_product_costs pc ON pc.store_id=p.store_id AND pc.product_id=p.id
 LEFT JOIN public.retail_product_cartons c ON c.store_id=p.store_id AND c.product_id=p.id WHERE p.store_id=p_store AND (p.active OR coalesce(b.quantity,0)<>0)
 ) SELECT jsonb_build_object('product_count',count(*),'low_count',count(*) FILTER(WHERE qty<=threshold),'out_count',count(*) FILTER(WHERE qty<=0),
 'expiry_count',count(*) FILTER(WHERE expiry),'unknown_cost_products',count(*) FILTER(WHERE cost IS NULL AND qty>0),
 'value_minor',CASE WHEN count(*) FILTER(WHERE cost IS NULL AND qty>0)=0 THEN coalesce(sum(round(qty*cost)),0) ELSE NULL END,
 'sale_value_minor',coalesce(sum(round(qty*price)),0),
 'overdue_customer_debt_minor',(SELECT coalesce(sum(balance_minor),0) FROM public.retail_customers WHERE store_id=p_store AND active AND due_date<v_today)) INTO v_inventory FROM stock;

 IF (p_from IS NOT NULL OR p_to IS NOT NULL) AND (v_summary->>'unknown_refund_dates')::bigint>0 THEN
 v_summary:=v_summary||jsonb_build_object('net_minor',NULL,'refund_minor',NULL,'cash_sales_minor',NULL,'credit_sales_minor',NULL,'cost_minor',NULL,'gross_profit_minor',NULL,'net_profit_minor',NULL);
 END IF;
 IF p_kind IN ('profit','inventory','insights') OR p_group='products' THEN
 WITH e AS MATERIALIZED(SELECT * FROM retail_internal.report_events_v22 WHERE store_id=p_store AND (p_from IS NULL OR event_at>=p_from) AND (p_to IS NULL OR event_at<p_to)),
 movement AS(SELECT product_id,sum(base_quantity) AS qty,sum(revenue_minor) AS revenue,
 CASE WHEN count(*) FILTER(WHERE cost_minor IS NULL)=0 THEN sum(cost_minor) ELSE NULL END AS cost,count(DISTINCT sale_id) FILTER(WHERE kind='sale') AS receipt_count FROM e GROUP BY product_id),
 base AS(
 SELECT p.id,p.name,p.base_unit,p.active,p.price_minor AS current_price_minor,coalesce(b.quantity,0) AS stock_quantity,coalesce(p.min_stock_level,5) AS min_stock,
 coalesce(m.qty,0) AS net_quantity,coalesce(m.revenue,0) AS net_revenue_minor,CASE WHEN m.product_id IS NULL THEN 0 ELSE m.cost END AS cost_minor,coalesce(m.receipt_count,0) AS receipt_count,
 coalesce(pc.unit_cost_minor,p.purchase_price_minor,c.purchase_price_minor::numeric/nullif(c.units_per_carton,0)) AS current_unit_cost,
 EXISTS(SELECT 1 FROM public.retail_stock_expiries x WHERE x.store_id=p_store AND x.product_id=p.id AND x.status='active' AND x.quantity>0 AND x.expiry_date<=v_today+30) AS expiry_risk
 FROM public.retail_products p LEFT JOIN movement m ON m.product_id=p.id
 LEFT JOIN public.retail_stock_balances b ON b.store_id=p.store_id AND b.product_id=p.id
 LEFT JOIN public.retail_product_costs pc ON pc.store_id=p.store_id AND pc.product_id=p.id
 LEFT JOIN public.retail_product_cartons c ON c.store_id=p.store_id AND c.product_id=p.id
 WHERE p.store_id=p_store AND (p.active OR m.product_id IS NOT NULL OR coalesce(b.quantity,0)<>0) AND (p_kind NOT IN ('inventory','insights') OR p.active OR coalesce(b.quantity,0)<>0)),
 valued AS(SELECT base.*,net_revenue_minor-cost_minor AS profit_minor,round(stock_quantity*current_unit_cost)::bigint AS inventory_value_minor,
 CASE WHEN net_revenue_minor>0 AND cost_minor IS NOT NULL THEN round(100*(net_revenue_minor-cost_minor)/net_revenue_minor) ELSE NULL END AS margin_pct,
 sum(greatest(net_revenue_minor,0)) OVER() AS total_positive_revenue,
 coalesce(sum(greatest(net_revenue_minor,0)) OVER(ORDER BY greatest(net_revenue_minor,0) DESC,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior_revenue FROM base),
 ranked AS(SELECT valued.*,CASE WHEN total_positive_revenue=0 OR net_revenue_minor<=0 THEN 'C' WHEN prior_revenue<total_positive_revenue*0.8 THEN 'A' WHEN prior_revenue<total_positive_revenue*0.95 THEN 'B' ELSE 'C' END AS abc FROM valued),
 filtered AS(SELECT * FROM ranked x WHERE
 (p_kind NOT IN ('inventory','insights') OR active OR stock_quantity<>0) AND
 (coalesce(p_search,'')='' OR lower(name) LIKE '%'||lower(p_search)||'%' OR EXISTS(SELECT 1 FROM public.retail_barcodes bc WHERE bc.store_id=p_store AND bc.product_id=x.id AND lower(bc.code) LIKE '%'||lower(p_search)||'%')) AND
 CASE p_filter WHEN 'sold' THEN net_quantity<>0 WHEN 'high_margin' THEN margin_pct>=20 WHEN 'low_margin' THEN margin_pct<10
 WHEN 'high_value' THEN inventory_value_minor>=(SELECT avg(inventory_value_minor) FROM ranked WHERE active) WHEN 'fast_moving' THEN net_quantity>0 WHEN 'dead_stock' THEN net_quantity<=0 AND stock_quantity>0
 WHEN 'low_out' THEN stock_quantity<=min_stock WHEN 'reorder' THEN stock_quantity<=min_stock WHEN 'expiry_risk' THEN expiry_risk
 WHEN 'abc_a' THEN abc='A' WHEN 'abc_b' THEN abc='B' WHEN 'abc_c' THEN abc='C' WHEN 'margin_alert' THEN margin_pct<10 ELSE true END),
 page AS(SELECT * FROM filtered ORDER BY
 CASE WHEN p_sort='name_asc' THEN name END ASC,
 CASE WHEN p_sort='qty_asc' THEN stock_quantity END ASC,
 CASE WHEN p_sort='value_desc' OR p_kind='inventory' AND p_sort='default' THEN inventory_value_minor END DESC NULLS LAST,
 CASE WHEN p_sort='sold_desc' THEN net_quantity END DESC,
 CASE WHEN p_kind='profit' AND p_sort='default' THEN profit_minor ELSE net_revenue_minor END DESC NULLS LAST,id OFFSET v_offset LIMIT v_limit)
 SELECT (SELECT count(*) FROM filtered),(SELECT coalesce(jsonb_agg(to_jsonb(page)),'[]') FROM page),
 (SELECT jsonb_build_object('class_a',count(*) FILTER(WHERE abc='A'),'class_b',count(*) FILTER(WHERE abc='B'),'class_c',count(*) FILTER(WHERE abc='C')) FROM ranked)
 INTO v_count,v_rows,v_meta;
 ELSE
 WITH e AS(SELECT * FROM retail_internal.report_events_v22 WHERE store_id=p_store AND (p_from IS NULL OR event_at>=p_from) AND (p_to IS NULL OR event_at<p_to)),
 groups AS(SELECT CASE p_group WHEN 'daily' THEN to_char(event_at AT TIME ZONE 'Asia/Baghdad','YYYY-MM-DD') WHEN 'hourly' THEN to_char(event_at AT TIME ZONE 'Asia/Baghdad','HH24:00') ELSE sale_id::text END AS label,
 count(DISTINCT sale_id) FILTER(WHERE kind='sale') AS sale_count,count(DISTINCT event_id) FILTER(WHERE kind='return') AS refund_count,
 coalesce(sum(revenue_minor) FILTER(WHERE kind='sale'),0) AS sales_minor,-coalesce(sum(revenue_minor) FILTER(WHERE kind='return'),0) AS refund_minor,sum(revenue_minor) AS net_minor FROM e GROUP BY 1),
 filtered AS(SELECT g.*,s.receipt_no FROM groups g LEFT JOIN public.retail_sales s ON p_group='receipts' AND s.store_id=p_store AND s.id::text=g.label WHERE coalesce(p_search,'')='' OR g.label ILIKE '%'||p_search||'%' OR s.receipt_no::text LIKE '%'||p_search||'%'),
 page AS(SELECT * FROM filtered ORDER BY label DESC OFFSET v_offset LIMIT v_limit)
 SELECT (SELECT count(*) FROM filtered),(SELECT coalesce(jsonb_agg(to_jsonb(page)),'[]') FROM page) INTO v_count,v_rows;
 END IF;
 IF EXISTS(SELECT 1 FROM (SELECT value FROM jsonb_each(v_summary) UNION ALL SELECT value FROM jsonb_each(v_inventory) UNION ALL SELECT v.value FROM jsonb_array_elements(v_rows) row CROSS JOIN LATERAL jsonb_each(row) v) n
 WHERE CASE WHEN jsonb_typeof(value)='number' THEN abs((value#>>'{}')::numeric)>9007199254740991 ELSE false END) THEN RAISE EXCEPTION 'Report amount exceeds supported exact numeric range' USING ERRCODE='22003';END IF;
 RETURN jsonb_build_object('summary',v_summary,'inventory',v_inventory,'abc',coalesce(v_meta,'{}'),'items',v_rows,'total_count',v_count,'offset',v_offset,'limit',v_limit,'generated_at',transaction_timestamp(),'timezone','Asia/Baghdad');
END $fn$;
REVOKE ALL ON FUNCTION public.retail_report_v22(uuid,text,timestamptz,timestamptz,text,text,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_report_v22(uuid,text,timestamptz,timestamptz,text,text,text,text,integer,integer) TO authenticated;

CREATE INDEX IF NOT EXISTS retail_sale_items_barcode_lookup_v22 ON public.retail_sale_items(store_id,package_barcode,sale_id);
CREATE OR REPLACE FUNCTION public.retail_find_return_receipt_v22(p_store uuid,p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_query text:=ltrim(btrim(coalesce(p_query,'')),'#');v_sale public.retail_sales%ROWTYPE;v_ids uuid[];
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager','cashier']) THEN RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';END IF;
 IF v_query='' OR length(v_query)>60 THEN RAISE EXCEPTION 'Invalid receipt lookup' USING ERRCODE='22023';END IF;
 IF v_query ~ '^[0-9]{1,15}$' THEN
  SELECT * INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND status='posted' AND receipt_no=v_query::bigint;
 ELSIF v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  SELECT * INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND status='posted' AND id=v_query::uuid;
 END IF;
 IF v_sale.id IS NOT NULL THEN RETURN jsonb_build_object('found',true,'sale_id',v_sale.id,'receipt_no',v_sale.receipt_no);END IF;
 SELECT array_agg(sale_id) INTO v_ids FROM (SELECT DISTINCT i.sale_id FROM public.retail_sale_items i JOIN public.retail_sales s ON s.id=i.sale_id AND s.store_id=i.store_id WHERE i.store_id=p_store AND i.package_barcode=v_query AND s.status='posted' LIMIT 2) matches;
 IF coalesce(array_length(v_ids,1),0)=1 THEN RETURN jsonb_build_object('found',true,'sale_id',v_ids[1]);END IF;
 RETURN jsonb_build_object('found',false,'ambiguous',coalesce(array_length(v_ids,1),0)>1);
END $fn$;
REVOKE ALL ON FUNCTION public.retail_find_return_receipt_v22(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_find_return_receipt_v22(uuid,text) TO authenticated;

NOTIFY pgrst,'reload schema';

-- Reviewed source only. Do not apply automatically to a hosted database.

CREATE OR REPLACE FUNCTION retail_internal.finance_state_v25(p_store uuid,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_safe numeric;v_drawer numeric:=0;v_opening bigint;v_receivable numeric;v_payable numeric;v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 SELECT coalesce(sum(CASE WHEN entry_kind IN ('drawer_to_safe','safe_deposit') OR (entry_kind='revenue' AND wallet='safe') THEN amount_minor WHEN entry_kind IN ('safe_to_drawer','safe_withdraw') OR (entry_kind='expense' AND wallet='safe') THEN -amount_minor ELSE 0 END),0) INTO v_safe FROM public.retail_finance_entries WHERE store_id=p_store;
 v_safe:=v_safe+coalesce((SELECT sum(amount_minor) FROM public.retail_customer_ledger WHERE store_id=p_store AND entry_type='payment_received' AND payment_method='ledger_only'),0)-coalesce((SELECT sum(amount_minor) FROM public.retail_supplier_ledger WHERE store_id=p_store AND ((entry_type='payment_sent' AND payment_method='ledger_only') OR (entry_type='purchase_cash' AND payment_method='cash_external'))),0);
 IF p_session IS NOT NULL THEN
  SELECT opening_cash_minor INTO v_opening FROM public.retail_cash_sessions WHERE store_id=p_store AND id=p_session AND cashier_id=auth.uid() AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not open' USING ERRCODE='22023';END IF;
  v_drawer:=v_opening+coalesce((SELECT sum(cash_received_minor-change_due_minor) FROM public.retail_sales WHERE store_id=p_store AND cash_session_id=p_session AND status='posted'),0)+coalesce((SELECT sum(CASE WHEN kind='cash_in' THEN amount_minor ELSE -amount_minor END) FROM public.retail_cash_movements WHERE store_id=p_store AND session_id=p_session),0);
 END IF;
 SELECT coalesce(sum(balance_minor),0) INTO v_receivable FROM public.retail_customers WHERE store_id=p_store AND active;
 SELECT coalesce(sum(balance_minor),0) INTO v_payable FROM public.retail_suppliers WHERE store_id=p_store AND active;
 IF greatest(abs(v_safe),abs(v_drawer),abs(v_receivable),abs(v_payable),abs(v_safe+v_drawer+v_receivable-v_payable))>9007199254740991 THEN RAISE EXCEPTION 'Balance exceeds exact browser integer range' USING ERRCODE='22023';END IF;
 v_result:=jsonb_build_object('safe_balance_minor',v_safe,'drawer_balance_minor',v_drawer,'customer_receivables_minor',v_receivable,'supplier_payables_minor',v_payable);
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.finance_state_v25(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_finance_state_v25(p_store uuid,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $fn$ SELECT retail_internal.finance_state_v25(p_store,p_session); $fn$;
REVOKE ALL ON FUNCTION public.retail_finance_state_v25(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_finance_state_v25(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION retail_internal.record_finance_v25(p_store uuid,p_request uuid,p_entry jsonb,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_state jsonb;v_row public.retail_finance_entries%ROWTYPE;
 v_kind text:=p_entry->>'entry_kind';v_wallet text:=p_entry->>'wallet';v_amount bigint:=(p_entry->>'amount_minor')::bigint;
 v_category text:=nullif(btrim(p_entry->>'category'),'');v_note text:=nullif(btrim(p_entry->>'note'),'');v_cash text;v_delta bigint:=0;v_session uuid;
BEGIN
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'finance.record_v25',jsonb_build_object('entry',p_entry,'session',p_session));
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF v_kind IS NULL OR v_kind NOT IN ('revenue','expense','drawer_to_safe','safe_to_drawer','safe_deposit','safe_withdraw') OR v_wallet IS NULL OR v_wallet NOT IN ('safe','cash_drawer') OR v_amount IS NULL OR v_amount<=0 OR v_amount>9999999999999 OR v_category IS NULL OR length(v_category)>100 OR v_note IS NULL OR length(v_note)>160 OR length(coalesce(p_entry->>'payee',''))>160 OR length(coalesce(p_entry->>'reference_no',''))>120 THEN RAISE EXCEPTION 'Invalid finance entry' USING ERRCODE='22023';END IF;
 IF v_kind NOT IN ('revenue','expense') AND v_wallet<>'safe' THEN RAISE EXCEPTION 'Invalid transfer wallet' USING ERRCODE='22023';END IF;
 -- Every safe mutation takes the same per-store lock before any drawer lock.
 PERFORM 1 FROM public.retail_stores WHERE id=p_store FOR UPDATE;
 IF v_kind='drawer_to_safe' OR (v_kind='expense' AND v_wallet='cash_drawer') THEN v_cash:='cash_out';
 ELSIF v_kind='safe_to_drawer' OR (v_kind='revenue' AND v_wallet='cash_drawer') THEN v_cash:='cash_in';END IF;
 IF v_cash IS NOT NULL THEN
  SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND id=p_session AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not open' USING ERRCODE='22023';END IF;
 END IF;
 v_state:=retail_internal.finance_state_v25(p_store,coalesce(v_session,p_session));
 IF v_kind IN ('drawer_to_safe','safe_deposit') OR (v_kind='revenue' AND v_wallet='safe') THEN v_delta:=v_amount;
 ELSIF v_kind IN ('safe_to_drawer','safe_withdraw') OR (v_kind='expense' AND v_wallet='safe') THEN v_delta:=-v_amount;END IF;
 IF v_delta<0 AND (v_state->>'safe_balance_minor')::numeric+v_delta<0 THEN RAISE EXCEPTION 'Insufficient safe balance; reconcile opening balance' USING ERRCODE='22023';END IF;
 IF v_cash='cash_out' AND (v_state->>'drawer_balance_minor')::numeric<v_amount THEN RAISE EXCEPTION 'Insufficient cash in drawer' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.retail_finance_entries WHERE store_id=p_store AND request_id=p_request) OR EXISTS(SELECT 1 FROM public.retail_cash_movements WHERE store_id=p_store AND request_id=p_request) THEN RAISE EXCEPTION 'Request already used by unrelated legacy movement' USING ERRCODE='22023';END IF;
 IF v_cash IS NOT NULL THEN PERFORM public.retail_cash_movement(p_store,v_session,p_request,v_cash,v_amount,left(v_note,160));END IF;
 INSERT INTO public.retail_finance_entries(store_id,entry_kind,category,amount_minor,wallet,payee,reference_no,note,actor_id,request_id)
 VALUES(p_store,v_kind,v_category,v_amount,v_wallet,nullif(p_entry->>'payee',''),nullif(p_entry->>'reference_no',''),v_note,auth.uid(),p_request) RETURNING * INTO v_row;
 v_result:=jsonb_build_object('entry',to_jsonb(v_row),'state',retail_internal.finance_state_v25(p_store,coalesce(v_session,p_session)));
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'finance.record_v25',v_row.id,jsonb_build_object('request_id',p_request,'amount_minor',v_amount,'entry_kind',v_kind));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.record_finance_v25(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_record_finance_v25(p_store uuid,p_request uuid,p_entry jsonb,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $fn$ SELECT retail_internal.record_finance_v25(p_store,p_request,p_entry,p_session); $fn$;
REVOKE ALL ON FUNCTION public.retail_record_finance_v25(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_record_finance_v25(uuid,uuid,jsonb,uuid) TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.retail_finance_entries FROM authenticated,anon;
-- Promotional records are authoritative server data, never pre-seeded in a browser.
DO $policies$ DECLARE t text;p record;BEGIN
 FOREACH t IN ARRAY ARRAY['retail_campaigns','retail_offers','retail_discount_rules','retail_coupons'] LOOP
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY promo_read ON public.%I FOR SELECT TO authenticated USING(retail_internal.has_role(store_id,ARRAY[''manager'',''cashier'']))',t);
  EXECUTE format('CREATE POLICY promo_manage ON public.%I FOR ALL TO authenticated USING(retail_internal.has_role(store_id,ARRAY[''manager''])) WITH CHECK(retail_internal.has_role(store_id,ARRAY[''manager'']))',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon',t);
  EXECUTE format('REVOKE TRUNCATE ON public.%I FROM authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 END LOOP;
END $policies$;
-- END EMBEDDED V21 INTEGRITY
COMMIT;
