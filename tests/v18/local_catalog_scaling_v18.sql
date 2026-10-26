-- V18 ISOLATED QA ONLY. No hosted migrations or production mutations.
-- Enterprise Catalog Scaling (50,000+ products, 150,000+ barcodes) & Intelligent Barcode Engine.

-- 1. High-selectivity B-tree and pattern indexes for sub-10ms lookup at 150k+ barcodes
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

-- 2. Verified EAN-13 check digit validator and server-side barcode resolution
-- Supports primary/alias unit & carton codes FIRST, and verified supermarket scale
-- barcode format (Prefix 27 + 5-digit PLU + 5-digit weight in grams + EAN-13 check digit).
-- Purchase costs (unit_purchase_price_minor / carton purchase_price_minor) are NEVER exposed.
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
REVOKE ALL ON FUNCTION retail_internal.is_valid_ean13(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION retail_internal.is_valid_ean13(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_resolve_barcode_v18(
  p_store uuid,
  p_code text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_clean text := btrim(coalesce(p_code, ''));
  v_escaped text;
  v_has_longer boolean := false;
  v_match record;
  v_siblings jsonb := '[]'::jsonb;
  v_plu_raw text;
  v_weight_grams integer;
  v_weight_kg numeric(14,3);
  v_scale_label text := null;
  v_is_scale boolean := false;
  v_plu_count integer := 0;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store, array['manager','cashier']) THEN
    RAISE EXCEPTION 'Cashier permission required' USING errcode = '42501';
  END IF;

  IF length(v_clean) NOT BETWEEN 1 AND 60 OR v_clean ~ '[[:space:],،;]' THEN
    RETURN jsonb_build_object('found', false, 'has_longer_prefix', false);
  END IF;

  v_escaped := replace(replace(replace(v_clean, '\', '\\'), '%', '\%'), '_', '\_');

  SELECT EXISTS(
    SELECT 1
    FROM public.retail_barcodes b2
    JOIN public.retail_products p2 ON p2.store_id = b2.store_id AND p2.id = b2.product_id
    WHERE b2.store_id = p_store
      AND b2.active = true
      AND p2.active = true
      AND p2.currency = 'IQD'
      AND length(b2.code) > length(v_clean)
      AND b2.code LIKE v_escaped || '%' ESCAPE '\'
  ) INTO v_has_longer;

  -- Step 1: Ordinary registered unit & carton barcodes ALWAYS take precedence
  SELECT
    b.code,
    b.product_id,
    b.unit_type,
    b.units_per_scan,
    p.name AS product_name,
    p.sku,
    p.plu,
    p.price_minor AS unit_price_minor,
    p.currency,
    c.sale_price_minor AS carton_price_minor,
    c.units_per_carton,
    c.carton_name,
    CASE WHEN b.unit_type = 'carton' THEN c.sale_price_minor ELSE p.price_minor END AS price_minor,
    coalesce(s.quantity, 0) AS stock_quantity
  INTO v_match
  FROM public.retail_barcodes b
  JOIN public.retail_products p ON p.store_id = b.store_id AND p.id = b.product_id
  LEFT JOIN public.retail_product_cartons c ON c.store_id = b.store_id AND c.product_id = b.product_id
  LEFT JOIN public.retail_stock_balances s ON s.store_id = b.store_id AND s.product_id = b.product_id
  WHERE b.store_id = p_store
    AND b.code = v_clean
    AND b.active = true
    AND p.active = true
    AND p.currency = 'IQD'
    AND (
      (b.unit_type = 'unit' AND b.units_per_scan = 1 AND p.price_minor IS NOT NULL)
      OR (b.unit_type = 'carton' AND c.product_id IS NOT NULL AND b.units_per_scan = c.units_per_carton AND b.units_per_scan >= 2 AND c.sale_price_minor IS NOT NULL)
    )
  LIMIT 1;

  -- Step 2: Verified scale barcode format ONLY (Prefix 27 + 5-digit PLU + 5-digit weight in grams + EAN-13 checksum)
  IF NOT FOUND THEN
    IF v_clean ~ '^27[0-9]{11}$' AND retail_internal.is_valid_ean13(v_clean) THEN
      v_plu_raw := substring(v_clean FROM 3 FOR 5);
      v_weight_grams := substring(v_clean FROM 8 FOR 5)::integer;
      IF v_plu_raw <> '00000' AND v_weight_grams > 0 THEN
        SELECT count(*)
        INTO v_plu_count
        FROM public.retail_products p
        WHERE p.store_id = p_store
          AND p.active = true
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

        IF v_plu_count = 1 THEN
          v_weight_kg := round((v_weight_grams::numeric / 1000.0), 3);
          v_scale_label := to_char(v_weight_kg, 'FM999990.000') || ' کگم';
          v_is_scale := true;

          SELECT
            v_clean AS code,
            p.id AS product_id,
            'unit'::text AS unit_type,
            1 AS units_per_scan,
            p.name AS product_name,
            p.sku,
            p.plu,
            p.price_minor AS unit_price_minor,
            p.currency,
            c.sale_price_minor AS carton_price_minor,
            c.units_per_carton,
            c.carton_name,
            round((p.price_minor::numeric * v_weight_grams::numeric) / 1000.0)::bigint AS price_minor,
            coalesce(s.quantity, 0) AS stock_quantity
          INTO v_match
          FROM public.retail_products p
          LEFT JOIN public.retail_product_cartons c ON c.store_id = p.store_id AND c.product_id = p.id
          LEFT JOIN public.retail_stock_balances s ON s.store_id = p.store_id AND s.product_id = p.id
          WHERE p.store_id = p_store
            AND p.active = true
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
            )
          LIMIT 1;
        END IF;
      END IF;
    END IF;
    IF v_match IS NULL OR v_match.price_minor IS NULL OR v_match.price_minor <= 0 THEN
      RETURN jsonb_build_object(
        'found', false,
        'code', v_clean,
        'has_longer_prefix', v_has_longer
      );
    END IF;
  END IF;

  IF v_is_scale THEN
    v_siblings := jsonb_build_array(
      jsonb_build_object(
        'code', v_clean,
        'product_id', v_match.product_id,
        'unit_type', 'unit',
        'units_per_scan', 1,
        'price_minor', v_match.price_minor,
        'is_scale', true,
        'scale_grams', v_weight_grams,
        'scale_weight_kg', v_weight_kg,
        'scale_label', v_scale_label
      )
    );
  ELSE
    SELECT coalesce(jsonb_agg(row_to_json(sb)::jsonb ORDER BY sb.code), '[]'::jsonb)
    INTO v_siblings
    FROM (
      SELECT
        b3.code,
        b3.product_id,
        b3.unit_type,
        b3.units_per_scan,
        CASE WHEN b3.unit_type = 'carton' THEN v_match.carton_price_minor ELSE v_match.unit_price_minor END AS price_minor
      FROM public.retail_barcodes b3
      WHERE b3.store_id = p_store
        AND b3.product_id = v_match.product_id
        AND b3.active = true
    ) sb;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'code', v_match.code,
    'product_id', v_match.product_id,
    'product_name', v_match.product_name,
    'sku', v_match.sku,
    'plu', v_match.plu,
    'unit_type', v_match.unit_type,
    'units_per_scan', v_match.units_per_scan,
    'is_scale', v_is_scale,
    'scale_grams', CASE WHEN v_is_scale THEN v_weight_grams ELSE null END,
    'scale_weight_kg', CASE WHEN v_is_scale THEN v_weight_kg ELSE null END,
    'scale_label', v_scale_label,
    'price_minor', v_match.price_minor,
    'unit_price_minor', v_match.unit_price_minor,
    'carton_price_minor', v_match.carton_price_minor,
    'units_per_carton', v_match.units_per_carton,
    'carton_name', v_match.carton_name,
    'currency', v_match.currency,
    'stock_quantity', v_match.stock_quantity,
    'has_longer_prefix', v_has_longer,
    'product_barcodes', v_siblings
  );
END;
$$;
REVOKE ALL ON FUNCTION public.retail_resolve_barcode_v18(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_resolve_barcode_v18(uuid, text) TO authenticated;

-- 3. Paginated Catalog & Price Inspection RPC (50 items default, max 100)
-- Supports 50,000+ products without full-table client transfer. Purchase costs excluded.
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

-- 5. Transactional Receipt Return RPC & Verified 27 Scale Barcode Checkout (V18/V19)
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

CREATE OR REPLACE FUNCTION retail_internal.guard_unit_sale_v16()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $v16guard$
BEGIN
 IF NEW.package_type='unit' AND NOT EXISTS(
   SELECT 1 FROM public.retail_barcodes b
   WHERE b.store_id=NEW.store_id AND b.product_id=NEW.product_id
     AND b.unit_type='unit' AND b.active AND b.units_per_scan=1
 ) AND NOT (
   NEW.package_barcode IS NOT NULL
   AND NEW.package_barcode ~ '^27[0-9]{11}$'
   AND retail_internal.is_valid_ean13(NEW.package_barcode)
   AND EXISTS (
     SELECT 1 FROM public.retail_products p
     WHERE p.store_id = NEW.store_id AND p.id = NEW.product_id
       AND p.active AND p.plu IS NOT NULL AND p.price_minor > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.retail_barcodes bc
         WHERE bc.store_id = p.store_id AND bc.product_id = p.id AND bc.unit_type = 'carton' AND bc.active
       )
   )
 ) THEN
   RAISE EXCEPTION 'Unit sale not enabled for this product' USING errcode='22023';
 END IF;
 RETURN NEW;
END;
$v16guard$;
REVOKE ALL ON FUNCTION retail_internal.guard_unit_sale_v16() FROM PUBLIC,anon,authenticated;

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
      -- Step 2: Verified scale barcode format ONLY (Prefix 27 + 5-digit PLU + 5-digit weight in grams + EAN-13 checksum)
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
      WHERE p.store_id = p_store
        AND p.active = true
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
     package_type,package_barcode,units_per_package,base_units)
    VALUES(p_store,v_sale,v_product,v_qty,v_pack_price,
      v_snapshot_name,v_pack_type,v_barcode,v_pack_units,v_line_base_units);
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
