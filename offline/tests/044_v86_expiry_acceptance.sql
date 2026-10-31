-- V86 rollback-only integrity assertions. Never delete real or test data.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 receipt uuid:='83000000-0000-4000-8000-000000000003';
 soon uuid:='86000000-0000-4000-8000-000000000002';
 other uuid:='86000000-0000-4000-8000-000000000004';
 denied boolean; stock_before bigint;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 THEN RAISE EXCEPTION 'V86 wrong database'; END IF;
 SELECT sum(stock_base_units) INTO stock_before FROM zhirox_local.products WHERE store_id=s;
 IF zhirox_local.register_expiry_lot_v86(s,owner,soon,receipt,1,
    'TEST-SOON-002',4,current_date+12)<>soon
 THEN RAISE EXCEPTION 'retry not idempotent'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.register_expiry_lot_v86(s,owner,soon,receipt,1,
   'TEST-SOON-002',3,current_date+12);
 EXCEPTION WHEN SQLSTATE 'P8603' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'changed replay accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.register_expiry_lot_v86(s,cashier,other,receipt,1,
   'TEST-OVER-004',1,current_date+4);
 EXCEPTION WHEN SQLSTATE 'P8601' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier can write expiry journal'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.register_expiry_lot_v86(s,owner,other,receipt,1,
   'TEST-OVER-004',1,current_date+4);
 EXCEPTION WHEN SQLSTATE 'P8605' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'overallocation of receipt line succeeded'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.register_expiry_lot_v86(s,owner,other,
   '86000000-0000-4000-8000-000000000099',1,
   'TEST-MISSING',1,current_date+4);
 EXCEPTION WHEN SQLSTATE 'P8602' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'unrelated receipt accepted'; END IF;
 denied:=false;
 BEGIN
  UPDATE zhirox_local.expiry_lots_v86 SET expires_on=current_date WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8604' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'expiry ledger mutated'; END IF;
 denied:=false;
 BEGIN
  DELETE FROM zhirox_local.expiry_lots_v86 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8604' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'expiry ledger deleted'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants
  WHERE grantee='PUBLIC' AND table_schema='zhirox_local'
    AND table_name='expiry_lots_v86')
 THEN RAISE EXCEPTION 'expiry lot records public'; END IF;
 IF (SELECT count(*) FROM zhirox_local.expiry_lots_v86 WHERE store_id=s)<>3
 OR (SELECT sum(stock_base_units) FROM zhirox_local.products WHERE store_id=s)<>stock_before
 OR (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>11000
 THEN RAISE EXCEPTION 'sale or inventory altered by expiry metadata'; END IF;
END $test$;
ROLLBACK;
