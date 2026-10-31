-- Real committed PostgreSQL transactions with SYNTHETIC test-market goods only.
\set ON_ERROR_STOP on
BEGIN;
DO $fixture$
DECLARE
 s uuid:='88000000-0000-4000-8000-000000000080';
 owner uuid:='88000000-0000-4000-8000-000000000081';
 sugar uuid:='88000000-0000-4000-8000-000000000092';
 water uuid:='88000000-0000-4000-8000-000000000091';
 order_id uuid:='83000000-0000-4000-8000-000000000004';
 request_id uuid:='89000000-0000-4000-8000-000000000001';
 return_req uuid:='89000000-0000-4000-8000-000000000002';
 future_water uuid:='88000000-0000-4000-8000-000000008803';
 sale4 uuid;
 lines jsonb;
 returned record;
BEGIN
 IF current_database()<>'zhirox_v80_disposable' OR current_user<>'v80test'
  OR (SELECT count(*) FROM zhirox_local.stores)<>1
  OR (SELECT name FROM zhirox_local.stores WHERE id=s)<>'مارکێتی تاقیکردنەوە'
 THEN RAISE EXCEPTION 'wrong isolated V89 test target'; END IF;
 lines:=jsonb_build_array(jsonb_build_object(
  'line_no',1,'lot_code','SUGAR-NEW-89','expires_on',(current_date+150)::text,
  'quantity_base_units',3));
 IF zhirox_local.receive_order_lots_v89(s,owner,order_id,request_id,lines)<>request_id
 OR zhirox_local.receive_order_lots_v89(s,owner,order_id,request_id,lines)<>request_id
 THEN RAISE EXCEPTION 'idempotent LOT supplier receiving failed'; END IF;
 SELECT id INTO sale4 FROM zhirox_local.sales WHERE store_id=s AND receipt_no=4;
 IF sale4 IS NULL THEN RAISE EXCEPTION 'V88 sale 4 not found'; END IF;
 SELECT * INTO returned FROM zhirox_local.return_opening_lot_v89(s,owner,sale4,1,
 future_water,return_req,1,true,'TEST 1 water from original future LOT restocked');
 IF returned.replayed OR returned.face_value_minor<>2500
 THEN RAISE EXCEPTION 'V89 correct original-price return failed'; END IF;
 SELECT * INTO returned FROM zhirox_local.return_opening_lot_v89(s,owner,sale4,1,
 future_water,return_req,1,true,'TEST 1 water from original future LOT restocked');
 IF NOT returned.replayed OR returned.face_value_minor<>2500
 THEN RAISE EXCEPTION 'V89 return replay failed'; END IF;
 IF (SELECT count(*) FROM zhirox_local.lot_receipt_lines_v89 WHERE store_id=s)<>1
 OR (SELECT count(*) FROM zhirox_local.goods_receipts_v83 WHERE store_id=s)<>2
 OR (SELECT count(*) FROM zhirox_local.lot_returns_v89 WHERE store_id=s)<>1
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=sugar)<>20
 OR (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=water)<>25
 OR (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>4
 OR (SELECT sum(total_minor) FROM zhirox_local.sales WHERE store_id=s)<>32500
 OR (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>4
 OR (SELECT sum(amount_minor) FROM zhirox_local.sale_returns_v84 WHERE store_id=s)<>8000
 THEN RAISE EXCEPTION 'V89 receipt, return, base stock, or gross sales mismatch'; END IF;
END $fixture$;
COMMIT;
