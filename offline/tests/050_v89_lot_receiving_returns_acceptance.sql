-- V89 adversarial rollback-only isolated PostgreSQL checks.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 open_order uuid:='83000000-0000-4000-8000-000000000004';
 recv_req uuid:='89000000-0000-4000-8000-000000000001';
 old_req uuid:='89000000-0000-4000-8000-000000000002';
 new_req uuid:='89000000-0000-4000-8000-000000000003';
 future_water uuid:='88000000-0000-4000-8000-000000008803';
 sale4 uuid; denied boolean;
 lines jsonb; cash_before bigint; gross_before bigint; qty_before bigint;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 THEN RAISE EXCEPTION 'V89 wrong test DB'; END IF;
 SELECT id INTO sale4 FROM zhirox_local.sales WHERE store_id=s AND receipt_no=4;
 SELECT count(*) INTO cash_before FROM zhirox_local.sale_returns_v84 WHERE store_id=s;
 SELECT sum(total_minor) INTO gross_before FROM zhirox_local.sales WHERE store_id=s;
 SELECT sum(stock_base_units) INTO qty_before FROM zhirox_local.products WHERE store_id=s;
 lines:=jsonb_build_array(jsonb_build_object('line_no',1,
  'lot_code','SUGAR-NEW-89','expires_on',(current_date+150)::text,'quantity_base_units',3));
 denied:=false;
 BEGIN
  PERFORM zhirox_local.receive_order_lots_v89(s,cashier,open_order,new_req,lines);
 EXCEPTION WHEN SQLSTATE 'P8801' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier can receive LOT'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.receive_order_lots_v89(s,owner,open_order,recv_req,
   jsonb_build_array(jsonb_build_object('line_no',1,'lot_code','SUGAR-NEW-89',
     'expires_on',(current_date+150)::text,'quantity_base_units',2)));
 EXCEPTION WHEN SQLSTATE 'P8903' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'receipt replay changed quantity'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.receive_order_lots_v89(s,owner,open_order,new_req,lines);
 EXCEPTION WHEN SQLSTATE 'P8902' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'already received order was received twice'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.return_opening_lot_v89(s,cashier,sale4,1,future_water,
    new_req,1,true,'cashier must not perform original-Lot return');
 EXCEPTION WHEN SQLSTATE 'P8801' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier wrote LOT return'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.return_opening_lot_v89(s,owner,sale4,1,future_water,
    old_req,1,false,'TEST 1 water from original future LOT restocked');
 EXCEPTION WHEN SQLSTATE 'P8903' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'return replay can change restock'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.return_opening_lot_v89(s,owner,sale4,1,future_water,
    new_req,1,true,'one future LOT only allocated once');
 EXCEPTION WHEN SQLSTATE 'P8905' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'returned more than allocated LOT quantity'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.return_opening_lot_v89(s,owner,sale4,2,future_water,
    new_req,1,true,'wrong original LOT for sugar product');
 EXCEPTION WHEN SQLSTATE 'P8902' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'wrong original product LOT accepted'; END IF;
 denied:=false;
 BEGIN
  UPDATE zhirox_local.lot_returns_v89 SET restocked=false WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8904' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable LOT return editable'; END IF;
 denied:=false;
 BEGIN
  DELETE FROM zhirox_local.lot_receipt_lines_v89 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8904' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable LOT receipt deletable'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.receive_purchase_order_v83(s,owner,open_order,new_req);
 EXCEPTION WHEN SQLSTATE 'P8303' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'legacy receipt replay was not constrained'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sale_returns_v84 WHERE store_id=s)<>cash_before
 OR (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>gross_before
 OR (SELECT sum(stock_base_units) FROM zhirox_local.products WHERE store_id=s)<>qty_before
 OR (SELECT count(*) FROM zhirox_local.lot_returns_v89 WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.lot_receipt_lines_v89 WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'failed action modified trial inventory or audit'; END IF;
END $test$;
ROLLBACK;
