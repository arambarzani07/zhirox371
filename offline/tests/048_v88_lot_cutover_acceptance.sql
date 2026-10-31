-- Rollback-only negative acceptance in PostgreSQL single test market.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 water uuid:='88000000-0000-4000-8000-000000000091';
 sugar uuid:='88000000-0000-4000-8000-000000000092';
 new_req uuid:='88000000-0000-4000-8000-000000008806';
 old_req uuid:='88000000-0000-4000-8000-000000008805';
 sale3 uuid; denied boolean;
 before_count bigint; before_stock bigint; before_outbox bigint;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 THEN RAISE EXCEPTION 'incorrect V88 acceptance database'; END IF;
 SELECT count(*) INTO before_count FROM zhirox_local.sales WHERE store_id=s;
 SELECT sum(stock_base_units) INTO before_stock FROM zhirox_local.products WHERE store_id=s;
 SELECT count(*) INTO before_outbox FROM zhirox_local.event_outbox WHERE store_id=s;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_cash_v1(s,cashier,new_req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',1)));
 EXCEPTION WHEN SQLSTATE 'P8808' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'legacy V1 checkout bypassed cutover'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v87(s,cashier,new_req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',1)));
 EXCEPTION WHEN SQLSTATE 'P8808' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'old V87 test route bypassed V88 gate'; END IF;
 SELECT id INTO sale3 FROM zhirox_local.sales WHERE store_id=s AND receipt_no=3;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.record_sale_return_v84(s,owner,sale3,1,
   new_req,1,true,'TEST ONLY old return path prohibited after cutover');
 EXCEPTION WHEN SQLSTATE 'P8808' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'legacy return bypassed lot reconciliation'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.receive_purchase_order_v83(s,owner,
   '83000000-0000-4000-8000-000000000004',new_req);
 EXCEPTION WHEN SQLSTATE 'P8808' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'legacy supplier receiving bypassed lot gate'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v88(s,cashier,new_req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',23)));
 EXCEPTION WHEN SQLSTATE 'P8807' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'expired opening stock or excess LOT could sell'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v88(s,cashier,old_req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',1)));
 EXCEPTION WHEN SQLSTATE 'P8803' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'mutated replay accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v88(s,
   '88000000-0000-4000-8000-000000000099',new_req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',1)));
 EXCEPTION WHEN SQLSTATE 'P8801' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'unregistered actor accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.register_opening_lot_v88(s,owner,new_req,water,
   'TEST-LATE',current_date+20,1);
 EXCEPTION WHEN SQLSTATE 'P8803' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'opening counts changeable after cutover'; END IF;
 denied:=false;
 BEGIN
  UPDATE zhirox_local.opening_lot_counts_v88
   SET counted_qty=1 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8804' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable opening audit could change'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.activate_fefo_test_v88(s,owner);
 EXCEPTION WHEN SQLSTATE 'P8803' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'repeat cutover allowed'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>before_count
 OR (SELECT sum(stock_base_units) FROM zhirox_local.products WHERE store_id=s)<>before_stock
 OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>before_outbox
 OR (SELECT count(*) FROM zhirox_local.lot_sale_allocations_v88 WHERE store_id=s)<>3
 OR (SELECT count(*) FROM zhirox_local.sale_returns_v84 WHERE store_id=s)<>2
 OR (SELECT count(*) FROM zhirox_local.goods_receipts_v83 WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'blocked operation changed audit or physical test stock'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE
  grantee='PUBLIC' AND table_schema='zhirox_local'
  AND table_name IN('opening_lot_counts_v88','lot_cutovers_v88','lot_checkouts_v88','lot_sale_allocations_v88'))
 THEN RAISE EXCEPTION 'private test tables exposed'; END IF;
END $test$;
ROLLBACK;
