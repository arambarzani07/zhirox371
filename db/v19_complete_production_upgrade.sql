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
  ADD COLUMN IF NOT EXISTS unit_primary_barcode text;

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
GRANT SELECT, INSERT, UPDATE ON public.retail_products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.retail_barcodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retail_product_cartons TO authenticated;
