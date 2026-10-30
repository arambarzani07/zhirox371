-- V54: DISPOSABLE POSTGRESQL ONLY — test print-dispatch fencing.
-- Windows spooler accepting a job DOES NOT prove a paper receipt was printed.
-- Never apply to market or Supabase production.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.print_dispatch_attempts_v54(
 store_id uuid NOT NULL,
 job_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'claimed'
   CHECK(state IN ('claimed','submitted_to_windows','manual_review')),
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 PRIMARY KEY(store_id,job_id),
 FOREIGN KEY(store_id,job_id) REFERENCES zhirox_local.print_requests_v35(store_id,job_id)
);
CREATE OR REPLACE FUNCTION zhirox_local.claim_print_dispatch_v54(p_store uuid,p_job uuid)
RETURNS TABLE(job_id uuid,sale_id uuid,width_mm smallint,receipt_no bigint,
 total_minor bigint,store_name_snapshot text,issued_at timestamptz,lines jsonb)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
DECLARE q zhirox_local.print_requests_v35%ROWTYPE;
        snap zhirox_local.receipt_snapshots_v34%ROWTYPE;
BEGIN
 IF p_store IS NULL OR p_job IS NULL THEN
   RAISE EXCEPTION 'invalid print dispatch identity' USING ERRCODE='22023';
 END IF;
 SELECT * INTO q FROM zhirox_local.print_requests_v35 AS pr
 WHERE pr.store_id=p_store AND pr.job_id=p_job FOR UPDATE;
 IF NOT FOUND OR q.state<>'queued' THEN
   RAISE EXCEPTION 'print dispatch not available; manual review required'
     USING ERRCODE='P5401';
 END IF;
 SELECT * INTO snap FROM zhirox_local.receipt_snapshots_v34 AS rs
 WHERE rs.store_id=p_store AND rs.sale_id=q.sale_id AND rs.cashier_id=q.cashier_id;
 IF NOT FOUND OR snap.lines IS NULL OR snap.total_minor IS NULL THEN
   RAISE EXCEPTION 'no verified immutable receipt' USING ERRCODE='P5402';
 END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.print_dispatch_attempts_v54 a
   WHERE a.store_id=p_store AND a.job_id=p_job) THEN
   RAISE EXCEPTION 'print already attempted' USING ERRCODE='P5401';
 END IF;
 INSERT INTO zhirox_local.print_dispatch_attempts_v54(store_id,job_id,sale_id)
 VALUES(p_store,p_job,q.sale_id);
 UPDATE zhirox_local.print_requests_v35 SET state='claimed'
 WHERE store_id=p_store AND job_id=p_job;
 RETURN QUERY SELECT q.job_id,q.sale_id,q.width_mm,snap.receipt_no,
   snap.total_minor,snap.store_name_snapshot,snap.issued_at,snap.lines;
END $$;

CREATE OR REPLACE FUNCTION zhirox_local.finish_print_dispatch_v54(
 p_store uuid,p_job uuid,p_state text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
BEGIN
 IF p_store IS NULL OR p_job IS NULL OR p_state NOT IN
   ('submitted_to_windows','manual_review') THEN
   RAISE EXCEPTION 'invalid dispatch final state' USING ERRCODE='22023';
 END IF;
 UPDATE zhirox_local.print_dispatch_attempts_v54 a
 SET state=p_state,completed_at=clock_timestamp()
 WHERE a.store_id=p_store AND a.job_id=p_job AND a.state='claimed';
 RETURN FOUND;
END $$;
-- Neither a successful Windows spool acknowledgement nor a browser request can
-- write 'printed' status. Unknown/ambiguous jobs remain permanently fenced until
-- a separate operator-approved reconciliation/reprint protocol is implemented.
REVOKE ALL ON zhirox_local.print_dispatch_attempts_v54 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.claim_print_dispatch_v54(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.finish_print_dispatch_v54(uuid,uuid,text) FROM PUBLIC;
COMMIT;
