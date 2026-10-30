import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createCloudReceiverV29} from "../cloud-receiver-v29.mjs";
import {hashOwnerToken,parseV28Stores} from "../cloud-receiver-v28.mjs";
import {reconcileEventIdsV29,runV29Reconciliation} from "../reconcile-events-v29.mjs";

const store="10000000-0000-0000-0000-000000000029";
const other="10000000-0000-0000-0000-000000000030";
const token="v29-owner-session-test-only-".repeat(3);
const stores=parseV28Stores([
 {store_id:store,sync_secret:"v29-store-hmac-".repeat(3),owner_token_hash:hashOwnerToken(token)},
 {store_id:other,sync_secret:"v29-other-hmac-".repeat(3),
 owner_token_hash:hashOwnerToken("another-owner-token-".repeat(3))}
]);
const makeId=n=>"40000000-0000-0000-0000-"+String(n).padStart(12,"0");
function fakePool(cloudIds=[],localIds=cloudIds){
 const calls=[];
 return {calls,query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes("zhirox_cloud_v28.received_sales")&&sql.includes("event_id::text")){
   const [sid,after,limit]=args;
   const ids=sid===store?cloudIds:[];
   return {rows:ids.filter(x=>!after||x>after).slice(0,limit).map(event_id=>({event_id}))};
  }
  if(sql.includes("zhirox_local.event_outbox")){
   const [sid,after,limit]=args;
   const ids=sid===store?localIds:[];
   return {rows:ids.filter(x=>!after||x>after).slice(0,limit).map(event_id=>({event_id}))};
  }
  if(sql.includes("count(*)::bigint AS sales_count"))
   return {rows:[{sales_count:"0",total_minor:"0",last_receipt_no:"0",last_received_at:null}]};
  if(sql.includes("SELECT sale_id,receipt_no,total_minor,occurred_at,received_at"))
   return {rows:[]};
  throw Error("unexpected SQL");
 }};
}
async function serve(pool,fn){
 const server=createServer(createCloudReceiverV29({pool,stores}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
const get=(origin,path,ownerToken=token)=>fetch(origin+path,{
 headers:ownerToken?{Authorization:"Bearer "+ownerToken}:{}
});
const run=(pool,origin,maxIds=5000)=>reconcileEventIdsV29({
 pool,storeId:store,receiverUrl:origin+"/v27/events",ownerToken:token,
 testMode:true,maxIds
});
test("Mobile owner preview is same-origin, locked down, and contains no secrets",async()=>{
 await serve(fakePool(),async origin=>{
  const html=await get(origin,"/v29/owner",null);
  assert.equal(html.status,200);
  assert.match(html.headers.get("content-security-policy"),/default-src 'none'/);
  assert.match(html.headers.get("cache-control"),/no-store/);
  const htmlSource=await html.text();
  assert.match(htmlSource,/dir="rtl"/);
  assert.match(htmlSource,/viewport-fit=cover/);
  assert.match(htmlSource,/تاقیکردنەوە — نەک Production/);
  assert.match(htmlSource,/کەمی کۆگا/);
  assert.doesNotMatch(htmlSource,/token-for-test|localStorage|supabaseKey/i);
  for(const [name,type] of [["owner-app.js","text/javascript"],["owner.css","text/css"]]){
   const resp=await get(origin,"/v29/"+name,null);
   assert.equal(resp.status,200);assert.match(resp.headers.get("content-type"),new RegExp(type));
  }
 });
});
test("Event ID endpoint rejects other owner, invalid cursor, incorrect store and unknown query",async()=>{
 await serve(fakePool([makeId(1)]),async origin=>{
  assert.equal((await get(origin,"/v29/owner/event-ids?store_id="+store,null)).status,401);
  assert.equal((await get(origin,"/v29/owner/event-ids?store_id="+other)).status,401);
  assert.equal((await get(origin,"/v29/owner/event-ids?store_id="+store+"&after=bad")).status,400);
  assert.equal((await get(origin,"/v29/owner/event-ids?store_id="+store+"&limit=99")).status,400);
  assert.equal((await get(origin,"/v29/owner/event-ids?store_id="+store+"&x=1")).status,400);
  assert.equal((await get(origin,"/v29/owner/event-ids?store_id="+store+"&limit=2&limit=2")).status,400);
 });
});
test("Cloud ID pagination is ordered, store-scoped and bounded",async()=>{
 const ids=Array.from({length:112},(_,i)=>makeId(i+1));
 await serve(fakePool(ids),async origin=>{
  const first=await (await get(origin,
   "/v29/owner/event-ids?store_id="+store+"&limit=50")).json();
  assert.equal(first.event_ids.length,50);
  assert.equal(first.has_more,true);
  assert.equal(first.next_cursor,makeId(50));
  const second=await(await get(origin,
   "/v29/owner/event-ids?store_id="+store+"&after="+first.next_cursor+"&limit=50")).json();
  assert.equal(second.event_ids.length,50);
  assert.equal(second.next_cursor,makeId(100));
  const third=await(await get(origin,
   "/v29/owner/event-ids?store_id="+store+"&after="+second.next_cursor+"&limit=50")).json();
  assert.equal(third.event_ids.length,12);
  assert.equal(third.has_more,false);
  assert.equal(third.next_cursor,null);
 });
});
test("Event-by-event reconciliation finds missing and unexpected events even when counts equal",async()=>{
 const local=[makeId(1),makeId(2),makeId(3)];
 const cloud=[makeId(1),makeId(3),makeId(4)];
 const pool=fakePool(cloud,local);
 await serve(pool,async origin=>{
  const report=await run(pool,origin);
  assert.equal(report.local_checked,3);
  assert.equal(report.cloud_checked,3);
  assert.equal(report.status,"event_mismatch");
  assert.deepEqual(report.local_missing_ids,[makeId(2)]);
  assert.deepEqual(report.cloud_missing_ids,[makeId(4)]);
  assert.equal(pool.calls.filter(x=>!x.sql.startsWith("SELECT")).length,0);
 });
});
test("Exact matching event IDs are reported as NON-atomic snapshot equality",async()=>{
 const ids=Array.from({length:102},(_,i)=>makeId(i+1));
 const pool=fakePool(ids);
 await serve(pool,async origin=>{
  const report=await run(pool,origin);
  assert.equal(report.local_checked,102);
  assert.equal(report.cloud_checked,102);
  assert.equal(report.status,"event_ids_match_non_atomic_snapshot");
  assert.equal(report.local_partial,false);
 });
});
test("Bounded reconciliation never claims parity for a truncated set",async()=>{
 const ids=Array.from({length:60},(_,i)=>makeId(i+1));
 const pool=fakePool(ids);
 await serve(pool,async origin=>{
  const report=await run(pool,origin,50);
  assert.equal(report.status,"partial_not_verified");
  assert.equal(report.local_partial,true);
  assert.equal(report.cloud_partial,true);
 });
});
test("V29 CLI cannot run without explicit approval",async()=>{
 const old=process.env.ZHIROX_V29_RECONCILE_ENABLED;
 delete process.env.ZHIROX_V29_RECONCILE_ENABLED;
 try{await assert.rejects(runV29Reconciliation({poolOverride:fakePool()}),
    /v29_reconcile_disabled/);}
 finally{if(old!==undefined)process.env.ZHIROX_V29_RECONCILE_ENABLED=old;}
});
