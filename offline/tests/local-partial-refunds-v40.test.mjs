import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalPartialRefundHandlerV40} from "../local-partial-refunds-v40.mjs";
const store="10000000-0000-0000-0000-000000000040";
const cashier="20000000-0000-0000-0000-000000000040";
const manager="20000000-0000-0000-0000-000000000041";
const other="20000000-0000-0000-0000-000000000042";
const sale="30000000-0000-0000-0000-000000000040";
const shift="40000000-0000-0000-0000-000000000040";
const refund="60000000-0000-0000-0000-000000000040";
const secret="v40-test-only-dual-auth-secret".repeat(3);
const codec=makeLocalSessionCodec(secret);
const bearer=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const approval=codec.issue({store_id:store,user_id:manager,role:"manager"});
const wrong=codec.issue({store_id:store,user_id:other,role:"cashier"});
const captured=[];
const pool={connect:async()=>{throw Error("test rejects SQL transaction direct");},
 query:async(sql,args)=>{
  if(sql.startsWith("SELECT role,enabled,session_version,locked_until FROM zhirox_local.local_users"))
   return {rows:[{enabled:true,role:args[1]===manager?"manager":"cashier",
    session_version:1,locked_until:null}]};
  captured.push({sql,args});
  assert.match(sql,/^SELECT /);
  if(sql.includes("refund_partial_line_v40")){
   if(args[1]!==cashier)throw Object.assign(Error("cashier"),{code:"P4001"});
   if(args[7]>3)throw Object.assign(Error("overrefund"),{code:"P4002"});
   return {rows:[{refund_id:refund,sale_id:sale,line_no:1,
    quantity_base_units:args[7],refund_minor:"33",restock:args[8],replayed:false}]};
  }
  if(sql.includes("receipt_snapshots_v34")){
   return {rows:[{sale_id:sale,line_no:1,name_snapshot:"Sale item",quantity_base_units:"3",
    returned_base_units:"0",line_total_minor:"100",fully_refunded:false}]};
  }
  throw Error("unexpected SQL query: "+sql);
 }};
async function serve(fn){
 captured.length=0;
 const svr=createServer(createLocalPartialRefundHandlerV40({pool,secret}));
 await new Promise(ok=>svr.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+svr.address().port);}
 finally{await new Promise(ok=>svr.close(ok));}
}
const payload={refund_id:refund,sale_id:sale,shift_id:shift,line_no:1,
 quantity_base_units:1,restock:false,reason:"Unopened product"};
function call(base,method="POST",body=payload,t=bearer,m=approval){
 return fetch(base+"/api/local/v40/partial-refund",{
  method,headers:{...(t?{Authorization:"Bearer "+t}:{}),
    ...(m?{"x-zhirox-manager-token":m}:{}),
    ...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
}
test("two independently signed people required; no money sent from browser",async()=>{
 await serve(async base=>{
  assert.equal((await call(base,"POST",payload,null)).status,401);
  assert.equal((await call(base,"POST",payload,bearer,null)).status,403);
  assert.equal((await call(base,"POST",payload,bearer,wrong)).status,403);
  const r=await call(base);
  assert.equal(r.status,200);
  assert.equal((await r.json()).refund.refund_minor,"33");
  assert.deepEqual(captured[0].args,[store,cashier,manager,shift,refund,sale,1,1,false,payload.reason]);
  assert.ok(captured.every(c=>c.sql.startsWith("SELECT ")));
 });
});
test("invalid amount, forged identities, missing fields, no double-side cash classification",async()=>{
 await serve(async base=>{
  for(const extra of [{refund_minor:1},{cashier_id:cashier},{manager_id:manager},
   {product_id:cashier},{payment_method:"card"},{cash_received_minor:100}]){
    assert.equal((await call(base,"POST",{...payload,...extra})).status,400);
  }
  for(const change of [{line_no:0},{quantity_base_units:0},{quantity_base_units:1.5},
    {restock:"true"},{reason:" x "},{sale_id:"not-uuid"}]){
    assert.equal((await call(base,"POST",{...payload,...change})).status,400);
  }
  assert.equal((await call(base,"POST",{...payload,quantity_base_units:4})).status,409);
  assert.equal((await call(base,"GET",null)).status,405);
  const list=await fetch(base+"/api/local/v40/refundable-lines?sale_id="+sale,
    {headers:{Authorization:"Bearer "+bearer}});
  assert.equal(list.status,200);
  assert.equal((await list.json()).lines[0].returned_base_units,"0");
  const bad=await fetch(base+"/api/local/v40/refundable-lines?sale_id="+sale+"&amount=999",
   {headers:{Authorization:"Bearer "+bearer}});
  assert.equal(bad.status,400);
  assert.ok(!captured.some(x=>x.sql.includes("refund_partial_line_v40")&&x.args[7]===0));
 });
});
