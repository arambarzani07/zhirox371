-- V61 step-two HARDENING: test ONLY, after V60 restricted role test schema.
-- Move sale/stock/outbox mutations out of the network-facing PostgreSQL login.
-- This is NOT a production migration, migration-runner, or all-table RLS scheme.
\set ON_ERROR_STOP on
BEGIN;
DO $v61$
BEGIN
 IF current_database()<>'zhirox_v59_ci_test' OR current_user<>'localtest'
   OR (SELECT count(*) FROM zhirox_local.stores)<>0
   OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='zhirox_v60_api_ci')
 THEN RAISE EXCEPTION 'V61 refuses real, populated or unprepared DB'; END IF;
END $v61$;

CREATE ROLE zhirox_v61_checkout_executor NOLOGIN
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;

-- Grant temporary CREATE only for PostgreSQL's function-owner transfer.
-- Revoke immediately following the transfer; runtime executor cannot DDL.
GRANT USAGE,CREATE ON SCHEMA zhirox_local
 TO zhirox_v61_checkout_executor;

-- Static SQL in the already audited V26 checkout, plus historical V37/V43
-- shift and reservation/tender validation triggers.
GRANT SELECT ON
 zhirox_local.stores,
 zhirox_local.products,
 zhirox_local.barcodes,
 zhirox_local.sales,
 zhirox_local.sale_lines,
 zhirox_local.stock_ledger,
 zhirox_local.receipt_counters,
 zhirox_local.event_outbox,
 zhirox_local.checkout_intents_v31,
 zhirox_local.cash_shifts_v37,
 zhirox_local.local_users,
 zhirox_local.tender_plans_v41,
 zhirox_local.external_settlements_v42,
 zhirox_local.inventory_reservation_sessions_v43,
 zhirox_local.inventory_reservation_items_v43,
 zhirox_local.receipt_snapshots_v34
TO zhirox_v61_checkout_executor;

GRANT INSERT ON
 zhirox_local.sales,
 zhirox_local.sale_lines,
 zhirox_local.stock_ledger,
 zhirox_local.receipt_counters,
 zhirox_local.event_outbox
TO zhirox_v61_checkout_executor;

GRANT UPDATE ON
 zhirox_local.stores,
 zhirox_local.products,
 zhirox_local.receipt_counters,
 zhirox_local.cash_shifts_v37
TO zhirox_v61_checkout_executor;

ALTER FUNCTION zhirox_local.checkout_packs_scale_v26(uuid,uuid,uuid,jsonb,bigint)
 OWNER TO zhirox_v61_checkout_executor;
ALTER FUNCTION zhirox_local.checkout_packs_scale_v26(uuid,uuid,uuid,jsonb,bigint)
 SECURITY DEFINER;
REVOKE CREATE ON SCHEMA zhirox_local
 FROM zhirox_v61_checkout_executor;

-- Receipt archive is written by a trigger on the committed checkout intent.
-- Trigger functions run as the API invoker by default, so explicitly move
-- only the immutable receipt capture to a separate constrained NOLOGIN owner.
CREATE ROLE zhirox_v61_receipt_executor NOLOGIN
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
GRANT USAGE,CREATE ON SCHEMA zhirox_local TO zhirox_v61_receipt_executor;
GRANT SELECT ON
 zhirox_local.sales,zhirox_local.sale_lines,zhirox_local.stores
 TO zhirox_v61_receipt_executor;
GRANT INSERT ON zhirox_local.receipt_snapshots_v34
 TO zhirox_v61_receipt_executor;
ALTER FUNCTION zhirox_local.capture_committed_receipt_v34()
 OWNER TO zhirox_v61_receipt_executor;
ALTER FUNCTION zhirox_local.capture_committed_receipt_v34()
 SECURITY DEFINER;
REVOKE CREATE ON SCHEMA zhirox_local FROM zhirox_v61_receipt_executor;

-- IMPORTANT: Only the network-facing runtime loses these rights.
-- The V61 NOLOGIN executor retains the exact necessary transactional writes.
REVOKE INSERT ON
 zhirox_local.sales,
 zhirox_local.sale_lines,
 zhirox_local.stock_ledger,
 zhirox_local.receipt_counters,
 zhirox_local.event_outbox,
 zhirox_local.receipt_snapshots_v34
FROM zhirox_v60_api_ci;

REVOKE UPDATE ON
 zhirox_local.products,
 zhirox_local.receipt_counters,
 zhirox_local.event_outbox
FROM zhirox_v60_api_ci;

-- The receiver/outbox worker is a separate role, not covered by this grant.
-- No ability to mutate a committed sale, stored line, immutable receipt or
-- offline event should remain on the HTTP cashier login.
COMMIT;
