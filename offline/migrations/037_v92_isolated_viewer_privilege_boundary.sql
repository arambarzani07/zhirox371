-- V92: NONPRODUCTION security barrier for the isolated PostgreSQL CI test market.
-- A dedicated NOLOGIN role is permitted to SELECT from explicit fixed-store views,
-- but not to read base tables, alter roles, invoke financial functions or write stock.
-- This does NOT expose cash checkout/refunds or authorize production deployment.
-- Prerequisites: V90 migrations AND committed V91 concurrent acceptance fixture.
BEGIN;
DO $guard$
DECLARE role_exists boolean;
BEGIN
 IF current_database()<>'zhirox_v80_disposable'
  OR current_user<>'v80test'
  OR (SELECT count(*) FROM zhirox_local.stores)<>1
  OR (SELECT name FROM zhirox_local.stores
      WHERE id='88000000-0000-4000-8000-000000000080')
      IS DISTINCT FROM 'مارکێتی تاقیکردنەوە'
  OR (SELECT count(*) FROM zhirox_local.lot_cutovers_v90
      WHERE store_id='88000000-0000-4000-8000-000000000080')<>1
  OR (SELECT count(*) FROM zhirox_local.sales
      WHERE store_id='88000000-0000-4000-8000-000000000080')<>7
 THEN RAISE EXCEPTION 'V92 restricted role MUST use the exact disposable V91 test state'
      USING ERRCODE='P9201';
 END IF;
 SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='zhirox_v92_viewer') INTO role_exists;
 IF role_exists THEN RAISE EXCEPTION 'V92 role already exists, refusing to alter a pre-existing role'
      USING ERRCODE='P9201'; END IF;
END $guard$;

CREATE ROLE zhirox_v92_viewer
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

-- Existing V81 server is still on its historical owner connection; DO NOT
-- claim that it is now authenticated through this restricted viewer role.
-- This experiment establishes *database privileges* only. No API writes.
REVOKE ALL ON SCHEMA zhirox_local FROM PUBLIC;
GRANT USAGE ON SCHEMA zhirox_local TO zhirox_v92_viewer;

-- Remove default public EXECUTE on existing & future test financial functions.
-- This database-specific default change is intentionally NOT a production migration.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zhirox_local FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE v80test REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Defense in depth: explicitly deny base data and sequences for the viewer.
REVOKE ALL ON ALL TABLES IN SCHEMA zhirox_local FROM zhirox_v92_viewer;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zhirox_local FROM zhirox_v92_viewer;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zhirox_local FROM zhirox_v92_viewer;

-- Owner-managed PostgreSQL views expose only synthetic single-store safe
-- columns. Underlying source tables remain inaccessible to the viewer.
CREATE VIEW zhirox_local.v92_stock_readonly
  WITH (security_barrier=true) AS
SELECT p.id AS product_id,p.name AS product_name,
       p.price_minor,p.stock_base_units,
       COALESCE((
         SELECT sum(l.tracked_remaining)::bigint
           FROM zhirox_local.lot_inventory_v90 l
          WHERE l.store_id=p.store_id AND l.product_id=p.id
       ),0)::bigint AS tracked_lot_units
  FROM zhirox_local.products p
 WHERE p.store_id='88000000-0000-4000-8000-000000000080'::uuid
 ORDER BY p.id;

CREATE VIEW zhirox_local.v92_lots_readonly
  WITH (security_barrier=true) AS
SELECT product_id,lot_origin,lot_code,expires_on,
       starting_qty,tracked_remaining
  FROM zhirox_local.lot_inventory_v90
 WHERE store_id='88000000-0000-4000-8000-000000000080'::uuid;

CREATE VIEW zhirox_local.v92_receipts_readonly
  WITH (security_barrier=true) AS
SELECT receipt_no,total_minor,created_at
  FROM zhirox_local.sales
 WHERE store_id='88000000-0000-4000-8000-000000000080'::uuid;

REVOKE ALL ON zhirox_local.v92_stock_readonly,
 zhirox_local.v92_lots_readonly,zhirox_local.v92_receipts_readonly FROM PUBLIC;
GRANT SELECT ON zhirox_local.v92_stock_readonly,
 zhirox_local.v92_lots_readonly,zhirox_local.v92_receipts_readonly
 TO zhirox_v92_viewer;

COMMENT ON ROLE zhirox_v92_viewer IS
 'V92 disposable PostgreSQL CI only: no permanent login, views only. Not a cashier payment or production role.';
COMMIT;
