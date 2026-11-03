-- Separate committed fixture for two simultaneous checkout connections.
-- Disposable v110 database only. Tested once per isolated CI job.
DO $seed$
DECLARE
 s uuid:='11000000-0000-4000-8000-000000000310';
 p uuid:='11000000-0000-4000-8000-000000000311';
 a uuid:='11000000-0000-4000-8000-000000000312';
 b uuid:='11000000-0000-4000-8000-000000000313';
 ra uuid:='11000000-0000-4000-8000-000000000314';
 rb uuid:='11000000-0000-4000-8000-000000000315';
BEGIN
 IF current_database()<>'zhirox_v110_packs_disposable'
 THEN RAISE EXCEPTION 'V110 disposable database required'; END IF;
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'V110 concurrency isolated');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units,base_unit)
 VALUES(s,p,'ئاوی تاقیکردنەوە',500,6,'unit');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role)
 VALUES(s,a,'v110-race-a','test-hash','cashier'),
       (s,b,'v110-race-b','test-hash','cashier');
 PERFORM * FROM zhirox_local.open_cash_shift_v37(
  s,a,'11000000-0000-4000-8000-000000000316',0);
 PERFORM * FROM zhirox_local.open_cash_shift_v37(
  s,b,'11000000-0000-4000-8000-000000000317',0);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units,sale_mode,sale_price_minor,display_name)
 VALUES(s,'BUNDLE-RACE-310',p,6,'bundle',2700,'دەستەی ئاو'),
       (s,'SET-RACE-310',p,4,'set',1900,'سێتی ئاو');
 PERFORM * FROM zhirox_local.prepare_checkout_v31(
  s,a,ra,jsonb_build_array(jsonb_build_object('barcode','BUNDLE-RACE-310','qty',1)),2700);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(
  s,b,rb,jsonb_build_array(jsonb_build_object('barcode','SET-RACE-310','qty',1)),1900);
 IF (SELECT count(*) FROM zhirox_local.checkout_intents_v31
 WHERE store_id=s AND state='prepared')<>2
 THEN RAISE EXCEPTION 'expected two independently durable intents'; END IF;
 RAISE NOTICE 'V110 concurrent fixed-pack requests prepared';
END $seed$;
