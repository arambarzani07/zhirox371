// V58: READ-ONLY readiness of an isolated local PostgreSQL trial.
// Never migrates, inserts, updates, starts a cashier or activates sales.
// No Cloud URLs or production credentials; NO-GO even when checks PASS.
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {validId} from "./sync-wire-v27.mjs";

export const V58_TABLES=Object.freeze([
 "stores","products","barcodes","sales","sale_lines","stock_ledger",
 "event_outbox","receipt_counters","local_users","checkout_intents_v31",
 "receipt_snapshots_v34","print_requests_v35","cash_shifts_v37",
 "cash_movements_v38"
]);
export const V58_FUNCTIONS=Object.freeze([
 "zhirox_local.commit_checkout_v31(uuid,uuid,uuid)",
 "zhirox_local.prepare_checkout_v31(uuid,uuid,uuid,jsonb,bigint)",
 "zhirox_local.cancel_checkout_v31(uuid,uuid,uuid)",
 "zhirox_local.claim_outbox_v27(uuid,integer,integer)",
 "zhirox_local.ack_outbox_v27(uuid,uuid,uuid)",
 "zhirox_local.open_cash_shift_v37(uuid,uuid,uuid,bigint)"
]);
export function checkV58Config(env){
 if(!env||env.ZHIROX_V58_ISOLATED_PREFLIGHT!=="true"||
    env.ZHIROX_V58_SYNTHETIC_TEST_ONLY!=="true"||
    env.ZHIROX_RELEASE_MODE==="official")
   throw Error("v58_test_only_not_approved");
 const storeId=env.ZHIROX_V58_STORE_ID,raw=env.ZHIROX_V58_LOCAL_DB_URL;
 if(!validId(storeId)||typeof raw!=="string")throw Error("v58_invalid_store_or_db");
 let u;
 try{u=new URL(raw);}catch{throw Error("v58_invalid_db_url");}
 const loopback=["127.0.0.1","localhost","[::1]"].includes(u.hostname);
 if(!loopback||!["postgres:","postgresql:"].includes(u.protocol)||
    !/^\/zhirox_v58_[a-z0-9_]*(?:test|trial|disposable)$/i.test(u.pathname)||
    !u.username||!u.password||u.hash||u.searchParams.has("sslmode")&&
      u.searchParams.get("sslmode")==="disable"||
    ["postgres","supabase_admin","root","service_role"].includes(decodeURIComponent(u.username).toLowerCase()))
   throw Error("v58_requires_disposable_loopback_pg");
 for(const key of u.searchParams.keys()){
   if(!["sslmode","sslrootcert","application_name"].includes(key))throw Error("v58_forbidden_db_param");
 }
 return Object.freeze({storeId,dbUrl:raw});
}
export async function auditLocalPgV58({pool,storeId}){
 if(!pool||typeof pool.connect!=="function"||!validId(storeId))
  throw Error("v58_invalid_audit_input");
 const client=await pool.connect();
 const checks=[],fail=(code)=>{checks.push({check:code,ok:false});};
 let started=false;
 try{
  await client.query("BEGIN READ ONLY");
  started=true;
  const version=await client.query(
   "SELECT current_setting('server_version_num')::integer AS version, current_user AS db_role");
  const meta=version.rows[0]||{};
  const versionOkay=Number(meta.version)>=160000;
  checks.push({check:"postgres_16_plus",ok:versionOkay});
  // A bootstrap superuser/owner is never a safe runtime cashier DB identity.
  const roles=await client.query(
    "SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user");
  const r=roles.rows[0]||{};
  const leastPrivilege=[r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls]
    .every(v=>v===false);
  checks.push({check:"runtime_role_not_privileged",ok:leastPrivilege});
  const tables=await client.query(
   "SELECT t.name, to_regclass('zhirox_local.'||t.name) IS NOT NULL AS present FROM unnest($1::text[]) AS t(name)",
   [V58_TABLES]
  );
  // Unnest from the FROM clause to avoid invalid set-returning function nesting.
  const found=new Set(tables.rows.filter(x=>x.present===true).map(x=>x.name));
  for(const name of V58_TABLES){
    checks.push({check:"table_"+name,ok:found.has(name)});
  }
  const funcs=await client.query(
    "SELECT f.spec, to_regprocedure(f.spec) IS NOT NULL AS present FROM unnest($1::text[]) AS f(spec)",
    [V58_FUNCTIONS]
  );
  const present=new Set(funcs.rows.filter(x=>x.present===true).map(x=>x.spec));
  for(const spec of V58_FUNCTIONS){
    checks.push({check:"function_"+spec,ok:present.has(spec)});
  }
  const store=await client.query(
    "SELECT name FROM zhirox_local.stores WHERE id=$1::uuid LIMIT 1",[storeId]);
  // Never accept a real store as the disposable test fixture.
  checks.push({check:"synthetic_store_scope",ok:store.rows.length===1&&
    /(?:TEST|TRIAL|DISPOSABLE|STAGING|تاقیکردنەوە)/i.test(store.rows[0].name)});
  const outbox=await client.query(
    "SELECT count(*)::integer AS pending FROM zhirox_local.event_outbox WHERE store_id=$1::uuid AND delivered_at IS NULL",
    [storeId]);
  const value=Number(outbox.rows[0]?.pending);
  checks.push({check:"outbox_readable",ok:Number.isSafeInteger(value)&&value>=0});
 }catch{
  fail("postgres_audit_query_failed");
 }finally{
  if(started){try{await client.query("ROLLBACK");}catch{fail("read_only_rollback_failed");}}
  client.release();
 }
 return Object.freeze({
  mode:"V58_DISPOSABLE_LOCAL_PREFLIGHT",release_status:"NO_GO",
  ready_for_production:false,passed:checks.length>0&&checks.every(c=>c.ok),
  checks
 });
}
export async function runV58Preflight({env=process.env,poolOverride=null}={}){
 const cfg=checkV58Config(env);
 const own=!poolOverride;
 const pool=poolOverride||new (await import("pg")).Pool({
  connectionString:cfg.dbUrl,max:1,connectionTimeoutMillis:2000,
  application_name:"zhirox_v58_read_only_test_preflight"
 });
 try{return await auditLocalPgV58({pool,storeId:cfg.storeId});}
 finally{if(own)await pool.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runV58Preflight().then(v=>{
   // Only test-stage operational findings; never log URL or secrets.
   console.log(JSON.stringify(v));
   if(!v.passed)process.exitCode=2;
 }).catch(()=>{
   console.error("v58_read_only_preflight_refused_or_failed");
   process.exitCode=2;
 });
}
