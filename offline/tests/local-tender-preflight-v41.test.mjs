import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalTenderPreflightHandlerV41} from "../local-tender-preflight-v41.mjs";
const store="10000000-0000-0000-0000-000000000041";
const cashier="20000000-0000-0000-0000-000000000041";
const stranger="20000000-0000-0000-0000-000000000042";
const requestId="50000000-0000-0000-0000-000000000041";
const secret="v41-isolated-test-session-secret".repeat(3);
const codec=makeLocalSessionCodec(secret);
const token=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const other=codec.issue({store_id:store,user_id:stranger,role:"cashier"});
const calls=[];
const pool={connect:async()=>{throw Error("not a SQL transaction");},
 query:async(sql,args)=>{
  if(sql.startsWith("SELECT role,enabled,session_version,locked_until FROM zhirox_local.local_users"))
   return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
  calls.push({sql,args});assert.match(sql,/^SELECT /);
  if(sql.includes("plan_tender_v41")){
   if(args[1]===stranger)throw Object.assign(Error("wrong cashier"),{code:"P4102"});
   return {rows:[{request_id:requestId,cash_minor:String(args[3]),
    external_minor:String(args[4]),external_method:args[5],
    state:args[4]>0?"external_unverified":"cash_ready",replayed:false}]};
  }
  if(sql.includes("FROM zhirox_local.tender_plans_v41")){
   return {rows:args[1]===cashier?[{request_id:requestId,cash_minor:"1000",
    external_minor:"1500",external_method:"card",state:"external_unverified",
    intent_state:"prepared"}]:[]};
  }
  throw Error("unexpected SQL "+sql);
 }};
async function serve(fn){
 calls.length=0;const server=createServer(createLocalTenderPreflightHandlerV41({pool,secret}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
const body={request_id:requestId,cash_minor:1000,external_minor:1500,external_method:"card"};
function send(base,payload=body,session=token){
 return fetch(base+"/api/local/v41/tender-plan",{method:"POST",headers:{
  ...(session?{Authorization:"Bearer "+session}:{}),
  "Content-Type":"application/json"},body:JSON.stringify(payload)});
}
test("unverified external allocation always reports no banking and checkout disabled",async()=>{
 await serve(async base=>{
  assert.equal((await send(base,body,null)).status,401);
  assert.equal((await send(base,body,other)).status,409);
  const result=await send(base);
  assert.equal(result.status,200);
  const data=await result.json();
  assert.equal(data.external_settlement_supported,false);
  assert.equal(data.checkout_allowed,false);
  assert.equal(data.plan.state,"external_unverified");
  assert.deepEqual(calls.find(x=>x.sql.includes("plan_tender_v41")).args,
   [store,cashier,requestId,1000,1500,"card"]);
  const check=await fetch(base+"/api/local/v41/tender-status?request_id="+requestId,
   {headers:{Authorization:"Bearer "+token}});
  const state=await check.json();
  assert.equal(state.plan.state,"external_unverified");
  assert.equal(state.external_settlement_supported,false);
 });
});
test("cash-only remains allowed but browser cannot impersonate provider settlement",async()=>{
 await serve(async base=>{
  const result=await send(base,{request_id:requestId,cash_minor:2500,
   external_minor:0,external_method:"none"});
  assert.equal(result.status,200);
  assert.equal((await result.json()).checkout_allowed,true);
  for(const extras of [
   {provider_approved:true},{bank_reference:"fake"},{settled:true},
   {paid:true},{cashier_id:cashier},{store_id:store},{token:"fake"},
   {payment_status:"confirmed"}, {card_minor:1500}]){
   assert.equal((await send(base,{...body,...extras})).status,400);
  }
  for(const invalid of [
   {cash_minor:-1},{cash_minor:1.5},{external_minor:0,external_method:"card"},
   {external_minor:1500,external_method:"none"},{cash_minor:10000000000000},
   {request_id:"fake"},{external_method:"credit"},{external_minor:-1}]){
   assert.equal((await send(base,{...body,...invalid})).status,400);
  }
  const r=await fetch(base+"/api/local/v41/tender-status?request_id="+requestId+"&other=1",
   {headers:{Authorization:"Bearer "+token}});
  assert.equal(r.status,400);
  const wrongMethod=await fetch(base+"/api/local/v41/tender-plan",
   {headers:{Authorization:"Bearer "+token}});
  assert.equal(wrongMethod.status,405);
 });
});
