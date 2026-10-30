-- V43 all fixtures rolled back. Synthetic bank evidence is CI-only, not a real payment.
BEGIN;
DO $test$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000043';
 c1 uuid:='20000000-0000-0000-0000-000000000043';
 c2 uuid:='20000000-0000-0000-0000-000000000044';
 p uuid:='30000000-0000-0000-0000-000000000043';
 sh1 uuid:='40000000-0000-0000-0000-000000000043';
 sh2 uuid:='40000000-0000-0000-0000-000000000044';
 r1 uuid:='50000000-0000-0000-0000-000000000043';
 r2 uuid:='50000000-0000-0000-0000-000000000044';
 r3 uuid:='50000000-0000-0000-0000-000000000045';
 x record;denied boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)VALUES(s,'V43 disposable hold');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,c1,'v43-cashier-a','ci','cashier'),(s,c2,'v43-cashier-b','ci','cashier');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'V43 stock control',1250,2);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',p,1);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c1,sh1,1000);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c2,sh2,1000);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c1,r1,
 '[{"barcode":"6260053183974","qty":2}]'::jsonb,2500);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c1,r1,1000,1500,'card');
 SELECT * INTO STRICT x FROM zhirox_local.hold_checkout_reservation_v43(s,c1,r1);
 IF x.replayed OR x.state<>'held' THEN RAISE EXCEPTION 'first hold unavailable'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.hold_checkout_reservation_v43(s,c1,r1);
 IF NOT x.replayed THEN RAISE EXCEPTION 'duplicate hold was not idempotent'; END IF;
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c2,r2,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,1250);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c2,r2,250,1000,'card');
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.hold_checkout_reservation_v43(s,c2,r2);
 EXCEPTION WHEN SQLSTATE 'P4301' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'second terminal reserved already held stock'; END IF;
 denied:=false;
 BEGIN UPDATE zhirox_local.products SET price_minor=100
 WHERE store_id=s AND id=p;
 EXCEPTION WHEN SQLSTATE 'P4302' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'reserved price was changed'; END IF;
 denied:=false;
 BEGIN UPDATE zhirox_local.barcodes SET sale_price_minor=10
 WHERE store_id=s AND code='6260053183974';
 EXCEPTION WHEN SQLSTATE 'P4302' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'reserved barcode was altered'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.checkout_packs_scale_v26(s,c1,r1,
 '[{"barcode":"6260053183974","qty":2}]'::jsonb,2500);
 EXCEPTION WHEN SQLSTATE 'P4303' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'V26 bypass consumed unheld external checkout'; END IF;
 IF zhirox_local.cancel_checkout_v31(s,c1,r1)<>'cancelled'
 THEN RAISE EXCEPTION 'unpaid checkout not cancelled'; END IF;
 IF (SELECT count(*) FROM zhirox_local.inventory_reservation_items_v43
  WHERE store_id=s)<>0 OR
  (SELECT state FROM zhirox_local.inventory_reservation_sessions_v43
   WHERE store_id=s AND request_id=r1)<>'cancelled'
 THEN RAISE EXCEPTION 'cancel failed to release stock hold'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.hold_checkout_reservation_v43(s,c2,r2);
 IF x.replayed THEN RAISE EXCEPTION 'second hold incorrectly marked replay'; END IF;
 -- fake evidence inserted only by disposable DB owner in CI; no payment gateway.
 INSERT INTO zhirox_local.external_settlements_v42
  (store_id,request_id,provider,transaction_ref,external_method,amount_minor,captured_at)
 VALUES(s,r2,'ci_fake_gateway','V43-FAKE-CAPTURE-0001','card',1000,clock_timestamp());
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.cancel_checkout_v31(s,c2,r2);
 EXCEPTION WHEN SQLSTATE 'P4206' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'captured bank was silently cancelled'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.commit_checkout_v31(s,c2,r2);
 IF x.total_minor<>1250 OR x.replayed THEN
 RAISE EXCEPTION 'reserved exact commit failed'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products
 WHERE store_id=s AND id=p)<>1 OR
 (SELECT state FROM zhirox_local.inventory_reservation_sessions_v43
 WHERE store_id=s AND request_id=r2)<>'consumed' OR
 EXISTS(SELECT 1 FROM zhirox_local.inventory_reservation_items_v43
 WHERE store_id=s AND request_id=r2)
 THEN RAISE EXCEPTION 'reservation not atomically consumed'; END IF;
 IF (SELECT expected_minor FROM zhirox_local.cash_summary_v38(s,c2,sh2))<>1250
 THEN RAISE EXCEPTION 'cash drawer incorrectly contains bank amount'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.commit_checkout_v31(s,c2,r2);
 IF NOT x.replayed OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'retry duplicated reserved checkout'; END IF;
 -- Expired requests do NOT release themselves. Deliberate operator decision
 -- is required before cancellation or external-provider compensation.
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c1,r3,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,1250);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c1,r3,250,1000,'card');
 PERFORM * FROM zhirox_local.hold_checkout_reservation_v43(s,c1,r3);
 UPDATE zhirox_local.inventory_reservation_sessions_v43
  SET expires_at=clock_timestamp()-interval '1 second'
 WHERE store_id=s AND request_id=r3;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.commit_checkout_v31(s,c1,r3);
 EXCEPTION WHEN SQLSTATE 'P4305' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'expired reserve was committed'; END IF;
 IF (SELECT count(*) FROM zhirox_local.inventory_reservation_items_v43
 WHERE store_id=s AND request_id=r3)<>1
 THEN RAISE EXCEPTION 'expired reserve disappeared before reconciliation'; END IF;
 PERFORM zhirox_local.cancel_checkout_v31(s,c1,r3);
 IF EXISTS(SELECT 1 FROM zhirox_local.inventory_reservation_items_v43
 WHERE store_id=s AND request_id=r3)
 THEN RAISE EXCEPTION 'cancelled expired hold still blocks inventory'; END IF;
 RAISE NOTICE 'V43 PASS serialized stock/price holds, safe cancellation, exact mixed commit, expired fail closed';
END $test$;
ROLLBACK;
