-- V110 catalog registration: disposable PostgreSQL integration only.
-- NEVER apply to real supermarket, ZHIROX NEW, Supabase or production LAN.
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'zhirox_v110_packs_disposable'
 THEN RAISE EXCEPTION 'V110 catalog requires disposable database' USING ERRCODE='P0110'; END IF;
END $guard$;

CREATE TABLE zhirox_local.fixed_pack_catalog_changes_v110(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 product_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('bundle','set')),
 payload jsonb NOT NULL,
 old_version bigint NOT NULL,
 new_version bigint NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (store_id,request_id),
 FOREIGN KEY (store_id,product_id) REFERENCES zhirox_local.products(store_id,id),
 CHECK(new_version=old_version+1)
);
REVOKE ALL ON zhirox_local.fixed_pack_catalog_changes_v110 FROM PUBLIC;

CREATE FUNCTION zhirox_local.register_fixed_pack_v110(
 p_store uuid,p_actor uuid,p_sv integer,p_request uuid,p_product uuid,
 p_kind text,p_name text,p_barcode text,p_aliases text[],
 p_units integer,p_price bigint,p_expected_version bigint
) RETURNS TABLE(next_version bigint,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local
AS $fn$
DECLARE
 v_codes text[];
 v_code text;
 v_existing zhirox_local.fixed_pack_catalog_changes_v110%ROWTYPE;
 v_product zhirox_local.products%ROWTYPE;
 v_payload jsonb;
 v_new_version bigint;
BEGIN
 IF current_database()<>'zhirox_v110_packs_disposable'
 THEN RAISE EXCEPTION 'V110 catalog disabled outside disposable database' USING ERRCODE='P0110'; END IF;
 IF p_store IS NULL OR p_actor IS NULL OR p_sv IS NULL OR p_sv<1
 OR p_request IS NULL OR p_product IS NULL
 OR p_kind NOT IN ('bundle','set') OR p_kind IS NULL
 OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
 OR p_name<>btrim(p_name) OR
 p_barcode IS NULL OR p_barcode !~ '^[A-Za-z0-9._-]{4,80}$'
 OR p_aliases IS NULL OR COALESCE(array_length(p_aliases,1),0)>30
 OR p_units NOT BETWEEN 2 AND 100000 OR p_units IS NULL
 OR p_price NOT BETWEEN 1 AND 999999999 OR p_price IS NULL
 OR p_expected_version IS NULL OR p_expected_version<1
 THEN RAISE EXCEPTION 'invalid fixed pack registration' USING ERRCODE='22023'; END IF;
 v_codes:=ARRAY[p_barcode]||p_aliases;
 FOREACH v_code IN ARRAY v_codes LOOP
   IF v_code IS NULL OR v_code !~ '^[A-Za-z0-9._-]{4,80}$'
   THEN RAISE EXCEPTION 'invalid alias code' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM unnest(v_codes) code GROUP BY code HAVING count(*)>1)
 THEN RAISE EXCEPTION 'duplicate alias or primary barcode' USING ERRCODE='23505'; END IF;
 v_payload:=jsonb_build_object('product',p_product,'kind',p_kind,'name',p_name,
   'barcode',p_barcode,'aliases',p_aliases,'units',p_units,'price',p_price,
   'expected_version',p_expected_version);
 -- Store lock serializes all pack registrations and base-unit checkout.
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users u
   WHERE u.store_id=p_store AND u.id=p_actor AND u.enabled
     AND u.session_version=p_sv AND u.role IN ('owner','manager')
     AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp()))
 THEN RAISE EXCEPTION 'unauthorized catalog actor' USING ERRCODE='P1101'; END IF;
 SELECT * INTO v_existing FROM zhirox_local.fixed_pack_catalog_changes_v110
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
   IF v_existing.actor_id IS DISTINCT FROM p_actor
    OR v_existing.payload IS DISTINCT FROM v_payload
   THEN RAISE EXCEPTION 'changed catalog request replay' USING ERRCODE='23505'; END IF;
   RETURN QUERY SELECT v_existing.new_version,true;
   RETURN;
 END IF;
 SELECT * INTO v_product FROM zhirox_local.products
 WHERE store_id=p_store AND id=p_product AND active AND base_unit='unit'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'fixed pack only supports active unit SKU'
  USING ERRCODE='22023'; END IF;
 IF v_product.version<>p_expected_version
 THEN RAISE EXCEPTION 'stale product version' USING ERRCODE='P1102'; END IF;
 -- Retired/other-mode barcodes are permanently reserved. No silent reassignment.
 IF EXISTS(SELECT 1 FROM zhirox_local.barcodes b
   WHERE b.store_id=p_store AND b.code=ANY(v_codes)
     AND (b.product_id<>p_product OR b.sale_mode<>p_kind))
 THEN RAISE EXCEPTION 'barcode owned by different product or sale mode'
   USING ERRCODE='23505'; END IF;
 -- One active fixed pack per SKU and kind; preserve old codes as inactive for audit.
 UPDATE zhirox_local.barcodes SET active=false
 WHERE store_id=p_store AND product_id=p_product AND sale_mode=p_kind AND active;
 FOREACH v_code IN ARRAY v_codes LOOP
  INSERT INTO zhirox_local.barcodes AS b
   (store_id,code,product_id,quantity_base_units,active,sale_mode,sale_price_minor,display_name)
  VALUES(p_store,v_code,p_product,p_units,true,p_kind,p_price,p_name)
  ON CONFLICT(store_id,code) DO UPDATE
    SET quantity_base_units=EXCLUDED.quantity_base_units,
        active=true,sale_price_minor=EXCLUDED.sale_price_minor,
        display_name=EXCLUDED.display_name
  WHERE b.product_id=EXCLUDED.product_id AND b.sale_mode=EXCLUDED.sale_mode;
  IF NOT FOUND THEN RAISE EXCEPTION 'barcode conflict' USING ERRCODE='23505'; END IF;
 END LOOP;
 UPDATE zhirox_local.products SET version=version+1
 WHERE store_id=p_store AND id=p_product RETURNING version INTO v_new_version;
 INSERT INTO zhirox_local.fixed_pack_catalog_changes_v110(
   store_id,request_id,actor_id,product_id,kind,payload,old_version,new_version)
 VALUES(p_store,p_request,p_actor,p_product,p_kind,v_payload,p_expected_version,v_new_version);
 RETURN QUERY SELECT v_new_version,false;
END $fn$;
REVOKE ALL ON FUNCTION zhirox_local.register_fixed_pack_v110(
 uuid,uuid,integer,uuid,uuid,text,text,text,text[],integer,bigint,bigint) FROM PUBLIC;
COMMIT;
