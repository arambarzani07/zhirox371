-- V42 settlement accounting foundation. DISPOSABLE LAB DB ONLY.
-- Real provider connector not installed: NO external settlement API is exposed.
-- Synthetic direct inserts are permitted only in disposable automated tests.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.external_settlements_v42(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 request_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider ~ '^[a-z][a-z0-9_-]{2,39}$'),
 transaction_ref text NOT NULL CHECK(transaction_ref ~ '^[A-Za-z0-9._:-]{8,120}$'),
 external_method text NOT NULL CHECK(external_method IN('card','bank_transfer')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9999999999999),
 currency text NOT NULL DEFAULT 'IQD' CHECK(currency='IQD'),
 captured_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,request_id),
 UNIQUE(provider,transaction_ref),
 FOREIGN KEY(store_id,request_id)
  REFERENCES zhirox_local.tender_plans_v41(store_id,request_id)
);
-- No app/browser API is permitted to write settlement evidence.
-- A future provider-specific verifier must have a separate restricted DB role
-- and must validate signed provider status, amount, merchant and replay.
REVOKE ALL ON zhirox_local.external_settlements_v42 FROM PUBLIC;

CREATE OR REPLACE FUNCTION zhirox_local.guard_settlement_v42()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $v42$
DECLARE plan zhirox_local.tender_plans_v41%ROWTYPE;
 intent zhirox_local.checkout_intents_v31%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'external receipt is immutable'
  USING ERRCODE='P4204'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=NEW.store_id FOR UPDATE;
 SELECT x.* INTO plan FROM zhirox_local.tender_plans_v41 x
 WHERE x.store_id=NEW.store_id AND x.request_id=NEW.request_id;
 SELECT i.* INTO intent FROM zhirox_local.checkout_intents_v31 i
 WHERE i.store_id=NEW.store_id AND i.request_id=NEW.request_id FOR UPDATE;
 IF NOT FOUND OR intent.state<>'prepared' OR
  plan.external_minor IS NULL OR plan.external_minor<=0 OR
  plan.external_minor<>NEW.amount_minor OR
  plan.external_method<>NEW.external_method OR
  plan.cash_minor+NEW.amount_minor<>intent.expected_total_minor
 THEN RAISE EXCEPTION 'external proof differs from prepared allocation'
  USING ERRCODE='P4202'; END IF;
 IF NEW.captured_at>clock_timestamp()+interval '5 minutes' OR
   NEW.captured_at<intent.created_at-interval '5 minutes'
 THEN RAISE EXCEPTION 'external timestamp invalid'
  USING ERRCODE='P4202'; END IF;
 RETURN NEW;
END $v42$;
DROP TRIGGER IF EXISTS v42_guard_external_receipt
 ON zhirox_local.external_settlements_v42;
CREATE TRIGGER v42_guard_external_receipt BEFORE INSERT OR UPDATE OR DELETE
 ON zhirox_local.external_settlements_v42 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.guard_settlement_v42();

-- Override the V41 direct-sale guard: exact distinct immutable provider proof
-- is mandatory for noncash; no provider proof ==> NO SALE.
CREATE OR REPLACE FUNCTION zhirox_local.block_unverified_tender_v41()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $v42$
DECLARE plan zhirox_local.tender_plans_v41%ROWTYPE;
 proof zhirox_local.external_settlements_v42%ROWTYPE;
BEGIN
 SELECT p.* INTO plan FROM zhirox_local.tender_plans_v41 p
 WHERE p.store_id=NEW.store_id AND p.request_id=NEW.request_id;
 IF FOUND THEN
  IF plan.cashier_id<>NEW.cashier_id OR
    plan.cash_minor+plan.external_minor<>NEW.total_minor
  THEN RAISE EXCEPTION 'tender does not equal receipt'
    USING ERRCODE='P4101'; END IF;
  IF plan.external_minor>0 THEN
   SELECT s.* INTO proof FROM zhirox_local.external_settlements_v42 s
    WHERE s.store_id=NEW.store_id AND s.request_id=NEW.request_id;
   IF NOT FOUND OR proof.amount_minor<>plan.external_minor OR
     proof.external_method<>plan.external_method
   THEN RAISE EXCEPTION 'provider receipt absent: refuse mixed sale'
    USING ERRCODE='P4101'; END IF;
  ELSIF plan.cash_minor<>NEW.total_minor OR plan.external_method<>'none'
  THEN RAISE EXCEPTION 'cash-only tender mismatch'
    USING ERRCODE='P4101'; END IF;
 END IF;
 RETURN NEW;
END $v42$;

-- Cash drawer uses ONLY CASH PART of a successfully committed sale.
-- Existing older pure-cash sales have no external settlement, therefore
-- retain full amount as cash. V38/V39/V40 cash refunds remain subtracted.
CREATE OR REPLACE FUNCTION zhirox_local.cash_summary_v38(
 p_store uuid,p_cashier uuid,p_shift uuid
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,
 cash_sales_minor bigint,cash_in_minor bigint,cash_out_minor bigint,
 expense_minor bigint,expected_minor bigint,counted_minor bigint,
 variance_minor bigint)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v42$
DECLARE v_shift zhirox_local.cash_shifts_v37%ROWTYPE;
 v_sales numeric;v_in numeric;v_out numeric;v_expense numeric;
 v_full numeric;v_partial numeric;v_total numeric;
BEGIN
 SELECT q.* INTO v_shift FROM zhirox_local.cash_shifts_v37 q
 WHERE q.store_id=p_store AND q.cashier_id=p_cashier AND q.shift_id=p_shift;
 IF NOT FOUND THEN RAISE EXCEPTION 'shift not found' USING ERRCODE='P3801'; END IF;
 SELECT COALESCE(SUM(s.total_minor::numeric-COALESCE(e.amount_minor,0)),0)
 INTO v_sales FROM zhirox_local.sales s
 LEFT JOIN zhirox_local.external_settlements_v42 e
 ON e.store_id=s.store_id AND e.request_id=s.request_id
 WHERE s.store_id=p_store AND s.cashier_id=p_cashier AND s.shift_id_v37=p_shift;
 SELECT COALESCE(SUM(m.amount_minor) FILTER(WHERE m.kind='cash_in'),0),
 COALESCE(SUM(m.amount_minor) FILTER(WHERE m.kind='cash_out'),0),
 COALESCE(SUM(m.amount_minor) FILTER(WHERE m.kind='expense'),0)
 INTO v_in,v_out,v_expense FROM zhirox_local.cash_movements_v38 m
 WHERE m.store_id=p_store AND m.cashier_id=p_cashier AND m.shift_id=p_shift;
 SELECT COALESCE(SUM(r.refund_minor),0) INTO v_full FROM zhirox_local.cash_refunds_v39 r
 WHERE r.store_id=p_store AND r.cashier_id=p_cashier AND r.shift_id=p_shift;
 SELECT COALESCE(SUM(r.refund_minor),0) INTO v_partial FROM zhirox_local.partial_cash_refunds_v40 r
 WHERE r.store_id=p_store AND r.cashier_id=p_cashier AND r.shift_id=p_shift;
 v_total:=v_shift.opening_minor::numeric+v_sales+v_in-v_out-v_expense-v_full-v_partial;
 IF v_total<0 OR v_total>9999999999999 OR v_sales>9999999999999
  OR v_in>9999999999999 OR v_out>9999999999999 OR v_expense>9999999999999
  OR v_full>9999999999999 OR v_partial>9999999999999
 THEN RAISE EXCEPTION 'cash total outside bounds' USING ERRCODE='22003'; END IF;
 RETURN QUERY SELECT v_shift.shift_id,v_shift.state,v_shift.opening_minor,
 v_sales::bigint,v_in::bigint,v_out::bigint,v_expense::bigint,v_total::bigint,
 v_shift.counted_minor,v_shift.variance_minor;
END $v42$;



-- V39's return shape is unchanged; refund_minor remains cash-only until
-- a verified provider-refund pipeline is built.
-- Forbid CASH refunding of any sale with an external component.
CREATE OR REPLACE FUNCTION zhirox_local.block_mixed_cash_refund_v42()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $v42$
BEGIN
 IF TG_OP='INSERT' AND EXISTS(
  SELECT 1 FROM zhirox_local.sales s
  JOIN zhirox_local.external_settlements_v42 e
   ON e.store_id=s.store_id AND e.request_id=s.request_id
  WHERE s.store_id=NEW.store_id AND s.id=NEW.sale_id
 ) THEN RAISE EXCEPTION 'mixed sale requires provider-aware return'
  USING ERRCODE='P4205'; END IF;
 RETURN NEW;
END $v42$;
DROP TRIGGER IF EXISTS v00_v42_block_mixed_full_cash_refund
 ON zhirox_local.cash_refunds_v39;
CREATE TRIGGER v00_v42_block_mixed_full_cash_refund BEFORE INSERT
 ON zhirox_local.cash_refunds_v39 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.block_mixed_cash_refund_v42();
DROP TRIGGER IF EXISTS v00_v42_block_mixed_partial_cash_refund
 ON zhirox_local.partial_cash_refunds_v40;
CREATE TRIGGER v00_v42_block_mixed_partial_cash_refund BEFORE INSERT
 ON zhirox_local.partial_cash_refunds_v40 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.block_mixed_cash_refund_v42();

-- Never silently cancel after external capture; payment might have been taken.
CREATE OR REPLACE FUNCTION zhirox_local.prevent_captured_cancel_v42()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $v42$
BEGIN
 IF NEW.state='cancelled' AND OLD.state<>'cancelled' AND EXISTS(
  SELECT 1 FROM zhirox_local.external_settlements_v42 e
  WHERE e.store_id=NEW.store_id AND e.request_id=NEW.request_id
 ) THEN RAISE EXCEPTION 'captured tender needs explicit provider reversal'
   USING ERRCODE='P4206'; END IF;
 RETURN NEW;
END $v42$;
DROP TRIGGER IF EXISTS v42_block_cancel_after_capture
 ON zhirox_local.checkout_intents_v31;
CREATE TRIGGER v42_block_cancel_after_capture BEFORE UPDATE OF state
 ON zhirox_local.checkout_intents_v31 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.prevent_captured_cancel_v42();

CREATE OR REPLACE FUNCTION zhirox_local.tender_summary_v42(
 p_store uuid,p_cashier uuid,p_shift uuid
) RETURNS TABLE(gross_sales_minor bigint,cash_sales_minor bigint,
 bank_sales_minor bigint,cash_refunds_minor bigint,expected_drawer_minor bigint)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $v42$
DECLARE gross numeric; external numeric; cash_returns numeric; drawer record;
BEGIN
 SELECT COALESCE(SUM(s.total_minor),0),COALESCE(SUM(e.amount_minor),0)
 INTO gross,external FROM zhirox_local.sales s
 LEFT JOIN zhirox_local.external_settlements_v42 e
  ON e.store_id=s.store_id AND e.request_id=s.request_id
 WHERE s.store_id=p_store AND s.cashier_id=p_cashier AND s.shift_id_v37=p_shift;
 SELECT COALESCE(SUM(r.refund_minor),0) INTO cash_returns
 FROM (
  SELECT refund_minor FROM zhirox_local.cash_refunds_v39
   WHERE store_id=p_store AND cashier_id=p_cashier AND shift_id=p_shift
  UNION ALL
  SELECT refund_minor FROM zhirox_local.partial_cash_refunds_v40
   WHERE store_id=p_store AND cashier_id=p_cashier AND shift_id=p_shift
 ) r;
 SELECT * INTO STRICT drawer FROM zhirox_local.cash_summary_v38(
 p_store,p_cashier,p_shift);
 IF gross>9999999999999 OR external>9999999999999 OR
    cash_returns>9999999999999 OR gross-external>9999999999999
 THEN RAISE EXCEPTION 'tender totals overflow' USING ERRCODE='22003'; END IF;
 RETURN QUERY SELECT gross::bigint,(gross-external)::bigint,
 external::bigint,cash_returns::bigint,drawer.expected_minor;
END $v42$;
REVOKE ALL ON FUNCTION zhirox_local.guard_settlement_v42() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.block_mixed_cash_refund_v42() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.prevent_captured_cancel_v42() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.tender_summary_v42(uuid,uuid,uuid) FROM PUBLIC;
COMMIT;
