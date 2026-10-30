-- V60: CI-ONLY test of a separate PostgreSQL API login with no DBA privileges.
-- Must only be executed on an EMPTY, freshly migrated zhirox_v59_ci_test DB.
-- This is NOT a production RLS model. Explicit cash-only DML below remains too
-- broad for a compromised API identity; it is a hardening waypoint, NOT GO-LIVE.
\set ON_ERROR_STOP on
BEGIN;
DO $scope$
BEGIN
 IF current_database()<>'zhirox_v59_ci_test'
    OR current_user<>'localtest'
    OR (SELECT count(*) FROM zhirox_local.stores)<>0 THEN
   RAISE EXCEPTION 'V60 refuses non-disposable, populated or non-owner database';
 END IF;
END $scope$;
CREATE ROLE zhirox_v60_api_ci LOGIN
 PASSWORD 'V60-SYNTHETIC-CI-ONLY-DO-NOT-REUSE'
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
GRANT CONNECT ON DATABASE zhirox_v59_ci_test TO zhirox_v60_api_ci;
GRANT USAGE ON SCHEMA zhirox_local TO zhirox_v60_api_ci;
-- Explicit allowlist: not ALL TABLES, no blanket public-schema grants.
GRANT SELECT ON
 zhirox_local.stores,
 zhirox_local.local_users,
 zhirox_local.products,
 zhirox_local.barcodes,
 zhirox_local.sales,
 zhirox_local.sale_lines,
 zhirox_local.stock_ledger,
 zhirox_local.receipt_counters,
 zhirox_local.event_outbox,
 zhirox_local.checkout_intents_v31,
 zhirox_local.cash_shifts_v37,
 zhirox_local.cash_movements_v38,
 zhirox_local.receipt_snapshots_v34,
 zhirox_local.print_requests_v35
TO zhirox_v60_api_ci;

-- Minimal DML for the CURRENT V59 auth+cash-only invocation chain.
-- V60 deliberately does NOT allow DELETE or TRUNCATE of any table.
GRANT INSERT ON
 zhirox_local.sales,
 zhirox_local.sale_lines,
 zhirox_local.stock_ledger,
 zhirox_local.receipt_counters,
 zhirox_local.event_outbox,
 zhirox_local.checkout_intents_v31,
 zhirox_local.cash_shifts_v37,
 zhirox_local.receipt_snapshots_v34
TO zhirox_v60_api_ci;

GRANT UPDATE ON
 zhirox_local.stores,             -- SELECT FOR UPDATE in transaction functions
 zhirox_local.local_users,        -- session login lockout counters + row lock
 zhirox_local.products,           -- atomic stock decrement
 zhirox_local.receipt_counters,   -- monotonic counters
 zhirox_local.checkout_intents_v31,
 zhirox_local.cash_shifts_v37,
 zhirox_local.event_outbox
TO zhirox_v60_api_ci;

-- Later reservation triggers read held quantities and pending tender evidence
-- during a legitimate sale even when no external tender is present.
GRANT SELECT ON
 zhirox_local.inventory_reservation_sessions_v43,
 zhirox_local.inventory_reservation_items_v43,
 zhirox_local.tender_plans_v41,
 zhirox_local.external_settlements_v42
TO zhirox_v60_api_ci;

-- Reservation consumption/cancellation needs DELETE, but the HTTP API login
-- must NEVER receive DELETE. Move only these two audited, static-SQL functions
-- to a dedicated NOLOGIN executor with narrowly scoped cleanup privileges.
CREATE ROLE zhirox_v60_reservation_executor NOLOGIN
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
GRANT USAGE, CREATE ON SCHEMA zhirox_local
 TO zhirox_v60_reservation_executor;
GRANT SELECT, UPDATE ON zhirox_local.inventory_reservation_sessions_v43
 TO zhirox_v60_reservation_executor;
GRANT SELECT, DELETE ON zhirox_local.inventory_reservation_items_v43
 TO zhirox_v60_reservation_executor;
ALTER FUNCTION zhirox_local.consume_reservation_v43(uuid,uuid,uuid)
 OWNER TO zhirox_v60_reservation_executor;
ALTER FUNCTION zhirox_local.consume_reservation_v43(uuid,uuid,uuid)
 SECURITY DEFINER;
ALTER FUNCTION zhirox_local.release_cancelled_reservation_v43()
 OWNER TO zhirox_v60_reservation_executor;
ALTER FUNCTION zhirox_local.release_cancelled_reservation_v43()
 SECURITY DEFINER;
-- After ownership transfer, even the NOLOGIN role cannot create new objects.
REVOKE CREATE ON SCHEMA zhirox_local
 FROM zhirox_v60_reservation_executor;

-- Print queue: FOR UPDATE requires UPDATE permission. Do not give it to the
-- API account: a compromised service must never mark paper as 'printed'.
CREATE ROLE zhirox_v60_print_executor NOLOGIN
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
GRANT USAGE, CREATE ON SCHEMA zhirox_local
 TO zhirox_v60_print_executor;
GRANT SELECT, UPDATE ON zhirox_local.stores
 TO zhirox_v60_print_executor;
GRANT SELECT ON zhirox_local.receipt_snapshots_v34
 TO zhirox_v60_print_executor;
GRANT SELECT, INSERT, UPDATE ON zhirox_local.print_requests_v35
 TO zhirox_v60_print_executor;
ALTER FUNCTION zhirox_local.queue_print_v35(uuid,uuid,uuid,uuid,smallint)
 OWNER TO zhirox_v60_print_executor;
ALTER FUNCTION zhirox_local.queue_print_v35(uuid,uuid,uuid,uuid,smallint)
 SECURITY DEFINER;
REVOKE CREATE ON SCHEMA zhirox_local
 FROM zhirox_v60_print_executor;

GRANT EXECUTE ON FUNCTION
 zhirox_local.consume_reservation_v43(uuid,uuid,uuid)
 TO zhirox_v60_api_ci;

GRANT EXECUTE ON FUNCTION
 zhirox_local.prepare_checkout_v31(uuid,uuid,uuid,jsonb,bigint),
 zhirox_local.commit_checkout_v31(uuid,uuid,uuid),
 zhirox_local.cancel_checkout_v31(uuid,uuid,uuid),
 zhirox_local.checkout_packs_scale_v26(uuid,uuid,uuid,jsonb,bigint),
 zhirox_local.open_cash_shift_v37(uuid,uuid,uuid,bigint),
 zhirox_local.close_cash_shift_v37(uuid,uuid,uuid,bigint),
 zhirox_local.queue_print_v35(uuid,uuid,uuid,uuid,smallint)
TO zhirox_v60_api_ci;

COMMIT;
