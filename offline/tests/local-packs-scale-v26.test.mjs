import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {decodeScale27} from "../scale27-v26.mjs";
import {createLocalPacksScaleHandlerV26} from "../local-packs-scale-server-v26.mjs";
import {makeLocalSessionCodec} from "../local-session.mjs";

const secret="v26-dev-only-secret-".repeat(3);
const store="10000000-0000-0000-0000-000000000026";
const user="20000000-0000-0000-0000-000000000026";
const water="30000000-0000-0000-0000-000000000026";
const tomato="30000000-0000-0000-0000-000000000027";
const token=makeLocalSessionCodec(secret).issue({user_id:user,store_id:store,role:"cashier"});
const authHeader={Authorization:"Bearer "+token};
function mock(){
 const calls=[];
 const pool={connect:async()=>({query:pool.query,release(){}}),query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2"))
    return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
   if(sql.includes("FROM zhirox_local.products p WHERE p.store_id=$1 AND p.plu=$2")){
    assert.deepEqual(args,[store,"00001"]);
    return {rows:[{id:tomato,name:"تەماتە",price_minor:"11000",stock_base_units:"2000"}]};
   }
   if(sql.includes("FROM zhirox_local.barcodes b JOIN zhirox_local.products p")){
    assert.equal(args[0],store);
    return {rows:args[1]==="6260053183998"?
      [{id:water,name:"ئاو",base_price_minor:"500",
        stock_base_units:"30",quantity_base_units:12,sale_mode:"carton",sale_price_minor:"5500"}]:
      [{id:water,name:"ئاو",base_price_minor:"500",
        stock_base_units:"30",quantity_base_units:1,sale_mode:"unit",sale_price_minor:null}]};
   }
   throw Error("Unexpected query: "+sql);
 }};
 return {calls,pool};
}
async function serve(pool,fn){
 const server=createServer(createLocalPacksScaleHandlerV26({pool,secret}));
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(done=>server.close(done));}
}
test("Scale prefix 27 PLU and grams need valid EAN13 checksum",()=>{
 assert.deepEqual(decodeScale27("2700001004806"),
  {code:"2700001004806",plu:"00001",grams:480,kg:"0.480"});
 assert.deepEqual(decodeScale27("2700001002451"),
  {code:"2700001002451",plu:"00001",grams:245,kg:"0.245"});
 assert.equal(decodeScale27("2700001004805"),null);
 assert.equal(decodeScale27("2700000004803"),null);
 assert.equal(decodeScale27("2700001000005"),null);
 assert.equal(decodeScale27("270000100480"),null);
});
test("Anonymous V26 scan rejected with no catalog disclosure",async()=>{
 const {calls,pool}=mock();
 await serve(pool,async url=>{
  const r=await fetch(url+"/api/local/v26/scan?code=6260053183998");
  assert.equal(r.status,401);
  assert.equal(calls.length,0);
 });
});
test("V26 server returns independent carton pack price + stock units",async()=>{
 const {calls,pool}=mock();
 await serve(pool,async url=>{
  const r=await fetch(url+"/api/local/v26/scan?code=6260053183998",{headers:authHeader});
  assert.equal(r.status,200);
  const p=(await r.json()).product;
  assert.equal(p.sale_mode,"carton");
  assert.equal(p.quantity_base_units,12);
  assert.equal(p.price_minor,"5500");
  assert.equal(p.base_unit,"unit");
  assert.ok(calls.find(x=>x.sql.includes("FROM zhirox_local.barcodes b JOIN")).args[0]===store);
 });
});
test("V26 weighted product quote uses integer grams and IQD half-up",async()=>{
 const {pool}=mock();
 await serve(pool,async url=>{
  const r=await fetch(url+"/api/local/v26/scan?code=2700001004806",{headers:authHeader});
  assert.equal(r.status,200);
  const p=(await r.json()).product;
  assert.equal(p.base_unit,"gram");
  assert.equal(p.sale_mode,"scale");
  assert.equal(p.weight_grams,480);
  assert.equal(p.quantity_base_units,480);
  assert.equal(p.unit_price_minor,"11000");
  assert.equal(p.price_minor,"5280");
  const bad=await fetch(url+"/api/local/v26/scan?code=2700001004805",{headers:authHeader});
  assert.equal(bad.status,400);
  assert.equal((await bad.json()).error,"invalid_scale_label");
 });
});
