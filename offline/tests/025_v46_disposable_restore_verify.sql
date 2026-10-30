-- V46 run on RESTORED throwaway db after pg_restore. No new sale/write.
BEGIN;
DO $ci$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000056';
 c uuid:='20000000-0000-0000-0000-000000000056';
 sh uuid:='40000000-0000-0000-0000-000000000056';
 req uuid:='50000000-0000-0000-0000-000000000056';
 p uuid:='30000000-0000-0000-0000-000000000056';
 r record;
BEGIN
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1 OR
    (SELECT count(*) FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=s)<>1 OR
    (SELECT count(*) FROM zhirox_local.print_requests_v35 WHERE store_id=s)<>1 OR
    (SELECT count(*) FROM zhirox_local.event_outbox
     WHERE store_id=s AND event_type='sale.completed')<>1 OR
    (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'backup restore lost sale, receipt, outbox, stock or print job'; END IF;
 IF (SELECT stock_base_units FROM zhirox_local.products
    WHERE store_id=s AND id=p)<>3 OR
    (SELECT total_minor FROM zhirox_local.receipt_snapshots_v34
     WHERE store_id=s)<>2500 OR
    (SELECT width_mm FROM zhirox_local.print_requests_v35 WHERE store_id=s)<>80 OR
    (SELECT state FROM zhirox_local.print_requests_v35 WHERE store_id=s)<>'queued'
 THEN RAISE EXCEPTION 'restored stock/receipt/queued-not-printed state incorrect'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.cash_summary_v38(s,c,sh);
 IF r.cash_sales_minor<>2500 OR r.expected_minor<>3000 OR
    r.state<>'closed' OR r.counted_minor<>3000 OR r.variance_minor<>0
 THEN RAISE EXCEPTION 'restored shift/cash summary differs from original'; END IF;
 SELECT * INTO STRICT r FROM zhirox_local.commit_checkout_v31(s,c,req);
 IF NOT r.replayed OR r.receipt_no<>1 OR r.total_minor<>2500
 THEN RAISE EXCEPTION 'recovered receipt did not replay original UUID'; END IF;
 IF (SELECT count(*) FROM zhirox_local.sales WHERE store_id=s)<>1 OR
    (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=s AND id=p)<>3
 THEN RAISE EXCEPTION 'replayed checkout after restore double charged or changed stock'; END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.financial_integrity_audit_v45(s)
   WHERE case_count>0)
 THEN RAISE EXCEPTION 'backup restore manufactured bank anomalies in cash-only sale'; END IF;
 RAISE NOTICE 'V46 RESTORE PASS: complete schema+cash sale+stock+immutable receipt+queued print+closed drawer, replay unchanged';
END $ci$;
ROLLBACK;
