-- Apply after the corrected db/v19_complete_production_upgrade.sql, in a reviewed maintenance window.
-- Never automatically applied to a hosted database by the web app.
BEGIN;
CREATE TABLE IF NOT EXISTS retail_internal.financial_requests(
 store_id uuid NOT NULL REFERENCES public.retail_stores(id), request_id uuid NOT NULL,
 actor_id uuid NOT NULL, action text NOT NULL, payload jsonb NOT NULL, result jsonb,
 PRIMARY KEY(store_id,request_id)
);
REVOKE ALL ON retail_internal.financial_requests FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION retail_internal.claim_financial_request(
 p_store uuid,p_request uuid,p_action text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v record;v_actor uuid:=(SELECT auth.uid());
BEGIN
 IF v_actor IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager','cashier'])
 THEN RAISE EXCEPTION 'Store access denied' USING ERRCODE='42501';END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023';END IF;
 INSERT INTO retail_internal.financial_requests(store_id,request_id,actor_id,action,payload)
 VALUES(p_store,p_request,v_actor,p_action,p_payload) ON CONFLICT DO NOTHING;
 SELECT * INTO v FROM retail_internal.financial_requests WHERE store_id=p_store AND request_id=p_request FOR UPDATE;
 IF v.actor_id IS DISTINCT FROM v_actor OR v.action IS DISTINCT FROM p_action OR v.payload IS DISTINCT FROM p_payload
 THEN RAISE EXCEPTION 'Request reused with different actor or payload' USING ERRCODE='22023';END IF;
 RETURN v.result;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.claim_financial_request(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;

-- Customer balances cannot be edited through the Data API.
DO $customers$
DECLARE p record;
BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='retail_customers' LOOP
  EXECUTE format('DROP POLICY %I ON public.retail_customers',p.policyname);
 END LOOP;
END $customers$;
CREATE POLICY customer_read ON public.retail_customers FOR SELECT TO authenticated USING(retail_internal.has_role(store_id,ARRAY['manager','cashier']));
CREATE POLICY customer_insert ON public.retail_customers FOR INSERT TO authenticated WITH CHECK(retail_internal.has_role(store_id,ARRAY['manager']));
CREATE POLICY customer_update ON public.retail_customers FOR UPDATE TO authenticated USING(retail_internal.has_role(store_id,ARRAY['manager'])) WITH CHECK(retail_internal.has_role(store_id,ARRAY['manager']));
REVOKE INSERT,UPDATE,DELETE ON public.retail_customers FROM authenticated;
GRANT INSERT(id,store_id,name,phone,address,credit_limit_minor,note,active,created_at,updated_at) ON public.retail_customers TO authenticated;
GRANT UPDATE(name,phone,address,credit_limit_minor,note,active,updated_at) ON public.retail_customers TO authenticated;
-- Existing authenticated financial ledgers must be append-only through reviewed RPCs.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.retail_customer_ledger,public.retail_supplier_ledger FROM PUBLIC,anon,authenticated;
-- Remove broad member-write policies on finance, costs, settings and staff.
DO $secure$
DECLARE t text;p record;
BEGIN
 FOR t IN SELECT unnest(ARRAY['retail_finance_entries','retail_product_costs','retail_staff_profiles','retail_store_settings','retail_suppliers','retail_purchase_orders']) LOOP
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  EXECUTE format('CREATE POLICY manager_access ON public.%I FOR ALL TO authenticated USING (retail_internal.has_role(store_id,ARRAY[''manager''])) WITH CHECK (retail_internal.has_role(store_id,ARRAY[''manager'']))',t);
 END LOOP;
 -- TRUNCATE is not protected by RLS. Revoke on every current Retail OS public table.
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND left(tablename,7)='retail_' LOOP
  EXECUTE format('REVOKE TRUNCATE ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $secure$;
-- Settings are readable by active POS members, but owner-only controls stay owner-only.
DROP POLICY IF EXISTS manager_access ON public.retail_store_settings;
CREATE POLICY settings_read_v21 ON public.retail_store_settings FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,ARRAY['manager','cashier']));
CREATE POLICY settings_owner_v21 ON public.retail_store_settings FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.retail_stores s WHERE s.id=retail_store_settings.store_id AND s.owner_user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.retail_stores s WHERE s.id=retail_store_settings.store_id AND s.owner_user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS manager_access ON public.retail_staff_profiles;
CREATE POLICY staff_owner_v21 ON public.retail_staff_profiles FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.retail_stores s WHERE s.id=retail_staff_profiles.store_id AND s.owner_user_id=(SELECT auth.uid())))
 WITH CHECK(EXISTS(SELECT 1 FROM public.retail_stores s WHERE s.id=retail_staff_profiles.store_id AND s.owner_user_id=(SELECT auth.uid())));
-- Keep PINs out of clear-text persistence. Current login continues to use Supabase Auth.
REVOKE SELECT,INSERT,UPDATE ON public.retail_staff_profiles FROM authenticated;
GRANT SELECT(store_id,user_id,full_name,job_title,phone,email,role,active,note,actor_id,updated_at) ON public.retail_staff_profiles TO authenticated;
GRANT INSERT(store_id,user_id,full_name,job_title,phone,email,role,active,note,actor_id,updated_at) ON public.retail_staff_profiles TO authenticated;
GRANT UPDATE(full_name,job_title,phone,email,role,active,note,actor_id,updated_at) ON public.retail_staff_profiles TO authenticated;
-- Costs remain owner/manager-only and product writes use owner-only atomic catalog RPCs.
REVOKE INSERT,UPDATE,DELETE ON public.retail_products,public.retail_barcodes,public.retail_product_cartons FROM authenticated;
REVOKE SELECT ON public.retail_products FROM authenticated;
GRANT SELECT(id,store_id,name,price_minor,currency,active,created_at,sku,plu,catalog_version,unit_primary_barcode,base_unit,min_stock_level) ON public.retail_products TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_record_customer_ledger_v19(
 p_store uuid,p_customer uuid,p_entry_type text,p_amount bigint,p_note text DEFAULT NULL,
 p_receipt_no text DEFAULT NULL,p_due_date date DEFAULT NULL,p_sale_id uuid DEFAULT NULL,
 p_payment_method text DEFAULT NULL,p_request uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_balance bigint;v_limit bigint;v_delta bigint;v_id uuid;v_session uuid;
 v_payload jsonb:=jsonb_build_object('customer',p_customer,'type',p_entry_type,'amount',p_amount,'note',p_note,
 'receipt',p_receipt_no,'due',p_due_date,'sale',p_sale_id,'method',p_payment_method);
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'customer.ledger',v_payload);
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>9999999999999 OR p_entry_type IS NULL
 OR p_entry_type NOT IN ('opening_balance','debt_add','adjustment','payment_received')
 THEN RAISE EXCEPTION 'Invalid customer ledger entry; sale links require atomic checkout' USING ERRCODE='22023';END IF;
 IF p_entry_type<>'payment_received' OR coalesce(p_payment_method,'ledger_only')<>'cash_drawer' THEN
  IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 END IF;
 IF p_sale_id IS NOT NULL THEN RAISE EXCEPTION 'Sale links require atomic checkout' USING ERRCODE='22023';END IF;
 IF p_entry_type='payment_received' AND p_payment_method='cash_drawer' THEN
  SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING ERRCODE='22023';END IF;
 END IF;
 SELECT balance_minor,credit_limit_minor INTO v_balance,v_limit FROM public.retail_customers WHERE store_id=p_store AND id=p_customer AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='22023';END IF;
 v_delta:=CASE WHEN p_entry_type='payment_received' THEN -p_amount ELSE p_amount END;
 IF v_balance+v_delta<0 THEN RAISE EXCEPTION 'Payment exceeds outstanding debt' USING ERRCODE='22023';END IF;
 IF v_delta>0 AND v_limit>0 AND v_balance+v_delta>v_limit THEN RAISE EXCEPTION 'Credit limit exceeded' USING ERRCODE='22023';END IF;
 IF v_session IS NOT NULL THEN
  PERFORM public.retail_cash_movement(p_store,v_session,p_request,'cash_in',p_amount,left(coalesce(p_note,'Customer payment'),160));
 END IF;
 UPDATE public.retail_customers SET balance_minor=v_balance+v_delta,due_date=coalesce(p_due_date,due_date),updated_at=now() WHERE store_id=p_store AND id=p_customer;
 INSERT INTO public.retail_customer_ledger(store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,receipt_no,due_date,payment_method,note,actor_id,request_id)
 VALUES(p_store,p_customer,p_entry_type,p_amount,v_delta,v_balance+v_delta,p_receipt_no,p_due_date,p_payment_method,p_note,auth.uid(),p_request) RETURNING id INTO v_id;
 v_result:=jsonb_build_object('entry_id',v_id,'balance_after_minor',v_balance+v_delta);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'customer.ledger_v21',p_customer,v_result||jsonb_build_object('request_id',p_request,'amount_minor',p_amount));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_record_customer_ledger_v19(uuid,uuid,text,bigint,text,text,date,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_record_customer_ledger_v19(uuid,uuid,text,bigint,text,text,date,uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_checkout_customer_v21(
 p_store uuid,p_request uuid,p_items jsonb,p_cash_received bigint,p_discount bigint,p_customer uuid,p_paid bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_sale uuid;v_total bigint;v_debt bigint;v_balance bigint;v_limit bigint;v_session uuid;
 v_payload jsonb:=jsonb_build_object('items',p_items,'cash',p_cash_received,'discount',p_discount,'customer',p_customer,'paid',p_paid);
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'checkout.customer',v_payload);
 IF v_result IS NOT NULL THEN RETURN (v_result->>'sale_id')::uuid;END IF;
 IF EXISTS(SELECT 1 FROM public.retail_sales WHERE store_id=p_store AND request_id=p_request) THEN RAISE EXCEPTION 'Existing sale request cannot be repurposed as customer checkout' USING ERRCODE='22023';END IF;
 IF p_customer IS NULL OR p_paid IS NULL OR p_paid<0 OR p_paid>9999999999999 THEN RAISE EXCEPTION 'Invalid customer checkout' USING ERRCODE='22023';END IF;
 SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
 IF v_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING ERRCODE='22023';END IF;
 SELECT balance_minor,credit_limit_minor INTO v_balance,v_limit FROM public.retail_customers WHERE store_id=p_store AND id=p_customer AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='22023';END IF;
 -- Base checkout validates prices, quantities and stock inside this same transaction.
 v_sale:=public.retail_checkout_packs_v16(p_store,p_request,p_items,p_cash_received,p_discount);
 SELECT total_minor INTO v_total FROM public.retail_sales WHERE store_id=p_store AND id=v_sale;
 IF p_cash_received IS DISTINCT FROM greatest(p_paid,v_total) THEN RAISE EXCEPTION 'Invalid payment split' USING ERRCODE='22023';END IF;
 v_debt:=greatest(0,v_total-p_paid);
 IF v_debt>0 THEN
  IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager required for credit sale' USING ERRCODE='42501';END IF;
  IF v_limit<=0 OR v_balance+v_debt>v_limit THEN RAISE EXCEPTION 'Credit limit exceeded' USING ERRCODE='22023';END IF;
  PERFORM public.retail_cash_movement(p_store,v_session,p_request,'cash_out',v_debt,'Credit sale offset');
  UPDATE public.retail_customers SET balance_minor=v_balance+v_debt,updated_at=now() WHERE store_id=p_store AND id=p_customer;
 END IF;
 INSERT INTO public.retail_customer_ledger(store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,sale_id,receipt_no,payment_method,actor_id,request_id)
 SELECT p_store,p_customer,CASE WHEN v_debt>0 THEN 'debt_sale' ELSE 'paid_purchase' END,
 CASE WHEN v_debt>0 THEN v_debt ELSE v_total END,v_debt,v_balance+v_debt,v_sale,receipt_no::text,
 CASE WHEN v_debt>0 THEN 'credit' ELSE 'cash_drawer' END,auth.uid(),p_request
 FROM public.retail_sales WHERE store_id=p_store AND id=v_sale AND v_total>0;
 UPDATE public.retail_sales SET customer_id=p_customer,credit_minor=v_debt,paid_minor=least(p_paid,v_total) WHERE store_id=p_store AND id=v_sale;
 v_result:=jsonb_build_object('sale_id',v_sale);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 RETURN v_sale;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_checkout_customer_v21(uuid,uuid,jsonb,bigint,bigint,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_checkout_customer_v21(uuid,uuid,jsonb,bigint,bigint,uuid,bigint) TO authenticated;
ALTER TABLE public.retail_sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.retail_customers(id), ADD COLUMN IF NOT EXISTS credit_minor bigint NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS paid_minor bigint;
-- Full returns of credit receipts need debt allocation; fail closed until that flow is delivered.
CREATE OR REPLACE FUNCTION retail_internal.guard_credit_refund_v21() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
 IF NEW.refunded AND NOT OLD.refunded AND OLD.credit_minor>0 THEN RAISE EXCEPTION 'Credit receipt return requires debt reconciliation' USING ERRCODE='22023';END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS retail_credit_refund_guard_v21 ON public.retail_sales;
CREATE TRIGGER retail_credit_refund_guard_v21 BEFORE UPDATE OF refunded ON public.retail_sales FOR EACH ROW EXECUTE FUNCTION retail_internal.guard_credit_refund_v21();
REVOKE ALL ON FUNCTION retail_internal.guard_credit_refund_v21() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.retail_record_supplier_ledger_v19(uuid,uuid,text,bigint,text,text,uuid,numeric,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_record_supplier_ledger_v21(
 p_store uuid,p_supplier uuid,p_entry_type text,p_amount bigint,p_note text,
 p_invoice_no text,p_product_id uuid,p_product_name text,p_quantity numeric,p_unit_cost bigint,
 p_payment_method text,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_balance bigint;v_delta bigint;v_id uuid;v_session uuid;
 v_payload jsonb:=jsonb_build_object('supplier',p_supplier,'type',p_entry_type,'amount',p_amount,'note',p_note,
 'invoice',p_invoice_no,'product',p_product_id,'name',p_product_name,'quantity',p_quantity,'cost',p_unit_cost,'method',p_payment_method);
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'supplier.ledger',v_payload);
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>9999999999999 OR p_entry_type IS NULL
 OR p_entry_type NOT IN ('opening_balance','payment_sent','adjustment')
 THEN RAISE EXCEPTION 'Purchases and supplier returns require atomic stock reconciliation' USING ERRCODE='22023';END IF;
 IF p_entry_type='payment_sent' AND p_payment_method='cash_drawer' THEN
  SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING ERRCODE='22023';END IF;
 END IF;
 SELECT balance_minor INTO v_balance FROM public.retail_suppliers WHERE store_id=p_store AND id=p_supplier AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='22023';END IF;
 v_delta:=CASE WHEN p_entry_type='payment_sent' THEN -p_amount ELSE p_amount END;
 IF v_balance+v_delta<0 THEN RAISE EXCEPTION 'Payment exceeds supplier debt' USING ERRCODE='22023';END IF;
 IF v_session IS NOT NULL THEN
  PERFORM public.retail_cash_movement(p_store,v_session,p_request,'cash_out',p_amount,left(coalesce(p_note,'Supplier payment'),160));
 END IF;
 UPDATE public.retail_suppliers SET balance_minor=v_balance+v_delta,updated_at=now() WHERE store_id=p_store AND id=p_supplier;
 INSERT INTO public.retail_supplier_ledger(store_id,supplier_id,entry_type,amount_minor,delta_minor,balance_after_minor,invoice_no,payment_method,note,actor_id,request_id)
 VALUES(p_store,p_supplier,p_entry_type,p_amount,v_delta,v_balance+v_delta,p_invoice_no,p_payment_method,p_note,auth.uid(),p_request) RETURNING id INTO v_id;
 v_result:=jsonb_build_object('entry_id',v_id,'balance_after_minor',v_balance+v_delta);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'supplier.ledger_v21',p_supplier,v_result||jsonb_build_object('request_id',p_request,'amount_minor',p_amount));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_record_supplier_ledger_v21(uuid,uuid,text,bigint,text,text,uuid,text,numeric,bigint,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_record_supplier_ledger_v21(uuid,uuid,text,bigint,text,text,uuid,text,numeric,bigint,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.retail_receive_purchase_v21(p_store uuid,p_request uuid,p_purchase jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_product record;v_supplier record;v_po record;v_session uuid;
 v_product_id uuid:=(p_purchase->>'product_id')::uuid;v_supplier_id uuid:=nullif(p_purchase->>'supplier_id','')::uuid;
 v_po_id uuid:=nullif(p_purchase->>'po_id','')::uuid;v_qty numeric:=(p_purchase->>'quantity')::numeric;
 v_cost bigint:=(p_purchase->>'unit_cost')::bigint;v_total bigint;v_invoice text:=p_purchase->>'invoice_no';
 v_method text:=p_purchase->>'payment_method';v_note text:=p_purchase->>'note';v_stock numeric;v_entry uuid;
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'purchase.receive',p_purchase);
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF v_qty IS NULL OR v_qty<=0 OR v_qty>1000000 OR v_qty<>round(v_qty,3) OR v_cost IS NULL OR v_cost<=0
 OR v_method IS NULL OR v_method NOT IN ('credit','cash_drawer','cash_external')
 OR nullif(btrim(v_invoice),'') IS NULL THEN RAISE EXCEPTION 'Invalid purchase receipt' USING ERRCODE='22023';END IF;
 v_total:=round(v_qty*v_cost);
 IF v_total>9999999999999 THEN RAISE EXCEPTION 'Purchase total too large' USING ERRCODE='22023';END IF;
 IF v_method='cash_drawer' THEN
  SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
  IF v_session IS NULL THEN RAISE EXCEPTION 'No open cash shift' USING ERRCODE='22023';END IF;
 END IF;
 IF v_supplier_id IS NOT NULL THEN
  SELECT * INTO v_supplier FROM public.retail_suppliers WHERE store_id=p_store AND id=v_supplier_id AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='22023';END IF;
 ELSIF v_method='credit' THEN RAISE EXCEPTION 'Supplier required for credit purchase' USING ERRCODE='22023';END IF;
 IF v_po_id IS NOT NULL THEN
  SELECT * INTO v_po FROM public.retail_purchase_orders WHERE store_id=p_store AND id=v_po_id FOR UPDATE;
  IF NOT FOUND OR v_po.status NOT IN ('pending','ordered') OR v_po.product_id IS DISTINCT FROM v_product_id
  OR v_po.supplier_id IS DISTINCT FROM v_supplier_id OR v_po.quantity IS DISTINCT FROM v_qty
  THEN RAISE EXCEPTION 'Purchase order changed or already received' USING ERRCODE='22023';END IF;
 END IF;
 SELECT * INTO v_product FROM public.retail_products WHERE store_id=p_store AND id=v_product_id AND active FOR SHARE;
 IF NOT FOUND OR (v_product.base_unit='unit' AND v_qty<>trunc(v_qty)) THEN RAISE EXCEPTION 'Invalid purchase product or quantity' USING ERRCODE='22023';END IF;
 v_result:=public.retail_adjust_stock_v19(p_store,v_product_id,'delta_in',v_qty,'purchase',v_invoice,p_request);
 SELECT quantity INTO v_stock FROM public.retail_stock_balances WHERE store_id=p_store AND product_id=v_product_id;
 IF v_session IS NOT NULL AND v_total>0 THEN
  PERFORM public.retail_cash_movement(p_store,v_session,p_request,'cash_out',v_total,left(v_invoice,160));
 ELSIF v_method='cash_external' AND v_total>0 THEN
  INSERT INTO public.retail_finance_entries(store_id,entry_kind,category,amount_minor,wallet,payee,reference_no,note,actor_id,request_id)
  VALUES(p_store,'safe_withdraw','purchase',v_total,'safe',v_supplier.name,v_invoice,v_note,auth.uid(),p_request);
 END IF;
 IF v_supplier_id IS NOT NULL AND v_method='credit' THEN
  UPDATE public.retail_suppliers SET balance_minor=balance_minor+v_total,updated_at=now() WHERE store_id=p_store AND id=v_supplier_id;
 END IF;
 INSERT INTO public.retail_supplier_ledger(store_id,supplier_id,supplier_name,entry_type,amount_minor,delta_minor,balance_after_minor,invoice_no,product_id,product_name,quantity,unit_cost_minor,payment_method,note,actor_id,request_id)
 VALUES(p_store,v_supplier_id,coalesce(v_supplier.name,'دابینکەری گشتی'),CASE WHEN v_method='credit' THEN 'purchase_credit' ELSE 'purchase_cash' END,v_total,CASE WHEN v_method='credit' THEN v_total ELSE 0 END,
 coalesce(v_supplier.balance_minor,0)+CASE WHEN v_method='credit' THEN v_total ELSE 0 END,v_invoice,v_product_id,v_product.name,v_qty,v_cost,v_method,v_note,auth.uid(),p_request) RETURNING id INTO v_entry;
 INSERT INTO public.retail_product_costs(store_id,product_id,unit_cost_minor,actor_id) VALUES(p_store,v_product_id,v_cost,auth.uid())
 ON CONFLICT(store_id,product_id) DO UPDATE SET unit_cost_minor=excluded.unit_cost_minor,updated_at=now(),actor_id=excluded.actor_id;
 IF nullif(p_purchase->>'expiry_date','') IS NOT NULL THEN
  INSERT INTO public.retail_stock_expiries(store_id,product_id,batch_no,quantity,expiry_date,note,actor_id)
  VALUES(p_store,v_product_id,v_invoice,v_qty,(p_purchase->>'expiry_date')::date,v_note,auth.uid());
 END IF;
 IF v_po_id IS NOT NULL THEN UPDATE public.retail_purchase_orders SET status='received',updated_at=now() WHERE store_id=p_store AND id=v_po_id;END IF;
 v_result:=jsonb_build_object('entry_id',v_entry,'quantity',v_stock,'total_minor',v_total);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'purchase.receive_v21',v_product_id,v_result||jsonb_build_object('request_id',p_request));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_receive_purchase_v21(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_receive_purchase_v21(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_save_party_v21(p_store uuid,p_request uuid,p_kind text,p_party jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_id uuid:=coalesce(nullif(p_party->>'id','')::uuid,gen_random_uuid());
 v_opening bigint:=coalesce((p_party->>'opening_balance')::bigint,0);v_limit bigint:=coalesce((p_party->>'credit_limit')::bigint,0);
 v_name text:=nullif(btrim(p_party->>'name'),'');v_new boolean:=nullif(p_party->>'id','') IS NULL;
BEGIN
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'party.save',jsonb_build_object('kind',p_kind,'party',p_party));
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF v_name IS NULL OR length(v_name)>140 OR v_opening<0 OR v_opening>9999999999999 OR v_limit<0 OR v_limit>9999999999999
 OR (NOT v_new AND v_opening<>0) THEN RAISE EXCEPTION 'Invalid account' USING ERRCODE='22023';END IF;
 IF p_kind='customer' THEN
  IF v_new THEN
   IF v_opening>0 AND (v_limit<=0 OR v_opening>v_limit) THEN RAISE EXCEPTION 'Credit limit exceeded' USING ERRCODE='22023';END IF;
   INSERT INTO public.retail_customers(id,store_id,name,phone,address,credit_limit_minor,balance_minor,note)
   VALUES(v_id,p_store,v_name,p_party->>'phone',p_party->>'address',v_limit,v_opening,p_party->>'note');
   IF v_opening>0 THEN INSERT INTO public.retail_customer_ledger(store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,note,actor_id,request_id)
    VALUES(p_store,v_id,'opening_balance',v_opening,v_opening,v_opening,p_party->>'note',auth.uid(),p_request);END IF;
  ELSE
   PERFORM 1 FROM public.retail_customers WHERE store_id=p_store AND id=v_id AND active FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found' USING ERRCODE='22023';END IF;
   IF EXISTS(SELECT 1 FROM public.retail_customers WHERE store_id=p_store AND id=v_id AND balance_minor>v_limit AND v_limit>0) THEN RAISE EXCEPTION 'Credit limit below outstanding balance' USING ERRCODE='22023';END IF;
   UPDATE public.retail_customers SET name=v_name,phone=p_party->>'phone',address=p_party->>'address',credit_limit_minor=v_limit,note=p_party->>'note',updated_at=now() WHERE store_id=p_store AND id=v_id;
  END IF;
 ELSIF p_kind='supplier' THEN
  IF v_new THEN
   INSERT INTO public.retail_suppliers(id,store_id,name,company,phone,address,category,balance_minor,note)
   VALUES(v_id,p_store,v_name,p_party->>'company',p_party->>'phone',p_party->>'address',p_party->>'category',v_opening,p_party->>'note');
   IF v_opening>0 THEN INSERT INTO public.retail_supplier_ledger(store_id,supplier_id,entry_type,amount_minor,delta_minor,balance_after_minor,note,actor_id,request_id)
    VALUES(p_store,v_id,'opening_balance',v_opening,v_opening,v_opening,p_party->>'note',auth.uid(),p_request);END IF;
  ELSE
   PERFORM 1 FROM public.retail_suppliers WHERE store_id=p_store AND id=v_id AND active FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE='22023';END IF;
   UPDATE public.retail_suppliers SET name=v_name,company=p_party->>'company',phone=p_party->>'phone',address=p_party->>'address',category=p_party->>'category',note=p_party->>'note',updated_at=now() WHERE store_id=p_store AND id=v_id;
  END IF;
 ELSE RAISE EXCEPTION 'Invalid account kind' USING ERRCODE='22023';END IF;
 v_result:=jsonb_build_object('id',v_id);
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'party.save_v21',v_id,jsonb_build_object('kind',p_kind,'request_id',p_request));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.retail_save_party_v21(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_save_party_v21(uuid,uuid,text,jsonb) TO authenticated;
-- Prevent editing supplier balances independently of the financial ledger.
REVOKE INSERT,UPDATE,DELETE ON public.retail_suppliers FROM authenticated;
GRANT UPDATE(active) ON public.retail_suppliers TO authenticated;
-- The legacy product RPC already checks owner identity and validates its payload.
ALTER FUNCTION public.retail_create_product(uuid,text,text,bigint) SECURITY DEFINER;

DO $functions$
DECLARE f record;
BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,7)='retail_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
 END LOOP;
END $functions$;
NOTIFY pgrst,'reload schema';
COMMIT;
