-- V39 isolated, disposable PostgreSQL ONLY. Cash-only FULL-LINE refunds.
-- Requires V38. No live store, cloud or legacy database migration permitted.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.cash_refunds_v39(
 store_id uuid NOT NULL,
 refund_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 line_no integer NOT NULL CHECK(line_no>0),
 cashier_id uuid NOT NULL,
 manager_id uuid NOT NULL CHECK(manager_id<>cashier_id),
 shift_id uuid NOT NULL,
 product_id uuid NOT NULL,
 base_units bigint NOT NULL CHECK(base_units>0),
 refund_minor bigint NOT NULL CHECK(refund_minor>0 AND refund_minor<=9999999999999),
 restock boolean NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 240),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,refund_id),
 UNIQUE(store_id,sale_id,line_no),
 FOREIGN KEY(store_id,sale_id,line_no) REFERENCES zhirox_local.sale_lines(store_id,sale_id,line_no),
 FOREIGN KEY(store_id,shift_id) REFERENCES zhirox_local.cash_shifts_v37(store_id,shift_id),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE INDEX IF NOT EXISTS v39_cashier_refund_idx
 ON zhirox_local.cash_refunds_v39(store_id,shift_id,created_at);

CREATE OR REPLACE FUNCTION zhirox_local.guard_cash_refund_v39()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v39$
DECLARE q record; l record; m record; v_avail bigint;
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'refund journal is immutable' USING ERRCODE='P3904'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=NEW.store_id FOR UPDATE;
 SELECT * INTO q FROM zhirox_local.cash_shifts_v37
 WHERE store_id=NEW.store_id AND shift_id=NEW.shift_id FOR UPDATE;
 IF NOT FOUND OR q.state<>'open' OR q.cashier_id<>NEW.cashier_id THEN
  RAISE EXCEPTION 'refund cashier shift unavailable' USING ERRCODE='P3901'; END IF;
 SELECT u.id INTO m FROM zhirox_local.local_users u
 WHERE u.store_id=NEW.store_id AND u.id=NEW.manager_id AND u.enabled
  AND u.role IN ('owner','manager') AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'manager approval missing' USING ERRCODE='P3901'; END IF;
 SELECT s.product_id,s.quantity_base_units,s.line_total_minor INTO l
 FROM zhirox_local.sale_lines s WHERE s.store_id=NEW.store_id
  AND s.sale_id=NEW.sale_id AND s.line_no=NEW.line_no;
 IF NOT FOUND OR l.product_id<>NEW.product_id OR l.quantity_base_units<>NEW.base_units
  OR l.line_total_minor<>NEW.refund_minor THEN
  RAISE EXCEPTION 'refund must match full original line' USING ERRCODE='P3902'; END IF;
 -- V38 cash summary has been upgraded below to include existing refunds.
 SELECT v.expected_minor INTO v_avail FROM zhirox_local.cash_summary_v38(
 NEW.store_id,NEW.cashier_id,NEW.shift_id) v;
 IF v_avail<NEW.refund_minor THEN
  RAISE EXCEPTION 'insufficient cash to refund' USING ERRCODE='P3903'; END IF;
 RETURN NEW;
END $v39$;
DROP TRIGGER IF EXISTS v39_protect_refunds ON zhirox_local.cash_refunds_v39;
CREATE TRIGGER v39_protect_refunds BEFORE INSERT OR UPDATE OR DELETE
 ON zhirox_local.cash_refunds_v39 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.guard_cash_refund_v39();

-- Upgrade the existing V38 financial formula without changing its public
-- column signature. V38 close and V38 cash-out guard must see refund outflows.
CREATE OR REPLACE FUNCTION zhirox_local.cash_summary_v38(
 p_store uuid,p_cashier uuid,p_shift uuid
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,
 cash_sales_minor bigint,cash_in_minor bigint,cash_out_minor bigint,
 expense_minor bigint,expected_minor bigint,counted_minor bigint,
 variance_minor bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v39$
DECLARE v_shift zhirox_local.cash_shifts_v37%ROWTYPE;
 v_sales numeric;v_in numeric;v_out numeric;v_expense numeric;v_refunds numeric;v_total numeric;
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
 SELECT COALESCE(SUM(r.refund_minor),0) INTO v_refunds
 FROM zhirox_local.cash_refunds_v39 r
 WHERE r.store_id=p_store AND r.cashier_id=p_cashier AND r.shift_id=p_shift;
 v_total:=v_shift.opening_minor::numeric+v_sales+v_in-v_out-v_expense-v_refunds;
 IF v_total<0 OR v_total>9999999999999 OR v_sales>9999999999999
  OR v_in>9999999999999 OR v_out>9999999999999 OR v_expense>9999999999999
  OR v_refunds>9999999999999
 THEN RAISE EXCEPTION 'cash total outside bounds' USING ERRCODE='22003'; END IF;
 RETURN QUERY SELECT v_shift.shift_id,v_shift.state,v_shift.opening_minor,
 v_sales::bigint,v_in::bigint,v_out::bigint,v_expense::bigint,v_total::bigint,
 v_shift.counted_minor,v_shift.variance_minor;
END $v39$;

CREATE OR REPLACE FUNCTION zhirox_local.cash_summary_v39(
 p_store uuid,p_cashier uuid,p_shift uuid
) RETURNS TABLE(shift_id uuid,state text,opening_minor bigint,
 gross_sales_minor bigint,refund_minor bigint,cash_in_minor bigint,
 cash_out_minor bigint,expense_minor bigint,expected_minor bigint,
 counted_minor bigint,variance_minor bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v39$
 SELECT s.shift_id,s.state,s.opening_minor,s.cash_sales_minor,
 COALESCE((SELECT sum(r.refund_minor)::bigint FROM zhirox_local.cash_refunds_v39 r
 WHERE r.store_id=p_store AND r.cashier_id=p_cashier AND r.shift_id=p_shift),0),
 s.cash_in_minor,s.cash_out_minor,s.expense_minor,s.expected_minor,
 s.counted_minor,s.variance_minor
 FROM zhirox_local.cash_summary_v38(p_store,p_cashier,p_shift) s
$v39$;

-- Refuse a cash-out/expense that would overdraft after prior refunds.
-- Existing V38 trigger separately checks the original V38 cash guard.
CREATE OR REPLACE FUNCTION zhirox_local.after_movement_balance_v39()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v39$
DECLARE v_result record;
BEGIN
 SELECT * INTO STRICT v_result FROM zhirox_local.cash_summary_v39(
   NEW.store_id,NEW.cashier_id,NEW.shift_id);
 IF v_result.expected_minor<0 THEN
  RAISE EXCEPTION 'insufficient available cash after refund' USING ERRCODE='P3903'; END IF;
 RETURN NEW;
END $v39$;
-- Because cash_summary_v38 rejects negative numbers, the trigger catches
-- numeric overflow/negative there too; guard also runs on append-only inserts.
DROP TRIGGER IF EXISTS v39_after_cash_movement ON zhirox_local.cash_movements_v38;
CREATE TRIGGER v39_after_cash_movement AFTER INSERT ON zhirox_local.cash_movements_v38
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.after_movement_balance_v39();

CREATE OR REPLACE FUNCTION zhirox_local.refund_full_line_v39(
 p_store uuid,p_cashier uuid,p_manager uuid,p_shift uuid,
 p_refund uuid,p_sale uuid,p_line integer,p_restock boolean,p_reason text
) RETURNS TABLE(refund_id uuid,sale_id uuid,line_no integer,
 refund_minor bigint,restock boolean,created_at timestamptz,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v39$
DECLARE old zhirox_local.cash_refunds_v39%ROWTYPE; line_row zhirox_local.sale_lines%ROWTYPE;
 v_shift zhirox_local.cash_shifts_v37%ROWTYPE; v_product zhirox_local.products%ROWTYPE;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_manager IS NULL OR p_cashier=p_manager
  OR p_shift IS NULL OR p_refund IS NULL OR p_sale IS NULL
  OR p_line IS NULL OR p_line<1 OR p_restock IS NULL
  OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 240
  OR p_reason<>btrim(p_reason)
 THEN RAISE EXCEPTION 'invalid refund request' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='P3901'; END IF;
 SELECT * INTO old FROM zhirox_local.cash_refunds_v39 r
  WHERE r.store_id=p_store AND (r.refund_id=p_refund
   OR (r.sale_id=p_sale AND r.line_no=p_line)) FOR UPDATE;
 IF FOUND THEN
  IF old.refund_id<>p_refund OR old.sale_id<>p_sale OR old.line_no<>p_line
    OR old.cashier_id<>p_cashier OR old.manager_id<>p_manager OR old.shift_id<>p_shift
    OR old.restock<>p_restock OR old.reason<>p_reason THEN
    RAISE EXCEPTION 'duplicate or conflicting refund' USING ERRCODE='P3905'; END IF;
  RETURN QUERY SELECT old.refund_id,old.sale_id,old.line_no,old.refund_minor,
   old.restock,old.created_at,true;
  RETURN;
 END IF;
 SELECT q.* INTO v_shift FROM zhirox_local.cash_shifts_v37 q
  WHERE q.store_id=p_store AND q.shift_id=p_shift AND q.cashier_id=p_cashier
   AND q.state='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'open refund cashier shift required' USING ERRCODE='P3901'; END IF;
 PERFORM 1 FROM zhirox_local.local_users u
 WHERE u.store_id=p_store AND u.id=p_cashier AND u.enabled
 AND u.role IN('owner','manager','cashier')
 AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'cashier disabled' USING ERRCODE='P3901'; END IF;
 PERFORM 1 FROM zhirox_local.local_users u
 WHERE u.store_id=p_store AND u.id=p_manager AND u.enabled
 AND u.role IN('owner','manager')
 AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'manager approval absent' USING ERRCODE='P3901'; END IF;
 PERFORM 1 FROM zhirox_local.receipt_snapshots_v34 r
 WHERE r.store_id=p_store AND r.sale_id=p_sale;
 IF NOT FOUND THEN RAISE EXCEPTION 'verified cash sale missing' USING ERRCODE='P3902'; END IF;
 SELECT * INTO line_row FROM zhirox_local.sale_lines l
  WHERE l.store_id=p_store AND l.sale_id=p_sale AND l.line_no=p_line FOR UPDATE;
 IF NOT FOUND OR line_row.line_total_minor<=0 THEN
  RAISE EXCEPTION 'nonrefundable line' USING ERRCODE='P3902'; END IF;
 IF p_restock THEN
  SELECT * INTO v_product FROM zhirox_local.products p
   WHERE p.store_id=p_store AND p.id=line_row.product_id FOR UPDATE;
  IF NOT FOUND OR v_product.stock_base_units::numeric+line_row.quantity_base_units>9223372036854775807
  THEN RAISE EXCEPTION 'restock overflow or product absent' USING ERRCODE='22003'; END IF;
 END IF;
 INSERT INTO zhirox_local.cash_refunds_v39
 (store_id,refund_id,sale_id,line_no,cashier_id,manager_id,shift_id,
  product_id,base_units,refund_minor,restock,reason)
 VALUES(p_store,p_refund,p_sale,p_line,p_cashier,p_manager,p_shift,line_row.product_id,
  line_row.quantity_base_units,line_row.line_total_minor,p_restock,p_reason);
 IF p_restock THEN
  UPDATE zhirox_local.products SET
   stock_base_units=stock_base_units+line_row.quantity_base_units,version=version+1
  WHERE store_id=p_store AND id=line_row.product_id;
  INSERT INTO zhirox_local.stock_ledger(store_id,id,product_id,sale_id,delta_base_units)
  VALUES(p_store,gen_random_uuid(),line_row.product_id,p_sale,line_row.quantity_base_units);
 END IF;
 INSERT INTO zhirox_local.event_outbox(store_id,event_id,aggregate_id,event_type,payload)
 VALUES(p_store,gen_random_uuid(),p_sale,'sale.line_refunded',
 jsonb_build_object('refund_id',p_refund,'sale_id',p_sale,'line_no',p_line,
  'amount_minor',line_row.line_total_minor,'restocked',p_restock,
  'cashier_id',p_cashier,'manager_id',p_manager));
 RETURN QUERY SELECT r.refund_id,r.sale_id,r.line_no,r.refund_minor,
  r.restock,r.created_at,false FROM zhirox_local.cash_refunds_v39 r
  WHERE r.store_id=p_store AND r.refund_id=p_refund;
END $v39$;

REVOKE ALL ON zhirox_local.cash_refunds_v39 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.guard_cash_refund_v39() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.cash_summary_v39(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.after_movement_balance_v39() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.refund_full_line_v39(uuid,uuid,uuid,uuid,uuid,uuid,integer,boolean,text) FROM PUBLIC;
COMMIT;
