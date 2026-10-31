-- V84 isolated PostgreSQL test-market returns (accounting + optional stock).
-- NEVER a real cash payout, bank refund, credit-note settlement or production migration.
-- Prerequisites: 001_core.sql, 002_atomic_checkout.sql, 003_local_users.sql.
BEGIN;
CREATE TABLE zhirox_local.sale_returns_v84(
 store_id uuid NOT NULL,
 return_id uuid NOT NULL,
 request_id uuid NOT NULL,
 sale_id uuid NOT NULL,
 line_no integer NOT NULL,
 product_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 quantity_base_units bigint NOT NULL CHECK(quantity_base_units BETWEEN 1 AND 1000000),
 unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
 amount_minor bigint NOT NULL CHECK(amount_minor>=0),
 restocked boolean NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 160),
 status text NOT NULL DEFAULT 'accounting_only'
  CHECK(status='accounting_only'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,return_id),
 UNIQUE(store_id,request_id),
 FOREIGN KEY(store_id,sale_id) REFERENCES zhirox_local.sales(store_id,id),
 FOREIGN KEY(store_id,sale_id,line_no) REFERENCES zhirox_local.sale_lines(store_id,sale_id,line_no),
 FOREIGN KEY(store_id,product_id) REFERENCES zhirox_local.products(store_id,id),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX sale_returns_v84_by_sale
 ON zhirox_local.sale_returns_v84(store_id,sale_id,line_no,created_at DESC);
CREATE FUNCTION zhirox_local.deny_sale_return_mutation_v84()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 RAISE EXCEPTION 'immutable sale return journal' USING ERRCODE='P8404';
END $fn$;
CREATE TRIGGER sale_return_immutable_v84 BEFORE UPDATE OR DELETE
 ON zhirox_local.sale_returns_v84 FOR EACH ROW
 EXECUTE FUNCTION zhirox_local.deny_sale_return_mutation_v84();
-- p_actor MUST be derived by a trusted authenticated local process,
-- NEVER from the cashier browser. Function is NOT granted to browser/public.
CREATE FUNCTION zhirox_local.record_sale_return_v84(
 p_store uuid,p_actor uuid,p_sale uuid,p_line_no integer,
 p_request uuid,p_qty bigint,p_restock boolean,p_reason text
) RETURNS TABLE(return_id uuid,refund_amount_minor bigint,replayed boolean)
 LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 v_existing zhirox_local.sale_returns_v84%ROWTYPE;
 v_line zhirox_local.sale_lines%ROWTYPE;
 v_prev_qty numeric;
 v_amount numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.local_users
 WHERE store_id=p_store AND id=p_actor AND enabled
 AND role IN('owner','manager')
 AND (locked_until IS NULL OR locked_until<now()))
 THEN RAISE EXCEPTION 'manager only' USING ERRCODE='P8401'; END IF;
 IF p_sale IS NULL OR p_request IS NULL OR p_line_no IS NULL OR p_line_no<1
 OR p_qty IS NULL OR p_qty NOT BETWEEN 1 AND 1000000
 OR p_restock IS NULL OR p_reason IS NULL
 OR length(btrim(p_reason)) NOT BETWEEN 3 AND 160
 THEN RAISE EXCEPTION 'invalid return' USING ERRCODE='P8402'; END IF;
 -- Serialize ALL returns for one sale. This lock protects the cumulative
 -- quantity check against overlapping request IDs and concurrent actors.
 PERFORM 1 FROM zhirox_local.sales
 WHERE store_id=p_store AND id=p_sale FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE='P8402'; END IF;
 SELECT * INTO v_existing FROM zhirox_local.sale_returns_v84
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
  IF v_existing.sale_id IS DISTINCT FROM p_sale OR
     v_existing.actor_id IS DISTINCT FROM p_actor OR
     v_existing.line_no IS DISTINCT FROM p_line_no OR
     v_existing.quantity_base_units IS DISTINCT FROM p_qty OR
     v_existing.restocked IS DISTINCT FROM p_restock OR
     v_existing.reason IS DISTINCT FROM btrim(p_reason)
  THEN RAISE EXCEPTION 'return request conflict' USING ERRCODE='P8403'; END IF;
  RETURN QUERY SELECT v_existing.return_id,v_existing.amount_minor,true;
  RETURN;
 END IF;
 SELECT * INTO v_line FROM zhirox_local.sale_lines
 WHERE store_id=p_store AND sale_id=p_sale AND line_no=p_line_no;
 IF NOT FOUND THEN RAISE EXCEPTION 'original sale line not found' USING ERRCODE='P8402'; END IF;
 SELECT COALESCE(sum(quantity_base_units::numeric),0) INTO v_prev_qty
 FROM zhirox_local.sale_returns_v84
 WHERE store_id=p_store AND sale_id=p_sale AND line_no=p_line_no;
 IF v_prev_qty+p_qty>v_line.quantity_base_units
 THEN RAISE EXCEPTION 'return exceeds sold units' USING ERRCODE='P8405'; END IF;
 -- Never trust an amount supplied by a client: refund face value is
 -- calculated from immutable original sale-line snapshot.
 v_amount:=p_qty::numeric*v_line.unit_price_minor::numeric;
 IF v_amount>9223372036854775807
 THEN RAISE EXCEPTION 'return total overflow' USING ERRCODE='P8402'; END IF;
 IF p_restock THEN
  UPDATE zhirox_local.products
   SET stock_base_units=stock_base_units+p_qty,version=version+1
  WHERE store_id=p_store AND id=v_line.product_id AND active
   AND stock_base_units<=9999999999999-p_qty;
  IF NOT FOUND THEN RAISE EXCEPTION 'restock product unavailable or overflow' USING ERRCODE='P8405'; END IF;
 END IF;
 INSERT INTO zhirox_local.sale_returns_v84
 (store_id,return_id,request_id,sale_id,line_no,product_id,actor_id,
  quantity_base_units,unit_price_minor,amount_minor,restocked,reason)
 VALUES(p_store,p_request,p_request,p_sale,p_line_no,v_line.product_id,
  p_actor,p_qty,v_line.unit_price_minor,v_amount::bigint,p_restock,btrim(p_reason));
 RETURN QUERY SELECT p_request,v_amount::bigint,false;
END $fn$;
REVOKE ALL ON TABLE zhirox_local.sale_returns_v84 FROM PUBLIC;
REVOKE ALL ON FUNCTION
 zhirox_local.record_sale_return_v84(uuid,uuid,uuid,integer,uuid,bigint,boolean,text),
 zhirox_local.deny_sale_return_mutation_v84() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.sale_returns_v84 IS
 'Test-only append-only return journal. amount_minor is face value ONLY; no cash payout, verified refund, or bank transfer.';
COMMIT;
