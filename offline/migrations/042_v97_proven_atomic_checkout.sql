-- V97: real ATOMIC checkout in isolated disposable PostgreSQL TEST ONLY.
-- Requires V96 bound preflight and an existing V90 FEFO test cutover.
-- No public API, no production permission, no external money movement.
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'zhirox_v80_disposable'
 OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores
    WHERE id='88000000-0000-4000-8000-000000000080')
    IS DISTINCT FROM 'مارکێتی تاقیکردنەوە'
 OR (SELECT count(*) FROM zhirox_local.sales
    WHERE store_id='88000000-0000-4000-8000-000000000080')<>7
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname='zhirox_v95_gate' AND NOT rolcanlogin)
 OR NOT EXISTS(SELECT 1 FROM zhirox_local.v96_proof_keys
    WHERE store_id='88000000-0000-4000-8000-000000000080')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class
    WHERE relname='v97_checkout_audit' AND relnamespace='zhirox_local'::regnamespace)
 THEN RAISE EXCEPTION 'V97 only for unchanged isolated V96 fixture'
    USING ERRCODE='P9701';
 END IF;
END $guard$;

CREATE TABLE zhirox_local.v97_checkout_audit(
 audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 actor_claim uuid,
 request_id uuid,
 approved boolean NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 2 AND 80),
 sale_id uuid,
 receipt_no bigint,
 total_minor bigint,
 replayed boolean NOT NULL DEFAULT false,
 checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(store_id='88000000-0000-4000-8000-000000000080'::uuid),
 CHECK ((approved AND sale_id IS NOT NULL AND receipt_no IS NOT NULL
   AND total_minor IS NOT NULL)
 OR (NOT approved AND sale_id IS NULL AND receipt_no IS NULL AND total_minor IS NULL))
);
CREATE INDEX v97_checkout_audit_time ON zhirox_local.v97_checkout_audit(checked_at,audit_id);
REVOKE ALL ON TABLE zhirox_local.v97_checkout_audit FROM PUBLIC;

CREATE FUNCTION zhirox_local.checkout_proven_fefo_v97(
 p_store uuid,p_actor uuid,p_request uuid,p_lines jsonb,p_proof jsonb
) RETURNS TABLE(approved boolean,reason text,audit_id uuid,
  sale_id uuid,receipt_no bigint,total_minor bigint,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 v_reason text:='signature_valid';
 v_nonce text;
 v_mac text;
 v_exp bigint;
 v_sv integer;
 v_epoch bigint;
 v_key bytea;
 v_expected text;
 v_msg text;
 v_nonce_used integer;
 v_account record;
 v_result record;
 v_audit uuid:=gen_random_uuid();
 v_sale uuid;
 v_receipt bigint;
 v_total bigint;
 v_replayed boolean:=false;
 v_approved boolean:=false;
BEGIN
 IF session_user<>'zhirox_v95_gate'
 OR current_database()<>'zhirox_v80_disposable'
 THEN RAISE EXCEPTION 'V97 dedicated disposable checkout role required'
    USING ERRCODE='P9701'; END IF;
 IF p_store IS DISTINCT FROM '88000000-0000-4000-8000-000000000080'::uuid
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR NOT EXISTS(SELECT 1 FROM zhirox_local.stores
    WHERE id=p_store AND name='مارکێتی تاقیکردنەوە')
 THEN RAISE EXCEPTION 'V97 cross-store checkout forbidden'
    USING ERRCODE='P9701'; END IF;

 IF p_actor IS NULL OR p_request IS NULL OR
   p_lines IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30
   OR jsonb_typeof(p_proof) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(COALESCE(p_proof,'{}'::jsonb)) k
      WHERE k NOT IN('nonce','exp','sv','mac'))
   OR jsonb_typeof(p_proof->'nonce') IS DISTINCT FROM 'string'
   OR jsonb_typeof(p_proof->'mac') IS DISTINCT FROM 'string'
   OR jsonb_typeof(p_proof->'exp') IS DISTINCT FROM 'number'
   OR jsonb_typeof(p_proof->'sv') IS DISTINCT FROM 'number'
 THEN v_reason:='malformed_proof_or_cart';
 ELSE
  v_nonce:=p_proof->>'nonce';
  v_mac:=p_proof->>'mac';
  IF v_nonce !~ '^[0-9a-f]{32}$'
   OR v_mac !~ '^[0-9a-f]{64}$'
   OR COALESCE(p_proof->>'exp','') !~ '^[0-9]{10}$'
   OR COALESCE(p_proof->>'sv','') !~ '^[1-9][0-9]{0,8}$'
  THEN v_reason:='malformed_proof_or_cart';
  ELSE
   v_exp:=(p_proof->>'exp')::bigint;
   v_sv:=(p_proof->>'sv')::integer;
   v_epoch:=floor(extract(epoch FROM clock_timestamp()))::bigint;
   IF v_exp<=v_epoch OR v_exp>v_epoch+90 THEN
    v_reason:='expired_or_long_lived_proof';
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
  -- Lock this row through the checkout so a concurrent session disable,
  -- session_version bump or role change cannot race the accepted sale.
  SELECT role,enabled,session_version,locked_until INTO v_account
  FROM zhirox_local.local_users
  WHERE store_id=p_store AND id=p_actor FOR SHARE;
  IF NOT FOUND OR NOT v_account.enabled OR
     v_account.role NOT IN('owner','manager','cashier') OR
     v_account.session_version<>v_sv OR
     (v_account.locked_until IS NOT NULL AND v_account.locked_until>clock_timestamp())
  THEN v_reason:='actor_revoked_or_unauthorized';
  ELSE
   INSERT INTO zhirox_local.v96_used_nonces(store_id,nonce,request_id,actor_id)
    VALUES(p_store,v_nonce,p_request,p_actor)
    ON CONFLICT(store_id,nonce) DO NOTHING;
   GET DIAGNOSTICS v_nonce_used=ROW_COUNT;
   IF v_nonce_used<>1 THEN
    v_reason:='replayed_proof';
   ELSE
    -- Single PostgreSQL statement transaction: V90 FEFO uses one store lock,
    -- normalized request payload, receipt sequence, LOT allocations, sales,
    -- stock ledger and outbox. An exception rolls back that entire nested block.
    BEGIN
     SELECT s.sale_id,s.receipt_no,s.total_minor,s.replayed
      INTO v_result FROM zhirox_local.checkout_unified_fefo_v90(
        p_store,p_actor,p_request,p_lines) s;
     IF NOT FOUND THEN RAISE EXCEPTION 'missing V90 sale result'; END IF;
     v_sale:=v_result.sale_id;
     v_receipt:=v_result.receipt_no;
     v_total:=v_result.total_minor;
     v_replayed:=v_result.replayed;
     v_reason:=CASE WHEN v_replayed THEN 'idempotent_replay' ELSE 'sale_committed' END;
     v_approved:=true;
    EXCEPTION WHEN OTHERS THEN
     v_reason:='checkout_rejected';
     v_approved:=false;
     v_sale:=NULL;v_receipt:=NULL;v_total:=NULL;v_replayed:=false;
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

REVOKE EXECUTE ON FUNCTION
 zhirox_local.preflight_checkout_bound_v96(uuid,uuid,uuid,jsonb,jsonb)
 FROM zhirox_v95_gate;
REVOKE ALL ON FUNCTION
 zhirox_local.checkout_proven_fefo_v97(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 zhirox_local.checkout_proven_fefo_v97(uuid,uuid,uuid,jsonb,jsonb) TO zhirox_v95_gate;
COMMENT ON FUNCTION zhirox_local.checkout_proven_fefo_v97(uuid,uuid,uuid,jsonb,jsonb) IS
 'V97 disposable SQL-only TEST: cryptographically bound actor/session-version/cart, transactional FEFO checkout, one-use nonce and audit. Not production authorization.';
COMMIT;
