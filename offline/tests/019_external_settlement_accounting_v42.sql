-- Disposable PostgreSQL integration. Provider evidence below is SYNTHETIC
-- injected by CI DB owner: NEVER interpret as a real bank authorization.
BEGIN;
DO $test$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000042';
 c uuid:='20000000-0000-0000-0000-000000000042';
 manager uuid:='20000000-0000-0000-0000-000000000043';
 p uuid:='30000000-0000-0000-0000-000000000042';
 sh uuid:='40000000-0000-0000-0000-000000000042';
 mixed uuid:='50000000-0000-0000-0000-000000000042';
 req2 uuid:='50000000-0000-0000-0000-000000000043';
 refund uuid:='60000000-0000-0000-0000-000000000042';
 sale uuid; r record; denied boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)VALUES(s,'V42 throwaway accounting');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,c,'v42-cashier','ci-test','cashier'),
        (s,manager,'v42-manager','ci-test','manager');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'Synthetic mixed card item',12500,10);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',p,1);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c,sh,1200);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,mixed,
  '[{"barcode":"6260053183974","qty":2}]'::jsonb,25000);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c,mixed,10000,15000,'card');
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.commit_checkout_v31(s,c,mixed);
 EXCEPTION WHEN SQLSTATE 'P4101' THEN denied:=true; END;
 IF NOT denied OR EXISTS(SELECT 1 FROM zhirox_local.sales WHERE store_id=s)
 THEN RAISE EXCEPTION 'unverified card created sale'; END IF;
 denied:=false;
 BEGIN
  INSERT INTO zhirox_local.external_settlements_v42
    (store_id,request_id,provider,transaction_ref,external_method,amount_minor,captured_at)
  VALUES(s,mixed,'ci_fake_provider','V42-FAKE-REFERENCE-0001','card',14999,clock_timestamp());
 EXCEPTION WHEN SQLSTATE 'P4202' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'wrong card amount was accepted'; END IF;
 -- Test-only synthetic record (NO provider connector or real bank).
 INSERT INTO zhirox_local.external_settlements_v42
    (store_id,request_id,provider,transaction_ref,external_method,amount_minor,captured_at)
 VALUES(s,mixed,'ci_fake_provider','V42-FAKE-REFERENCE-0001','card',15000,clock_timestamp());
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.cancel_checkout_v31(s,c,mixed);
 EXCEPTION WHEN SQLSTATE 'P4206' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'captured transaction silently cancelled'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.commit_checkout_v31(s,c,mixed);
 sale:=r.sale_id;
 IF r.total_minor<>25000 OR r.replayed
 THEN RAISE EXCEPTION 'synthetic mixed total incorrect'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.tender_summary_v42(s,c,sh);
 IF r.gross_sales_minor<>25000 OR r.cash_sales_minor<>10000 OR
    r.bank_sales_minor<>15000 OR r.expected_drawer_minor<>11200
 THEN RAISE EXCEPTION 'mixed sale was charged as 25000 cash';
 END IF;
 IF (SELECT expected_minor FROM zhirox_local.cash_summary_v38(s,c,sh))<>11200
    OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>8
 THEN RAISE EXCEPTION 'atomic mixed checkout / stock mismatch'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.commit_checkout_v31(s,c,mixed);
 IF NOT r.replayed OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'mixed checkout UUID replay duplicated sale'; END IF;
 denied:=false;
 BEGIN
  INSERT INTO zhirox_local.cash_refunds_v39
   (store_id,refund_id,sale_id,line_no,cashier_id,manager_id,shift_id,
    product_id,base_units,refund_minor,restock,reason)
  VALUES(s,refund,sale,1,c,manager,sh,p,1,12500,false,'Not eligible for cash refund');
 EXCEPTION WHEN SQLSTATE 'P4205' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'mixed tender refunded in cash without provider'; END IF;
 denied:=false;
 BEGIN
  INSERT INTO zhirox_local.partial_cash_refunds_v40
   (store_id,refund_id,sale_id,line_no,cashier_id,manager_id,shift_id,
    product_id,quantity_base_units,refund_minor,restock,reason)
  VALUES(s,refund,sale,1,c,manager,sh,p,1,12500,false,'Wrong payment rail');
 EXCEPTION WHEN SQLSTATE 'P4205' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'partial mixed cash refund bypassed'; END IF;
 denied:=false;
 BEGIN DELETE FROM zhirox_local.external_settlements_v42
  WHERE store_id=s AND request_id=mixed;
 EXCEPTION WHEN SQLSTATE 'P4204' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'payment evidence silently deleted'; END IF;
 denied:=false;
 BEGIN UPDATE zhirox_local.external_settlements_v42 SET amount_minor=0
  WHERE store_id=s AND request_id=mixed;
 EXCEPTION WHEN SQLSTATE 'P4204' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'payment evidence silently modified'; END IF;
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,req2,
  '[{"barcode":"6260053183974","qty":1}]'::jsonb,12500);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c,req2,2500,10000,'card');
 denied:=false;
 BEGIN INSERT INTO zhirox_local.external_settlements_v42
    (store_id,request_id,provider,transaction_ref,external_method,amount_minor,captured_at)
 VALUES(s,req2,'ci_fake_provider','V42-FAKE-REFERENCE-0001','card',10000,clock_timestamp());
 EXCEPTION WHEN SQLSTATE '23505' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'same processor reference reused'; END IF;
 PERFORM zhirox_local.cancel_checkout_v31(s,c,req2);
 SELECT * INTO STRICT r FROM zhirox_local.close_cash_shift_v38(s,c,sh,11200);
 IF r.cash_sales_minor<>10000 OR r.expected_minor<>11200 OR r.variance_minor<>0
 THEN RAISE EXCEPTION 'cash drawer close included bank amount'; END IF;
 RAISE NOTICE 'V42 PASS synthetic bank proof boundary, cash=10000 bank=15000, duplicates, refunds/cancel blocked';
END $test$;
ROLLBACK;
