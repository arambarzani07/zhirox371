-- V93 disposable CI only: dedicated NOLOGIN identity for read API.
-- NO password is stored here. CI temporarily grants a random login secret.
-- Separate identity inherits ONLY fixed-store V92 security-barrier SELECT views.
-- Never apply to production and never grant cashier financial writes.
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'zhirox_v80_disposable'
 OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores WHERE id='88000000-0000-4000-8000-000000000080')
    IS DISTINCT FROM 'مارکێتی تاقیکردنەوە'
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id='88000000-0000-4000-8000-000000000080')<>7
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='zhirox_v92_viewer' AND NOT rolcanlogin AND NOT rolsuper)
 OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='zhirox_v93_api_reader')
 THEN RAISE EXCEPTION 'V93 restricted reader creation forbidden outside fresh isolated V92 test'
   USING ERRCODE='P9301';
 END IF;
END $guard$;
CREATE ROLE zhirox_v93_api_reader
 NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS;
GRANT zhirox_v92_viewer TO zhirox_v93_api_reader
 WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
-- Do not grant SELECT on base tables. V92 views remain the only data surface.
REVOKE ALL ON ALL TABLES IN SCHEMA zhirox_local FROM zhirox_v93_api_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zhirox_local FROM zhirox_v93_api_reader;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zhirox_local FROM zhirox_v93_api_reader;
COMMENT ON ROLE zhirox_v93_api_reader IS
 'Isolated V93 test-only NOLOGIN inherited read views. Credentials only in ephemeral CI. No production use.';
COMMIT;
