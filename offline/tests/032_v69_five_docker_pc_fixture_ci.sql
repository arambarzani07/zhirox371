-- V69 REAL container-LAN acceptance: disposable fixtures ONLY.
\set ON_ERROR_STOP on
BEGIN;
DO $s$
BEGIN
 IF current_database()<>'zhirox_v59_ci_test' OR current_user<>'localtest'
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id='10000000-0000-0000-0000-000000000059')<>7
 OR (SELECT count(*) FROM zhirox_local.local_users WHERE store_id='10000000-0000-0000-0000-000000000059' AND username LIKE 'v68-cashier-%')<>5
 OR EXISTS(SELECT 1 FROM zhirox_local.products WHERE id='30000000-0000-0000-0000-000000000069')
 THEN RAISE EXCEPTION 'V69 refuses wrong database, missing prerequisites or reused store'; END IF;
END $s$;
INSERT INTO zhirox_local.products
 (store_id,id,name,price_minor,stock_base_units,base_unit)
VALUES
 ('10000000-0000-0000-0000-000000000059',
  '30000000-0000-0000-0000-000000000069',
  'V69 Synthetic 5-PC LAN Stock Race',1500,7,'unit');
INSERT INTO zhirox_local.barcodes
 (store_id,code,product_id,quantity_base_units,sale_mode)
VALUES
 ('10000000-0000-0000-0000-000000000059',
  'V69LANMULTI','30000000-0000-0000-0000-000000000069',1,'unit');
COMMIT;
