-- V100: isolated PostgreSQL CI certificate enrollment & immediate revocation.
-- Test-only two device IDs, no cryptographic private material in DB.
BEGIN;
DO $v100$
BEGIN
 IF current_database()<>'zhirox_v80_disposable'
  OR current_user<>'v80test'
  OR (SELECT count(*) FROM zhirox_local.stores)<>1
  OR (SELECT name FROM zhirox_local.stores
      WHERE id='88000000-0000-4000-8000-000000000080')
      IS DISTINCT FROM 'مارکێتی تاقیکردنەوە'
  OR (SELECT count(*) FROM zhirox_local.sales
      WHERE store_id='88000000-0000-4000-8000-000000000080')<>14
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname='zhirox_v95_gate' AND NOT rolcanlogin)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class
      WHERE relnamespace='zhirox_local'::regnamespace AND relname='v100_trial_devices')
 THEN RAISE EXCEPTION 'V100 requires disposable 14-sale V99 test state' USING ERRCODE='P1001';
 END IF;
END $v100$;

CREATE TABLE zhirox_local.v100_trial_devices (
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 device_id text NOT NULL CHECK(device_id IN('trial-pc-01','trial-pc-02')),
 tls_fingerprint text NOT NULL CHECK(tls_fingerprint ~ '^[A-F0-9]{64}$'),
 enabled boolean NOT NULL DEFAULT true,
 enrolled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 PRIMARY KEY(store_id,device_id),
 UNIQUE(store_id,tls_fingerprint),
 CHECK ((enabled AND revoked_at IS NULL) OR (NOT enabled AND revoked_at IS NOT NULL))
);
CREATE INDEX v100_trial_devices_enabled
 ON zhirox_local.v100_trial_devices(store_id,enabled);

REVOKE ALL ON TABLE zhirox_local.v100_trial_devices FROM PUBLIC;
GRANT SELECT(store_id,device_id,tls_fingerprint,enabled)
 ON zhirox_local.v100_trial_devices TO zhirox_v95_gate;
COMMENT ON TABLE zhirox_local.v100_trial_devices IS
 'V100 isolated CI-only test mutual-TLS certificate fingerprints; no TLS private keys, no production enrollment.';
COMMIT;
