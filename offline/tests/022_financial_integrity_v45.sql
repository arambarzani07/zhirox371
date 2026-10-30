-- V45 disposable PostgreSQL: deterministic financial discrepancy detection.
BEGIN;
DO $ci$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000045';
 c uuid:='20000000-0000-0000-0000-000000000045';
 c2 uuid:='20000000-0000-0000-0000-000000000047';
 c3 uuid:='20000000-0000-0000-0000-000000000048';
 m uuid:='20000000-0000-0000-0000-000000000046';
 p uuid:='30000000-0000-0000-0000-000000000045';
 sh uuid:='40000000-0000-0000-0000-000000000045';
 sh2 uuid:='40000000-0000-0000-0000-000000000047';
 sh3 uuid:='40000000-0000-0000-0000-000000000048';
 captured uuid:='50000000-0000-0000-0000-000000000045';
 expired uuid:='50000000-0000-0000-0000-000000000046';
 unheld uuid:='50000000-0000-0000-0000-000000000047';
 r record; rows_before bigint; notes_before bigint;
BEGIN
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'V45 audit CI');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,c,'v45-cashier','ci','cashier'),
 (s,c2,'v45-expired-cashier','ci','cashier'),
 (s,c3,'v45-unheld-cashier','ci','cashier'),
 (s,m,'v45-manager','ci','manager');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'V45 unit',1250,6);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',p,1);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c,sh,0);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c2,sh2,0);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(s,c3,sh3,0);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,captured,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,1250);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c,captured,250,1000,'card');
 PERFORM * FROM zhirox_local.hold_checkout_reservation_v43(s,c,captured);
 INSERT INTO zhirox_local.external_settlements_v42
 (store_id,request_id,provider,transaction_ref,external_method,amount_minor,captured_at)
 VALUES(s,captured,'ci_lab_v45','V45-SYNTHETIC-RECEIPT-001','card',1000,clock_timestamp());
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c2,expired,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,1250);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c2,expired,250,1000,'card');
 PERFORM * FROM zhirox_local.hold_checkout_reservation_v43(s,c2,expired);
 UPDATE zhirox_local.inventory_reservation_sessions_v43
 SET created_at=clock_timestamp()-interval '16 minutes',
 expires_at=clock_timestamp()-interval '1 second'
 WHERE store_id=s AND request_id=expired;
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c3,unheld,
 '[{"barcode":"6260053183974","qty":1}]'::jsonb,1250);
 PERFORM * FROM zhirox_local.plan_tender_v41(s,c3,unheld,250,1000,'bank_transfer');
 SELECT count(*) INTO rows_before FROM zhirox_local.sales WHERE store_id=s;
 SELECT count(*) INTO notes_before FROM zhirox_local.tender_review_notes_v44 WHERE store_id=s;
 SELECT * INTO STRICT r FROM zhirox_local.financial_integrity_audit_v45(s)
 WHERE check_code='evidence_pending_sale';
 IF r.case_count<>1 OR r.proposed_external_minor<>1000 OR r.severity<>'critical'
 THEN RAISE EXCEPTION 'capture pending did not trigger critical audit'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.financial_integrity_audit_v45(s)
 WHERE check_code='expired_held_stock';
 IF r.case_count<>1 OR r.severity<>'urgent'
 THEN RAISE EXCEPTION 'expired hold not flagged'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.financial_integrity_audit_v45(s)
 WHERE check_code='missing_reservation';
 IF r.case_count<>1 OR r.proposed_external_minor<>1000
 THEN RAISE EXCEPTION 'unreserved bank quote not flagged'; END IF;
 IF (SELECT count(*) FROM zhirox_local.financial_integrity_audit_v45(s))<>7
 OR EXISTS(SELECT 1 FROM zhirox_local.financial_integrity_audit_v45(s)
  WHERE check_code LIKE 'sale_%' AND case_count<>0)
 THEN RAISE EXCEPTION 'audit misses categories or fabricated sale mismatch'; END IF;
 IF (SELECT count(*) FROM zhirox_local.financial_integrity_audit_v45(
 '10000000-0000-0000-0000-000000000046') WHERE case_count<>0)<>0
 THEN RAISE EXCEPTION 'cross-store financial leak'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>rows_before
 OR (SELECT count(*) FROM zhirox_local.tender_review_notes_v44 WHERE store_id=s)<>notes_before
 THEN RAISE EXCEPTION 'read-only audit wrote into finance'; END IF;
 PERFORM * FROM zhirox_local.record_review_note_v44(s,m,
 '60000000-0000-0000-0000-000000000045',captured,
 'contacted_provider','Investigate synthetic provider reference; not an authorization');
 SELECT * INTO STRICT r FROM zhirox_local.financial_integrity_audit_v45(s)
 WHERE check_code='evidence_pending_sale';
 IF r.case_count<>1 THEN
 RAISE EXCEPTION 'operator note falsified bank settlement'; END IF;
 PERFORM * FROM zhirox_local.commit_checkout_v31(s,c,captured);
 SELECT * INTO STRICT r FROM zhirox_local.financial_integrity_audit_v45(s)
 WHERE check_code='evidence_pending_sale';
 IF r.case_count<>0 THEN RAISE EXCEPTION 'committed evidence still flagged as pending'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.financial_integrity_audit_v45(s)
  WHERE check_code LIKE 'sale_%' AND case_count<>0)
 THEN RAISE EXCEPTION 'correctly committed mix reported corruption'; END IF;
 IF (SELECT expected_minor FROM zhirox_local.cash_summary_v38(s,c,sh))<>250
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'mixed cash accounting damaged'; END IF;
 PERFORM * FROM zhirox_local.cancel_checkout_v31(s,c3,unheld);
 SELECT * INTO STRICT r FROM zhirox_local.financial_integrity_audit_v45(s)
 WHERE check_code='missing_reservation';
 IF r.case_count<>0 THEN RAISE EXCEPTION 'cancelled draft still counted'; END IF;
 IF (SELECT count(*) FROM zhirox_local.inventory_reservation_items_v43
 WHERE store_id=s)<>1 THEN RAISE EXCEPTION 'audit accidentally freed expired stock'; END IF;
 RAISE NOTICE 'V45 PASS 7 financial audit categories; synthetic captured, expired, unheld cases; financial rows untouched';
END $ci$;
ROLLBACK;
