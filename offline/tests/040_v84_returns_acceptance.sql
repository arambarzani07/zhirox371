-- V84 test-only rollback assertions: role, replay, restock vs damaged,
-- out-of-bounds, immutable audit and untouched original sale.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 sale_uuid uuid;
 request_id uuid:='84000000-0000-4000-8000-000000000003';
 denied boolean;
 out_record record;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 THEN RAISE EXCEPTION 'V84 incorrect test target'; END IF;
 SELECT id INTO sale_uuid FROM zhirox_local.sales WHERE store_id=s AND receipt_no=1;
 denied:=false;
 BEGIN
  SELECT * INTO out_record FROM zhirox_local.record_sale_return_v84(
   s,cashier,sale_uuid,1,request_id,1,true,'cashier must not initiate return');
 EXCEPTION WHEN SQLSTATE 'P8401' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier can write returns'; END IF;
 denied:=false;
 BEGIN
  SELECT * INTO out_record FROM zhirox_local.record_sale_return_v84(
   s,owner,sale_uuid,1,'84000000-0000-4000-8000-000000000001',1,false,
   'TEST ONLY water returned, physically restocked');
 EXCEPTION WHEN SQLSTATE 'P8403' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'same request changed restock intent'; END IF;
 denied:=false;
 BEGIN
  SELECT * INTO out_record FROM zhirox_local.record_sale_return_v84(
   s,owner,sale_uuid,2,request_id,1,true,'try to re-return already returned sugar');
 EXCEPTION WHEN SQLSTATE 'P8405' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'sugar over-return accepted'; END IF;
 denied:=false;
 BEGIN
  SELECT * INTO out_record FROM zhirox_local.record_sale_return_v84(
   s,owner,sale_uuid,1,request_id,2,true,'try to return two more water units');
 EXCEPTION WHEN SQLSTATE 'P8405' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'water over-return accepted'; END IF;
 denied:=false;
 BEGIN
  SELECT * INTO out_record FROM zhirox_local.record_sale_return_v84(
   s,owner,'84000000-0000-4000-8000-000000000009',1,request_id,1,true,
   'sale does not exist');
 EXCEPTION WHEN SQLSTATE 'P8402' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'nonexistent sale accepted'; END IF;
 denied:=false;
 BEGIN
  SELECT * INTO out_record FROM zhirox_local.record_sale_return_v84(
   s,owner,sale_uuid,1,request_id,0,true,'zero quantity');
 EXCEPTION WHEN SQLSTATE 'P8402' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'invalid quantity accepted'; END IF;
 denied:=false;
 BEGIN
  UPDATE zhirox_local.sale_returns_v84 SET amount_minor=1 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8404' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable refund journal update accepted'; END IF;
 denied:=false;
 BEGIN
  DELETE FROM zhirox_local.sale_returns_v84 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8404' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable refund journal delete accepted'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants
 WHERE table_schema='zhirox_local' AND table_name='sale_returns_v84' AND grantee='PUBLIC')
 THEN RAISE EXCEPTION 'returns exposed to public'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sale_returns_v84 WHERE store_id=s)<>2
 OR (SELECT sum(amount_minor) FROM zhirox_local.sale_returns_v84 WHERE store_id=s)<>5500
 OR (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>11000
 OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'original sale or return ledger changed by denied actions'; END IF;
END $test$;
ROLLBACK;
