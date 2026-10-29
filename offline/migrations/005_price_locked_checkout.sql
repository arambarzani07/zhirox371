-- V25 ISOLATED LOCAL POSTGRESQL ONLY. NEVER deploy to production Supabase.
-- Price-locked atomic cash checkout: if any server price changed after the
-- cashier scanned the items, the whole transaction (sale, stock, counter,
-- ledger, outbox) is rolled back. The V1 idempotency key stays intact.
BEGIN;
CREATE OR REPLACE FUNCTION zhirox_local.checkout_cash_v25(
 p_store uuid, p_cashier uuid, p_request uuid, p_lines jsonb,
 p_expected_total_minor bigint
) RETURNS TABLE(sale_id uuid, receipt_no bigint, total_minor bigint, replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, zhirox_local
AS $$
DECLARE v_sale uuid; v_no bigint; v_total bigint; v_replay boolean;
BEGIN
 IF p_expected_total_minor IS NULL OR p_expected_total_minor < 0
    OR p_expected_total_minor > 9999999999999 THEN
   RAISE EXCEPTION 'invalid expected total' USING ERRCODE='22023';
 END IF;
 SELECT x.sale_id,x.receipt_no,x.total_minor,x.replayed
 INTO STRICT v_sale,v_no,v_total,v_replay
 FROM zhirox_local.checkout_cash_v1(p_store,p_cashier,p_request,p_lines) x;
 IF v_total IS DISTINCT FROM p_expected_total_minor THEN
   -- This exception rolls back EVERYTHING checkout_cash_v1 just wrote,
   -- including deducted stock, receipt counters and the outbox event.
   RAISE EXCEPTION 'expected total disagrees with authoritative server prices'
      USING ERRCODE='P2501';
 END IF;
 RETURN QUERY SELECT v_sale,v_no,v_total,v_replay;
END $$;
REVOKE ALL ON FUNCTION zhirox_local.checkout_cash_v25(uuid,uuid,uuid,jsonb,bigint) FROM PUBLIC;
COMMIT;
