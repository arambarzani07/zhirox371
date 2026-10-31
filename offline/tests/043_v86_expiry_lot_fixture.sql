-- V86 isolated CI test store: genuine committed PostgreSQL lot registrations,
-- synthetic quantities, no new stock or fake batch-level remaining balances.
\set ON_ERROR_STOP on
BEGIN;
DO $fixture$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 receipt uuid:='83000000-0000-4000-8000-000000000003';
 expired uuid:='86000000-0000-4000-8000-000000000001';
 soon uuid:='86000000-0000-4000-8000-000000000002';
 safe uuid:='86000000-0000-4000-8000-000000000003';
 before_stock bigint;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'V86 refuses wrong database or market'; END IF;
 SELECT COALESCE(sum(stock_base_units),0) INTO before_stock
 FROM zhirox_local.products WHERE store_id=s;
 IF zhirox_local.register_expiry_lot_v86(s,owner,expired,receipt,1,
  'TEST-EXP-001',2,current_date-3)<>expired THEN
  RAISE EXCEPTION 'expired lot not registered'; END IF;
 IF zhirox_local.register_expiry_lot_v86(s,owner,soon,receipt,1,
  'TEST-SOON-002',4,current_date+12)<>soon THEN
  RAISE EXCEPTION 'near-term lot not registered'; END IF;
 IF zhirox_local.register_expiry_lot_v86(s,owner,safe,receipt,2,
  'TEST-SAFE-003',4,current_date+90)<>safe THEN
  RAISE EXCEPTION 'long-term lot not registered'; END IF;
 IF (SELECT count(*) FROM zhirox_local.expiry_lots_v86 WHERE store_id=s)<>3
 OR (SELECT sum(received_qty_base_units) FROM zhirox_local.expiry_lots_v86
   WHERE store_id=s AND receipt_line_no=1)<>6
 OR (SELECT sum(received_qty_base_units) FROM zhirox_local.expiry_lots_v86
   WHERE store_id=s AND receipt_line_no=2)<>4
 OR (SELECT COALESCE(sum(stock_base_units),0) FROM zhirox_local.products
   WHERE store_id=s)<>before_stock THEN
  RAISE EXCEPTION 'expiry lots changed stock or exceeded received quantity'; END IF;
END $fixture$;
COMMIT;
