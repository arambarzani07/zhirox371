import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(resolve(root,"operations.js"),"utf8");
const start=source.indexOf("async function submitDirectMarkdown(e){");
const end=source.indexOf('$("offers-discounts-list")?.addEventListener("click",',start);
assert.ok(start>=0&&end>start,"Direct markdown must remain a guarded handler");
const code=source.slice(start,end);
const stored={
 version:4,name:"تەماتە",sku:"2700001",plu:"2700001",
 base_unit:"kg",sale_mode:"both",currency:"IQD",
 unit_barcode:"2700001",unit_alias_barcodes:["2700002"],
 unit_sale_price_iqd:1250,unit_purchase_price_iqd:700,
 carton:{barcode:"627001",name:"کارتۆن",alias_barcodes:["627002"],
   units_per_carton:12,sale_price_iqd:14000,purchase_price_iqd:9500}
};
function fixture({role="owner",value="1000",original=stored,rpcError=null,
                 inventoryError=null,localPrice=1250}={}){
 const input={"disc-md-product":{value:"tomato"},"disc-md-new-price":{value}};
 const calls=[],notices=[],locked=[];
 const db={rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==="retail_product_snapshot_v19")
     return {data:original,error:rpcError?.read||null};
   if(name==="retail_update_product_v15")
     return {data:{id:"tomato"},error:rpcError?.save||null};
   throw Error("Unknown function "+name);
 }};
 const ctx=vm.createContext({
   db,role,busy:false,store:{id:"store"},products:[{id:"tomato",name:"تەماتە",price_minor:localPrice}],
   $:k=>input[k],msg:(id,message,kind)=>notices.push({id,message,kind}),
   lock:x=>locked.push(x),safe:e=>String(e?.message||e),
   loadInventory:async()=>{if(inventoryError)throw inventoryError;},
   syncDirectMarkdownPreview:()=>{},renderOffersDiscountsView:()=>{},
   money:x=>x.toLocaleString("en-US")+" IQD"
 });
 vm.runInContext(code,ctx);
 return {ctx,calls,notices,locked,run:()=>ctx.submitDirectMarkdown({preventDefault(){}})};
}
test("Owner markdown uses only one atomic edit RPC with snapshot and expected version",async()=>{
 const f=fixture();await f.run();
 assert.deepEqual(f.calls.map(x=>x.name),["retail_product_snapshot_v19","retail_update_product_v15"]);
 const q=f.calls[1].args;
 assert.equal(q.p_expected_version,4);
 assert.equal(q.p_catalog.unit_sale_price_iqd,1000);
 assert.equal(q.p_catalog.unit_barcode,"2700001");
 assert.equal(q.p_catalog.unit_alias_barcodes[0],"2700002");
 assert.equal(q.p_catalog.carton.units_per_carton,12);
 assert.equal(q.p_catalog.carton.alias_barcodes[0],"627002");
 assert.equal(q.p_catalog.unit_purchase_price_iqd,700);
 assert.equal(f.notices.at(-1).kind,"success");
 assert.deepEqual(f.locked,[true,false]);
});
test("Cashier or manager cannot edit product prices; prices never change locally before server save",async()=>{
 for(const role of ["cashier","manager"]){
   const f=fixture({role});await f.run();
   assert.equal(f.calls.length,0);
   assert.equal(f.notices.at(-1).kind,"error");
 }
 assert.doesNotMatch(code,/db\.from\(["']retail_products["']\)/);
 assert.doesNotMatch(code,/db\.from\(["']retail_barcodes["']\)/);
 assert.doesNotMatch(code,/p\.price_minor\s*=\s*newPrice/);
});
test("Rejects price increases, zero, fractions and stale local price",async()=>{
 for(const value of ["1250","1400","0","-2","100.5","", "1000000000"]){
   const f=fixture({value});await f.run();
   assert.equal(f.calls.some(x=>x.name==="retail_update_product_v15"),false,value);
   assert.equal(f.notices.at(-1).kind,"error",value);
 }
 const stale=fixture({localPrice:1300});await stale.run();
 assert.deepEqual(stale.calls.map(x=>x.name),["retail_product_snapshot_v19"]);
 assert.match(stale.notices.at(-1).message,/سێرڤەر/);
});
test("Version conflict, server failures and unsupported cartons fail closed",async()=>{
 const conflict=fixture({rpcError:{save:{code:"40001",message:"conflict"}}});await conflict.run();
 assert.equal(conflict.notices.at(-1).kind,"error");
 assert.match(conflict.notices.at(-1).message,/گۆڕاوە/);
 const nonUnit=fixture({original:{...stored,sale_mode:"carton",unit_barcode:""}});await nonUnit.run();
 assert.equal(nonUnit.calls.length,1);
 assert.equal(nonUnit.notices.at(-1).kind,"error");
 const noNetwork=fixture({rpcError:{read:{message:"offline"}}});await noNetwork.run();
 assert.equal(noNetwork.calls.length,1);
 assert.equal(noNetwork.notices.at(-1).kind,"error");
});
test("Acknowledges committed price even if UI refresh fails",async()=>{
 const f=fixture({inventoryError:new Error("refresh failed")});await f.run();
 assert.equal(f.calls.at(-1).name,"retail_update_product_v15");
 assert.match(f.notices.at(-1).message,/پاشەکەوت کرا/);
});
