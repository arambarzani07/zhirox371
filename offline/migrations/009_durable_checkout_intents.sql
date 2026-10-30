-- V31: Durable local checkout intents. Apply ONLY to disposable PostgreSQL.
-- The journal is committed BEFORE finalizing a sale, so PC/browser crash can
-- recover the same UUID. No online/cloud participation in this transaction.
BEGIN;
CREATE TABLE IF NOT EXISTS zhirox_local.checkout_intents_v31 (
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 cashier_id uuid NOT NULL,
 request_id uuid NOT NULL,
 lines jsonb NOT NULL,
 expected_total_minor bigint NOT NULL
   CHECK(expected_total_minor>=0 AND expected_total_minor<=9999999999999),
 state text NOT NULL DEFAULT 'prepared'
   CHECK(state IN ('prepared','committed','cancelled')),
 sale_id uuid,
 receipt_no bigint,
 total_minor bigint,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,request_id),
 CHECK((state='committed' AND sale_id IS NOT NULL AND receipt_no>0 AND total_minor>=0)
    OR (state<>'committed' AND sale_id IS NULL AND receipt_no IS NULL AND total_minor IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS v31_one_prepared_per_cashier
 ON zhirox_local.checkout_intents_v31(store_id,cashier_id)
 WHERE state='prepared';

CREATE OR REPLACE FUNCTION zhirox_local.prepare_checkout_v31(
 p_store uuid,p_cashier uuid,p_request uuid,p_lines jsonb,p_total bigint
) RETURNS TABLE(request_id uuid,state text,lines jsonb,expected_total_minor bigint,
 sale_id uuid,receipt_no bigint,total_minor bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
DECLARE
 old zhirox_local.checkout_intents_v31%ROWTYPE;
 normalized jsonb := '[]'::jsonb;
 item jsonb;
 code text;
 quantity bigint;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_request IS NULL
    OR p_total IS NULL OR p_total<0 OR p_total>9999999999999
    OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'invalid checkout' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object'
     OR jsonb_typeof(item->'barcode') IS DISTINCT FROM 'string'
     OR jsonb_typeof(item->'qty') IS DISTINCT FROM 'number'
     OR (item->>'qty') !~ '^[1-9][0-9]{0,2}$'
   THEN RAISE EXCEPTION 'invalid checkout lines' USING ERRCODE='22023'; END IF;
   code:=item->>'barcode';
   quantity:=(item->>'qty')::bigint;
   IF code !~ '^[A-Za-z0-9._-]{4,80}$' OR quantity>100
   THEN RAISE EXCEPTION 'invalid barcode or quantity' USING ERRCODE='22023'; END IF;
   normalized:=normalized||jsonb_build_array(
     jsonb_build_object('barcode',code,'qty',quantity));
 END LOOP;
 -- Store lock aligns concurrent prepare/cancel/commit with V26's stock locks.
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='22023'; END IF;
 SELECT * INTO old FROM zhirox_local.checkout_intents_v31
 WHERE store_id=p_store AND request_id=p_request;
 IF FOUND THEN
   IF old.cashier_id<>p_cashier OR old.lines IS DISTINCT FROM normalized
      OR old.expected_total_minor<>p_total
   THEN RAISE EXCEPTION 'checkout UUID reused with changed actor or quote'
     USING ERRCODE='23505'; END IF;
 ELSE
   IF EXISTS(SELECT 1 FROM zhirox_local.checkout_intents_v31
      WHERE store_id=p_store AND cashier_id=p_cashier AND state='prepared')
   THEN RAISE EXCEPTION 'unfinished checkout requires recovery'
     USING ERRCODE='P3102'; END IF;
   INSERT INTO zhirox_local.checkout_intents_v31
    (store_id,cashier_id,request_id,lines,expected_total_minor)
   VALUES(p_store,p_cashier,p_request,normalized,p_total);
 END IF;
 RETURN QUERY SELECT i.request_id,i.state,i.lines,i.expected_total_minor,
   i.sale_id,i.receipt_no,i.total_minor
 FROM zhirox_local.checkout_intents_v31 i
 WHERE i.store_id=p_store AND i.request_id=p_request;
END $$;

CREATE OR REPLACE FUNCTION zhirox_local.commit_checkout_v31(
 p_store uuid,p_cashier uuid,p_request uuid
) RETURNS TABLE(sale_id uuid,receipt_no bigint,total_minor bigint,replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
DECLARE intent zhirox_local.checkout_intents_v31%ROWTYPE;
 result record;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_request IS NULL
 THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown store' USING ERRCODE='22023'; END IF;
 SELECT * INTO intent FROM zhirox_local.checkout_intents_v31
 WHERE store_id=p_store AND request_id=p_request AND cashier_id=p_cashier FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'request was not durably prepared'
   USING ERRCODE='P3101'; END IF;
 IF intent.state='cancelled' THEN RAISE EXCEPTION 'request cancelled'
   USING ERRCODE='P3103'; END IF;
 IF intent.state='committed' THEN
   RETURN QUERY SELECT intent.sale_id,intent.receipt_no,intent.total_minor,true;
   RETURN;
 END IF;
 SELECT * INTO STRICT result
 FROM zhirox_local.checkout_packs_scale_v26(
   p_store,p_cashier,p_request,intent.lines,intent.expected_total_minor);
 UPDATE zhirox_local.checkout_intents_v31
 SET state='committed',sale_id=result.sale_id,
    receipt_no=result.receipt_no,total_minor=result.total_minor,updated_at=now()
 WHERE store_id=p_store AND request_id=p_request AND cashier_id=p_cashier;
 RETURN QUERY SELECT result.sale_id,result.receipt_no,result.total_minor,result.replayed;
END $$;

CREATE OR REPLACE FUNCTION zhirox_local.cancel_checkout_v31(
 p_store uuid,p_cashier uuid,p_request uuid
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,zhirox_local AS $$
DECLARE intent zhirox_local.checkout_intents_v31%ROWTYPE;
BEGIN
 IF p_store IS NULL OR p_cashier IS NULL OR p_request IS NULL
 THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM zhirox_local.stores WHERE id=p_store FOR UPDATE;
 SELECT * INTO intent FROM zhirox_local.checkout_intents_v31
 WHERE store_id=p_store AND request_id=p_request AND cashier_id=p_cashier FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown request' USING ERRCODE='P3101'; END IF;
 IF intent.state='committed' THEN RETURN 'committed'; END IF;
 IF intent.state='cancelled' THEN RETURN 'cancelled'; END IF;
 -- Fail closed: a committed V26 sale with the UUID cannot be cancelled.
 IF EXISTS(SELECT 1 FROM zhirox_local.sales
           WHERE store_id=p_store AND request_id=p_request)
 THEN RAISE EXCEPTION 'sale exists; cannot cancel'
      USING ERRCODE='23505'; END IF;
 UPDATE zhirox_local.checkout_intents_v31 SET state='cancelled',updated_at=now()
 WHERE store_id=p_store AND request_id=p_request AND cashier_id=p_cashier;
 RETURN 'cancelled';
END $$;
REVOKE ALL ON FUNCTION zhirox_local.prepare_checkout_v31(uuid,uuid,uuid,jsonb,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.commit_checkout_v31(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.cancel_checkout_v31(uuid,uuid,uuid) FROM PUBLIC;
COMMIT;
