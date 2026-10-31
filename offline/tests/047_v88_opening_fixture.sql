-- Actual isolated PostgreSQL lab: manager-signed sample LOT count matching
-- product total, one-way test cutover and 4th cash sale on physical-count LOTs.
\set ON_ERROR_STOP on
BEGIN;
DO $fixture$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 water uuid:='88000000-0000-4000-8000-000000000091';
 sugar uuid:='88000000-0000-4000-8000-000000000092';
 expired uuid:='88000000-0000-4000-8000-000000008801';
 near_lot uuid:='88000000-0000-4000-8000-000000008802';
 future_lot uuid:='88000000-0000-4000-8000-000000008803';
 sugar_lot uuid:='88000000-0000-4000-8000-000000008804';
 req uuid:='88000000-0000-4000-8000-000000008805';
 payload jsonb;
 result_record record;
 first_sale uuid;
 denied boolean:=false;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'V88 fixture requires isolated test store'; END IF;
 PERFORM zhirox_local.register_opening_lot_v88(s,owner,expired,water,'TEST-EXP-001',
 current_date-3,2);
 denied:=false;
 BEGIN
  PERFORM zhirox_local.activate_fefo_test_v88(s,owner);
 EXCEPTION WHEN SQLSTATE 'P8805' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'incomplete physical opening reconciliation accepted'; END IF;
 PERFORM zhirox_local.register_opening_lot_v88(s,owner,near_lot,water,'TEST-SOON-002',
 current_date+12,1);
 PERFORM zhirox_local.register_opening_lot_v88(s,owner,future_lot,water,'TEST-FUTURE-004',
 current_date+120,23);
 PERFORM zhirox_local.register_opening_lot_v88(s,owner,sugar_lot,sugar,'TEST-SAFE-003',
 current_date+90,18);
 IF NOT zhirox_local.activate_fefo_test_v88(s,owner)
 THEN RAISE EXCEPTION 'V88 activation denied correct opening counts'; END IF;
 payload:=jsonb_build_array(jsonb_build_object('product_id',water,'qty',2),
   jsonb_build_object('product_id',sugar,'qty',1));
 SELECT * INTO result_record FROM zhirox_local.checkout_fefo_test_v88(
 s,cashier,req,payload);
 IF result_record.replayed OR result_record.receipt_no<>4
 OR result_record.total_minor<>8000 THEN RAISE EXCEPTION 'V88 test sale mismatch'; END IF;
 first_sale:=result_record.sale_id;
 SELECT * INTO result_record FROM zhirox_local.checkout_fefo_test_v88(
 s,cashier,req,payload);
 IF NOT result_record.replayed OR first_sale<>result_record.sale_id
 THEN RAISE EXCEPTION 'V88 retry duplicated sale'; END IF;
 IF (SELECT count(*) FROM zhirox_local.lot_cutovers_v88 WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.opening_lot_counts_v88 WHERE store_id=s)<>4
 OR (SELECT count(*) FROM zhirox_local.lot_sale_allocations_v88 WHERE store_id=s)<>3
 OR (SELECT sum(quantity_base_units) FROM zhirox_local.lot_sale_allocations_v88
 WHERE store_id=s AND opening_id=near_lot)<>1
 OR (SELECT sum(quantity_base_units) FROM zhirox_local.lot_sale_allocations_v88
 WHERE store_id=s AND opening_id=future_lot)<>1
 OR (SELECT sum(quantity_base_units) FROM zhirox_local.lot_sale_allocations_v88
 WHERE store_id=s AND opening_id=sugar_lot)<>1
 OR EXISTS(SELECT 1 FROM zhirox_local.lot_sale_allocations_v88
 WHERE store_id=s AND opening_id=expired)
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=water)<>24
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=sugar)<>17
 OR (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>32500
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>4
 OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>4
 THEN RAISE EXCEPTION 'V88 LOT allocations, stock, receipts or outbox invalid'; END IF;
END $fixture$;
COMMIT;
