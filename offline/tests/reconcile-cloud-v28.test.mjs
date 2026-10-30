import test from "node:test";
import assert from "node:assert/strict";
import {reconcileStoreV28,mainV28Reconciliation} from "../reconcile-cloud-v28.mjs";

const store="10000000-0000-0000-0000-000000000028";
const token="read-only-owner-token-for-test-".repeat(3);
const db=(count=3,receipt=3,pending=0)=>{
 const queries=[];
 return {queries,query:async(sql,args)=>{
  queries.push({sql,args});
  assert.deepEqual(args,[store]);
  assert.match(sql,/^SELECT /);
  if(sql.includes("zhirox_local.sales"))return {rows:[{count:String(count),last_receipt_no:String(receipt),total_minor:"15000"}]};
  return {rows:[{pending:String(pending)}]};
 }};
};
const okResponse=(cloud=3,last=3)=>({
 ok:true,json:async()=>({ok:true,store_id:store,
   source:"received_cloud_events_not_local_inventory",
   sales_count:cloud,last_receipt_no:last,total_minor:"15000"})
});
const run=(pool,reply=okResponse())=>reconcileStoreV28({
 pool,storeId:store,receiverUrl:"http://127.0.0.1:3418/v27/events",
 ownerToken:token,testMode:true,fetchImpl:async(url,args)=>{
   assert.equal(args.method,"GET");
   assert.equal(args.headers.Authorization,"Bearer "+token);
   assert.match(url,/\/v28\/owner\/summary\?store_id=/);
   return reply;
 }
});
test("Matching counts are explicitly preliminary, not definitive event proof",async()=>{
 const pool=db(),result=await run(pool);
 assert.equal(result.status,"counts_match_not_event_proof");
 assert.equal(result.count_gap,0);
 assert.equal(result.local_pending_events,0);
 assert.equal(pool.queries.length,2);
});
test("Pending outbox or count gap is never reported as fully synchronized",async()=>{
 assert.equal((await run(db(5,5,2),okResponse(3,3))).status,"sync_pending_or_missing");
 assert.equal((await run(db(3,3,1))).status,"sync_pending_or_missing");
 assert.equal((await run(db(3,3,0),okResponse(4,4))).status,"conflict");
});
test("Wrong store or malformed cloud response fails closed",async()=>{
 const pool=db();
 await assert.rejects(run(pool, {ok:true,json:async()=>({ok:true,store_id:"else",sales_count:2})}),
   /untrusted_cloud_summary/);
 await assert.rejects(run(pool,{ok:false,status:503}),/cloud_summary_unavailable_503/);
});
test("Reconciliation must be explicitly enabled, cannot call production by default",async()=>{
 const old=process.env.ZHIROX_V28_RECONCILE_ENABLED;
 delete process.env.ZHIROX_V28_RECONCILE_ENABLED;
 try{await assert.rejects(mainV28Reconciliation({poolOverride:db()}),/reconciliation_disabled/);}
 finally{if(old!==undefined)process.env.ZHIROX_V28_RECONCILE_ENABLED=old;}
});
