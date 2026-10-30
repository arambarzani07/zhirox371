-- V37 disposable PostgreSQL local-only cash shift foundation.
-- Apply AFTER V31, V34 and V35 migrations on a disposable DB. Do not apply to
-- production, legacy SQL Server, Supabase or an in-use cash register.
-- Every NEW sale must join one independently authenticated cashier's open shift.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.cash_shifts_v37(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 shift_id uuid NOT NULL,
 cashier_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN('open','closed')),
 opening_minor bigint NOT NULL CHECK(opening_minor BETWEEN 0 AND 9999999999999),
 cash_sales_minor bigint CHECK(cash_sales_minor BETWEEN 0 AND 9999999999999),
 expected_minor bigint CHECK(expected_minor BETWEEN 0 AND 9999999999999),
 counted_minor bigint CHECK(counted_minor BETWEEN 0 AND 9999999999999),
 variance_minor bigint,
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 closed_at timestamptz,
 PRIMARY KEY(store_id,shift_id),
 CHECK((state='open' AND cash_sales_minor IS NULL AND expected_minor IS NULL
    AND counted_minor IS NULL AND variance_minor IS NULL AND closed_at IS NULL)
   OR (state='closed' AND cash_sales_minor IS NOT NULL AND expected_minor IS NOT NULL
    AND counted_minor IS NOT NULL AND variance_minor IS NOT NULL AND closed_at IS NOT NULL
    AND variance_minor=counted_minor-expected_minor))
);
CREATE UNIQUE INDEX IF NOT EXISTS v37_single_open_shift
 ON zhirox_local.cash_shifts_v37(store_id,cashier_id) WHERE state='open';
ALTER TABLE zhirox_local.checkout_intents_v31
 ADD COLUMN IF NOT EXISTS shift_id_v37 uuid;
ALTER TABLE zhirox_local.checkout_intents_v31
 ADD CONSTRAINT intents_shift_v37_fk FOREIGN KEY(store_id,shift_id_v37)
 REFERENCES zhirox_local.cash_shifts_v37(store_id,shift_id);
ALTER TABLE zhirox_local.sales ADD COLUMN IF NOT EXISTS shift_id_v37 uuid;
ALTER TABLE zhirox_local.sales
 ADD CONSTRAINT sales_shift_v37_fk FOREIGN KEY(store_id,shift_id_v37)
 REFERENCES zhirox_local.cash_shifts_v37(store_id,shift_id);

CREATE OR REPLACE FUNCTION zhirox_local.open_cash_shift_v37(
 p_store uuid,p_cashier uuid,p_shift uuid,p_opening bigint
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,opened_at timestamptz)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
DECLARE old zhirox_local.cash_shifts_v37%ROWTYPE;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_shift IS NULL OR
    p_opening IS NULL OR p_opening NOT BETWEEN 0 AND 9999999999999
 THEN RAISE EXCEPTION 'invalid shift' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'store not found' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.local_users u WHERE u.store_id=p_store AND u.id=p_cashier
  AND u.enabled AND u.role IN('owner','manager','cashier');
 IF NOT FOUND THEN RAISE EXCEPTION 'cashier disabled or not enrolled' USING ERRCODE='P3701'; END IF;
 SELECT * INTO old FROM zhirox_local.cash_shifts_v37 q
 WHERE q.store_id=p_store AND q.shift_id=p_shift;
 IF FOUND THEN
  IF old.cashier_id<>p_cashier OR old.opening_minor<>p_opening THEN
    RAISE EXCEPTION 'shift UUID already used with different details' USING ERRCODE='P3702'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM zhirox_local.cash_shifts_v37
            WHERE store_id=p_store AND cashier_id=p_cashier AND state='open')
  THEN RAISE EXCEPTION 'active shift must be closed first' USING ERRCODE='P3702'; END IF;
  INSERT INTO zhirox_local.cash_shifts_v37(store_id,shift_id,cashier_id,opening_minor)
  VALUES(p_store,p_shift,p_cashier,p_opening);
 END IF;
 RETURN QUERY SELECT q.shift_id,q.state,q.opening_minor,q.opened_at
 FROM zhirox_local.cash_shifts_v37 q
 WHERE q.store_id=p_store AND q.shift_id=p_shift AND q.cashier_id=p_cashier;
END $$;

-- Bind the durable V31 intent to the CURRENT open shift at prepare time.
-- An intent from a closed/missing shift cannot be attached to a later shift.
CREATE OR REPLACE FUNCTION zhirox_local.assign_intent_shift_v37()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $
DECLARE active_shift uuid;
BEGIN
 IF NEW.shift_id_v37 IS NOT NULL THEN
  RAISE EXCEPTION 'caller must not supply shift ID' USING ERRCODE='P3701'; END IF;
 SELECT q.shift_id INTO active_shift FROM zhirox_local.cash_shifts_v37 q
 WHERE q.store_id=NEW.store_id AND q.cashier_id=NEW.cashier_id AND q.state='open'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'open shift required before prepare' USING ERRCODE='P3701'; END IF;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.checkout_intents_v31 i
    WHERE i.store_id=NEW.store_id AND i.cashier_id=NEW.cashier_id
      AND i.request_id=NEW.request_id AND i.state='prepared'
      AND i.shift_id_v37=active_shift)
 THEN RAISE EXCEPTION 'sale must follow a prepared intent from same shift'
      USING ERRCODE='P3701'; END IF;
 NEW.shift_id_v37:=active_shift;
 RETURN NEW;
END $;
DROP TRIGGER IF EXISTS v37_enforce_intent_shift ON zhirox_local.checkout_intents_v31;
CREATE TRIGGER v37_enforce_intent_shift BEFORE INSERT ON zhirox_local.checkout_intents_v31
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.assign_intent_shift_v37();
CREATE OR REPLACE FUNCTION zhirox_local.prevent_intent_shift_change_v37()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $
BEGIN
 IF NEW.shift_id_v37 IS DISTINCT FROM OLD.shift_id_v37 THEN
   RAISE EXCEPTION 'intent shift immutable' USING ERRCODE='P3701'; END IF;
 RETURN NEW;
END $;
DROP TRIGGER IF EXISTS v37_immutable_intent_shift ON zhirox_local.checkout_intents_v31;
CREATE TRIGGER v37_immutable_intent_shift BEFORE UPDATE OF shift_id_v37
 ON zhirox_local.checkout_intents_v31
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.prevent_intent_shift_change_v37();
-- This trigger is inserted in the same database transaction as V31 checkout.
-- Even a rogue direct SQL INSERT without an open shift fails closed. Existing
-- historical sales are NULL: NO backfill / manufactured shift attribution.
CREATE OR REPLACE FUNCTION zhirox_local.assign_sale_shift_v37()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
DECLARE active_shift uuid;
BEGIN
 IF NEW.shift_id_v37 IS NOT NULL THEN
  RAISE EXCEPTION 'caller may not supply shift ID' USING ERRCODE='P3701'; END IF;
 SELECT q.shift_id INTO active_shift FROM zhirox_local.cash_shifts_v37 q
 WHERE q.store_id=NEW.store_id AND q.cashier_id=NEW.cashier_id AND q.state='open'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'open cashier shift required' USING ERRCODE='P3701'; END IF;
 NEW.shift_id_v37:=active_shift;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v37_enforce_sale_shift ON zhirox_local.sales;
CREATE TRIGGER v37_enforce_sale_shift BEFORE INSERT ON zhirox_local.sales
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.assign_sale_shift_v37();

CREATE OR REPLACE FUNCTION zhirox_local.close_cash_shift_v37(
 p_store uuid,p_cashier uuid,p_shift uuid,p_counted bigint
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,
 cash_sales_minor bigint,expected_minor bigint,counted_minor bigint,
 variance_minor bigint,closed_at timestamptz)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
DECLARE old zhirox_local.cash_shifts_v37%ROWTYPE;
 v_sales numeric;
 v_expected numeric;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_shift IS NULL OR
    p_counted IS NULL OR p_counted NOT BETWEEN 0 AND 9999999999999
 THEN RAISE EXCEPTION 'invalid counted amount' USING ERRCODE='22023'; END IF;
 -- Every V31 checkout and open/close operation locks this SAME store row.
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'store not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM zhirox_local.cash_shifts_v37
 WHERE store_id=p_store AND shift_id=p_shift AND cashier_id=p_cashier FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shift not found' USING ERRCODE='P3701'; END IF;
 IF old.state='closed' THEN
  IF old.counted_minor<>p_counted THEN
   RAISE EXCEPTION 'closed shift cannot be changed' USING ERRCODE='P3704'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM zhirox_local.checkout_intents_v31
    WHERE store_id=p_store AND cashier_id=p_cashier AND state='prepared')
  THEN RAISE EXCEPTION 'unresolved checkout must be recovered/cancelled'
       USING ERRCODE='P3703'; END IF;
  SELECT COALESCE(SUM(s.total_minor),0) INTO v_sales
  FROM zhirox_local.sales s
  WHERE s.store_id=p_store AND s.cashier_id=p_cashier AND s.shift_id_v37=p_shift;
  v_expected:=old.opening_minor::numeric+v_sales;
  IF v_expected>9999999999999 THEN
    RAISE EXCEPTION 'cash amount overflow' USING ERRCODE='22003'; END IF;
  UPDATE zhirox_local.cash_shifts_v37 q
  SET state='closed',cash_sales_minor=v_sales::bigint,
     expected_minor=v_expected::bigint,counted_minor=p_counted,
     variance_minor=p_counted-v_expected::bigint,closed_at=clock_timestamp()
  WHERE q.store_id=p_store AND q.shift_id=p_shift AND q.cashier_id=p_cashier;
 END IF;
 RETURN QUERY SELECT q.shift_id,q.state,q.opening_minor,q.cash_sales_minor,
  q.expected_minor,q.counted_minor,q.variance_minor,q.closed_at
 FROM zhirox_local.cash_shifts_v37 q
 WHERE q.store_id=p_store AND q.shift_id=p_shift AND q.cashier_id=p_cashier;
END $$;
-- No direct public access. SQL role least-privilege requires dedicated review.
REVOKE ALL ON zhirox_local.cash_shifts_v37 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.open_cash_shift_v37(uuid,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.close_cash_shift_v37(uuid,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.assign_sale_shift_v37() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.assign_intent_shift_v37() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.prevent_intent_shift_change_v37() FROM PUBLIC;
COMMIT;
