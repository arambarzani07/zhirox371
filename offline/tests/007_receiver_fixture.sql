-- Disposable receiver test database ONLY. This is not a Supabase/cloud migration.
BEGIN;
CREATE SCHEMA IF NOT EXISTS zhirox_cloud_test;
CREATE TABLE IF NOT EXISTS zhirox_cloud_test.received_events (
 store_id uuid NOT NULL,
 event_id uuid NOT NULL,
 aggregate_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type='sale.completed'),
 event_hash char(64) NOT NULL,
 payload jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,event_id)
);
COMMIT;
