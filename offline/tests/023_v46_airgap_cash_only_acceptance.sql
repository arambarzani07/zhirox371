-- V46 isolated CASH-ONLY rehearsal. No internet, payment processor or cloud
-- connection is required or exercised by this SQL. 100% rolled back.
-- Tests backend accounting, not Windows, printer hardware or power-cut recovery.
BEGIN;
DO $v46$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000046';
 a uuid:='20000000-0000-0000-0000-000000000046';
 b uuid:='20000000-0000-0000-0000-000000000047';
 pa uuid:='30000000-0000-0000-0000-000000000046';
 pb uuid:='30000000-0000-0000-0000-000000000047';
 sh_a uuid:='40000000-0000-0000-0000-000000000046';
 sh_b uuid:='40000000-0000-0000-0000-000000000047';
 req_a uuid:='50000000-0000-0000-0000-000000000046';
 req_b uuid:='50000000-0000-0000-0000-000000000047';
 pending uuid:='50000000-0000-0000-0000-000000000048';
 print_a uuid:='60000000-0000-0000-0000-000000000046';
 print_b uuid:='60000000-0000-0000-0000-000000000047';
 cash_in uuid:='70000000-0000-0000-0000-000000000046';
 cash_out uuid:='70000000-0000-0000-0000-000000000047';
 expense uuid:='70000000-0000-0000-0000-000000000048';
 sale_a uuid; sale_b uuid; first_receipt bigint;
 result record; summary record; denied boolean;
 qa jsonb:='[{"barcode":"6260053183901","qty":2},{"barcode":"6260053183902","qty":1}]'::jsonb;
 qb jsonb:='[{"barcode":"6260053183901","qty":1},{"barcode":"6260053183903","qty":1}]'::jsonb;
BEGIN
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'سوپەرمارکێتی کانی چنار — V46 CI');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,a,'v46-a','CI-TEST-NOT-A-REAL-PASSWORD','cashier'),
       (s,b,'v46-b','CI-TEST-NOT-A-REAL-PASSWORD','cashier');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,pa,'نان — دانە',1250,20),
       (s,pb,'شیر — دانە و کارتۆن',2000,12);
 INSERT INTO zhirox_local.barcodes(
 store_id,code,product_id,quantity_base_units,sale_mode,sale_price_minor)
 VALUES(s,'6260053183901',pa,1,'unit',NULL),
       (s,'6260053183902',pb,3,'carton',5100),
       (s,'6260053183903',pb,1,'unit',NULL);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,a,sh_a,10000);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,b,sh_b,5000);
 -- Cashier A sells 2 units at 1,250 plus a 3-unit carton at 5,100.
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,a,req_a,qa,7600);
 IF EXISTS(SELECT 1 FROM zhirox_local.sales WHERE store_id=s)
 THEN RAISE EXCEPTION 'preparing cash checkout created premature sale'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.commit_checkout_v31(s,a,req_a);
 IF result.replayed OR result.total_minor<>7600
 THEN RAISE EXCEPTION 'cashier A committed an incorrect amount'; END IF;
 sale_a:=result.sale_id; first_receipt:=result.receipt_no;
 -- A lost TCP reply must replay the identical durable receipt, not charge twice.
 SELECT * INTO STRICT result FROM zhirox_local.commit_checkout_v31(s,a,req_a);
 IF NOT result.replayed OR result.sale_id<>sale_a OR
  result.receipt_no<>first_receipt OR result.total_minor<>7600
 THEN RAISE EXCEPTION 'cashier A replay duplicated original sale'; END IF;
 -- Cashier B uses SAME inventory (one loose unit of each), separate shift.
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,b,req_b,qb,3250);
 SELECT * INTO STRICT result FROM zhirox_local.commit_checkout_v31(s,b,req_b);
 IF result.replayed OR result.total_minor<>3250 OR
    result.receipt_no<=first_receipt
 THEN RAISE EXCEPTION 'cashier B sale/receipt order incorrect'; END IF;
 sale_b:=result.sale_id;
 IF (SELECT stock_base_units FROM zhirox_local.products
     WHERE store_id=s AND id=pa)<>17 OR
    (SELECT stock_base_units FROM zhirox_local.products
     WHERE store_id=s AND id=pb)<>8
 THEN RAISE EXCEPTION 'two-cashier carton+unit stock is incorrect'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>2 OR
    (SELECT count(*) FROM zhirox_local.sale_lines sl
      JOIN zhirox_local.sales v ON v.store_id=sl.store_id AND v.id=sl.sale_id
      WHERE sl.store_id=s)<>4
 THEN RAISE EXCEPTION 'sale/sale-line audit does not match'; END IF;
 IF (SELECT count(*) FROM zhirox_local.event_outbox
     WHERE store_id=s AND event_type='sale.completed')<>2
 THEN RAISE EXCEPTION 'local outbox missing a cash sale'; END IF;
 IF (SELECT count(*) FROM zhirox_local.receipt_snapshots_v34
     WHERE store_id=s)<>2 OR
    (SELECT COALESCE(sum(total_minor),0) FROM zhirox_local.receipt_snapshots_v34
     WHERE store_id=s)<>10850
 THEN RAISE EXCEPTION 'immutable server receipt amounts incorrect'; END IF;
 IF (SELECT lines->1->>'sale_mode' FROM zhirox_local.receipt_snapshots_v34
     WHERE store_id=s AND sale_id=sale_a)<>'carton' OR
    (SELECT (lines->1->>'quantity_base_units')::bigint
     FROM zhirox_local.receipt_snapshots_v34
     WHERE store_id=s AND sale_id=sale_a)<>3
 THEN RAISE EXCEPTION 'carton receipt snapshot lost its package breakdown'; END IF;
 -- The printer queue is durable, but a physical thermal printer is NOT tested.
 SELECT * INTO STRICT result FROM zhirox_local.queue_print_v35(
  s,a,sale_a,print_a,80::smallint);
 IF result.state<>'queued' THEN RAISE EXCEPTION '80mm queue not created'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.queue_print_v35(
  s,b,sale_b,print_b,58::smallint);
 IF result.state<>'queued' THEN RAISE EXCEPTION '58mm queue not created'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.queue_print_v35(
  s,a,sale_a,print_a,80::smallint);
 IF result.job_id<>print_a OR
   (SELECT count(*) FROM zhirox_local.print_requests_v35 WHERE store_id=s)<>2 OR
   EXISTS(SELECT 1 FROM zhirox_local.print_requests_v35
      WHERE store_id=s AND state='printed')
 THEN RAISE EXCEPTION 'duplicate/falsely printed queue'; END IF;
 -- Cash-only accounting includes movement journal, without external money.
 PERFORM * FROM zhirox_local.record_cash_movement_v38(
  s,a,sh_a,cash_in,'cash_in',300,'cash in documented');
 PERFORM * FROM zhirox_local.record_cash_movement_v38(
  s,a,sh_a,cash_out,'cash_out',200,'cash out documented');
 PERFORM * FROM zhirox_local.record_cash_movement_v38(
  s,a,sh_a,expense,'expense',100,'store expense documented');
 SELECT * INTO STRICT summary FROM zhirox_local.cash_summary_v38(s,a,sh_a);
 IF summary.cash_sales_minor<>7600 OR summary.expected_minor<>17600 OR
   summary.cash_in_minor<>300 OR summary.cash_out_minor<>200 OR
   summary.expense_minor<>100
 THEN RAISE EXCEPTION 'cashier A drawer mismatch'; END IF;
 -- An unfinished request survives restarts and blocks shift close.
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,a,pending,
  '[{"barcode":"6260053183901","qty":1}]'::jsonb,1250);
 denied:=false;
 BEGIN
   PERFORM * FROM zhirox_local.close_cash_shift_v38(s,a,sh_a,17600);
 EXCEPTION WHEN SQLSTATE 'P3703' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'unresolved pending checkout allowed shift close'; END IF;
 IF zhirox_local.cancel_checkout_v31(s,a,pending)<>'cancelled'
 THEN RAISE EXCEPTION 'unsettled cash intent could not be cancelled safely'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.close_cash_shift_v38(s,a,sh_a,17600);
 IF result.state<>'closed' OR result.expected_minor<>17600 OR
  result.variance_minor<>0
 THEN RAISE EXCEPTION 'cashier A shift close did not reconcile'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.close_cash_shift_v38(s,b,sh_b,8250);
 IF result.state<>'closed' OR result.expected_minor<>8250 OR
   result.variance_minor<>0
 THEN RAISE EXCEPTION 'cashier B shift close did not reconcile'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.tender_plans_v41 WHERE store_id=s) OR
    EXISTS(SELECT 1 FROM zhirox_local.external_settlements_v42 WHERE store_id=s)
 THEN RAISE EXCEPTION 'cash-only rehearsal unexpectedly used external tender'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.financial_integrity_audit_v45(s)
  WHERE case_count>0)
 THEN RAISE EXCEPTION 'cash-only rehearsal generated an unresolved bank audit case'; END IF;
 RAISE NOTICE 'V46 PASS: two local cashiers, exact unit/carton stock, UUID retry, 58/80mm queued, 2 immutable receipts, shifts closed and NO bank';
END $v46$;
ROLLBACK;
