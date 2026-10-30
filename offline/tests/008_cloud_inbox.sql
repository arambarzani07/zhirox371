-- V28 disposable cloud inbox only, in an isolated PostgreSQL 16 CI service.
BEGIN;
DO $$
DECLARE
  s uuid:='10000000-0000-0000-0000-000000000028';
  e uuid:='40000000-0000-0000-0000-000000000028';
  same_sale uuid:='20000000-0000-0000-0000-000000000028';
  e2 uuid:='40000000-0000-0000-0000-000000000029';
  other_sale uuid:='20000000-0000-0000-0000-000000000029';
  n bigint;
BEGIN
 INSERT INTO zhirox_cloud_v28.received_sales
  (store_id,event_id,sale_id,receipt_no,total_minor,event_hash,occurred_at)
 VALUES(s,e,same_sale,1,1250,repeat('a',64),now());
 -- Unique event IDs and sale IDs are independent protections.
 BEGIN
   INSERT INTO zhirox_cloud_v28.received_sales
     (store_id,event_id,sale_id,receipt_no,total_minor,event_hash,occurred_at)
   VALUES(s,e,other_sale,2,1300,repeat('b',64),now());
   RAISE EXCEPTION 'duplicate event accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
   INSERT INTO zhirox_cloud_v28.received_sales
     (store_id,event_id,sale_id,receipt_no,total_minor,event_hash,occurred_at)
   VALUES(s,e2,same_sale,2,1300,repeat('b',64),now());
   RAISE EXCEPTION 'duplicate sale accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
   INSERT INTO zhirox_cloud_v28.received_sales
     (store_id,event_id,sale_id,receipt_no,total_minor,event_hash,occurred_at)
   VALUES(s,e2,other_sale,1,1300,repeat('b',64),now());
   RAISE EXCEPTION 'duplicate receipt accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 SELECT count(*) INTO n FROM zhirox_cloud_v28.received_sales WHERE store_id=s;
 IF n<>1 THEN RAISE EXCEPTION 'cloud inbox allowed duplicate delivery'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns
  WHERE table_schema='zhirox_cloud_v28' AND table_name='received_sales'
    AND column_name IN ('customer_name','product_name','barcode','basket'))
 THEN RAISE EXCEPTION 'private customer/product fields in receiver'; END IF;
 RAISE NOTICE 'V28 PASS: cloud event, sale and receipt unique; minimal payload';
END $$;
ROLLBACK;
