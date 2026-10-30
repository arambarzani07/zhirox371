import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createCloudReceiverV29} from "../cloud-receiver-v29.mjs";
import {hashOwnerToken,parseV28Stores} from "../cloud-receiver-v28.mjs";
import {syncOutboxOnce} from "../outbox-sync-worker-v27.mjs";
import {auditV50LabParity,evaluateV50Evidence,checkV50AuditLabConfig} from "../cloud-readiness-v50.mjs";

const store="10000000-0000-0000-0000-000000000050";
const secret="v50_test_secret_".repeat(4),owner="v50_owner_token_".repeat(4);
const makeId=n=>"40000000-0000-0000-0000-"+String(n).padStart(12,"0");
const makeSale=n=>"20000000-0000-0000-0000-"+String(n).padStart(12,"0");
const makeLease=n=>"50000000-0000-0000-0000-"+String(n).padStart(12,"0");
function localMock(n=2){
 const events=Array.from({length:n},(_,i)=>{
   const id=i+1;
   return {store_id:store,event_id:makeId(id),aggregate_id:makeSale(id),
    event_type:"sale.completed",created_at:"2026-10-30T14:00:00.000Z",
    payload:{sale_id:makeSale(id),receipt_no:id,total_minor:1000*id},
    lease_token:makeLease(id),attempt_count:0,delivered:false};
 });
 let allowClaims=1;
 return {
   events,allow:n=>{allowClaims=n;},
   query:async(sql,args)=>{
     if(sql.includes("claim_outbox_v27"))return {rows:events.filter(e=>!e.delivered).slice(0,allowClaims)};
     if(sql.includes("ack_outbox_v27")){
       const e=events.find(e=>e.event_id===args[1]&&e.lease_token===args[2]&&!e.delivered);
       if(e)e.delivered=true;
       return {rows:[{ok:!!e}]};
     }
     if(sql.includes("fail_outbox_v27"))return {rows:[{ok:true}]};
     if(sql.includes("FROM zhirox_local.sales")&&sql.includes("count(*)::bigint AS count"))
       return {rows:[{count:String(n),last_receipt_no:String(n),total_minor:String(n*(n+1)*500)}]};
     if(sql.includes("FROM zhirox_local.event_outbox")&&sql.includes("count(*)::bigint AS pending"))
       return {rows:[{pending:String(events.filter(e=>!e.delivered).length)}]};
     if(sql.includes("FROM zhirox_local.event_outbox")&&sql.includes("event_id::text")){
       const [sid,after,limit]=args;
       return {rows:(sid===store?events:[]).filter(e=>!after||e.event_id>after)
         .slice(0,limit).map(e=>({event_id:e.event_id}))};
     }
     throw Error("unexpected_local_sql");
   }
 };
}
function cloudMock(){
 const saved=new Map();
 return {saved,query:async(sql,args)=>{
   if(sql.startsWith("INSERT INTO zhirox_cloud_v28.received_sales")){
     const [sid,eid,sale,receipt,total,hash,occurred]=args;
     if(saved.has(eid))return {rows:[]};
     saved.set(eid,{store_id:sid,event_id:eid,sale_id:sale,receipt_no:receipt,total_minor:total,
      event_hash:hash,occurred_at:occurred,received_at:new Date().toISOString()});
     return {rows:[{event_id:eid}]};
   }
   if(sql.startsWith("SELECT sale_id,receipt_no,total_minor,event_hash")){
     const row=saved.get(args[1]);return {rows:row?[row]:[]};
   }
   if(sql.includes("count(*)::bigint AS sales_count")){
     const rows=[...saved.values()].filter(x=>x.store_id===args[0]);
     return {rows:[{sales_count:String(rows.length),total_minor:String(rows.reduce((a,r)=>a+r.total_minor,0)),
      last_receipt_no:String(Math.max(0,...rows.map(x=>x.receipt_no))),last_received_at:null}]};
   }
   if(sql.includes("event_id::text")&&sql.includes("zhirox_cloud_v28.received_sales")){
     const [sid,after,limit]=args;
     return {rows:[...saved.values()].filter(x=>x.store_id===sid&&(!after||x.event_id>after))
       .sort((a,b)=>a.event_id.localeCompare(b.event_id)).slice(0,limit)
       .map(x=>({event_id:x.event_id}))};
   }
   throw Error("unexpected_cloud_sql");
 }};
}
async function withCloud(pool,fn){
 const stores=parseV28Stores([{store_id:store,sync_secret:secret,owner_token_hash:hashOwnerToken(owner)}]);
 const server=createServer(createCloudReceiverV29({pool,stores}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{return await fn("http://127.0.0.1:"+server.address().port+"/v27/events");}
 finally{await new Promise(ok=>server.close(ok));}
}
test("V50 physically exercises local outbox -> signed receiver -> event-ID reconciliation",async()=>{
 const local=localMock(),cloud=cloudMock();
 await withCloud(cloud,async receiverUrl=>{
   const audit=()=>auditV50LabParity({pool:local,storeId:store,receiverUrl,ownerToken:owner});
   local.allow(1);
   const result=await syncOutboxOnce({pool:local,storeId:store,receiverUrl,secret,testMode:true});
   assert.equal(result.acked,1);
   const first=await audit();
   assert.equal(first.sync_status,"PENDING_OR_MISSING");
   assert.equal(first.local_missing_cloud,1);
   assert.equal(first.release_status,"NO_GO");
   local.allow(2);
   const second=await syncOutboxOnce({pool:local,storeId:store,receiverUrl,secret,testMode:true});
   assert.equal(second.acked,1);
   const complete=await audit();
   assert.equal(complete.sync_status,"MATCHED_NON_ATOMIC_LAB_SNAPSHOT");
   assert.equal(complete.cloud_received_sales,2);
   assert.equal(complete.local_pending_events,0);
   assert.equal(complete.release_status,"NO_GO");
   // Successful receiver ACK doesn't authorize real checkout or online settlement.
   assert.equal(cloud.saved.size,2);
 });
});
test("V50 refuses external cloud and production PostgreSQL without opening a socket",()=>{
 const config={
   ZHIROX_V50_CLOUD_AUDIT_LAB_ENABLED:"true",ZHIROX_V29_TEST_MODE:"true",
   ZHIROX_V29_STORE_ID:store,ZHIROX_V29_OWNER_TOKEN:owner,
   ZHIROX_V29_RECEIVER_URL:"http://127.0.0.1:3419/v27/events",
   ZHIROX_LOCAL_DB_URL:"postgresql://demo:demo@127.0.0.1:5432/disposable_test"
 };
 assert.equal(checkV50AuditLabConfig(config).storeId,store);
 for(const bad of [
   {ZHIROX_RELEASE_MODE:"official"}, {ZHIROX_V29_TEST_MODE:"false"},
   {ZHIROX_V50_CLOUD_AUDIT_LAB_ENABLED:"false"},
   {ZHIROX_V29_RECEIVER_URL:"https://real-cloud.com/v27/events"},
   {ZHIROX_LOCAL_DB_URL:"postgresql://demo:demo@prod.supabase.co:5432/disposable_test"},
   {ZHIROX_LOCAL_DB_URL:"postgresql://demo:demo@127.0.0.1:5432/market"},
   {ZHIROX_V29_OWNER_TOKEN:"short"}
 ]) assert.throws(()=>checkV50AuditLabConfig({...config,...bad}));
});
test("V50 never claims matched if a remote extra event, partial scan or pending ACK",()=>{
 const summary={store_id:store,local_sales:2,cloud_received_sales:2,local_pending_events:0,
   count_gap:0,status:"counts_match_not_event_proof"};
 const ev={store_id:store,local_checked:2,cloud_checked:2,local_missing_cloud:0,
   cloud_missing_local:0,local_partial:false,cloud_partial:false,
   status:"event_ids_match_non_atomic_snapshot"};
 assert.equal(evaluateV50Evidence(summary,ev).sync_status,"MATCHED_NON_ATOMIC_LAB_SNAPSHOT");
 assert.equal(evaluateV50Evidence(summary,{...ev,cloud_missing_local:1}).sync_status,"CONFLICT_REQUIRES_REVIEW");
 assert.equal(evaluateV50Evidence(summary,{...ev,local_partial:true,status:"partial_not_verified"}).sync_status,"PARTIAL_NOT_VERIFIED");
 assert.equal(evaluateV50Evidence({...summary,local_pending_events:1},ev).sync_status,"PENDING_OR_MISSING");
 assert.equal(evaluateV50Evidence({...summary,count_gap:-1,status:"conflict"},ev).sync_status,"CONFLICT_REQUIRES_REVIEW");
});
