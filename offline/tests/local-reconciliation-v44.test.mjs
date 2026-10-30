import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalReconciliationHandlerV44} from "../local-reconciliation-v44.mjs";
const store="10000000-0000-0000-0000-000000000044";
const manager="20000000-0000-0000-0000-000000000044";
const cashier="20000000-0000-0000-0000-000000000045";
const otherStore="10000000-0000-0000-0000-000000000045";
const requestId="50000000-0000-0000-0000-000000000044";
const noteId="60000000-0000-0000-0000-000000000044";
const secret="v44-local-test-only-session".repeat(3);
const codec=makeLocalSessionCodec(secret);
const token=codec.issue({store_id:store,user_id:manager,role:"manager"});
const unauthorized=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const remote=codec.issue({store_id:otherStore,user_id:manager,role:"manager"});
let calls=[];
const pool={
 connect:async()=>{throw Error("unit test does not connect")},
 query:async(sql,args)=>{
  if(sql.startsWith("SELECT role,enabled,session_version,locked_until FROM zhirox_local.local_users"))
   return {rows:[{enabled:true,role:args[1]===cashier?"cashier":"manager",session_version:1,locked_until:null}]};
  calls.push({sql,args});
  assert.match(sql,/^SELECT /);
  if(sql.includes("tender_exceptions_v44"))return {rows:[{
   request_id:requestId,checkout_state:"prepared",
   exception_code:"evidence_without_committed_sale",
   external_minor:"1500",cash_minor:"1000",evidence_recorded:true
  }]};
  if(sql.includes("record_review_note_v44")){
   if(args[0]!==store)throw Object.assign(Error("cross store"),{code:"P4402"});
   return {rows:[{note_id:noteId,request_id:requestId,category:"contacted_provider",
    note:args[5],replayed:false}]};
  }
  if(sql.includes("FROM zhirox_local.tender_review_notes_v44"))
   return {rows:[{note_id:noteId,request_id:requestId,manager_id:manager,
    category:"contacted_provider",note:"Contacted the provider; no proof received"}]};
  throw Error("unexpected SQL "+sql);
 }
};
async function serve(fn){
 calls=[];
 const server=createServer(createLocalReconciliationHandlerV44({pool,secret}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
const review={note_id:noteId,request_id:requestId,category:"contacted_provider",
 note:"Contacted the provider; no proof received"};
const fetchIt=(base,path,t=token,method="GET",body=null)=>
 fetch(base+path,{method,headers:{...(t?{Authorization:"Bearer "+t}:{}),
 ...(body?{"Content-Type":"application/json"}:{})},
 ...(body?{body:JSON.stringify(body)}:{})});
test("bank exception list is independently manager authenticated and scoped",async()=>{
 await serve(async base=>{
  const url="/api/local/v44/bank-exceptions?limit=5";
  assert.equal((await fetchIt(base,url,null)).status,403);
  assert.equal((await fetchIt(base,url,unauthorized)).status,403);
  const r=await fetchIt(base,url);
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.cases[0].exception_code,"evidence_without_committed_sale");
  assert.equal(data.provider_payment_verified,false);
  assert.equal(data.operator_actions_are_notes_only,true);
  assert.deepEqual(calls.find(x=>x.sql.includes("tender_exceptions_v44")).args,[store,5]);
  assert.equal((await fetchIt(base,url+"&store_id="+otherStore)).status,400);
  assert.equal((await fetchIt(base,"/api/local/v44/bank-exceptions?limit=101")).status,400);
  assert.equal((await fetchIt(base,url,token,"POST")).status,405);
  const scoped=await fetchIt(base,url,remote);
  assert.equal(scoped.status,200);
  assert.deepEqual(calls.at(-1).args,[otherStore,5]);
 });
});
test("review note cannot claim bank confirmation or alter balances",async()=>{
 await serve(async base=>{
  const url="/api/local/v44/review-notes";
  assert.equal((await fetchIt(base,url,unauthorized,"POST",review)).status,403);
  const r=await fetchIt(base,url,token,"POST",review);
  assert.equal(r.status,200);const v=await r.json();
  assert.equal(v.bank_payment_confirmed,false);
  assert.equal(v.funds_refunded,false);
  assert.equal(v.inventory_hold_released,false);
  assert.deepEqual(calls[0].args,[store,manager,noteId,requestId,review.category,review.note]);
  const list=await fetchIt(base,url+"?request_id="+requestId);
  assert.equal(list.status,200);
  assert.equal((await list.json()).notes[0].manager_id,manager);
  for(const changes of [{paid:true},{settled:true},{refund_amount_minor:100},
    {store_id:otherStore},{release_hold:true},{manager_id:cashier}]){
   assert.equal((await fetchIt(base,url,token,"POST",{...review,...changes})).status,400);
  }
  assert.equal((await fetchIt(base,url,token,"POST",{...review,category:"settled"})).status,400);
  assert.equal((await fetchIt(base,url,token,"POST",{...review,note:"too short"})).status,400);
  assert.equal((await fetchIt(base,url+"?request_id="+requestId+"&paid=true")).status,400);
  assert.equal((await fetchIt(base,"/api/local/v44/mark-paid",token,"POST")).status,404);
  assert.equal((await fetchIt(base,"/api/local/v44/refund-bank",token,"POST")).status,404);
 });
});
