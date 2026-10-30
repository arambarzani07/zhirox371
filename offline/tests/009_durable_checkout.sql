-- V31 disposable PostgreSQL SQL integration: durable intent, crash replay,
-- store/cashier isolation and idempotent receipt/stock/outbox invariants.
BEGIN;
DO $$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000031';
 p uuid:='20000000-0000-0000-0000-000000000031';
 cashier uuid:='30000000-0000-0000-0000-000000000031';
 another uuid:='30000000-0000-0000-0000-000000000032';
 req uuid:='40000000-0000-0000-0000-000000000031';
 req2 uuid:='40000000-0000-0000-0000-000000000032';
 req3 uuid:='40000000-0000-0000-0000-000000000033';
 q jsonb:=jsonb_build_array(jsonb_build_object('barcode','6260053183974','qty',2));
 old_sale uuid;fresh_sale uuid;ticket bigint;price bigint;was_replayed boolean;
 state text;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)VALUES(s,'V31 isolated checkout');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'Test unit',1250,5);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',p,1);

 -- Prepare is a standalone committed operation in the real API.
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,req,q,2500);
 IF (SELECT state FROM zhirox_local.checkout_intents_v31 WHERE store_id=s AND request_id=req)<>'prepared'
   OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>0
   OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>5
 THEN RAISE EXCEPTION 'prepare wrote sale or inventory or omitted durable row'; END IF;
 -- A second UUID for same cashier must be rejected until first is resolved.
 BEGIN
  PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,req2,q,2500);
  RAISE EXCEPTION 'second unresolved UUID allowed';
 EXCEPTION WHEN SQLSTATE 'P3102' THEN NULL; END;
 -- Identity and payload are bound to prepared UUID.
 BEGIN
  PERFORM * FROM zhirox_local.prepare_checkout_v31(s,another,req,q,2500);
  RAISE EXCEPTION 'caller hijacked UUID';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM * FROM zhirox_local.commit_checkout_v31(s,another,req);
  RAISE EXCEPTION 'other cashier committed intent';
 EXCEPTION WHEN SQLSTATE 'P3101' THEN NULL; END;
 BEGIN
  PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,req,
   jsonb_build_array(jsonb_build_object('barcode','6260053183974','qty',1)),1250);
  RAISE EXCEPTION 'same request changed payload';
 EXCEPTION WHEN unique_violation THEN NULL; END;

 SELECT r.sale_id,r.receipt_no,r.total_minor,r.replayed
 INTO old_sale,ticket,price,was_replayed
 FROM zhirox_local.commit_checkout_v31(s,cashier,req) r;
 IF ticket<>1 OR price<>2500 OR was_replayed
  OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>3
  OR (SELECT state FROM zhirox_local.checkout_intents_v31 WHERE store_id=s AND request_id=req)<>'committed'
  OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'first commit was not atomic'; END IF;
 SELECT r.sale_id,r.replayed INTO fresh_sale,was_replayed
 FROM zhirox_local.commit_checkout_v31(s,cashier,req) r;
 IF old_sale<>fresh_sale OR NOT was_replayed OR
   (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'crash retry duplicated checkout'; END IF;
 IF zhirox_local.cancel_checkout_v31(s,cashier,req)<>'committed'
  OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'cancel destroyed committed receipt'; END IF;

 -- A stale price quote rolls back sale, leaving prepared intent for recovery.
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,req2,q,2500);
 UPDATE zhirox_local.products SET price_minor=1500 WHERE store_id=s AND id=p;
 BEGIN
   PERFORM * FROM zhirox_local.commit_checkout_v31(s,cashier,req2);
   RAISE EXCEPTION 'price drift was accepted';
 EXCEPTION WHEN SQLSTATE 'P2501' THEN NULL; END;
 IF (SELECT state FROM zhirox_local.checkout_intents_v31 WHERE store_id=s AND request_id=req2)<>'prepared'
   OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
   OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>3
 THEN RAISE EXCEPTION 'price drift partially committed'; END IF;
 IF zhirox_local.cancel_checkout_v31(s,cashier,req2)<>'cancelled'
 THEN RAISE EXCEPTION 'verified failed intent could not be cancelled'; END IF;
 BEGIN
  PERFORM * FROM zhirox_local.commit_checkout_v31(s,cashier,req2);
  RAISE EXCEPTION 'cancelled intent committed';
 EXCEPTION WHEN SQLSTATE 'P3103' THEN NULL; END;

 -- A fresh quote after safe cancel works, uses next receipt number only.
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,cashier,req3,q,3000);
 SELECT r.receipt_no,r.total_minor INTO ticket,price
 FROM zhirox_local.commit_checkout_v31(s,cashier,req3) r;
 IF ticket<>2 OR price<>3000 OR
    (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>1
    OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'new post-cancel checkout failed'; END IF;
 RAISE NOTICE 'V31 PASS: prepared persistence, crash replay, price rejection, safe cancel, receipt and stock';
END $$;
ROLLBACK;
