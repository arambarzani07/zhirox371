-- V90 authentic PostgreSQL transactions with synthetic trial values, single isolated market.
\set ON_ERROR_STOP on
BEGIN;
DO $fixture$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 cashier uuid:='88000000-0000-4000-8000-000000000082';
 water uuid:='88000000-0000-4000-8000-000000000091';
 sugar uuid:='88000000-0000-4000-8000-000000000092';
 request_id uuid:='90000000-0000-4000-8000-000000000001';
 returned_id uuid:='90000000-0000-4000-8000-000000000002';
 sale_reference uuid; r record; ret record;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'V90 may not operate outside isolated test store'; END IF;
 IF NOT zhirox_local.activate_unified_fefo_v90(s,owner)
 THEN RAISE EXCEPTION 'unified opening+receiving+returned stock refused correct reconciliation'; END IF;
 SELECT * INTO r FROM zhirox_local.checkout_unified_fefo_v90(s,cashier,request_id,
  jsonb_build_array(jsonb_build_object('product_id',water,'qty',1),
    jsonb_build_object('product_id',sugar,'qty',18)));
 IF r.replayed OR r.receipt_no<>5 OR r.total_minor<>56500
 THEN RAISE EXCEPTION 'V90 FEFO sample receipt wrong'; END IF;
 sale_reference:=r.sale_id;
 SELECT * INTO r FROM zhirox_local.checkout_unified_fefo_v90(s,cashier,request_id,
  jsonb_build_array(jsonb_build_object('product_id',water,'qty',1),
    jsonb_build_object('product_id',sugar,'qty',18)));
 IF NOT r.replayed OR r.sale_id<>sale_reference
 THEN RAISE EXCEPTION 'V90 sale replay created another receipt'; END IF;
 -- Sugar line #2 must use all 17 remaining V88 opening units before
 -- consuming 1 of the 3 newly received V89 sugar units.
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.lot_sale_allocations_v90 a
   WHERE a.store_id=s AND a.sale_id=sale_reference AND a.line_no=2
   AND a.allocation_no=1 AND a.opening_id='88000000-0000-4000-8000-000000008804'
   AND a.quantity_base_units=17)
 OR NOT EXISTS(SELECT 1 FROM zhirox_local.lot_sale_allocations_v90 a
   WHERE a.store_id=s AND a.sale_id=sale_reference AND a.line_no=2
   AND a.allocation_no=2 AND a.receipt_id='89000000-0000-4000-8000-000000000001'
   AND a.receipt_line_no=1 AND a.quantity_base_units=1)
 THEN RAISE EXCEPTION 'V90 failed to consume newly received supplier LOT'; END IF;
 SELECT * INTO ret FROM zhirox_local.return_unified_lot_v90(
 s,owner,sale_reference,2,2,returned_id,1,true,
 'TEST one newly received sugar returned to original supplier LOT');
 IF ret.replayed OR ret.face_value_minor<>3000
 THEN RAISE EXCEPTION 'V90 tagged receipt LOT return incorrect'; END IF;
 SELECT * INTO ret FROM zhirox_local.return_unified_lot_v90(
 s,owner,sale_reference,2,2,returned_id,1,true,
 'TEST one newly received sugar returned to original supplier LOT');
 IF NOT ret.replayed OR ret.face_value_minor<>3000
 THEN RAISE EXCEPTION 'V90 returned item double counted'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>5
 OR (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>89000
 OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>5
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=water)<>24
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=sugar)<>3
 OR (SELECT count(*) FROM zhirox_local.lot_checkouts_v90 WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.lot_sale_allocations_v90 WHERE store_id=s)<>3
 OR (SELECT count(*) FROM zhirox_local.lot_returns_v90 WHERE store_id=s)<>1
 OR (SELECT sum(amount_minor) FROM zhirox_local.sale_returns_v84 WHERE store_id=s)<>11000
 OR (SELECT sum(tracked_remaining) FROM zhirox_local.lot_inventory_v90 WHERE store_id=s AND product_id=water)<>24
 OR (SELECT sum(tracked_remaining) FROM zhirox_local.lot_inventory_v90 WHERE store_id=s AND product_id=sugar)<>3
 OR (SELECT tracked_remaining FROM zhirox_local.lot_inventory_v90
    WHERE store_id=s AND lot_code='SUGAR-NEW-89')<>3
 THEN RAISE EXCEPTION 'V90 checkout, restock, global stock or lot view out of sync'; END IF;
END $fixture$;
COMMIT;
