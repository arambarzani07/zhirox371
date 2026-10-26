-- V5 cash drawer and cash-shift closeout. RUN ONCE on a clean V4 schema.
-- Source matches the deployed Supabase project qcfmlyyzfykzszvtllrw.
create table public.retail_cash_sessions(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.retail_stores(id),
 cashier_id uuid not null references auth.users(id),
 status text not null default 'open' check(status in ('open','closed')),
 opening_cash_minor bigint not null check(opening_cash_minor>=0 and opening_cash_minor<=9999999999999),
 counted_cash_minor bigint check(counted_cash_minor>=0 and counted_cash_minor<=9999999999999),
 sales_total_minor bigint check(sales_total_minor>=0),
 movements_net_minor bigint,
 expected_cash_minor bigint check(expected_cash_minor>=0),
 variance_minor bigint,
 opened_at timestamptz not null default now(),
 closed_at timestamptz,
 closed_by uuid references auth.users(id),
 unique(store_id,id),
 constraint retail_cash_session_state check(
  (status='open' and closed_at is null and counted_cash_minor is null and variance_minor is null)
  or (status='closed' and closed_at is not null and counted_cash_minor is not null and expected_cash_minor is not null and variance_minor is not null)
 )
);
create unique index retail_cash_only_one_open_per_user
 on public.retail_cash_sessions(store_id,cashier_id) where status='open';
create index retail_cash_sessions_history on public.retail_cash_sessions(store_id,opened_at desc);
create table public.retail_cash_movements(
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 session_id uuid not null,
 actor_id uuid not null references auth.users(id),
 request_id uuid not null,
 kind text not null check(kind in ('cash_in','cash_out')),
 amount_minor bigint not null check(amount_minor>0 and amount_minor<=9999999999999),
 note text not null check(length(btrim(note)) between 1 and 160),
 created_at timestamptz not null default now(),
 foreign key(store_id,session_id) references public.retail_cash_sessions(store_id,id),
 unique(store_id,request_id)
);
create index retail_cash_movements_session_idx on public.retail_cash_movements(store_id,session_id,created_at);
alter table public.retail_sales add column cash_session_id uuid;
alter table public.retail_sales add constraint retail_sale_session_fk
 foreign key(store_id,cash_session_id) references public.retail_cash_sessions(store_id,id);
create index retail_sales_session_lookup on public.retail_sales(store_id,cash_session_id,status);
alter table public.retail_cash_sessions enable row level security;
alter table public.retail_cash_movements enable row level security;
create policy retail_cash_sessions_read on public.retail_cash_sessions
 for select to authenticated using(
    retail_internal.has_role(store_id,array['manager'])
    or (cashier_id=(select auth.uid()) and retail_internal.has_role(store_id,array['cashier']))
 );
create policy retail_cash_movements_read on public.retail_cash_movements
 for select to authenticated using(
    retail_internal.has_role(store_id,array['manager'])
    or (actor_id=(select auth.uid()) and retail_internal.has_role(store_id,array['cashier']))
 );
revoke all on public.retail_cash_sessions,public.retail_cash_movements from anon,authenticated;
grant select on public.retail_cash_sessions,public.retail_cash_movements to authenticated;


CREATE OR REPLACE FUNCTION retail_internal.cash_movement(p_store uuid, p_session uuid, p_request uuid, p_kind text, p_amount bigint, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=(select auth.uid());v_found public.retail_cash_movements%rowtype;
 v_status text;v_cashier uuid;v_id uuid;v_current numeric;
begin
 if v_actor is null or not retail_internal.has_role(p_store,array['manager','cashier'])
 then raise exception 'Cashier permission required' using errcode='42501';end if;
 if p_request is null or p_session is null or p_kind not in ('cash_in','cash_out')
   or p_kind is null or p_amount is null or p_amount<=0 or p_amount>9999999999999
   or p_note is null or length(btrim(p_note)) not between 1 and 160
 then raise exception 'Invalid cash movement' using errcode='22023';end if;

 -- A confirmed movement can be retried with exactly the same payload after shift closes.
 select * into v_found from public.retail_cash_movements
 where store_id=p_store and request_id=p_request;
 if found then
   if v_found.session_id<>p_session or v_found.actor_id<>v_actor
    or v_found.kind<>p_kind or v_found.amount_minor<>p_amount or v_found.note<>btrim(p_note)
   then raise exception 'Cash request reused with changed payload' using errcode='23505';end if;
   return v_found.id;
 end if;

 select status,cashier_id into v_status,v_cashier from public.retail_cash_sessions
 where id=p_session and store_id=p_store for update;
 if not found or v_status<>'open' or v_cashier<>v_actor
 then raise exception 'Shift not open for user' using errcode='42501';end if;
 -- A second same-request call must re-check AFTER obtaining the shift lock.
 select * into v_found from public.retail_cash_movements
 where store_id=p_store and request_id=p_request;
 if found then
   if v_found.session_id<>p_session or v_found.actor_id<>v_actor
    or v_found.kind<>p_kind or v_found.amount_minor<>p_amount or v_found.note<>btrim(p_note)
   then raise exception 'Cash request reused with changed payload' using errcode='23505';end if;
   return v_found.id;
 end if;
 if p_kind='cash_out' then
   select (s.opening_cash_minor+
    coalesce((select sum(total_minor) from public.retail_sales where store_id=p_store and cash_session_id=p_session and status='posted'),0)+
    coalesce((select sum(case when kind='cash_in' then amount_minor else -amount_minor end)
    from public.retail_cash_movements where store_id=p_store and session_id=p_session),0))
   into v_current from public.retail_cash_sessions s where s.id=p_session;
   if v_current<p_amount then raise exception 'Insufficient cash in drawer' using errcode='22023';end if;
 end if;
 insert into public.retail_cash_movements(store_id,session_id,actor_id,request_id,kind,amount_minor,note)
 values(p_store,p_session,v_actor,p_request,p_kind,p_amount,btrim(p_note)) returning id into v_id;
 insert into public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 values(p_store,v_actor,'cash.movement',v_id,jsonb_build_object('session',p_session,'kind',p_kind,'amount_iqd',p_amount));
 return v_id;
end
$function$
;

revoke all on function retail_internal.cash_movement(uuid,uuid,uuid,text,bigint,text) from public,anon;
grant execute on function retail_internal.cash_movement(uuid,uuid,uuid,text,bigint,text) to authenticated;

CREATE OR REPLACE FUNCTION retail_internal.checkout_cash(p_store uuid, p_request uuid, p_items jsonb, p_cash_received bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=(select auth.uid());
 v_sale uuid;
 v_old_status text;
 v_count int;
 v_total numeric := 0;
 v_price bigint;
 v_active boolean;
 v_currency text;
 v_qty numeric(14,3);
 v_stock numeric(14,3);
 v_product uuid;
 v_line record;
 v_request_payload jsonb;
 v_previous_payload jsonb;
 v_previous_actor uuid;
 v_receipt_number bigint;
 v_cash_session uuid;
begin
 if v_actor is null or not retail_internal.has_role(p_store,array['manager','cashier']) then
   raise exception 'Cashier permission required' using errcode='42501';
 end if;
 if p_request is null or p_items is null or jsonb_typeof(p_items)<>'array' then
   raise exception 'Invalid checkout' using errcode='22023';
 end if;
 v_count:=jsonb_array_length(p_items);
 if v_count<1 or v_count>100 or p_cash_received is null or p_cash_received<0 or p_cash_received>9999999999999 then
   raise exception 'Invalid checkout amount or number of items' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(p_items) j where jsonb_typeof(j)<>'object'
    or j->>'product_id' is null or j->>'quantity' is null) then
   raise exception 'Invalid checkout lines' using errcode='22023';
 end if;
 if not exists(select 1 from public.retail_stores where id=p_store and currency='IQD') then
   raise exception 'IQD store required' using errcode='22023';
 end if;

 select jsonb_build_object(
    'cash_received',p_cash_received,
    'items',coalesce(jsonb_agg(jsonb_build_object('product_id',x.product_id,'quantity',x.quantity) order by x.product_id),'[]'::jsonb)
   ) into v_request_payload
 from (
   select (j->>'product_id')::uuid as product_id,
     sum((j->>'quantity')::numeric) as quantity
   from jsonb_array_elements(p_items) j group by 1
 ) x;

 -- The transaction's unique request fence serializes simultaneous retries.
 insert into public.retail_sales(store_id,cashier_id,request_id,status,currency,request_payload)
 values(p_store,v_actor,p_request,'draft','IQD',v_request_payload)
 on conflict(store_id,request_id) do nothing returning id into v_sale;
 if v_sale is null then
   select id,status,request_payload,cashier_id into v_sale,v_old_status,v_previous_payload,v_previous_actor from public.retail_sales
     where store_id=p_store and request_id=p_request;
   if v_sale is null or v_old_status<>'posted' then
     raise exception 'Checkout request in invalid state' using errcode='23505';
   end if;
   if v_previous_payload is distinct from v_request_payload or v_previous_actor is distinct from v_actor then
     raise exception 'Checkout request reused with different actor or payload' using errcode='23505';
   end if;
   return v_sale;
 end if;

 -- Lock the open shift AFTER completed-request replay check so retries still work after shift closure.
 select id into v_cash_session from public.retail_cash_sessions
 where store_id=p_store and cashier_id=v_actor and status='open'
 for update;
 if v_cash_session is null then
   raise exception 'No open cash shift' using errcode='22023';
 end if;
 update public.retail_sales set cash_session_id=v_cash_session where id=v_sale and store_id=p_store;

 -- Sorted product locks ensure checkout concurrency cannot overdraw stock.
 for v_line in
   select (j->>'product_id')::uuid as product_id,
          sum((j->>'quantity')::numeric) as quantity
   from jsonb_array_elements(p_items) j
   group by 1 order by 1
 loop
   if v_line.quantity is null or v_line.quantity<=0 or v_line.quantity>100000
      or v_line.quantity<>trunc(v_line.quantity) then
     raise exception 'Only positive whole-unit quantities are supported' using errcode='22023';
   end if;
   v_product:=v_line.product_id;
   v_qty:=v_line.quantity;
   select price_minor,active,currency into v_price,v_active,v_currency
     from public.retail_products
     where store_id=p_store and id=v_product for share;
   if not found or not v_active or v_currency<>'IQD' then
     raise exception 'Invalid or inactive product' using errcode='22023';
   end if;
   select quantity into v_stock from public.retail_stock_balances
     where store_id=p_store and product_id=v_product for update;
   if not found or v_stock<v_qty then
     raise exception 'Insufficient stock' using errcode='22023';
   end if;
   v_total:=v_total+(v_qty*v_price);
   if v_total>9999999999999 then
     raise exception 'Sale total too large' using errcode='22023';
   end if;
   update public.retail_stock_balances
     set quantity=quantity-v_qty,updated_at=now()
     where store_id=p_store and product_id=v_product;
   insert into public.retail_sale_items(store_id,sale_id,product_id,quantity,unit_price_minor)
     values(p_store,v_sale,v_product,v_qty,v_price);
   insert into public.retail_stock_events(store_id,product_id,delta,reason,sale_id)
     values(p_store,v_product,-v_qty,'sale',v_sale);
 end loop;
 if p_cash_received<v_total then
   raise exception 'Cash amount is below total' using errcode='22023';
 end if;
 insert into public.retail_receipt_counters(store_id,last_no)
 values(p_store,1)
 on conflict(store_id) do update set last_no=public.retail_receipt_counters.last_no+1
 returning last_no into v_receipt_number;
 update public.retail_sales set status='posted',receipt_no=v_receipt_number,total_minor=v_total::bigint,
   cash_received_minor=p_cash_received,change_due_minor=(p_cash_received-v_total)::bigint
   where store_id=p_store and id=v_sale;
 insert into public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 values(p_store,v_actor,'sale.checkout_cash',v_sale,
   jsonb_build_object('total_iqd',v_total,'cash_iqd',p_cash_received,'request_id',p_request,'receipt_no',v_receipt_number));
 return v_sale;
end;
$function$
;

revoke all on function retail_internal.checkout_cash(uuid,uuid,jsonb,bigint) from public,anon;
grant execute on function retail_internal.checkout_cash(uuid,uuid,jsonb,bigint) to authenticated;

CREATE OR REPLACE FUNCTION retail_internal.shift_close(p_store uuid, p_session uuid, p_counted bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=(select auth.uid()); v_row public.retail_cash_sessions%rowtype;
 v_sales numeric;v_moves numeric;v_expected numeric;v_variance numeric;
begin
 if v_actor is null or not retail_internal.has_role(p_store,array['manager','cashier'])
 then raise exception 'Cashier permission required' using errcode='42501';end if;
 if p_session is null or p_counted is null or p_counted<0 or p_counted>9999999999999
 then raise exception 'Invalid counted cash' using errcode='22023';end if;
 select * into v_row from public.retail_cash_sessions
 where id=p_session and store_id=p_store for update;
 if not found or v_row.cashier_id<>v_actor
 then raise exception 'Shift not owned by caller' using errcode='42501';end if;
 if v_row.status='closed' then
   if v_row.counted_cash_minor<>p_counted
   then raise exception 'Shift already closed with different count' using errcode='23505';end if;
   return jsonb_build_object('session_id',v_row.id,'opening',v_row.opening_cash_minor,
    'sales',v_row.sales_total_minor,'movements',v_row.movements_net_minor,
    'expected',v_row.expected_cash_minor,'counted',v_row.counted_cash_minor,
    'variance',v_row.variance_minor,'status','closed');
 end if;
 select coalesce(sum(total_minor),0) into v_sales from public.retail_sales
 where store_id=p_store and cash_session_id=p_session and status='posted';
 select coalesce(sum(case when kind='cash_in' then amount_minor else -amount_minor end),0)
 into v_moves from public.retail_cash_movements where store_id=p_store and session_id=p_session;
 v_expected:=v_row.opening_cash_minor+v_sales+v_moves;
 v_variance:=p_counted-v_expected;
 if v_expected<0 or v_expected>9999999999999
 then raise exception 'Expected cash outside supported range' using errcode='22023';end if;
 update public.retail_cash_sessions
 set status='closed',counted_cash_minor=p_counted,sales_total_minor=v_sales::bigint,
 movements_net_minor=v_moves::bigint,expected_cash_minor=v_expected::bigint,
 variance_minor=v_variance::bigint,closed_at=now(),closed_by=v_actor
 where id=p_session and store_id=p_store;
 insert into public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 values(p_store,v_actor,'cash.shift_close',p_session,jsonb_build_object(
  'opening',v_row.opening_cash_minor,'sales',v_sales,'movements',v_moves,
  'expected',v_expected,'counted',p_counted,'variance',v_variance));
 return jsonb_build_object('session_id',p_session,'opening',v_row.opening_cash_minor,
    'sales',v_sales,'movements',v_moves,'expected',v_expected,
    'counted',p_counted,'variance',v_variance,'status','closed');
end
$function$
;

revoke all on function retail_internal.shift_close(uuid,uuid,bigint) from public,anon;
grant execute on function retail_internal.shift_close(uuid,uuid,bigint) to authenticated;

CREATE OR REPLACE FUNCTION retail_internal.shift_open(p_store uuid, p_opening bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=(select auth.uid()); v_old record; v_session uuid;
begin
 if v_actor is null or not retail_internal.has_role(p_store,array['manager','cashier'])
 then raise exception 'Cashier permission required' using errcode='42501';end if;
 if p_opening is null or p_opening<0 or p_opening>9999999999999
 then raise exception 'Invalid opening amount' using errcode='22023';end if;
 select id,opening_cash_minor into v_old from public.retail_cash_sessions
 where store_id=p_store and cashier_id=v_actor and status='open' for update;
 if found then
   if v_old.opening_cash_minor<>p_opening then
     raise exception 'Cash shift already open' using errcode='23505';
   end if;
   return v_old.id;
 end if;
 insert into public.retail_cash_sessions(store_id,cashier_id,opening_cash_minor)
 values(p_store,v_actor,p_opening) returning id into v_session;
 insert into public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 values(p_store,v_actor,'cash.shift_open',v_session,jsonb_build_object('opening_iqd',p_opening));
 return v_session;
end
$function$
;

revoke all on function retail_internal.shift_open(uuid,bigint) from public,anon;
grant execute on function retail_internal.shift_open(uuid,bigint) to authenticated;

CREATE OR REPLACE FUNCTION retail_internal.shift_summary(p_store uuid, p_session uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid:=(select auth.uid());
 v_row public.retail_cash_sessions%rowtype;
 v_sales numeric:=0; v_moves numeric:=0; v_expected numeric;
begin
 if v_actor is null or not retail_internal.has_role(p_store,array['manager','cashier'])
 then raise exception 'Cashier permission required' using errcode='42501';end if;
 select * into v_row from public.retail_cash_sessions where id=p_session and store_id=p_store;
 if not found or v_row.cashier_id<>v_actor then
   raise exception 'Not owner of cash session' using errcode='42501';end if;
 if v_row.status='closed' then
   return jsonb_build_object('session_id',v_row.id,'status','closed',
      'opening',v_row.opening_cash_minor,'sales',v_row.sales_total_minor,
      'movements',v_row.movements_net_minor,'expected',v_row.expected_cash_minor,
      'counted',v_row.counted_cash_minor,'variance',v_row.variance_minor);
 end if;
 select coalesce(sum(total_minor),0) into v_sales from public.retail_sales
  where store_id=p_store and cash_session_id=p_session and status='posted';
 select coalesce(sum(case when kind='cash_in' then amount_minor else -amount_minor end),0)
 into v_moves from public.retail_cash_movements where store_id=p_store and session_id=p_session;
 v_expected:=v_row.opening_cash_minor+v_sales+v_moves;
 return jsonb_build_object('session_id',v_row.id,'status','open',
 'opening',v_row.opening_cash_minor,'sales',v_sales,'movements',v_moves,
 'expected',v_expected);
end
$function$
;

revoke all on function retail_internal.shift_summary(uuid,uuid) from public,anon;
grant execute on function retail_internal.shift_summary(uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.retail_cash_movement(p_store uuid, p_session uuid, p_request uuid, p_kind text, p_amount bigint, p_note text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select retail_internal.cash_movement(p_store,p_session,p_request,p_kind,p_amount,p_note);
$function$
;

revoke all on function public.retail_cash_movement(uuid,uuid,uuid,text,bigint,text) from public,anon;
grant execute on function public.retail_cash_movement(uuid,uuid,uuid,text,bigint,text) to authenticated;

CREATE OR REPLACE FUNCTION public.retail_shift_close(p_store uuid, p_session uuid, p_counted bigint)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select retail_internal.shift_close(p_store,p_session,p_counted);
$function$
;

revoke all on function public.retail_shift_close(uuid,uuid,bigint) from public,anon;
grant execute on function public.retail_shift_close(uuid,uuid,bigint) to authenticated;

CREATE OR REPLACE FUNCTION public.retail_shift_open(p_store uuid, p_opening bigint)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select retail_internal.shift_open(p_store,p_opening);
$function$
;

revoke all on function public.retail_shift_open(uuid,bigint) from public,anon;
grant execute on function public.retail_shift_open(uuid,bigint) to authenticated;

CREATE OR REPLACE FUNCTION public.retail_shift_summary(p_store uuid, p_session uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select retail_internal.shift_summary(p_store,p_session);
$function$
;

revoke all on function public.retail_shift_summary(uuid,uuid) from public,anon;
grant execute on function public.retail_shift_summary(uuid,uuid) to authenticated;

revoke insert,update,delete on public.retail_cash_sessions,public.retail_cash_movements from authenticated;
