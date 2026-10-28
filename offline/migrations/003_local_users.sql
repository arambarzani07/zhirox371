-- Isolated local PostgreSQL ONLY. Never run on production Supabase.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.local_users (
  store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
  id uuid NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','manager','cashier')),
  enabled boolean NOT NULL DEFAULT true,
  session_version integer NOT NULL DEFAULT 1,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  PRIMARY KEY(store_id,id),
  UNIQUE(store_id,username),
  CHECK (length(username) BETWEEN 3 AND 100),
  CHECK (session_version > 0)
);
CREATE INDEX IF NOT EXISTS local_users_auth_idx ON zhirox_local.local_users(store_id,username);
-- Provision password hashes only through trusted local setup, never plain SQL passwords.
-- Local API DB role must be tightly scoped before deployment.
COMMIT;