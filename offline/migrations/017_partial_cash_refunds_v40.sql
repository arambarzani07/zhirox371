-- V40 ISOLATED LAB ONLY: manager-approved partial cash refunds by base unit.
-- Requires V39; never apply directly to a live store, Supabase or legacy SQL Server.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.partial_cash_refunds_v40(
 store_id uuid NOT NULL,
 refund_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 line_no integer NOT NULL CHECK(line_no>0),
 cashier_id uuid NOT NULL,
 manager_id uuid NOT NULL CHECK(manager_id<>cashier_id),
 shift_id uuid NOT NULL,
 product_id uuid NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units>0),
 refund_minor bigint NOT NULL CHECK(refund_minor>=0 AND refund_minor<=9999999999999),
 restock boolean NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 240),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,refund_id),
 FOREIGN KEY(store_id,sale_id,line_no) REFERENCES zhirox_local.sale_lines(store_id,sale_id,line_no),
 FOREIGN KEY(store_id,shift_id) REFERENCES zhirox_local.cash_shifts_v37(store_id,shift_id),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE INDEX IF NOT EXISTS v40_line_refund_history
 ON zhirox_local.partial_cash_refunds_v40(store_id,sale_id,line_no,created_at);

-- Any full-line V39 refund must be mutually exclusive with V40 partials.
CREATE OR REPLACE FUNCTION zhirox_local.guard_v39_after_v40()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v40$
BEGIN
 IF TG_OP<>'INSERT' THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.partial_cash_refunds_v40 r
   WHERE r.store_id=NEW.store_id AND r.sale_id=NEW.sale_id AND r.line_no=NEW.line_no)
 THEN RAISE EXCEPTION 'line already partially refunded' USING ERRCODE='P4002'; END IF;
 RETURN NEW;
END $v40$;
DROP TRIGGER IF EXISTS v40_block_full_after_partial ON zhirox_local.cash_refunds_v39;
CREATE TRIGGER v40_block_full_after_partial BEFORE INSERT ON zhirox_local.cash_refunds_v39
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.guard_v39_after_v40();

-- The existing V38/V39 closing formula must subtract BOTH full and partial cash refunds.
CREATE OR REPLACE FUNCTION zhirox_local.cash_summary_v38(
 p_store uuid,p_cashier uuid,p_shift uuid
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,
 cash_sales_minor bigint,cash_in_minor bigint,cash_out_minor bigint,
 expense_minor bigint,expected_minor bigint,counted_minor bigint,
 variance_minor bigint)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v40$
DECLARE v_shift zhirox_local.cash_shifts_v37%ROWTYPE;
 v_sales numeric;v_in numeric;v_out numeric;v_expense numeric;
 v_full numeric;v_partial numeric;v_total numeric;
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
END $v40$;

CREATE OR REPLACE FUNCTION zhirox_local.cash_summary_v39(
 p_store uuid,p_cashier uuid,p_shift uuid
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,
 gross_sales_minor bigint,refund_minor bigint,cash_in_minor bigint,
 cash_out_minor bigint,expense_minor bigint,expected_minor bigint,
 counted_minor bigint,variance_minor bigint)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v40$
 SELECT s.shift_id,s.state,s.opening_minor,s.cash_sales_minor,
 COALESCE((SELECT sum(r.refund_minor)::numeric FROM zhirox_local.cash_refunds_v39 r
  WHERE r.store_id=p_store AND r.cashier_id=p_cashier AND r.shift_id=p_shift),0)::bigint
 + COALESCE((SELECT sum(r.refund_minor)::numeric FROM zhirox_local.partial_cash_refunds_v40 r
  WHERE r.store_id=p_store AND r.cashier_id=p_cashier AND r.shift_id=p_shift),0)::bigint,
 s.cash_in_minor,s.cash_out_minor,s.expense_minor,s.expected_minor,
 s.counted_minor,s.variance_minor
 FROM zhirox_local.cash_summary_v38(p_store,p_cashier,p_shift) s
$v40$;

-- The guard is also enforced for a direct SQL insert; API is not a bypass.
-- Cumulative FLOOR allocation ensures no over-refund due to rounding:
-- refund_now=floor(original_total*(prior_qty+new_qty)/original_qty)-prior_refunded_IQD.
CREATE OR REPLACE FUNCTION zhirox_local.guard_partial_refund_v40()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v40$
DECLARE q record; line_data record; previous_qty numeric;previous_money numeric;
 v_cumulative numeric; v_delta numeric;v_available bigint;
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'partial refund journal immutable' USING ERRCODE='P4004'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=NEW.store_id FOR UPDATE;
 SELECT * INTO q FROM zhirox_local.cash_shifts_v37 x
  WHERE x.store_id=NEW.store_id AND x.shift_id=NEW.shift_id FOR UPDATE;
 IF NOT FOUND OR q.state<>'open' OR q.cashier_id<>NEW.cashier_id
 THEN RAISE EXCEPTION 'matching open shift required' USING ERRCODE='P4001'; END IF;
 PERFORM 1 FROM zhirox_local.local_users u WHERE u.store_id=NEW.store_id
 AND u.id=NEW.cashier_id AND u.enabled AND u.role='cashier'
 AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'cashier disabled' USING ERRCODE='P4001'; END IF;
 PERFORM 1 FROM zhirox_local.local_users u WHERE u.store_id=NEW.store_id
 AND u.id=NEW.manager_id AND u.enabled AND u.role IN('owner','manager')
 AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'separate manager required' USING ERRCODE='P4001'; END IF;
 PERFORM 1 FROM zhirox_local.receipt_snapshots_v34 r
 WHERE r.store_id=NEW.store_id AND r.sale_id=NEW.sale_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'verified sale absent' USING ERRCODE='P4002'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.cash_refunds_v39 r WHERE
   r.store_id=NEW.store_id AND r.sale_id=NEW.sale_id AND r.line_no=NEW.line_no)
 THEN RAISE EXCEPTION 'line already fully refunded' USING ERRCODE='P4002'; END IF;
 SELECT sline_data.product_id,sline_data.quantity_base_units,sline_data.line_total_minor INTO line_data
 FROM zhirox_local.sale_lines sl WHERE sl.store_id=NEW.store_id
 AND sl.sale_id=NEW.sale_id AND sl.line_no=NEW.line_no;
 IF NOT FOUND OR line_data.quantity_base_units<=0 OR line_data.line_total_minor<0
  OR NEW.product_id<>line_data.product_id
 THEN RAISE EXCEPTION 'original line absent' USING ERRCODE='P4002'; END IF;
 SELECT COALESCE(SUM(r.quantity_base_units),0),
   COALESCE(SUM(r.refund_minor),0) INTO previous_qty,previous_money
 FROM zhirox_local.partial_cash_refunds_v40 r
 WHERE r.store_id=NEW.store_id AND r.sale_id=NEW.sale_id AND r.line_no=NEW.line_no;
 IF NEW.quantity_base_units>line_data.quantity_base_units-previous_qty THEN
  RAISE EXCEPTION 'refund quantity exceeds original sale line' USING ERRCODE='P4002'; END IF;
 v_cumulative:=floor(line_data.line_total_minor::numeric
   *(previous_qty+NEW.quantity_base_units)/line_data.quantity_base_units);
 v_delta:=v_cumulative-previous_money;
 IF v_delta<0 OR v_delta>9999999999999 OR NEW.refund_minor<>v_delta THEN
  RAISE EXCEPTION 'server calculated refund mismatch' USING ERRCODE='P4003'; END IF;
 SELECT s.expected_minor INTO STRICT v_available FROM zhirox_local.cash_summary_v38(
  NEW.store_id,NEW.cashier_id,NEW.shift_id) s;
 IF NEW.refund_minor>v_available THEN
  RAISE EXCEPTION 'insufficient cash for partial refund' USING ERRCODE='P4005'; END IF;
 RETURN NEW;
END $v40$;
DROP TRIGGER IF EXISTS v40_protect_partial_refunds ON zhirox_local.partial_cash_refunds_v40;
CREATE TRIGGER v40_protect_partial_refunds BEFORE INSERT OR UPDATE OR DELETE
 ON zhirox_local.partial_cash_refunds_v40 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.guard_partial_refund_v40();

CREATE OR REPLACE FUNCTION zhirox_local.refund_partial_line_v40(
 p_store uuid,p_cashier uuid,p_manager uuid,p_shift uuid,
 p_refund uuid,p_sale uuid,p_line integer,p_base_qty bigint,
 p_restock boolean,p_reason text
) RETURNS TABLE(refund_id uuid,sale_id uuid,line_no integer,
 quantity_base_units bigint,refund_minor bigint,restock boolean,
 created_at timestamptz,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v40$
DECLARE old zhirox_local.partial_cash_refunds_v40%ROWTYPE;
 l zhirox_local.sale_lines%ROWTYPE; p zhirox_local.products%ROWTYPE;
 prior_qty numeric;prior_money numeric;money numeric;available bigint;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_manager IS NULL OR p_cashier=p_manager
  OR p_shift IS NULL OR p_refund IS NULL OR p_sale IS NULL OR p_line IS NULL
  OR p_line NOT BETWEEN 1 AND 100 OR p_base_qty IS NULL
  OR p_base_qty NOT BETWEEN 1 AND 9223372036854775807
  OR p_restock IS NULL OR p_reason IS NULL
  OR length(btrim(p_reason)) NOT BETWEEN 3 AND 240 OR p_reason<>btrim(p_reason)
 THEN RAISE EXCEPTION 'invalid partial refund' USING ERRCODE='22023'; END IF;
 -- Strict serialization across all cashiers, stock, refunds and shift closures.
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='P4001'; END IF;
 SELECT r.* INTO old FROM zhirox_local.partial_cash_refunds_v40 r
 WHERE r.store_id=p_store AND r.refund_id=p_refund;
 IF FOUND THEN
  IF old.sale_id<>p_sale OR old.line_no<>p_line OR old.cashier_id<>p_cashier
    OR old.manager_id<>p_manager OR old.shift_id<>p_shift
    OR old.quantity_base_units<>p_base_qty OR old.restock<>p_restock
    OR old.reason<>p_reason THEN
   RAISE EXCEPTION 'refund retry changed payload' USING ERRCODE='P4006'; END IF;
  RETURN QUERY SELECT old.refund_id,old.sale_id,old.line_no,
   old.quantity_base_units,old.refund_minor,old.restock,old.created_at,true;
  RETURN;
 END IF;
 PERFORM 1 FROM zhirox_local.cash_shifts_v37 q WHERE
  q.store_id=p_store AND q.shift_id=p_shift AND q.cashier_id=p_cashier
  AND q.state='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'open shift required' USING ERRCODE='P4001'; END IF;
 PERFORM 1 FROM zhirox_local.local_users u WHERE u.store_id=p_store
  AND u.id=p_cashier AND u.enabled AND u.role='cashier'
  AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'cashier unavailable' USING ERRCODE='P4001'; END IF;
 PERFORM 1 FROM zhirox_local.local_users u WHERE u.store_id=p_store
  AND u.id=p_manager AND u.enabled AND u.role IN('owner','manager')
  AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'manager unavailable' USING ERRCODE='P4001'; END IF;
 PERFORM 1 FROM zhirox_local.receipt_snapshots_v34 s
  WHERE s.store_id=p_store AND s.sale_id=p_sale;
 IF NOT FOUND THEN RAISE EXCEPTION 'verified receipt absent' USING ERRCODE='P4002'; END IF;
 SELECT x.* INTO l FROM zhirox_local.sale_lines x WHERE
  x.store_id=p_store AND x.sale_id=p_sale AND x.line_no=p_line FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'original line not found' USING ERRCODE='P4002'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.cash_refunds_v39 f WHERE
   f.store_id=p_store AND f.sale_id=p_sale AND f.line_no=p_line)
 THEN RAISE EXCEPTION 'original line fully refunded' USING ERRCODE='P4002'; END IF;
 SELECT COALESCE(SUM(r.quantity_base_units),0),COALESCE(SUM(r.refund_minor),0)
 INTO prior_qty,prior_money FROM zhirox_local.partial_cash_refunds_v40 r
 WHERE r.store_id=p_store AND r.sale_id=p_sale AND r.line_no=p_line;
 IF p_base_qty>l.quantity_base_units-prior_qty
 THEN RAISE EXCEPTION 'quantity already refunded' USING ERRCODE='P4002'; END IF;
 money:=floor(l.line_total_minor::numeric*(prior_qty+p_base_qty)/l.quantity_base_units)-prior_money;
 IF money<0 OR money>9999999999999 THEN
  RAISE EXCEPTION 'invalid allocated cash' USING ERRCODE='P4003'; END IF;
 SELECT s.expected_minor INTO STRICT available FROM zhirox_local.cash_summary_v38(
  p_store,p_cashier,p_shift) s;
 IF money>available THEN RAISE EXCEPTION 'not enough cash' USING ERRCODE='P4005'; END IF;
 IF p_restock THEN
  SELECT x.* INTO p FROM zhirox_local.products x WHERE x.store_id=p_store
    AND x.id=l.product_id FOR UPDATE;
  IF NOT FOUND OR p.stock_base_units::numeric+p_base_qty>9223372036854775807
  THEN RAISE EXCEPTION 'stock overflow' USING ERRCODE='22003'; END IF;
 END IF;
 INSERT INTO zhirox_local.partial_cash_refunds_v40
  (store_id,refund_id,sale_id,line_no,cashier_id,manager_id,
   shift_id,product_id,quantity_base_units,refund_minor,restock,reason)
 VALUES(p_store,p_refund,p_sale,p_line,p_cashier,p_manager,
   p_shift,l.product_id,p_base_qty,money::bigint,p_restock,p_reason);
 IF p_restock THEN
  UPDATE zhirox_local.products
   SET stock_base_units=stock_base_units+p_base_qty,version=version+1
   WHERE store_id=p_store AND id=l.product_id;
  INSERT INTO zhirox_local.stock_ledger(store_id,id,product_id,sale_id,delta_base_units)
   VALUES(p_store,gen_random_uuid(),l.product_id,p_sale,p_base_qty);
 END IF;
 INSERT INTO zhirox_local.event_outbox(store_id,event_id,aggregate_id,event_type,payload)
 VALUES(p_store,gen_random_uuid(),p_sale,'sale.line_partially_refunded',
 jsonb_build_object('refund_id',p_refund,'sale_id',p_sale,'line_no',p_line,
  'quantity_base_units',p_base_qty,'amount_minor',money::bigint,
  'restocked',p_restock,'cashier_id',p_cashier,'manager_id',p_manager));
 RETURN QUERY SELECT r.refund_id,r.sale_id,r.line_no,r.quantity_base_units,
 r.refund_minor,r.restock,r.created_at,false FROM zhirox_local.partial_cash_refunds_v40 r
 WHERE r.store_id=p_store AND r.refund_id=p_refund;
END $v40$;

REVOKE ALL ON zhirox_local.partial_cash_refunds_v40 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.guard_v39_after_v40() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.guard_partial_refund_v40() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.refund_partial_line_v40(uuid,uuid,uuid,uuid,uuid,uuid,integer,bigint,boolean,text) FROM PUBLIC;
COMMIT;
