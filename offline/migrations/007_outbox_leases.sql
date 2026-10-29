-- V27 DISPOSABLE LOCAL PostgreSQL ONLY, not Supabase production.
-- Lease/fencing for transactional outbox delivery. Checkout never calls cloud.
BEGIN;
ALTER TABLE zhirox_local.event_outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_delivery_error text;
CREATE INDEX IF NOT EXISTS zhirox_v27_pending_outbox_idx
  ON zhirox_local.event_outbox(store_id,next_attempt_at,created_at)
  WHERE delivered_at IS NULL;

-- Claim is a short transaction with SKIP LOCKED: simultaneous workers cannot
-- claim the same row before its lease expires. Returning to queue after expiry
-- is deliberate at-least-once behavior; cloud MUST deduplicate (store,event).
CREATE OR REPLACE FUNCTION zhirox_local.claim_outbox_v27(
 p_store uuid,p_max integer DEFAULT 10,p_lease_seconds integer DEFAULT 60
) RETURNS TABLE (
 store_id uuid,event_id uuid,aggregate_id uuid,event_type text,
 payload jsonb,created_at timestamptz,lease_token uuid,attempt_count integer
) LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
BEGIN
 IF p_store IS NULL OR p_max NOT BETWEEN 1 AND 20 OR p_lease_seconds NOT BETWEEN 15 AND 300
 THEN RAISE EXCEPTION 'invalid outbox claim' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 WITH picked AS (
   SELECT o.store_id,o.event_id
   FROM zhirox_local.event_outbox o
   WHERE o.store_id=p_store AND o.delivered_at IS NULL
     AND o.next_attempt_at<=now()
     AND (o.lease_expires_at IS NULL OR o.lease_expires_at<=now())
   ORDER BY o.created_at,o.event_id
   FOR UPDATE SKIP LOCKED LIMIT p_max
 )
 UPDATE zhirox_local.event_outbox o
 SET lease_token=gen_random_uuid(),
     lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
     attempt_count=o.attempt_count+1,
     last_delivery_error=NULL
 FROM picked p
 WHERE o.store_id=p.store_id AND o.event_id=p.event_id
 RETURNING o.store_id,o.event_id,o.aggregate_id,o.event_type,
           o.payload,o.created_at,o.lease_token,o.attempt_count;
END $$;

CREATE OR REPLACE FUNCTION zhirox_local.ack_outbox_v27(
 p_store uuid,p_event uuid,p_token uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $$
BEGIN
 UPDATE zhirox_local.event_outbox o
 SET delivered_at=now(),lease_token=NULL,lease_expires_at=NULL,last_delivery_error=NULL
 WHERE o.store_id=p_store AND o.event_id=p_event AND o.lease_token=p_token
   AND o.delivered_at IS NULL AND o.lease_expires_at>now();
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION zhirox_local.fail_outbox_v27(
 p_store uuid,p_event uuid,p_token uuid,p_reason text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $$
BEGIN
 UPDATE zhirox_local.event_outbox o
 SET lease_token=NULL,lease_expires_at=NULL,
     -- 2, 4, 8... seconds, max 900; no event is discarded after failures.
     next_attempt_at=now()+make_interval(secs=>least(900,power(2.0,least(o.attempt_count,10))::int)),
     last_delivery_error=left(coalesce(p_reason,'delivery_failed'),160)
 WHERE o.store_id=p_store AND o.event_id=p_event AND o.lease_token=p_token
   AND o.delivered_at IS NULL AND o.lease_expires_at>now();
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION zhirox_local.claim_outbox_v27(uuid,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.ack_outbox_v27(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.fail_outbox_v27(uuid,uuid,uuid,text) FROM PUBLIC;
COMMIT;
