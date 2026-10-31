-- V87 genuine committed synthetic LOT-scoped checkout, isolated disposable DB only.
\set ON_ERROR_STOP on
BEGIN;
DO $fixture$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 water uuid:='88000000-0000-4000-8000-000000000091';
 sugar uuid:='88000000-0000-4000-8000-000000000092';
 near_lot uuid:='86000000-0000-4000-8000-000000000002';
 future_lot uuid:='86000000-0000-4000-8000-000000000003';
 expired_lot uuid:='86000000-0000-4000-8000-000000000001';
 request_id uuid:='87000000-0000-4000-8000-000000000001';
 payload jsonb;
 first_sale uuid;
 row_data record;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'V87 fixture outside isolated market'; END IF;
 payload:=jsonb_build_array(
  jsonb_build_object('product_id',water,'qty',3),
  jsonb_build_object('product_id',sugar,'qty',2));
 SELECT * INTO row_data FROM zhirox_local.checkout_fefo_test_v87(s,cashier,request_id,payload);
 IF row_data.replayed OR row_data.receipt_no<>3 OR row_data.total_minor<>13500
 THEN RAISE EXCEPTION 'FEFO test sale wrong'; END IF;
 first_sale:=row_data.sale_id;
 SELECT * INTO row_data FROM zhirox_local.checkout_fefo_test_v87(s,cashier,request_id,payload);
 IF NOT row_data.replayed OR row_data.sale_id<>first_sale THEN
  RAISE EXCEPTION 'FEFO retry not idempotent'; END IF;
 IF (SELECT count(*) FROM zhirox_local.lot_checkouts_v87 WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.lot_sale_allocations_v87 WHERE store_id=s)<>2
 OR (SELECT quantity_base_units FROM zhirox_local.lot_sale_allocations_v87
   WHERE store_id=s AND batch_id=near_lot)<>3
 OR (SELECT quantity_base_units FROM zhirox_local.lot_sale_allocations_v87
   WHERE store_id=s AND batch_id=future_lot)<>2
 OR EXISTS(SELECT 1 FROM zhirox_local.lot_sale_allocations_v87
   WHERE store_id=s AND batch_id=expired_lot)
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=water)<>26
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=sugar)<>18
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>3
 OR (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>24500
 OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>3
 THEN RAISE EXCEPTION 'V87 receipt/stock/LOT/outbox mismatch'; END IF;
END $fixture$;
COMMIT;
