-- V110 disposable PostgreSQL only. An explicit transaction rolls back every test row.
BEGIN;
DO $v110$
DECLARE
  s uuid:='11000000-0000-4000-8000-000000000110';
  p uuid:='11000000-0000-4000-8000-000000000111';
  cashier uuid:='11000000-0000-4000-8000-000000000112';
  req uuid:='11000000-0000-4000-8000-000000000113';
  req2 uuid:='11000000-0000-4000-8000-000000000114';
  items jsonb; sale uuid; again uuid; no bigint; total bigint; replay boolean;
BEGIN
 IF current_database()<>'zhirox_v110_packs_disposable'
 THEN RAISE EXCEPTION 'not a disposable V110 DB'; END IF;
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'V110 disposable fixed packs test');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units,base_unit)
 VALUES(s,p,'ئاوی تاقیکردنەوە',500,50,'unit');
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units,sale_mode,sale_price_minor,display_name)
 VALUES(s,'UNIT-110',p,1,'unit',NULL,NULL),
       (s,'CARTON-110',p,12,'carton',5500,NULL),
       (s,'BUNDLE-110',p,6,'bundle',2700,'دەستەی ئاو'),
       (s,'BUNDLE-ALIAS',p,6,'bundle',2700,'دەستەی ئاو'),
       (s,'SET-110',p,3,'set',1400,'سێتی ئاو'),
       (s,'SET-ALIAS',p,3,'set',1400,'سێتی ئاو');
 items:=jsonb_build_array(
   jsonb_build_object('barcode','UNIT-110','qty',1),
   jsonb_build_object('barcode','CARTON-110','qty',1),
   jsonb_build_object('barcode','BUNDLE-ALIAS','qty',2),
   jsonb_build_object('barcode','SET-ALIAS','qty',1));
 -- 1 + 12 + 2*6 + 3 = 28 units; IQD 500+5500+5400+1400 = 12,800.
 BEGIN
   PERFORM * FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req,items,12799);
   RAISE EXCEPTION 'accepted stale pack price';
 EXCEPTION WHEN SQLSTATE 'P2501' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM zhirox_local.sales WHERE store_id=s)
 OR EXISTS(SELECT 1 FROM zhirox_local.stock_ledger WHERE store_id=s)
 THEN RAISE EXCEPTION 'price mismatch partially committed'; END IF;
 SELECT x.sale_id,x.receipt_no,x.total_minor,x.replayed
 INTO sale,no,total,replay FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req,items,12800) x;
 IF no<>1 OR total<>12800 OR replay OR
    (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>22 OR
    (SELECT count(*) FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=sale)<>4 OR
    (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s AND sale_id=sale)<>1 OR
    (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s AND aggregate_id=sale)<>1
 THEN RAISE EXCEPTION 'mixed fixed-pack sale not atomic'; END IF;
 IF (SELECT name_snapshot FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=sale AND sale_mode_snapshot='bundle')<>'دەستەی ئاو'
 OR (SELECT name_snapshot FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=sale AND sale_mode_snapshot='set')<>'سێتی ئاو'
 OR (SELECT quantity_base_units FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=sale AND sale_mode_snapshot='bundle')<>12
 OR (SELECT barcode_snapshot FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=sale AND sale_mode_snapshot='set')<>'SET-ALIAS'
 THEN RAISE EXCEPTION 'bundle/set receipt snapshots incorrect'; END IF;
 UPDATE zhirox_local.barcodes SET sale_price_minor=2800
 WHERE store_id=s AND code IN('BUNDLE-110','BUNDLE-ALIAS');
 SELECT x.sale_id,x.replayed INTO again,replay
 FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req,items,12800) x;
 IF again<>sale OR NOT replay THEN RAISE EXCEPTION 'idempotent replay failed'; END IF;
 BEGIN
   PERFORM * FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req2,items,12800);
   RAISE EXCEPTION 'accepted changed bundle price';
 EXCEPTION WHEN SQLSTATE 'P2501' THEN NULL; END;
 BEGIN
   PERFORM * FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req2,
     jsonb_build_array(jsonb_build_object('barcode','BUNDLE-110','qty',10)),28000);
   RAISE EXCEPTION 'oversold remaining units';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>22
 THEN RAISE EXCEPTION 'failed checkout changed stock or receipts'; END IF;
 RAISE NOTICE 'V110 PASS: fixed packs, aliases, IQD price, atomic stock, receipt, replay and oversell';
END $v110$;
ROLLBACK;
