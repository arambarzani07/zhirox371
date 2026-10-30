import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createCloudReceiverV28,hashOwnerToken,parseV28Stores} from "../cloud-receiver-v28.mjs";
import {createEventEnvelope,signEvent} from "../sync-wire-v27.mjs";
import {syncOutboxOnce} from "../outbox-sync-worker-v27.mjs";

const store="10000000-0000-0000-0000-000000000028";
const other="10000000-0000-0000-0000-000000000029";
const sale="20000000-0000-0000-0000-000000000028";
const event="40000000-0000-0000-0000-000000000028";
const lease="50000000-0000-0000-0000-000000000028";
const secret="v28-test-store-HMAC-key-".repeat(3);
const secretOther="v28-second-store-HMAC-key-".repeat(3);
const owner="v28-owner-private-token-".repeat(3);
const ownerOther="v28-other-owner-private-token-".repeat(3);
const row={store_id:store,event_id:event,aggregate_id:sale,
 event_type:"sale.completed",created_at:"2026-10-29T23:00:00.000Z",
 payload:{sale_id:sale,receipt_no:5,total_minor:7650,
   package_breakdown:[{name:"private product name",barcode:"123",line_total:7650}]},
 lease_token:lease,attempt_count:1};
const stores=parseV28Stores([
 {store_id:store,sync_secret:secret,owner_token_hash:hashOwnerToken(owner)},
 {store_id:other,sync_secret:secretOther,owner_token_hash:hashOwnerToken(ownerOther)}
]);
function cloudPool(){
 const records=new Map(),calls=[];
 return {records,calls,query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith("INSERT INTO zhirox_cloud_v28.received_sales")){
   const [s,id,saleId,receipt,total,hash,occurred]=args;
   const key=s+":"+id;
   if(records.has(key))return {rows:[]};
   if([...records.values()].some(x=>x.store_id===s&&(x.sale_id===saleId||x.receipt_no===receipt))){
    const e=Error("conflicting receipt");e.code="23505";throw e;
   }
   records.set(key,{store_id:s,event_id:id,sale_id:saleId,receipt_no:receipt,
     total_minor:total,event_hash:hash,occurred_at:occurred,
     received_at:"2026-10-29T23:01:00.000Z"});
   return {rows:[{event_id:id}]};
  }
  if(sql.startsWith("SELECT sale_id,receipt_no,total_minor,event_hash")){
   const r=records.get(args[0]+":"+args[1]);return {rows:r?[r]:[]};
  }
  if(sql.includes("count(*)::bigint AS sales_count")){
   const rs=[...records.values()].filter(x=>x.store_id===args[0]);
   return {rows:[{sales_count:String(rs.length),
     total_minor:String(rs.reduce((s,x)=>s+x.total_minor,0)),
     last_receipt_no:String(Math.max(0,...rs.map(x=>x.receipt_no))),
     last_received_at:rs.length?rs[0].received_at:null}]};
  }
  if(sql.startsWith("SELECT sale_id,receipt_no,total_minor,occurred_at,received_at")){
   const rs=[...records.values()].filter(x=>x.store_id===args[0])
     .slice(-args[1]).reverse();
   return {rows:rs};
  }
  throw Error("unrecognized query "+sql.slice(0,110));
 }};
}
async function serve(fn){
 const pool=cloudPool();
 const server=createServer(createCloudReceiverV28({pool,stores}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+server.address().port,pool);}
 finally{await new Promise(ok=>server.close(ok));}
}
async function send(url,eventBody,{key=secret,timestamp=String(Date.now()),sign=true}={}){
 const raw=JSON.stringify(eventBody);
 return fetch(url+"/v27/events",{method:"POST",
  headers:{"Content-Type":"application/json","X-ZHIROX-Timestamp":timestamp,
    "X-ZHIROX-Signature":sign?signEvent(raw,key,timestamp):"wrong"},
  body:raw});
}
const ownerGet=(url,storeId,token=owner,path="summary")=>
 fetch(url+"/v28/owner/"+path+"?store_id="+storeId,{headers:{Authorization:"Bearer "+token}});
test("Receiver requires per-store secrets and owner hashes, rejects weak/duplicate configs",()=>{
 assert.throws(()=>parseV28Stores([]),/invalid_stores/);
 assert.throws(()=>parseV28Stores([{store_id:store,sync_secret:"short",
   owner_token_hash:hashOwnerToken(owner)}]),/invalid_store_config/);
 assert.throws(()=>parseV28Stores([ ...[...stores].map(([store_id,c])=>({store_id,...c})),
 {store_id:store,sync_secret:secret,owner_token_hash:hashOwnerToken(owner)}]),/invalid_store_config/);
 assert.equal(stores.size,2);
});
test("Signed event persists only minimal sale fields and receives exact idempotent ACK",async()=>{
 await serve(async(url,pool)=>{
  const envelope=createEventEnvelope(row);
  const res=await send(url,envelope);
  assert.equal(res.status,200);
  const ack=await res.json();
  assert.deepEqual(ack,{ok:true,accepted:true,store_id:store,event_id:event,duplicate:false});
  assert.equal(pool.records.size,1);
  assert.ok(!JSON.stringify([...pool.records.values()]).includes("private product name"),
    "product names and full basket must never be stored in cloud");
  const again=await send(url,envelope);
  assert.equal(again.status,200);
  assert.equal((await again.json()).duplicate,true);
  assert.equal(pool.records.size,1);
  const altered={...envelope,payload:{...envelope.payload,total_minor:999999}};
  assert.equal((await send(url,altered)).status,409);
  assert.equal(pool.records.size,1);
 });
});
test("Cross-store forgery, unsigned requests and stale timestamps are rejected",async()=>{
 await serve(async(url,pool)=>{
  const envelope=createEventEnvelope(row);
  assert.equal((await send(url,envelope,{key:secretOther})).status,401);
  assert.equal((await send(url,{...envelope,store_id:other},{key:secret})).status,401);
  assert.equal((await send(url,envelope,{sign:false})).status,401);
  assert.equal((await send(url,envelope,{timestamp:String(Date.now()-900000)})).status,401);
  assert.equal(pool.records.size,0);
 });
});
test("Owner summary requires the matching store's private bearer and remains read-only",async()=>{
 await serve(async(url,pool)=>{
  const summaryPath=url+"/v28/owner/summary?store_id="+store;
  assert.equal((await fetch(summaryPath)).status,401);
  assert.equal((await ownerGet(url,store,ownerOther)).status,401);
  assert.equal((await ownerGet(url,other,owner)).status,401);
  const valid=await ownerGet(url,store);
  assert.equal(valid.status,200);
  const empty=await valid.json();
  assert.equal(empty.sales_count,0);
  assert.deepEqual(empty.available_categories,["sale.completed"]);
  assert.equal(empty.unavailable_categories.length,6);
  await send(url,createEventEnvelope(row));
  const view=await (await ownerGet(url,store)).json();
  assert.equal(view.sales_count,1);
  assert.equal(view.total_minor,"7650");
  assert.equal(view.last_receipt_no,5);
  assert.equal(view.possible_missing_receipts,4);
  assert.equal(view.source,"received_cloud_events_not_local_inventory");
  const latest=await ownerGet(url,store,owner,"latest");
  assert.equal(latest.status,200);
  const data=await latest.json();
  assert.equal(data.events.length,1);
  assert.equal(data.events[0].sale_id,sale);
  assert.ok(!JSON.stringify(data).includes("private product name"));
  assert.equal((await fetch(url+"/v28/owner/latest?store_id="+store+"&limit=100",
    {headers:{Authorization:"Bearer "+owner}})).status,400);
  assert.equal(pool.records.size,1,"owner GETs may never mutate cloud inbox");
 });
});
test("V27 sender interoperates with V28 receiver and cannot block checkout",async()=>{
 await serve(async(url,pool)=>{
  let pending=true,acked=0,failed=0;
  const local={query:async(sql,args)=>{
   if(sql.includes("claim_outbox_v27"))return {rows:pending?[row]:[]};
   if(sql.includes("ack_outbox_v27")){
     assert.deepEqual(args,[store,event,lease]);
     pending=false;acked++;return {rows:[{ok:true}]};
   }
   if(sql.includes("fail_outbox_v27")){failed++;return {rows:[{ok:true}]};}
   throw Error("unexpected sender query");
  }};
  const stats=await syncOutboxOnce({pool:local,storeId:store,secret,
    receiverUrl:url+"/v27/events",testMode:true});
  assert.deepEqual(stats,{claimed:1,acked:1,retried:0,lostLease:0});
  assert.equal(acked,1);assert.equal(failed,0);assert.equal(pool.records.size,1);
 });
});
test("Same sale or receipt with a different event id is rejected (no double counting)",async()=>{
 await serve(async(url,pool)=>{
  const first=createEventEnvelope(row);
  assert.equal((await send(url,first)).status,200);
  const conflict={...first,event_id:"40000000-0000-0000-0000-000000000030"};
  const resp=await send(url,conflict);
  assert.equal(resp.status,409);
  assert.equal((await resp.json()).error,"conflicting_sale_or_receipt");
  assert.equal(pool.records.size,1);
 });
});
