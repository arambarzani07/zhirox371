DO $$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000033';
 p uuid:='20000000-0000-0000-0000-000000000033';
 winner uuid;
 ticket bigint;
BEGIN
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1
    OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>0
    OR (SELECT count(*) FROM zhirox_local.sale_lines WHERE store_id=s)<>1
    OR (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s)<>1
    OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>1
    OR (SELECT next_no FROM zhirox_local.receipt_counters WHERE store_id=s)<>2
    OR (SELECT count(*) FROM zhirox_local.checkout_intents_v31 WHERE store_id=s AND state='committed')<>1
    OR (SELECT count(*) FROM zhirox_local.checkout_intents_v31 WHERE store_id=s AND state='prepared')<>1
 THEN RAISE EXCEPTION 'V33 concurrent last unit invariant failed'; END IF;
 SELECT cashier_id,receipt_no INTO winner,ticket
 FROM zhirox_local.sales WHERE store_id=s;
 IF ticket<>1 THEN RAISE EXCEPTION 'V33 receipt gap or duplication'; END IF;
 IF (SELECT total_minor FROM zhirox_local.sales WHERE store_id=s)<>1750
 THEN RAISE EXCEPTION 'V33 total mismatch'; END IF;
 RAISE NOTICE 'V33 PASS: 2 concurrent clients, only 1 sale, 1 outbox, 1 receipt, stock 0';
END $$;
