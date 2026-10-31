import test from "node:test";
import assert from "node:assert/strict";
import {checkV56StagingConfiguration,startV56StagingAutoSync} from "../staging-autosync-v56.mjs";
import {verifyEventSignature} from "../sync-wire-v27.mjs";

const store="10000000-0000-0000-0000-000000000056";
const event="20000000-0000-0000-0000-000000000056";
const sale="30000000-0000-0000-0000-000000000056";
const lease="40000000-0000-0000-0000-000000000056";
const secret="v56-isolated-nonproduction-secret-".repeat(3);
const env={
 ZHIROX_V56_STAGING_AUTOSYNC_ENABLED:"true",
 ZHIROX_V56_ISOLATED_TEST_DATA:"true",
 ZHIROX_V56_STORE_ID:store,
 ZHIROX_V56_HMAC_SECRET:secret,
 ZHIROX_V56_EXPECTED_STAGING_HOST:"sync-staging.example.org",
 ZHIROX_V56_STAGING_RECEIVER_URL:"https://sync-staging.example.org/v27/events",
 ZHIROX_V56_LOCAL_DISPOSABLE_DB_URL:"postgresql://v56_test_user:localtestpassword@127.0.0.1:5432/zhirox_v56_disposable"
};
const row={
 store_id:store,event_id:event,aggregate_id:sale,event_type:"sale.completed",
 payload:{sale_id:sale,receipt_no:56,total_minor:22000},
 created_at:"2026-10-30T20:30:00.000Z",lease_token:lease,attempt_count:1
};
function stubPool(){
 let pending=true,acked=0,failed=0;
 const queries=[];
 return {
   get state(){return {pending,acked,failed,queries};},
   async query(sql,args){
     queries.push(sql);
     if(sql.includes("claim_outbox_v27"))return {rows:pending?[row]:[]};
     if(sql.includes("ack_outbox_v27")){
       assert.deepEqual(args,[store,event,lease]);
       acked++;pending=false;return {rows:[{ok:true}]};
     }
     if(sql.includes("fail_outbox_v27")){
       assert.deepEqual(args.slice(0,3),[store,event,lease]);
       failed++;return {rows:[{ok:true}]};
     }
     throw Error("unexpected_sql");
   }
 };
}
test("V56 requires deliberate STAGING opt-in and never permits official mode or production data",()=>{
 const result=checkV56StagingConfiguration(env);
 assert.equal(result.storeId,store);
 assert.equal(result.receiverUrl,"https://sync-staging.example.org/v27/events");
 for(const change of [
   {ZHIROX_V56_STAGING_AUTOSYNC_ENABLED:"false"},
   {ZHIROX_V56_ISOLATED_TEST_DATA:"false"},
   {ZHIROX_RELEASE_MODE:"official"},
   {ZHIROX_V27_TEST_MODE:"true"},
   {ZHIROX_V56_STORE_ID:"bad"},
   {ZHIROX_V56_HMAC_SECRET:"short"},
   {ZHIROX_V56_STAGING_RECEIVER_URL:"http://sync-staging.example.org/v27/events"},
   {ZHIROX_V56_STAGING_RECEIVER_URL:"https://192.168.1.3/v27/events"},
   {ZHIROX_V56_STAGING_RECEIVER_URL:"https://sync-staging.example.org:8443/v27/events"},
   {ZHIROX_V56_STAGING_RECEIVER_URL:"https://sync-staging.example.org/v27/events?debug=true"},
   {ZHIROX_V56_STAGING_RECEIVER_URL:"https://sync-production.example.org/v27/events"},
   {ZHIROX_V56_EXPECTED_STAGING_HOST:"wrong.example.org"},
   {ZHIROX_V56_LOCAL_DISPOSABLE_DB_URL:"postgresql://cashier:secret@127.0.0.1:5432/market"},
   {ZHIROX_V56_LOCAL_DISPOSABLE_DB_URL:"postgresql://postgres:secret@127.0.0.1:5432/zhirox_v56_test"},
   {ZHIROX_V56_LOCAL_DISPOSABLE_DB_URL:"postgresql://cashier:secret@prod.supabase.co:5432/zhirox_v56_test"},
   {ZHIROX_V56_LOCAL_DISPOSABLE_DB_URL:"postgresql://cashier:secret@192.168.1.20:5432/zhirox_v56_test"},
   {ZHIROX_V56_LOCAL_DISPOSABLE_DB_URL:"postgresql://cashier:secret@192.168.1.20:5432/zhirox_v56_test?sslmode=disable"},
 ]){
   assert.throws(()=>checkV56StagingConfiguration({...env,...change}));
 }
 const lan=checkV56StagingConfiguration({...env,ZHIROX_V56_LOCAL_DISPOSABLE_DB_URL:
   "postgresql://trial_user:secret@192.168.1.20:5432/zhirox_v56_test?sslmode=verify-full"});
 assert.ok(lan.localDb.includes("verify-full"));
});
test("V56 WAN outage preserves local event, reconnect auto-retries signed HTTPS and ACKs exactly once",async()=>{
 const pool=stubPool(),ctrl=new AbortController(),statuses=[],requests=[];
 let attempt=0;
 const result=await startV56StagingAutoSync({
   env,poolOverride:pool,signal:ctrl.signal,pollMs:100,maxBackoffMs:300,
   wait:async()=>true,
   fetchImpl:async(url,opts)=>{
     requests.push({url,opts});
     attempt++;
     if(attempt===1)throw Error("WAN_disconnected");
     assert.equal(opts.method,"POST");
     assert.equal(opts.redirect,"error");
     assert.equal(opts.credentials,"omit");
     assert.equal(opts.cache,"no-store");
     assert.ok(verifyEventSignature(opts.body,secret,
       opts.headers["X-ZHIROX-Timestamp"],opts.headers["X-ZHIROX-Signature"]));
     const data=JSON.parse(opts.body);
     assert.equal(data.event_id,event);
     ctrl.abort();
     return {ok:true,json:async()=>({ok:true,accepted:true,store_id:store,event_id:event})};
   },
   onStatus:s=>statuses.push(s)
 });
 assert.equal(result.stopped,true);
 assert.equal(pool.state.failed,1);
 assert.equal(pool.state.acked,1);
 assert.equal(pool.state.pending,false);
 assert.equal(requests.length,2);
 assert.ok(requests.every(r=>r.url==="https://sync-staging.example.org/v27/events"));
 assert.ok(statuses.every(s=>s.release_status==="NO_GO"));
 assert.ok(!JSON.stringify(statuses).includes(secret));
});
test("V56 refuses invalid remote ACK even if HTTPS returns HTTP 200",async()=>{
 const ctrl=new AbortController(),pool=stubPool();
 let tries=0;
 await startV56StagingAutoSync({
   env,poolOverride:pool,signal:ctrl.signal,pollMs:100,
   wait:async()=>true,
   fetchImpl:async()=>{
     tries++;ctrl.abort();
     return {ok:true,json:async()=>({ok:true,accepted:true,
       store_id:store,event_id:"99999999-9999-4999-8999-999999999999"})};
   }
 });
 assert.equal(tries,1);
 assert.equal(pool.state.acked,0);
 assert.equal(pool.state.failed,1);
 assert.equal(pool.state.pending,true);
});
test("V56 aborted worker does not access local DB or HTTP",async()=>{
 const ctrl=new AbortController();ctrl.abort();
 let called=false;
 await startV56StagingAutoSync({
   env,signal:ctrl.signal,poolOverride:{query:()=>{called=true;}},
   fetchImpl:async()=>{called=true;},pollMs:100
 });
 assert.equal(called,false);
});
