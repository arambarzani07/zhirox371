-- V41 disposable PostgreSQL integration: NO external settlement provider exists.
BEGIN;
DO $test$
DECLARE
 store uuid:='10000000-0000-0000-0000-000000000041';
 cashier uuid:='20000000-0000-0000-0000-000000000041';
 product uuid:='30000000-0000-0000-0000-000000000041';
 shift uuid:='40000000-0000-0000-0000-000000000041';
 mixed uuid:='50000000-0000-0000-0000-000000000041';
 cash_request uuid:='50000000-0000-0000-0000-000000000042';
 sale_record record;quote record;denied boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)VALUES(store,'V41 disposable');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(store,cashier,'v41-cashier','test-hash','cashier');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(store,product,'V41 test product',1250,10);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(store,'6260053183974',product,1);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(store,cashier,shift,1000);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(store,cashier,mixed,
 '[{"barcode":"6260053183974","qty":2}]'::jsonb,2500);
 SELECT * INTO STRICT quote FROM zhirox_local.plan_tender_v41(
   store,cashier,mixed,1000,1500,'card');
 IF quote.state<>'external_unverified' OR quote.replayed THEN
  RAISE EXCEPTION 'mixed plan incorrectly recorded as verified'; END IF;
 SELECT * INTO STRICT quote FROM zhirox_local.plan_tender_v41(
   store,cashier,mixed,1000,1500,'card');
 IF NOT quote.replayed THEN
  RAISE EXCEPTION 'same allocation retry was not idempotent'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.plan_tender_v41(
   store,cashier,mixed,1500,1000,'card');
 EXCEPTION WHEN SQLSTATE 'P4103' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable bank amount was changed'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.commit_checkout_v31(store,cashier,mixed);
 EXCEPTION WHEN SQLSTATE 'P4101' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'BANK UNVERIFIED nevertheless completed SALE'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=store AND id=product)<>10
  OR EXISTS(SELECT 1 FROM zhirox_local.sales WHERE store_id=store)
  OR EXISTS(SELECT 1 FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=store)
  OR (SELECT state FROM zhirox_local.checkout_intents_v31
    WHERE store_id=store AND request_id=mixed)<>'prepared'
 THEN RAISE EXCEPTION 'unverified bank draft wrote inventory, receipt or cash sale'; END IF;
 denied:=false;
 BEGIN UPDATE zhirox_local.tender_plans_v41
  SET external_minor=0 WHERE store_id=store AND request_id=mixed;
 EXCEPTION WHEN SQLSTATE 'P4103' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'external plan overwritten to fake cash'; END IF;
 denied:=false;
 BEGIN DELETE FROM zhirox_local.tender_plans_v41
  WHERE store_id=store AND request_id=mixed;
 EXCEPTION WHEN SQLSTATE 'P4103' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'pending bank plan deleted'; END IF;
 IF zhirox_local.cancel_checkout_v31(store,cashier,mixed)<>'cancelled'
 THEN RAISE EXCEPTION 'abandoned bank quote not safely cancelled'; END IF;
 -- Pure cash quote is permitted; it is STILL checked by V31's immutable
 -- server-side prices, stock, shift and atomic V26 commit.
 PERFORM * FROM zhirox_local.prepare_checkout_v31(store,cashier,cash_request,
 '[{"barcode":"6260053183974","qty":2}]'::jsonb,2500);
 SELECT * INTO STRICT quote FROM zhirox_local.plan_tender_v41(
 store,cashier,cash_request,2500,0,'none');
 IF quote.state<>'cash_ready' OR quote.replayed THEN
  RAISE EXCEPTION 'cash quote improperly marked pending'; END IF;
 SELECT * INTO STRICT sale_record FROM zhirox_local.commit_checkout_v31(
 store,cashier,cash_request);
 IF sale_record.total_minor<>2500 OR sale_record.replayed
 THEN RAISE EXCEPTION 'cash-only sale was blocked'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=store AND id=product)<>8
  OR (SELECT cash_sales_minor FROM zhirox_local.cash_summary_v38(store,cashier,shift))<>2500
  OR (SELECT expected_minor FROM zhirox_local.cash_summary_v38(store,cashier,shift))<>3500
  OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=store)<>1
 THEN RAISE EXCEPTION 'cash stock/shifts were not reconciled'; END IF;
 SELECT * INTO STRICT sale_record FROM zhirox_local.commit_checkout_v31(
 store,cashier,cash_request);
 IF NOT sale_record.replayed THEN RAISE EXCEPTION 'cash replay duplicated sale'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.plan_tender_v41(
 store,cashier,cash_request,1000,1500,'bank_transfer');
 EXCEPTION WHEN SQLSTATE 'P4103' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'committed cash sale relabelled as bank'; END IF;
 RAISE NOTICE 'V41 PASS: mixed pending cannot commit; cash-only and idempotence remain valid';
END $test$;
ROLLBACK;
