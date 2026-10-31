-- V94: isolated disposable PostgreSQL CI test only.
-- Auth may read test-store identity and local account verifier fields, update ONLY
-- failure counters/lockout; no product/sale/stock permissions or finance functions.
-- Must run after V93 real PostgreSQL API test, never on production.
BEGIN;
DO $v94$
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
   WHERE rolname='zhirox_v93_api_reader' AND NOT rolcanlogin)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='zhirox_v94_auth')
 THEN RAISE EXCEPTION 'V94 auth role only for fresh isolated test market'
  USING ERRCODE='P9401'; END IF;
END $v94$;
CREATE ROLE zhirox_v94_auth
 NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA zhirox_local TO zhirox_v94_auth;
GRANT SELECT (id,name) ON TABLE zhirox_local.stores TO zhirox_v94_auth;
-- Password verifiers are accessible ONLY to the isolated auth service role.
-- It must NOT be exposed as a public/general-purpose reader.
GRANT SELECT (store_id,id,username,password_hash,role,enabled,
 session_version,failed_attempts,locked_until)
 ON TABLE zhirox_local.local_users TO zhirox_v94_auth;
GRANT UPDATE (failed_attempts,locked_until)
 ON TABLE zhirox_local.local_users TO zhirox_v94_auth;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zhirox_local FROM zhirox_v94_auth;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zhirox_local FROM zhirox_v94_auth;
-- No product/stock/sales/outbox/return/debt table privileges are granted.
COMMENT ON ROLE zhirox_v94_auth IS
 'Disposable CI authentication only: stores(id,name), account verifier SELECT, failed_attempts/locked_until UPDATE. Not financial actor authorization.';
COMMIT;
