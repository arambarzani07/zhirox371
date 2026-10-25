-- V6 - historical receipt product name snapshots.
-- Captured from live deployed migration retail_v6_receipt_line_name_snapshot.
-- Recreate on a clean V5 schema ONLY. Do NOT re-run on the current Supabase project.

ALTER TABLE public.retail_sale_items ADD COLUMN product_name_snapshot text;

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
 v_name_snapshot text;
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
   select name,price_minor,active,currency into v_name_snapshot,v_price,v_active,v_currency
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
   insert into public.retail_sale_items(store_id,sale_id,product_id,quantity,unit_price_minor,product_name_snapshot)
     values(p_store,v_sale,v_product,v_qty,v_price,v_name_snapshot);
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
