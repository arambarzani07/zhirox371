-- Reviewed source only. Do not apply automatically to a hosted database.
BEGIN;
CREATE OR REPLACE FUNCTION retail_internal.finance_state_v25(p_store uuid,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_safe numeric;v_drawer numeric:=0;v_opening bigint;v_receivable numeric;v_payable numeric;v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 SELECT coalesce(sum(CASE WHEN entry_kind IN ('drawer_to_safe','safe_deposit') OR (entry_kind='revenue' AND wallet='safe') THEN amount_minor WHEN entry_kind IN ('safe_to_drawer','safe_withdraw') OR (entry_kind='expense' AND wallet='safe') THEN -amount_minor ELSE 0 END),0) INTO v_safe FROM public.retail_finance_entries WHERE store_id=p_store;
 v_safe:=v_safe+coalesce((SELECT sum(amount_minor) FROM public.retail_customer_ledger WHERE store_id=p_store AND entry_type='payment_received' AND payment_method='ledger_only'),0)-coalesce((SELECT sum(amount_minor) FROM public.retail_supplier_ledger WHERE store_id=p_store AND ((entry_type='payment_sent' AND payment_method='ledger_only') OR (entry_type='purchase_cash' AND payment_method='cash_external'))),0);
 IF p_session IS NOT NULL THEN
  SELECT opening_cash_minor INTO v_opening FROM public.retail_cash_sessions WHERE store_id=p_store AND id=p_session AND cashier_id=auth.uid() AND status='open';
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not open' USING ERRCODE='22023';END IF;
  v_drawer:=v_opening+coalesce((SELECT sum(cash_received_minor-change_due_minor) FROM public.retail_sales WHERE store_id=p_store AND cash_session_id=p_session AND status='posted'),0)+coalesce((SELECT sum(CASE WHEN kind='cash_in' THEN amount_minor ELSE -amount_minor END) FROM public.retail_cash_movements WHERE store_id=p_store AND session_id=p_session),0);
 END IF;
 SELECT coalesce(sum(balance_minor),0) INTO v_receivable FROM public.retail_customers WHERE store_id=p_store AND active;
 SELECT coalesce(sum(balance_minor),0) INTO v_payable FROM public.retail_suppliers WHERE store_id=p_store AND active;
 IF greatest(abs(v_safe),abs(v_drawer),abs(v_receivable),abs(v_payable),abs(v_safe+v_drawer+v_receivable-v_payable))>9007199254740991 THEN RAISE EXCEPTION 'Balance exceeds exact browser integer range' USING ERRCODE='22023';END IF;
 v_result:=jsonb_build_object('safe_balance_minor',v_safe,'drawer_balance_minor',v_drawer,'customer_receivables_minor',v_receivable,'supplier_payables_minor',v_payable);
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.finance_state_v25(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_finance_state_v25(p_store uuid,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $fn$ SELECT retail_internal.finance_state_v25(p_store,p_session); $fn$;
REVOKE ALL ON FUNCTION public.retail_finance_state_v25(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_finance_state_v25(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION retail_internal.record_finance_v25(p_store uuid,p_request uuid,p_entry jsonb,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb;v_state jsonb;v_row public.retail_finance_entries%ROWTYPE;
 v_kind text:=p_entry->>'entry_kind';v_wallet text:=p_entry->>'wallet';v_amount bigint:=(p_entry->>'amount_minor')::bigint;
 v_category text:=nullif(btrim(p_entry->>'category'),'');v_note text:=nullif(btrim(p_entry->>'note'),'');v_cash text;v_delta bigint:=0;v_session uuid;
BEGIN
 IF NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'finance.record_v25',jsonb_build_object('entry',p_entry,'session',p_session));
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 IF v_kind IS NULL OR v_kind NOT IN ('revenue','expense','drawer_to_safe','safe_to_drawer','safe_deposit','safe_withdraw') OR v_wallet IS NULL OR v_wallet NOT IN ('safe','cash_drawer') OR v_amount IS NULL OR v_amount<=0 OR v_amount>9999999999999 OR v_category IS NULL OR length(v_category)>100 OR v_note IS NULL OR length(v_note)>160 OR length(coalesce(p_entry->>'payee',''))>160 OR length(coalesce(p_entry->>'reference_no',''))>120 THEN RAISE EXCEPTION 'Invalid finance entry' USING ERRCODE='22023';END IF;
 IF v_kind NOT IN ('revenue','expense') AND v_wallet<>'safe' THEN RAISE EXCEPTION 'Invalid transfer wallet' USING ERRCODE='22023';END IF;
 -- Every safe mutation takes the same per-store lock before any drawer lock.
 PERFORM 1 FROM public.retail_stores WHERE id=p_store FOR UPDATE;
 IF v_kind='drawer_to_safe' OR (v_kind='expense' AND v_wallet='cash_drawer') THEN v_cash:='cash_out';
 ELSIF v_kind='safe_to_drawer' OR (v_kind='revenue' AND v_wallet='cash_drawer') THEN v_cash:='cash_in';END IF;
 IF v_cash IS NOT NULL THEN
  SELECT id INTO v_session FROM public.retail_cash_sessions WHERE store_id=p_store AND id=p_session AND cashier_id=auth.uid() AND status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shift not open' USING ERRCODE='22023';END IF;
 END IF;
 v_state:=retail_internal.finance_state_v25(p_store,coalesce(v_session,p_session));
 IF v_kind IN ('drawer_to_safe','safe_deposit') OR (v_kind='revenue' AND v_wallet='safe') THEN v_delta:=v_amount;
 ELSIF v_kind IN ('safe_to_drawer','safe_withdraw') OR (v_kind='expense' AND v_wallet='safe') THEN v_delta:=-v_amount;END IF;
 IF v_delta<0 AND (v_state->>'safe_balance_minor')::numeric+v_delta<0 THEN RAISE EXCEPTION 'Insufficient safe balance; reconcile opening balance' USING ERRCODE='22023';END IF;
 IF v_cash='cash_out' AND (v_state->>'drawer_balance_minor')::numeric<v_amount THEN RAISE EXCEPTION 'Insufficient cash in drawer' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.retail_finance_entries WHERE store_id=p_store AND request_id=p_request) OR EXISTS(SELECT 1 FROM public.retail_cash_movements WHERE store_id=p_store AND request_id=p_request) THEN RAISE EXCEPTION 'Request already used by unrelated legacy movement' USING ERRCODE='22023';END IF;
 IF v_cash IS NOT NULL THEN PERFORM public.retail_cash_movement(p_store,v_session,p_request,v_cash,v_amount,left(v_note,160));END IF;
 INSERT INTO public.retail_finance_entries(store_id,entry_kind,category,amount_minor,wallet,payee,reference_no,note,actor_id,request_id)
 VALUES(p_store,v_kind,v_category,v_amount,v_wallet,nullif(p_entry->>'payee',''),nullif(p_entry->>'reference_no',''),v_note,auth.uid(),p_request) RETURNING * INTO v_row;
 v_result:=jsonb_build_object('entry',to_jsonb(v_row),'state',retail_internal.finance_state_v25(p_store,coalesce(v_session,p_session)));
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'finance.record_v25',v_row.id,jsonb_build_object('request_id',p_request,'amount_minor',v_amount,'entry_kind',v_kind));
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.record_finance_v25(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_record_finance_v25(p_store uuid,p_request uuid,p_entry jsonb,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $fn$ SELECT retail_internal.record_finance_v25(p_store,p_request,p_entry,p_session); $fn$;
REVOKE ALL ON FUNCTION public.retail_record_finance_v25(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_record_finance_v25(uuid,uuid,jsonb,uuid) TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.retail_finance_entries FROM authenticated,anon;
-- Promotional records are authoritative server data, never pre-seeded in a browser.
DO $policies$ DECLARE t text;p record;BEGIN
 FOREACH t IN ARRAY ARRAY['retail_campaigns','retail_offers','retail_discount_rules','retail_coupons'] LOOP
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY promo_read ON public.%I FOR SELECT TO authenticated USING(retail_internal.has_role(store_id,ARRAY[''manager'',''cashier'']))',t);
  EXECUTE format('CREATE POLICY promo_manage ON public.%I FOR ALL TO authenticated USING(retail_internal.has_role(store_id,ARRAY[''manager''])) WITH CHECK(retail_internal.has_role(store_id,ARRAY[''manager'']))',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon',t);
  EXECUTE format('REVOKE TRUNCATE ON public.%I FROM authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 END LOOP;
END $policies$;
COMMIT;
