-- V40 disposable PostgreSQL integration; rollback is mandatory.
BEGIN;
DO $test$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000040';
 c uuid:='20000000-0000-0000-0000-000000000040';
 cashier uuid:='20000000-0000-0000-0000-000000000041';
 manager uuid:='20000000-0000-0000-0000-000000000042';
 product uuid:='30000000-0000-0000-0000-000000000040';
 buyshift uuid:='40000000-0000-0000-0000-000000000040';
 refundshift uuid:='40000000-0000-0000-0000-000000000041';
 req uuid:='50000000-0000-0000-0000-000000000040';
 sale uuid;
 r1 uuid:='60000000-0000-0000-0000-000000000040';
 r2 uuid:='60000000-0000-0000-0000-000000000041';
 r3 uuid:='60000000-0000-0000-0000-000000000042';
 r4 uuid:='60000000-0000-0000-0000-000000000043';
 mv uuid:='70000000-0000-0000-0000-000000000040';
 result record; denied boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)VALUES(s,'V40 throwaway');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,c,'v40-buyer','test-hash','cashier'),
 (s,cashier,'v40-return','test-hash','cashier'),
 (s,manager,'v40-manager','test-hash','manager');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,product,'3 pack / 100 IQD',35,10);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units,sale_mode,sale_price_minor)
 VALUES(s,'6260053183943',product,3,'carton',100);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c,buyshift,0);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,cashier,refundshift,500);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,req,
  '[{"barcode":"6260053183943","qty":1}]'::jsonb,100);
 SELECT x.sale_id INTO STRICT sale FROM zhirox_local.commit_checkout_v31(s,c,req) x;
 IF (SELECT stock_base_units FROM zhirox_local.products
  WHERE store_id=s AND id=product)<>7 THEN
   RAISE EXCEPTION 'carton stock was not decremented by 3'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_partial_line_v40(s,cashier,c,refundshift,r1,sale,1,1,true,'Good unit');
 EXCEPTION WHEN SQLSTATE 'P4001' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier falsely approved manager'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.refund_partial_line_v40(
  s,cashier,manager,refundshift,r1,sale,1,1,true,'Good unit');
 IF result.refund_minor<>33 OR result.quantity_base_units<>1 OR result.replayed
 THEN RAISE EXCEPTION 'first 1/3 did not produce 33 IQD'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.refund_partial_line_v40(
  s,cashier,manager,refundshift,r1,sale,1,1,true,'Good unit');
 IF NOT result.replayed OR result.refund_minor<>33
 THEN RAISE EXCEPTION 'idempotent exact same UUID retry failed'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.refund_partial_line_v40(
  s,cashier,manager,refundshift,r2,sale,1,1,true,'Second good unit');
 IF result.refund_minor<>33 THEN RAISE EXCEPTION 'second 1/3 not 33'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_full_line_v39(
  s,cashier,manager,refundshift,r4,sale,1,false,'Cannot full refund after partial');
 EXCEPTION WHEN SQLSTATE 'P4002' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'full V39 refund after partial allowed'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_partial_line_v40(
  s,cashier,manager,refundshift,r3,sale,1,2,false,'Over remaining quantity');
 EXCEPTION WHEN SQLSTATE 'P4002' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'overrefunded sold carton quantity'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.refund_partial_line_v40(
  s,cashier,manager,refundshift,r3,sale,1,1,false,'Last damaged unit');
 IF result.refund_minor<>34 THEN RAISE EXCEPTION 'last remainder not 34 IQD'; END IF;
 IF (SELECT COALESCE(SUM(refund_minor),0) FROM zhirox_local.partial_cash_refunds_v40
   WHERE store_id=s AND sale_id=sale)<>100
   OR (SELECT COALESCE(SUM(quantity_base_units),0) FROM zhirox_local.partial_cash_refunds_v40
   WHERE store_id=s AND sale_id=sale)<>3
 THEN RAISE EXCEPTION 'cumulative total/quantity is not exact'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products
   WHERE store_id=s AND id=product)<>9
 THEN RAISE EXCEPTION 'damaged unit was incorrectly restocked'; END IF;
 IF (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s
    AND delta_base_units=1)<>2
 THEN RAISE EXCEPTION 'replayed restock duplicated ledger entry'; END IF;
 IF (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s
    AND event_type='sale.line_partially_refunded')<>3
 THEN RAISE EXCEPTION 'partial refund event count incorrect'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_partial_line_v40(
  s,cashier,manager,refundshift,r4,sale,1,1,false,'Already fully returned');
 EXCEPTION WHEN SQLSTATE 'P4002' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'fourth unit refunded'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_partial_line_v40(
  s,cashier,manager,refundshift,r1,sale,1,1,false,'Good unit');
 EXCEPTION WHEN SQLSTATE 'P4006' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'refund retry changed restock'; END IF;
 denied:=false;
 BEGIN UPDATE zhirox_local.partial_cash_refunds_v40
 SET quantity_base_units=2 WHERE store_id=s AND refund_id=r2;
 EXCEPTION WHEN SQLSTATE 'P4004' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'partial refund journal update allowed'; END IF;
 denied:=false;
 BEGIN DELETE FROM zhirox_local.partial_cash_refunds_v40
 WHERE store_id=s AND refund_id=r2;
 EXCEPTION WHEN SQLSTATE 'P4004' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'partial refund journal delete allowed'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.cash_summary_v39(s,cashier,refundshift);
 IF result.refund_minor<>100 OR result.expected_minor<>400 THEN
  RAISE EXCEPTION 'V39 summary did not include V40 partial returns'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_cash_movement_v38(
  s,cashier,refundshift,mv,'cash_out',401,'After partial cash refund');
 EXCEPTION WHEN SQLSTATE 'P3802' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'V38 cash movement overdrew post-V40 balance'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.close_cash_shift_v38(
  s,cashier,refundshift,399);
 IF result.expected_minor<>400 OR result.variance_minor<>-1
 THEN RAISE EXCEPTION 'V40 partial cash close mismatch'; END IF;
 RAISE NOTICE 'V40 PASS 3 x carton part return = 33+33+34, exact stock, locked cash and manager separation';
END $test$;
ROLLBACK;
