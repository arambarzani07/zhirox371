import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createEventEnvelope,signEvent,verifyEventSignature,digest} from "../sync-wire-v27.mjs";
import {createTestReceiverV27} from "../test-cloud-receiver-v27.mjs";
import {syncOutboxOnce,validateReceiverUrl} from "../outbox-sync-worker-v27.mjs";

const store="10000000-0000-0000-0000-000000000027";
const other="10000000-0000-0000-0000-000000000028";
const event="40000000-0000-0000-0000-000000000027";
const sale="20000000-0000-0000-0000-000000000027";
const lease="50000000-0000-0000-0000-000000000027";
const secret="local-pilot-v27-a-strong-key-".repeat(3);
const row={
 store_id:store,event_id:event,aggregate_id:sale,event_type:"sale.completed",
 payload:{sale_id:sale,receipt_no:7,total_minor:11000},
 created_at:"2026-10-29T22:15:00.000Z",lease_token:lease,attempt_count:1
};
function localPool(){
 let active={...row},acked=0,failed=0,lastReason=null;
 return {
  get state(){return {acked,failed,lastReason,active};},
  query:async(sql,args)=>{
   if(sql.includes("claim_outbox_v27")){
     assert.equal(args[0],store);
     return {rows:active?[active]:[]};
   }
   if(sql.includes("ack_outbox_v27")){
     const match=active&&args[0]===store&&args[1]===event&&args[2]===lease;
     if(match){active=null;acked++;}
     return {rows:[{ok:Boolean(match)}]};
   }
   if(sql.includes("fail_outbox_v27")){
     const match=active&&args[0]===store&&args[1]===event&&args[2]===lease;
     if(match){failed++;lastReason=args[3];}
     return {rows:[{ok:Boolean(match)}]};
   }
   throw Error("unexpected local DB statement");
  }
 };
}
function receiverPool(){
 const saved=new Map();
 return {saved,query:async(sql,args)=>{
  if(sql.includes("INSERT INTO zhirox_cloud_test.received_events")){
   const [st,id,aggregate,type,hash]=args, key=st+":"+id;
   if(saved.has(key))return {rows:[]};
   saved.set(key,{aggregate_id:aggregate,event_type:type,event_hash:hash,payload:args[5]});
   return {rows:[{event_id:id}]};
  }
  if(sql.includes("SELECT aggregate_id,event_type,event_hash")){
   const r=saved.get(args[0]+":"+args[1]);
   return {rows:r?[r]:[]};
  }
  throw Error("unexpected receiver DB statement");
 }};
}
async function serve(fn){
 const receiver=receiverPool();
 const http=createServer(createTestReceiverV27({pool:receiver,storeId:store,secret}));
 await new Promise(resolve=>http.listen(0,"127.0.0.1",resolve));
 try{await fn("http://127.0.0.1:"+http.address().port+"/v27/events",receiver);}
 finally{await new Promise(resolve=>http.close(resolve));}
}
const send=async(url,envelope,{key=secret,ts=String(Date.now()),signature}={})=>{
 const raw=JSON.stringify(envelope);
 return fetch(url,{method:"POST",headers:{
   "Content-Type":"application/json","X-ZHIROX-Timestamp":ts,
   "X-ZHIROX-Signature":signature||signEvent(raw,key,ts)
 },body:raw});
};

test("HMAC protects payload and expiry, constant format, wrong secret",()=>{
 const raw=JSON.stringify(createEventEnvelope(row)),ts=String(Date.now());
 const sig=signEvent(raw,secret,ts);
 assert.ok(verifyEventSignature(raw,secret,ts,sig));
 assert.equal(verifyEventSignature(raw+" ",secret,ts,sig),false);
 assert.equal(verifyEventSignature(raw,secret+"bad",ts,sig),false);
 assert.equal(verifyEventSignature(raw,secret,String(Number(ts)-600000),sig),false);
 assert.equal(verifyEventSignature(raw,secret,ts,sig+"junk"),false);
 assert.equal(digest(raw).length,64);
});
test("Remote URLs must be external HTTPS; test HTTP only loopback",()=>{
 assert.equal(validateReceiverUrl("https://sync.example.org/v27/events"),"https://sync.example.org/v27/events");
 for(const url of ["http://sync.example.org/v27/events","http://192.168.1.3/v27/events",
                   "https://127.0.0.1/v27/events","https://x.com/else",
                   "https://user:password@example.com/v27/events"]){
  assert.throws(()=>validateReceiverUrl(url),/receiver/);
 }
 assert.equal(validateReceiverUrl("http://127.0.0.1:3407/v27/events",true),
              "http://127.0.0.1:3407/v27/events");
 assert.throws(()=>validateReceiverUrl("http://example.org/v27/events",true));
});
test("Signed event delivery stores one receiver row, ACKs one local record",async()=>{
 await serve(async(url,receiver)=>{
  const source=localPool();
  const stats=await syncOutboxOnce({pool:source,storeId:store,receiverUrl:url,
                                     secret,testMode:true});
  assert.deepEqual(stats,{claimed:1,acked:1,retried:0,lostLease:0});
  assert.equal(receiver.saved.size,1);
  assert.equal(source.state.acked,1);
  assert.equal(source.state.failed,0);
 });
});
test("Receiver accepts duplicate identical signed event but rejects conflicting same ID",async()=>{
 await serve(async(url,receiver)=>{
  const envelope=createEventEnvelope(row);
  const first=await send(url,envelope);
  assert.equal(first.status,200);
  assert.equal((await first.json()).duplicate,false);
  const second=await send(url,envelope);
  assert.equal(second.status,200);
  assert.equal((await second.json()).duplicate,true);
  const modified={...envelope,payload:{...envelope.payload,total_minor:90000}};
  const clash=await send(url,modified);
  assert.equal(clash.status,409);
  assert.equal(receiver.saved.size,1);
  assert.equal((await clash.json()).error,"conflicting_event_id");
 });
});
test("Tampered and cross-store messages rejected; never persisted",async()=>{
 await serve(async(url,receiver)=>{
  const envelope=createEventEnvelope(row);
  assert.equal((await send(url,envelope,{key:secret+"wrong"})).status,401);
  assert.equal((await send(url,{...envelope,store_id:other})).status,403);
  assert.equal(receiver.saved.size,0);
 });
});
test("Internet unavailable: local sale stays in outbox, no false acknowledgment",async()=>{
 const pool=localPool();
 const result=await syncOutboxOnce({pool,storeId:store,
   receiverUrl:"https://sync.example.org/v27/events",secret,
   fetchImpl:async()=>{throw Error("simulated_offline");}});
 assert.deepEqual(result,{claimed:1,acked:0,retried:1,lostLease:0});
 assert.equal(pool.state.acked,0);
 assert.equal(pool.state.failed,1);
 assert.match(pool.state.lastReason,/simulated_offline/);
});
test("Forged 2xx response without matching event identity is not acknowledged",async()=>{
 const pool=localPool();
 const res=await syncOutboxOnce({pool,storeId:store,
  receiverUrl:"https://sync.example.org/v27/events",secret,
  fetchImpl:async()=>({ok:true,json:async()=>({
    ok:true,accepted:true,store_id:other,event_id:event
  })})});
 assert.equal(res.acked,0);assert.equal(res.retried,1);
 assert.equal(pool.state.lastReason,"invalid_remote_ack");
});
test("Outbox worker requires enabled env, never starts automatically in cashier",async()=>{
 const {startV27SyncWorker}=await import("../outbox-sync-worker-v27.mjs");
 const original=process.env.ZHIROX_V27_SYNC_ENABLED;
 delete process.env.ZHIROX_V27_SYNC_ENABLED;
 try{await assert.rejects(startV27SyncWorker({once:true}),/sync_is_disabled/);}
 finally{if(original!==undefined)process.env.ZHIROX_V27_SYNC_ENABLED=original;}
});
