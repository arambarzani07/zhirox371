-- V35 disposable integration test. No hardware spooler, no real data.
BEGIN;
DO $$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000035';
 c uuid:='20000000-0000-0000-0000-000000000035';
 other uuid:='20000000-0000-0000-0000-000000000036';
 p uuid:='30000000-0000-0000-0000-000000000035';
 r uuid:='40000000-0000-0000-0000-000000000035';
 job uuid:='50000000-0000-0000-0000-000000000035';
 another uuid:='50000000-0000-0000-0000-000000000036';
 sale uuid;
 queued record;
 conflict_flag boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'کانی چنار');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'کاڵای V35',900,20);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'1234500035',p,1);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,r,
   '[{"barcode":"1234500035","qty":2}]'::jsonb,1800);
 SELECT x.sale_id INTO STRICT sale FROM zhirox_local.commit_checkout_v31(s,c,r) x;
 SELECT * INTO STRICT queued FROM zhirox_local.queue_print_v35(s,c,sale,job,80);
 IF queued.state<>'queued' OR queued.width_mm<>80 OR queued.job_id<>job THEN
  RAISE EXCEPTION 'unexpected queue status'; END IF;
 SELECT * INTO STRICT queued FROM zhirox_local.queue_print_v35(s,c,sale,job,80);
 IF queued.job_id<>job OR (SELECT count(*) FROM zhirox_local.print_requests_v35 WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'retry generated a duplicate print job'; END IF;
 conflict_flag:=false;
 BEGIN PERFORM * FROM zhirox_local.queue_print_v35(s,other,sale,another,80);
 EXCEPTION WHEN SQLSTATE 'P3501' THEN conflict_flag:=true; END;
 IF NOT conflict_flag THEN RAISE EXCEPTION 'other cashier queued receipt'; END IF;
 conflict_flag:=false;
 BEGIN PERFORM * FROM zhirox_local.queue_print_v35(s,c,sale,another,80);
 EXCEPTION WHEN SQLSTATE 'P3502' THEN conflict_flag:=true; END;
 IF NOT conflict_flag THEN RAISE EXCEPTION 'unauthorized reprint job'; END IF;
 conflict_flag:=false;
 BEGIN PERFORM * FROM zhirox_local.queue_print_v35(s,c,sale,job,58);
 EXCEPTION WHEN SQLSTATE 'P3502' THEN conflict_flag:=true; END;
 IF NOT conflict_flag THEN RAISE EXCEPTION 'same UUID mutated paper size'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.print_requests_v35 WHERE store_id=s AND state='printed')
 THEN RAISE EXCEPTION 'cannot claim printed without worker'; END IF;
 RAISE NOTICE 'V35 PASS: verified sale, cashier scope, durable job and idempotency';
END $$;
ROLLBACK;
