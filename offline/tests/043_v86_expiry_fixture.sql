-- Genuine committed test data, not actual physical expiry inspection.
\set ON_ERROR_STOP on
BEGIN;
DO $fixture$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 actor uuid:='88000000-0000-4000-8000-000000000081';
 water uuid:='88000000-0000-4000-8000-000000000091';
 sugar uuid:='88000000-0000-4000-8000-000000000092';
 a uuid:='86000000-0000-4000-8000-000000000001';
 b uuid:='86000000-0000-4000-8000-000000000002';
 c uuid:='86000000-0000-4000-8000-000000000003';
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test' OR
 (SELECT count(*) FROM zhirox_local.stores)<>1 OR
 (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'V86 refuses non-isolated database'; END IF;
 IF zhirox_local.register_expiry_lot_v86(s,actor,a,water,'TEST-EXPIRED-WATER',
   CURRENT_DATE-2,5)<>a THEN RAISE EXCEPTION 'expired fixture missing'; END IF;
 IF zhirox_local.register_expiry_lot_v86(s,actor,b,sugar,'TEST-SOON-SUGAR',
   CURRENT_DATE+12,4)<>b THEN RAISE EXCEPTION 'soon fixture missing'; END IF;
 IF zhirox_local.register_expiry_lot_v86(s,actor,c,water,'TEST-FUTURE-WATER',
   CURRENT_DATE+120,6)<>c THEN RAISE EXCEPTION 'later fixture missing'; END IF;
 IF zhirox_local.register_expiry_lot_v86(s,actor,a,water,'TEST-EXPIRED-WATER',
   CURRENT_DATE-2,5)<>a THEN RAISE EXCEPTION 'exact retry failed'; END IF;
 IF (SELECT count(*) FROM zhirox_local.expiry_watch_v86 WHERE store_id=s)<>3 OR
 (SELECT count(*) FROM zhirox_local.expiry_watch_v86 WHERE store_id=s AND expiry_state='expired')<>1 OR
 (SELECT count(*) FROM zhirox_local.expiry_watch_v86 WHERE store_id=s AND expiry_state='soon')<>1 OR
 (SELECT count(*) FROM zhirox_local.expiry_watch_v86 WHERE store_id=s AND expiry_state='later')<>1 OR
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=water)<>29 OR
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=sugar)<>20 OR
 (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'expiry registry changed stock or fabricated sales'; END IF;
END $fixture$;
COMMIT;
