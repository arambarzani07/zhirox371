-- V37 integration in disposable CI PostgreSQL only. Every mutation rolls back.
BEGIN;
DO $test$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000037';
 c uuid:='20000000-0000-0000-0000-000000000037';
 d uuid:='20000000-0000-0000-0000-000000000038';
 p uuid:='30000000-0000-0000-0000-000000000037';
 shift_a uuid:='40000000-0000-0000-0000-000000000037';
 shift_b uuid:='40000000-0000-0000-0000-000000000038';
 req uuid:='50000000-0000-0000-0000-000000000037';
 pending uuid:='50000000-0000-0000-0000-000000000038';
 req_b uuid:='50000000-0000-0000-0000-000000000039';
 after_close uuid:='50000000-0000-0000-0000-000000000040';
 q jsonb:='[{"barcode":"6260053183974","qty":2}]'::jsonb;
 result record;
 closed record;
 denied boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)VALUES(s,'V37 disposable');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,c,'cashier-v37-a','test-hash-placeholder','cashier'),
       (s,d,'cashier-v37-b','test-hash-placeholder','cashier');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'V37 test unit',1250,30);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',p,1);
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,req,q,2500);
 EXCEPTION WHEN SQLSTATE 'P3701' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'prepare without open shift accepted'; END IF;
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c,shift_a,10000);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c,shift_a,10000);
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c,shift_b,10000);
 EXCEPTION WHEN SQLSTATE 'P3702' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'overlapping cashier shifts accepted'; END IF;
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,d,shift_b,3000);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,req,q,2500);
 IF (SELECT shift_id_v37 FROM zhirox_local.checkout_intents_v31
     WHERE store_id=s AND request_id=req)<>shift_a
 THEN RAISE EXCEPTION 'intent did not snapshot current shift'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.commit_checkout_v31(s,c,req);
 IF result.total_minor<>2500 OR
   (SELECT shift_id_v37 FROM zhirox_local.sales
    WHERE store_id=s AND id=result.sale_id)<>shift_a
 THEN RAISE EXCEPTION 'committed sale not attributed to shift'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.commit_checkout_v31(s,c,req);
 IF NOT result.replayed THEN RAISE EXCEPTION 'checkout replay created new sale'; END IF;
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,pending,q,2500);
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.close_cash_shift_v37(s,c,shift_a,12900);
 EXCEPTION WHEN SQLSTATE 'P3703' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'shift closed over unfinished checkout'; END IF;
 PERFORM zhirox_local.cancel_checkout_v31(s,c,pending);
 SELECT * INTO STRICT closed FROM zhirox_local.close_cash_shift_v37(s,c,shift_a,12900);
 IF closed.opening_minor<>10000 OR closed.cash_sales_minor<>2500 OR
    closed.expected_minor<>12500 OR closed.counted_minor<>12900 OR
    closed.variance_minor<>400 OR closed.state<>'closed'
 THEN RAISE EXCEPTION 'server shift cash total/variance mismatch'; END IF;
 SELECT * INTO STRICT closed FROM zhirox_local.close_cash_shift_v37(s,c,shift_a,12900);
 IF closed.cash_sales_minor<>2500 THEN RAISE EXCEPTION 'close retry mismatch'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.close_cash_shift_v37(s,c,shift_a,12500);
 EXCEPTION WHEN SQLSTATE 'P3704' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'closed cash count edited'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,after_close,q,2500);
 EXCEPTION WHEN SQLSTATE 'P3701' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'checkout after closed shift accepted'; END IF;
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,d,req_b,q,2500);
 SELECT * INTO STRICT result FROM zhirox_local.commit_checkout_v31(s,d,req_b);
 IF (SELECT shift_id_v37 FROM zhirox_local.sales WHERE store_id=s AND id=result.sale_id)<>shift_b
 THEN RAISE EXCEPTION 'second cashier mixed shift identities'; END IF;
 SELECT * INTO STRICT closed FROM zhirox_local.close_cash_shift_v37(s,d,shift_b,5500);
 IF closed.variance_minor<>0 OR closed.cash_sales_minor<>2500
 THEN RAISE EXCEPTION 'second cashier shift mismatch'; END IF;
 RAISE NOTICE 'V37 PASS: open, intent linkage, atomic sale, retry, close and two-cashier segregation';
END $test$;
ROLLBACK;
