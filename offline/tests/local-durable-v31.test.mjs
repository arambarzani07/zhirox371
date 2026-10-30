import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalDurableHandlerV31} from "../local-durable-server-v31.mjs";

const store="10000000-0000-0000-0000-000000000031";
const cashier="30000000-0000-0000-0000-000000000031";
const reqid="40000000-0000-0000-0000-000000000031";
const secret="V31-LOCAL-ISOLATED-TEST-SECRET-".repeat(3);
const token=makeLocalSessionCodec(secret).issue({user_id:cashier,store_id:store,role:"cashier"});
const source={request_id:reqid,expected_total_minor:2500,lines:[{barcode:"6260053183974",qty:2}]};
function db(){
 const calls=[],intent={...source,state:"prepared",sale_id:null,receipt_no:null,total_minor:null};
 return {calls,query:async(sql,args)=>{
  if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2")){
   assert.deepEqual(args,[store,cashier]);
   return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
  }
  throw Error("unknown direct DB query");
 },connect:async()=>({query:async(sql,args)=>{
  calls.push({sql,args});
  assert.equal(args[0],store);assert.equal(args[1],cashier);
  if(sql.includes("prepare_checkout_v31")){
   assert.deepEqual(args,[store,cashier,reqid,JSON.stringify(source.lines),2500]);
   return {rows:[intent]};
  }
  if(sql.includes("checkout_intents_v31"))
   return {rows:[intent]};
  if(sql.includes("commit_checkout_v31")){
   assert.deepEqual(args,[store,cashier,reqid]);
   return {rows:[{sale_id:"20000000-0000-0000-0000-000000000031",
    receipt_no:"1",total_minor:"2500",replayed:false}]};
  }
  if(sql.includes("cancel_checkout_v31"))
   return {rows:[{state:"cancelled"}]};
  throw Error("unknown SQL");
 },release(){}})};
}
async function serve(pool,fn){
 const server=createServer(createLocalDurableHandlerV31({pool,secret}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
const post=(base,path,body,authorization=token)=>fetch(base+"/api/local/v31/"+path,{
 method:"POST",headers:{"Content-Type":"application/json",
 ...(authorization?{Authorization:"Bearer "+authorization}:{})},body:JSON.stringify(body)
});
const get=(base,authorization=token)=>fetch(base+"/api/local/v31/recover",{
 headers:authorization?{Authorization:"Bearer "+authorization}:{}
});
test("V31 API binds all journal/receipt SQL to signed store and cashier identity",async()=>{
 const pool=db();
 await serve(pool,async base=>{
  const anon=await post(base,"prepare",source,null);assert.equal(anon.status,401);
  const imp=await post(base,"prepare",{...source,store_id:store});
  assert.equal(imp.status,400);
  const forged=await post(base,"prepare",{...source,cashier_id:cashier});
  assert.equal(forged.status,400);
  const invalid=await post(base,"prepare",{...source,expected_total_minor:-3});
  assert.equal(invalid.status,400);
  assert.equal(pool.calls.length,0);
  const prep=await post(base,"prepare",source);
  assert.equal(prep.status,200);
  assert.equal((await prep.json()).intent.state,"prepared");
  const recovery=await get(base);
  assert.equal(recovery.status,200);
  assert.equal((await recovery.json()).intent.request_id,reqid);
  const done=await post(base,"commit",{request_id:reqid});
  assert.equal(done.status,200);
  assert.equal((await done.json()).receipt.total_minor,"2500");
  const cancelled=await post(base,"cancel",{request_id:reqid});
  assert.equal(cancelled.status,200);
  assert.equal((await cancelled.json()).state,"cancelled");
  assert.equal(pool.calls.length,4);
 });
});
test("V31 recovery requires authentication; no cross-store request identity",async()=>{
 const pool=db();
 await serve(pool,async base=>{
  assert.equal((await get(base,null)).status,401);
  assert.equal((await post(base,"commit",{request_id:"not-uuid"})).status,400);
  assert.equal((await post(base,"cancel",{request_id:reqid,store_id:store})).status,400);
  assert.equal(pool.calls.length,0);
 });
});
test("V31 maps stale/competing persisted intents to a visible conflict",async()=>{
 const pool=db();
 const connect=pool.connect;
 pool.connect=async()=>{
  const client=await connect();
  return {...client,query:async()=>{const err=Error("unfinished");err.code="P3102";throw err;}};
 };
 await serve(pool,async base=>{
  const response=await post(base,"prepare",source);
  assert.equal(response.status,409);
  assert.deepEqual(await response.json(),{error:"unfinished_checkout"});
 });
});
