-- V70 synthetic sustained-load fixture, NEVER on real store data.
\set ON_ERROR_STOP on
BEGIN;
DO $v$
BEGIN
 IF current_database()<>'zhirox_v59_ci_test' OR current_user<>'localtest'
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id='10000000-0000-0000-0000-000000000059')<>11
 OR EXISTS(SELECT 1 FROM zhirox_local.products WHERE store_id='10000000-0000-0000-0000-000000000059' AND id='30000000-0000-0000-0000-000000000070')
 THEN RAISE EXCEPTION 'V70 denies non-disposable or already used dataset'; END IF;
END $v$;
INSERT INTO zhirox_local.products (store_id,id,name,price_minor,stock_base_units,base_unit)
VALUES('10000000-0000-0000-0000-000000000059','30000000-0000-0000-0000-000000000070',
'V70 synthetic 5-PC soak item',750,150,'unit');
INSERT INTO zhirox_local.barcodes (store_id,code,product_id,quantity_base_units,sale_mode)
VALUES('10000000-0000-0000-0000-000000000059','V70SOAKUNIT',
'30000000-0000-0000-0000-000000000070',1,'unit');
COMMIT;
