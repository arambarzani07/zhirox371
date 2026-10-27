-- V19 kilogram receipt: decimal kg precision, atomic stock and idempotent request UUID.
CREATE OR REPLACE FUNCTION retail_internal.receive_weight_v19(
 p_store uuid,p_barcode text,p_kg numeric,p_reason text,p_request uuid
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid:=(SELECT auth.uid());v_product uuid;v_stock numeric(14,3);v_prev record;
 v_payload jsonb;
BEGIN
 IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager'])
 THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_reason NOT IN ('purchase','opening') OR
    p_kg IS NULL OR p_kg<0.001 OR p_kg>1000000 OR p_kg<>round(p_kg,3)
 THEN RAISE EXCEPTION 'Invalid kg receipt' USING ERRCODE='22023'; END IF;
 SELECT p.id INTO v_product
 FROM public.retail_products p
 JOIN public.retail_barcodes b ON b.store_id=p.store_id AND b.product_id=p.id
 WHERE p.store_id=p_store AND b.code=p_barcode AND b.active
   AND b.unit_type='unit' AND b.units_per_scan=1
   AND p.active AND p.base_unit='kg';
 IF NOT FOUND THEN RAISE EXCEPTION 'Active kg product barcode required' USING ERRCODE='22023'; END IF;
 v_payload:=jsonb_build_object('mode','kg','product_id',v_product,
    'barcode',p_barcode,'kg',p_kg,'reason',p_reason);
 INSERT INTO retail_internal.stock_receive_requests(store_id,request_id,actor_id,fingerprint)
 VALUES(p_store,p_request,v_actor,v_payload)
 ON CONFLICT(store_id,request_id) DO NOTHING;
 SELECT actor_id,fingerprint,result_quantity INTO v_prev
 FROM retail_internal.stock_receive_requests
 WHERE store_id=p_store AND request_id=p_request FOR UPDATE;
 IF v_prev.actor_id IS DISTINCT FROM v_actor OR v_prev.fingerprint IS DISTINCT FROM v_payload
 THEN RAISE EXCEPTION 'Request reused with changed payload' USING ERRCODE='22023'; END IF;
 IF v_prev.result_quantity IS NOT NULL THEN RETURN v_prev.result_quantity; END IF;
 INSERT INTO public.retail_stock_balances(store_id,product_id,quantity)
 VALUES(p_store,v_product,p_kg)
 ON CONFLICT(store_id,product_id) DO UPDATE
 SET quantity=public.retail_stock_balances.quantity+excluded.quantity,updated_at=now()
 RETURNING quantity INTO v_stock;
 INSERT INTO public.retail_stock_events(store_id,product_id,delta,reason)
 VALUES(p_store,v_product,p_kg,p_reason);
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 VALUES(p_store,v_actor,'stock.receive_kg_v19',v_product,
  jsonb_build_object('request_id',p_request,'kg',p_kg,'reason',p_reason));
 UPDATE retail_internal.stock_receive_requests
 SET base_units=p_kg,result_quantity=v_stock
 WHERE store_id=p_store AND request_id=p_request;
 RETURN v_stock;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.receive_weight_v19(uuid,text,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION retail_internal.receive_weight_v19(uuid,text,numeric,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_receive_weight_v19(
 p_store uuid,p_barcode text,p_kg numeric,p_reason text,p_request uuid
) RETURNS numeric LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT retail_internal.receive_weight_v19(p_store,p_barcode,p_kg,p_reason,p_request);
$fn$;
REVOKE ALL ON FUNCTION public.retail_receive_weight_v19(uuid,text,numeric,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_receive_weight_v19(uuid,text,numeric,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';