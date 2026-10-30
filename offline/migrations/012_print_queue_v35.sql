-- V35 isolated PostgreSQL pilot ONLY. Never run on live store or Supabase.
-- Durable, idempotent queue for *server-authored* V34 receipt snapshots.
-- NO printer driver, print worker, or remote-device claim is enabled.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.print_requests_v35 (
  store_id uuid NOT NULL,
  job_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  cashier_id uuid NOT NULL,
  width_mm smallint NOT NULL CHECK(width_mm IN(58,80)),
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','claimed','printed','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  PRIMARY KEY(store_id,job_id),
  UNIQUE(store_id,sale_id),
  FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.receipt_snapshots_v34(store_id,sale_id)
);
CREATE INDEX IF NOT EXISTS zhirox_print_pending_v35
 ON zhirox_local.print_requests_v35(store_id,created_at) WHERE state='queued';
CREATE OR REPLACE FUNCTION zhirox_local.queue_print_v35(
 p_store uuid,p_cashier uuid,p_sale uuid,p_job uuid,p_width smallint
) RETURNS TABLE(job_id uuid,sale_id uuid,width_mm smallint,state text)
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
DECLARE existing zhirox_local.print_requests_v35%ROWTYPE;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_sale IS NULL OR
    p_job IS NULL OR p_width IS NULL OR p_width NOT IN (58,80)
 THEN RAISE EXCEPTION 'invalid print request' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'store unavailable' USING ERRCODE='22023'; END IF;
 -- A receipt exists only after the checkout commits, with the cashier bound
 -- to the authenticated API actor. Never take prices/lines from a browser.
 PERFORM 1 FROM zhirox_local.receipt_snapshots_v34 r
 WHERE r.store_id=p_store AND r.sale_id=p_sale AND r.cashier_id=p_cashier;
 IF NOT FOUND THEN RAISE EXCEPTION 'verified receipt not found' USING ERRCODE='P3501'; END IF;
 SELECT q.* INTO existing FROM zhirox_local.print_requests_v35 q
 WHERE q.store_id=p_store AND (q.job_id=p_job OR q.sale_id=p_sale)
 FOR UPDATE;
 IF FOUND THEN
   IF existing.job_id<>p_job OR existing.sale_id<>p_sale OR
      existing.cashier_id<>p_cashier OR existing.width_mm<>p_width
   THEN RAISE EXCEPTION 'print request id reused or reprint needs approval'
       USING ERRCODE='P3502'; END IF;
 ELSE
  INSERT INTO zhirox_local.print_requests_v35
      (store_id,job_id,sale_id,cashier_id,width_mm)
  VALUES(p_store,p_job,p_sale,p_cashier,p_width);
 END IF;
 RETURN QUERY SELECT q.job_id,q.sale_id,q.width_mm,q.state
 FROM zhirox_local.print_requests_v35 q
 WHERE q.store_id=p_store AND q.job_id=p_job AND q.cashier_id=p_cashier;
END $$;
REVOKE ALL ON zhirox_local.print_requests_v35 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.queue_print_v35(uuid,uuid,uuid,uuid,smallint) FROM PUBLIC;
COMMIT;
