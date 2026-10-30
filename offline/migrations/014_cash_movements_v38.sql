-- V38 LOCAL CASH MOVEMENTS — DISPOSABLE PostgreSQL LAB ONLY.
-- Apply AFTER V37. Do NOT run on real Kani Chnar/legacy SQL Server/Supabase.
-- No cash-out without funds. No silent rewrite/delete. Server derives totals.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.cash_movements_v38(
 store_id uuid NOT NULL,
 shift_id uuid NOT NULL,
 entry_id uuid NOT NULL,
 cashier_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('cash_in','cash_out','expense')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9999999999999),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 240),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,entry_id),
 FOREIGN KEY(store_id,shift_id) REFERENCES zhirox_local.cash_shifts_v37(store_id,shift_id)
);
CREATE INDEX IF NOT EXISTS v38_shift_movements
 ON zhirox_local.cash_movements_v38(store_id,shift_id,created_at,entry_id);

CREATE OR REPLACE FUNCTION zhirox_local.guard_cash_movement_v38()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $v38$
DECLARE v_shift zhirox_local.cash_shifts_v37%ROWTYPE; v_available numeric;
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'cash ledger is append-only' USING ERRCODE='P3804';
 END IF;
 -- Lock order aligns with sale/shift-close/adjustment transactions.
 PERFORM 1 FROM zhirox_local.stores WHERE id=NEW.store_id FOR UPDATE;
 SELECT q.* INTO v_shift FROM zhirox_local.cash_shifts_v37 q
 WHERE q.store_id=NEW.store_id AND q.shift_id=NEW.shift_id FOR UPDATE;
 IF NOT FOUND OR v_shift.state<>'open' OR v_shift.cashier_id<>NEW.cashier_id THEN
  RAISE EXCEPTION 'active matching shift required' USING ERRCODE='P3801';
 END IF;
 SELECT v_shift.opening_minor::numeric
    +COALESCE((SELECT SUM(s.total_minor)::numeric FROM zhirox_local.sales s
      WHERE s.store_id=NEW.store_id AND s.shift_id_v37=NEW.shift_id
        AND s.cashier_id=NEW.cashier_id),0)
    +COALESCE((SELECT SUM(CASE WHEN m.kind='cash_in' THEN m.amount_minor::numeric
      ELSE -m.amount_minor::numeric END) FROM zhirox_local.cash_movements_v38 m
      WHERE m.store_id=NEW.store_id AND m.shift_id=NEW.shift_id),0)
 INTO v_available;
 IF NEW.kind IN('cash_out','expense') AND NEW.amount_minor>v_available THEN
  RAISE EXCEPTION 'insufficient available shift cash' USING ERRCODE='P3802';
 END IF;
 IF NEW.kind='cash_in' AND v_available+NEW.amount_minor>9999999999999 THEN
  RAISE EXCEPTION 'cash balance overflow' USING ERRCODE='22003';
 END IF;
 RETURN NEW;
END $v38$;
DROP TRIGGER IF EXISTS v38_guard_cash_movement ON zhirox_local.cash_movements_v38;
CREATE TRIGGER v38_guard_cash_movement
 BEFORE INSERT OR UPDATE OR DELETE ON zhirox_local.cash_movements_v38
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.guard_cash_movement_v38();

CREATE OR REPLACE FUNCTION zhirox_local.record_cash_movement_v38(
 p_store uuid,p_cashier uuid,p_shift uuid,p_entry uuid,
 p_kind text,p_amount bigint,p_reason text
) RETURNS TABLE(entry_id uuid,shift_id uuid,kind text,amount_minor bigint,
 reason text,created_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $v38$
DECLARE old zhirox_local.cash_movements_v38%ROWTYPE;
 v_shift zhirox_local.cash_shifts_v37%ROWTYPE;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_shift IS NULL OR p_entry IS NULL
    OR p_kind IS NULL OR p_kind NOT IN('cash_in','cash_out','expense')
    OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 9999999999999
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 240
    OR p_reason<>btrim(p_reason)
 THEN RAISE EXCEPTION 'invalid cash movement' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='P3801'; END IF;
 SELECT m.* INTO old FROM zhirox_local.cash_movements_v38 m
  WHERE m.store_id=p_store AND m.entry_id=p_entry;
 IF FOUND THEN
  IF old.shift_id<>p_shift OR old.cashier_id<>p_cashier OR old.kind<>p_kind
    OR old.amount_minor<>p_amount OR old.reason<>p_reason
  THEN RAISE EXCEPTION 'movement UUID reused with different details'
    USING ERRCODE='P3803'; END IF;
 ELSE
  SELECT q.* INTO v_shift FROM zhirox_local.cash_shifts_v37 q
   WHERE q.store_id=p_store AND q.shift_id=p_shift AND q.cashier_id=p_cashier
     AND q.state='open' FOR UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'active cashier shift required' USING ERRCODE='P3801'; END IF;
  INSERT INTO zhirox_local.cash_movements_v38
   (store_id,shift_id,entry_id,cashier_id,kind,amount_minor,reason)
   VALUES(p_store,p_shift,p_entry,p_cashier,p_kind,p_amount,p_reason);
 END IF;
 RETURN QUERY SELECT m.entry_id,m.shift_id,m.kind,m.amount_minor,m.reason,m.created_at
  FROM zhirox_local.cash_movements_v38 m
  WHERE m.store_id=p_store AND m.entry_id=p_entry AND m.cashier_id=p_cashier;
END $v38$;

CREATE OR REPLACE FUNCTION zhirox_local.cash_summary_v38(
 p_store uuid,p_cashier uuid,p_shift uuid
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,
 cash_sales_minor bigint,cash_in_minor bigint,cash_out_minor bigint,
 expense_minor bigint,expected_minor bigint,counted_minor bigint,
 variance_minor bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $v38$
DECLARE v_shift zhirox_local.cash_shifts_v37%ROWTYPE;
 v_sales numeric;v_in numeric;v_out numeric;v_expense numeric;v_total numeric;
BEGIN
 SELECT q.* INTO v_shift FROM zhirox_local.cash_shifts_v37 q
 WHERE q.store_id=p_store AND q.cashier_id=p_cashier AND q.shift_id=p_shift;
 IF NOT FOUND THEN RAISE EXCEPTION 'shift not found' USING ERRCODE='P3801'; END IF;
 SELECT COALESCE(SUM(s.total_minor),0) INTO v_sales FROM zhirox_local.sales s
 WHERE s.store_id=p_store AND s.cashier_id=p_cashier AND s.shift_id_v37=p_shift;
 SELECT COALESCE(SUM(m.amount_minor) FILTER(WHERE m.kind='cash_in'),0),
        COALESCE(SUM(m.amount_minor) FILTER(WHERE m.kind='cash_out'),0),
        COALESCE(SUM(m.amount_minor) FILTER(WHERE m.kind='expense'),0)
 INTO v_in,v_out,v_expense FROM zhirox_local.cash_movements_v38 m
 WHERE m.store_id=p_store AND m.cashier_id=p_cashier AND m.shift_id=p_shift;
 v_total:=v_shift.opening_minor::numeric+v_sales+v_in-v_out-v_expense;
 IF v_total<0 OR v_total>9999999999999 OR v_sales>9999999999999
  OR v_in>9999999999999 OR v_out>9999999999999 OR v_expense>9999999999999
 THEN RAISE EXCEPTION 'cash total outside bounds' USING ERRCODE='22003'; END IF;
 RETURN QUERY SELECT v_shift.shift_id,v_shift.state,v_shift.opening_minor,
 v_sales::bigint,v_in::bigint,v_out::bigint,v_expense::bigint,v_total::bigint,
 v_shift.counted_minor,v_shift.variance_minor;
END $v38$;

-- Covers direct and legacy V37 close attempts too. A stale/no-adjustment
-- close can't silently miscount nonzero movement amounts.
CREATE OR REPLACE FUNCTION zhirox_local.verify_cash_close_v38()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $v38$
DECLARE summary record;
BEGIN
 IF TG_OP='UPDATE' AND OLD.state='open' AND NEW.state='closed' THEN
  SELECT * INTO STRICT summary FROM zhirox_local.cash_summary_v38(
    NEW.store_id,NEW.cashier_id,NEW.shift_id);
  IF NEW.cash_sales_minor<>summary.cash_sales_minor OR
     NEW.expected_minor<>summary.expected_minor OR
     NEW.variance_minor<>NEW.counted_minor-NEW.expected_minor
  THEN RAISE EXCEPTION 'shift cash reconciliation mismatch'
       USING ERRCODE='P3805'; END IF;
 END IF;
 RETURN NEW;
END $v38$;
DROP TRIGGER IF EXISTS v38_verify_cash_close ON zhirox_local.cash_shifts_v37;
CREATE TRIGGER v38_verify_cash_close BEFORE UPDATE ON zhirox_local.cash_shifts_v37
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.verify_cash_close_v38();

CREATE OR REPLACE FUNCTION zhirox_local.close_cash_shift_v38(
 p_store uuid,p_cashier uuid,p_shift uuid,p_counted bigint
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,
 cash_sales_minor bigint,cash_in_minor bigint,cash_out_minor bigint,
 expense_minor bigint,expected_minor bigint,counted_minor bigint,
 variance_minor bigint,closed_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $v38$
DECLARE old zhirox_local.cash_shifts_v37%ROWTYPE; total record;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_shift IS NULL OR p_counted IS NULL
    OR p_counted NOT BETWEEN 0 AND 9999999999999
 THEN RAISE EXCEPTION 'invalid close request' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='P3801'; END IF;
 SELECT q.* INTO old FROM zhirox_local.cash_shifts_v37 q
 WHERE q.store_id=p_store AND q.cashier_id=p_cashier AND q.shift_id=p_shift
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown shift' USING ERRCODE='P3801'; END IF;
 IF old.state='closed' THEN
  IF old.counted_minor<>p_counted THEN
    RAISE EXCEPTION 'closed count immutable' USING ERRCODE='P3803'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM zhirox_local.checkout_intents_v31 i WHERE
   i.store_id=p_store AND i.cashier_id=p_cashier AND i.state='prepared')
  THEN RAISE EXCEPTION 'checkout not resolved' USING ERRCODE='P3703'; END IF;
  SELECT * INTO STRICT total FROM zhirox_local.cash_summary_v38(p_store,p_cashier,p_shift);
  UPDATE zhirox_local.cash_shifts_v37 q SET state='closed',
    cash_sales_minor=total.cash_sales_minor,
    expected_minor=total.expected_minor,counted_minor=p_counted,
    variance_minor=p_counted-total.expected_minor,closed_at=clock_timestamp()
  WHERE q.store_id=p_store AND q.shift_id=p_shift AND q.cashier_id=p_cashier;
 END IF;
 RETURN QUERY SELECT q.shift_id,q.state,q.opening_minor,t.cash_sales_minor,
   t.cash_in_minor,t.cash_out_minor,t.expense_minor,q.expected_minor,
   q.counted_minor,q.variance_minor,q.closed_at
 FROM zhirox_local.cash_shifts_v37 q
 CROSS JOIN LATERAL zhirox_local.cash_summary_v38(p_store,p_cashier,p_shift) t
 WHERE q.store_id=p_store AND q.shift_id=p_shift AND q.cashier_id=p_cashier;
END $v38$;
REVOKE ALL ON zhirox_local.cash_movements_v38 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.guard_cash_movement_v38() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.record_cash_movement_v38(uuid,uuid,uuid,uuid,text,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.cash_summary_v38(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.verify_cash_close_v38() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.close_cash_shift_v38(uuid,uuid,uuid,bigint) FROM PUBLIC;
COMMIT;
