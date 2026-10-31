-- ZHIROX V83: disposable local PostgreSQL only. Typed supplier purchasing
-- and idempotent one-shot receiving. NEVER auto-apply to production.
-- Requires 001_core.sql and 003_local_users.sql.
BEGIN;
CREATE TABLE zhirox_local.suppliers_v83 (
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 supplier_id uuid NOT NULL,
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 2 AND 160),
 phone text CHECK(phone IS NULL OR length(phone)<=40),
 active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,supplier_id),
 FOREIGN KEY(store_id,created_by) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE TABLE zhirox_local.purchase_orders_v83 (
 store_id uuid NOT NULL,
 order_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 original_lines jsonb NOT NULL CHECK(jsonb_typeof(original_lines)='array'),
 status text NOT NULL DEFAULT 'ordered' CHECK(status IN('ordered','received')),
 ordered_at timestamptz NOT NULL DEFAULT now(),
 received_at timestamptz,
 PRIMARY KEY(store_id,order_id),
 UNIQUE(store_id,request_id),
 FOREIGN KEY(store_id,supplier_id) REFERENCES zhirox_local.suppliers_v83(store_id,supplier_id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id),
 CHECK((status='received')=(received_at IS NOT NULL))
);
CREATE TABLE zhirox_local.purchase_order_lines_v83 (
 store_id uuid NOT NULL,
 order_id uuid NOT NULL,
 line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 50),
 product_id uuid NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units BETWEEN 1 AND 1000000),
 unit_cost_minor bigint NOT NULL CHECK(unit_cost_minor BETWEEN 0 AND 100000000),
 PRIMARY KEY(store_id,order_id,line_no),
 UNIQUE(store_id,order_id,product_id),
 FOREIGN KEY(store_id,order_id) REFERENCES zhirox_local.purchase_orders_v83(store_id,order_id),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE TABLE zhirox_local.goods_receipts_v83 (
 store_id uuid NOT NULL,
 receipt_id uuid NOT NULL,
 order_id uuid NOT NULL,
 request_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,receipt_id),
 UNIQUE(store_id,order_id),
 UNIQUE(store_id,request_id),
 FOREIGN KEY(store_id,order_id) REFERENCES zhirox_local.purchase_orders_v83(store_id,order_id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE TABLE zhirox_local.goods_receipt_lines_v83 (
 store_id uuid NOT NULL,
 receipt_id uuid NOT NULL,
 line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 50),
 product_id uuid NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units BETWEEN 1 AND 1000000),
 unit_cost_minor bigint NOT NULL CHECK(unit_cost_minor BETWEEN 0 AND 100000000),
 PRIMARY KEY(store_id,receipt_id,line_no),
 FOREIGN KEY(store_id,receipt_id) REFERENCES zhirox_local.goods_receipts_v83(store_id,receipt_id),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id)
);
CREATE INDEX suppliers_v83_name ON zhirox_local.suppliers_v83(store_id,display_name);
CREATE INDEX orders_v83_supplier ON zhirox_local.purchase_orders_v83(store_id,supplier_id,ordered_at DESC);
CREATE INDEX goods_v83_recent ON zhirox_local.goods_receipts_v83(store_id,received_at DESC);

CREATE FUNCTION zhirox_local.require_purchase_manager_v83(p_store uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users WHERE store_id=p_store
  AND id=p_actor AND enabled AND role IN('owner','manager')
  AND (locked_until IS NULL OR locked_until<now()))
 THEN RAISE EXCEPTION 'test market purchasing manager required' USING ERRCODE='P8301'; END IF;
END $fn$;
CREATE FUNCTION zhirox_local.register_supplier_v83(
 p_store uuid,p_actor uuid,p_supplier uuid,p_name text,p_phone text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE v_old zhirox_local.suppliers_v83%ROWTYPE;
BEGIN
 PERFORM zhirox_local.require_purchase_manager_v83(p_store,p_actor);
 IF p_supplier IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 160
    OR(p_phone IS NOT NULL AND length(p_phone)>40)
 THEN RAISE EXCEPTION 'invalid supplier' USING ERRCODE='P8302'; END IF;
 INSERT INTO zhirox_local.suppliers_v83(store_id,supplier_id,display_name,phone,created_by)
 VALUES(p_store,p_supplier,btrim(p_name),p_phone,p_actor)
 ON CONFLICT (store_id,supplier_id) DO NOTHING;
 SELECT * INTO v_old FROM zhirox_local.suppliers_v83
 WHERE store_id=p_store AND supplier_id=p_supplier;
 IF v_old.display_name IS DISTINCT FROM btrim(p_name) OR
    v_old.phone IS DISTINCT FROM p_phone OR
    v_old.created_by IS DISTINCT FROM p_actor
 THEN RAISE EXCEPTION 'supplier identifier conflict' USING ERRCODE='P8303'; END IF;
 RETURN p_supplier;
END $fn$;

CREATE FUNCTION zhirox_local.place_purchase_order_v83(
 p_store uuid,p_actor uuid,p_supplier uuid,p_request uuid,p_lines jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE v_existing zhirox_local.purchase_orders_v83%ROWTYPE;
 v_line jsonb; v_product uuid; v_qty bigint; v_cost bigint; v_i integer:=0;
BEGIN
 PERFORM zhirox_local.require_purchase_manager_v83(p_store,p_actor);
 IF p_request IS NULL OR p_supplier IS NULL OR p_lines IS NULL
  OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'invalid purchase order' USING ERRCODE='P8302'; END IF;
 -- Serialize creation per supplier and all exact replays before line processing.
 PERFORM 1 FROM zhirox_local.suppliers_v83
 WHERE store_id=p_store AND supplier_id=p_supplier AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'supplier unavailable' USING ERRCODE='P8302'; END IF;
 SELECT * INTO v_existing FROM zhirox_local.purchase_orders_v83
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF v_existing.supplier_id IS DISTINCT FROM p_supplier OR
    v_existing.actor_id IS DISTINCT FROM p_actor OR
    v_existing.original_lines IS DISTINCT FROM p_lines
  THEN RAISE EXCEPTION 'purchase request conflict' USING ERRCODE='P8303'; END IF;
  RETURN v_existing.order_id;
 END IF;
 -- Validate before inserting order. Products must all belong to the same store.
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(v_line)<>'object' OR
    (SELECT count(*) FROM jsonb_object_keys(v_line) k WHERE k NOT IN
      ('product_id','quantity_base_units','unit_cost_minor'))>0
  THEN RAISE EXCEPTION 'unexpected purchase line field' USING ERRCODE='P8302'; END IF;
  v_product:=(v_line->>'product_id')::uuid;
  v_qty:=(v_line->>'quantity_base_units')::bigint;
  v_cost:=(v_line->>'unit_cost_minor')::bigint;
  IF v_product IS NULL OR v_qty IS NULL OR v_qty NOT BETWEEN 1 AND 1000000
    OR v_cost IS NULL OR v_cost NOT BETWEEN 0 AND 100000000
    OR NOT EXISTS(SELECT 1 FROM zhirox_local.products
      WHERE store_id=p_store AND id=v_product AND active)
  THEN RAISE EXCEPTION 'invalid purchase product' USING ERRCODE='P8302'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x
 GROUP BY x->>'product_id' HAVING count(*)>1)
 THEN RAISE EXCEPTION 'duplicate product in order' USING ERRCODE='P8302'; END IF;
 INSERT INTO zhirox_local.purchase_orders_v83
  (store_id,order_id,supplier_id,request_id,actor_id,original_lines)
 VALUES(p_store,p_request,p_supplier,p_request,p_actor,p_lines);
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  v_i:=v_i+1;
  INSERT INTO zhirox_local.purchase_order_lines_v83
   (store_id,order_id,line_no,product_id,quantity_base_units,unit_cost_minor)
  VALUES(p_store,p_request,v_i,(v_line->>'product_id')::uuid,
   (v_line->>'quantity_base_units')::bigint,(v_line->>'unit_cost_minor')::bigint);
 END LOOP;
 RETURN p_request;
END $fn$;

CREATE FUNCTION zhirox_local.receive_purchase_order_v83(
 p_store uuid,p_actor uuid,p_order uuid,p_request uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE v_order zhirox_local.purchase_orders_v83%ROWTYPE;
 v_receipt zhirox_local.goods_receipts_v83%ROWTYPE;
 v_line record;
BEGIN
 PERFORM zhirox_local.require_purchase_manager_v83(p_store,p_actor);
 IF p_order IS NULL OR p_request IS NULL
 THEN RAISE EXCEPTION 'invalid receive reference' USING ERRCODE='P8302'; END IF;
 SELECT * INTO v_order FROM zhirox_local.purchase_orders_v83
 WHERE store_id=p_store AND order_id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order unavailable' USING ERRCODE='P8302'; END IF;
 SELECT * INTO v_receipt FROM zhirox_local.goods_receipts_v83
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF v_receipt.order_id IS DISTINCT FROM p_order OR
    v_receipt.actor_id IS DISTINCT FROM p_actor
  THEN RAISE EXCEPTION 'receipt request conflict' USING ERRCODE='P8303'; END IF;
  RETURN v_receipt.receipt_id;
 END IF;
 IF v_order.status<>'ordered' THEN
  RAISE EXCEPTION 'purchase order already received' USING ERRCODE='P8303'; END IF;
 -- Single ACID transaction: stock increment, immutable receipt lines, final state.
 -- Lock product rows in predictable order, preventing concurrent checkout
 -- and multi-product receiving deadlocks.
 FOR v_line IN SELECT l.* FROM zhirox_local.purchase_order_lines_v83 l
  WHERE l.store_id=p_store AND l.order_id=p_order
  ORDER BY l.product_id FOR UPDATE LOOP
  UPDATE zhirox_local.products SET stock_base_units=stock_base_units+v_line.quantity_base_units,
      version=version+1
  WHERE store_id=p_store AND id=v_line.product_id AND active AND
    stock_base_units<=9999999999999-v_line.quantity_base_units;
  IF NOT FOUND THEN RAISE EXCEPTION 'product missing or stock overflow' USING ERRCODE='P8305'; END IF;
 END LOOP;
 INSERT INTO zhirox_local.goods_receipts_v83
 (store_id,receipt_id,order_id,request_id,actor_id)
 VALUES(p_store,p_request,p_order,p_request,p_actor);
 INSERT INTO zhirox_local.goods_receipt_lines_v83
  (store_id,receipt_id,line_no,product_id,quantity_base_units,unit_cost_minor)
 SELECT store_id,p_request,line_no,product_id,quantity_base_units,unit_cost_minor
 FROM zhirox_local.purchase_order_lines_v83
 WHERE store_id=p_store AND order_id=p_order;
 UPDATE zhirox_local.purchase_orders_v83 SET status='received',received_at=now()
 WHERE store_id=p_store AND order_id=p_order;
 RETURN p_request;
END $fn$;

CREATE FUNCTION zhirox_local.block_supply_ledger_change_v83()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'immutable supplier receiving history' USING ERRCODE='P8304';
END $fn$;
CREATE TRIGGER supply_receipt_immutable_v83 BEFORE UPDATE OR DELETE
 ON zhirox_local.goods_receipts_v83 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.block_supply_ledger_change_v83();
CREATE TRIGGER supply_receipt_lines_immutable_v83 BEFORE UPDATE OR DELETE
 ON zhirox_local.goods_receipt_lines_v83 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.block_supply_ledger_change_v83();
CREATE TRIGGER supply_order_lines_immutable_v83 BEFORE UPDATE OR DELETE
 ON zhirox_local.purchase_order_lines_v83 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.block_supply_ledger_change_v83();
REVOKE ALL ON TABLE zhirox_local.suppliers_v83,
 zhirox_local.purchase_orders_v83,zhirox_local.purchase_order_lines_v83,
 zhirox_local.goods_receipts_v83,zhirox_local.goods_receipt_lines_v83 FROM PUBLIC;
REVOKE ALL ON FUNCTION
 zhirox_local.require_purchase_manager_v83(uuid,uuid),
 zhirox_local.register_supplier_v83(uuid,uuid,uuid,text,text),
 zhirox_local.place_purchase_order_v83(uuid,uuid,uuid,uuid,jsonb),
 zhirox_local.receive_purchase_order_v83(uuid,uuid,uuid,uuid),
 zhirox_local.block_supply_ledger_change_v83() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.purchase_orders_v83 IS
 'Isolated local test purchasing. Unit cost is a purchase commitment, NOT a settled payable or actual cash payment.';
COMMENT ON TABLE zhirox_local.goods_receipt_lines_v83 IS
 'Immutable supplier receiving stock movement records, separate from the V1 sale-side stock_ledger.';
COMMIT;
