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

-- 2. Exact server-side barcode resolution for primary/alias unit & carton codes
-- Returns unit/carton sale price, pack size, live base-unit stock, sibling active barcodes,
-- and prefix-collision flag (has_longer_prefix) for 160ms no-Enter auto-scanners.
-- Purchase costs (unit_purchase_price_minor / carton purchase_price_minor) are NEVER exposed.
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

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'code', v_clean,
      'has_longer_prefix', v_has_longer
    );
  END IF;

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

  RETURN jsonb_build_object(
    'found', true,
    'code', v_match.code,
    'product_id', v_match.product_id,
    'product_name', v_match.product_name,
    'sku', v_match.sku,
    'plu', v_match.plu,
    'unit_type', v_match.unit_type,
    'units_per_scan', v_match.units_per_scan,
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
    RAISE EXCEPTION 'Catalog permission required' USING errcode = '42501';
  END IF;

  SELECT count(*)
  INTO v_total
  FROM public.retail_products p
  WHERE p.store_id = p_store
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
REVOKE ALL ON FUNCTION public.retail_catalog_page_v18(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_catalog_page_v18(uuid, text, integer, integer) TO authenticated;

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
