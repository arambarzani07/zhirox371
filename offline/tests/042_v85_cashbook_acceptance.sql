-- V85 negative acceptance: all attempts rolled back; never touch production.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 sh uuid:='85000000-0000-4000-8000-000000000001';
 new_sh uuid:='85000000-0000-4000-8000-000000000005';
 req uuid:='85000000-0000-4000-8000-000000000006';
 denied boolean;
 n bigint;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 THEN RAISE EXCEPTION 'V85 wrong DB'; END IF;
 IF zhirox_local.start_test_shift_v85(s,owner,cashier,sh,50000)<>sh
 THEN RAISE EXCEPTION 'idempotent shift retry failed'; END IF;
 IF zhirox_local.record_test_cash_movement_v85(s,owner,sh,
  '85000000-0000-4000-8000-000000000004','expense',3000,
  'TEST ONLY simulated packaging expense')<>53000
 THEN RAISE EXCEPTION 'idempotent expense retry changed amount'; END IF;
 IF zhirox_local.close_test_shift_v85(s,owner,sh,52500)<>53000
 THEN RAISE EXCEPTION 'idempotent close retry changed amount'; END IF;
 denied:=false;
 BEGIN
  n:=zhirox_local.close_test_shift_v85(s,owner,sh,53000);
 EXCEPTION WHEN SQLSTATE 'P8503' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'recount accepted after close'; END IF;
 denied:=false;
 BEGIN
  n:=zhirox_local.record_test_cash_movement_v85(s,owner,sh,req,
  'cash_in',999,'cannot add movement after shift close');
 EXCEPTION WHEN SQLSTATE 'P8503' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'closed shift accepts movement'; END IF;
 denied:=false;
 BEGIN
  n:=zhirox_local.record_test_cash_movement_v85(s,cashier,sh,req,
   'cash_in',1000,'cashier unauthorized write');
 EXCEPTION WHEN SQLSTATE 'P8501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier accepted in manager-only fixture'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.start_test_shift_v85(s,cashier,cashier,new_sh,2000);
 EXCEPTION WHEN SQLSTATE 'P8501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier could open test shift'; END IF;
 PERFORM zhirox_local.start_test_shift_v85(s,owner,cashier,new_sh,2000);
 denied:=false;
 BEGIN
  n:=zhirox_local.record_test_cash_movement_v85(s,owner,new_sh,req,
   'cash_out',2500,'cannot withdraw more than available');
 EXCEPTION WHEN SQLSTATE 'P8505' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'overwithdrawal accepted'; END IF;
 denied:=false;
 BEGIN
  n:=zhirox_local.record_test_cash_movement_v85(s,owner,new_sh,req,
   'expense',0,'reject zero amount');
 EXCEPTION WHEN SQLSTATE 'P8502' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'zero amount accepted'; END IF;
 denied:=false;
 BEGIN
  UPDATE zhirox_local.test_cash_movements_v85 SET amount_minor=1 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8504' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'movement history mutable'; END IF;
 denied:=false;
 BEGIN
  DELETE FROM zhirox_local.test_cash_shifts_v85 WHERE store_id=s AND shift_id=sh;
 EXCEPTION WHEN SQLSTATE 'P8504' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'closed shift deletable'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants
  WHERE grantee='PUBLIC' AND table_schema='zhirox_local' AND
  table_name IN('test_cash_shifts_v85','test_cash_movements_v85'))
 THEN RAISE EXCEPTION 'cashbook exposed to public'; END IF;
 IF (SELECT count(*) FROM zhirox_local.test_cash_movements_v85 WHERE store_id=s)<>3 OR
 (SELECT expected_minor FROM zhirox_local.test_cash_shifts_v85
  WHERE store_id=s AND shift_id=sh)<>53000 OR
 (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>11000 OR
 (SELECT sum(amount_minor) FROM zhirox_local.sale_returns_v84 WHERE store_id=s)<>5500
 THEN RAISE EXCEPTION 'cashbook or previous records corrupted'; END IF;
END $test$;
ROLLBACK;
