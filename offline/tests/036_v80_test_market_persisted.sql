-- V80: persisted real SQL actions in a disposable separated PostgreSQL store.
-- DO NOT delete data. Fixture remains inside the isolated DB until it is retired.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 a uuid:='88000000-0000-4000-8000-000000000081';
 c uuid:='88000000-0000-4000-8000-000000000082';
 p1 uuid:='88000000-0000-4000-8000-000000000091';
 p2 uuid:='88000000-0000-4000-8000-000000000092';
 customer uuid:='88000000-0000-4000-8000-0000000000a1';
 r uuid:='88000000-0000-4000-8000-0000000000b1';
 receipt record;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 THEN RAISE EXCEPTION 'V80 refuses wrong database/user'; END IF;
 IF (SELECT count(*) FROM zhirox_local.stores)<>1 OR
    (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'test account absent or cross-store contamination'; END IF;
 IF (SELECT count(*) FROM zhirox_local.local_users WHERE store_id=s)<>2 OR
    (SELECT role FROM zhirox_local.local_users WHERE store_id=s AND id=a)<>'owner' OR
    (SELECT role FROM zhirox_local.local_users WHERE store_id=s AND id=c)<>'cashier' OR
    EXISTS(SELECT 1 FROM zhirox_local.local_users WHERE store_id=s AND password_hash NOT LIKE 'scrypt-v1:%')
 THEN RAISE EXCEPTION 'real hashed test logins not created'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>2 OR
    (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>11000 OR
    (SELECT array_agg(receipt_no ORDER BY receipt_no) FROM zhirox_local.sales WHERE store_id=s)<>ARRAY[1::bigint,2::bigint]
 THEN RAISE EXCEPTION 'cash register did not record 2 real test sales'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p1)<>22 OR
    (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p2)<>16 OR
    (SELECT count(*) FROM zhirox_local.sale_lines WHERE store_id=s)<>3 OR
    (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s)<>3 OR
    (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'sale stock, receipt and outbox not consistent'; END IF;
 IF (SELECT count(*) FROM zhirox_local.customers_v79 WHERE store_id=s)<>1 OR
    (SELECT count(*) FROM zhirox_local.customer_debt_ledger_v79 WHERE store_id=s)<>2 OR
    (SELECT balance_minor FROM zhirox_local.customer_debt_balances_v79
      WHERE store_id=s AND customer_id=customer)<>10000
 THEN RAISE EXCEPTION 'customer and debt accounting records mismatch'; END IF;
 SELECT * INTO receipt FROM zhirox_local.checkout_cash_v1(
   s,c,r,jsonb_build_array(jsonb_build_object('product_id',p1,'qty',2),
                              jsonb_build_object('product_id',p2,'qty',1)));
 IF NOT receipt.replayed OR receipt.receipt_no<>1 OR
    (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'replayed cashier action created another real sale'; END IF;
END $test$;
ROLLBACK;
