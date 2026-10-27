-- Immutable unit snapshot for accurate 3-decimal kilogram receipts.
ALTER TABLE public.retail_sale_items ADD COLUMN IF NOT EXISTS base_unit_snapshot text NOT NULL DEFAULT 'unit';
DO $constraint$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
   WHERE conrelid='public.retail_sale_items'::regclass AND conname='retail_sale_items_base_unit_snapshot_check') THEN
   ALTER TABLE public.retail_sale_items
     ADD CONSTRAINT retail_sale_items_base_unit_snapshot_check
     CHECK (base_unit_snapshot IN ('unit','kg'));
 END IF;
END $constraint$;
-- Preserve the v19 checkout logic, inserting an immutable line unit snapshot.
DO $patch$
DECLARE v_ddl text;
 v_old text:='(store_id,sale_id,product_id,quantity,unit_price_minor,product_name_snapshot)';
 v_old_vals text:='VALUES(p_store,v_sale,v_row.product_id,v_base_units,v_price,v_row.name);';
BEGIN
 v_ddl:=pg_get_functiondef('retail_internal.checkout_weight_v19(uuid,uuid,jsonb,bigint,bigint)'::regprocedure);
 IF position(v_old IN v_ddl)=0 OR position(v_old_vals IN v_ddl)=0 THEN
   RAISE EXCEPTION 'Checkout source changed: refusing incomplete receipt migration'; END IF;
 v_ddl:=replace(v_ddl,v_old,
   '(store_id,sale_id,product_id,quantity,unit_price_minor,product_name_snapshot,base_unit_snapshot)');
 v_ddl:=replace(v_ddl,v_old_vals,
   'VALUES(p_store,v_sale,v_row.product_id,v_base_units,v_price,v_row.name,CASE WHEN v_scale THEN ''kg'' ELSE ''unit'' END);');
 EXECUTE v_ddl;
END $patch$;
NOTIFY pgrst,'reload schema';