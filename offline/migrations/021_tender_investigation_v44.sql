-- V44 — provider-neutral investigation and recovery WORK QUEUE.
-- Disposable PostgreSQL 16 lab ONLY. Never authorizes or reverses a payment.
BEGIN;
CREATE TABLE zhirox_local.tender_review_events_v44(
 store_id uuid NOT NULL,
 event_id uuid NOT NULL,
 request_id uuid NOT NULL,
 manager_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN(
  'review_opened','provider_contacted','escalated','note_added')),
 note text NOT NULL CHECK(length(note) BETWEEN 5 AND 240 AND note=btrim(note)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(store_id,event_id),
 FOREIGN KEY(store_id,request_id)
 REFERENCES zhirox_local.tender_plans_v41(store_id,request_id),
 FOREIGN KEY(store_id,manager_id)
 REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX v44_review_events_by_case
 ON zhirox_local.tender_review_events_v44(store_id,request_id,created_at);
REVOKE ALL ON zhirox_local.tender_review_events_v44 FROM PUBLIC;

CREATE OR REPLACE FUNCTION zhirox_local.guard_review_event_v44()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $v44$
DECLARE p zhirox_local.tender_plans_v41%ROWTYPE;
 i zhirox_local.checkout_intents_v31%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'investigation journal is append-only'
   USING ERRCODE='P4403'; END IF;
 PERFORM 1 FROM zhirox_local.stores s WHERE s.id=NEW.store_id FOR UPDATE;
 PERFORM 1 FROM zhirox_local.local_users u
 WHERE u.store_id=NEW.store_id AND u.id=NEW.manager_id
  AND u.enabled AND u.role IN ('manager','owner')
  AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'manager required' USING ERRCODE='P4401'; END IF;
 SELECT x.* INTO p FROM zhirox_local.tender_plans_v41 x
 WHERE x.store_id=NEW.store_id AND x.request_id=NEW.request_id;
 SELECT x.* INTO i FROM zhirox_local.checkout_intents_v31 x
 WHERE x.store_id=NEW.store_id AND x.request_id=NEW.request_id FOR UPDATE;
 IF p.request_id IS NULL OR p.external_minor<=0 OR
    i.request_id IS NULL OR i.state<>'prepared'
 THEN RAISE EXCEPTION 'only unresolved external tender can be reviewed'
  USING ERRCODE='P4402'; END IF;
 RETURN NEW;
END $v44$;
CREATE TRIGGER v44_immutable_review BEFORE INSERT OR UPDATE OR DELETE
 ON zhirox_local.tender_review_events_v44 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.guard_review_event_v44();

-- An event is a *human note*, never a payment settlement or reversal.
-- Manager id is derived from the authenticated local token by the API.
CREATE OR REPLACE FUNCTION zhirox_local.record_tender_review_v44(
 p_store uuid,p_manager uuid,p_request uuid,p_event uuid,
 p_action text,p_note text
) RETURNS TABLE(event_id uuid,request_id uuid,manager_id uuid,
 action text,note text,created_at timestamptz,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $v44$
DECLARE old zhirox_local.tender_review_events_v44%ROWTYPE;
BEGIN
 IF p_store IS NULL OR p_manager IS NULL OR p_request IS NULL OR
    p_event IS NULL OR p_action IS NULL OR
    p_action NOT IN('review_opened','provider_contacted','escalated','note_added')
    OR p_note IS NULL OR length(p_note) NOT BETWEEN 5 AND 240
    OR p_note<>btrim(p_note)
 THEN RAISE EXCEPTION 'invalid review event' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores s WHERE s.id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'store missing' USING ERRCODE='P4402'; END IF;
 PERFORM 1 FROM zhirox_local.local_users u WHERE u.store_id=p_store
  AND u.id=p_manager AND u.enabled AND u.role IN('manager','owner')
  AND (u.locked_until IS NULL OR u.locked_until<=clock_timestamp());
 IF NOT FOUND THEN RAISE EXCEPTION 'manager required' USING ERRCODE='P4401'; END IF;
 SELECT x.* INTO old FROM zhirox_local.tender_review_events_v44 x
 WHERE x.store_id=p_store AND x.event_id=p_event;
 IF FOUND THEN
  IF old.request_id<>p_request OR old.manager_id<>p_manager OR
    old.action<>p_action OR old.note<>p_note
  THEN RAISE EXCEPTION 'conflicting event UUID' USING ERRCODE='P4403'; END IF;
  RETURN QUERY SELECT old.event_id,old.request_id,old.manager_id,
    old.action,old.note,old.created_at,true;
  RETURN;
 END IF;
 INSERT INTO zhirox_local.tender_review_events_v44
 (store_id,event_id,request_id,manager_id,action,note)
 VALUES(p_store,p_event,p_request,p_manager,p_action,p_note);
 RETURN QUERY SELECT x.event_id,x.request_id,x.manager_id,
 x.action,x.note,x.created_at,false
 FROM zhirox_local.tender_review_events_v44 x
 WHERE x.store_id=p_store AND x.event_id=p_event;
END $v44$;

-- Case status is always re-derived from immutable provider evidence,
-- prepared intent and actual reservation expiry. Human comments cannot
-- change bank status or release inventory.
CREATE OR REPLACE FUNCTION zhirox_local.pending_tender_cases_v44(p_store uuid)
RETURNS TABLE(request_id uuid,cashier_id uuid,
 gross_minor bigint,cash_minor bigint,external_minor bigint,
 external_method text,prepared_at timestamptz,
 hold_state text,hold_expires_at timestamptz,
 evidence_recorded boolean,case_status text,
 event_count bigint,last_action text,last_note text)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $v44$
 SELECT t.request_id,t.cashier_id,i.expected_total_minor,t.cash_minor,
   t.external_minor,t.external_method,i.created_at,
   h.state,h.expires_at,(e.request_id IS NOT NULL),
   CASE WHEN e.request_id IS NOT NULL THEN 'captured_pending'
        WHEN h.request_id IS NULL THEN 'reservation_missing'
        WHEN h.state='held' AND h.expires_at<=clock_timestamp() THEN 'hold_expired'
        WHEN h.state='held' THEN 'awaiting_provider'
        ELSE 'needs_supervisor'
   END AS case_status,
   COALESCE(hist.event_count,0),hist.action,hist.note
 FROM zhirox_local.tender_plans_v41 t
 JOIN zhirox_local.checkout_intents_v31 i
  ON i.store_id=t.store_id AND i.request_id=t.request_id
 LEFT JOIN zhirox_local.inventory_reservation_sessions_v43 h
  ON h.store_id=t.store_id AND h.request_id=t.request_id
 LEFT JOIN zhirox_local.external_settlements_v42 e
  ON e.store_id=t.store_id AND e.request_id=t.request_id
 LEFT JOIN LATERAL (
  SELECT (SELECT count(*) FROM zhirox_local.tender_review_events_v44 r
   WHERE r.store_id=t.store_id AND r.request_id=t.request_id) AS event_count,
   latest.action,latest.note
  FROM (SELECT r.action,r.note
   FROM zhirox_local.tender_review_events_v44 r
   WHERE r.store_id=t.store_id AND r.request_id=t.request_id
   ORDER BY r.created_at DESC,r.event_id DESC LIMIT 1) latest
 ) hist ON true
 WHERE t.store_id=p_store AND t.external_minor>0 AND i.state='prepared'
 ORDER BY CASE WHEN e.request_id IS NOT NULL THEN 0
               WHEN h.request_id IS NOT NULL AND h.state='held'
                 AND h.expires_at<=clock_timestamp() THEN 1
               WHEN h.request_id IS NULL THEN 2 ELSE 3 END,
 i.created_at,t.request_id LIMIT 100
$v44$;
REVOKE ALL ON FUNCTION zhirox_local.guard_review_event_v44() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.record_tender_review_v44(
 uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.pending_tender_cases_v44(uuid) FROM PUBLIC;
COMMIT;
