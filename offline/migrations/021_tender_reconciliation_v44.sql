-- V44: provider-neutral unresolved external-payment exception worklist.
-- Disposable PostgreSQL only. An operator NOTE is not bank verification,
-- does not release a V43 hold, does not cancel or post a sale or refund.
BEGIN;
CREATE TABLE zhirox_local.tender_review_notes_v44 (
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 note_id uuid NOT NULL,
 request_id uuid NOT NULL,
 manager_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN
  ('investigating','contacted_provider','awaiting_bank_response',
   'requires_supervisor_followup','hardware_network_check')),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 10 AND 500 AND note=btrim(note)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,note_id),
 FOREIGN KEY(store_id,request_id) REFERENCES zhirox_local.tender_plans_v41(store_id,request_id),
 FOREIGN KEY(store_id,manager_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX v44_reviews_by_request ON zhirox_local.tender_review_notes_v44
 (store_id,request_id,created_at DESC,note_id);

CREATE OR REPLACE FUNCTION zhirox_local.guard_review_notes_v44()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v44$
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'financial review journal is append-only' USING ERRCODE='P4403';
 END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=NEW.store_id FOR UPDATE;
 PERFORM 1 FROM zhirox_local.local_users u
  WHERE u.store_id=NEW.store_id AND u.id=NEW.manager_id AND
   u.enabled AND u.role IN ('manager','owner') AND
   (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN
  RAISE EXCEPTION 'active manager required' USING ERRCODE='P4401'; END IF;
 PERFORM 1 FROM zhirox_local.tender_plans_v41 p
  WHERE p.store_id=NEW.store_id AND p.request_id=NEW.request_id
   AND p.external_minor>0;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'external tender required' USING ERRCODE='P4402'; END IF;
 RETURN NEW;
END $v44$;
CREATE TRIGGER v44_review_append_only
 BEFORE INSERT OR UPDATE OR DELETE ON zhirox_local.tender_review_notes_v44
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.guard_review_notes_v44();

CREATE OR REPLACE FUNCTION zhirox_local.record_review_note_v44(
 p_store uuid,p_manager uuid,p_note uuid,p_request uuid,
 p_category text,p_note_text text
) RETURNS TABLE(note_id uuid,request_id uuid,category text,
 note text,created_at timestamptz,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v44$
DECLARE existing zhirox_local.tender_review_notes_v44%ROWTYPE;
 old_found boolean:=false;
BEGIN
 IF p_store IS NULL OR p_manager IS NULL OR p_note IS NULL OR p_request IS NULL OR
  p_category IS NULL OR p_category NOT IN
   ('investigating','contacted_provider','awaiting_bank_response',
    'requires_supervisor_followup','hardware_network_check') OR
  p_note_text IS NULL OR p_note_text<>btrim(p_note_text) OR
  length(p_note_text) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION 'invalid review note' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='P4402'; END IF;
 SELECT n.* INTO existing FROM zhirox_local.tender_review_notes_v44 n
 WHERE n.store_id=p_store AND n.note_id=p_note;
 IF FOUND THEN
  IF existing.manager_id<>p_manager OR existing.request_id<>p_request OR
   existing.category<>p_category OR existing.note<>p_note_text THEN
   RAISE EXCEPTION 'review UUID payload changed' USING ERRCODE='P4403'; END IF;
  old_found:=true;
 ELSE
  INSERT INTO zhirox_local.tender_review_notes_v44
   (store_id,note_id,request_id,manager_id,category,note)
  VALUES(p_store,p_note,p_request,p_manager,p_category,p_note_text);
 END IF;
 RETURN QUERY SELECT n.note_id,n.request_id,n.category,n.note,n.created_at,old_found
 FROM zhirox_local.tender_review_notes_v44 n
 WHERE n.store_id=p_store AND n.note_id=p_note;
END $v44$;

-- Purely derived categories: no human note can change payment status.
-- Synthetic V42 rows in CI are 'database evidence', NOT verified bank funds.
CREATE OR REPLACE FUNCTION zhirox_local.tender_exceptions_v44(
 p_store uuid,p_limit integer DEFAULT 100
) RETURNS TABLE(request_id uuid,cashier_id uuid,checkout_state text,
 exception_code text,expected_total_minor bigint,cash_minor bigint,
 external_minor bigint,external_method text,reservation_state text,
 expires_at timestamptz,evidence_recorded boolean,
 evidence_ref text,age_seconds bigint,review_count bigint,created_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v44$
BEGIN
 IF p_store IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'invalid review query' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 SELECT q.request_id,q.cashier_id,q.state,
  (CASE
    WHEN e.request_id IS NOT NULL AND q.state='prepared'
      THEN 'evidence_without_committed_sale'
    WHEN q.state='cancelled' AND e.request_id IS NOT NULL
      THEN 'cancelled_with_external_evidence'
    WHEN h.state='held' AND clock_timestamp()>=h.expires_at
      THEN 'expired_unresolved_hold'
    WHEN q.state='prepared' AND h.state='held'
      THEN 'active_unverified_hold'
    WHEN q.state='prepared' AND h.request_id IS NULL
      THEN 'external_quote_without_hold'
    WHEN q.state='prepared' AND h.state='cancelled'
      THEN 'cancelled_hold_with_prepared_checkout'
    ELSE 'other_pending_external_case'
   END)::text,
  q.expected_total_minor,p.cash_minor,p.external_minor,p.external_method,
  h.state,h.expires_at,(e.request_id IS NOT NULL),e.transaction_ref,
  GREATEST(0,floor(extract(epoch FROM clock_timestamp()-q.created_at)))::bigint,
  (SELECT count(*) FROM zhirox_local.tender_review_notes_v44 n
   WHERE n.store_id=q.store_id AND n.request_id=q.request_id)::bigint,
  q.created_at
 FROM zhirox_local.checkout_intents_v31 q
 JOIN zhirox_local.tender_plans_v41 p
  ON p.store_id=q.store_id AND p.request_id=q.request_id
  AND p.external_minor>0
 LEFT JOIN zhirox_local.inventory_reservation_sessions_v43 h
  ON h.store_id=q.store_id AND h.request_id=q.request_id
 LEFT JOIN zhirox_local.external_settlements_v42 e
  ON e.store_id=q.store_id AND e.request_id=q.request_id
 WHERE q.store_id=p_store AND
  (q.state='prepared' OR
   (q.state='cancelled' AND e.request_id IS NOT NULL))
 ORDER BY
  CASE WHEN e.request_id IS NOT NULL THEN 0
    WHEN h.state='held' AND clock_timestamp()>=h.expires_at THEN 1
    ELSE 2 END,
  q.created_at,q.request_id
 LIMIT p_limit;
END $v44$;

REVOKE ALL ON zhirox_local.tender_review_notes_v44 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.guard_review_notes_v44() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.record_review_note_v44(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.tender_exceptions_v44(uuid,integer) FROM PUBLIC;
COMMIT;
