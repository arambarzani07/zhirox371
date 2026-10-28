-- Reviewed source for isolated validation. No hosted database is changed by this file.
BEGIN;
CREATE TABLE IF NOT EXISTS public.retail_workflow_records(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES public.retail_stores(id) ON DELETE CASCADE,
 topic text NOT NULL CHECK(topic IN ('attendance','workhours','evaluation','alerts','approvals')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','resolved','pending','approved','rejected')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_store_topic_page ON public.retail_workflow_records(store_id,topic,status,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS workflow_created_actor ON public.retail_workflow_records(created_by);
CREATE INDEX IF NOT EXISTS workflow_updated_actor ON public.retail_workflow_records(updated_by);
ALTER TABLE public.retail_workflow_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workflow_manager_read ON public.retail_workflow_records;
CREATE POLICY workflow_manager_read ON public.retail_workflow_records FOR SELECT TO authenticated USING(retail_internal.has_role(store_id,ARRAY['manager']));
REVOKE ALL ON public.retail_workflow_records FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.retail_workflow_records TO authenticated;
CREATE TABLE IF NOT EXISTS retail_internal.workflow_history(
 record_id uuid NOT NULL REFERENCES public.retail_workflow_records(id) ON DELETE CASCADE,
 version integer NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(record_id,version)
);
ALTER TABLE retail_internal.workflow_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON retail_internal.workflow_history FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS workflow_history_actor ON retail_internal.workflow_history(actor_id);

CREATE OR REPLACE FUNCTION retail_internal.workflow_write_v27(p_store uuid,p_request uuid,p_id uuid,p_topic text,p_version integer,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_old public.retail_workflow_records%ROWTYPE;v_row public.retail_workflow_records%ROWTYPE;v_result jsonb;v_data jsonb;v_exists boolean;v_status text;
 v_reg numeric;v_ot numeric;v_rate numeric;v_otrate numeric;v_bonus numeric;v_pay numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_version IS NULL OR p_version<0 OR p_topic IS NULL OR p_topic NOT IN ('attendance','workhours','evaluation','alerts','approvals') OR p_action IS NULL OR p_action NOT IN ('save','archive','restore','resolve','approve','reject') OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>8192 THEN RAISE EXCEPTION 'Invalid workflow request' USING ERRCODE='22023';END IF;
 v_result:=retail_internal.claim_financial_request(p_store,p_request,'workflow.write_v27',jsonb_build_object('id',p_id,'topic',p_topic,'version',p_version,'action',p_action,'data',p_data));
 IF v_result IS NOT NULL THEN RETURN v_result;END IF;
 SELECT * INTO v_old FROM public.retail_workflow_records WHERE id=p_id FOR UPDATE;v_exists:=FOUND;
 IF v_exists AND (v_old.store_id<>p_store OR v_old.topic<>p_topic) THEN RAISE EXCEPTION 'Record not accessible' USING ERRCODE='42501';END IF;
 IF (v_exists AND v_old.version<>p_version) OR (NOT v_exists AND p_version<>0) THEN RAISE EXCEPTION 'Record changed; refresh before retrying' USING ERRCODE='40001';END IF;
 IF p_action<>'save' THEN
  IF NOT v_exists THEN RAISE EXCEPTION 'Record not found' USING ERRCODE='22023';END IF;
  IF p_action IN ('archive','restore') AND p_topic IN ('attendance','workhours','evaluation') AND v_old.status=(CASE WHEN p_action='archive' THEN 'active' ELSE 'archived' END) THEN v_status:=CASE WHEN p_action='archive' THEN 'archived' ELSE 'active' END;
  ELSIF p_action='resolve' AND p_topic='alerts' AND v_old.status='active' THEN v_status:='resolved';
  ELSIF p_action IN ('approve','reject') AND p_topic='approvals' AND v_old.status='pending' THEN v_status:=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END;
  ELSE RAISE EXCEPTION 'Invalid workflow transition' USING ERRCODE='22023';END IF;
  v_data:=v_old.data;
 ELSE
  IF v_exists AND (v_old.status<>'active' OR p_topic='approvals') THEN RAISE EXCEPTION 'Final or archived record cannot be edited' USING ERRCODE='22023';END IF;
  IF p_data?'note' AND jsonb_typeof(p_data->'note')<>'string' THEN RAISE EXCEPTION 'Invalid note' USING ERRCODE='22023';END IF;
  IF length(coalesce(p_data->>'note',''))>500 THEN RAISE EXCEPTION 'Note too long' USING ERRCODE='22023';END IF;
  IF p_topic IN ('attendance','workhours','evaluation') THEN
   IF jsonb_typeof(p_data->'name') IS DISTINCT FROM 'string' OR length(btrim(p_data->>'name')) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Staff name required' USING ERRCODE='22023';END IF;
  END IF;
  IF p_topic IN ('attendance','workhours') THEN
   IF coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Date required' USING ERRCODE='22023';END IF;
   PERFORM (p_data->>'date')::date;
  END IF;
  IF p_topic='attendance' THEN
   IF coalesce(p_data->>'status','') NOT IN ('present','late','leave','absent') OR length(coalesce(p_data->>'role',''))>60 OR coalesce(p_data->>'checkIn','') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(p_data->>'checkOut','') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Invalid attendance fields' USING ERRCODE='22023';END IF;
   v_data:=jsonb_build_object('name',btrim(p_data->>'name'),'role',coalesce(p_data->>'role',''),'date',p_data->>'date','checkIn',coalesce(p_data->>'checkIn',''),'checkOut',coalesce(p_data->>'checkOut',''),'status',p_data->>'status','note',coalesce(p_data->>'note',''));
  ELSIF p_topic='workhours' THEN
   IF jsonb_typeof(p_data->'regularHrs') IS DISTINCT FROM 'number' OR jsonb_typeof(p_data->'overtimeHrs') IS DISTINCT FROM 'number' OR jsonb_typeof(p_data->'hourlyRate') IS DISTINCT FROM 'number' OR jsonb_typeof(p_data->'overtimeRate') IS DISTINCT FROM 'number' OR jsonb_typeof(p_data->'bonus') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Explicit hours and rates required' USING ERRCODE='22023';END IF;
   v_reg:=(p_data->>'regularHrs')::numeric;v_ot:=(p_data->>'overtimeHrs')::numeric;v_rate:=(p_data->>'hourlyRate')::numeric;v_otrate:=(p_data->>'overtimeRate')::numeric;v_bonus:=(p_data->>'bonus')::numeric;
   IF v_reg<0 OR v_ot<0 OR v_reg+v_ot>24 OR v_rate<0 OR v_rate>1000000000 OR v_otrate<0 OR v_otrate>1000000000 OR abs(v_bonus)>1000000000 OR v_rate<>trunc(v_rate) OR v_otrate<>trunc(v_otrate) OR v_bonus<>trunc(v_bonus) THEN RAISE EXCEPTION 'Invalid hours or integer rate' USING ERRCODE='22023';END IF;
   v_pay:=round(v_reg*v_rate+v_ot*v_otrate+v_bonus);
   IF v_pay<0 OR v_pay>9007199254740991 THEN RAISE EXCEPTION 'Invalid estimated total' USING ERRCODE='22023';END IF;
   v_data:=jsonb_build_object('name',btrim(p_data->>'name'),'date',p_data->>'date','regularHrs',v_reg,'overtimeHrs',v_ot,'hourlyRate',v_rate,'overtimeRate',v_otrate,'bonus',v_bonus,'totalPay',v_pay,'estimate_only',true,'note',coalesce(p_data->>'note',''));
  ELSIF p_topic='evaluation' THEN
   IF length(btrim(coalesce(p_data->>'period',''))) NOT BETWEEN 1 AND 40 OR jsonb_typeof(p_data->'speed') IS DISTINCT FROM 'number' OR jsonb_typeof(p_data->'accuracy') IS DISTINCT FROM 'number' OR jsonb_typeof(p_data->'discipline') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Explicit review scores required' USING ERRCODE='22023';END IF;
   v_reg:=(p_data->>'speed')::numeric;v_ot:=(p_data->>'accuracy')::numeric;v_rate:=(p_data->>'discipline')::numeric;
   IF v_reg NOT BETWEEN 1 AND 5 OR v_ot NOT BETWEEN 1 AND 5 OR v_rate NOT BETWEEN 1 AND 5 OR v_reg<>trunc(v_reg) OR v_ot<>trunc(v_ot) OR v_rate<>trunc(v_rate) THEN RAISE EXCEPTION 'Review score must be 1 to 5' USING ERRCODE='22023';END IF;
   v_data:=jsonb_build_object('name',btrim(p_data->>'name'),'period',btrim(p_data->>'period'),'speed',v_reg,'accuracy',v_ot,'discipline',v_rate,'avgScore',round((v_reg+v_ot+v_rate)/3,1),'note',coalesce(p_data->>'note',''));
  ELSIF p_topic='alerts' THEN
   IF jsonb_typeof(p_data->'title') IS DISTINCT FROM 'string' OR length(btrim(p_data->>'title')) NOT BETWEEN 1 AND 160 OR coalesce(p_data->>'severity','') NOT IN ('critical','warning','info') OR length(coalesce(p_data->>'dept',''))>60 THEN RAISE EXCEPTION 'Invalid alert fields' USING ERRCODE='22023';END IF;
   v_data:=jsonb_build_object('title',btrim(p_data->>'title'),'severity',p_data->>'severity','dept',coalesce(p_data->>'dept',''),'note',coalesce(p_data->>'note',''));
  ELSIF p_topic='approvals' THEN
   IF jsonb_typeof(p_data->'requester') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'type') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'reason') IS DISTINCT FROM 'string' OR length(btrim(coalesce(p_data->>'requester',''))) NOT BETWEEN 1 AND 80 OR length(btrim(coalesce(p_data->>'type',''))) NOT BETWEEN 1 AND 80 OR length(btrim(coalesce(p_data->>'reason',''))) NOT BETWEEN 1 AND 140 OR length(coalesce(p_data->>'amount',''))>60 OR (p_data?'status' AND p_data->>'status'<>'pending') THEN RAISE EXCEPTION 'Invalid approval request' USING ERRCODE='22023';END IF;
   v_data:=jsonb_build_object('requester',btrim(p_data->>'requester'),'type',btrim(p_data->>'type'),'amount',coalesce(p_data->>'amount',''),'reason',btrim(p_data->>'reason'),'record_only',true);
  END IF;
  v_status:=CASE WHEN p_topic='approvals' THEN 'pending' ELSE 'active' END;
 END IF;
 IF NOT v_exists THEN
  INSERT INTO public.retail_workflow_records(id,store_id,topic,data,status,created_by,updated_by) VALUES(p_id,p_store,p_topic,v_data,v_status,auth.uid(),auth.uid()) RETURNING * INTO v_row;
 ELSE
  UPDATE public.retail_workflow_records SET data=v_data,status=v_status,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO v_row;
 END IF;
 INSERT INTO retail_internal.workflow_history(record_id,version,actor_id,action,snapshot) VALUES(v_row.id,v_row.version,auth.uid(),p_action,to_jsonb(v_row));
 INSERT INTO public.retail_audit_events(store_id,actor_id,action,subject_id,details) VALUES(p_store,auth.uid(),'workflow.'||p_topic||'.'||p_action,p_id,jsonb_build_object('version',v_row.version,'status',v_status,'request_id',p_request));
 v_result:=jsonb_build_object('record',to_jsonb(v_row));
 UPDATE retail_internal.financial_requests SET result=v_result WHERE store_id=p_store AND request_id=p_request;
 RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.workflow_write_v27(uuid,uuid,uuid,text,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_workflow_write_v27(p_store uuid,p_request uuid,p_id uuid,p_topic text,p_version integer,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $fn$ SELECT retail_internal.workflow_write_v27(p_store,p_request,p_id,p_topic,p_version,p_action,p_data); $fn$;
REVOKE ALL ON FUNCTION public.retail_workflow_write_v27(uuid,uuid,uuid,text,integer,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_workflow_write_v27(uuid,uuid,uuid,text,integer,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION retail_internal.workflow_list_v27(p_store uuid,p_topic text,p_status text DEFAULT 'all',p_offset integer DEFAULT 0,p_limit integer DEFAULT 50,p_query text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_rows jsonb;v_count bigint;v_counts jsonb;v_signals jsonb:='{}';
BEGIN
 IF auth.uid() IS NULL OR NOT retail_internal.has_role(p_store,ARRAY['manager']) THEN RAISE EXCEPTION 'Manager permission required' USING ERRCODE='42501';END IF;
 IF p_topic IS NULL OR p_topic NOT IN ('attendance','workhours','evaluation','alerts','approvals') OR p_status IS NULL OR p_status NOT IN ('all','active','archived','resolved','pending','approved','rejected') OR p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_query IS NULL OR length(p_query)>80 THEN RAISE EXCEPTION 'Invalid workflow page' USING ERRCODE='22023';END IF;
 SELECT count(*) INTO v_count FROM public.retail_workflow_records WHERE store_id=p_store AND topic=p_topic AND (p_status='all' OR status=p_status) AND (p_query='' OR position(lower(p_query) in lower(concat_ws(' ',data->>'name',data->>'title',data->>'requester',data->>'date',data->>'period',data->>'type',data->>'note',data->>'reason')))>0);
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO v_rows FROM (SELECT * FROM public.retail_workflow_records WHERE store_id=p_store AND topic=p_topic AND (p_status='all' OR status=p_status) AND (p_query='' OR position(lower(p_query) in lower(concat_ws(' ',data->>'name',data->>'title',data->>'requester',data->>'date',data->>'period',data->>'type',data->>'note',data->>'reason')))>0) ORDER BY updated_at DESC,id LIMIT p_limit OFFSET p_offset) r;
 SELECT coalesce(jsonb_object_agg(status,n),'{}') INTO v_counts FROM (SELECT status,count(*) n FROM public.retail_workflow_records WHERE store_id=p_store AND topic=p_topic GROUP BY status) c;
 IF p_topic='alerts' THEN
  v_signals:=jsonb_build_object('out_of_stock',(SELECT count(*) FROM public.retail_products p LEFT JOIN public.retail_stock_balances b ON b.store_id=p.store_id AND b.product_id=p.id WHERE p.store_id=p_store AND p.active AND coalesce(b.quantity,0)<=0),'over_credit_limit',(SELECT count(*) FROM public.retail_customers WHERE store_id=p_store AND active AND credit_limit_minor>0 AND balance_minor>credit_limit_minor));
 END IF;
 RETURN jsonb_build_object('rows',v_rows,'total',v_count,'counts',v_counts,'signals',v_signals,'offset',p_offset,'limit',p_limit,'fetched_at',statement_timestamp());
END $fn$;
REVOKE ALL ON FUNCTION retail_internal.workflow_list_v27(uuid,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.retail_workflow_list_v27(p_store uuid,p_topic text,p_status text DEFAULT 'all',p_offset integer DEFAULT 0,p_limit integer DEFAULT 50,p_query text DEFAULT '')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$ SELECT retail_internal.workflow_list_v27(p_store,p_topic,p_status,p_offset,p_limit,p_query); $fn$;
REVOKE ALL ON FUNCTION public.retail_workflow_list_v27(uuid,text,text,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_workflow_list_v27(uuid,text,text,integer,integer,text) TO authenticated;
COMMIT;
