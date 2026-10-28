-- V5 local test indexes only. Do not run on production Supabase.
BEGIN;
CREATE INDEX IF NOT EXISTS zhirox_local_product_browse_idx
  ON zhirox_local.products(store_id,name,id) WHERE active;
CREATE INDEX IF NOT EXISTS zhirox_local_barcode_product_idx
  ON zhirox_local.barcodes(store_id,product_id,code) WHERE active;
COMMIT;
