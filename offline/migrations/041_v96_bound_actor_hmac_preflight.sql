-- V96: disposable CI test market ONLY. HMAC-SHA256 binds a short-lived,
-- single-use actor proof to store, actor, request and canonical PostgreSQL JSONB cart.
-- The test gate may not invoke the V95 unbound entrypoint after this migration.
-- This is NOT an atomic checkout, stock reservation or production security approval.
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'zhirox_v80_disposable'
 OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores WHERE id='88000000-0000-4000-8000-000000000080')
    IS DISTINCT FROM 'مارکێتی تاقیکردنەوە'
 OR (SELECT count(*) FROM zhirox_local.sales
    WHERE store_id='88000000-0000-4000-8000-000000000080')<>7
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname='zhirox_v95_gate' AND NOT rolcanlogin)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_class
    WHERE relnamespace='zhirox_local'::regnamespace AND relname='v96_proof_keys')
 THEN RAISE EXCEPTION 'V96 requires fresh isolated V95 test market' USING ERRCODE='P9601'; END IF;
END $guard$;

-- pgcrypto exists in the disposable PostgreSQL-16 CI image.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE TABLE zhirox_local.v96_proof_keys(
 store_id uuid PRIMARY KEY REFERENCES zhirox_local.stores(id),
 secret_key bytea NOT NULL CHECK(octet_length(secret_key)=32),
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE zhirox_local.v96_used_nonces(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 nonce text NOT NULL CHECK(nonce ~ '^[0-9a-f]{32}$'),
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,nonce)
);
CREATE TABLE zhirox_local.v96_proof_audit(
 audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 actor_claim uuid,
 request_id uuid,
 allowed boolean NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 2 AND 80),
 checked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX v96_proof_audit_by_time ON zhirox_local.v96_proof_audit(checked_at,audit_id);

CREATE FUNCTION zhirox_local.preflight_checkout_bound_v96(
 p_store uuid,p_actor uuid,p_request uuid,p_lines jsonb,p_proof jsonb
) RETURNS TABLE(allowed boolean,reason text,audit_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 v_reason text:='proof_valid';
 v_nonce text;
 v_sig text;
 v_exp bigint;
 v_key bytea;
 v_message text;
 v_expected text;
 v_epoch bigint;
 v_pre record;
 v_used integer;
 v_audit uuid:=gen_random_uuid();
 v_allow boolean:=false;
BEGIN
 IF session_user<>'zhirox_v95_gate'
 OR current_database()<>'zhirox_v80_disposable'
 THEN RAISE EXCEPTION 'isolated V96 SQL gate login required' USING ERRCODE='P9601'; END IF;
 IF p_store IS DISTINCT FROM '88000000-0000-4000-8000-000000000080'::uuid
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR NOT EXISTS(SELECT 1 FROM zhirox_local.stores
   WHERE id=p_store AND name='مارکێتی تاقیکردنەوە')
 THEN RAISE EXCEPTION 'other store forbidden in V96' USING ERRCODE='P9601'; END IF;
 IF p_actor IS NULL OR p_request IS NULL OR p_lines IS NULL
 OR jsonb_typeof(p_proof) IS DISTINCT FROM 'object'
 OR (SELECT count(*) FROM jsonb_object_keys(COALESCE(p_proof,'{}'::jsonb)) k
   WHERE k NOT IN('nonce','exp','mac'))>0
 OR jsonb_typeof(p_proof->'nonce') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_proof->'mac') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_proof->'exp') IS DISTINCT FROM 'number'
 THEN
  v_reason:='malformed_proof';
 ELSE
  v_nonce:=p_proof->>'nonce';
  v_sig:=p_proof->>'mac';
  IF v_nonce !~ '^[0-9a-f]{32}$'
   OR v_sig !~ '^[0-9a-f]{64}$'
   OR COALESCE(p_proof->>'exp','') !~ '^[0-9]{10}$'
  THEN v_reason:='malformed_proof';
  ELSE
   v_exp:=(p_proof->>'exp')::bigint;
   v_epoch:=floor(extract(epoch FROM clock_timestamp()))::bigint;
   IF v_exp<=v_epoch OR v_exp>v_epoch+90 THEN
    v_reason:='expired_or_long_lived_proof';
   ELSE
    SELECT secret_key INTO v_key FROM zhirox_local.v96_proof_keys WHERE store_id=p_store;
    IF v_key IS NULL THEN v_reason:='proof_key_unavailable';
    ELSE
     v_message:=p_store::text||'|'||p_actor::text||'|'||p_request::text||
       '|'||p_lines::text||'|'||v_exp::text||'|'||v_nonce;
     v_expected:=encode(public.hmac(convert_to(v_message,'UTF8'),v_key,'sha256'),'hex');
     IF v_sig<>v_expected THEN v_reason:='invalid_signature'; END IF;
    END IF;
   END IF;
  END IF;
 END IF;

 IF v_reason='proof_valid' THEN
  INSERT INTO zhirox_local.v96_used_nonces(store_id,nonce,request_id,actor_id)
  VALUES(p_store,v_nonce,p_request,p_actor)
  ON CONFLICT(store_id,nonce) DO NOTHING;
  GET DIAGNOSTICS v_used=ROW_COUNT;
  IF v_used<>1 THEN
   v_reason:='replayed_proof';
  ELSE
   -- The owner-owned V95 routine checks active/locked actor and FEFO LOT
   -- counts; it creates ONLY a nonfinancial checkout-intent audit row.
   SELECT x.allowed,x.reason INTO v_pre
    FROM zhirox_local.preflight_checkout_v95(p_store,p_actor,p_request,p_lines) x;
   IF v_pre.allowed THEN v_allow:=true;v_reason:='allowed';
   ELSE v_reason:=v_pre.reason; END IF;
  END IF;
 END IF;
 INSERT INTO zhirox_local.v96_proof_audit
  (audit_id,store_id,actor_claim,request_id,allowed,reason)
 VALUES(v_audit,p_store,p_actor,p_request,v_allow,v_reason);
 RETURN QUERY SELECT v_allow,v_reason,v_audit;
END $fn$;

REVOKE ALL ON zhirox_local.v96_proof_keys,
 zhirox_local.v96_used_nonces,zhirox_local.v96_proof_audit FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zhirox_local.preflight_checkout_v95(uuid,uuid,uuid,jsonb)
 FROM zhirox_v95_gate;
REVOKE ALL ON FUNCTION zhirox_local.preflight_checkout_bound_v96(uuid,uuid,uuid,jsonb,jsonb)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zhirox_local.preflight_checkout_bound_v96(uuid,uuid,uuid,jsonb,jsonb)
 TO zhirox_v95_gate;
COMMENT ON FUNCTION zhirox_local.preflight_checkout_bound_v96(uuid,uuid,uuid,jsonb,jsonb) IS
 'Disposable V96 only: verifies HMAC of exact test actor/request/JSONB cart and one-use nonce. No sale, stock mutation or payout.';
COMMIT;
