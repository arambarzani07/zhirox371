-- V83 isolation acceptance. Every attempted mutation rolled back.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 supplier uuid:='83000000-0000-4000-8000-000000000001';
 purchase uuid:='83000000-0000-4000-8000-000000000002';
 r uuid:='83000000-0000-4000-8000-000000000003';
 open_order uuid:='83000000-0000-4000-8000-000000000004';
 another uuid:='83000000-0000-4000-8000-000000000008';
 p1 uuid:='88000000-0000-4000-8000-000000000091';
 p2 uuid:='88000000-0000-4000-8000-000000000092';
 lines jsonb; denied boolean;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 THEN RAISE EXCEPTION 'wrong V83 acceptance DB'; END IF;
 lines:=jsonb_build_array(jsonb_build_object('product_id',p1,'quantity_base_units',6,'unit_cost_minor',1900),
 jsonb_build_object('product_id',p2,'quantity_base_units',4,'unit_cost_minor',2200));
 IF zhirox_local.place_purchase_order_v83(s,owner,supplier,purchase,lines)<>purchase
 THEN RAISE EXCEPTION 'idempotent purchase replay did not match'; END IF;
 IF zhirox_local.receive_purchase_order_v83(s,owner,purchase,r)<>r
 THEN RAISE EXCEPTION 'idempotent receipt replay did not match'; END IF;
 denied:=false;
 BEGIN
 PERFORM zhirox_local.place_purchase_order_v83(s,owner,supplier,purchase,
 jsonb_build_array(jsonb_build_object('product_id',p1,'quantity_base_units',5,'unit_cost_minor',1900)));
 EXCEPTION WHEN SQLSTATE 'P8303' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'changed order replay accepted'; END IF;
 denied:=false;
 BEGIN
 PERFORM zhirox_local.receive_purchase_order_v83(s,owner,purchase,another);
 EXCEPTION WHEN SQLSTATE 'P8303' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'second receipt double counted'; END IF;
 denied:=false;
 BEGIN
 PERFORM zhirox_local.receive_purchase_order_v83(s,cashier,open_order,another);
 EXCEPTION WHEN SQLSTATE 'P8301' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier can receive goods'; END IF;
 denied:=false;
 BEGIN
 PERFORM zhirox_local.place_purchase_order_v83(s,cashier,supplier,another,lines);
 EXCEPTION WHEN SQLSTATE 'P8301' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier can place order'; END IF;
 denied:=false;
 BEGIN
 PERFORM zhirox_local.place_purchase_order_v83(s,owner,supplier,another,
 jsonb_build_array(jsonb_build_object('product_id',p1,'quantity_base_units',3,'unit_cost_minor',1400),
 jsonb_build_object('product_id',p1,'quantity_base_units',2,'unit_cost_minor',1400)));
 EXCEPTION WHEN SQLSTATE 'P8302' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'duplicate product allowed'; END IF;
 denied:=false;
 BEGIN
 PERFORM zhirox_local.place_purchase_order_v83(s,owner,supplier,another,
 jsonb_build_array(jsonb_build_object('product_id','83000000-0000-4000-8000-000000000099',
 'quantity_base_units',1,'unit_cost_minor',10)));
 EXCEPTION WHEN SQLSTATE 'P8302' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'foreign/nonexistent product allowed'; END IF;
 denied:=false;
 BEGIN
 UPDATE zhirox_local.goods_receipt_lines_v83 SET quantity_base_units=1 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8304' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable receipt lines can be changed'; END IF;
 denied:=false;
 BEGIN
 DELETE FROM zhirox_local.goods_receipts_v83 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE 'P8304' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable receipts can be deleted'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p1)<>28
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p2)<>20
 OR (SELECT count(*) FROM zhirox_local.goods_receipts_v83 WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.goods_receipt_lines_v83 WHERE store_id=s)<>2
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>2
 OR (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>11000
 THEN RAISE EXCEPTION 'stock inventory or cashier amounts were corrupted'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants
 WHERE grantee='PUBLIC' AND table_schema='zhirox_local'
 AND table_name IN('suppliers_v83','purchase_orders_v83','goods_receipts_v83'))
 THEN RAISE EXCEPTION 'supplier private tables exposed to public'; END IF;
END $test$;
ROLLBACK;
