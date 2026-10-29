-- Disposable PostgreSQL only. Every assertion and write is rolled back.
-- Run after 001-005 migrations. No Supabase/production access.
BEGIN;
DO $$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000025';
 p uuid:='20000000-0000-0000-0000-000000000025';
 cashier uuid:='30000000-0000-0000-0000-000000000025';
 req1 uuid:='40000000-0000-0000-0000-000000000025';
 req2 uuid:='40000000-0000-0000-0000-000000000026';
 req3 uuid:='40000000-0000-0000-0000-000000000027';
 saleid uuid; replay_id uuid; receipt bigint; total bigint; was_replayed boolean;
 items jsonb;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)VALUES(s,'V25 test');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'Tomatoes test',1250,3);
 items:=jsonb_build_array(jsonb_build_object('product_id',p,'qty',1));
 -- Mismatched price must atomically roll back sale, inventory, counter and outbox.
 BEGIN
  PERFORM * FROM zhirox_local.checkout_cash_v25(s,cashier,req1,items,1000);
  RAISE EXCEPTION 'price drift was not rejected';
 EXCEPTION WHEN SQLSTATE 'P2501' THEN NULL;
 END;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p) <>3
   OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>0
   OR (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s)<>0
   OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>0
   OR (SELECT count(*) FROM zhirox_local.receipt_counters WHERE store_id=s)<>0
 THEN RAISE EXCEPTION 'price mismatch caused non-atomic side effects'; END IF;
 SELECT x.sale_id,x.receipt_no,x.total_minor,x.replayed
 INTO saleid,receipt,total,was_replayed
 FROM zhirox_local.checkout_cash_v25(s,cashier,req1,items,1250)x;
 IF receipt<>1 OR total<>1250 OR was_replayed
 THEN RAISE EXCEPTION 'correct quote did not complete'; END IF;
 -- Replaying an old successful request must return the original total even
 -- after a later price change, without altering stock or counters.
 UPDATE zhirox_local.products SET price_minor=1550 WHERE store_id=s AND id=p;
 SELECT x.sale_id,x.replayed INTO replay_id,was_replayed
 FROM zhirox_local.checkout_cash_v25(s,cashier,req1,items,1250)x;
 IF replay_id<>saleid OR NOT was_replayed
 THEN RAISE EXCEPTION 'idempotency replay failed'; END IF;
 BEGIN
  PERFORM * FROM zhirox_local.checkout_cash_v25(s,cashier,req2,items,1250);
  RAISE EXCEPTION 'changed server price accepted stale quote';
 EXCEPTION WHEN SQLSTATE 'P2501' THEN NULL;
 END;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>2
    OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>1
    OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'replay or stale quote duplicated financial effects'; END IF;
 SELECT x.receipt_no,x.total_minor INTO receipt,total
 FROM zhirox_local.checkout_cash_v25(s,cashier,req3,items,1550)x;
 IF receipt<>2 OR total<>1550
    OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>1
    OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'fresh authoritative quote failed'; END IF;
 RAISE NOTICE 'V25 PASS: price drift rollback, original receipt replay, stock/outbox consistency';
END $$;
ROLLBACK;
