-- Genuine SQL fixture for isolated test market, persisted (never a real payout).
\set ON_ERROR_STOP on
BEGIN;
DO $fixture$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 manager uuid:='88000000-0000-4000-8000-000000000081';
 water uuid:='88000000-0000-4000-8000-000000000091';
 sugar uuid:='88000000-0000-4000-8000-000000000092';
 sale_uuid uuid;
 r1 uuid:='84000000-0000-4000-8000-000000000001';
 r2 uuid:='84000000-0000-4000-8000-000000000002';
 v record;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'refuse non-isolated V84 fixture'; END IF;
 SELECT id INTO sale_uuid FROM zhirox_local.sales WHERE store_id=s AND receipt_no=1;
 IF sale_uuid IS NULL THEN RAISE EXCEPTION 'missing sale fixture'; END IF;
 SELECT * INTO v FROM zhirox_local.record_sale_return_v84(
 s,manager,sale_uuid,1,r1,1,true,'TEST ONLY water returned, physically restocked');
 IF v.refund_amount_minor<>2500 OR v.replayed
 THEN RAISE EXCEPTION 'water return incorrect'; END IF;
 SELECT * INTO v FROM zhirox_local.record_sale_return_v84(
 s,manager,sale_uuid,2,r2,1,false,'TEST ONLY sugar damaged, no restock');
 IF v.refund_amount_minor<>3000 OR v.replayed
 THEN RAISE EXCEPTION 'damaged sugar return incorrect'; END IF;
 SELECT * INTO v FROM zhirox_local.record_sale_return_v84(
 s,manager,sale_uuid,1,r1,1,true,'TEST ONLY water returned, physically restocked');
 IF NOT v.replayed OR v.refund_amount_minor<>2500
 THEN RAISE EXCEPTION 'idempotent return retry incorrect'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sale_returns_v84 WHERE store_id=s)<>2
 OR (SELECT coalesce(sum(amount_minor),0) FROM zhirox_local.sale_returns_v84 WHERE store_id=s)<>5500
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=water)<>29
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=sugar)<>20
 OR (SELECT coalesce(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=s)<>11000
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>2
 THEN RAISE EXCEPTION 'return journal, stock or original sale corrupted'; END IF;
END $fixture$;
COMMIT;
