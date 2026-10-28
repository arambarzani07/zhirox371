-- ZHIROX Local-First foundation V1 (isolated PostgreSQL test database ONLY)
-- Never apply directly to production Supabase.
BEGIN;
CREATE SCHEMA IF NOT EXISTS zhirox_local;
CREATE TABLE IF NOT EXISTS zhirox_local.stores (
 id uuid PRIMARY KEY, name text NOT NULL
);
CREATE TABLE IF NOT EXISTS zhirox_local.products (
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 id uuid NOT NULL, name text NOT NULL,
 price_minor bigint NOT NULL CHECK(price_minor >= 0),
 stock_base_units bigint NOT NULL DEFAULT 0 CHECK(stock_base_units >= 0),
 active boolean NOT NULL DEFAULT true,
 version bigint NOT NULL DEFAULT 1,
 PRIMARY KEY(store_id,id)
);
CREATE TABLE IF NOT EXISTS zhirox_local.barcodes (
 store_id uuid NOT NULL,
 code text NOT NULL,
 product_id uuid NOT NULL,
 quantity_base_units integer NOT NULL CHECK(quantity_base_units > 0),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(store_id,code),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE TABLE IF NOT EXISTS zhirox_local.sales (
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 id uuid NOT NULL,
 request_id uuid NOT NULL,
 receipt_no bigint NOT NULL,
 cashier_id uuid NOT NULL,
 total_minor bigint NOT NULL CHECK(total_minor>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,id),
 UNIQUE(store_id,request_id),
 UNIQUE(store_id,receipt_no)
);
CREATE TABLE IF NOT EXISTS zhirox_local.receipt_counters (
 store_id uuid PRIMARY KEY REFERENCES zhirox_local.stores(id),
 next_no bigint NOT NULL DEFAULT 1 CHECK(next_no > 0)
);
CREATE TABLE IF NOT EXISTS zhirox_local.sale_lines (
 store_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 line_no integer NOT NULL CHECK(line_no > 0),
 product_id uuid NOT NULL,
 name_snapshot text NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units > 0),
 unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
 line_total_minor bigint NOT NULL CHECK(line_total_minor>=0),
 PRIMARY KEY(store_id,sale_id,line_no),
 FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.sales(store_id,id),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE TABLE IF NOT EXISTS zhirox_local.stock_ledger (
 store_id uuid NOT NULL,
 id uuid NOT NULL,
 product_id uuid NOT NULL,
 sale_id uuid,
 delta_base_units bigint NOT NULL CHECK(delta_base_units <> 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,id),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id),
 FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.sales(store_id,id)
);
CREATE TABLE IF NOT EXISTS zhirox_local.event_outbox (
 store_id uuid NOT NULL,
 event_id uuid NOT NULL,
 aggregate_id uuid NOT NULL,
 event_type text NOT NULL,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 PRIMARY KEY(store_id,event_id),
 FOREIGN KEY(store_id,aggregate_id) REFERENCES zhirox_local.sales(store_id,id)
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON zhirox_local.event_outbox(created_at) WHERE delivered_at IS NULL;
-- This role is the app's only permitted API identity in later phases;
-- do not expose DB credentials to cashier browsers.
COMMIT;
