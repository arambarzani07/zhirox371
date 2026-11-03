import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createFixedPackCatalogHandlerV110} from "../fixed-pack-catalog-server-v110.mjs";
import {makeLocalSessionCodec} from "../local-session.mjs";

const secret="v110-isolated-only-test-secret-".repeat(3);
const store="11000000-0000-4000-8000-000000000510";
const owner="11000000-0000-4000-8000-000000000511";
const product="11000000-0000-4000-8000-000000000512";
const code=makeLocalSessionCodec(secret);
const token=role=>code.issue({user_id:owner,store_id:store,role,session_version:1});
const request=()=>({
 request_id:"11000000-0000-4000-8000-000000000513",
 product_id:product,kind:"bundle",name:"دەستەی ئاو",
 barcode:"BUNDLE-V110",aliases:["BUNDLE-ALIAS"],units_per_pack:6,
 price_minor:2700,expected_version:1
});
const mock=(role="owner")=>{
 const calls=[];
 let failure;
 const pool={
  connect:async()=>({query:pool.query,release(){}}),
  query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2"))
    return {rows:[{role,enabled:true,session_version:1,locked_until:null}]};
   if(sql.includes("register_fixed_pack_v110")){
    if(failure)throw Object.assign(Error("test SQL error"),{code:failure});
    return {rows:[{next_version:"2",replayed:false}]};
   }
   throw Error("unexpected mock query "+sql);
  }
 };
 return {pool,calls,fail:code=>{failure=code;}};
};
async function serve({pool,enabled=true},fn){
 const server=createServer(createFixedPackCatalogHandlerV110({pool,secret,enabled}));
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
async function post(origin,body,tkn=token("owner")){
 return fetch(origin+"/api/local/v110/fixed-pack",{
  method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tkn},
  body:JSON.stringify(body)
 });
}
test("V110 catalog HTTP write path disabled by default",async()=>{
 const {pool,calls}=mock();
 await serve({pool,enabled:false},async origin=>{
  const response=await post(origin,request());
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,"disposable_catalog_disabled");
 });
 assert.equal(calls.length,0);
});
test("V110 registration requires a live owner or manager session, not cashier",async()=>{
 const {pool,calls}=mock("cashier");
 await serve({pool},async origin=>{
  const response=await post(origin,request(),token("cashier"));
  assert.equal(response.status,401);
  assert.equal((await response.json()).error,"catalog_manager_required");
 });
 assert.ok(calls.every(c=>!c.sql.includes("register_fixed_pack_v110")));
});
test("V110 registers primary and aliases with actor/store/version bound in SQL",async()=>{
 const {pool,calls}=mock();
 await serve({pool},async origin=>{
  const response=await post(origin,request());
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,next_version:2,replayed:false});
 });
 const write=calls.find(x=>x.sql.includes("register_fixed_pack_v110"));
 assert.ok(write);
 assert.deepEqual(write.args,[store,owner,1,request().request_id,product,"bundle",
  "دەستەی ئاو","BUNDLE-V110",["BUNDLE-ALIAS"],6,2700,1]);
});
test("V110 rejects malformed, duplicated or extra-field barcodes before mutation",async()=>{
 const {pool,calls}=mock();
 await serve({pool},async origin=>{
  for(const bad of [
   {...request(),aliases:["BUNDLE-V110"]},
   {...request(),units_per_pack:1},
   {...request(),price_minor:2700.5},
   {...request(),expected_version:0},
   {...request(),other_store_id:store},
   {...request(),barcode:"with whitespace"},
   {...request(),aliases:Array(31).fill("ALIASTEST")}
  ]){
   const response=await post(origin,bad);
   assert.equal(response.status,400);
  }
 });
 assert.ok(calls.every(c=>!c.sql.includes("register_fixed_pack_v110")));
});
test("V110 maps SQL stale versions and duplicate barcode to safe conflicts",async()=>{
 const fixture=mock();
 await serve({pool:fixture.pool},async origin=>{
  for(const [dbCode,apiError] of [
   ["P1102","stale_catalog_version"],
   ["23505","barcode_conflict_or_replay_mismatch"],
   ["P0110","disposable_database_required"]
  ]){
   fixture.fail(dbCode);
   const response=await post(origin,request());
   assert.equal(response.status,dbCode==="P0110"?403:409);
   assert.equal((await response.json()).error,apiError);
  }
 });
});
