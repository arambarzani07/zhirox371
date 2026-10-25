-- V12 disposable LOCAL Supabase QA ONLY; do not deploy/migrate to hosted projects.
-- Snapshot of selected effective retail RLS policies and grants read-only inspected
-- from Supermark project 2026-10-26. Schema comes from V8 function fixture.
-- The mirrored TRUNCATE grants below intentionally preserve a discovered production
-- hazard for TESTING; they are not a recommended production privilege model.

CREATE TABLE public.retail_barcodes(
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  code text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.retail_products(id),
  unit_type text NOT NULL DEFAULT 'unit',
  units_per_scan numeric NOT NULL DEFAULT 1,
  PRIMARY KEY(store_id,code)
);
CREATE TABLE public.retail_customers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.retail_stores(id),
  name text NOT NULL, phone text,
  credit_limit_minor bigint NOT NULL DEFAULT 0
);

-- This privileged implementation was independently read from pg_get_functiondef.
CREATE OR REPLACE FUNCTION retail_internal.assign_staff(
    p_store uuid, p_user uuid, p_role text, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_actor uuid := (select auth.uid());
begin
 if v_actor is null or not exists(select 1 from public.retail_stores where id=p_store and owner_user_id=v_actor) then
   raise exception 'Owner permission required' using errcode='42501';
 end if;
 if p_role not in ('manager','cashier') or p_role is null or p_active is null then
   raise exception 'Invalid staff role' using errcode='22023';
 end if;
 if p_user=v_actor or not exists(select 1 from auth.users where id=p_user) then
   raise exception 'Invalid staff user' using errcode='22023';
 end if;
 insert into public.retail_memberships(store_id,user_id,role,active)
 values(p_store,p_user,p_role,p_active)
 on conflict(store_id,user_id) do update set role=excluded.role,active=excluded.active;
 insert into public.retail_audit_events(store_id,actor_id,action,subject_id,details)
 values(p_store,v_actor,'staff.assign',p_user,jsonb_build_object('role',p_role,'active',p_active));
end;
$function$;
REVOKE ALL ON FUNCTION retail_internal.assign_staff(uuid,uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION retail_internal.assign_staff(uuid,uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.retail_assign_staff(
 p_store uuid,p_user uuid,p_role text,p_active boolean DEFAULT true)
RETURNS void LANGUAGE sql SET search_path TO ''
AS $function$
 select retail_internal.assign_staff(p_store,p_user,p_role,p_active);
$function$;
REVOKE ALL ON FUNCTION public.retail_assign_staff(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_assign_staff(uuid,uuid,text,boolean) TO authenticated;

-- Product+barcode creation is atomic and restricted to a store owner.
CREATE OR REPLACE FUNCTION public.retail_create_product(
 p_store_id uuid,p_name text,p_barcode text,p_price_minor bigint)
RETURNS uuid LANGUAGE plpgsql SET search_path TO ''
AS $function$
declare
 v_product_id uuid;
 v_name text := nullif(btrim(p_name),'');
 v_barcode text := nullif(btrim(p_barcode),'');
begin
 if (select auth.uid()) is null then raise exception 'Login required' using errcode='42501';end if;
 if not exists(select 1 from public.retail_stores s where s.id=p_store_id and s.owner_user_id=(select auth.uid()))
 then raise exception 'Store not accessible' using errcode='42501';end if;
 if v_name is null or length(v_name)>160 then raise exception 'Invalid product name' using errcode='22023';end if;
 if v_barcode is null or length(v_barcode)>60 then raise exception 'Invalid barcode' using errcode='22023';end if;
 if p_price_minor is null or p_price_minor<0 or p_price_minor>999999999
 then raise exception 'Invalid product price' using errcode='22023';end if;
 insert into public.retail_products(store_id,name,price_minor,currency,active)
 values(p_store_id,v_name,p_price_minor,'IQD',true) returning id into v_product_id;
 insert into public.retail_barcodes(store_id,code,product_id,unit_type,units_per_scan)
 values(p_store_id,v_barcode,v_product_id,'unit',1);
 return v_product_id;
end;
$function$;
REVOKE ALL ON FUNCTION public.retail_create_product(uuid,text,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_create_product(uuid,text,text,bigint) TO authenticated;

-- RLS: exact functional behavior of 13 store-isolation policies as inspected.
ALTER TABLE public.retail_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_stock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_receipt_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY retail_stores_read ON public.retail_stores FOR SELECT TO authenticated
 USING(retail_internal.has_role(id,array['manager','cashier']));
CREATE POLICY retail_stores_add ON public.retail_stores FOR INSERT TO authenticated
 WITH CHECK(owner_user_id=(select auth.uid()));
CREATE POLICY retail_stores_change ON public.retail_stores FOR UPDATE TO authenticated
 USING(owner_user_id=(select auth.uid())) WITH CHECK(owner_user_id=(select auth.uid()));

CREATE POLICY retail_memberships_read ON public.retail_memberships FOR SELECT TO authenticated
 USING(user_id=(select auth.uid()) OR retail_internal.has_role(store_id,array[]::text[]));

CREATE POLICY retail_products_read ON public.retail_products FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager','cashier']));
CREATE POLICY retail_products_add ON public.retail_products FOR INSERT TO authenticated
 WITH CHECK(exists(select 1 from public.retail_stores s where s.id=retail_products.store_id and s.owner_user_id=(select auth.uid())));
CREATE POLICY retail_products_change ON public.retail_products FOR UPDATE TO authenticated
 USING(exists(select 1 from public.retail_stores s where s.id=retail_products.store_id and s.owner_user_id=(select auth.uid())))
 WITH CHECK(exists(select 1 from public.retail_stores s where s.id=retail_products.store_id and s.owner_user_id=(select auth.uid())));

CREATE POLICY retail_barcodes_read ON public.retail_barcodes FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager','cashier']));
CREATE POLICY retail_barcodes_add ON public.retail_barcodes FOR INSERT TO authenticated
 WITH CHECK(exists(select 1 from public.retail_stores s where s.id=retail_barcodes.store_id and s.owner_user_id=(select auth.uid())));

CREATE POLICY retail_customers_read ON public.retail_customers FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager']));
CREATE POLICY retail_customers_add ON public.retail_customers FOR INSERT TO authenticated
 WITH CHECK(exists(select 1 from public.retail_stores s where s.id=retail_customers.store_id and s.owner_user_id=(select auth.uid())));
CREATE POLICY retail_customers_change ON public.retail_customers FOR UPDATE TO authenticated
 USING(exists(select 1 from public.retail_stores s where s.id=retail_customers.store_id and s.owner_user_id=(select auth.uid())))
 WITH CHECK(exists(select 1 from public.retail_stores s where s.id=retail_customers.store_id and s.owner_user_id=(select auth.uid())));

CREATE POLICY retail_stock_balances_read ON public.retail_stock_balances FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager','cashier']));
CREATE POLICY retail_cash_sessions_read ON public.retail_cash_sessions FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager'])
    OR (cashier_id=(select auth.uid()) AND retail_internal.has_role(store_id,array['cashier'])));
CREATE POLICY retail_cash_movements_read ON public.retail_cash_movements FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager'])
    OR (actor_id=(select auth.uid()) AND retail_internal.has_role(store_id,array['cashier'])));
CREATE POLICY retail_sales_read ON public.retail_sales FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager','cashier']));
CREATE POLICY retail_sale_items_read ON public.retail_sale_items FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager','cashier']));
CREATE POLICY retail_stock_events_read ON public.retail_stock_events FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager','cashier']));
CREATE POLICY retail_receipt_counters_read ON public.retail_receipt_counters FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager','cashier']));
CREATE POLICY retail_audit_events_read ON public.retail_audit_events FOR SELECT TO authenticated
 USING(retail_internal.has_role(store_id,array['manager']));

-- Production-mirrored grants: reads by active members and owner through RLS.
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE ON public.retail_stores,
 public.retail_products,public.retail_barcodes,public.retail_customers TO authenticated;
-- Owner-created stores/products need an actual GRANT; RLS then restricts rows.
-- These remaining tables only allow writes via privileged controlled RPCs.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.retail_memberships,
 public.retail_stock_balances,public.retail_cash_sessions,public.retail_cash_movements,
 public.retail_sales,public.retail_sale_items,public.retail_stock_events,
 public.retail_receipt_counters,public.retail_audit_events FROM authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
-- Explicitly preserve the concerning TRUNCATE grant to demonstrate the hosted
-- authorization gap in the disposable database; never apply this script to prod.


-- QA-only request identity diagnostic; exists solely on local disposable stack.
CREATE FUNCTION public.retail_v12_auth_context()
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO ''
AS $$
 SELECT jsonb_build_object(
  'sub', (select auth.uid()),
  'db_role', current_user,
  'jwt_role', current_setting('request.jwt.claim.role',true),
  'jwt_sub', current_setting('request.jwt.claim.sub',true)
 );
$$;
REVOKE ALL ON FUNCTION public.retail_v12_auth_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retail_v12_auth_context() TO authenticated;
