import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createLocalPilotHandler } from "../local-pilot-server-v4.mjs";
import { makeLocalSessionCodec } from "../local-session.mjs";

const secret="pilot-test-secret-".repeat(3);
const store="10000000-0000-0000-0000-000000000001";
const user="20000000-0000-0000-0000-000000000002";
const product="30000000-0000-0000-0000-000000000003";
const token=makeLocalSessionCodec(secret).issue({user_id:user,store_id:store,role:"cashier"});
function mockPool(packUnits="1") {
  const queries=[];
  const query=async(sql,args=[])=>{
    queries.push([sql,args]);
    if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2")) {
      return {rows:[{enabled:true,role:"cashier",session_version:1,locked_until:null}]};
    }
    if(sql.includes("FROM zhirox_local.barcodes b JOIN")) {
      return {rows:args[1]==="6260053183974"?[{product_id:product,name:"Test Item",price_minor:"2500",
        stock_base_units:"20",quantity_base_units:packUnits}]:[]};
    }
    throw Error("unexpected SQL query");
  };
  return {queries,connect:async()=>({query,release(){}}),query};
}
async function run(pool, callback) {
  const server=createServer(createLocalPilotHandler({pool,secret}));
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try { await callback("http://127.0.0.1:"+server.address().port); }
  finally { await new Promise(resolve=>server.close(resolve)); }
}
test("pilot page is local-only and contains no remote CDN dependency",async()=>{
 const pool=mockPool();
 await run(pool,async base=>{
   const r=await fetch(base+"/pilot");
   assert.equal(r.status,200);
   const html=await r.text();
   assert.match(html,/چوونەژوورەوەی ناوخۆیی/);
   assert.doesNotMatch(html,/https?:\/\//);
   assert.doesNotMatch(html,/@supabase/);
 });
});
test("barcode lookup rejects anonymous requests before reading catalog",async()=>{
 const pool=mockPool();
 await run(pool,async base=>{
   const r=await fetch(base+"/api/local/v4/barcode?code=6260053183974");
   assert.equal(r.status,401);
   assert.equal(pool.queries.length,0);
 });
});
test("barcode lookup uses store from authenticated token only",async()=>{
 const pool=mockPool();
 await run(pool,async base=>{
   const r=await fetch(base+"/api/local/v4/barcode?code=6260053183974&store_id=wrong",{
     headers:{Authorization:"Bearer "+token}
   });
   assert.equal(r.status,200);
   const data=await r.json();
   assert.equal(data.product.id,product);
   const catalogCall=pool.queries.find(([sql])=>sql.includes("FROM zhirox_local.barcodes b JOIN"));
   assert.deepEqual(catalogCall[1],[store,"6260053183974"]);
 });
});
test("unsupported carton alias fails closed instead of wrong price",async()=>{
 const pool=mockPool("12");
 await run(pool,async base=>{
   const r=await fetch(base+"/api/local/v4/barcode?code=6260053183974",{
     headers:{Authorization:"Bearer "+token}
   });
   assert.equal(r.status,409);
   assert.equal((await r.json()).error,"package_checkout_not_supported");
 });
});
