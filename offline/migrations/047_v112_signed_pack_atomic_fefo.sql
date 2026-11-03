-- V112: actual atomic signed bundle/set FEFO sale, disposable PostgreSQL LAB ONLY.
-- Server-priced, prequoted pack prices, immutable package snapshots, V90 LOT
-- allocations, durable receipt + stock + outbox. NO production or public route.
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
 OR to_regprocedure('zhirox_local.quote_proven_fefo_pack_v111(uuid,uuid,uuid,jsonb,jsonb)') IS NULL
 OR to_regprocedure('zhirox_local.checkout_proven_fefo_v97(uuid,uuid,uuid,jsonb,jsonb)') IS NULL
 OR to_regclass('zhirox_local.lot_inventory_v90') IS NULL
 OR to_regclass('zhirox_local.lot_checkouts_v90') IS NULL
 OR to_regclass('zhirox_local.v112_pack_checkouts') IS NOT NULL
 THEN RAISE EXCEPTION 'V112 requires isolated V111 + V97 + V90 test market'
   USING ERRCODE='P9701';
 END IF;
END $guard$;
ALTER TABLE zhirox_local.sale_lines
 ADD COLUMN IF NOT EXISTS barcode_snapshot text,
 ADD COLUMN IF NOT EXISTS sale_mode_snapshot text,
 ADD COLUMN IF NOT EXISTS scan_quantity integer,
 ADD COLUMN IF NOT EXISTS pack_size_snapshot integer;
CREATE TABLE zhirox_local.v112_pack_checkouts(
 store_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 signed_lines jsonb NOT NULL CHECK(jsonb_typeof(signed_lines)='array'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,sale_id),
 UNIQUE(store_id,request_id),
 FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.sales(store_id,id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id),
 CHECK(store_id='88000000-0000-4000-8000-000000000080'::uuid)
);
CREATE TRIGGER v112_pack_checkout_immutable
 BEFORE UPDATE OR DELETE ON zhirox_local.v112_pack_checkouts
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_lot_v90_mutation();
REVOKE ALL ON TABLE zhirox_local.v112_pack_checkouts FROM PUBLIC;

-- V84 refund multiplies BASE qty by unit_price_minor; a pack line's price is
-- per PACK, so V84 could over-credit. Fail closed until pack-aware refunds.
CREATE FUNCTION zhirox_local.deny_legacy_pack_refund_v112()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM zhirox_local.v112_pack_checkouts x
   WHERE x.store_id=NEW.store_id AND x.sale_id=NEW.sale_id)
 THEN RAISE EXCEPTION 'V112 pack refunds require original pack-price refund route'
   USING ERRCODE='P1125'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER v112_deny_incorrect_pack_refunds
 BEFORE INSERT ON zhirox_local.sale_returns_v84
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.deny_legacy_pack_refund_v112();
REVOKE ALL ON FUNCTION zhirox_local.deny_legacy_pack_refund_v112() FROM PUBLIC;

CREATE FUNCTION zhirox_local.checkout_proven_pack_fefo_v112(
 p_store uuid,p_actor uuid,p_request uuid,p_lines jsonb,p_proof jsonb
) RETURNS TABLE(approved boolean,reason text,audit_id uuid,
 sale_id uuid,receipt_no bigint,total_minor bigint,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 v_reason text:='signature_valid';
 v_nonce text; v_mac text; v_exp bigint; v_sv integer; v_epoch bigint;
 v_key bytea; v_expected text; v_msg text; v_nonce_used integer;
 v_account record; v_audit uuid:=gen_random_uuid();
 v_sale uuid; v_receipt bigint; v_total bigint;
 v_replayed boolean:=false; v_approved boolean:=false;
 v_old zhirox_local.sales%ROWTYPE;
 v_input jsonb; v_code text; v_qty bigint; v_price bigint; v_size bigint;
 v_pack record; v_need numeric; v_amount numeric; v_gross numeric:=0;
 v_items jsonb:='[]'::jsonb; v_line_no integer:=0; v_sale_id uuid;
 v_row record; v_lot record; v_remaining bigint; v_take bigint;
 v_allocation_no integer; v_total_need numeric:=0;
BEGIN
 IF session_user<>'zhirox_v95_gate'
 OR current_database()<>'zhirox_v80_disposable'
 THEN RAISE EXCEPTION 'V112 requires isolated restricted SQL gate'
   USING ERRCODE='P9701'; END IF;
 IF p_store IS DISTINCT FROM '88000000-0000-4000-8000-000000000080'::uuid
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR NOT EXISTS(SELECT 1 FROM zhirox_local.stores
   WHERE id=p_store AND name='مارکێتی تاقیکردنەوە')
 THEN RAISE EXCEPTION 'V112 cannot access any other market'
   USING ERRCODE='P9701'; END IF;

 IF p_actor IS NULL OR p_request IS NULL
 OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30
 OR jsonb_typeof(p_proof) IS DISTINCT FROM 'object'
 OR (SELECT count(*) FROM jsonb_object_keys(COALESCE(p_proof,'{}'::jsonb)))<>4
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(COALESCE(p_proof,'{}'::jsonb)) k
    WHERE k NOT IN ('nonce','exp','sv','mac'))
 OR jsonb_typeof(p_proof->'nonce') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_proof->'mac') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_proof->'exp') IS DISTINCT FROM 'number'
 OR jsonb_typeof(p_proof->'sv') IS DISTINCT FROM 'number'
 THEN v_reason:='malformed_proof_or_cart';
 ELSE
  v_nonce:=p_proof->>'nonce'; v_mac:=p_proof->>'mac';
  IF v_nonce !~ '^[0-9a-f]{32}$' OR v_mac !~ '^[0-9a-f]{64}$'
   OR (p_proof->>'exp') !~ '^[0-9]{10}$'
   OR (p_proof->>'sv') !~ '^[1-9][0-9]{0,8}$'
  THEN v_reason:='malformed_proof_or_cart';
  ELSE
   v_exp:=(p_proof->>'exp')::bigint;v_sv:=(p_proof->>'sv')::integer;
   v_epoch:=floor(extract(epoch FROM clock_timestamp()))::bigint;
   IF v_exp<=v_epoch OR v_exp>v_epoch+90
   THEN v_reason:='expired_or_long_lived_proof';
   ELSE
    SELECT secret_key INTO v_key FROM zhirox_local.v96_proof_keys
     WHERE store_id=p_store;
    IF v_key IS NULL THEN v_reason:='proof_key_unavailable';
    ELSE
     v_msg:=p_store::text||'|'||p_actor::text||'|'||v_sv::text||'|'||
       p_request::text||'|'||p_lines::text||'|'||v_exp::text||'|'||v_nonce;
     v_expected:=encode(public.hmac(convert_to(v_msg,'UTF8'),v_key,'sha256'),'hex');
     IF v_mac<>v_expected THEN v_reason:='invalid_signature'; END IF;
    END IF;
   END IF;
  END IF;
 END IF;

 IF v_reason='signature_valid' THEN
  SELECT role,enabled,session_version,locked_until INTO v_account
   FROM zhirox_local.local_users
   WHERE store_id=p_store AND id=p_actor FOR SHARE;
  IF NOT FOUND OR NOT v_account.enabled
   OR v_account.role NOT IN('owner','manager','cashier')
   OR v_account.session_version<>v_sv
   OR (v_account.locked_until IS NOT NULL AND v_account.locked_until>clock_timestamp())
  THEN v_reason:='actor_revoked_or_unauthorized';
  ELSE
   INSERT INTO zhirox_local.v96_used_nonces(store_id,nonce,request_id,actor_id)
    VALUES(p_store,v_nonce,p_request,p_actor)
    ON CONFLICT(store_id,nonce) DO NOTHING;
   GET DIAGNOSTICS v_nonce_used=ROW_COUNT;
   IF v_nonce_used<>1 THEN v_reason:='replayed_proof';
   ELSE
    BEGIN
     -- ONE store lock serializes V90, V97 and V112 against lost stock and LOT
     -- races. Financial writes are undone together on any error.
     PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
     IF NOT EXISTS(SELECT 1 FROM zhirox_local.lot_cutovers_v90
       WHERE store_id=p_store) THEN
       RAISE EXCEPTION 'V112 unified FEFO LOT cutover missing' USING ERRCODE='P1121';
     END IF;
     SELECT * INTO v_old FROM zhirox_local.sales s
      WHERE s.store_id=p_store AND s.request_id=p_request;
     IF FOUND THEN
      IF v_old.cashier_id IS DISTINCT FROM p_actor
       OR v_old.request_payload IS DISTINCT FROM p_lines
       OR NOT EXISTS(SELECT 1 FROM zhirox_local.v112_pack_checkouts x
         WHERE x.store_id=p_store AND x.sale_id=v_old.id
           AND x.request_id=p_request AND x.actor_id=p_actor
           AND x.signed_lines=p_lines)
      THEN RAISE EXCEPTION 'V112 idempotency mismatch' USING ERRCODE='P1122'; END IF;
      v_sale:=v_old.id;v_receipt:=v_old.receipt_no;v_total:=v_old.total_minor;
      v_replayed:=true;v_approved:=true;v_reason:='pack_idempotent_replay';
     ELSE
      -- Price and size are quoted values included INSIDE the signed cart.
      -- Re-read both from DB under row locks. A changed quote MUST reject.
      FOR v_input IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
       IF jsonb_typeof(v_input) IS DISTINCT FROM 'object'
        OR (SELECT count(*) FROM jsonb_object_keys(v_input))<>4
        OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_input) k WHERE k NOT IN
             ('barcode','qty','expected_price_minor','expected_units_per_pack'))
        OR jsonb_typeof(v_input->'barcode') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_input->'qty') IS DISTINCT FROM 'number'
        OR jsonb_typeof(v_input->'expected_price_minor') IS DISTINCT FROM 'number'
        OR jsonb_typeof(v_input->'expected_units_per_pack') IS DISTINCT FROM 'number'
        OR (v_input->>'qty') !~ '^[1-9][0-9]{0,2}$'
        OR (v_input->>'expected_price_minor') !~ '^[1-9][0-9]{0,8}$'
        OR (v_input->>'expected_units_per_pack') !~ '^[1-9][0-9]{0,5}$'
       THEN RAISE EXCEPTION 'V112 malformed signed pack line' USING ERRCODE='P1123'; END IF;
       v_code:=v_input->>'barcode';v_qty:=(v_input->>'qty')::bigint;
       v_price:=(v_input->>'expected_price_minor')::bigint;
       v_size:=(v_input->>'expected_units_per_pack')::bigint;
       IF v_code !~ '^[A-Za-z0-9._-]{4,80}$' OR v_qty>100
       THEN RAISE EXCEPTION 'V112 invalid barcode or count' USING ERRCODE='P1123'; END IF;
       SELECT b.product_id,b.quantity_base_units,b.sale_price_minor,
        b.sale_mode,b.display_name,p.name AS product_name
       INTO v_pack FROM zhirox_local.barcodes b
        JOIN zhirox_local.products p ON p.store_id=b.store_id AND p.id=b.product_id
       WHERE b.store_id=p_store AND b.code=v_code AND b.active AND p.active
        AND b.sale_mode IN('bundle','set')
       FOR UPDATE OF b,p;
       IF NOT FOUND OR v_pack.quantity_base_units IS DISTINCT FROM v_size
         OR v_pack.sale_price_minor IS DISTINCT FROM v_price
         OR v_pack.quantity_base_units NOT BETWEEN 2 AND 100000
         OR v_pack.sale_price_minor NOT BETWEEN 1 AND 999999999
         OR length(btrim(COALESCE(v_pack.display_name,''))) NOT BETWEEN 1 AND 120
       THEN RAISE EXCEPTION 'V112 stale or invalid pack definition' USING ERRCODE='P1124'; END IF;
       v_need:=v_qty::numeric*v_size::numeric;
       v_amount:=v_qty::numeric*v_price::numeric;
       v_total_need:=v_total_need+v_need;v_gross:=v_gross+v_amount;
       IF v_need>1000000 OR v_total_need>1000000 OR v_gross>9999999999999
       THEN RAISE EXCEPTION 'V112 quantity or money limit' USING ERRCODE='P1123'; END IF;
       v_items:=v_items||jsonb_build_array(jsonb_build_object(
        'barcode',v_code,'mode',v_pack.sale_mode,'name',v_pack.display_name,
        'product_id',v_pack.product_id,'packs',v_qty,
        'units_per_pack',v_size,'base_units',v_need::bigint,
        'pack_price_minor',v_price,'line_total_minor',v_amount::bigint));
      END LOOP;

      -- Check ONE aggregate balance per SKU before any financial write.
      FOR v_row IN SELECT (x->>'product_id')::uuid AS product_id,
         sum((x->>'base_units')::bigint) AS required
       FROM jsonb_array_elements(v_items) x GROUP BY 1 ORDER BY 1 LOOP
       IF v_row.required>COALESCE((SELECT stock_base_units
           FROM zhirox_local.products p
           WHERE p.store_id=p_store AND p.id=v_row.product_id),-1)
        OR v_row.required>COALESCE((SELECT sum(tracked_remaining)
           FROM zhirox_local.lot_inventory_v90 l
           WHERE l.store_id=p_store AND l.product_id=v_row.product_id
             AND l.expires_on>=current_date AND l.tracked_remaining>0),0)
       THEN RAISE EXCEPTION 'V112 insufficient nonexpired LOT stock'
         USING ERRCODE='P1126'; END IF;
      END LOOP;

      v_sale_id:=gen_random_uuid();
      INSERT INTO zhirox_local.receipt_counters(store_id,next_no)
       VALUES(p_store,1) ON CONFLICT(store_id) DO NOTHING;
      UPDATE zhirox_local.receipt_counters c SET next_no=c.next_no+1
       WHERE c.store_id=p_store RETURNING c.next_no-1 INTO v_receipt;

      -- V88 trigger protects sale inserts after FEFO cutover. Only this
      -- restricted transaction uses the existing V90 test routing interlock.
      PERFORM set_config('zhirox.v88_fefo_route','test_v90_authorized',true);
      INSERT INTO zhirox_local.sales
       (store_id,id,request_id,receipt_no,cashier_id,total_minor,request_payload)
       VALUES(p_store,v_sale_id,p_request,v_receipt,p_actor,v_gross::bigint,p_lines);
      PERFORM set_config('zhirox.v88_fefo_route','',true);
      INSERT INTO zhirox_local.v112_pack_checkouts
       (store_id,sale_id,request_id,actor_id,signed_lines)
       VALUES(p_store,v_sale_id,p_request,p_actor,p_lines);
      INSERT INTO zhirox_local.lot_checkouts_v90
       (store_id,sale_id,request_id,actor_id)
       VALUES(p_store,v_sale_id,p_request,p_actor);

      -- Snapshot exactly the scanned barcode, pack identity, count and price.
      FOR v_input IN SELECT value FROM jsonb_array_elements(v_items) LOOP
       v_line_no:=v_line_no+1;
       INSERT INTO zhirox_local.sale_lines(
        store_id,sale_id,line_no,product_id,name_snapshot,
        quantity_base_units,unit_price_minor,line_total_minor,
        barcode_snapshot,sale_mode_snapshot,scan_quantity,pack_size_snapshot)
       VALUES(p_store,v_sale_id,v_line_no,(v_input->>'product_id')::uuid,
         v_input->>'name',(v_input->>'base_units')::bigint,
         (v_input->>'pack_price_minor')::bigint,
         (v_input->>'line_total_minor')::bigint,
         v_input->>'barcode',v_input->>'mode',
         (v_input->>'packs')::integer,(v_input->>'units_per_pack')::integer);
      END LOOP;

      -- Aggregate stock ledger: no double subtraction for bundle+set same SKU.
      FOR v_row IN SELECT (x->>'product_id')::uuid AS product_id,
         sum((x->>'base_units')::bigint) AS required
       FROM jsonb_array_elements(v_items) x GROUP BY 1 ORDER BY 1 LOOP
       UPDATE zhirox_local.products p
        SET stock_base_units=p.stock_base_units-v_row.required,version=p.version+1
       WHERE p.store_id=p_store AND p.id=v_row.product_id
         AND p.active AND p.stock_base_units>=v_row.required;
       IF NOT FOUND THEN RAISE EXCEPTION 'V112 concurrent stock conflict'
         USING ERRCODE='P1126'; END IF;
       INSERT INTO zhirox_local.stock_ledger(
        store_id,id,product_id,sale_id,delta_base_units)
       VALUES(p_store,gen_random_uuid(),v_row.product_id,v_sale_id,-v_row.required);
      END LOOP;

      -- FEFO attribution of EACH original receipt line, including bundles
      -- and sets of the same product, against V90 immutable LOT journal.
      FOR v_row IN SELECT l.line_no,l.product_id,l.quantity_base_units
       FROM zhirox_local.sale_lines l
       WHERE l.store_id=p_store AND l.sale_id=v_sale_id
       ORDER BY l.product_id,l.line_no LOOP
       v_remaining:=v_row.quantity_base_units;v_allocation_no:=0;
       FOR v_lot IN SELECT opening_id,receipt_id,receipt_line_no,
          product_id,lot_code,tracked_remaining
        FROM zhirox_local.lot_inventory_v90 l
        WHERE l.store_id=p_store AND l.product_id=v_row.product_id
          AND l.expires_on>=current_date AND l.tracked_remaining>0
        ORDER BY l.expires_on,l.lot_origin,l.lot_code,
          l.opening_id NULLS LAST,l.receipt_id NULLS LAST,l.receipt_line_no NULLS LAST
       LOOP
        v_take:=LEAST(v_remaining,v_lot.tracked_remaining);
        v_allocation_no:=v_allocation_no+1;
        INSERT INTO zhirox_local.lot_sale_allocations_v90(
         store_id,sale_id,line_no,allocation_no,opening_id,receipt_id,
         receipt_line_no,product_id,quantity_base_units)
        VALUES(p_store,v_sale_id,v_row.line_no,v_allocation_no,
         v_lot.opening_id,v_lot.receipt_id,v_lot.receipt_line_no,
         v_row.product_id,v_take);
        v_remaining:=v_remaining-v_take;
        EXIT WHEN v_remaining=0;
       END LOOP;
       IF v_remaining<>0 THEN RAISE EXCEPTION 'V112 FEFO attribution mismatch'
        USING ERRCODE='P1126'; END IF;
      END LOOP;

      INSERT INTO zhirox_local.event_outbox(
       store_id,event_id,aggregate_id,event_type,payload)
      VALUES(p_store,gen_random_uuid(),v_sale_id,'sale.completed',
        jsonb_build_object('sale_id',v_sale_id,'receipt_no',v_receipt,
          'total_minor',v_gross::bigint,'fixed_pack_lines',v_items));
      v_sale:=v_sale_id;v_total:=v_gross::bigint;
      v_approved:=true;v_replayed:=false;v_reason:='pack_sale_committed';
     END IF;
    EXCEPTION WHEN OTHERS THEN
     -- Roll back all financial writes in this nested block together; the
     -- nonce remains consumed and a non-financial denial gets audited.
     v_sale:=NULL;v_receipt:=NULL;v_total:=NULL;
     v_replayed:=false;v_approved:=false;v_reason:='pack_checkout_rejected';
    END;
   END IF;
  END IF;
 END IF;
 INSERT INTO zhirox_local.v97_checkout_audit(
   audit_id,store_id,actor_claim,request_id,approved,reason,
   sale_id,receipt_no,total_minor,replayed)
 VALUES(v_audit,p_store,p_actor,p_request,v_approved,v_reason,
   v_sale,v_receipt,v_total,v_replayed);
 RETURN QUERY SELECT v_approved,v_reason,v_audit,
  v_sale,v_receipt,v_total,v_replayed;
END $fn$;
REVOKE ALL ON FUNCTION
 zhirox_local.checkout_proven_pack_fefo_v112(uuid,uuid,uuid,jsonb,jsonb)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 zhirox_local.checkout_proven_pack_fefo_v112(uuid,uuid,uuid,jsonb,jsonb)
 TO zhirox_v95_gate;
COMMENT ON FUNCTION zhirox_local.checkout_proven_pack_fefo_v112(uuid,uuid,uuid,jsonb,jsonb) IS
 'DISPOSABLE TEST ONLY: cryptographic actor-bound signed expected pack prices+sizes, exact barcode/receipt snapshots, atomic FEFO LOT and stock ledger with idempotency. No public cashier payment route or production approval.';
COMMIT;
