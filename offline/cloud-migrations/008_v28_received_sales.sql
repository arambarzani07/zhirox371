-- V28 Dedicated cloud RECEIVER schema, for a NEW DISPOSABLE PostgreSQL DB ONLY.
-- NEVER apply to existing market, Supabase or local cashier production databases.
BEGIN;
CREATE SCHEMA IF NOT EXISTS zhirox_cloud_v28;
CREATE TABLE IF NOT EXISTS zhirox_cloud_v28.received_sales(
  store_id uuid NOT NULL,
  event_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  receipt_no bigint NOT NULL CHECK(receipt_no>0),
  total_minor bigint NOT NULL CHECK(total_minor>=0 AND total_minor<=9999999999999),
  event_hash char(64) NOT NULL CHECK(event_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id,event_id),
  UNIQUE(store_id,sale_id),
  UNIQUE(store_id,receipt_no)
);
CREATE INDEX IF NOT EXISTS zhirox_cloud_v28_received_recent
 ON zhirox_cloud_v28.received_sales(store_id,received_at DESC);
-- No browser or anonymous users are granted access. Receiver uses server-side
-- credentials (minimum-privilege DB role planned before external deployment).
COMMIT;
