-- V90 real PostgreSQL adversarial checks, all attempted writes rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 water uuid:='88000000-0000-4000-8000-000000000091';
 sugar uuid:='88000000-0000-4000-8000-000000000092';
 req uuid:='90000000-0000-4000-8000-000000000003';
 old_req uuid:='90000000-0000-4000-8000-000000000001';
 sale5 uuid; denied boolean;
 before_gross bigint; before_stock bigint; before_events bigint;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 THEN RAISE EXCEPTION 'wrong V90 test database'; END IF;
 SELECT id INTO sale5 FROM zhirox_local.sales WHERE store_id=s AND receipt_no=5;
 SELECT sum(total_minor) INTO before_gross FROM zhirox_local.sales WHERE store_id=s;
 SELECT sum(stock_base_units) INTO before_stock FROM zhirox_local.products WHERE store_id=s;
 SELECT count(*) INTO before_events FROM zhirox_local.event_outbox WHERE store_id=s;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_fefo_test_v88(s,cashier,req,
   jsonb_build_array(jsonb_build_object('product_id',sugar,'qty',1)));
 EXCEPTION WHEN SQLSTATE 'P8808' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'previous V88 route bypassed V90 test pilot'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_cash_v1(s,cashier,req,
   jsonb_build_array(jsonb_build_object('product_id',sugar,'qty',1)));
 EXCEPTION WHEN SQLSTATE 'P8808' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'untracked legacy sale bypassed V90 pilot'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_unified_fefo_v90(s,cashier,req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',24)));
 EXCEPTION WHEN SQLSTATE 'P9007' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'expired water LOT was consumed'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_unified_fefo_v90(s,cashier,req,
   jsonb_build_array(jsonb_build_object('product_id',sugar,'qty',4)));
 EXCEPTION WHEN SQLSTATE '23514' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'checkout exceeded global stock'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_unified_fefo_v90(s,cashier,old_req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',1)));
 EXCEPTION WHEN SQLSTATE 'P9003' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'changed sale replay accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.checkout_unified_fefo_v90(s,cashier,req,
   jsonb_build_array(jsonb_build_object('product_id',water,'qty',1,'price_minor',1)));
 EXCEPTION WHEN SQLSTATE 'P9002' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'client-supplied price accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.return_unified_lot_v90(s,cashier,sale5,2,2,req,1,true,
   'cashier must not refund supplier LOT');
 EXCEPTION WHEN SQLSTATE 'P8801' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier refund accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.return_unified_lot_v90(s,owner,sale5,2,2,req,2,true,
   'attempt to over-return received sugar LOT');
 EXCEPTION WHEN SQLSTATE 'P9005' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'LOT over-return accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.return_unified_lot_v90(s,owner,sale5,2,99,req,1,true,
   'incorrect original LOT allocation');
 EXCEPTION WHEN SQLSTATE 'P9002' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'unknown sale LOT allocation accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.record_sale_return_v84(s,owner,sale5,2,req,1,true,
    'unattributed return may not restock');
 EXCEPTION WHEN SQLSTATE 'P8808' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'legacy V84 return bypassed LOT guard'; END IF;
 denied:=false;
 BEGIN
  UPDATE zhirox_local.lot_returns_v90 SET quantity_base_units=2 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P9004' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable V90 return audit changed'; END IF;
 denied:=false;
 BEGIN
  DELETE FROM zhirox_local.lot_sale_allocations_v90 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P9004' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable V90 allocation deleted'; END IF;
 IF (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>before_gross
 OR (SELECT sum(stock_base_units) FROM zhirox_local.products WHERE store_id=s)<>before_stock
 OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>before_events
 OR (SELECT count(*) FROM zhirox_local.lot_checkouts_v90 WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.lot_returns_v90 WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'rejected V90 operation leaked inventory/sale side effects'; END IF;
END $test$;
ROLLBACK;
