-- V41 CASH + EXTERNAL-TENDER DRAFT ONLY. PostgreSQL disposable lab only.
-- NO bank/card authorization, capture or settlement connector is installed.
-- A mixed-tender draft MUST NOT create a sale, stock deduction, receipt,
-- cash credit or a claim that a bank transfer was collected.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.tender_plans_v41(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 request_id uuid NOT NULL,
 cashier_id uuid NOT NULL,
 cash_minor bigint NOT NULL CHECK(cash_minor BETWEEN 0 AND 9999999999999),
 external_minor bigint NOT NULL CHECK(external_minor BETWEEN 0 AND 9999999999999),
 external_method text NOT NULL CHECK(external_method IN('none','card','bank_transfer')),
 state text GENERATED ALWAYS AS (
  CASE WHEN external_minor=0 THEN 'cash_ready' ELSE 'external_unverified' END
 ) STORED,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,request_id),
 FOREIGN KEY(store_id,request_id)
  REFERENCES zhirox_local.checkout_intents_v31(store_id,request_id),
 CHECK(cash_minor+external_minor BETWEEN 0 AND 9999999999999),
 CHECK((external_minor=0 AND external_method='none' AND cash_minor>0)
   OR (external_minor>0 AND external_method IN('card','bank_transfer'))),
 CHECK(cash_minor+external_minor>0)
);

-- Even a direct SQL INSERT or UPDATE into the table cannot impersonate
-- settlement or change an earlier cash/external allocation.
CREATE OR REPLACE FUNCTION zhirox_local.guard_tender_plan_v41()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v41$
DECLARE intent zhirox_local.checkout_intents_v31%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'tender plan is immutable' USING ERRCODE='P4103'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=NEW.store_id FOR UPDATE;
 SELECT i.* INTO intent FROM zhirox_local.checkout_intents_v31 i
 WHERE i.store_id=NEW.store_id AND i.request_id=NEW.request_id FOR UPDATE;
 IF NOT FOUND OR intent.state<>'prepared'
  OR intent.cashier_id<>NEW.cashier_id
 THEN RAISE EXCEPTION 'matching prepared intent required' USING ERRCODE='P4102'; END IF;
 IF intent.expected_total_minor<>NEW.cash_minor+NEW.external_minor
 THEN RAISE EXCEPTION 'allocation must exactly equal server-prepared quote'
  USING ERRCODE='P4102'; END IF;
 PERFORM 1 FROM zhirox_local.local_users u WHERE u.store_id=NEW.store_id
 AND u.id=NEW.cashier_id AND u.enabled AND u.role='cashier'
 AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'cashier no longer enabled' USING ERRCODE='P4102'; END IF;
 RETURN NEW;
END $v41$;
DROP TRIGGER IF EXISTS v41_guard_tender_plan ON zhirox_local.tender_plans_v41;
CREATE TRIGGER v41_guard_tender_plan BEFORE INSERT OR UPDATE OR DELETE
 ON zhirox_local.tender_plans_v41 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.guard_tender_plan_v41();

-- This function persists only the allocation QUOTE. It never posts any
-- payment. Immutable UUID is the EXISTING V31 checkout request_id.
CREATE OR REPLACE FUNCTION zhirox_local.plan_tender_v41(
 p_store uuid,p_cashier uuid,p_request uuid,p_cash bigint,
 p_external bigint,p_method text
) RETURNS TABLE(request_id uuid,cash_minor bigint,external_minor bigint,
 external_method text,state text,created_at timestamptz,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v41$
DECLARE existing zhirox_local.tender_plans_v41%ROWTYPE;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_request IS NULL
  OR p_cash IS NULL OR p_external IS NULL
  OR p_cash NOT BETWEEN 0 AND 9999999999999
  OR p_external NOT BETWEEN 0 AND 9999999999999
  OR p_cash+p_external>9999999999999 OR p_cash+p_external=0
  OR p_method IS NULL OR p_method NOT IN('none','card','bank_transfer')
  OR (p_external=0 AND (p_method<>'none' OR p_cash<=0))
  OR (p_external>0 AND p_method='none')
 THEN RAISE EXCEPTION 'invalid tender plan' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='P4102'; END IF;
 SELECT q.* INTO existing FROM zhirox_local.tender_plans_v41 q
 WHERE q.store_id=p_store AND q.request_id=p_request;
 IF FOUND THEN
  IF existing.cashier_id<>p_cashier OR existing.cash_minor<>p_cash
    OR existing.external_minor<>p_external OR existing.external_method<>p_method
  THEN RAISE EXCEPTION 'immutable tender plan mismatch' USING ERRCODE='P4103'; END IF;
 ELSE
  INSERT INTO zhirox_local.tender_plans_v41
   (store_id,request_id,cashier_id,cash_minor,external_minor,external_method)
  VALUES(p_store,p_request,p_cashier,p_cash,p_external,p_method);
 END IF;
 RETURN QUERY SELECT q.request_id,q.cash_minor,q.external_minor,
  q.external_method,q.state,q.created_at,FOUND
 FROM zhirox_local.tender_plans_v41 q
 WHERE q.store_id=p_store AND q.request_id=p_request AND q.cashier_id=p_cashier;
END $v41$;

-- Runs on EVERY V31 sale INSERT even if the caller bypasses the V41 API.
-- No external-provider verifier installed: only CASH-ONLY plans can commit.
CREATE OR REPLACE FUNCTION zhirox_local.block_unverified_tender_v41()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v41$
DECLARE allocation zhirox_local.tender_plans_v41%ROWTYPE;
BEGIN
 SELECT q.* INTO allocation FROM zhirox_local.tender_plans_v41 q
 WHERE q.store_id=NEW.store_id AND q.request_id=NEW.request_id;
 IF FOUND THEN
  IF allocation.cashier_id<>NEW.cashier_id OR allocation.external_minor<>0
    OR allocation.external_method<>'none'
    OR allocation.cash_minor<>NEW.total_minor
  THEN RAISE EXCEPTION 'unverified or mismatched tender; sale refused'
    USING ERRCODE='P4101'; END IF;
 END IF;
 RETURN NEW;
END $v41$;
DROP TRIGGER IF EXISTS v41_enforce_settled_tender ON zhirox_local.sales;
CREATE TRIGGER v41_enforce_settled_tender BEFORE INSERT ON zhirox_local.sales
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.block_unverified_tender_v41();

REVOKE ALL ON zhirox_local.tender_plans_v41 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.guard_tender_plan_v41() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.plan_tender_v41(uuid,uuid,uuid,bigint,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.block_unverified_tender_v41() FROM PUBLIC;
COMMIT;
