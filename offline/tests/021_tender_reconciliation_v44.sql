-- V44 disposable integration; all test data rolled back.
BEGIN;
DO $test$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000044';
 cashier1 uuid:='20000000-0000-0000-0000-000000000044';
 cashier2 uuid:='20000000-0000-0000-0000-000000000045';
 manager uuid:='20000000-0000-0000-0000-000000000046';
 product uuid:='30000000-0000-0000-0000-000000000044';
 shift1 uuid:='40000000-0000-0000-0000-000000000044';
 shift2 uuid:='40000000-0000-0000-0000-000000000045';
 stale uuid:='50000000-0000-0000-0000-000000000044';
 captured uuid:='50000000-0000-0000-0000-000000000045';
 v_note_id uuid:='60000000-0000-0000-0000-000000000044';
 x record; denied boolean; stock_before bigint;
BEGIN
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'V44 disposable');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,cashier1,'v44-cashier-one','test','cashier'),
       (s,cashier2,'v44-cashier-two','test','cashier'),
       (s,manager,'v44-manager','test','manager');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,product,'Exception test item',2500,10);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',product,1);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,cashier1,shift1,0);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,cashier2,shift2,0);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier1,stale,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,2500);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,cashier1,stale,1000,1500,'card');
 PERFORM * FROM zhirox_local.hold_checkout_reservation_v43(s,cashier1,stale);
 UPDATE zhirox_local.inventory_reservation_sessions_v43
 SET created_at=clock_timestamp()-interval '16 minutes',
 expires_at=clock_timestamp()-interval '1 second'
 WHERE store_id=s AND request_id=stale;
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier2,captured,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,2500);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,cashier2,captured,1000,1500,'card');
 PERFORM * FROM zhirox_local.hold_checkout_reservation_v43(s,cashier2,captured);
 INSERT INTO zhirox_local.external_settlements_v42
 (store_id,request_id,provider,transaction_ref,external_method,amount_minor,captured_at)
 VALUES(s,captured,'ci_fake_provider','V44-FAKE-CAPTURE-0001','card',1500,clock_timestamp());
 SELECT * INTO STRICT x FROM zhirox_local.tender_exceptions_v44(s,100)
 WHERE request_id=captured;
 IF x.exception_code<>'evidence_without_committed_sale' OR
    NOT x.evidence_recorded OR x.cash_minor<>1000 OR x.external_minor<>1500
 THEN RAISE EXCEPTION 'capture without sale not prioritized'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.tender_exceptions_v44(s,100)
 WHERE request_id=stale;
 IF x.exception_code<>'expired_unresolved_hold' OR
    x.evidence_recorded OR x.reservation_state<>'held'
 THEN RAISE EXCEPTION 'expired hold lost from review queue'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.tender_exceptions_v44(s,1);
 IF x.request_id<>captured THEN RAISE EXCEPTION 'highest-risk case not first'; END IF;
 SELECT stock_base_units INTO stock_before FROM zhirox_local.products
 WHERE store_id=s AND id=product;
 SELECT * INTO STRICT x FROM zhirox_local.record_review_note_v44(
 s,manager,v_note_id,captured,'contacted_provider',
 'Called merchant support; awaiting independent signed confirmation');
 IF x.replayed THEN RAISE EXCEPTION 'new manager note marked replay'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.record_review_note_v44(
 s,manager,v_note_id,captured,'contacted_provider',
 'Called merchant support; awaiting independent signed confirmation');
 IF NOT x.replayed THEN RAISE EXCEPTION 'idempotent manager note replay failed'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.tender_exceptions_v44(s,100)
 WHERE request_id=captured;
 IF x.review_count<>1 OR x.exception_code<>'evidence_without_committed_sale'
 THEN RAISE EXCEPTION 'note changed payment state or duplicated'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_review_note_v44(
 s,cashier1,'60000000-0000-0000-0000-000000000045',captured,
 'investigating','Cashier forged management review');
 EXCEPTION WHEN SQLSTATE 'P4401' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier wrote supervisor note'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_review_note_v44(
 s,manager,v_note_id,captured,'contacted_provider','Changed provider confirmation');
 EXCEPTION WHEN SQLSTATE 'P4403' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'note UUID changed history'; END IF;
 denied:=false;
 BEGIN UPDATE zhirox_local.tender_review_notes_v44
 SET note='Malicious alteration of prior financial audit'
 WHERE store_id=s AND note_id=v_note_id;
 EXCEPTION WHEN SQLSTATE 'P4403' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'audit note modified'; END IF;
 denied:=false;
 BEGIN DELETE FROM zhirox_local.tender_review_notes_v44 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P4403' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'audit note deleted'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products
 WHERE store_id=s AND id=product)<>stock_before OR
 EXISTS(SELECT 1 FROM zhirox_local.sales WHERE store_id=s) OR
 (SELECT count(*) FROM zhirox_local.tender_review_notes_v44 WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'manager note incorrectly changed financial ledgers'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.tender_exceptions_v44(s,101);
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'unbounded reviewer query accepted'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_review_note_v44(
 s,manager,'60000000-0000-0000-0000-000000000046',captured,
 'settled','Bank says paid');
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'operator falsely marked paid'; END IF;
 RAISE NOTICE 'V44 PASS manager-only immutable review, captured-without-sale priority, expired hold and zero financial changes';
END $test$;
ROLLBACK;
