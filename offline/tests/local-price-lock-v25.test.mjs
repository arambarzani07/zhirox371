import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalPosHandlerV3} from "../local-pos-api-v3.mjs";

const secret="v25-isolated-test-token-".repeat(3);
const store="10000000-0000-0000-0000-000000000025";
const user="20000000-0000-0000-0000-000000000025";
const product="30000000-0000-0000-0000-000000000025";
const request="40000000-0000-0000-0000-000000000025";
const token=makeLocalSessionCodec(secret).issue({user_id:user,store_id:store,role:"cashier"});
const body=extra=>({request_id:request,lines:[{product_id:product,qty:1}],expected_total_minor:1250,...extra});
function createDb({priceChanged=false}={}){
 const sqlCalls=[];
 const pool={
  query:async(sql,args)=>{
   if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2")){
    assert.deepEqual(args,[store,user]);
    return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
   }
   throw Error("unexpected auth query");
  },
  connect:async()=>({query:async(sql,args)=>{
   sqlCalls.push({sql,args});
   if(priceChanged){const err=Error("expected price mismatch");err.code="P2501";throw err;}
   return {rows:[{sale_id:"00000000-0000-0000-0000-000000000025",
     receipt_no:"1",total_minor:"1250",replayed:false}]};
  },release(){}})
 };
 return {pool,sqlCalls};
}
async function serve(pool,fn){
 const server=createServer(createLocalPosHandlerV3({pool,secret}));
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
const post=(base,b,auth=token)=>fetch(base+"/api/local/v25/checkout",{
 method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer "+auth}:{})},
 body:JSON.stringify(b)
});
test("V25 requires valid auth, expected total and prohibits identity impersonation",async()=>{
 const {pool,sqlCalls}=createDb();
 await serve(pool,async base=>{
  const anonymous=await post(base,body(),null);assert.equal(anonymous.status,401);
  const bad=await post(base,body({expected_total_minor:-5}));assert.equal(bad.status,400);
  const missing=await post(base,body({expected_total_minor:undefined}));assert.equal(missing.status,400);
  const fractional=await post(base,body({expected_total_minor:1250.4}));assert.equal(fractional.status,400);
  const imp=await post(base,body({cashier_id:user}));assert.equal(imp.status,400);
  assert.equal(sqlCalls.length,0);
 });
});
test("V25 SQL derives store/cashier exclusively from verified session",async()=>{
 const {pool,sqlCalls}=createDb();
 await serve(pool,async base=>{
  const resp=await post(base,body());
  assert.equal(resp.status,200);
  assert.equal((await resp.json()).receipt.total_minor,"1250");
  assert.equal(sqlCalls.length,1);
  assert.match(sqlCalls[0].sql,/checkout_cash_v25/);
  assert.deepEqual(sqlCalls[0].args,
   [store,user,request,JSON.stringify([{product_id:product,qty:1}]),1250]);
 });
});
test("V25 price drift maps to explicit HTTP 409 without fake successful receipt",async()=>{
 const {pool,sqlCalls}=createDb({priceChanged:true});
 await serve(pool,async base=>{
  const response=await post(base,body());
  assert.equal(response.status,409);
  assert.deepEqual(await response.json(),{error:"price_changed"});
  assert.equal(sqlCalls.length,1);
 });
});
