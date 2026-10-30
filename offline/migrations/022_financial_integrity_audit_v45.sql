-- V45 provider-neutral discrepancy audit. Read-only, disposable lab only.
-- None of the values proves that money reached a real bank account.
BEGIN;
CREATE OR REPLACE FUNCTION zhirox_local.financial_integrity_audit_v45(p_store uuid)
RETURNS TABLE(check_code text,case_count bigint,proposed_external_minor numeric,
 severity text)
LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $v45$
 WITH events AS (
  SELECT i.request_id,i.cashier_id,i.state AS intent_state,
   i.expected_total_minor,p.cash_minor,p.external_minor,p.external_method,
   h.state AS hold_state,h.expires_at,s.id AS sale_id,
   s.total_minor AS sale_total_minor,e.request_id AS evidence_id,
   e.amount_minor AS evidence_minor
  FROM zhirox_local.tender_plans_v41 p
  JOIN zhirox_local.checkout_intents_v31 i
   ON i.store_id=p.store_id AND i.request_id=p.request_id
  LEFT JOIN zhirox_local.inventory_reservation_sessions_v43 h
   ON h.store_id=p.store_id AND h.request_id=p.request_id
  LEFT JOIN zhirox_local.sales s
   ON s.store_id=p.store_id AND s.request_id=p.request_id
  LEFT JOIN zhirox_local.external_settlements_v42 e
   ON e.store_id=p.store_id AND e.request_id=p.request_id
  WHERE p.store_id=p_store AND p.external_minor>0
 ),
 findings AS (
  SELECT 'evidence_pending_sale'::text AS code,external_minor
    FROM events WHERE evidence_id IS NOT NULL AND intent_state='prepared'
  UNION ALL
  SELECT 'evidence_cancelled_intent',external_minor
    FROM events WHERE evidence_id IS NOT NULL AND intent_state='cancelled'
  UNION ALL
  SELECT 'expired_held_stock',external_minor
    FROM events WHERE intent_state='prepared' AND hold_state='held'
      AND expires_at<=clock_timestamp()
  UNION ALL
  SELECT 'missing_reservation',external_minor
    FROM events WHERE intent_state='prepared' AND hold_state IS NULL
  UNION ALL
  SELECT 'sale_without_evidence',external_minor
    FROM events WHERE intent_state='committed'
      AND (evidence_id IS NULL OR sale_id IS NULL)
  UNION ALL
  SELECT 'sale_without_consumed_hold',external_minor
    FROM events WHERE intent_state='committed'
      AND hold_state IS DISTINCT FROM 'consumed'
  UNION ALL
  SELECT 'sale_amount_mismatch',external_minor
    FROM events WHERE intent_state='committed' AND
       (sale_total_minor IS DISTINCT FROM (cash_minor+external_minor)
        OR evidence_minor IS DISTINCT FROM external_minor
        OR expected_total_minor IS DISTINCT FROM (cash_minor+external_minor))
 )
 SELECT c.code,COUNT(f.code)::bigint,
    COALESCE(SUM(f.external_minor),0)::numeric,
    CASE WHEN c.code IN('evidence_pending_sale','evidence_cancelled_intent',
     'sale_without_evidence','sale_without_consumed_hold','sale_amount_mismatch')
     THEN 'critical'
     WHEN c.code='expired_held_stock' THEN 'urgent'
     ELSE 'review' END
 FROM (VALUES
  ('evidence_pending_sale'::text),
  ('evidence_cancelled_intent'::text),
  ('expired_held_stock'::text),
  ('missing_reservation'::text),
  ('sale_without_evidence'::text),
  ('sale_without_consumed_hold'::text),
  ('sale_amount_mismatch'::text)
 ) c(code)
 LEFT JOIN findings f ON f.code=c.code
 GROUP BY c.code ORDER BY
  CASE c.code
   WHEN 'evidence_pending_sale' THEN 0
   WHEN 'evidence_cancelled_intent' THEN 1
   WHEN 'sale_without_evidence' THEN 2
   WHEN 'sale_without_consumed_hold' THEN 3
   WHEN 'sale_amount_mismatch' THEN 4
   WHEN 'expired_held_stock' THEN 5 ELSE 6 END
$v45$;
REVOKE ALL ON FUNCTION zhirox_local.financial_integrity_audit_v45(uuid) FROM PUBLIC;
COMMIT;
