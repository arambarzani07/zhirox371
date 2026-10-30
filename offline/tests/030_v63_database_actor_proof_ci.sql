-- V63: disposable PostgreSQL 16 ONLY, after V60-V62 CI role migrations.
-- Independent database-issued opaque per-cashier proof for sensitive V31/V37 API.
-- Legacy scrypt hashes cannot be transformed into DB bcrypt verifiers.
-- This CI test intentionally enrolls NEW synthetic verifier credentials only;
-- a real deployment requires user-authorized secure re-enrollment.
\set ON_ERROR_STOP on
BEGIN;
DO $v63$
BEGIN
 IF current_database()<>'zhirox_v59_ci_test' OR current_user<>'localtest'
    OR (SELECT count(*) FROM zhirox_local.stores)<>0
    OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='zhirox_v62_intent_executor')
    OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='zhirox_v62_shift_executor')
 THEN RAISE EXCEPTION 'V63 refuses non-disposable or populated database'; END IF;
END $v63$;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA zhirox_local;

CREATE TABLE zhirox_local.actor_credentials_v63(
 store_id uuid NOT NULL, cashier_id uuid NOT NULL,
 verifier text NOT NULL,
 PRIMARY KEY(store_id,cashier_id),
 FOREIGN KEY(store_id,cashier_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE TABLE zhirox_local.actor_proofs_v63(
 proof_hash bytea PRIMARY KEY,
 store_id uuid NOT NULL,
 cashier_id uuid NOT NULL,
 session_version integer NOT NULL,
 expires_at timestamptz NOT NULL,
 FOREIGN KEY(store_id,cashier_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX v63_proof_expiry ON zhirox_local.actor_proofs_v63(expires_at);
REVOKE ALL ON zhirox_local.actor_credentials_v63,zhirox_local.actor_proofs_v63 FROM PUBLIC;
REVOKE ALL ON zhirox_local.actor_credentials_v63,zhirox_local.actor_proofs_v63 FROM zhirox_v60_api_ci;

CREATE ROLE zhirox_v63_proof_issuer NOLOGIN
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
CREATE ROLE zhirox_v63_proof_gate NOLOGIN
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
GRANT USAGE,CREATE ON SCHEMA zhirox_local TO zhirox_v63_proof_issuer,zhirox_v63_proof_gate;
GRANT SELECT ON zhirox_local.local_users,zhirox_local.actor_credentials_v63
 TO zhirox_v63_proof_issuer;
GRANT INSERT ON zhirox_local.actor_proofs_v63 TO zhirox_v63_proof_issuer;
GRANT SELECT ON zhirox_local.actor_proofs_v63,zhirox_local.local_users
 TO zhirox_v63_proof_gate;

CREATE FUNCTION zhirox_local.issue_actor_proof_v63(
 p_store uuid,p_username text,p_password text
) RETURNS TABLE(cashier_id uuid,proof text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $issue$
DECLARE u record; proof_raw text;
BEGIN
 IF p_store IS NULL OR p_username IS NULL OR length(p_username) NOT BETWEEN 3 AND 100
    OR p_password IS NULL OR length(p_password) NOT BETWEEN 12 AND 1024
 THEN RETURN; END IF;
 SELECT a.id,a.session_version,c.verifier INTO u
 FROM zhirox_local.local_users a JOIN zhirox_local.actor_credentials_v63 c
  ON c.store_id=a.store_id AND c.cashier_id=a.id
 WHERE a.store_id=p_store AND a.username=p_username AND a.enabled
  AND a.role IN('owner','manager','cashier')
  AND (a.locked_until IS NULL OR a.locked_until<clock_timestamp());
 IF NOT FOUND OR zhirox_local.crypt(p_password,u.verifier) IS DISTINCT FROM u.verifier
 THEN RETURN; END IF;
 proof_raw:=encode(zhirox_local.gen_random_bytes(32),'hex');
 INSERT INTO zhirox_local.actor_proofs_v63
 (proof_hash,store_id,cashier_id,session_version,expires_at)
 VALUES(zhirox_local.digest(proof_raw,'sha256'),p_store,u.id,u.session_version,
        clock_timestamp()+interval '15 minutes');
 RETURN QUERY SELECT u.id,proof_raw;
END $issue$;

CREATE FUNCTION zhirox_local.require_actor_proof_v63(
 p_proof text,p_store uuid,p_cashier uuid
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $require$
BEGIN
 IF p_proof IS NULL OR p_proof !~ '^[a-f0-9]{64}$'
    OR p_store IS NULL OR p_cashier IS NULL OR NOT EXISTS(
     SELECT 1 FROM zhirox_local.actor_proofs_v63 p
      JOIN zhirox_local.local_users u
       ON u.store_id=p.store_id AND u.id=p.cashier_id
     WHERE p.proof_hash=zhirox_local.digest(p_proof,'sha256')
       AND p.store_id=p_store AND p.cashier_id=p_cashier
       AND p.expires_at>clock_timestamp()
       AND u.enabled AND u.session_version=p.session_version
       AND u.role IN('owner','manager','cashier')
       AND (u.locked_until IS NULL OR u.locked_until<clock_timestamp())
    )
 THEN RAISE EXCEPTION 'actor proof rejected' USING ERRCODE='P6301'; END IF;
END $require$;

-- The gate only EXECUTEs V62 routines, without direct financial table DML.
GRANT EXECUTE ON FUNCTION zhirox_local.require_actor_proof_v63(text,uuid,uuid)
 TO zhirox_v63_proof_gate;
GRANT EXECUTE ON FUNCTION
 zhirox_local.prepare_checkout_v31(uuid,uuid,uuid,jsonb,bigint),
 zhirox_local.commit_checkout_v31(uuid,uuid,uuid),
 zhirox_local.cancel_checkout_v31(uuid,uuid,uuid),
 zhirox_local.open_cash_shift_v37(uuid,uuid,uuid,bigint),
 zhirox_local.close_cash_shift_v37(uuid,uuid,uuid,bigint)
TO zhirox_v63_proof_gate;

CREATE FUNCTION zhirox_local.prepare_checkout_v63(
 p_proof text,p_store uuid,p_cashier uuid,p_request uuid,p_lines jsonb,p_total bigint
) RETURNS TABLE(request_id uuid,state text,lines jsonb,expected_total_minor bigint,
 sale_id uuid,receipt_no bigint,total_minor bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $wrap$
BEGIN
 PERFORM zhirox_local.require_actor_proof_v63(p_proof,p_store,p_cashier);
 RETURN QUERY SELECT * FROM zhirox_local.prepare_checkout_v31(p_store,p_cashier,p_request,p_lines,p_total);
END $wrap$;

CREATE FUNCTION zhirox_local.commit_checkout_v63(
 p_proof text,p_store uuid,p_cashier uuid,p_request uuid
) RETURNS TABLE(sale_id uuid,receipt_no bigint,total_minor bigint,replayed boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $wrap$
BEGIN
 PERFORM zhirox_local.require_actor_proof_v63(p_proof,p_store,p_cashier);
 RETURN QUERY SELECT * FROM zhirox_local.commit_checkout_v31(p_store,p_cashier,p_request);
END $wrap$;

CREATE FUNCTION zhirox_local.cancel_checkout_v63(
 p_proof text,p_store uuid,p_cashier uuid,p_request uuid
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $wrap$
BEGIN
 PERFORM zhirox_local.require_actor_proof_v63(p_proof,p_store,p_cashier);
 RETURN zhirox_local.cancel_checkout_v31(p_store,p_cashier,p_request);
END $wrap$;

CREATE FUNCTION zhirox_local.open_cash_shift_v63(
 p_proof text,p_store uuid,p_cashier uuid,p_shift uuid,p_opening bigint
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,opened_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $wrap$
BEGIN
 PERFORM zhirox_local.require_actor_proof_v63(p_proof,p_store,p_cashier);
 RETURN QUERY SELECT * FROM zhirox_local.open_cash_shift_v37(p_store,p_cashier,p_shift,p_opening);
END $wrap$;

CREATE FUNCTION zhirox_local.close_cash_shift_v63(
 p_proof text,p_store uuid,p_cashier uuid,p_shift uuid,p_counted bigint
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,cash_sales_minor bigint,
 expected_minor bigint,counted_minor bigint,variance_minor bigint,closed_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $wrap$
BEGIN
 PERFORM zhirox_local.require_actor_proof_v63(p_proof,p_store,p_cashier);
 RETURN QUERY SELECT * FROM zhirox_local.close_cash_shift_v37(p_store,p_cashier,p_shift,p_counted);
END $wrap$;

ALTER FUNCTION zhirox_local.issue_actor_proof_v63(uuid,text,text)
 OWNER TO zhirox_v63_proof_issuer;
ALTER FUNCTION zhirox_local.require_actor_proof_v63(text,uuid,uuid)
 OWNER TO zhirox_v63_proof_gate;
ALTER FUNCTION zhirox_local.prepare_checkout_v63(text,uuid,uuid,uuid,jsonb,bigint)
 OWNER TO zhirox_v63_proof_gate;
ALTER FUNCTION zhirox_local.commit_checkout_v63(text,uuid,uuid,uuid)
 OWNER TO zhirox_v63_proof_gate;
ALTER FUNCTION zhirox_local.cancel_checkout_v63(text,uuid,uuid,uuid)
 OWNER TO zhirox_v63_proof_gate;
ALTER FUNCTION zhirox_local.open_cash_shift_v63(text,uuid,uuid,uuid,bigint)
 OWNER TO zhirox_v63_proof_gate;
ALTER FUNCTION zhirox_local.close_cash_shift_v63(text,uuid,uuid,uuid,bigint)
 OWNER TO zhirox_v63_proof_gate;
REVOKE CREATE ON SCHEMA zhirox_local FROM zhirox_v63_proof_issuer,zhirox_v63_proof_gate;

-- No direct caller access to issuer's hidden tables, proof verification,
-- original unguarded V31/V37 routines or even the V63 issuer owner role.
REVOKE ALL ON FUNCTION zhirox_local.issue_actor_proof_v63(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.require_actor_proof_v63(text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.prepare_checkout_v63(text,uuid,uuid,uuid,jsonb,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.commit_checkout_v63(text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.cancel_checkout_v63(text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.open_cash_shift_v63(text,uuid,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.close_cash_shift_v63(text,uuid,uuid,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 zhirox_local.issue_actor_proof_v63(uuid,text,text),
 zhirox_local.prepare_checkout_v63(text,uuid,uuid,uuid,jsonb,bigint),
 zhirox_local.commit_checkout_v63(text,uuid,uuid,uuid),
 zhirox_local.cancel_checkout_v63(text,uuid,uuid,uuid),
 zhirox_local.open_cash_shift_v63(text,uuid,uuid,uuid,bigint),
 zhirox_local.close_cash_shift_v63(text,uuid,uuid,uuid,bigint)
TO zhirox_v60_api_ci;
REVOKE EXECUTE ON FUNCTION
 zhirox_local.prepare_checkout_v31(uuid,uuid,uuid,jsonb,bigint),
 zhirox_local.commit_checkout_v31(uuid,uuid,uuid),
 zhirox_local.cancel_checkout_v31(uuid,uuid,uuid),
 zhirox_local.open_cash_shift_v37(uuid,uuid,uuid,bigint),
 zhirox_local.close_cash_shift_v37(uuid,uuid,uuid,bigint)
FROM zhirox_v60_api_ci;
COMMIT;
