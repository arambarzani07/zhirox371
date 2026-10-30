-- V38 disposable PostgreSQL integration. Roll back EVERYTHING.
BEGIN;
DO $test$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000038';
 cashier uuid:='20000000-0000-0000-0000-000000000038';
 other uuid:='20000000-0000-0000-0000-000000000039';
 p uuid:='30000000-0000-0000-0000-000000000038';
 sh uuid:='40000000-0000-0000-0000-000000000038';
 other_sh uuid:='40000000-0000-0000-0000-000000000039';
 sale_req uuid:='50000000-0000-0000-0000-000000000038';
 a uuid:='60000000-0000-0000-0000-000000000038';
 b uuid:='60000000-0000-0000-0000-000000000039';
 c uuid:='60000000-0000-0000-0000-000000000040';
 d uuid:='60000000-0000-0000-0000-000000000041';
 denied boolean;
 r record;
BEGIN
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'V38 throwaway');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,cashier,'v38-cashier','test-hash','cashier'),
       (s,other,'v38-other','test-hash','cashier');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'V38 sale',1250,30);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',p,1);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,cashier,sh,10000);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,other,other_sh,6000);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,sale_req,
  '[{"barcode":"6260053183974","qty":2}]'::jsonb,2500);
 PERFORM * FROM zhirox_local.commit_checkout_v31(s,cashier,sale_req);
 SELECT * INTO STRICT r FROM zhirox_local.cash_summary_v38(s,cashier,sh);
 IF r.expected_minor<>12500 OR r.cash_sales_minor<>2500 THEN
  RAISE EXCEPTION 'base cash summary wrong'; END IF;
 PERFORM * FROM zhirox_local.record_cash_movement_v38(s,cashier,sh,a,'cash_in',2000,'بڕی زیادکراو');
 PERFORM * FROM zhirox_local.record_cash_movement_v38(s,cashier,sh,a,'cash_in',2000,'بڕی زیادکراو');
 PERFORM * FROM zhirox_local.record_cash_movement_v38(s,cashier,sh,b,'expense',1000,'کڕینی کاغەز');
 PERFORM * FROM zhirox_local.record_cash_movement_v38(s,cashier,sh,c,'cash_out',500,'گواستنەوەی پارە');
 SELECT * INTO STRICT r FROM zhirox_local.cash_summary_v38(s,cashier,sh);
 IF r.opening_minor<>10000 OR r.cash_sales_minor<>2500 OR
    r.cash_in_minor<>2000 OR r.cash_out_minor<>500 OR r.expense_minor<>1000 OR
    r.expected_minor<>13000
 THEN RAISE EXCEPTION 'V38 cash formula wrong'; END IF;
 IF (SELECT count(*) FROM zhirox_local.cash_movements_v38 WHERE store_id=s)<>3
 THEN RAISE EXCEPTION 'idempotent retry duplicated ledger entry'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_cash_movement_v38(s,cashier,sh,a,'cash_in',3000,'بڕی زیادکراو');
 EXCEPTION WHEN SQLSTATE 'P3803' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'same UUID with altered amount allowed'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_cash_movement_v38(s,other,sh,d,'cash_out',100,'بەکارهێنەری تر');
 EXCEPTION WHEN SQLSTATE 'P3801' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'other cashier movement allowed'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_cash_movement_v38(s,cashier,sh,d,'expense',14000,'خەرجی زیاد');
 EXCEPTION WHEN SQLSTATE 'P3802' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'overdraw allowed'; END IF;
 denied:=false;
 BEGIN UPDATE zhirox_local.cash_movements_v38 SET amount_minor=3 WHERE store_id=s AND entry_id=b;
 EXCEPTION WHEN SQLSTATE 'P3804' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'ledger update allowed'; END IF;
 denied:=false;
 BEGIN DELETE FROM zhirox_local.cash_movements_v38 WHERE store_id=s AND entry_id=c;
 EXCEPTION WHEN SQLSTATE 'P3804' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'ledger delete allowed'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.close_cash_shift_v37(s,cashier,sh,12800);
 EXCEPTION WHEN SQLSTATE 'P3805' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'legacy V37 close ignored cash movements'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.close_cash_shift_v38(s,cashier,sh,12800);
 IF r.state<>'closed' OR r.expected_minor<>13000 OR
   r.counted_minor<>12800 OR r.variance_minor<>-200 OR
   r.cash_in_minor<>2000 OR r.cash_out_minor<>500 OR r.expense_minor<>1000
 THEN RAISE EXCEPTION 'V38 close calculation/variance mismatch'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.close_cash_shift_v38(s,cashier,sh,12800);
 IF r.variance_minor<>-200 THEN RAISE EXCEPTION 'closing retry drift'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.close_cash_shift_v38(s,cashier,sh,13000);
 EXCEPTION WHEN SQLSTATE 'P3803' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'closed cash altered'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_cash_movement_v38(s,cashier,sh,d,'cash_in',100,'دوای داخستن');
 EXCEPTION WHEN SQLSTATE 'P3801' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'movement added after close'; END IF;
 -- Second cashier totals remain untouched, even while sharing a store.
 SELECT * INTO STRICT r FROM zhirox_local.cash_summary_v38(s,other,other_sh);
 IF r.expected_minor<>6000 OR r.cash_sales_minor<>0 OR r.expense_minor<>0
 THEN RAISE EXCEPTION 'cross-cashier cash contamination'; END IF;
 RAISE NOTICE 'V38 PASS append-only/replay/cross-cashier/overdraw/closed cash reconciliation';
END $test$;
ROLLBACK;
