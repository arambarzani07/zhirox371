-- V22: receipt-linked returns, FIFO debt reconciliation and complete server reports.
-- Upgrade candidate only; requires V21. No hosted database changes are automated.
BEGIN;
ALTER TABLE public.retail_sale_items
 ADD COLUMN IF NOT EXISTS returned_quantity numeric(14,3) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS returned_minor bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS unit_cost_minor_snapshot numeric(20,6);
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS returned_minor_total bigint NOT NULL DEFAULT 0;
ALTER TABLE public.retail_customer_ledger DROP CONSTRAINT IF EXISTS retail_customer_ledger_entry_type_check;
ALTER TABLE public.retail_customer_ledger ADD CONSTRAINT retail_customer_ledger_entry_type_check
 CHECK(entry_type IN ('opening_balance','debt_sale','debt_add','payment_received','paid_purchase','adjustment','sale_return'));
CREATE TABLE IF NOT EXISTS public.retail_sale_returns_v22(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,sale_id uuid NOT NULL,
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,
 refund_minor bigint NOT NULL CHECK(refund_minor>=0),cash_minor bigint NOT NULL CHECK(cash_minor>=0),
 debt_minor bigint NOT NULL CHECK(debt_minor>=0),note text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,request_id),UNIQUE(store_id,id),CHECK(refund_minor=cash_minor+debt_minor),
 FOREIGN KEY(store_id,sale_id) REFERENCES public.retail_sales(store_id,id),
 FOREIGN KEY(store_id,session_id) REFERENCES public.retail_cash_sessions(store_id,id)
);
CREATE TABLE IF NOT EXISTS public.retail_sale_return_lines_v22(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,return_id uuid NOT NULL,
 sale_item_id uuid NOT NULL REFERENCES public.retail_sale_items(id),product_id uuid NOT NULL REFERENCES public.retail_products(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),base_units numeric(14,3) NOT NULL CHECK(base_units>0),
 refund_minor bigint NOT NULL CHECK(refund_minor>=0),cost_minor bigint CHECK(cost_minor>=0),
 UNIQUE(return_id,sale_item_id),FOREIGN KEY(store_id,return_id) REFERENCES public.retail_sale_returns_v22(store_id,id)
);
ALTER TABLE public.retail_sale_returns_v22 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sale_return_lines_v22 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retail_sale_returns_v22,public.retail_sale_return_lines_v22 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.retail_sale_returns_v22,public.retail_sale_return_lines_v22 TO authenticated;
DROP POLICY IF EXISTS returns_member_read ON public.retail_sale_returns_v22;
CREATE POLICY returns_member_read ON public.retail_sale_returns_v22 FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,ARRAY['manager','cashier']));
DROP POLICY IF EXISTS return_lines_member_read ON public.retail_sale_return_lines_v22;
CREATE POLICY return_lines_member_read ON public.retail_sale_return_lines_v22 FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,ARRAY['manager','cashier']));
CREATE INDEX IF NOT EXISTS retail_returns_store_created_v22 ON public.retail_sale_returns_v22(store_id,created_at);
CREATE INDEX IF NOT EXISTS retail_sales_store_created_v22 ON public.retail_sales(store_id,created_at);
CREATE INDEX IF NOT EXISTS retail_items_store_sale_v22 ON public.retail_sale_items(store_id,sale_id);

-- Costs are captured once at checkout. Unknown historic costs remain unknown.
CREATE OR REPLACE FUNCTION retail_internal.snapshot_cost_v22() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 SELECT coalesce(pc.unit_cost_minor,p.purchase_price_minor,c.purchase_price_minor::numeric/nullif(c.units_per_carton,0))
 INTO NEW.unit_cost_minor_snapshot FROM public.retail_products p
 LEFT JOIN public.retail_product_costs pc ON pc.store_id=p.store_id AND pc.product_id=p.id
 LEFT JOIN public.retail_product_cartons c ON c.store_id=p.store_id AND c.product_id=p.id
 WHERE p.store_id=NEW.store_id AND p.id=NEW.product_id;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.snapshot_cost_v22() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS retail_cost_snapshot_v22 ON public.retail_sale_items;
CREATE TRIGGER retail_cost_snapshot_v22 BEFORE INSERT ON public.retail_sale_items FOR EACH ROW EXECUTE FUNCTION retail_internal.snapshot_cost_v22();

-- Allocate receipt-level discounts using cumulative rounding in immutable line-ID order.
CREATE OR REPLACE VIEW retail_internal.sale_line_values_v22 WITH(security_invoker=true) AS
WITH lines AS (
 SELECT i.id,i.store_id,i.sale_id,i.product_id,i.quantity,i.unit_price_minor,i.product_name_snapshot,
 i.package_type,i.package_barcode,i.units_per_package,i.base_units,i.base_unit_snapshot,i.returned_quantity,i.returned_minor,i.unit_cost_minor_snapshot,s.created_at AS sold_at,s.total_minor AS sale_net,s.discount_minor AS sale_discount,
  round(i.quantity*i.unit_price_minor) AS gross_minor,
  sum(round(i.quantity*i.unit_price_minor)) OVER(PARTITION BY i.store_id,i.sale_id) AS receipt_gross,
  sum(round(i.quantity*i.unit_price_minor)) OVER(PARTITION BY i.store_id,i.sale_id ORDER BY i.id ROWS UNBOUNDED PRECEDING) AS cumulative_gross
 FROM public.retail_sale_items i JOIN public.retail_sales s ON s.store_id=i.store_id AND s.id=i.sale_id WHERE s.status='posted'
)
SELECT lines.*,coalesce(base_units,quantity*coalesce(units_per_package,1)) AS sold_base_units,
 CASE WHEN receipt_gross=0 THEN 0 ELSE
 round(sale_net::numeric*cumulative_gross/receipt_gross)-round(sale_net::numeric*(cumulative_gross-gross_minor)/receipt_gross) END::bigint AS net_minor,
 CASE WHEN unit_cost_minor_snapshot IS NULL THEN NULL ELSE round(coalesce(base_units,quantity*coalesce(units_per_package,1))*unit_cost_minor_snapshot)::bigint END AS cost_minor
FROM lines;
REVOKE ALL ON retail_internal.sale_line_values_v22 FROM PUBLIC,anon,authenticated;

-- Preserve already completed legacy full returns without inventing new cash/stock entries.
UPDATE public.retail_sale_items i SET returned_quantity=i.quantity,returned_minor=v.net_minor
FROM retail_internal.sale_line_values_v22 v,public.retail_sales s
WHERE i.id=v.id AND s.id=i.sale_id AND s.store_id=i.store_id AND s.refunded
 AND NOT EXISTS(SELECT 1 FROM public.retail_sale_returns_v22 r WHERE r.sale_id=s.id AND r.store_id=s.store_id);
UPDATE public.retail_sales SET returned_minor_total=total_minor WHERE refunded AND returned_minor_total=0;

CREATE OR REPLACE FUNCTION retail_internal.sale_debt_remaining_v22(p_store uuid,p_customer uuid,p_sale uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_balance numeric;v_sum numeric;v_payments numeric;v_legacy numeric;v_entry record;v_prior numeric;v_effective numeric;v_count integer;
BEGIN
 SELECT balance_minor INTO v_balance FROM public.retail_customers WHERE id=p_customer AND store_id=p_store;
 SELECT coalesce(sum(delta_minor),0),coalesce(sum(-delta_minor) FILTER(WHERE delta_minor<0 AND entry_type<>'sale_return'),0)
 INTO v_sum,v_payments FROM public.retail_customer_ledger WHERE store_id=p_store AND customer_id=p_customer;
 v_legacy:=v_balance-v_sum;
 IF v_legacy<0 THEN RAISE EXCEPTION 'Customer ledger requires reconciliation' USING ERRCODE='22023';END IF;
 SELECT count(*) INTO v_count FROM public.retail_customer_ledger WHERE store_id=p_store AND customer_id=p_customer AND sale_id=p_sale AND entry_type='debt_sale' AND delta_minor>0;
 IF v_count<>1 THEN RAISE EXCEPTION 'Receipt debt requires reconciliation' USING ERRCODE='22023';END IF;
 SELECT * INTO v_entry FROM public.retail_customer_ledger WHERE store_id=p_store AND customer_id=p_customer AND sale_id=p_sale AND entry_type='debt_sale' AND delta_minor>0;
 SELECT v_legacy+coalesce(sum(l.delta_minor-coalesce((SELECT sum(r.debt_minor) FROM public.retail_sale_returns_v22 r WHERE r.store_id=p_store AND r.sale_id=l.sale_id),0)),0)
 INTO v_prior FROM public.retail_customer_ledger l WHERE l.store_id=p_store AND l.customer_id=p_customer AND l.delta_minor>0 AND (l.created_at,l.id)<(v_entry.created_at,v_entry.id);
 SELECT v_entry.delta_minor-coalesce(sum(debt_minor),0) INTO v_effective FROM public.retail_sale_returns_v22 WHERE store_id=p_store AND sale_id=p_sale;
 IF v_effective<0 OR v_prior<0 THEN RAISE EXCEPTION 'Receipt debt requires reconciliation' USING ERRCODE='22023';END IF;
 RETURN greatest(0,v_effective-greatest(0,v_payments-v_prior))::bigint;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.sale_debt_remaining_v22(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS retail_credit_refund_guard_v21 ON public.retail_sales;

DROP FUNCTION IF EXISTS retail_internal.return_receipt_v22(uuid,uuid,uuid,uuid,jsonb);
CREATE OR REPLACE FUNCTION retail_internal.return_receipt_v22(p_store uuid,p_sale uuid,p_session uuid,p_request uuid,p_lines jsonb,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid:=(SELECT auth.uid());v_result jsonb;v_sale record;v_line record;v_entry jsonb;v_customer uuid;
 v_qty numeric;v_stock numeric;v_base numeric;v_refund bigint:=0;v_cash bigint;v_debt bigint:=0;v_balance bigint;
 v_line_refund bigint;v_line_cost bigint;v_previous_cost bigint;v_return uuid:=gen_random_uuid();v_count int:=0;v_all boolean;
 v_prepared jsonb:='[]'::jsonb;v_payload jsonb:=jsonb_build_object('sale',p_sale,'session',p_session,'lines',p_lines,'note',p_note);
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'sale.return_v22',v_payload);
 IF v_result IS NOT NULL THEN RETURN v_result||jsonb_build_object('idempotent',true);END IF;
 IF length(coalesce(p_note,''))>240 THEN RAISE EXCEPTION 'Return note too long' USING ERRCODE='22023';END IF;
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) AND coalesce((SELECT settings_json->>'permCashierRefund' FROM public.retail_store_settings WHERE store_id=p_store),'allowed')<>'allowed' THEN RAISE EXCEPTION 'Cashier returns disabled by owner' USING ERRCODE='42501';END IF;
 IF p_sale IS NULL OR p_session IS NULL THEN RAISE EXCEPTION 'Receipt and shift required' USING ERRCODE='22023';END IF;
 SELECT * INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND id=p_sale;
 IF v_sale.refunded AND v_sale.return_request_id=p_request AND v_sale.return_actor_id=v_actor AND v_sale.return_session_id=p_session AND p_lines IS NULL THEN
  v_result:=jsonb_build_object('sale_id',p_sale,'receipt_no',v_sale.receipt_no,'refunded_minor',v_sale.total_minor,'idempotent',true,'legacy',true);
  UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;RETURN v_result;
 END IF;
 IF EXISTS(SELECT 1 FROM public.retail_cash_movements WHERE store_id=p_store AND request_id=p_request) THEN RAISE EXCEPTION 'Return request reused for another cash movement' USING ERRCODE='22023';END IF;
 SELECT customer_id INTO v_customer FROM public.retail_sales WHERE store_id=p_store AND id=p_sale;
 -- Same lock order as checkout/payment: shift, customer, sale, sorted stock rows.
 PERFORM 1 FROM public.retail_cash_sessions WHERE store_id=p_store AND id=p_session AND cashier_id=v_actor AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shift not open for user' USING ERRCODE='42501';END IF;
 IF v_customer IS NOT NULL THEN
  SELECT balance_minor INTO v_balance FROM public.retail_customers WHERE store_id=p_store AND id=v_customer FOR UPDATE;
 END IF;
 SELECT * INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND id=p_sale AND status='posted' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found' USING ERRCODE='22023';END IF;
 IF v_sale.refunded THEN
  IF v_sale.return_request_id=p_request AND v_sale.return_actor_id=v_actor AND v_sale.return_session_id=p_session AND p_lines IS NULL THEN
   v_result:=jsonb_build_object('sale_id',p_sale,'receipt_no',v_sale.receipt_no,'refunded_minor',v_sale.total_minor,'idempotent',true);
   UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;RETURN v_result;
  END IF;
  RAISE EXCEPTION 'Receipt already fully refunded' USING ERRCODE='22023';
 END IF;
 IF v_sale.credit_minor>0 AND NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required for credit return' USING ERRCODE='42501';END IF;
 IF p_lines IS NOT NULL THEN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)<1 OR jsonb_array_length(p_lines)>100 THEN RAISE EXCEPTION 'Invalid return lines' USING ERRCODE='22023';END IF;
  IF (SELECT count(DISTINCT value->>'line_id') FROM jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION 'Duplicate return line' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE NOT EXISTS(SELECT 1 FROM public.retail_sale_items i WHERE i.id=(x->>'line_id')::uuid AND i.sale_id=p_sale AND i.store_id=p_store)) THEN RAISE EXCEPTION 'Line does not belong to receipt' USING ERRCODE='22023';END IF;
 END IF;
 FOR v_line IN SELECT * FROM retail_internal.sale_line_values_v22 WHERE store_id=p_store AND sale_id=p_sale ORDER BY product_id,id LOOP
  IF v_line.receipt_gross IS DISTINCT FROM v_sale.total_minor+v_sale.discount_minor THEN RAISE EXCEPTION 'Receipt totals require reconciliation' USING ERRCODE='22023';END IF;
  IF p_lines IS NULL THEN v_qty:=v_line.quantity-v_line.returned_quantity;
  ELSE SELECT (value->>'quantity')::numeric INTO v_qty FROM jsonb_array_elements(p_lines) WHERE (value->>'line_id')::uuid=v_line.id;
  END IF;
  IF v_qty IS NULL THEN CONTINUE;END IF;
  IF p_lines IS NULL AND v_qty=0 THEN CONTINUE;END IF;
  IF v_qty<=0 OR v_qty>v_line.quantity-v_line.returned_quantity OR v_qty<>round(v_qty,3)
   OR (v_line.base_unit_snapshot<>'kg' AND v_qty<>trunc(v_qty)) THEN RAISE EXCEPTION 'Return exceeds remaining sold quantity or has invalid units' USING ERRCODE='22023';END IF;
  IF v_line.base_unit_snapshot='unit' AND v_line.sold_base_units<>v_line.quantity*coalesce(v_line.units_per_package,1) THEN RAISE EXCEPTION 'Legacy unit snapshot requires reconciliation' USING ERRCODE='22023';END IF;
  PERFORM 1 FROM public.retail_products WHERE store_id=p_store AND id=v_line.product_id AND base_unit=v_line.base_unit_snapshot FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product unit changed since sale; reconcile before return' USING ERRCODE='22023';END IF;
  v_base:=round(v_line.sold_base_units*v_qty/v_line.quantity,3);
  IF v_base<=0 THEN RAISE EXCEPTION 'Invalid base return quantity' USING ERRCODE='22023';END IF;
  v_line_refund:=round(v_line.net_minor::numeric*(v_line.returned_quantity+v_qty)/v_line.quantity)::bigint-v_line.returned_minor;
  IF v_line.cost_minor IS NULL THEN v_line_cost:=NULL;
  ELSE
   SELECT coalesce(sum(l.cost_minor),0) INTO v_previous_cost FROM public.retail_sale_return_lines_v22 l WHERE l.store_id=p_store AND l.sale_item_id=v_line.id;
   v_line_cost:=round(v_line.cost_minor::numeric*(v_line.returned_quantity+v_qty)/v_line.quantity)::bigint-v_previous_cost;
  END IF;
  v_refund:=v_refund+v_line_refund;v_count:=v_count+1;
  v_prepared:=v_prepared||jsonb_build_array(jsonb_build_object('line',v_line.id,'product',v_line.product_id,'quantity',v_qty,'base',v_base,'refund',v_line_refund,'cost',v_line_cost));
 END LOOP;
 IF v_count=0 THEN RAISE EXCEPTION 'No remaining items to return' USING ERRCODE='22023';END IF;
 IF v_sale.credit_minor>0 THEN
  v_debt:=least(v_refund,retail_internal.sale_debt_remaining_v22(p_store,v_customer,p_sale));
  IF v_balance IS NULL OR v_balance<v_debt THEN RAISE EXCEPTION 'Customer balance requires reconciliation' USING ERRCODE='22023';END IF;
 END IF;
 v_cash:=v_refund-v_debt;
 IF v_cash>0 THEN PERFORM public.retail_cash_movement(p_store,p_session,p_request,'cash_out',v_cash,'Receipt return #'||v_sale.receipt_no);END IF;
 INSERT INTO public.retail_sale_returns_v22(id,store_id,sale_id,request_id,actor_id,session_id,refund_minor,cash_minor,debt_minor,note)
 VALUES(v_return,p_store,p_sale,p_request,v_actor,p_session,v_refund,v_cash,v_debt,left(coalesce(p_note,''),240));
 FOR v_entry IN SELECT value FROM jsonb_array_elements(v_prepared) LOOP
  INSERT INTO public.retail_stock_balances(store_id,product_id,quantity) VALUES(p_store,(v_entry->>'product')::uuid,(v_entry->>'base')::numeric)
  ON CONFLICT(store_id,product_id) DO UPDATE SET quantity=public.retail_stock_balances.quantity+excluded.quantity,updated_at=now();
  INSERT INTO public.retail_stock_events(store_id,product_id,delta,reason,sale_id,actor_id,request_id)
  VALUES(p_store,(v_entry->>'product')::uuid,(v_entry->>'base')::numeric,'sale_return',p_sale,v_actor,p_request);
  INSERT INTO public.retail_sale_return_lines_v22(store_id,return_id,sale_item_id,product_id,quantity,base_units,refund_minor,cost_minor)
  VALUES(p_store,v_return,(v_entry->>'line')::uuid,(v_entry->>'product')::uuid,(v_entry->>'quantity')::numeric,(v_entry->>'base')::numeric,(v_entry->>'refund')::bigint,(v_entry->>'cost')::bigint);
  UPDATE public.retail_sale_items SET returned_quantity=returned_quantity+(v_entry->>'quantity')::numeric,returned_minor=returned_minor+(v_entry->>'refund')::bigint WHERE id=(v_entry->>'line')::uuid AND store_id=p_store;
 END LOOP;
 IF v_customer IS NOT NULL AND v_refund>0 THEN
  UPDATE public.retail_customers SET balance_minor=balance_minor-v_debt,updated_at=now() WHERE store_id=p_store AND id=v_customer;
  INSERT INTO public.retail_customer_ledger(store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,sale_id,receipt_no,payment_method,note,actor_id,request_id)
  VALUES(p_store,v_customer,'sale_return',v_refund,-v_debt,v_balance-v_debt,p_sale,v_sale.receipt_no::text,'credit_return','Receipt return',v_actor,p_request);
 END IF;
 SELECT bool_and(returned_quantity=quantity) INTO v_all FROM public.retail_sale_items WHERE store_id=p_store AND sale_id=p_sale;
 UPDATE public.retail_sales SET returned_minor_total=returned_minor_total+v_refund,refunded=v_all,
  refunded_at=CASE WHEN v_all THEN clock_timestamp() ELSE NULL END,
  return_request_id=CASE WHEN v_all THEN p_request ELSE return_request_id END,
  return_session_id=CASE WHEN v_all THEN p_session ELSE return_session_id END,
  return_actor_id=CASE WHEN v_all THEN v_actor ELSE return_actor_id END WHERE store_id=p_store AND id=p_sale;
 v_result:=jsonb_build_object('sale_id',p_sale,'receipt_no',v_sale.receipt_no,'return_id',v_return,'refunded_minor',v_refund,'cash_refunded_minor',v_cash,'debt_reduced_minor',v_debt,'fully_refunded',v_all,'request_id',p_request);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,v_actor,'sale.return_v22',p_sale,v_result);
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.return_receipt_v22(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_return_sale_v19(p_store uuid,p_sale uuid,p_session uuid,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RETURN retail_internal.return_receipt_v22(p_store,p_sale,p_session,p_request,NULL,'');END $fn$;
REVOKE ALL ON FUNCTION public.retail_return_sale_v19(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_return_sale_v19(uuid,uuid,uuid,uuid) TO authenticated;
DROP FUNCTION IF EXISTS public.retail_return_item_v22(uuid,uuid,uuid,numeric,uuid,uuid);
CREATE OR REPLACE FUNCTION public.retail_return_item_v22(p_store uuid,p_sale uuid,p_line uuid,p_quantity numeric,p_session uuid,p_request uuid,p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RETURN retail_internal.return_receipt_v22(p_store,p_sale,p_session,p_request,jsonb_build_array(jsonb_build_object('line_id',p_line,'quantity',p_quantity)),p_note);END $fn$;
REVOKE ALL ON FUNCTION public.retail_return_item_v22(uuid,uuid,uuid,numeric,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_return_item_v22(uuid,uuid,uuid,numeric,uuid,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.retail_return_state_v22(p_store uuid,p_sale uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_sale jsonb;v_lines jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager','cashier']) THEN RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('id',id,'receipt_no',receipt_no,'total_minor',total_minor,'discount_minor',discount_minor,'cash_received_minor',cash_received_minor,'change_due_minor',change_due_minor,'created_at',created_at,'refunded',refunded,'returned_minor_total',returned_minor_total)
 INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND id=p_sale AND status='posted';
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'product_id',product_id,'quantity',quantity,'unit_price_minor',unit_price_minor,'product_name_snapshot',product_name_snapshot,'package_type',package_type,'package_barcode',package_barcode,'units_per_package',units_per_package,'base_unit_snapshot',base_unit_snapshot,'net_minor',net_minor,'returned_quantity',returned_quantity,'returned_minor',returned_minor,'remaining_quantity',quantity-returned_quantity) ORDER BY id),'[]')
 INTO v_lines FROM retail_internal.sale_line_values_v22 WHERE store_id=p_store AND sale_id=p_sale;
 RETURN jsonb_build_object('sale',v_sale,'items',v_lines);
END $fn$;
REVOKE ALL ON FUNCTION public.retail_return_state_v22(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_return_state_v22(uuid,uuid) TO authenticated;
CREATE OR REPLACE VIEW retail_internal.report_events_v22 WITH(security_invoker=true) AS
 SELECT l.store_id,l.sale_id,l.id AS sale_item_id,l.product_id,l.product_name_snapshot AS name,l.base_unit_snapshot AS base_unit,
 l.sold_at AS event_at,l.sale_id AS event_id,'sale'::text AS kind,l.net_minor AS revenue_minor,l.sold_base_units AS base_quantity,l.cost_minor,false AS unknown_date
 FROM retail_internal.sale_line_values_v22 l
 UNION ALL
 SELECT r.store_id,r.sale_id,l.id,rl.product_id,l.product_name_snapshot,l.base_unit_snapshot,r.created_at,r.id,'return',-rl.refund_minor,-rl.base_units,-rl.cost_minor,false
 FROM public.retail_sale_returns_v22 r JOIN public.retail_sale_return_lines_v22 rl ON rl.return_id=r.id AND rl.store_id=r.store_id
 JOIN public.retail_sale_items l ON l.id=rl.sale_item_id AND l.store_id=rl.store_id
 UNION ALL
 SELECT l.store_id,l.sale_id,l.id,l.product_id,l.product_name_snapshot,l.base_unit_snapshot,coalesce(s.refunded_at,s.created_at),s.id,'return',-l.net_minor,-l.sold_base_units,-l.cost_minor,s.refunded_at IS NULL
 FROM retail_internal.sale_line_values_v22 l JOIN public.retail_sales s ON s.id=l.sale_id AND s.store_id=l.store_id
 WHERE s.refunded AND NOT EXISTS(SELECT 1 FROM public.retail_sale_returns_v22 r WHERE r.store_id=s.store_id AND r.sale_id=s.id);
REVOKE ALL ON retail_internal.report_events_v22 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_report_v22(
 p_store uuid,p_kind text DEFAULT 'sales',p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,
 p_group text DEFAULT 'products',p_search text DEFAULT '',p_filter text DEFAULT 'all',p_sort text DEFAULT 'default',p_offset integer DEFAULT 0,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_summary jsonb;v_inventory jsonb;v_rows jsonb;v_count bigint;v_meta jsonb;
 v_offset integer:=greatest(0,coalesce(p_offset,0));v_limit integer:=least(100,greatest(1,coalesce(p_limit,50)));
 v_today date:=(current_timestamp AT TIME ZONE 'Asia/Baghdad')::date;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF p_kind NOT IN ('sales','profit','inventory','insights') OR p_group NOT IN ('products','daily','hourly','receipts')
 OR p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>=p_to OR length(coalesce(p_search,''))>120
 THEN RAISE EXCEPTION 'Invalid report request' USING ERRCODE='22023';END IF;
 WITH e AS MATERIALIZED(SELECT * FROM retail_internal.report_events_v22 WHERE store_id=p_store AND (p_from IS NULL OR event_at>=p_from) AND (p_to IS NULL OR event_at<p_to)),
 sold AS(SELECT coalesce(sum(total_minor),0) AS net,coalesce(sum(discount_minor),0) AS discount,count(*) AS count,coalesce(sum(credit_minor),0) AS credit
 FROM public.retail_sales WHERE store_id=p_store AND status='posted' AND (p_from IS NULL OR created_at>=p_from) AND (p_to IS NULL OR created_at<p_to)),
 returned AS(SELECT coalesce(sum(revenue_minor) FILTER(WHERE kind='return'),0) AS net,count(DISTINCT event_id) FILTER(WHERE kind='return') AS count,
 (SELECT count(*) FROM public.retail_sales old WHERE old.store_id=p_store AND old.refunded AND old.refunded_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.retail_sale_returns_v22 r WHERE r.store_id=p_store AND r.sale_id=old.id)) AS unknown_dates,coalesce(sum(cost_minor),0) AS cost,count(*) FILTER(WHERE cost_minor IS NULL) AS missing_cost FROM e),
 finance AS(SELECT coalesce(sum(amount_minor) FILTER(WHERE entry_kind='revenue'),0) AS revenue,coalesce(sum(amount_minor) FILTER(WHERE entry_kind='expense'),0) AS expense
 FROM public.retail_finance_entries WHERE store_id=p_store AND (p_from IS NULL OR created_at>=p_from) AND (p_to IS NULL OR created_at<p_to)),
 returned_credit AS(SELECT coalesce(sum(debt_minor),0) AS debt FROM public.retail_sale_returns_v22 WHERE store_id=p_store AND (p_from IS NULL OR created_at>=p_from) AND (p_to IS NULL OR created_at<p_to))
 SELECT jsonb_build_object('sales_minor',s.net,'discount_minor',s.discount,'sale_count',s.count,'refund_minor',-r.net,'refund_count',r.count,
 'net_minor',s.net+r.net,'cash_sales_minor',s.net-s.credit+r.net+rc.debt,'credit_sales_minor',s.credit-rc.debt,
 'cost_minor',CASE WHEN r.missing_cost=0 THEN r.cost ELSE NULL END,'unknown_cost_lines',r.missing_cost,'unknown_refund_dates',r.unknown_dates,
 'other_revenue_minor',f.revenue,'expense_minor',f.expense,
 'gross_profit_minor',CASE WHEN r.missing_cost=0 THEN s.net+r.net-r.cost ELSE NULL END,
 'net_profit_minor',CASE WHEN r.missing_cost=0 THEN s.net+r.net-r.cost+f.revenue-f.expense ELSE NULL END)
 INTO v_summary FROM sold s CROSS JOIN returned r CROSS JOIN finance f CROSS JOIN returned_credit rc;

 WITH stock AS(
 SELECT p.id,coalesce(b.quantity,0) AS qty,p.base_unit,
 coalesce(pc.unit_cost_minor,p.purchase_price_minor,c.purchase_price_minor::numeric/nullif(c.units_per_carton,0)) AS cost,
 coalesce(nullif(p.price_minor,0),c.sale_price_minor::numeric/nullif(c.units_per_carton,0),0) AS price,
 coalesce(p.min_stock_level,5) AS threshold,
 EXISTS(SELECT 1 FROM public.retail_stock_expiries x WHERE x.store_id=p_store AND x.product_id=p.id AND x.status='active' AND x.quantity>0 AND x.expiry_date<=v_today+30) AS expiry
 FROM public.retail_products p LEFT JOIN public.retail_stock_balances b ON b.store_id=p.store_id AND b.product_id=p.id
 LEFT JOIN public.retail_product_costs pc ON pc.store_id=p.store_id AND pc.product_id=p.id
 LEFT JOIN public.retail_product_cartons c ON c.store_id=p.store_id AND c.product_id=p.id WHERE p.store_id=p_store AND (p.active OR coalesce(b.quantity,0)<>0)
 ) SELECT jsonb_build_object('product_count',count(*),'low_count',count(*) FILTER(WHERE qty<=threshold),'out_count',count(*) FILTER(WHERE qty<=0),
 'expiry_count',count(*) FILTER(WHERE expiry),'unknown_cost_products',count(*) FILTER(WHERE cost IS NULL AND qty>0),
 'value_minor',CASE WHEN count(*) FILTER(WHERE cost IS NULL AND qty>0)=0 THEN coalesce(sum(round(qty*cost)),0) ELSE NULL END,
 'sale_value_minor',coalesce(sum(round(qty*price)),0),
 'overdue_customer_debt_minor',(SELECT coalesce(sum(balance_minor),0) FROM public.retail_customers WHERE store_id=p_store AND active AND due_date<v_today)) INTO v_inventory FROM stock;

 IF (p_from IS NOT NULL OR p_to IS NOT NULL) AND (v_summary->>'unknown_refund_dates')::bigint>0 THEN
 v_summary:=v_summary||jsonb_build_object('net_minor',NULL,'refund_minor',NULL,'cash_sales_minor',NULL,'credit_sales_minor',NULL,'cost_minor',NULL,'gross_profit_minor',NULL,'net_profit_minor',NULL);
 END IF;
 IF p_kind IN ('profit','inventory','insights') OR p_group='products' THEN
 WITH e AS MATERIALIZED(SELECT * FROM retail_internal.report_events_v22 WHERE store_id=p_store AND (p_from IS NULL OR event_at>=p_from) AND (p_to IS NULL OR event_at<p_to)),
 movement AS(SELECT product_id,sum(base_quantity) AS qty,sum(revenue_minor) AS revenue,
 CASE WHEN count(*) FILTER(WHERE cost_minor IS NULL)=0 THEN sum(cost_minor) ELSE NULL END AS cost,count(DISTINCT sale_id) FILTER(WHERE kind='sale') AS receipt_count FROM e GROUP BY product_id),
 base AS(
 SELECT p.id,p.name,p.base_unit,p.active,p.price_minor AS current_price_minor,coalesce(b.quantity,0) AS stock_quantity,coalesce(p.min_stock_level,5) AS min_stock,
 coalesce(m.qty,0) AS net_quantity,coalesce(m.revenue,0) AS net_revenue_minor,CASE WHEN m.product_id IS NULL THEN 0 ELSE m.cost END AS cost_minor,coalesce(m.receipt_count,0) AS receipt_count,
 coalesce(pc.unit_cost_minor,p.purchase_price_minor,c.purchase_price_minor::numeric/nullif(c.units_per_carton,0)) AS current_unit_cost,
 EXISTS(SELECT 1 FROM public.retail_stock_expiries x WHERE x.store_id=p_store AND x.product_id=p.id AND x.status='active' AND x.quantity>0 AND x.expiry_date<=v_today+30) AS expiry_risk
 FROM public.retail_products p LEFT JOIN movement m ON m.product_id=p.id
 LEFT JOIN public.retail_stock_balances b ON b.store_id=p.store_id AND b.product_id=p.id
 LEFT JOIN public.retail_product_costs pc ON pc.store_id=p.store_id AND pc.product_id=p.id
 LEFT JOIN public.retail_product_cartons c ON c.store_id=p.store_id AND c.product_id=p.id
 WHERE p.store_id=p_store AND (p.active OR m.product_id IS NOT NULL OR coalesce(b.quantity,0)<>0) AND (p_kind NOT IN ('inventory','insights') OR p.active OR coalesce(b.quantity,0)<>0)),
 valued AS(SELECT base.*,net_revenue_minor-cost_minor AS profit_minor,round(stock_quantity*current_unit_cost)::bigint AS inventory_value_minor,
 CASE WHEN net_revenue_minor>0 AND cost_minor IS NOT NULL THEN round(100*(net_revenue_minor-cost_minor)/net_revenue_minor) ELSE NULL END AS margin_pct,
 sum(greatest(net_revenue_minor,0)) OVER() AS total_positive_revenue,
 coalesce(sum(greatest(net_revenue_minor,0)) OVER(ORDER BY greatest(net_revenue_minor,0) DESC,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior_revenue FROM base),
 ranked AS(SELECT valued.*,CASE WHEN total_positive_revenue=0 OR net_revenue_minor<=0 THEN 'C' WHEN prior_revenue<total_positive_revenue*0.8 THEN 'A' WHEN prior_revenue<total_positive_revenue*0.95 THEN 'B' ELSE 'C' END AS abc FROM valued),
 filtered AS(SELECT * FROM ranked x WHERE
 (p_kind NOT IN ('inventory','insights') OR active OR stock_quantity<>0) AND
 (coalesce(p_search,'')='' OR lower(name) LIKE '%'||lower(p_search)||'%' OR EXISTS(SELECT 1 FROM public.retail_barcodes bc WHERE bc.store_id=p_store AND bc.product_id=x.id AND lower(bc.code) LIKE '%'||lower(p_search)||'%')) AND
 CASE p_filter WHEN 'sold' THEN net_quantity<>0 WHEN 'high_margin' THEN margin_pct>=20 WHEN 'low_margin' THEN margin_pct<10
 WHEN 'high_value' THEN inventory_value_minor>=(SELECT avg(inventory_value_minor) FROM ranked WHERE active) WHEN 'fast_moving' THEN net_quantity>0 WHEN 'dead_stock' THEN net_quantity<=0 AND stock_quantity>0
 WHEN 'low_out' THEN stock_quantity<=min_stock WHEN 'reorder' THEN stock_quantity<=min_stock WHEN 'expiry_risk' THEN expiry_risk
 WHEN 'abc_a' THEN abc='A' WHEN 'abc_b' THEN abc='B' WHEN 'abc_c' THEN abc='C' WHEN 'margin_alert' THEN margin_pct<10 ELSE true END),
 page AS(SELECT * FROM filtered ORDER BY
 CASE WHEN p_sort='name_asc' THEN name END ASC,
 CASE WHEN p_sort='qty_asc' THEN stock_quantity END ASC,
 CASE WHEN p_sort='value_desc' OR p_kind='inventory' AND p_sort='default' THEN inventory_value_minor END DESC NULLS LAST,
 CASE WHEN p_sort='sold_desc' THEN net_quantity END DESC,
 CASE WHEN p_kind='profit' AND p_sort='default' THEN profit_minor ELSE net_revenue_minor END DESC NULLS LAST,id OFFSET v_offset LIMIT v_limit)
 SELECT (SELECT count(*) FROM filtered),(SELECT coalesce(jsonb_agg(to_jsonb(page)),'[]') FROM page),
 (SELECT jsonb_build_object('class_a',count(*) FILTER(WHERE abc='A'),'class_b',count(*) FILTER(WHERE abc='B'),'class_c',count(*) FILTER(WHERE abc='C')) FROM ranked)
 INTO v_count,v_rows,v_meta;
 ELSE
 WITH e AS(SELECT * FROM retail_internal.report_events_v22 WHERE store_id=p_store AND (p_from IS NULL OR event_at>=p_from) AND (p_to IS NULL OR event_at<p_to)),
 groups AS(SELECT CASE p_group WHEN 'daily' THEN to_char(event_at AT TIME ZONE 'Asia/Baghdad','YYYY-MM-DD') WHEN 'hourly' THEN to_char(event_at AT TIME ZONE 'Asia/Baghdad','HH24:00') ELSE sale_id::text END AS label,
 count(DISTINCT sale_id) FILTER(WHERE kind='sale') AS sale_count,count(DISTINCT event_id) FILTER(WHERE kind='return') AS refund_count,
 coalesce(sum(revenue_minor) FILTER(WHERE kind='sale'),0) AS sales_minor,-coalesce(sum(revenue_minor) FILTER(WHERE kind='return'),0) AS refund_minor,sum(revenue_minor) AS net_minor FROM e GROUP BY 1),
 filtered AS(SELECT g.*,s.receipt_no FROM groups g LEFT JOIN public.retail_sales s ON p_group='receipts' AND s.store_id=p_store AND s.id::text=g.label WHERE coalesce(p_search,'')='' OR g.label ILIKE '%'||p_search||'%' OR s.receipt_no::text LIKE '%'||p_search||'%'),
 page AS(SELECT * FROM filtered ORDER BY label DESC OFFSET v_offset LIMIT v_limit)
 SELECT (SELECT count(*) FROM filtered),(SELECT coalesce(jsonb_agg(to_jsonb(page)),'[]') FROM page) INTO v_count,v_rows;
 END IF;
 IF EXISTS(SELECT 1 FROM (SELECT value FROM jsonb_each(v_summary) UNION ALL SELECT value FROM jsonb_each(v_inventory) UNION ALL SELECT v.value FROM jsonb_array_elements(v_rows) row CROSS JOIN LATERAL jsonb_each(row) v) n
 WHERE CASE WHEN jsonb_typeof(value)='number' THEN abs((value#>>'{}')::numeric)>9007199254740991 ELSE false END) THEN RAISE EXCEPTION 'Report amount exceeds supported exact numeric range' USING ERRCODE='22003';END IF;
 RETURN jsonb_build_object('summary',v_summary,'inventory',v_inventory,'abc',coalesce(v_meta,'{}'),'items',v_rows,'total_count',v_count,'offset',v_offset,'limit',v_limit,'generated_at',transaction_timestamp(),'timezone','Asia/Baghdad');
END $fn$;
REVOKE ALL ON FUNCTION public.retail_report_v22(uuid,text,timestamptz,timestamptz,text,text,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_report_v22(uuid,text,timestamptz,timestamptz,text,text,text,text,integer,integer) TO authenticated;

CREATE INDEX IF NOT EXISTS retail_sale_items_barcode_lookup_v22 ON public.retail_sale_items(store_id,package_barcode,sale_id);
CREATE OR REPLACE FUNCTION public.retail_find_return_receipt_v22(p_store uuid,p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_query text:=ltrim(btrim(coalesce(p_query,'')),'#');v_sale public.retail_sales%ROWTYPE;v_ids uuid[];
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager','cashier']) THEN RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';END IF;
 IF v_query='' OR length(v_query)>60 THEN RAISE EXCEPTION 'Invalid receipt lookup' USING ERRCODE='22023';END IF;
 IF v_query ~ '^[0-9]{1,15}$' THEN
  SELECT * INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND status='posted' AND receipt_no=v_query::bigint;
 ELSIF v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  SELECT * INTO v_sale FROM public.retail_sales WHERE store_id=p_store AND status='posted' AND id=v_query::uuid;
 END IF;
 IF v_sale.id IS NOT NULL THEN RETURN jsonb_build_object('found',true,'sale_id',v_sale.id,'receipt_no',v_sale.receipt_no);END IF;
 SELECT array_agg(sale_id) INTO v_ids FROM (SELECT DISTINCT i.sale_id FROM public.retail_sale_items i JOIN public.retail_sales s ON s.id=i.sale_id AND s.store_id=i.store_id WHERE i.store_id=p_store AND i.package_barcode=v_query AND s.status='posted' LIMIT 2) matches;
 IF coalesce(array_length(v_ids,1),0)=1 THEN RETURN jsonb_build_object('found',true,'sale_id',v_ids[1]);END IF;
 RETURN jsonb_build_object('found',false,'ambiguous',coalesce(array_length(v_ids,1),0)>1);
END $fn$;
REVOKE ALL ON FUNCTION public.retail_find_return_receipt_v22(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_find_return_receipt_v22(uuid,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
