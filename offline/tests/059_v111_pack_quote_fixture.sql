-- V111 synthetic, isolated V97/V90 test market only. Appenditive demo barcodes.
BEGIN;
DO $fixture$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 water uuid:='88000000-0000-4000-8000-000000000091';
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores WHERE id=s)
   IS DISTINCT FROM 'مارکێتی تاقیکردنەوە'
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>8
 OR (SELECT stock_base_units FROM zhirox_local.products
     WHERE store_id=s AND id=water)<>24
 OR EXISTS(SELECT 1 FROM zhirox_local.barcodes
     WHERE store_id=s AND code LIKE 'V111-%')
 THEN RAISE EXCEPTION 'V111 fixture requires V97 exact isolated state'; END IF;
 INSERT INTO zhirox_local.barcodes(
   store_id,code,product_id,quantity_base_units,active,
   sale_mode,sale_price_minor,display_name)
 VALUES
   (s,'V111-BUNDLE',water,6,true,'bundle',2700,'دەستەی ئاوی تاقیکردنەوە'),
   (s,'V111-BUNDLE-ALIAS',water,6,true,'bundle',2700,'دەستەی ئاوی تاقیکردنەوە'),
   (s,'V111-SET',water,3,true,'set',2800,'سێتی ئاوی تاقیکردنەوە');
 IF (SELECT count(*) FROM zhirox_local.barcodes
    WHERE store_id=s AND sale_mode IN ('bundle','set'))<>3
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>8
 THEN RAISE EXCEPTION 'V111 fixture modified finance or missed pack barcode'; END IF;
END $fixture$;
COMMIT;
