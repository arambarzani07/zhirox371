-- V87 negative/rollback safeguards on real disposable PostgreSQL.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 water uuid:='88000000-0000-4000-8000-000000000091';
 sugar uuid:='88000000-0000-4000-8000-000000000092';
 req uuid:='87000000-0000-4000-8000-000000000002';
 original uuid:='87000000-0000-4000-8000-000000000001';
 denied boolean;
 before_count integer; before_stock bigint;
 lines jsonb;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 THEN RAISE EXCEPTION 'V87 wrong database'; END IF;
 SELECT count(*) INTO before_count FROM zhirox_local.sales WHERE store_id=s;
 SELECT sum(stock_base_units) INTO before_stock FROM zhirox_local.products WHERE store_id=s;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v87(s,cashier,req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',2)));
 EXCEPTION WHEN SQLSTATE 'P8705' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'expired water lot was used or over-allocation succeeded'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v87(s,cashier,req,
   jsonb_build_array(jsonb_build_object('product_id',sugar,'qty',3)));
 EXCEPTION WHEN SQLSTATE 'P8705' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'insufficient sugar LOT allocation was allowed'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v87(s,cashier,original,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',1),
    jsonb_build_object('product_id',sugar,'qty',2)));
 EXCEPTION WHEN SQLSTATE 'P8703' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'changed request ID replay accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v87(s,
   '87000000-0000-4000-8000-000000000099',req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',1)));
 EXCEPTION WHEN SQLSTATE 'P8701' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'unregistered actor checkout accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v87(s,cashier,req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',0)));
 EXCEPTION WHEN SQLSTATE 'P8702' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'zero quantity accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v87(s,cashier,req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',1,
    'price_minor',1)));
 EXCEPTION WHEN SQLSTATE 'P8702' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'client supplied price accepted'; END IF;
 denied:=false;
 BEGIN
  UPDATE zhirox_local.lot_sale_allocations_v87
  SET quantity_base_units=1 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8704' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'lot allocation update accepted'; END IF;
 denied:=false;
 BEGIN
  DELETE FROM zhirox_local.lot_checkouts_v87 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8704' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'lot sale deletion accepted'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>before_count
 OR (SELECT count(*) FROM zhirox_local.lot_checkouts_v87 WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>3
 OR (SELECT sum(stock_base_units) FROM zhirox_local.products WHERE store_id=s)<>before_stock
 THEN RAISE EXCEPTION 'rejected V87 sale modified durable inventory/outbox/sales'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants
  WHERE grantee='PUBLIC' AND table_schema='zhirox_local'
  AND table_name IN('lot_checkouts_v87','lot_sale_allocations_v87'))
 THEN RAISE EXCEPTION 'V87 LOT tables exposed to PUBLIC'; END IF;
END $test$;
ROLLBACK;
