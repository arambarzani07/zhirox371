-- V110 disposable PostgreSQL acceptance: authorized registration -> scan rows -> sale.
BEGIN;
DO $test$
DECLARE
 s uuid:='11000000-0000-4000-8000-000000000410';
 p uuid:='11000000-0000-4000-8000-000000000411';
 p2 uuid:='11000000-0000-4000-8000-000000000412';
 owner_id uuid:='11000000-0000-4000-8000-000000000413';
 cashier_id uuid:='11000000-0000-4000-8000-000000000414';
 r1 uuid:='11000000-0000-4000-8000-000000000415';
 r2 uuid:='11000000-0000-4000-8000-000000000416';
 r3 uuid:='11000000-0000-4000-8000-000000000417';
 r4 uuid:='11000000-0000-4000-8000-000000000418';
 sale_request uuid:='11000000-0000-4000-8000-000000000419';
 version_after bigint; did_replay boolean; total bigint; sale uuid;
BEGIN
 IF current_database()<>'zhirox_v110_packs_disposable'
 THEN RAISE EXCEPTION 'only disposable database'; END IF;
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'V110 catalog disposable store');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units,base_unit)
 VALUES(s,p,'ئاوی تاقیکردنەوە',500,30,'unit'),
       (s,p2,'تەما تە',1300,900,'gram');
 INSERT INTO zhirox_local.local_users
 (store_id,id,username,password_hash,role,session_version)
 VALUES(s,owner_id,'owner_v110','hash-placeholder-owner','owner',1),
       (s,cashier_id,'cashier_v110','hash-placeholder-cashier','cashier',1);
 -- Only an active owner/manager with matching live session version may register.
 BEGIN
  PERFORM * FROM zhirox_local.register_fixed_pack_v110(
   s,cashier_id,1,r1,p,'bundle','دەستەی ئاو','PACK-410',ARRAY['PACK-A-410'],6,2700,1);
  RAISE EXCEPTION 'cashier modified catalog';
 EXCEPTION WHEN SQLSTATE 'P1101' THEN NULL; END;
 BEGIN
  PERFORM * FROM zhirox_local.register_fixed_pack_v110(
   s,owner_id,2,r1,p,'bundle','دەستەی ئاو','PACK-410',ARRAY['PACK-A-410'],6,2700,1);
  RAISE EXCEPTION 'stale actor modified catalog';
 EXCEPTION WHEN SQLSTATE 'P1101' THEN NULL; END;
 SELECT next_version,replayed INTO version_after,did_replay
 FROM zhirox_local.register_fixed_pack_v110(
   s,owner_id,1,r1,p,'bundle','دەستەی ئاو','PACK-410',ARRAY['PACK-A-410'],6,2700,1);
 IF version_after<>2 OR did_replay OR
  (SELECT count(*) FROM zhirox_local.barcodes
     WHERE store_id=s AND product_id=p AND active AND sale_mode='bundle')<>2
 THEN RAISE EXCEPTION 'bundle primary/alias registration failed'; END IF;
 SELECT next_version,replayed INTO version_after,did_replay
 FROM zhirox_local.register_fixed_pack_v110(
   s,owner_id,1,r1,p,'bundle','دەستەی ئاو','PACK-410',ARRAY['PACK-A-410'],6,2700,1);
 IF version_after<>2 OR NOT did_replay OR
  (SELECT version FROM zhirox_local.products WHERE store_id=s AND id=p)<>2
 THEN RAISE EXCEPTION 'catalog idempotency failed'; END IF;
 BEGIN
  PERFORM * FROM zhirox_local.register_fixed_pack_v110(
   s,owner_id,1,r1,p,'bundle','دەستەی ئاو','PACK-410',ARRAY['PACK-A-410'],7,2700,1);
  RAISE EXCEPTION 'changed registration UUID accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM * FROM zhirox_local.register_fixed_pack_v110(
   s,owner_id,1,r3,p,'bundle','دەستەی ئاو','PACK-OTHER',ARRAY[]::text[],6,2700,1);
  RAISE EXCEPTION 'stale product edit accepted';
 EXCEPTION WHEN SQLSTATE 'P1102' THEN NULL; END;
 BEGIN
  PERFORM * FROM zhirox_local.register_fixed_pack_v110(
   s,owner_id,1,r3,p,'bundle','دەستەی ئاو','PACK-A-410',ARRAY['PACK-A-410'],6,2700,2);
  RAISE EXCEPTION 'duplicate primary and alias accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 -- Re-register bundle with a different primary. Previously active codes retire;
 -- historical codes remain reserved for the same SKU and sale kind.
 SELECT next_version INTO version_after FROM zhirox_local.register_fixed_pack_v110(
  s,owner_id,1,r2,p,'bundle','دەستەی ئاو','PACK-NEW-410',ARRAY['PACK-A-410'],6,2800,2);
 IF version_after<>3
  OR (SELECT active FROM zhirox_local.barcodes WHERE store_id=s AND code='PACK-410')
  OR (SELECT sale_price_minor FROM zhirox_local.barcodes WHERE store_id=s AND code='PACK-A-410')<>2800
  OR (SELECT count(*) FROM zhirox_local.fixed_pack_catalog_changes_v110 WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'pack re-registration or audit failed'; END IF;
 BEGIN
  PERFORM * FROM zhirox_local.register_fixed_pack_v110(
   s,owner_id,1,r3,p,'set','سێتی ئاو','PACK-410',ARRAY[]::text[],3,1400,3);
  RAISE EXCEPTION 'retired bundle barcode reassigned to set';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM * FROM zhirox_local.register_fixed_pack_v110(
   s,owner_id,1,r3,p2,'set','سێتی تەما تە','SET-KG-410',ARRAY[]::text[],3,1400,1);
  RAISE EXCEPTION 'weighed product registered as fixed set';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 SELECT next_version INTO version_after FROM zhirox_local.register_fixed_pack_v110(
  s,owner_id,1,r4,p,'set','سێتی ئاو','SET-410',ARRAY['SET-A-410'],3,1400,3);
 IF version_after<>4 OR
  (SELECT count(*) FROM zhirox_local.fixed_pack_catalog_changes_v110 WHERE store_id=s)<>3
 THEN RAISE EXCEPTION 'set registration failed'; END IF;
 -- Real server function now uses independently maintained catalog rows.
 SELECT x.sale_id,x.total_minor INTO sale,total FROM
  zhirox_local.checkout_packs_scale_v26(s,cashier_id,sale_request,
   jsonb_build_array(
    jsonb_build_object('barcode','PACK-A-410','qty',2),
    jsonb_build_object('barcode','SET-A-410','qty',1)),7000) x;
 IF total<>7000 OR
   (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>15
   OR (SELECT count(*) FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=sale)<>2
   OR (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s AND sale_id=sale)<>1
 THEN RAISE EXCEPTION 'catalog-to-checkout round trip failed'; END IF;
 RAISE NOTICE 'V110 PASS: owner auth, version, aliases, retired codes, audit, and atomic pack checkout';
END $test$;
ROLLBACK;
