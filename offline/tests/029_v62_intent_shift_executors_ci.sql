-- V62: ISOLATED CI ONLY. Split intent + shift writes from network-facing cashier.
-- Applies after V60 and V61 on EMPTY disposable PostgreSQL v59 test DB.
-- No real store, financial writes, production migration, or cloud access.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'zhirox_v59_ci_test'
    OR current_user<>'localtest'
    OR (SELECT count(*) FROM zhirox_local.stores)<>0
    OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='zhirox_v60_api_ci')
    OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='zhirox_v61_checkout_executor')
 THEN RAISE EXCEPTION 'V62 refuses non-disposable or unprepared DB'; END IF;
END $guard$;

-- This account cannot log in or write to an unrelated table.
CREATE ROLE zhirox_v62_intent_executor NOLOGIN
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
GRANT USAGE, CREATE ON SCHEMA zhirox_local TO zhirox_v62_intent_executor;
GRANT SELECT ON
 zhirox_local.stores,
 zhirox_local.checkout_intents_v31,
 zhirox_local.sales,
 zhirox_local.cash_shifts_v37,
 zhirox_local.external_settlements_v42
TO zhirox_v62_intent_executor;
GRANT UPDATE ON
 zhirox_local.stores,
 zhirox_local.checkout_intents_v31,
 zhirox_local.cash_shifts_v37
TO zhirox_v62_intent_executor;
GRANT INSERT ON zhirox_local.checkout_intents_v31
TO zhirox_v62_intent_executor;

-- V43 commit invokes the narrowly scoped V60 reservation executor and
-- V61 cash-ledger executor. Only the intent executor can call V26 directly.
GRANT EXECUTE ON FUNCTION
 zhirox_local.consume_reservation_v43(uuid,uuid,uuid),
 zhirox_local.checkout_packs_scale_v26(uuid,uuid,uuid,jsonb,bigint)
TO zhirox_v62_intent_executor;

ALTER FUNCTION zhirox_local.prepare_checkout_v31(uuid,uuid,uuid,jsonb,bigint)
 OWNER TO zhirox_v62_intent_executor;
ALTER FUNCTION zhirox_local.commit_checkout_v31(uuid,uuid,uuid)
 OWNER TO zhirox_v62_intent_executor;
ALTER FUNCTION zhirox_local.cancel_checkout_v31(uuid,uuid,uuid)
 OWNER TO zhirox_v62_intent_executor;
ALTER FUNCTION zhirox_local.prepare_checkout_v31(uuid,uuid,uuid,jsonb,bigint)
 SECURITY DEFINER;
ALTER FUNCTION zhirox_local.commit_checkout_v31(uuid,uuid,uuid)
 SECURITY DEFINER;
ALTER FUNCTION zhirox_local.cancel_checkout_v31(uuid,uuid,uuid)
 SECURITY DEFINER;
REVOKE CREATE ON SCHEMA zhirox_local FROM zhirox_v62_intent_executor;

-- Open/close shifts have different privileges than prepare/commit.
CREATE ROLE zhirox_v62_shift_executor NOLOGIN
 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
GRANT USAGE, CREATE ON SCHEMA zhirox_local TO zhirox_v62_shift_executor;
GRANT SELECT ON
 zhirox_local.stores,
 zhirox_local.local_users,
 zhirox_local.cash_shifts_v37,
 zhirox_local.checkout_intents_v31,
 zhirox_local.sales,
 zhirox_local.cash_movements_v38,
 zhirox_local.cash_refunds_v39,
 zhirox_local.partial_cash_refunds_v40,
 zhirox_local.external_settlements_v42
TO zhirox_v62_shift_executor;
GRANT UPDATE ON
 zhirox_local.stores,
 zhirox_local.cash_shifts_v37
TO zhirox_v62_shift_executor;
GRANT INSERT ON zhirox_local.cash_shifts_v37
TO zhirox_v62_shift_executor;
GRANT EXECUTE ON FUNCTION zhirox_local.cash_summary_v38(uuid,uuid,uuid)
TO zhirox_v62_shift_executor;

ALTER FUNCTION zhirox_local.open_cash_shift_v37(uuid,uuid,uuid,bigint)
 OWNER TO zhirox_v62_shift_executor;
ALTER FUNCTION zhirox_local.close_cash_shift_v37(uuid,uuid,uuid,bigint)
 OWNER TO zhirox_v62_shift_executor;
ALTER FUNCTION zhirox_local.open_cash_shift_v37(uuid,uuid,uuid,bigint)
 SECURITY DEFINER;
ALTER FUNCTION zhirox_local.close_cash_shift_v37(uuid,uuid,uuid,bigint)
 SECURITY DEFINER;
REVOKE CREATE ON SCHEMA zhirox_local FROM zhirox_v62_shift_executor;

-- Cashier's nonowner network service can still read scoped intent and shift
-- state, but cannot issue any direct INSERT/UPDATE to bypass SQL invariants.
REVOKE INSERT, UPDATE ON
 zhirox_local.checkout_intents_v31,
 zhirox_local.cash_shifts_v37
FROM zhirox_v60_api_ci;
REVOKE EXECUTE ON FUNCTION
 zhirox_local.checkout_packs_scale_v26(uuid,uuid,uuid,jsonb,bigint),
 zhirox_local.consume_reservation_v43(uuid,uuid,uuid)
FROM zhirox_v60_api_ci;

-- All five public APIs were already REVOKEd FROM PUBLIC in V31/V37.
-- The execution roles are NOLOGIN; no direct bank, Cloud or WAN calls.
COMMIT;
