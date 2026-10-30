import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalRefundHandlerV39} from "../local-refunds-v39.mjs";
const store="10000000-0000-0000-0000-000000000039";
const otherStore="10000000-0000-0000-0000-000000000040";
const cashier="20000000-0000-0000-0000-000000000039";
const manager="20000000-0000-0000-0000-000000000041";
const another="20000000-0000-0000-0000-000000000042";
const shift="40000000-0000-0000-0000-000000000039";
const sale="50000000-0000-0000-0000-000000000039";
const refund="60000000-0000-0000-0000-000000000039";
const secret="v39-lab-session-only-super-secret".repeat(3);
const codec=makeLocalSessionCodec(secret);
const token=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const managerToken=codec.issue({store_id:store,user_id:manager,role:"manager"});
const wrongManager=codec.issue({store_id:otherStore,user_id:another,role:"manager"});
const otherCashier=codec.issue({store_id:store,user_id:another,role:"cashier"});
const argsSeen=[];
const pool={
 connect:async()=>{throw Error("no real connection for unit test");},
 query:async(sql,args)=>{
  if(sql.startsWith("SELECT role,enabled,session_version,locked_until FROM zhirox_local.local_users")){
   return {rows:[{role:args[1]===manager||args[1]===another?"manager":"cashier",
    enabled:true,session_version:1,locked_until:null}]};
  }
  argsSeen.push({sql,args});
  assert.match(sql,/^SELECT /);
  if(sql.includes("refund_full_line_v39")){
   if(args[2]!==manager)throw Object.assign(Error("denied"),{code:"P3901"});
   return {rows:[{refund_id:refund,sale_id:sale,line_no:1,refund_minor:"2500",
    restock:true,created_at:"2026-10-30T10:00:00Z",replayed:false}]};
  }
  if(sql.includes("receipt_snapshots_v34")){
   return {rows:args[0]===store?[{sale_id:sale,line_no:1,name_snapshot:"Test item",
    line_total_minor:"2500",refunded:false}]:[]};
  }
  throw Error("unexpected query: "+sql);
 }
};
async function serve(fn){
 argsSeen.length=0;
 const server=createServer(createLocalRefundHandlerV39({pool,secret}));
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(done=>server.close(done));}
}
const data={refund_id:refund,sale_id:sale,line_no:1,shift_id:shift,restock:true,reason:"Sealed original package"};
function request(base,path,method="GET",body=null,t=token,approver=managerToken){
 return fetch(base+path,{method,
  headers:{...(t?{Authorization:"Bearer "+t}:{}),
   ...(approver?{"x-zhirox-manager-token":approver}:{}),
   ...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
}
test("refund requires two separate valid identities from same store",async()=>{
 await serve(async base=>{
  const url="/api/local/v39/refund";
  assert.equal((await request(base,url,"POST",data,null,managerToken)).status,401);
  assert.equal((await request(base,url,"POST",data,token,null)).status,403);
  assert.equal((await request(base,url,"POST",data,token,wrongManager)).status,403);
  assert.equal((await request(base,url,"POST",data,otherCashier,managerToken)).status,401);
  assert.equal((await request(base,url,"POST",data,token,otherCashier)).status,403);
  const response=await request(base,url,"POST",data);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.refund.refund_minor,"2500");
  assert.deepEqual(argsSeen[0].args,[store,cashier,manager,shift,refund,sale,1,true,data.reason]);
  assert.ok(argsSeen.every(x=>x.sql.startsWith("SELECT ")));
 });
});
test("server refuses browser money/product edits and unverified sales",async()=>{
 await serve(async base=>{
  const url="/api/local/v39/refund";
  for(const extra of [{refund_minor:1},{product_id:cashier},{cashier_id:cashier},
   {manager_id:manager},{total_minor:0}]){
   assert.equal((await request(base,url,"POST",{...data,...extra})).status,400);
  }
  for(const corrupt of [{line_no:0},{restock:1},{refund_id:"not-a-uuid"},
   {reason:"x"},{reason:" padded "}]){
   assert.equal((await request(base,url,"POST",{...data,...corrupt})).status,400);
  }
  assert.equal((await request(base,"/api/local/v39/refundable-lines?sale_id="+sale)).status,200);
  assert.equal((await request(base,"/api/local/v39/refundable-lines?sale_id="+sale+"&line=1")).status,400);
  assert.equal((await request(base,url,"GET")).status,405);
  assert.equal(argsSeen.filter(x=>x.sql.includes("refund_full_line_v39")).length,0);
 });
});
