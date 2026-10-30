-- V44 isolated transaction: no real bank, no release or false success.
BEGIN;
DO $ci$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000044';
 c uuid:='20000000-0000-0000-0000-000000000044';
 manager uuid:='20000000-0000-0000-0000-000000000045';
 owner uuid:='20000000-0000-0000-0000-000000000046';
 product uuid:='30000000-0000-0000-0000-000000000044';
 shift uuid:='40000000-0000-0000-0000-000000000044';
 captured uuid:='50000000-0000-0000-0000-000000000044';
 expired uuid:='50000000-0000-0000-0000-000000000045';
 unheld uuid:='50000000-0000-0000-0000-000000000046';
 event uuid:='60000000-0000-0000-0000-000000000044';
 ev2 uuid:='60000000-0000-0000-0000-000000000045';
 x record;denied boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'V44 disposable');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,c,'ci-v44-cashier','dummy','cashier'),
       (s,manager,'ci-v44-manager','dummy','manager'),
       (s,owner,'ci-v44-owner','dummy','owner');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,product,'V44 item',2500,6);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',product,1);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c,shift,1000);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,captured,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,2500);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c,captured,1000,1500,'card');
 PERFORM * FROM zhirox_local.hold_checkout_reservation_v43(s,c,captured);
 INSERT INTO zhirox_local.external_settlements_v42
 (store_id,request_id,provider,transaction_ref,external_method,amount_minor,captured_at)
 VALUES(s,captured,'ci_provider_v44','SYNTHETIC-V44-CAPTURE-001','card',1500,clock_timestamp());
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,expired,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,2500);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c,expired,1000,1500,'card');
 PERFORM * FROM zhirox_local.hold_checkout_reservation_v43(s,c,expired);
 UPDATE zhirox_local.inventory_reservation_sessions_v43
 SET created_at=clock_timestamp()-interval '16 minutes',
 expires_at=clock_timestamp()-interval '1 second'
 WHERE store_id=s AND request_id=expired;
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,unheld,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,2500);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c,unheld,1000,1500,'bank_transfer');
 IF (SELECT count(*) FROM zhirox_local.pending_tender_cases_v44(s))<>3
 THEN RAISE EXCEPTION 'pending queue omitted an unresolved tender'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.pending_tender_cases_v44(s)
 WHERE request_id=captured;
 IF x.case_status<>'captured_pending' OR NOT x.evidence_recorded
 THEN RAISE EXCEPTION 'captured-but-unsold case not prioritized'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.pending_tender_cases_v44(s)
 WHERE request_id=expired;
 IF x.case_status<>'hold_expired' OR x.evidence_recorded
 THEN RAISE EXCEPTION 'expired hold not surfaced'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.pending_tender_cases_v44(s)
 WHERE request_id=unheld;
 IF x.case_status<>'reservation_missing' THEN
 RAISE EXCEPTION 'unheld pending tender not listed'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_tender_review_v44(
 s,c,captured,event,'review_opened','Cashier cannot certify payment');
 EXCEPTION WHEN SQLSTATE 'P4401' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier filed manager-only review'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.record_tender_review_v44(
 s,manager,captured,event,'review_opened','Provider transaction investigation requested');
 IF x.replayed OR x.manager_id<>manager THEN
 RAISE EXCEPTION 'manager review was not written'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.record_tender_review_v44(
 s,manager,captured,event,'review_opened','Provider transaction investigation requested');
 IF NOT x.replayed THEN RAISE EXCEPTION 'review retry was not idempotent'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_tender_review_v44(
 s,manager,captured,event,'provider_contacted','Changed same UUID');
 EXCEPTION WHEN SQLSTATE 'P4403' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'event UUID reused with altered contents'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.record_tender_review_v44(
 s,owner,expired,ev2,'escalated','Expired reservation needs provider follow-up');
 IF x.replayed OR x.action<>'escalated' THEN
 RAISE EXCEPTION 'owner escalation failed'; END IF;
 SELECT * INTO STRICT x FROM zhirox_local.pending_tender_cases_v44(s)
 WHERE request_id=captured;
 IF x.event_count<>1 OR x.last_action<>'review_opened'
 THEN RAISE EXCEPTION 'append-only journal not reflected in queue'; END IF;
 denied:=false;
 BEGIN UPDATE zhirox_local.tender_review_events_v44 SET note='modified'
 WHERE store_id=s AND event_id=event;
 EXCEPTION WHEN SQLSTATE 'P4403' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'review event editable'; END IF;
 denied:=false;
 BEGIN DELETE FROM zhirox_local.tender_review_events_v44
 WHERE store_id=s AND event_id=event;
 EXCEPTION WHEN SQLSTATE 'P4403' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'review event deletable'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.cancel_checkout_v31(s,c,captured);
 EXCEPTION WHEN SQLSTATE 'P4206' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'captured tender was cancelled by review'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>0 OR
 (SELECT count(*) FROM zhirox_local.external_settlements_v42 WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'review changed sale or provider evidence'; END IF;
 IF (SELECT count(*) FROM zhirox_local.inventory_reservation_items_v43
 WHERE store_id=s)<>2 THEN RAISE EXCEPTION 'review unexpectedly freed held stock'; END IF;
 PERFORM zhirox_local.cancel_checkout_v31(s,c,unheld);
 IF (SELECT count(*) FROM zhirox_local.pending_tender_cases_v44(s))<>2
 THEN RAISE EXCEPTION 'cancelled bank quote still shown as unresolved'; END IF;
 denied:=false;
 BEGIN PERFORM * FROM zhirox_local.record_tender_review_v44(
 s,manager,unheld,gen_random_uuid(),'note_added','After cancel');
 EXCEPTION WHEN SQLSTATE 'P4402' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cancelled quote accepted new review'; END IF;
 IF (SELECT expected_minor FROM zhirox_local.cash_summary_v38(s,c,shift))<>1000
 THEN RAISE EXCEPTION 'review mutated drawer balance'; END IF;
 RAISE NOTICE 'V44 PASS pending/captured/expired risk queue, manager-only immutable review, provider evidence untouched';
END $ci$;
ROLLBACK;
