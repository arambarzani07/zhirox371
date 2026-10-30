-- Persistent disposable fixture for two competing PostgreSQL cashier sessions.
-- CI uses two independent psql client processes after this seed commits.
BEGIN;
INSERT INTO zhirox_local.stores(id,name)
VALUES('10000000-0000-0000-0000-000000000033','V33 concurrent cashiers');
INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
VALUES('10000000-0000-0000-0000-000000000033',
 '20000000-0000-0000-0000-000000000033','V33 last unit',1750,1);
INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
VALUES('10000000-0000-0000-0000-000000000033',
 '6260053183991','20000000-0000-0000-0000-000000000033',1);
SELECT * FROM zhirox_local.prepare_checkout_v31(
 '10000000-0000-0000-0000-000000000033',
 '30000000-0000-0000-0000-000000000033',
 '40000000-0000-0000-0000-000000000033',
 '[{"barcode":"6260053183991","qty":1}]'::jsonb,1750);
SELECT * FROM zhirox_local.prepare_checkout_v31(
 '10000000-0000-0000-0000-000000000033',
 '30000000-0000-0000-0000-000000000034',
 '40000000-0000-0000-0000-000000000034',
 '[{"barcode":"6260053183991","qty":1}]'::jsonb,1750);
COMMIT;
