-- V39 persistent disposable fixture audit after two concurrent psql workers.
DO $verify$
DECLARE s uuid:='10000000-0000-0000-0000-000000000049';
 v_total bigint;v_count bigint;v_balance bigint;
BEGIN
 SELECT COALESCE(SUM(refund_minor),0),count(*) INTO v_total,v_count
 FROM zhirox_local.cash_refunds_v39 WHERE store_id=s;
 IF v_total<>1000 OR v_count<>1 THEN
  RAISE EXCEPTION 'concurrent refunds overdrew or lost funds: %, %',v_total,v_count; END IF;
 SELECT expected_minor INTO v_balance FROM zhirox_local.cash_summary_v39(
 s,'20000000-0000-0000-0000-000000000050',
 '40000000-0000-0000-0000-000000000050');
 IF v_balance<>0 THEN RAISE EXCEPTION 'remaining cash not zero: %',v_balance; END IF;
 IF (SELECT count(*) FROM zhirox_local.event_outbox
     WHERE store_id=s AND event_type='sale.line_refunded')<>1
 THEN RAISE EXCEPTION 'race recorded multiple outbox events'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.products
   WHERE store_id=s AND stock_base_units<>1) THEN
   RAISE EXCEPTION 'refund without restock mutated product stock'; END IF;
 RAISE NOTICE 'V39 PASS: two concurrent refunds, one available cash line';
END $verify$;
