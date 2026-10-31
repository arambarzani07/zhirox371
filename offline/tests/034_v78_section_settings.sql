-- V78 transactional acceptance, disposable local PostgreSQL only.
BEGIN;
DO $test$
DECLARE
  store_a uuid:='10000000-0000-0000-0000-000000000078';
  store_b uuid:='10000000-0000-0000-0000-000000000079';
  owner_id uuid:='20000000-0000-0000-0000-000000000078';
  cashier_id uuid:='20000000-0000-0000-0000-000000000079';
  n bigint;
  blocked boolean;
BEGIN
 IF (SELECT count(*) FROM zhirox_local.section_registry_v78)<>48 OR
    (SELECT count(DISTINCT module_id) FROM zhirox_local.section_registry_v78)<>12 OR
    EXISTS(SELECT 1 FROM zhirox_local.section_registry_v78 GROUP BY module_id HAVING count(*)<>4)
 THEN RAISE EXCEPTION '48 unique sections across 12 groups required'; END IF;
 INSERT INTO zhirox_local.stores(id,name)
 VALUES(store_a,'V78 disposable A'),(store_b,'V78 disposable B');
 INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role,enabled)
 VALUES(store_a,owner_id,'v78-manager-a','test-only','manager',true),
       (store_a,cashier_id,'v78-cashier','test-only','cashier',true),
       (store_b,owner_id,'v78-manager-b','test-only','manager',true);

 n:=zhirox_local.save_section_setting_v78(store_a,owner_id,'product-list','page_size','25'::jsonb,0);
 IF n<>1 THEN RAISE EXCEPTION 'initial version wrong'; END IF;
 n:=zhirox_local.save_section_setting_v78(store_a,owner_id,'product-list','page_size','50'::jsonb,1);
 IF n<>2 THEN RAISE EXCEPTION 'update version wrong'; END IF;
 n:=zhirox_local.save_section_setting_v78(store_b,owner_id,'product-list','page_size','100'::jsonb,0);
 IF n<>1 THEN RAISE EXCEPTION 'store B should start independent version'; END IF;
 IF (SELECT value_json FROM zhirox_local.section_settings_v78
   WHERE store_id=store_a AND section_id='product-list' AND setting_key='page_size')<>'50'::jsonb
   OR (SELECT value_json FROM zhirox_local.section_settings_v78
   WHERE store_id=store_b AND section_id='product-list' AND setting_key='page_size')<>'100'::jsonb
 THEN RAISE EXCEPTION 'store isolation failed'; END IF;
 IF (SELECT count(*) FROM zhirox_local.section_settings_audit_v78
     WHERE store_id=store_a AND section_id='product-list')<>2
 THEN RAISE EXCEPTION 'audited mutations missing'; END IF;
 blocked:=false;
 BEGIN
  PERFORM zhirox_local.save_section_setting_v78(store_a,cashier_id,'product-list','page_size','10'::jsonb,2);
 EXCEPTION WHEN SQLSTATE 'P7801' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'cashier overwrote manager-only section settings'; END IF;
 blocked:=false;
 BEGIN
  PERFORM zhirox_local.save_section_setting_v78(store_a,owner_id,'product-list','page_size','10'::jsonb,1);
 EXCEPTION WHEN SQLSTATE 'P7803' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'stale writer overwrote a concurrent version'; END IF;
 blocked:=false;
 BEGIN
  PERFORM zhirox_local.save_section_setting_v78(store_a,owner_id,'not-a-real-section','page_size','10'::jsonb,0);
 EXCEPTION WHEN SQLSTATE 'P7802' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'invalid section ID accepted'; END IF;
 blocked:=false;
 BEGIN
  PERFORM zhirox_local.save_section_setting_v78(store_a,owner_id,'product-list','illegal.key','10'::jsonb,0);
 EXCEPTION WHEN SQLSTATE 'P7802' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'invalid setting key accepted'; END IF;
 blocked:=false;
 BEGIN
  UPDATE zhirox_local.section_settings_audit_v78 SET version=101
  WHERE store_id=store_a;
 EXCEPTION WHEN SQLSTATE 'P7804' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'audited history can be rewritten'; END IF;
 blocked:=false;
 BEGIN
  DELETE FROM zhirox_local.section_settings_audit_v78 WHERE store_id=store_a;
 EXCEPTION WHEN SQLSTATE 'P7804' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'audited history can be deleted'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants
 WHERE grantee='PUBLIC' AND table_schema='zhirox_local'
 AND table_name='section_settings_v78')
 THEN RAISE EXCEPTION 'public has access to section settings'; END IF;
END $test$;
ROLLBACK;
