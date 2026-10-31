-- ZHIROX V85: isolated TEST-MARKET ONLY manual cashbook/shift accounting.
-- No physical money received or disbursed, no historical sale attribution,
-- no link to V37 cashier shift checkout. Do NOT apply to a real store.
BEGIN;
CREATE TABLE zhirox_local.test_cash_shifts_v85(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 shift_id uuid NOT NULL,
 cashier_id uuid NOT NULL,
 opened_by uuid NOT NULL,
 opening_minor bigint NOT NULL CHECK(opening_minor BETWEEN 0 AND 9999999999999),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 counted_minor bigint CHECK(counted_minor BETWEEN 0 AND 9999999999999),
 expected_minor bigint CHECK(expected_minor BETWEEN 0 AND 9999999999999),
 variance_minor bigint,
 opened_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 PRIMARY KEY(store_id,shift_id),
 FOREIGN KEY(store_id,cashier_id) REFERENCES zhirox_local.local_users(store_id,id),
 FOREIGN KEY(store_id,opened_by) REFERENCES zhirox_local.local_users(store_id,id),
 CHECK((status='open' AND counted_minor IS NULL AND expected_minor IS NULL AND
    variance_minor IS NULL AND closed_at IS NULL) OR
   (status='closed' AND counted_minor IS NOT NULL AND expected_minor IS NOT NULL
    AND variance_minor IS NOT NULL AND closed_at IS NOT NULL AND
    variance_minor=counted_minor-expected_minor))
);
CREATE UNIQUE INDEX test_one_open_shift_v85
 ON zhirox_local.test_cash_shifts_v85(store_id,cashier_id) WHERE status='open';

CREATE TABLE zhirox_local.test_cash_movements_v85(
 store_id uuid NOT NULL,
 entry_id uuid NOT NULL,
 shift_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('cash_in','cash_out','expense')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9999999999999),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,entry_id),
 FOREIGN KEY(store_id,shift_id) REFERENCES zhirox_local.test_cash_shifts_v85(store_id,shift_id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX test_cash_movements_shift_v85 ON
 zhirox_local.test_cash_movements_v85(store_id,shift_id,created_at DESC);

CREATE FUNCTION zhirox_local.test_cash_manager_v85(p_store uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users WHERE store_id=p_store
   AND id=p_actor AND enabled AND role IN('owner','manager')
   AND (locked_until IS NULL OR locked_until<now())) THEN
   RAISE EXCEPTION 'test cash manager required' USING ERRCODE='P8501';
 END IF;
END $fn$;

CREATE FUNCTION zhirox_local.start_test_shift_v85(
 p_store uuid,p_actor uuid,p_cashier uuid,p_shift uuid,p_opening bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE old zhirox_local.test_cash_shifts_v85%ROWTYPE;
BEGIN
 PERFORM zhirox_local.test_cash_manager_v85(p_store,p_actor);
 IF p_cashier IS NULL OR p_shift IS NULL OR p_opening IS NULL
  OR p_opening NOT BETWEEN 0 AND 9999999999999
  OR NOT EXISTS(SELECT 1 FROM zhirox_local.local_users
   WHERE store_id=p_store AND id=p_cashier AND enabled
   AND (locked_until IS NULL OR locked_until<now()))
 THEN RAISE EXCEPTION 'invalid cashier or opening' USING ERRCODE='P8502'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 SELECT * INTO old FROM zhirox_local.test_cash_shifts_v85
 WHERE store_id=p_store AND shift_id=p_shift;
 IF FOUND THEN
  IF old.cashier_id IS DISTINCT FROM p_cashier OR
    old.opened_by IS DISTINCT FROM p_actor OR
    old.opening_minor IS DISTINCT FROM p_opening THEN
    RAISE EXCEPTION 'shift request conflict' USING ERRCODE='P8503'; END IF;
  RETURN old.shift_id;
 END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.test_cash_shifts_v85
  WHERE store_id=p_store AND cashier_id=p_cashier AND status='open')
 THEN RAISE EXCEPTION 'cashier already has open test shift' USING ERRCODE='P8503'; END IF;
 INSERT INTO zhirox_local.test_cash_shifts_v85
 (store_id,shift_id,cashier_id,opened_by,opening_minor)
 VALUES(p_store,p_shift,p_cashier,p_actor,p_opening);
 RETURN p_shift;
END $fn$;

CREATE FUNCTION zhirox_local.record_test_cash_movement_v85(
 p_store uuid,p_actor uuid,p_shift uuid,p_request uuid,
 p_kind text,p_amount bigint,p_reason text
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE sh zhirox_local.test_cash_shifts_v85%ROWTYPE;
 old zhirox_local.test_cash_movements_v85%ROWTYPE;
 balance numeric;
BEGIN
 PERFORM zhirox_local.test_cash_manager_v85(p_store,p_actor);
 IF p_shift IS NULL OR p_request IS NULL OR p_kind IS NULL OR
  p_kind NOT IN('cash_in','cash_out','expense') OR
  p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 9999999999999 OR
  p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 160
 THEN RAISE EXCEPTION 'invalid movement' USING ERRCODE='P8502'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 SELECT * INTO sh FROM zhirox_local.test_cash_shifts_v85
 WHERE store_id=p_store AND shift_id=p_shift FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shift unavailable' USING ERRCODE='P8502'; END IF;
 SELECT * INTO old FROM zhirox_local.test_cash_movements_v85
 WHERE store_id=p_store AND entry_id=p_request;
 IF FOUND THEN
  IF old.actor_id IS DISTINCT FROM p_actor OR
    old.shift_id IS DISTINCT FROM p_shift OR
    old.kind IS DISTINCT FROM p_kind OR
    old.amount_minor IS DISTINCT FROM p_amount OR
    old.reason IS DISTINCT FROM btrim(p_reason) THEN
    RAISE EXCEPTION 'cash request conflict' USING ERRCODE='P8503'; END IF;
 ELSE
  IF sh.status<>'open' THEN
   RAISE EXCEPTION 'closed shift cannot accept movements' USING ERRCODE='P8503'; END IF;
  SELECT sh.opening_minor::numeric + COALESCE(sum(
    CASE WHEN kind='cash_in' THEN amount_minor::numeric
         ELSE -amount_minor::numeric END),0) INTO balance
  FROM zhirox_local.test_cash_movements_v85
  WHERE store_id=p_store AND shift_id=p_shift;
  IF p_kind IN('cash_out','expense') AND balance<p_amount THEN
   RAISE EXCEPTION 'insufficient test shift balance' USING ERRCODE='P8505'; END IF;
  IF p_kind='cash_in' AND balance+p_amount>9999999999999 THEN
   RAISE EXCEPTION 'cash amount overflow' USING ERRCODE='P8505'; END IF;
  INSERT INTO zhirox_local.test_cash_movements_v85
  (store_id,entry_id,shift_id,actor_id,kind,amount_minor,reason)
  VALUES(p_store,p_request,p_shift,p_actor,p_kind,p_amount,btrim(p_reason));
 END IF;
 SELECT sh.opening_minor::numeric + COALESCE(sum(
 CASE WHEN kind='cash_in' THEN amount_minor::numeric
 ELSE -amount_minor::numeric END),0) INTO balance
 FROM zhirox_local.test_cash_movements_v85
 WHERE store_id=p_store AND shift_id=p_shift;
 RETURN balance::bigint;
END $fn$;

CREATE FUNCTION zhirox_local.close_test_shift_v85(
 p_store uuid,p_actor uuid,p_shift uuid,p_counted bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE sh zhirox_local.test_cash_shifts_v85%ROWTYPE;
 balance numeric;
BEGIN
 PERFORM zhirox_local.test_cash_manager_v85(p_store,p_actor);
 IF p_shift IS NULL OR p_counted IS NULL OR p_counted NOT BETWEEN 0 AND 9999999999999
 THEN RAISE EXCEPTION 'invalid count' USING ERRCODE='P8502'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 SELECT * INTO sh FROM zhirox_local.test_cash_shifts_v85
 WHERE store_id=p_store AND shift_id=p_shift FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shift unavailable' USING ERRCODE='P8502'; END IF;
 IF sh.status='closed' THEN
  IF sh.counted_minor IS DISTINCT FROM p_counted THEN
   RAISE EXCEPTION 'closed shift count conflict' USING ERRCODE='P8503'; END IF;
  RETURN sh.expected_minor;
 END IF;
 SELECT sh.opening_minor::numeric+COALESCE(sum(
 CASE WHEN kind='cash_in' THEN amount_minor::numeric
 ELSE -amount_minor::numeric END),0) INTO balance
 FROM zhirox_local.test_cash_movements_v85
 WHERE store_id=p_store AND shift_id=p_shift;
 IF balance<0 OR balance>9999999999999 THEN
  RAISE EXCEPTION 'test cash total out of range' USING ERRCODE='P8505'; END IF;
 UPDATE zhirox_local.test_cash_shifts_v85
 SET status='closed',expected_minor=balance::bigint,counted_minor=p_counted,
 variance_minor=p_counted-balance::bigint,closed_at=now()
 WHERE store_id=p_store AND shift_id=p_shift;
 RETURN balance::bigint;
END $fn$;

CREATE FUNCTION zhirox_local.lock_test_cash_history_v85()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'immutable test cash history' USING ERRCODE='P8504';
END $fn$;
CREATE TRIGGER test_cash_movements_immutable_v85
 BEFORE UPDATE OR DELETE ON zhirox_local.test_cash_movements_v85
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.lock_test_cash_history_v85();
CREATE TRIGGER test_closed_shift_immutable_v85
 BEFORE UPDATE OR DELETE ON zhirox_local.test_cash_shifts_v85
 FOR EACH ROW WHEN (OLD.status='closed')
 EXECUTE FUNCTION zhirox_local.lock_test_cash_history_v85();

REVOKE ALL ON TABLE zhirox_local.test_cash_shifts_v85,
 zhirox_local.test_cash_movements_v85 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.test_cash_manager_v85(uuid,uuid),
 zhirox_local.start_test_shift_v85(uuid,uuid,uuid,uuid,bigint),
 zhirox_local.record_test_cash_movement_v85(uuid,uuid,uuid,uuid,text,bigint,text),
 zhirox_local.close_test_shift_v85(uuid,uuid,uuid,bigint),
 zhirox_local.lock_test_cash_history_v85() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.test_cash_shifts_v85 IS
 'Test-only MANUAL simulated shift cashbook: historical V80 sales have NO shift link and are excluded. Not real cash.';
COMMENT ON TABLE zhirox_local.test_cash_movements_v85 IS
 'TEST ONLY manually authored simulated cash in/out/expenses; not a bank, till or actual cash movement.';
COMMIT;
