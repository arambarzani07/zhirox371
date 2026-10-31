-- V86 expiry-lot reference registry for ISOLATED TEST MARKET ONLY.
-- Metadata records do not allocate checkout stock, deduct FIFO lots, block
-- sales, or certify the quantity currently physically available.
-- DO NOT run on live supermarket, production Supabase or shared databases.
BEGIN;
CREATE TABLE zhirox_local.expiry_lots_v86(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 lot_id uuid NOT NULL,
 product_id uuid NOT NULL,
 lot_code text NOT NULL CHECK(length(btrim(lot_code)) BETWEEN 2 AND 80),
 expires_on date NOT NULL CHECK(expires_on >= DATE '2000-01-01' AND expires_on < DATE '2100-01-01'),
 declared_units bigint NOT NULL CHECK(declared_units BETWEEN 1 AND 1000000),
 recorded_by uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,lot_id),
 UNIQUE(store_id,product_id,lot_code),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id),
 FOREIGN KEY(store_id,recorded_by) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX expiry_lots_v86_due ON zhirox_local.expiry_lots_v86(store_id,expires_on,product_id);
CREATE FUNCTION zhirox_local.reject_expiry_mutation_v86()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
 RAISE EXCEPTION 'immutable expiry lot metadata' USING ERRCODE='P8604';
END $guard$;
CREATE TRIGGER expiry_lots_immutable_v86 BEFORE UPDATE OR DELETE
 ON zhirox_local.expiry_lots_v86 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.reject_expiry_mutation_v86();

-- SQL-only trusted test fixture call. p_actor must be obtained from
-- authenticated local server, not accepted from a browser-supplied actor UUID.
CREATE FUNCTION zhirox_local.register_expiry_lot_v86(
 p_store uuid,p_actor uuid,p_lot uuid,p_product uuid,
 p_code text,p_expiry date,p_qty bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $register$
DECLARE old zhirox_local.expiry_lots_v86%ROWTYPE;
 stock_now bigint; registered_qty numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users
  WHERE store_id=p_store AND id=p_actor AND enabled AND role IN('owner','manager')
  AND (locked_until IS NULL OR locked_until<now()))
 THEN RAISE EXCEPTION 'manager required to register expiry batch' USING ERRCODE='P8601'; END IF;
 IF p_lot IS NULL OR p_product IS NULL OR p_code IS NULL OR
  length(btrim(p_code)) NOT BETWEEN 2 AND 80 OR
  p_expiry IS NULL OR p_expiry < DATE '2000-01-01' OR
  p_expiry >= DATE '2100-01-01' OR
  p_qty IS NULL OR p_qty NOT BETWEEN 1 AND 1000000
 THEN RAISE EXCEPTION 'invalid expiry lot metadata' USING ERRCODE='P8602'; END IF;
 -- Serialize registration for each product and ensure batch quantities never
 -- exceed its test stock at the time of registration.
 SELECT stock_base_units INTO stock_now FROM zhirox_local.products
 WHERE store_id=p_store AND id=p_product AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'product not in test store' USING ERRCODE='P8602'; END IF;
 SELECT * INTO old FROM zhirox_local.expiry_lots_v86 WHERE store_id=p_store AND lot_id=p_lot;
 IF FOUND THEN
  IF old.product_id IS DISTINCT FROM p_product OR old.recorded_by IS DISTINCT FROM p_actor OR
   old.lot_code IS DISTINCT FROM btrim(p_code) OR old.expires_on IS DISTINCT FROM p_expiry OR
   old.declared_units IS DISTINCT FROM p_qty
  THEN RAISE EXCEPTION 'expiry lot request replay conflict' USING ERRCODE='P8603'; END IF;
  RETURN old.lot_id;
 END IF;
 SELECT coalesce(sum(declared_units::numeric),0) INTO registered_qty
 FROM zhirox_local.expiry_lots_v86
 WHERE store_id=p_store AND product_id=p_product;
 IF registered_qty+p_qty>stock_now
 THEN RAISE EXCEPTION 'declared lot quantities exceed current stock snapshot' USING ERRCODE='P8605'; END IF;
 INSERT INTO zhirox_local.expiry_lots_v86
  (store_id,lot_id,product_id,lot_code,expires_on,declared_units,recorded_by)
 VALUES(p_store,p_lot,p_product,btrim(p_code),p_expiry,p_qty,p_actor);
 RETURN p_lot;
END $register$;

-- Current date means risk labels automatically move without manual edits.
-- Declared quantity is a historical LOT REGISTRY snapshot, not up-to-date
-- batch-level availability (old sales are not linked to lots).
CREATE VIEW zhirox_local.expiry_watch_v86
WITH (security_barrier=true) AS
 SELECT l.store_id,l.lot_id,l.product_id,p.name AS product_name,
  l.lot_code,l.expires_on,l.declared_units,
  (l.expires_on-CURRENT_DATE)::integer AS days_remaining,
  CASE WHEN l.expires_on<CURRENT_DATE THEN 'expired'
       WHEN l.expires_on<=CURRENT_DATE+30 THEN 'soon'
       ELSE 'later' END AS expiry_state,
  l.recorded_at
 FROM zhirox_local.expiry_lots_v86 l
 JOIN zhirox_local.products p
  ON p.store_id=l.store_id AND p.id=l.product_id;
REVOKE ALL ON TABLE zhirox_local.expiry_lots_v86,
 zhirox_local.expiry_watch_v86 FROM PUBLIC;
REVOKE ALL ON FUNCTION
 zhirox_local.register_expiry_lot_v86(uuid,uuid,uuid,uuid,text,date,bigint),
 zhirox_local.reject_expiry_mutation_v86() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.expiry_lots_v86 IS
 'TEST ONLY: declared units are historic recorded batch metadata, NOT remaining batch stock, not FIFO, not sale blocking.';
COMMIT;
