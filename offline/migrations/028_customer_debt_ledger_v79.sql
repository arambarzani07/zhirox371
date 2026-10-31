-- ZHIROX V79: typed customer + debt ledger on disposable LAN PostgreSQL.
-- TEST ONLY. No production migration, no live cashier write or cloud sync.
-- Prerequisites: 001_core.sql, 003_local_users.sql.
BEGIN;
CREATE TABLE zhirox_local.customers_v79 (
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 customer_id uuid NOT NULL,
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 2 AND 120),
 phone text CHECK(phone IS NULL OR length(phone)<=30),
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 is_active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(store_id,customer_id),
 FOREIGN KEY(store_id,created_by) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX customers_v79_lookup ON
 zhirox_local.customers_v79(store_id,display_name,customer_id);
CREATE TABLE zhirox_local.customer_debt_ledger_v79 (
 store_id uuid NOT NULL,
 entry_id uuid NOT NULL,
 customer_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 entry_type text NOT NULL CHECK(entry_type IN ('opening_debt','repayment')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9999999999999),
 reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 3 AND 160),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,entry_id),
 UNIQUE(store_id,request_id),
 FOREIGN KEY(store_id,customer_id) REFERENCES zhirox_local.customers_v79(store_id,customer_id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX customer_debt_ledger_v79_customer_recent
 ON zhirox_local.customer_debt_ledger_v79(store_id,customer_id,created_at DESC);
CREATE FUNCTION zhirox_local.block_customer_debt_mutation_v79()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
 RAISE EXCEPTION 'immutable customer debt ledger' USING ERRCODE='P7904';
END $guard$;
CREATE TRIGGER debt_ledger_immutable_v79
 BEFORE UPDATE OR DELETE ON zhirox_local.customer_debt_ledger_v79
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_customer_debt_mutation_v79();

-- The trusted server, NOT the cashier browser, must derive p_actor and
-- p_store from a valid, unrevoked local session. The UUID is not authentication.
CREATE FUNCTION zhirox_local.register_customer_v79(
 p_store uuid,p_actor uuid,p_customer uuid,p_name text,p_phone text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $register$
DECLARE v_old zhirox_local.customers_v79%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users
   WHERE store_id=p_store AND id=p_actor AND enabled AND role IN ('owner','manager')
   AND (locked_until IS NULL OR locked_until<now()))
 THEN RAISE EXCEPTION 'manager required' USING ERRCODE='P7901'; END IF;
 IF p_customer IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 120
    OR (p_phone IS NOT NULL AND length(p_phone)>30)
 THEN RAISE EXCEPTION 'invalid customer' USING ERRCODE='P7902'; END IF;
 INSERT INTO zhirox_local.customers_v79(store_id,customer_id,display_name,phone,created_by)
 VALUES(p_store,p_customer,btrim(p_name),p_phone,p_actor)
 ON CONFLICT (store_id,customer_id) DO NOTHING;
 SELECT * INTO v_old FROM zhirox_local.customers_v79
 WHERE store_id=p_store AND customer_id=p_customer;
 IF NOT FOUND OR v_old.display_name<>btrim(p_name)
   OR v_old.phone IS DISTINCT FROM p_phone
 THEN RAISE EXCEPTION 'customer identifier conflict' USING ERRCODE='P7903'; END IF;
 RETURN p_customer;
END $register$;

-- Financial journal is append-only. This isolated prototype has ONLY:
-- opening/imported debt (manager) and a repayment accounting record (manager).
-- This is NOT a cash movement, verified payment, sale charge or bank settlement.
CREATE FUNCTION zhirox_local.record_customer_debt_v79(
 p_store uuid,p_actor uuid,p_customer uuid,p_request uuid,
 p_kind text,p_amount bigint,p_reference text
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $post$
DECLARE v_existing zhirox_local.customer_debt_ledger_v79%ROWTYPE;
 v_balance bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users
   WHERE store_id=p_store AND id=p_actor AND enabled AND role IN ('owner','manager')
   AND (locked_until IS NULL OR locked_until<now()))
 THEN RAISE EXCEPTION 'manager required' USING ERRCODE='P7901'; END IF;
 IF p_request IS NULL OR p_kind NOT IN ('opening_debt','repayment')
    OR p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 9999999999999
    OR p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 3 AND 160
 THEN RAISE EXCEPTION 'invalid entry' USING ERRCODE='P7902'; END IF;

 -- Serialize all writes to one customer to prevent repayment overshoot.
 PERFORM 1 FROM zhirox_local.customers_v79
 WHERE store_id=p_store AND customer_id=p_customer AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'customer unavailable' USING ERRCODE='P7902'; END IF;

 SELECT * INTO v_existing FROM zhirox_local.customer_debt_ledger_v79
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF v_existing.customer_id IS DISTINCT FROM p_customer OR
     v_existing.actor_id IS DISTINCT FROM p_actor OR
     v_existing.entry_type IS DISTINCT FROM p_kind OR
     v_existing.amount_minor IS DISTINCT FROM p_amount OR
     v_existing.reference IS DISTINCT FROM btrim(p_reference)
  THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='P7903'; END IF;
 ELSE
  SELECT COALESCE(sum(CASE WHEN entry_type='opening_debt' THEN amount_minor::numeric
                        ELSE -amount_minor::numeric END),0)
   INTO v_balance FROM zhirox_local.customer_debt_ledger_v79
  WHERE store_id=p_store AND customer_id=p_customer;
  IF p_kind='repayment' AND v_balance<p_amount
  THEN RAISE EXCEPTION 'repayment exceeds debt' USING ERRCODE='P7905'; END IF;
  INSERT INTO zhirox_local.customer_debt_ledger_v79
   (store_id,entry_id,customer_id,request_id,actor_id,entry_type,amount_minor,reference)
  VALUES (p_store,p_request,p_customer,p_request,p_actor,p_kind,p_amount,btrim(p_reference));
 END IF;
 SELECT COALESCE(sum(CASE WHEN entry_type='opening_debt' THEN amount_minor::numeric
                       ELSE -amount_minor::numeric END),0)::bigint
 INTO v_balance FROM zhirox_local.customer_debt_ledger_v79
 WHERE store_id=p_store AND customer_id=p_customer;
 IF v_balance<0 OR v_balance>9999999999999
 THEN RAISE EXCEPTION 'debt balance out of range' USING ERRCODE='P7905'; END IF;
 RETURN v_balance;
END $post$;

-- Read-only balance derived from ledger, never a client-editable total.
CREATE VIEW zhirox_local.customer_debt_balances_v79 WITH (security_barrier=true) AS
 SELECT c.store_id,c.customer_id,c.display_name,c.is_active,
  COALESCE(sum(CASE WHEN l.entry_type='opening_debt' THEN l.amount_minor::numeric
                  WHEN l.entry_type='repayment' THEN -l.amount_minor::numeric ELSE 0 END),0)::bigint AS balance_minor
 FROM zhirox_local.customers_v79 c
 LEFT JOIN zhirox_local.customer_debt_ledger_v79 l
 ON l.store_id=c.store_id AND l.customer_id=c.customer_id
 GROUP BY c.store_id,c.customer_id,c.display_name,c.is_active;

REVOKE ALL ON TABLE zhirox_local.customers_v79,zhirox_local.customer_debt_ledger_v79,
 zhirox_local.customer_debt_balances_v79 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.register_customer_v79(uuid,uuid,uuid,text,text),
 zhirox_local.record_customer_debt_v79(uuid,uuid,uuid,uuid,text,bigint,text),
 zhirox_local.block_customer_debt_mutation_v79() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.customer_debt_ledger_v79 IS
 'Isolated accounting prototype. Repayment is not actual receipt of cash and not a bank settlement.';
COMMIT;
