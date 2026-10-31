-- V85 isolated PostgreSQL fixture: actual committed SQL rows for SIMULATED accounting.
-- No real cash counted; fixture remains in restorable disposable PG test archive.
\set ON_ERROR_STOP on
BEGIN;
DO $fixture$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 actor uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 shift uuid:='85000000-0000-4000-8000-000000000001';
 v bigint;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test' OR
 (SELECT count(*) FROM zhirox_local.stores)<>1 OR
 (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'V85 refuses non-isolated test DB'; END IF;
 IF zhirox_local.start_test_shift_v85(s,actor,cashier,shift,50000)<>shift
 THEN RAISE EXCEPTION 'cannot create simulated test shift'; END IF;
 v:=zhirox_local.record_test_cash_movement_v85(s,actor,shift,
 '85000000-0000-4000-8000-000000000002','cash_in',10000,
 'TEST ONLY simulated cash-in, not real money');
 IF v<>60000 THEN RAISE EXCEPTION 'simulated cash in not reflected'; END IF;
 v:=zhirox_local.record_test_cash_movement_v85(s,actor,shift,
 '85000000-0000-4000-8000-000000000003','cash_out',4000,
 'TEST ONLY simulated cash-out, not real money');
 IF v<>56000 THEN RAISE EXCEPTION 'simulated cash out not reflected'; END IF;
 v:=zhirox_local.record_test_cash_movement_v85(s,actor,shift,
 '85000000-0000-4000-8000-000000000004','expense',3000,
 'TEST ONLY simulated packaging expense');
 IF v<>53000 THEN RAISE EXCEPTION 'simulated expense not reflected'; END IF;
 IF zhirox_local.close_test_shift_v85(s,actor,shift,52500)<>53000
 THEN RAISE EXCEPTION 'test shift expected cash wrong'; END IF;
 IF (SELECT variance_minor FROM zhirox_local.test_cash_shifts_v85
     WHERE store_id=s AND shift_id=shift)<>-500
 OR (SELECT count(*) FROM zhirox_local.test_cash_movements_v85
     WHERE store_id=s AND shift_id=shift)<>3
 OR (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>11000
 OR (SELECT coalesce(sum(amount_minor),0) FROM zhirox_local.sale_returns_v84
     WHERE store_id=s)<>5500
 THEN RAISE EXCEPTION 'simulated cashbook failed, or historical sales/refunds altered'; END IF;
END $fixture$;
COMMIT;
