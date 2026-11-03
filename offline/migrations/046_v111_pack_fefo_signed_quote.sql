-- V111 ISOLATED read-only, HMAC-bound quote for fixed single-SKU packs.
-- No sales, receipt, ledger, outbox, customer money or production writes.
-- This DOES NOT enable V97 to sell packs. Named V80 disposable DB only.
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'zhirox_v80_disposable'
 OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores
      WHERE id='88000000-0000-4000-8000-000000000080')
    IS DISTINCT FROM 'مارکێتی تاقیکردنەوە'
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname='zhirox_v95_gate' AND NOT rolcanlogin)
 OR NOT EXISTS(SELECT 1 FROM zhirox_local.v96_proof_keys
       WHERE store_id='88000000-0000-4000-8000-000000000080')
 OR to_regclass('zhirox_local.v97_checkout_audit') IS NULL
 THEN RAISE EXCEPTION 'V111 only for isolated V97+V90 test database'
   USING ERRCODE='P9701';
 END IF;
END $guard$;

ALTER TABLE zhirox_local.barcodes
 ADD COLUMN IF NOT EXISTS sale_mode text NOT NULL DEFAULT 'unit',
 ADD COLUMN IF NOT EXISTS sale_price_minor bigint,
 ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE zhirox_local.barcodes ADD CONSTRAINT v111_sale_mode
 CHECK (sale_mode IN ('unit','bundle','set'));
ALTER TABLE zhirox_local.barcodes ADD CONSTRAINT v111_fixed_pack
 CHECK (sale_mode='unit' OR
   (quantity_base_units BETWEEN 2 AND 100000
    AND sale_price_minor BETWEEN 1 AND 999999999
    AND display_name IS NOT NULL
    AND length(btrim(display_name)) BETWEEN 1 AND 120));
-- Past V80 product barcode rows remain 'unit' and keep their original prices.

CREATE FUNCTION zhirox_local.quote_proven_fefo_pack_v111(
 p_store uuid,p_actor uuid,p_request uuid,p_lines jsonb,p_proof jsonb
) RETURNS TABLE(eligible boolean,reason text,total_minor bigint,
   required_base_units bigint,line_quotes jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 v_mac text; v_nonce text; v_exp bigint; v_sv integer; v_now bigint;
 v_key bytea; v_expected text; v_message text; v_account record;
 v_input jsonb; v_product uuid; v_code text; v_qty bigint;
 v_pack record; v_need numeric; v_total numeric:=0; v_units numeric:=0;
 v_lines jsonb:='[]'::jsonb; v_stock record; v_ready boolean:=true;
 v_reason text:='eligible_for_quote_only';
BEGIN
 IF session_user<>'zhirox_v95_gate' OR
    current_database()<>'zhirox_v80_disposable' OR
    p_store IS DISTINCT FROM '88000000-0000-4000-8000-000000000080'::uuid
 THEN RAISE EXCEPTION 'V111 restricted test-only quote gate required'
   USING ERRCODE='P9701'; END IF;
 IF p_actor IS NULL OR p_request IS NULL OR
    jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR
    jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30 OR
    jsonb_typeof(p_proof) IS DISTINCT FROM 'object' OR
    (SELECT count(*) FROM jsonb_object_keys(p_proof))<>4 OR
    EXISTS(SELECT 1 FROM jsonb_object_keys(p_proof) k
      WHERE k NOT IN ('nonce','exp','sv','mac')) OR
    jsonb_typeof(p_proof->'nonce') IS DISTINCT FROM 'string' OR
    jsonb_typeof(p_proof->'exp') IS DISTINCT FROM 'number' OR
    jsonb_typeof(p_proof->'sv') IS DISTINCT FROM 'number' OR
    jsonb_typeof(p_proof->'mac') IS DISTINCT FROM 'string'
 THEN RETURN QUERY SELECT false,'invalid_signed_quote',NULL::bigint,NULL::bigint,NULL::jsonb;
   RETURN; END IF;
 v_nonce:=p_proof->>'nonce';v_mac:=p_proof->>'mac';
 IF v_nonce !~ '^[a-f0-9]{32}$' OR v_mac !~ '^[a-f0-9]{64}$' OR
    (p_proof->>'exp') !~ '^[0-9]{10}$' OR
    (p_proof->>'sv') !~ '^[1-9][0-9]{0,8}$'
 THEN RETURN QUERY SELECT false,'invalid_signed_quote',NULL::bigint,NULL::bigint,NULL::jsonb;
   RETURN; END IF;
 v_exp:=(p_proof->>'exp')::bigint;v_sv:=(p_proof->>'sv')::integer;
 v_now:=floor(extract(epoch FROM clock_timestamp()))::bigint;
 IF v_exp<=v_now OR v_exp>v_now+90 THEN
   RETURN QUERY SELECT false,'expired_quote',NULL::bigint,NULL::bigint,NULL::jsonb;
   RETURN; END IF;
 SELECT secret_key INTO v_key FROM zhirox_local.v96_proof_keys
 WHERE store_id=p_store;
 IF v_key IS NULL THEN
   RETURN QUERY SELECT false,'quote_key_unavailable',NULL::bigint,NULL::bigint,NULL::jsonb;
   RETURN; END IF;
 v_message:=p_store::text||'|'||p_actor::text||'|'||v_sv::text||'|'||
   p_request::text||'|'||p_lines::text||'|'||v_exp::text||'|'||v_nonce;
 v_expected:=encode(public.hmac(convert_to(v_message,'UTF8'),v_key,'sha256'),'hex');
 IF v_mac<>v_expected THEN
   RETURN QUERY SELECT false,'invalid_signature',NULL::bigint,NULL::bigint,NULL::jsonb;
   RETURN; END IF;
 SELECT role,enabled,session_version,locked_until INTO v_account
 FROM zhirox_local.local_users
 WHERE store_id=p_store AND id=p_actor FOR SHARE;
 IF NOT FOUND OR NOT v_account.enabled OR
    v_account.role NOT IN ('owner','manager','cashier') OR
    v_account.session_version<>v_sv OR
    (v_account.locked_until IS NOT NULL AND v_account.locked_until>clock_timestamp())
 THEN RETURN QUERY SELECT false,'actor_revoked_or_unauthorized',NULL::bigint,NULL::bigint,NULL::jsonb;
   RETURN; END IF;

 FOR v_input IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   IF jsonb_typeof(v_input)<>'object' OR
      (SELECT count(*) FROM jsonb_object_keys(v_input))<>2 OR
      EXISTS(SELECT 1 FROM jsonb_object_keys(v_input) k WHERE k NOT IN ('barcode','qty')) OR
      jsonb_typeof(v_input->'barcode') IS DISTINCT FROM 'string' OR
      jsonb_typeof(v_input->'qty') IS DISTINCT FROM 'number' OR
      (v_input->>'qty') !~ '^[1-9][0-9]{0,2}$'
   THEN RETURN QUERY SELECT false,'invalid_pack_line',NULL::bigint,NULL::bigint,NULL::jsonb;
      RETURN; END IF;
   v_code:=v_input->>'barcode';v_qty:=(v_input->>'qty')::bigint;
   IF v_code !~ '^[A-Za-z0-9._-]{4,80}$' OR v_qty>100 THEN
      RETURN QUERY SELECT false,'invalid_pack_line',NULL::bigint,NULL::bigint,NULL::jsonb;
      RETURN; END IF;
   SELECT b.product_id,b.quantity_base_units,b.sale_price_minor,
      b.sale_mode,b.display_name,p.stock_base_units
   INTO v_pack
   FROM zhirox_local.barcodes b
   JOIN zhirox_local.products p ON p.store_id=b.store_id AND p.id=b.product_id
   WHERE b.store_id=p_store AND b.code=v_code AND b.active AND p.active
     AND b.sale_mode IN ('bundle','set')
   FOR SHARE OF b,p;
   IF NOT FOUND OR v_pack.quantity_base_units NOT BETWEEN 2 AND 100000
      OR v_pack.sale_price_minor NOT BETWEEN 1 AND 999999999 OR
      length(btrim(COALESCE(v_pack.display_name,''))) NOT BETWEEN 1 AND 120
   THEN RETURN QUERY SELECT false,'pack_not_registered',NULL::bigint,NULL::bigint,NULL::jsonb;
      RETURN; END IF;
   v_need:=v_pack.quantity_base_units::numeric*v_qty;
   v_units:=v_units+v_need;
   v_total:=v_total+v_pack.sale_price_minor::numeric*v_qty;
   IF v_need>1000000 OR v_units>1000000 OR v_total>9999999999999
   THEN RETURN QUERY SELECT false,'quote_limit_exceeded',NULL::bigint,NULL::bigint,NULL::jsonb;
      RETURN; END IF;
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
     'barcode',v_code,'name',v_pack.display_name,'mode',v_pack.sale_mode,
     'product_id',v_pack.product_id,'packs',v_qty,
     'units_per_pack',v_pack.quantity_base_units,'base_units',v_need::bigint,
     'price_minor',v_pack.sale_price_minor,
     'line_total_minor',(v_pack.sale_price_minor::numeric*v_qty)::bigint));
 END LOOP;
 -- FEFO quote is advisory. Global stock and non-expired LOT availability
 -- must both cover aggregate base units across different packs of ONE SKU.
 FOR v_stock IN
   SELECT (line->>'product_id')::uuid AS product_id,
      sum((line->>'base_units')::bigint) AS required
   FROM jsonb_array_elements(v_lines) line GROUP BY 1
 LOOP
   IF v_stock.required>COALESCE((SELECT stock_base_units
      FROM zhirox_local.products
      WHERE store_id=p_store AND id=v_stock.product_id),-1)
   OR v_stock.required>COALESCE((SELECT sum(tracked_remaining)
      FROM zhirox_local.lot_inventory_v90
      WHERE store_id=p_store AND product_id=v_stock.product_id
        AND expires_on>=current_date AND tracked_remaining>0),0)
   OR NOT EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v90 WHERE store_id=p_store)
   THEN v_ready:=false;END IF;
 END LOOP;
 IF NOT v_ready THEN v_reason:='insufficient_nonexpired_lot_stock'; END IF;
 RETURN QUERY SELECT v_ready,v_reason,
   v_total::bigint,v_units::bigint,v_lines;
END $fn$;
REVOKE ALL ON FUNCTION zhirox_local.quote_proven_fefo_pack_v111(
  uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zhirox_local.quote_proven_fefo_pack_v111(
  uuid,uuid,uuid,jsonb,jsonb) TO zhirox_v95_gate;
COMMENT ON FUNCTION zhirox_local.quote_proven_fefo_pack_v111(uuid,uuid,uuid,jsonb,jsonb) IS
 'ISOLATED READ-ONLY V111: signed actor and exact bundle/set, server price, aggregate FEFO availability. Quote is NOT a checkout, holds zero stock and authorizes zero financial mutations.';
COMMIT;
