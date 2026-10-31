-- V83 persist genuine test-only supplier purchase and inventory movements.
-- RUN IN CI zhirox_v80_disposable DATABASE ONLY; zero production writes.
\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 supplier uuid:='83000000-0000-4000-8000-000000000001';
 first_order uuid:='83000000-0000-4000-8000-000000000002';
 receive_id uuid:='83000000-0000-4000-8000-000000000003';
 second_order uuid:='83000000-0000-4000-8000-000000000004';
 p1 uuid:='88000000-0000-4000-8000-000000000091';
 p2 uuid:='88000000-0000-4000-8000-000000000092';
 lines jsonb; reply uuid;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
  OR (SELECT count(*) FROM zhirox_local.stores)<>1 OR
     (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'wrong disposable test DB/store'; END IF;
 reply:=zhirox_local.register_supplier_v83(s,owner,supplier,'دابینکەری نموونەی تاقیکردنەوە',NULL);
 IF reply<>supplier THEN RAISE EXCEPTION 'supplier not registered'; END IF;
 lines:=jsonb_build_array(
  jsonb_build_object('product_id',p1,'quantity_base_units',6,'unit_cost_minor',1900),
  jsonb_build_object('product_id',p2,'quantity_base_units',4,'unit_cost_minor',2200));
 reply:=zhirox_local.place_purchase_order_v83(s,owner,supplier,first_order,lines);
 IF reply<>first_order THEN RAISE EXCEPTION 'order not created'; END IF;
 reply:=zhirox_local.receive_purchase_order_v83(s,owner,first_order,receive_id);
 IF reply<>receive_id THEN RAISE EXCEPTION 'receipt not created'; END IF;
 -- Safe idempotent replay cannot double-increase inventory.
 reply:=zhirox_local.receive_purchase_order_v83(s,owner,first_order,receive_id);
 IF reply<>receive_id THEN RAISE EXCEPTION 'receive retry failed'; END IF;
 reply:=zhirox_local.place_purchase_order_v83(s,owner,supplier,second_order,
  jsonb_build_array(jsonb_build_object('product_id',p2,'quantity_base_units',3,'unit_cost_minor',2200)));
 IF reply<>second_order THEN RAISE EXCEPTION 'unreceived order absent'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p1)<>28
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p2)<>20
 OR (SELECT count(*) FROM zhirox_local.goods_receipt_lines_v83 WHERE store_id=s)<>2
 OR (SELECT count(*) FROM zhirox_local.goods_receipts_v83 WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.purchase_orders_v83 WHERE store_id=s)<>2
 OR (SELECT count(*) FROM zhirox_local.purchase_orders_v83 WHERE store_id=s AND status='ordered')<>1
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'goods receiving atomicity or sales separation failed'; END IF;
END $test$;
COMMIT;
