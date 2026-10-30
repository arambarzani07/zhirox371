import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalReservationHandlerV43} from "../local-reservation-v43.mjs";
const store="10000000-0000-0000-0000-000000000043";
const cashier="20000000-0000-0000-0000-000000000043";
const stranger="20000000-0000-0000-0000-000000000044";
const requestId="50000000-0000-0000-0000-000000000043";
const secret="v43-private-test-session-only".repeat(3);
const codec=makeLocalSessionCodec(secret);
const token=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const other=codec.issue({store_id:store,user_id:stranger,role:"cashier"});
const calls=[];
const pool={connect:async()=>{throw Error("not needed");},query:async(sql,args)=>{
 if(sql.startsWith("SELECT role,enabled,session_version,locked_until FROM zhirox_local.local_users"))
  return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
 assert.ok(sql.startsWith("SELECT "));calls.push({sql,args});
 if(sql.includes("hold_checkout_reservation_v43")){
  if(args[1]===stranger)throw Object.assign(Error("wrong actor"),{code:"P4303"});
  if(args[2]==="50000000-0000-0000-0000-000000000045")
   throw Object.assign(Error("stock shortage"),{code:"P4301"});
  return {rows:[{request_id:requestId,expires_at:"2026-10-30T15:00:00Z",
   state:"held",replayed:false}]};
 }
 return {rows:args[1]===cashier?[{request_id:requestId,state:"held",
  expires_at:"2026-10-30T15:00:00Z",expired:false,
  external_evidence_recorded:false,quoted_total_minor:"2500"}]:[]};
}};
async function serve(fn){
 calls.length=0;const server=createServer(createLocalReservationHandlerV43({pool,secret}));
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(done=>server.close(done));}
}
const post=(base,id=requestId,t=token)=>
 fetch(base+"/api/local/v43/reserve",{method:"POST",
 headers:{"Content-Type":"application/json",...(t?{Authorization:"Bearer "+t}:{})},
 body:JSON.stringify({request_id:id})});
test("only authenticated cashier can hold own price-checked stock",async()=>{
 await serve(async base=>{
  assert.equal((await post(base,requestId,null)).status,401);
  assert.equal((await post(base,requestId,other)).status,409);
  const held=await post(base);
  assert.equal(held.status,200);
  const h=await held.json();
  assert.equal(h.provider_payment_verified,false);
  assert.equal(h.external_settlement_supported,false);
  assert.equal(h.reservation.state,"held");
  assert.deepEqual(calls.find(x=>x.sql.includes("hold_checkout_reservation_v43")&&x.args[1]===cashier).args,
   [store,cashier,requestId]);
  const status=await fetch(base+"/api/local/v43/reservation-status?request_id="+requestId,
   {headers:{Authorization:"Bearer "+token}});
  const data=await status.json();
  assert.equal(data.reservation.quoted_total_minor,"2500");
  assert.equal(data.provider_payment_verified,false);
  assert.equal((await post(base,"50000000-0000-0000-0000-000000000045")).status,409);
 });
});
test("no forged amounts, provider approval or remote tenant fields",async()=>{
 await serve(async base=>{
  for(const extras of [{provider_approved:true},{amount_minor:1},{store_id:store},
   {cashier_id:cashier},{bank_paid:true},{external_reference:"fake"}]){
   const r=await fetch(base+"/api/local/v43/reserve",{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({request_id:requestId,...extras})});
   assert.equal(r.status,400);
  }
  const u=base+"/api/local/v43/reservation-status?request_id="+requestId;
  assert.equal((await fetch(u+"&verified=true",{headers:{Authorization:"Bearer "+token}})).status,400);
  assert.equal((await fetch(u,{method:"POST",headers:{Authorization:"Bearer "+token}})).status,405);
  assert.equal((await fetch(base+"/api/local/v43/provider-confirm",
   {method:"POST",headers:{Authorization:"Bearer "+token}})).status,404);
  assert.equal(calls.length,0);
 });
});
