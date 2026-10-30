-- V34 disposable PostgreSQL ONLY. Capture the definitive sale receipt in
-- the same transaction as V31 checkout; never build it from browser values.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.receipt_snapshots_v34 (
 store_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 cashier_id uuid NOT NULL,
 receipt_no bigint NOT NULL CHECK(receipt_no>0),
 total_minor bigint NOT NULL CHECK(total_minor>=0 AND total_minor<=9999999999999),
 store_name_snapshot text NOT NULL,
 issued_at timestamptz NOT NULL,
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines)>0),
 PRIMARY KEY(store_id,sale_id),
 UNIQUE(store_id,receipt_no),
 FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.sales(store_id,id)
);
CREATE OR REPLACE FUNCTION zhirox_local.capture_committed_receipt_v34()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
DECLARE
 v_sale zhirox_local.sales%ROWTYPE;
 v_store_name text;
 v_lines jsonb;
 v_sum numeric;
 v_count bigint;
BEGIN
 IF NEW.state<>'committed' OR OLD.state='committed' THEN RETURN NEW; END IF;
 IF OLD.state<>'prepared' OR NEW.sale_id IS NULL THEN
   RAISE EXCEPTION 'invalid receipt transition' USING ERRCODE='23514';
 END IF;
 SELECT * INTO STRICT v_sale FROM zhirox_local.sales
 WHERE store_id=NEW.store_id AND id=NEW.sale_id AND
   request_id=NEW.request_id AND cashier_id=NEW.cashier_id;
 IF v_sale.receipt_no<>NEW.receipt_no OR v_sale.total_minor<>NEW.total_minor THEN
   RAISE EXCEPTION 'receipt/sale mismatch' USING ERRCODE='23514';
 END IF;
 SELECT name INTO STRICT v_store_name FROM zhirox_local.stores WHERE id=NEW.store_id;
 SELECT jsonb_agg(jsonb_build_object(
   'line_no',line_no,'name',name_snapshot,
   'sale_mode',sale_mode_snapshot,
   'scan_quantity',scan_quantity,
   'quantity_base_units',quantity_base_units,
   'unit_price_minor',unit_price_minor,
   'line_total_minor',line_total_minor
 ) ORDER BY line_no),sum(line_total_minor),count(*)
 INTO v_lines,v_sum,v_count
 FROM zhirox_local.sale_lines
 WHERE store_id=NEW.store_id AND sale_id=NEW.sale_id;
 IF v_count NOT BETWEEN 1 AND 100 OR v_sum<>v_sale.total_minor OR
    (SELECT count(DISTINCT line_no) FROM zhirox_local.sale_lines
     WHERE store_id=NEW.store_id AND sale_id=NEW.sale_id)<>v_count THEN
   RAISE EXCEPTION 'receipt line total mismatch' USING ERRCODE='23514';
 END IF;
 INSERT INTO zhirox_local.receipt_snapshots_v34
   (store_id,sale_id,cashier_id,receipt_no,total_minor,store_name_snapshot,issued_at,lines)
 VALUES(NEW.store_id,NEW.sale_id,NEW.cashier_id,NEW.receipt_no,v_sale.total_minor,
        v_store_name,v_sale.created_at,v_lines);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zhirox_capture_receipt_v34 ON zhirox_local.checkout_intents_v31;
CREATE TRIGGER zhirox_capture_receipt_v34
 AFTER UPDATE OF state ON zhirox_local.checkout_intents_v31
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.capture_committed_receipt_v34();
CREATE OR REPLACE FUNCTION zhirox_local.deny_receipt_change_v34()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $$
BEGIN
 RAISE EXCEPTION 'committed receipt snapshots are append-only' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS zhirox_receipt_append_only_v34 ON zhirox_local.receipt_snapshots_v34;
CREATE TRIGGER zhirox_receipt_append_only_v34
 BEFORE UPDATE OR DELETE ON zhirox_local.receipt_snapshots_v34
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.deny_receipt_change_v34();
REVOKE ALL ON zhirox_local.receipt_snapshots_v34 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.capture_committed_receipt_v34() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.deny_receipt_change_v34() FROM PUBLIC;
COMMIT;
