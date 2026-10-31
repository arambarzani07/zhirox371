-- ZHIROX V78: register 48 dedicated UI sections and per-store configurable
-- settings in an ISOLATED LOCAL PostgreSQL TEST database.
-- NEVER auto-apply to live stores, Supabase, or legacy SQL Server.
-- Prerequisites: 001_core.sql, 003_local_users.sql. No financial tables changed.
BEGIN;
CREATE TABLE zhirox_local.section_registry_v78(
  section_id text PRIMARY KEY CHECK(section_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  module_id smallint NOT NULL CHECK(module_id BETWEEN 0 AND 11),
  slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 4),
  module_title text NOT NULL,
  title text NOT NULL,
  ui_state text NOT NULL CHECK(ui_state IN ('demo_ui','read_only_demo','planned')),
  UNIQUE(module_id,slot)
);
INSERT INTO zhirox_local.section_registry_v78(module_id,slot,section_id,module_title,title,ui_state)
VALUES
  (0,1,'barcode-scan','کاشێر و فرۆشتن','فرۆشتنی نوێ','demo_ui'),
  (0,2,'receipt','کاشێر و فرۆشتن','پسووڵەکان','demo_ui'),
  (0,3,'payment-notes','کاشێر و فرۆشتن','پارەدان','read_only_demo'),
  (0,4,'return-arrow','کاشێر و فرۆشتن','گەڕاندنەوە','planned'),
  (1,1,'add-box','کاڵاکان','کاڵای نوێ','demo_ui'),
  (1,2,'product-list','کاڵاکان','لیستی کاڵاکان','demo_ui'),
  (1,3,'price-tags','کاڵاکان','نرخەکان','demo_ui'),
  (1,4,'barcode-bars','کاڵاکان','بارکۆدەکان','demo_ui'),
  (2,1,'stock-stack','کۆگا','دۆخی کۆگا','demo_ui'),
  (2,2,'low-stock','کۆگا','کاڵای کەم','demo_ui'),
  (2,3,'expiry','کۆگا','بەسەرچوون','demo_ui'),
  (2,4,'stock-transfer','کۆگا','هاتووچۆ','demo_ui'),
  (3,1,'single-customer','کڕیاران و حسابەکان','کڕیاران','demo_ui'),
  (3,2,'debt-book','کڕیاران و حسابەکان','قەرزەکان','demo_ui'),
  (3,3,'purchase-history','کڕیاران و حسابەکان','مێژووی کڕین','read_only_demo'),
  (3,4,'customer-repayment','کڕیاران و حسابەکان','پارەدانەکان','read_only_demo'),
  (4,1,'purchase-order','کڕین و دابینکەران','داواکاری','planned'),
  (4,2,'supplier-building','کڕین و دابینکەران','دابینکەران','demo_ui'),
  (4,3,'receive-goods','کڕین و دابینکەران','وەرگرتنی کاڵا','demo_ui'),
  (4,4,'supplier-accounts','کڕین و دابینکەران','حسابەکان','read_only_demo'),
  (5,1,'cash-drawer','دارایی','سندووق','demo_ui'),
  (5,2,'income-rise','دارایی','داهات','read_only_demo'),
  (5,3,'expense-fall','دارایی','خەرجی','demo_ui'),
  (5,4,'cash-movements','دارایی','جووڵەی پارە','read_only_demo'),
  (6,1,'sales-trend','ڕاپۆرت و شیکاری','فرۆشتن','read_only_demo'),
  (6,2,'profit-chart','ڕاپۆرت و شیکاری','قازانج','planned'),
  (6,3,'stock-chart','ڕاپۆرت و شیکاری','ڕاپۆرتی کۆگا','read_only_demo'),
  (6,4,'ai-insights','ڕاپۆرت و شیکاری','شیکاریی زیرەک','planned'),
  (7,1,'manage-users','ڕێکخستنەکان','بەکارهێنەران','planned'),
  (7,2,'access-key','ڕێکخستنەکان','دەسەڵاتەکان','planned'),
  (7,3,'connected-devices','ڕێکخستنەکان','ئامێرەکان','demo_ui'),
  (7,4,'system-controls','ڕێکخستنەکان','سیستەم','planned'),
  (8,1,'new-offer','ئافەر و داشکاندن','ئافەری نوێ','planned'),
  (8,2,'discount-percent','ئافەر و داشکاندن','داشکاندن','planned'),
  (8,3,'coupon-ticket','ئافەر و داشکاندن','کوپۆن','planned'),
  (8,4,'promotion-speaker','ئافەر و داشکاندن','کەمپەین','planned'),
  (9,1,'price-label','لیبڵ و چاپکردن','لیبڵی نرخ','demo_ui'),
  (9,2,'label-barcode','لیبڵ و چاپکردن','بارکۆد','read_only_demo'),
  (9,3,'batch-print','لیبڵ و چاپکردن','چاپی کۆمەڵەیی','demo_ui'),
  (9,4,'print-template','لیبڵ و چاپکردن','قاڵبی چاپ','planned'),
  (10,1,'shift-clock','شێفت و کارمەندان','شێفتەکان','read_only_demo'),
  (10,2,'attendance','شێفت و کارمەندان','ئامادەبوون','planned'),
  (10,3,'work-timer','شێفت و کارمەندان','کاتی کار','planned'),
  (10,4,'staff-review','شێفت و کارمەندان','هەڵسەنگاندن','planned'),
  (11,1,'alert-bell','چاودێری و مۆڵەتەکان','ئاگادارییەکان','read_only_demo'),
  (11,2,'approval-file','چاودێری و مۆڵەتەکان','داوای مۆڵەت','planned'),
  (11,3,'change-history','چاودێری و مۆڵەتەکان','گۆڕانکارییەکان','read_only_demo'),
  (11,4,'transaction-check','چاودێری و مۆڵەتەکان','پشکنینی مامەڵە','demo_ui');
CREATE TABLE zhirox_local.section_settings_v78(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 section_id text NOT NULL REFERENCES zhirox_local.section_registry_v78(section_id),
 setting_key text NOT NULL CHECK(setting_key ~ '^[a-z][a-z0-9_]{1,63}$'),
 value_json jsonb NOT NULL CHECK(octet_length(value_json::text) <= 16384),
 version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,section_id,setting_key),
 FOREIGN KEY(store_id,updated_by) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE TABLE zhirox_local.section_settings_audit_v78(
 store_id uuid NOT NULL REFERENCES zhirox_local.stores(id),
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 section_id text NOT NULL REFERENCES zhirox_local.section_registry_v78(section_id),
 setting_key text NOT NULL,
 actor_id uuid NOT NULL,
 previous_json jsonb,
 current_json jsonb NOT NULL,
 version bigint NOT NULL CHECK(version > 0),
 changed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(store_id,actor_id) REFERENCES zhirox_local.local_users(store_id,id)
);
CREATE INDEX section_settings_audit_v78_store_recent ON
 zhirox_local.section_settings_audit_v78(store_id,section_id,changed_at DESC);
CREATE FUNCTION zhirox_local.audit_section_setting_v78()
RETURNS trigger LANGUAGE plpgsql AS $audit$
BEGIN
 INSERT INTO zhirox_local.section_settings_audit_v78
  (store_id,section_id,setting_key,actor_id,previous_json,current_json,version)
 VALUES(NEW.store_id,NEW.section_id,NEW.setting_key,NEW.updated_by,
  CASE WHEN TG_OP='UPDATE' THEN OLD.value_json ELSE NULL END,
  NEW.value_json,NEW.version);
 RETURN NEW;
END $audit$;
CREATE TRIGGER section_setting_audit_v78
 AFTER INSERT OR UPDATE ON zhirox_local.section_settings_v78
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.audit_section_setting_v78();
CREATE FUNCTION zhirox_local.deny_section_audit_mutation_v78()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
 RAISE EXCEPTION 'immutable section audit' USING ERRCODE='P7804';
END $guard$;
CREATE TRIGGER section_audit_immutable_v78
 BEFORE UPDATE OR DELETE ON zhirox_local.section_settings_audit_v78
 FOR EACH ROW EXECUTE FUNCTION zhirox_local.deny_section_audit_mutation_v78();

-- SECURITY INVOKER: callable only by a trusted server-side DB owner/role.
-- NEVER grant to browser, public, or untrusted cashier SQL accounts.
-- p_actor must originate from a verified local session on the API layer;
-- a caller-provided UUID is NOT authentication.
CREATE FUNCTION zhirox_local.save_section_setting_v78(
 p_store uuid,p_actor uuid,p_section text,p_key text,p_value jsonb,p_expected_version bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,zhirox_local AS $save$
DECLARE v_current bigint; v_next bigint;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM zhirox_local.local_users
  WHERE store_id=p_store AND id=p_actor AND enabled
  AND role IN('owner','manager') AND (locked_until IS NULL OR locked_until<now())
 ) THEN
  RAISE EXCEPTION 'manager permission required' USING ERRCODE='P7801';
 END IF;
 IF p_value IS NULL OR octet_length(p_value::text)>16384
   OR p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_]{1,63}$' THEN
  RAISE EXCEPTION 'invalid setting' USING ERRCODE='P7802';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM zhirox_local.section_registry_v78 WHERE section_id=p_section)
 THEN RAISE EXCEPTION 'unknown section' USING ERRCODE='P7802'; END IF;
 SELECT version INTO v_current FROM zhirox_local.section_settings_v78
   WHERE store_id=p_store AND section_id=p_section AND setting_key=p_key FOR UPDATE;
 IF v_current IS NULL THEN
  IF p_expected_version<>0 THEN
   RAISE EXCEPTION 'stale setting version' USING ERRCODE='P7803';
  END IF;
  INSERT INTO zhirox_local.section_settings_v78
  (store_id,section_id,setting_key,value_json,updated_by)
  VALUES(p_store,p_section,p_key,p_value,p_actor);
  v_next:=1;
 ELSE
  IF p_expected_version IS DISTINCT FROM v_current THEN
   RAISE EXCEPTION 'stale setting version' USING ERRCODE='P7803';
  END IF;
  UPDATE zhirox_local.section_settings_v78 SET
   value_json=p_value,updated_by=p_actor,updated_at=now(),version=version+1
  WHERE store_id=p_store AND section_id=p_section AND setting_key=p_key
  RETURNING version INTO v_next;
 END IF;
 RETURN v_next;
END $save$;
REVOKE ALL ON TABLE zhirox_local.section_registry_v78,
 zhirox_local.section_settings_v78,
 zhirox_local.section_settings_audit_v78 FROM PUBLIC;
REVOKE ALL ON SEQUENCE zhirox_local.section_settings_audit_v78_audit_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.save_section_setting_v78(uuid,uuid,text,text,jsonb,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.audit_section_setting_v78() FROM PUBLIC;
REVOKE ALL ON FUNCTION zhirox_local.deny_section_audit_mutation_v78() FROM PUBLIC;
COMMENT ON TABLE zhirox_local.section_registry_v78 IS 'UI capability registry. State denotes demo/read-only/unimplemented, NOT deployed production functionality.';
COMMENT ON TABLE zhirox_local.section_settings_v78 IS 'Per-store/per-section settings only. No cashier financial state, debts or inventory balances stored here.';
COMMIT;
