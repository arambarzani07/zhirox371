-- V86: expiry LOT registration against received test goods, isolated PostgreSQL ONLY.
-- Does not claim lot-level remaining stock, quarantine, spoilage write-offs,
-- or a verified per-lot allocation of V80 cashier sales.
-- Requires 001_core, 003_local_users, 029_supplier_receiving_v83.
BEGIN;
CREATE TABLE zhirox_local.expiry_lots_v86 (
 store_id uuid NOT NULL,
 batch_id uuid NOT NULL,
 receipt_id uuid NOT NULL,
 receipt_line_no integer NOT NULL,
 product_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 lot_code text NOT NULL CHECK (length(btrim(lot_code)) BETWEEN 2 AND 50),
 received_qty_base_units bigint NOT NULL CHECK(received_qty_base_units BETWEEN 1 AND 1000000),
 expires_on date NOT NULL,
 registered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,batch_id),
 UNIQUE(store_id,receipt_id,receipt_line_no,lot_code),
 FOREIGN KEY(store_id,receipt_id,receipt_line_no)
  REFERENCES zhirox_local.goods_receipt_lines_v83(store_id,receipt_id,line_no),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX expiry_lots_v86_upcoming
 ON zhirox_local.expiry_lots_v86(store_id,expires_on,batch_id);

CREATE FUNCTION zhirox_local.register_expiry_lot_v86(
 p_store uuid,p_actor uuid,p_batch uuid,p_receipt uuid,p_line integer,
 p_code text,p_qty bigint,p_expires date
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE prev zhirox_local.expiry_lots_v86%ROWTYPE;
 received zhirox_local.goods_receipt_lines_v83%ROWTYPE;
 allocated numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users
  WHERE store_id=p_store AND id=p_actor AND enabled
   AND role IN('owner','manager')
   AND (locked_until IS NULL OR locked_until<now())) THEN
  RAISE EXCEPTION 'manager required' USING ERRCODE='P8601';
 END IF;
 IF p_batch IS NULL OR p_receipt IS NULL OR p_line IS NULL OR p_line<1
 OR p_code IS NULL OR length(btrim(p_code)) NOT BETWEEN 2 AND 50
 OR p_qty IS NULL OR p_qty NOT BETWEEN 1 AND 1000000 OR p_expires IS NULL
 THEN RAISE EXCEPTION 'invalid expiry lot' USING ERRCODE='P8602'; END IF;
 -- Receipt-level serialization: parallel distinct batches for same receipt
 -- cannot cumulatively exceed received quantity of any receipt line.
 PERFORM 1 FROM zhirox_local.goods_receipts_v83
 WHERE store_id=p_store AND receipt_id=p_receipt FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'received goods not found' USING ERRCODE='P8602'; END IF;
 SELECT * INTO prev FROM zhirox_local.expiry_lots_v86
 WHERE store_id=p_store AND batch_id=p_batch;
 IF FOUND THEN
  IF prev.actor_id IS DISTINCT FROM p_actor OR prev.receipt_id IS DISTINCT FROM p_receipt
   OR prev.receipt_line_no IS DISTINCT FROM p_line OR
   prev.lot_code IS DISTINCT FROM btrim(p_code) OR
   prev.received_qty_base_units IS DISTINCT FROM p_qty OR
   prev.expires_on IS DISTINCT FROM p_expires THEN
   RAISE EXCEPTION 'batch idempotency conflict' USING ERRCODE='P8603';
  END IF;
  RETURN p_batch;
 END IF;
 SELECT * INTO received FROM zhirox_local.goods_receipt_lines_v83
 WHERE store_id=p_store AND receipt_id=p_receipt AND line_no=p_line;
 IF NOT FOUND THEN RAISE EXCEPTION 'received line not found' USING ERRCODE='P8602'; END IF;
 SELECT COALESCE(sum(received_qty_base_units::numeric),0) INTO allocated
 FROM zhirox_local.expiry_lots_v86
 WHERE store_id=p_store AND receipt_id=p_receipt AND receipt_line_no=p_line;
 IF allocated+p_qty>received.quantity_base_units THEN
  RAISE EXCEPTION 'lot quantity exceeds received line' USING ERRCODE='P8605';
 END IF;
 IF EXISTS(SELECT 1 FROM zhirox_local.expiry_lots_v86
  WHERE store_id=p_store AND receipt_id=p_receipt AND receipt_line_no=p_line
   AND lot_code=btrim(p_code)) THEN
  RAISE EXCEPTION 'duplicate lot code on receipt line' USING ERRCODE='P8603';
 END IF;
 INSERT INTO zhirox_local.expiry_lots_v86
 (store_id,batch_id,receipt_id,receipt_line_no,product_id,actor_id,
  lot_code,received_qty_base_units,expires_on)
 VALUES(p_store,p_batch,p_receipt,p_line,received.product_id,p_actor,
  btrim(p_code),p_qty,p_expires);
 RETURN p_batch;
END $fn$;

CREATE FUNCTION zhirox_local.block_expiry_lot_mutation_v86()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'immutable test expiry lot history' USING ERRCODE='P8604';
END $fn$;
CREATE TRIGGER expiry_lot_immutable_v86 BEFORE UPDATE OR DELETE
 ON zhirox_local.expiry_lots_v86 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.block_expiry_lot_mutation_v86();
REVOKE ALL ON TABLE zhirox_local.expiry_lots_v86 FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.register_expiry_lot_v86(
 uuid,uuid,uuid,uuid,integer,text,bigint,date),
 zhirox_local.block_expiry_lot_mutation_v86() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.expiry_lots_v86 IS
 'TEST ONLY. Captures units received on named expiry lots, NOT real-time unsold quantity. Checkout is not batch-aware.';
COMMIT;
