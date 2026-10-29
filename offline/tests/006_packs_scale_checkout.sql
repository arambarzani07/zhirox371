-- Disposable PostgreSQL ONLY: all writes in an outer rollback transaction.
BEGIN;
DO $$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000026';
 water uuid:='20000000-0000-0000-0000-000000000026';
 tomato uuid:='20000000-0000-0000-0000-000000000027';
 cashier uuid:='30000000-0000-0000-0000-000000000026';
 req uuid:='40000000-0000-0000-0000-000000000026';
 req2 uuid:='40000000-0000-0000-0000-000000000027';
 r uuid; again uuid; receipt bigint; total bigint; replayed boolean;
 items jsonb;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)VALUES(s,'V26 isolated test');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units,base_unit)
 VALUES(s,water,'Water',500,30,'unit');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units,base_unit,plu)
 VALUES(s,tomato,'Tomatoes',11000,2000,'gram','00001');
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units,sale_mode,sale_price_minor)
 VALUES(s,'6260053183974',water,1,'unit',NULL),
       (s,'6260053183998',water,12,'carton',5500);
 items:=jsonb_build_array(
   jsonb_build_object('barcode','6260053183974','qty',2),
   jsonb_build_object('barcode','6260053183998','qty',1),
   jsonb_build_object('barcode','2700001004806','qty',1));
 -- 2 x 500 + 1 carton x 5500 + 0.480 kg x 11000 = 11780 IQD.
 BEGIN
  PERFORM * FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req,items,11779);
  RAISE EXCEPTION 'stale total accepted';
 EXCEPTION WHEN SQLSTATE 'P2501' THEN NULL; END;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>0
   OR (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s)<>0
   OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>0
   OR (SELECT count(*) FROM zhirox_local.receipt_counters WHERE store_id=s)<>0
 THEN RAISE EXCEPTION 'price mismatch left partial writes'; END IF;
 SELECT x.sale_id,x.receipt_no,x.total_minor,x.replayed
 INTO r,receipt,total,replayed
 FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req,items,11780)x;
 IF receipt<>1 OR total<>11780 OR replayed
   OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=water)<>16
   OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=tomato)<>1520
   OR (SELECT count(*) FROM zhirox_local.sale_lines WHERE store_id=s)<>3
   OR (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s)<>2
   OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'mixed package sale did not complete atomically'; END IF;
 IF (SELECT quantity_base_units FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=r AND sale_mode_snapshot='scale')<>480
   OR (SELECT barcode_snapshot FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=r AND sale_mode_snapshot='carton')<>'6260053183998'
   OR (SELECT line_total_minor FROM zhirox_local.sale_lines WHERE store_id=s AND sale_id=r AND sale_mode_snapshot='scale')<>5280
 THEN RAISE EXCEPTION 'package/weight receipt snapshot incorrect'; END IF;
 -- A replay is always the same posted transaction, even after later price updates.
 UPDATE zhirox_local.products SET price_minor=12000 WHERE store_id=s AND id=tomato;
 UPDATE zhirox_local.barcodes SET sale_price_minor=6000
 WHERE store_id=s AND code='6260053183998';
 SELECT x.sale_id,x.replayed INTO again,replayed
 FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req,items,11780)x;
 IF again<>r OR NOT replayed THEN RAISE EXCEPTION 'idempotent replay failed'; END IF;
 BEGIN
  PERFORM * FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req2,items,11780);
  RAISE EXCEPTION 'changed unit/carton/kg price accepted';
 EXCEPTION WHEN SQLSTATE 'P2501' THEN NULL; END;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'stale quote created duplicate sale'; END IF;
 -- The identical physical scale label must not appear as multiple basket rows.
 BEGIN
  PERFORM * FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req2,
   jsonb_build_array(jsonb_build_object('barcode','2700001004806','qty',1),
      jsonb_build_object('barcode','2700001004806','qty',1)),11520);
  RAISE EXCEPTION 'duplicate weighed label accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM * FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req2,
   jsonb_build_array(jsonb_build_object('barcode','2700001004805','qty',1)),5760);
  RAISE EXCEPTION 'invalid EAN checksum accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- New price: 1000 unit + 6000 carton + 5760 scale = 12760 IQD.
 SELECT x.receipt_no,x.total_minor INTO receipt,total
 FROM zhirox_local.checkout_packs_scale_v26(s,cashier,req2,items,12760)x;
 IF receipt<>2 OR total<>12760
    OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'new mixed quote failed'; END IF;
 RAISE NOTICE 'V26 PASS: unit/carton/gram, checksum, atomic price, stock and outbox';
END $$;
ROLLBACK;
