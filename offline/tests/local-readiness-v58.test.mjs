import test from "node:test";
import assert from "node:assert/strict";
import {checkV58Config,auditLocalPgV58,runV58Preflight,
        V58_TABLES,V58_FUNCTIONS} from "../local-readiness-v58.mjs";
const store="10000000-0000-0000-0000-000000000058";
const env={
 ZHIROX_V58_ISOLATED_PREFLIGHT:"true",
 ZHIROX_V58_SYNTHETIC_TEST_ONLY:"true",
 ZHIROX_V58_STORE_ID:store,
 ZHIROX_V58_LOCAL_DB_URL:
  "postgresql://zhirox_v58_auditor:localtestpassword@127.0.0.1:5432/zhirox_v58_disposable"
};
function fake({privileged=false,missing=null,storeName="V58 DISPOSABLE TEST SHOP",fault=false}={}){
 const calls=[];let release=0;
 return {
  calls,get released(){return release;},
  async connect(){
   return {release(){release++;},async query(sql,args=[]){
    calls.push({sql,args});
    if(fault&&sql.includes("pg_roles"))throw Error("query_broken");
    if(sql==="BEGIN READ ONLY"||sql==="ROLLBACK")return {rows:[]};
    if(sql.includes("server_version_num"))
      return {rows:[{version:160008,db_role:"zhirox_v58_auditor"}]};
    if(sql.includes("FROM pg_roles"))
      return {rows:[{rolsuper:privileged,rolcreaterole:false,rolcreatedb:false,
        rolreplication:false,rolbypassrls:false}]};
    if(sql.includes("to_regclass"))
      return {rows:V58_TABLES.map(name=>({name,present:name!==missing}))};
    if(sql.includes("to_regprocedure"))
      return {rows:V58_FUNCTIONS.map(spec=>({spec,present:spec!==missing}))};
    if(sql.includes("zhirox_local.stores"))
      return {rows:storeName?[{name:storeName}]:[]};
    if(sql.includes("event_outbox"))
      return {rows:[{pending:1}]};
    throw Error("not_allowlisted_sql");
   }};
  }
 };
}
test("V58 refuses production databases, elevated identities or unapproved launch",()=>{
 assert.equal(checkV58Config(env).storeId,store);
 const changes=[
  {ZHIROX_V58_ISOLATED_PREFLIGHT:"false"},
  {ZHIROX_V58_SYNTHETIC_TEST_ONLY:"false"},
  {ZHIROX_RELEASE_MODE:"official"},
  {ZHIROX_V58_STORE_ID:"invalid-uuid"},
  {ZHIROX_V58_LOCAL_DB_URL:"postgresql://u:p@prod.supabase.co/production"},
  {ZHIROX_V58_LOCAL_DB_URL:"postgresql://postgres:p@127.0.0.1/zhirox_v58_test"},
  {ZHIROX_V58_LOCAL_DB_URL:"postgresql://u:p@127.0.0.1/market"},
  {ZHIROX_V58_LOCAL_DB_URL:"postgresql://u:p@192.168.1.3/zhirox_v58_trial"},
  {ZHIROX_V58_LOCAL_DB_URL:"postgresql://u:p@127.0.0.1/zhirox_v58_test?sslmode=disable"},
  {ZHIROX_V58_LOCAL_DB_URL:"postgresql://u:p@127.0.0.1/zhirox_v58_test?connect_timeout=0"}
 ];
 for(const change of changes)assert.throws(()=>checkV58Config({...env,...change}));
});
test("V58 audit verifies required schema/functions and tests synthetic store without mutating DB",async()=>{
 const pool=fake();
 const result=await auditLocalPgV58({pool,storeId:store});
 assert.equal(result.passed,true);
 assert.equal(result.release_status,"NO_GO");
 assert.equal(result.ready_for_production,false);
 assert.equal(result.checks.length,2+V58_TABLES.length+V58_FUNCTIONS.length+2);
 assert.equal(pool.released,1);
 assert.equal(pool.calls[0].sql,"BEGIN READ ONLY");
 assert.equal(pool.calls.at(-1).sql,"ROLLBACK");
 assert.deepEqual(pool.calls.find(c=>c.sql.includes("zhirox_local.stores")).args,[store]);
 assert.ok(pool.calls.every(c=>/^\s*(SELECT|BEGIN READ ONLY|ROLLBACK)/.test(c.sql)));
 assert.ok(!JSON.stringify(result).includes("localtestpassword"));
});
test("V58 returns NO-GO on missing migrations, superuser, real store or DB query fault",async()=>{
 for(const config of [
  {missing:"receipt_snapshots_v34"},
  {missing:V58_FUNCTIONS[0]},
  {privileged:true},
  {storeName:"SUPERMARKET REAL SHOP"},
  {fault:true}
 ]){
  const pool=fake(config);
  const result=await auditLocalPgV58({pool,storeId:store});
  assert.equal(result.passed,false);
  assert.equal(result.release_status,"NO_GO");
  assert.equal(pool.calls.at(-1).sql,"ROLLBACK");
  assert.equal(pool.released,1);
 }
});
test("V58 entrypoint runs only against an explicitly supplied test pool",async()=>{
 const pool=fake();
 const result=await runV58Preflight({env,poolOverride:pool});
 assert.equal(result.passed,true);
 assert.equal(result.ready_for_production,false);
});
