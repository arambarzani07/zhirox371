-- V110: durable bundle/set intents on an isolated PostgreSQL disposable database.
-- Tests are rolled back. NEVER run against market data.
BEGIN;
DO $test$
DECLARE
 s uuid:='11000000-0000-4000-8000-000000000210';
 p uuid:='11000000-0000-4000-8000-000000000211';
 cashier uuid:='11000000-0000-4000-8000-000000000212';
 other uuid:='11000000-0000-4000-8000-000000000213';
 req uuid:='11000000-0000-4000-8000-000000000214';
 req2 uuid:='11000000-0000-4000-8000-000000000215';
 req3 uuid:='11000000-0000-4000-8000-000000000216';
 q jsonb:=jsonb_build_array(
   jsonb_build_object('barcode','BUNDLE-A-210','qty',2),
   jsonb_build_object('barcode','SET-A-210','qty',1));
 q2 jsonb:=jsonb_build_array(jsonb_build_object('barcode','SET-A-210','qty',1));
 sale_uuid uuid; again uuid; no bigint; total bigint; replay boolean;
BEGIN
 IF current_database()<>'zhirox_v110_packs_disposable'
 THEN RAISE EXCEPTION 'V110 disposable DB required'; END IF;
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'V110 durable isolated store');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units,base_unit)
 VALUES(s,p,'ئاوی تاقیکردنەوە',500,20,'unit');
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units,sale_mode,sale_price_minor,display_name)
 VALUES(s,'BUNDLE-A-210',p,6,'bundle',2700,'دەستەی ئاو'),
       (s,'SET-A-210',p,3,'set',1400,'سێتی ئاو');
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,req,q,6800);
 IF (SELECT state FROM zhirox_local.checkout_intents_v31 WHERE store_id=s AND request_id=req)<>'prepared'
   OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>0
   OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>20
 THEN RAISE EXCEPTION 'intent did not persist separately from sale'; END IF;
 BEGIN
   PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,req2,q2,1400);
   RAISE EXCEPTION 'duplicate in-flight cashier request accepted';
 EXCEPTION WHEN SQLSTATE 'P3102' THEN NULL; END;
 BEGIN
   PERFORM * FROM zhirox_local.commit_checkout_v31(s,other,req);
   RAISE EXCEPTION 'foreign cashier committed other intent';
 EXCEPTION WHEN SQLSTATE 'P3101' THEN NULL; END;
 SELECT x.sale_id,x.receipt_no,x.total_minor,x.replayed INTO sale_uuid,no,total,replay
 FROM zhirox_local.commit_checkout_v31(s,cashier,req) x;
 IF no<>1 OR total<>6800 OR replay
   OR (SELECT state FROM zhirox_local.checkout_intents_v31 WHERE store_id=s AND request_id=req)<>'committed'
   OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>5
   OR (SELECT count(*) FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=sale_uuid)<>2
   OR (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s AND sale_id=sale_uuid)<>1
   OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s AND aggregate_id=id)<>1
 THEN RAISE EXCEPTION 'V110 durable pack transaction not atomic'; END IF;
 SELECT x.sale_id,x.replayed INTO again,replay
 FROM zhirox_local.commit_checkout_v31(s,cashier,req) x;
 IF sale_uuid<>again OR NOT replay
   OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'replayed durable intent duplicated sale'; END IF;
 IF zhirox_local.cancel_checkout_v31(s,cashier,req)<>'committed'
 THEN RAISE EXCEPTION 'committed receipt was cancelled'; END IF;

 -- Stale set quote remains prepared until cashier can cancel and requote.
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,req2,q2,1400);
 UPDATE zhirox_local.barcodes SET sale_price_minor=1500
 WHERE store_id=s AND code='SET-A-210';
 BEGIN
   PERFORM * FROM zhirox_local.commit_checkout_v31(s,cashier,req2);
   RAISE EXCEPTION 'stale durable set price accepted';
 EXCEPTION WHEN SQLSTATE 'P2501' THEN NULL; END;
 IF (SELECT state FROM zhirox_local.checkout_intents_v31 WHERE store_id=s AND request_id=req2)<>'prepared'
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>5
 THEN RAISE EXCEPTION 'stale pack committed partially'; END IF;
 IF zhirox_local.cancel_checkout_v31(s,cashier,req2)<>'cancelled'
 THEN RAISE EXCEPTION 'failed quote could not cancel'; END IF;
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,req3,q2,1500);
 SELECT x.receipt_no,x.total_minor INTO no,total
 FROM zhirox_local.commit_checkout_v31(s,cashier,req3) x;
 IF no<>2 OR total<>1500
  OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>2
  OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'fresh set quote after crash/cancel failed'; END IF;
 RAISE NOTICE 'V110 PASS: durable pack intents, identity, repricing, stock, idempotent recovery';
END $test$;
ROLLBACK;
