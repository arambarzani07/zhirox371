-- V110 isolated V34/V40 manager cash-refund acceptance for fixed bundle and set.
-- All data rolled back. This DOES NOT authorize live refunds.
BEGIN;
DO $test$
DECLARE
 s uuid:='11000000-0000-4000-8000-000000000610';
 p uuid:='11000000-0000-4000-8000-000000000611';
 buying_cashier uuid:='11000000-0000-4000-8000-000000000612';
 returns_cashier uuid:='11000000-0000-4000-8000-000000000613';
 manager uuid:='11000000-0000-4000-8000-000000000614';
 buying_shift uuid:='11000000-0000-4000-8000-000000000615';
 returns_shift uuid:='11000000-0000-4000-8000-000000000616';
 request uuid:='11000000-0000-4000-8000-000000000617';
 bundle_refund uuid:='11000000-0000-4000-8000-000000000618';
 set_return1 uuid:='11000000-0000-4000-8000-000000000619';
 set_return2 uuid:='11000000-0000-4000-8000-000000000620';
 set_return3 uuid:='11000000-0000-4000-8000-000000000621';
 replay_result record; refund_result record; sale uuid; has_error boolean;
BEGIN
 IF current_database()<>'zhirox_v110_packs_disposable'
 THEN RAISE EXCEPTION 'V110 disposable DB required'; END IF;
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'V110 refundable fixed-packs test');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,buying_cashier,'v110-pay','test-hash','cashier'),
 (s,returns_cashier,'v110-return','test-hash','cashier'),
 (s,manager,'v110-manager','test-hash','manager');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units,base_unit)
 VALUES(s,p,'ئاوی تاقیکردنەوە',500,30,'unit');
 INSERT INTO zhirox_local.barcodes
  (store_id,code,product_id,quantity_base_units,sale_mode,sale_price_minor,display_name)
 VALUES(s,'BUNDLE-610',p,6,'bundle',2700,'دەستەی ئاو'),
       (s,'SET-610',p,3,'set',1400,'سێتی ئاو');
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,buying_cashier,buying_shift,0);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,returns_cashier,returns_shift,10000);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,buying_cashier,request,
  '[{"barcode":"BUNDLE-610","qty":1},{"barcode":"SET-610","qty":1}]'::jsonb,4100);
 SELECT x.sale_id INTO STRICT sale FROM zhirox_local.commit_checkout_v31(s,buying_cashier,request) x;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>21
 OR (SELECT total_minor FROM zhirox_local.receipt_snapshots_v34
     WHERE store_id=s AND sale_id=sale)<>4100
 OR (SELECT lines->0->>'sale_mode' FROM zhirox_local.receipt_snapshots_v34
     WHERE store_id=s AND sale_id=sale)<>'bundle'
 OR (SELECT lines->1->>'sale_mode' FROM zhirox_local.receipt_snapshots_v34
     WHERE store_id=s AND sale_id=sale)<>'set'
 THEN RAISE EXCEPTION 'pack receipt or stock not durable'; END IF;

 has_error:=false;
 BEGIN
  PERFORM * FROM zhirox_local.refund_full_line_v39(
   s,returns_cashier,buying_cashier,returns_shift,bundle_refund,sale,1,true,'Sealed bundle returned');
 EXCEPTION WHEN SQLSTATE 'P3901' THEN has_error:=true; END;
 IF NOT has_error THEN RAISE EXCEPTION 'unapproved cashier returned bundle'; END IF;
 SELECT * INTO STRICT refund_result FROM zhirox_local.refund_full_line_v39(
  s,returns_cashier,manager,returns_shift,bundle_refund,sale,1,true,'Sealed bundle returned');
 IF refund_result.refund_minor<>2700 OR refund_result.replayed
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>27
 THEN RAISE EXCEPTION 'bundle refund did not return 6 pieces at pack price'; END IF;
 SELECT * INTO STRICT replay_result FROM zhirox_local.refund_full_line_v39(
  s,returns_cashier,manager,returns_shift,bundle_refund,sale,1,true,'Sealed bundle returned');
 IF NOT replay_result.replayed THEN RAISE EXCEPTION 'bundle refund replay duplicated'; END IF;
 has_error:=false;
 BEGIN
  PERFORM * FROM zhirox_local.refund_full_line_v39(
   s,returns_cashier,manager,returns_shift,set_return3,sale,1,false,'Repeat bundle refund');
 EXCEPTION WHEN SQLSTATE 'P3905' THEN has_error:=true; END;
 IF NOT has_error THEN RAISE EXCEPTION 'same bundle line refunded twice'; END IF;

 -- Three base-unit fractions of one 3-unit set; cumulative FLOOR ensures
 -- exact price reconciliation: 466 + 467 + 467 IQD = 1400 IQD.
 SELECT * INTO STRICT refund_result FROM zhirox_local.refund_partial_line_v40(
  s,returns_cashier,manager,returns_shift,set_return1,sale,2,1,true,'One set piece returned');
 IF refund_result.refund_minor<>466 THEN RAISE EXCEPTION 'fractional set refund #1 wrong'; END IF;
 SELECT * INTO STRICT refund_result FROM zhirox_local.refund_partial_line_v40(
  s,returns_cashier,manager,returns_shift,set_return2,sale,2,1,false,'Damaged set piece');
 IF refund_result.refund_minor<>467 THEN RAISE EXCEPTION 'fractional set refund #2 wrong'; END IF;
 SELECT * INTO STRICT refund_result FROM zhirox_local.refund_partial_line_v40(
  s,returns_cashier,manager,returns_shift,set_return3,sale,2,1,true,'Last set piece returned');
 IF refund_result.refund_minor<>467 THEN RAISE EXCEPTION 'fractional set refund #3 wrong'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>29
 OR (SELECT COALESCE(SUM(refund_minor),0) FROM zhirox_local.partial_cash_refunds_v40
   WHERE store_id=s AND sale_id=sale)<>1400
 OR (SELECT count(*) FROM zhirox_local.stock_ledger
     WHERE store_id=s AND delta_base_units>0)<>3
 OR (SELECT refund_minor FROM zhirox_local.cash_summary_v39(s,returns_cashier,returns_shift))<>4100
 OR (SELECT expected_minor FROM zhirox_local.cash_summary_v39(s,returns_cashier,returns_shift))<>5900
 THEN RAISE EXCEPTION 'set partial refund accounting, cash or stock mismatch'; END IF;
 has_error:=false;
 BEGIN
  PERFORM * FROM zhirox_local.refund_partial_line_v40(
   s,returns_cashier,manager,returns_shift,set_return3,sale,2,1,false,'Overreturn');
 EXCEPTION WHEN SQLSTATE 'P4006' THEN has_error:=true; END;
 IF NOT has_error THEN RAISE EXCEPTION 'set refund UUID reused with modified payload'; END IF;
 RAISE NOTICE 'V110 PASS: full bundle refund and proportional set refunds, cash, stock, no replay';
END $test$;
ROLLBACK;
