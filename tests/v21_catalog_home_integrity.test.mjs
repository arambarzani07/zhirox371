import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(resolve(root,"operations.js"),"utf8");
const start=source.indexOf("async function saveOpsCatalogProduct(e){");
const end=source.indexOf("async function refreshLowStockView(){",start);
assert.ok(start>=0&&end>start,"inline catalog form must exist");
const code=source.slice(start,end);
function fixture(values={},opts={}){
 const fields=Object.fromEntries(Object.entries({
   "ops-cat-id":"","ops-cat-name":"شیر","ops-cat-barcode":"6260001112223",
   "ops-cat-price":"1250","ops-cat-unit":"unit","ops-cat-plu":"",
   "ops-catalog-form-box":""
 ,...values}).map(([k,v])=>[k,{value:v,hidden:false}]));
 const calls=[],messages=[];
 const original=opts.snapshot||{
   version:3,base_unit:"unit",sale_mode:"both",sku:"SKU-1",
   unit_alias_barcodes:["1112223334441"],
   unit_purchase_price_iqd:750,
   carton:{barcode:"6260001112230",name:"کارتۆن",
     units_per_carton:12,alias_barcodes:["6260001112261"],
     sale_price_iqd:11000,purchase_price_iqd:8500}
 };
 const ctx=vm.createContext({
  db:{rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==="retail_product_snapshot_v19")return {data:original,error:opts.snapshotError||null};
    return {data:"saved",error:opts.writeError||null};
  }},
  store:{id:"store"},role:opts.role||"owner",busy:false,
  $:key=>fields[key],lock:()=>{},msg:(id,text,kind)=>messages.push({id,text,kind}),
  safe:e=>String(e?.message||e),loadInventory:async()=>{},
  populateStockSelectors:()=>{},renderOpsCatalogList:()=>{}
 });
 vm.runInContext(code,ctx);
 return {ctx,calls,messages,fields,run:()=>ctx.saveOpsCatalogProduct({preventDefault(){}})};
}
// The owner removed the visual Home freeze. Only transactional catalog safety
// assertions continue below; no historical visual baseline is required.
test("Product creation is one atomic V14 RPC, never partial table writes",async()=>{
 const f=fixture();
 await f.run();
 assert.deepEqual(f.calls.map(c=>c.name),["retail_register_product_v14"]);
 const x=f.calls[0].args.p_catalog;
 assert.equal(x.name,"شیر");
 assert.equal(x.unit_sale_price_iqd,1250);
 assert.equal(x.unit_barcode,"6260001112223");
 assert.equal(x.sale_mode,"unit");
 assert.equal(f.fields["ops-catalog-form-box"].hidden,true);
 assert.doesNotMatch(code,/db\.from\(["']retail_products/);
 assert.doesNotMatch(code,/db\.from\(["']retail_barcodes/);
});
test("Atomic V15 editing retains carton, aliases, purchase cost and checks version",async()=>{
 const f=fixture({"ops-cat-id":"product","ops-cat-name":"شیری نوێ","ops-cat-price":"1500"});
 await f.run();
 assert.deepEqual(f.calls.map(c=>c.name),["retail_product_snapshot_v19","retail_update_product_v15"]);
 const saved=f.calls[1].args;
 assert.equal(saved.p_expected_version,3);
 assert.equal(saved.p_catalog.unit_sale_price_iqd,1500);
 assert.equal(saved.p_catalog.sku,"SKU-1");
 assert.deepEqual(Array.from(saved.p_catalog.unit_alias_barcodes),["1112223334441"]);
 assert.equal(saved.p_catalog.carton.barcode,"6260001112230");
 assert.equal(saved.p_catalog.carton.alias_barcodes[0],"6260001112261");
 assert.equal(saved.p_catalog.unit_purchase_price_iqd,750);
});
test("Rejects silent kg creation and unit conversion, no partial writes",async()=>{
 const kg=fixture({"ops-cat-unit":"kg"}); await kg.run();
 assert.equal(kg.calls.length,0);assert.match(kg.messages.at(-1).text,/کیلۆیی/);
 const convert=fixture({"ops-cat-id":"p","ops-cat-unit":"kg"});await convert.run();
 assert.deepEqual(convert.calls.map(x=>x.name),["retail_product_snapshot_v19"]);
 assert.match(convert.messages.at(-1).text,/گۆڕینی یەکە/);
});
test("Only the owner may mutate catalog, and invalid prices are rejected",async()=>{
 const cashier=fixture({}, {role:"cashier"});await cashier.run();
 assert.equal(cashier.calls.length,0);
 const invalid=fixture({"ops-cat-price":"1250.5"});await invalid.run();
 assert.equal(invalid.calls.length,0);
});
test("Stale version and RPC errors do not display false save success",async()=>{
 const f=fixture({"ops-cat-id":"p"},{writeError:{code:"40001",message:"conflict"}});
 await f.run();
 assert.deepEqual(f.calls.map(x=>x.name),["retail_product_snapshot_v19","retail_update_product_v15"]);
 assert.match(f.messages.at(-1).text,/بەکارهێنەرێکی تر/);
 assert.equal(f.fields["ops-catalog-form-box"].hidden,false);
});
