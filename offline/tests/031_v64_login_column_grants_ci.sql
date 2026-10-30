-- V64 / Step 2 / CI ONLY: eliminate direct sensitive account/store updates
-- from the HTTPS cashier's SQL role. Never apply to a real populated store.
\set ON_ERROR_STOP on
BEGIN;
DO $v64$
BEGIN
 IF current_database()<>'zhirox_v59_ci_test'
 OR current_user<>'localtest'
 OR (SELECT count(*) FROM zhirox_local.stores)<>0
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='zhirox_v63_proof_issuer')
 THEN RAISE EXCEPTION 'V64 refuses non-disposable, populated, or unprepared DB'; END IF;
END $v64$;
-- PostgreSQL still permits SELECT ... FOR UPDATE when the invoker holds
-- UPDATE on at least one column. The V3 login may ONLY change brute-force
-- counters. It MUST NOT enable users, change their role or password, or
-- reset a revocation epoch.
REVOKE UPDATE ON zhirox_local.local_users FROM zhirox_v60_api_ci;
GRANT UPDATE (failed_attempts,locked_until)
 ON zhirox_local.local_users TO zhirox_v60_api_ci;

-- Every financial store-row FOR UPDATE happens inside the separately owned
-- V60-V63 SECURITY DEFINER routines. Network-facing DB login only reads it.
REVOKE UPDATE ON zhirox_local.stores FROM zhirox_v60_api_ci;
COMMIT;
