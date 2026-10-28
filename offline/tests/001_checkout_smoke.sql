-- Run AFTER 001_core.sql and 002_atomic_checkout.sql in disposable local DB.
-- Entire test is rolled back. No production use.
BEGIN;
DO $$
DECLARE s uuid:='10000000-0000-0000-0000-000000000001';
 p uuid:='20000000-0000-0000-0000-000000000001';
 c uuid:='30000000-0000-0000-0000-000000000001';
 r uuid:='40000000-0000-0000-0000-000000000001';
 first_id uuid; second_id uuid; first_receipt bigint; again boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'Test Only');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'Test Product',2500,2);
 SELECT sale_id,receipt_no INTO first_id,first_receipt
 FROM zhirox_local.checkout_cash_v1(s,c,r,
  jsonb_build_array(jsonb_build_object('product_id',p,'qty',1)));
 SELECT sale_id,replayed INTO second_id,again
 FROM zhirox_local.checkout_cash_v1(s,c,r,
  jsonb_build_array(jsonb_build_object('product_id',p,'qty',1)));
 IF first_id<>second_id OR NOT again OR first_receipt<>1 THEN
   RAISE EXCEPTION 'idempotency assertion failed';
 END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p) <> 1
 OR (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'atomic side effects assertion failed'; END IF;
 BEGIN
  PERFORM * FROM zhirox_local.checkout_cash_v1(s,c,r,
   jsonb_build_array(jsonb_build_object('product_id',p,'qty',2)));
  RAISE EXCEPTION 'expected replay rejection';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  PERFORM * FROM zhirox_local.checkout_cash_v1(s,c,
   '40000000-0000-0000-0000-000000000002',
   jsonb_build_array(jsonb_build_object('product_id',p,'qty',5)));
  RAISE EXCEPTION 'expected insufficient stock';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'failed transaction wrote sale'; END IF;
 RAISE NOTICE 'PASS: idempotency, stock and outbox';
END $$;
ROLLBACK;
