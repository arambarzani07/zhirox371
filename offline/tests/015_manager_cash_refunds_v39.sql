-- V39 disposable PostgreSQL ONLY; every mutation is rolled back.
BEGIN;
DO $test$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000039';
 cashier uuid:='20000000-0000-0000-0000-000000000039';
 worker uuid:='20000000-0000-0000-0000-000000000040';
 manager uuid:='20000000-0000-0000-0000-000000000041';
 product uuid:='30000000-0000-0000-0000-000000000039';
 a uuid:='40000000-0000-0000-0000-000000000039';
 b uuid:='40000000-0000-0000-0000-000000000040';
 request uuid:='50000000-0000-0000-0000-000000000039';
 sale uuid;
 refund uuid:='60000000-0000-0000-0000-000000000039';
 duplicate uuid:='60000000-0000-0000-0000-000000000040';
 movement uuid:='70000000-0000-0000-0000-000000000039';
 r record; denied boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)VALUES(s,'V39 disposable');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,cashier,'v39-first','test-hash','cashier'),
       (s,worker,'v39-return','test-hash','cashier'),
       (s,manager,'v39-manager','test-hash','manager');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,product,'Returnable',1250,5);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',product,1);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,cashier,a,500);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,worker,b,4000);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,request,
  '[{"barcode":"6260053183974","qty":2}]'::jsonb,2500);
 SELECT x.sale_id INTO STRICT sale FROM zhirox_local.commit_checkout_v31(s,cashier,request) x;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=product)<>3
 THEN RAISE EXCEPTION 'original checkout stock wrong'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_full_line_v39(s,worker,cashier,b,refund,sale,1,true,'Good sealed pack');
 EXCEPTION WHEN SQLSTATE 'P3901' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier impersonated manager'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_full_line_v39(s,worker,manager,a,refund,sale,1,true,'Good sealed pack');
 EXCEPTION WHEN SQLSTATE 'P3901' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'refund tied to another cashier shift'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.refund_full_line_v39(s,worker,manager,b,refund,sale,1,true,'Good sealed pack');
 IF r.refund_minor<>2500 OR r.replayed OR NOT r.restock THEN
  RAISE EXCEPTION 'wrong full original refund'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.refund_full_line_v39(s,worker,manager,b,refund,sale,1,true,'Good sealed pack');
 IF NOT r.replayed THEN RAISE EXCEPTION 'refund retry duplicated write'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=product)<>5
   OR (SELECT count(*) FROM zhirox_local.cash_refunds_v39 WHERE store_id=s)<>1
   OR (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s AND delta_base_units>0)<>1
 THEN RAISE EXCEPTION 'inventory/restock repeated'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_full_line_v39(s,worker,manager,b,duplicate,sale,1,false,'Good sealed pack');
 EXCEPTION WHEN SQLSTATE 'P3905' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'duplicate line refunded twice'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_full_line_v39(s,worker,manager,b,refund,sale,1,false,'Good sealed pack');
 EXCEPTION WHEN SQLSTATE 'P3905' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'refund UUID mutated restock option'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.cash_summary_v39(s,worker,b);
 IF r.refund_minor<>2500 OR r.gross_sales_minor<>0 OR r.expected_minor<>1500 THEN
  RAISE EXCEPTION 'refund not deducted from shift cash'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_cash_movement_v38(s,worker,b,movement,'expense',1501,'After cash refund');
 EXCEPTION WHEN SQLSTATE 'P3802' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'post-refund cash overdraw allowed'; END IF;
 denied:=false;
 BEGIN UPDATE zhirox_local.cash_refunds_v39 SET refund_minor=1 WHERE store_id=s AND refund_id=refund;
 EXCEPTION WHEN SQLSTATE 'P3904' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'refund journal changed'; END IF;
 denied:=false;
 BEGIN DELETE FROM zhirox_local.cash_refunds_v39 WHERE store_id=s AND refund_id=refund;
 EXCEPTION WHEN SQLSTATE 'P3904' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'refund journal deleted'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.close_cash_shift_v38(s,worker,b,1400);
 IF r.expected_minor<>1500 OR r.variance_minor<>-100 THEN
  RAISE EXCEPTION 'shift close ignored refund cash'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.refund_full_line_v39(s,worker,manager,b,duplicate,sale,1,true,'Late refund after close');
 EXCEPTION WHEN SQLSTATE 'P3905' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'duplicate after close should be denied'; END IF;
 IF (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s
     AND event_type='sale.line_refunded')<>1
 THEN RAISE EXCEPTION 'refund event was not unique'; END IF;
 RAISE NOTICE 'V39 PASS dual manager role, full-line verified refund, stock, cash, immutable and retry';
END $test$;
ROLLBACK;
