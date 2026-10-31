-- V95 isolated PostgreSQL CI laboratory only. No financial checkout is executed.
-- A role with EXECUTE on one SECURITY DEFINER *preflight* function cannot
-- insert into sales or alter inventory; all decisions are auditable.
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'zhirox_v80_disposable'
 OR current_user<>'v80test'
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR (SELECT name FROM zhirox_local.stores WHERE id='88000000-0000-4000-8000-000000000080')
   IS DISTINCT FROM 'مارکێتی تاقیکردنەوە'
 OR (SELECT count(*) FROM zhirox_local.sales
   WHERE store_id='88000000-0000-4000-8000-000000000080')<>7
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='zhirox_v94_auth' AND NOT rolcanlogin)
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='zhirox_v95_gate')
 THEN RAISE EXCEPTION 'V95 gate requires disposable V94 CI test state' USING ERRCODE='P9501';
 END IF;
END $guard$;

CREATE TABLE zhirox_local.checkout_intent_audit_v95(
 audit_id uuid PRIMARY KEY,
 store_id uuid NOT NULL,
 actor_claim uuid,
 request_id uuid,
 allowed boolean NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 2 AND 80),
 line_count integer NOT NULL CHECK(line_count BETWEEN 0 AND 30),
 checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(store_id='88000000-0000-4000-8000-000000000080'::uuid)
);
CREATE INDEX checkout_intent_audit_v95_time
 ON zhirox_local.checkout_intent_audit_v95(checked_at,audit_id);

CREATE ROLE zhirox_v95_gate
 NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA zhirox_local TO zhirox_v95_gate;
REVOKE ALL ON ALL TABLES IN SCHEMA zhirox_local FROM zhirox_v95_gate;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zhirox_local FROM zhirox_v95_gate;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zhirox_local FROM zhirox_v95_gate;

CREATE FUNCTION zhirox_local.preflight_checkout_v95(
 p_store uuid,p_actor uuid,p_request uuid,p_lines jsonb
) RETURNS TABLE(allowed boolean,reason text,audit_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,zhirox_local AS $fn$
DECLARE
 v_reason text:='allowed';
 v_count integer:=0;
 v_actor_role text;
 v_item jsonb;
 v_product uuid;
 v_qty bigint;
 v_stock bigint;
 v_available bigint;
 v_row record;
 v_audit uuid:=gen_random_uuid();
BEGIN
 -- session_user reflects the independently logged-in PostgreSQL identity.
 -- Even privileged accounts cannot accidentally use this path as an API.
 IF session_user<>'zhirox_v95_gate'
 OR current_database()<>'zhirox_v80_disposable'
 THEN RAISE EXCEPTION 'V95 requires isolated, dedicated SQL gate role'
  USING ERRCODE='P9501'; END IF;
 IF p_store IS DISTINCT FROM '88000000-0000-4000-8000-000000000080'::uuid
 OR (SELECT count(*) FROM zhirox_local.stores)<>1
 OR NOT EXISTS(SELECT 1 FROM zhirox_local.stores
    WHERE id=p_store AND name='مارکێتی تاقیکردنەوە')
 THEN RAISE EXCEPTION 'V95 forbids other stores' USING ERRCODE='P9501'; END IF;

 IF p_request IS NULL OR p_actor IS NULL OR p_lines IS NULL
    OR jsonb_typeof(p_lines)<>'array'
 THEN v_reason:='invalid_request';
 ELSIF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30
 THEN v_reason:='invalid_lines';
 ELSE
  v_count:=jsonb_array_length(p_lines);
  SELECT role INTO v_actor_role FROM zhirox_local.local_users
   WHERE store_id=p_store AND id=p_actor AND enabled
    AND (locked_until IS NULL OR locked_until<clock_timestamp());
  IF v_actor_role IS NULL OR v_actor_role NOT IN('owner','manager','cashier')
  THEN v_reason:='actor_not_permitted';
  ELSE
   FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_item)<>'object'
    OR NOT (v_item ? 'product_id') OR NOT (v_item ? 'qty')
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) k
      WHERE k NOT IN('product_id','qty'))
    OR jsonb_typeof(v_item->'qty')<>'number'
    OR COALESCE(v_item->>'qty','') !~ '^[1-9][0-9]{0,5}$'
    THEN v_reason:='invalid_lines'; EXIT; END IF;
    BEGIN
     v_product:=(v_item->>'product_id')::uuid;
     v_qty:=(v_item->>'qty')::bigint;
     IF v_product IS NULL OR v_qty NOT BETWEEN 1 AND 100000
     THEN v_reason:='invalid_lines'; EXIT; END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
     v_reason:='invalid_lines'; EXIT;
    END;
   END LOOP;

   IF v_reason='allowed' THEN
    FOR v_row IN
     SELECT (x->>'product_id')::uuid AS product_id,
         sum((x->>'qty')::bigint) AS quantity
       FROM jsonb_array_elements(p_lines) x GROUP BY 1
    LOOP
     IF v_row.quantity NOT BETWEEN 1 AND 1000000
     THEN v_reason:='invalid_lines'; EXIT; END IF;
     SELECT p.stock_base_units INTO v_stock
       FROM zhirox_local.products p
       WHERE p.store_id=p_store AND p.id=v_row.product_id AND p.active;
     IF v_stock IS NULL THEN v_reason:='unknown_product'; EXIT; END IF;
     SELECT COALESCE(sum(tracked_remaining),0)::bigint INTO v_available
       FROM zhirox_local.lot_inventory_v90
       WHERE store_id=p_store AND product_id=v_row.product_id
       AND expires_on>=current_date AND tracked_remaining>0;
     IF v_stock<v_row.quantity OR v_available<v_row.quantity
     THEN v_reason:='insufficient_saleable_lots'; EXIT; END IF;
    END LOOP;
   END IF;
  END IF;
 END IF;

 INSERT INTO zhirox_local.checkout_intent_audit_v95(
   audit_id,store_id,actor_claim,request_id,allowed,reason,line_count)
 VALUES(v_audit,p_store,p_actor,p_request,v_reason='allowed',v_reason,v_count);
 RETURN QUERY SELECT (v_reason='allowed'),v_reason,v_audit;
END $fn$;

REVOKE ALL ON FUNCTION zhirox_local.preflight_checkout_v95(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zhirox_local.preflight_checkout_v95(uuid,uuid,uuid,jsonb)
 TO zhirox_v95_gate;
COMMENT ON FUNCTION zhirox_local.preflight_checkout_v95(uuid,uuid,uuid,jsonb) IS
 'V95 synthetic trial only: no checkout or stock mutation. Server-supplied actor claim is NOT a database cryptographic actor proof.';
COMMENT ON ROLE zhirox_v95_gate IS
 'V95 test preflight-only call role. No financial base-table access. Never issue customer credentials.';
COMMIT;
