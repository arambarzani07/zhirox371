-- Fail closed: the legacy integer-only checkout must NEVER interpret 1 kg as 1 piece.
DO $guard$
DECLARE
 v_ddl text; v_old text;
BEGIN
 v_ddl:=pg_get_functiondef('retail_internal.checkout_cash(uuid,uuid,jsonb,bigint)'::regprocedure);
 v_old:='if not found or not v_active or v_currency<>''IQD'' then';
 IF position(v_old IN v_ddl)=0 THEN RAISE EXCEPTION 'Unexpected legacy checkout structure; refuse unsafe patch'; END IF;
 IF position('Weighted product requires kg checkout' IN v_ddl)=0 THEN
   v_ddl:=replace(v_ddl,v_old,
     'if exists (select 1 from public.retail_products
       where store_id=p_store and id=v_product and base_unit=''kg'') then
       raise exception ''Weighted product requires kg checkout'' using errcode=''22023'';
     end if;
     ' || v_old);
   EXECUTE v_ddl;
 END IF;
END $guard$;