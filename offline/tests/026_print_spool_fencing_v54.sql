-- V54 REAL disposable PostgreSQL verification, never a physical printer certification.
BEGIN;
DO $$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000054';
 c uuid:='20000000-0000-0000-0000-000000000054';
 p uuid:='30000000-0000-0000-0000-000000000054';
 req uuid:='40000000-0000-0000-0000-000000000054';
 job uuid:='50000000-0000-0000-0000-000000000054';
 sale uuid;
 claimed record;
 one_shot boolean:=false;
BEGIN
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'سوپەرمارکێتی کانی چنار');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'تەماتە V54 تاقیکردنەوە',11000,10);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'1234500054',p,1);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(
    s,c,req,'[{"barcode":"1234500054","qty":2}]'::jsonb,22000);
 SELECT x.sale_id INTO STRICT sale FROM zhirox_local.commit_checkout_v31(s,c,req) x;
 PERFORM * FROM zhirox_local.queue_print_v35(s,c,sale,job,80::smallint);
 SELECT * INTO STRICT claimed FROM zhirox_local.claim_print_dispatch_v54(s,job);
 IF claimed.job_id<>job OR claimed.sale_id<>sale OR claimed.width_mm<>80 OR
   claimed.receipt_no<>1 OR claimed.total_minor<>22000 OR
   claimed.lines->0->>'name'<>'تەماتە V54 تاقیکردنەوە'
 THEN RAISE EXCEPTION 'printer got untrusted receipt'; END IF;
 IF (SELECT state FROM zhirox_local.print_requests_v35 WHERE store_id=s AND job_id=job)<>'claimed'
 THEN RAISE EXCEPTION 'print claim not fenced'; END IF;
 BEGIN
   PERFORM * FROM zhirox_local.claim_print_dispatch_v54(s,job);
 EXCEPTION WHEN SQLSTATE 'P5401' THEN one_shot:=true;
 END;
 IF NOT one_shot THEN RAISE EXCEPTION 'duplicate physical print attempt permitted'; END IF;
 IF NOT zhirox_local.finish_print_dispatch_v54(s,job,'submitted_to_windows')
 THEN RAISE EXCEPTION 'spool submission not committed'; END IF;
 IF zhirox_local.finish_print_dispatch_v54(s,job,'manual_review')
 THEN RAISE EXCEPTION 'already finalized attempt mutated'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.print_requests_v35
  WHERE store_id=s AND state='printed')
 THEN RAISE EXCEPTION 'spool acknowledgment misreported physical printing'; END IF;
 IF (SELECT state FROM zhirox_local.print_dispatch_attempts_v54
    WHERE store_id=s AND job_id=job)<>'submitted_to_windows'
 THEN RAISE EXCEPTION 'durable spool state missing'; END IF;
 RAISE NOTICE 'V54 PASS: one-shot verified Sorani receipt; no double-print, no false physical printed status';
END $$;
ROLLBACK;
