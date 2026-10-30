import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalCashierHandlerV32} from "../local-cashier-server-v32.mjs";

const store="10000000-0000-0000-0000-000000000032";
const otherStore="10000000-0000-0000-0000-000000000033";
const cashier="20000000-0000-0000-0000-000000000032";
const requestId="30000000-0000-0000-0000-000000000032";
const sale="40000000-0000-0000-0000-000000000032";
const secret="v32-test-auth-only-secret-".repeat(3);
const token=makeLocalSessionCodec(secret).issue({store_id:store,user_id:cashier,role:"cashier"});
const other=makeLocalSessionCodec(secret).issue({store_id:otherStore,user_id:cashier,role:"cashier"});
function pool(){
 const calls=[],intent={request_id:requestId,state:"committed",lines:[{barcode:"6260053183974",qty:1}],
 expected_total_minor:"2500",sale_id:sale,receipt_no:"9",total_minor:"2500"};
 return {calls,
 query:async(sql,args)=>{
  if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2")){
   return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
  }
  calls.push({sql,args});
  assert.match(sql,/^SELECT /);
  if(sql.includes("FROM zhirox_local.sales"))return {rows:args[0]===store?[{
   sale_id:sale,receipt_no:"9",total_minor:"2500",created_at:"2026-10-30T08:00:00Z"
  }]:[]};
  if(sql.includes("FROM zhirox_local.checkout_intents_v31"))return {
   rows:args[0]===store&&args[1]===cashier&&args[2]===requestId?[intent]:[]
  };
  throw Error("unexpected query");
 },connect:async()=>{throw Error("read routes should not open write connections");}};
}
async function serve(db,fn){
 const server=createServer(createLocalCashierHandlerV32({pool:db,secret}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
const get=(base,path,t=token)=>fetch(base+path,{
 headers:t?{Authorization:"Bearer "+t}:{}
});
test("V32 receipt history is authenticated, store/cashier scoped and SELECT-only",async()=>{
 const db=pool();
 await serve(db,async base=>{
  assert.equal((await get(base,"/api/local/v32/receipts",null)).status,401);
  assert.equal((await get(base,"/api/local/v32/receipts",other)).status,200);
  const res=await get(base,"/api/local/v32/receipts?limit=10");
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.receipts.length,1);
  assert.equal(body.receipts[0].receipt_no,"9");
  assert.deepEqual(db.calls.at(-1).args,[store,cashier,10]);
  assert.equal(db.calls.every(c=>c.sql.startsWith("SELECT ")),true);
 });
});
test("V32 journal lookup cannot query another cashier/store and never mutates",async()=>{
 const db=pool();
 await serve(db,async base=>{
  const p="/api/local/v32/intent?request_id="+requestId;
  const one=await get(base,p);
  assert.equal(one.status,200);
  assert.equal((await one.json()).intent.state,"committed");
  assert.deepEqual(db.calls.at(-1).args,[store,cashier,requestId]);
  assert.equal((await get(base,p,other)).status,200);
  const absent=await (await get(base,p,other)).json();
  assert.equal(absent.intent,null);
  assert.equal((await get(base,p+"&store_id="+otherStore)).status,400);
  assert.equal((await get(base,"/api/local/v32/intent?request_id=bad")).status,400);
  assert.equal((await get(base,"/api/local/v32/receipts?limit=100")).status,400);
  assert.equal((await get(base,"/api/local/v32/receipts?limit=10&limit=10")).status,400);
 });
});
test("V32 rejects mutations to read-only receipt and intent endpoints",async()=>{
 const db=pool();
 await serve(db,async base=>{
  for(const path of ["/api/local/v32/receipts","/api/local/v32/intent"]){
   const res=await fetch(base+path,{method:"POST",headers:{Authorization:"Bearer "+token}});
   assert.equal(res.status,405);
  }
  assert.equal(db.calls.length,0);
 });
});
test("V32 startup is disabled unless explicitly selected",async()=>{
 const {startLocalCashierV32}=await import("../local-cashier-server-v32.mjs");
 const v=process.env.ZHIROX_V32_LOCAL_CASHIER_TEST_ENABLED;
 delete process.env.ZHIROX_V32_LOCAL_CASHIER_TEST_ENABLED;
 try{await assert.rejects(startLocalCashierV32(),/v32_local_test_disabled/);}
 finally{if(v!==undefined)process.env.ZHIROX_V32_LOCAL_CASHIER_TEST_ENABLED=v;}
});
