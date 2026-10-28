import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=n=>readFileSync(resolve(root,n),"utf8");
const window={};
new Function("window",read("product-catalog.js"))(window);
const parse=window.RetailCatalog.fromForm;
const valid=new Map([["name","شیر"],["barcode","6260001112223"],["price","1000"]]);
const advanced=new Map([...valid,["sku","FOOD-101"],["plu","0000020"],["purchase_price","750"],
 ["extra_barcodes","6260001112247\n6260001112254"],["carton_name","کارتۆن شیر"],
 ["carton_barcode","6260001112230"],["extra_carton_barcodes","6260001112261\n6260001112278"],["units_per_carton","12"],["carton_purchase_price","8500"],["carton_price","11000"]]);
test("legacy single-unit product form keeps original secure atomic RPC",()=>{
 const d=parse(valid);assert.equal(d.advanced,false);
 assert.equal(d.unit_sale_price_iqd,1000);assert.equal(d.carton,null);
 assert.deepEqual(d.unit_alias_barcodes,[]);
});
test("full catalogue retains cost, sale price, aliases, SKU, PLU and carton structure in one item",()=>{
 const d=parse(advanced);
 assert.equal(d.advanced,true);assert.equal(d.sku,"FOOD-101");assert.equal(d.plu,"0000020");
 assert.equal(d.unit_purchase_price_iqd,750);assert.equal(d.unit_sale_price_iqd,1000);
 assert.deepEqual(d.unit_alias_barcodes,["6260001112247","6260001112254"]);
 assert.deepEqual(d.carton,{name:"کارتۆن شیر",barcode:"6260001112230",alias_barcodes:["6260001112261","6260001112278"],units_per_carton:12,
  purchase_price_iqd:8500,sale_price_iqd:11000});
 assert.equal(d.currency,"IQD");
});
test("same product never accepts repeated barcode across unit, alias and carton",()=>{
 const bad=new Map(advanced);bad.set("carton_barcode","6260001112247");
 assert.throws(()=>parse(bad),/دووبارە/);
 const bad2=new Map(advanced);bad2.set("extra_barcodes","6260001112254\n6260001112254");
 assert.throws(()=>parse(bad2),/دووبارە/);
 const bad3=new Map(advanced);bad3.set("extra_carton_barcodes","6260001112261\n6260001112261");
 assert.throws(()=>parse(bad3),/دووبارە/);
 const bad4=new Map(advanced);bad4.set("extra_carton_barcodes","6260001112247");
 assert.throws(()=>parse(bad4),/دووبارە/);
 const bad5=new Map(advanced);bad5.set("extra_carton_barcodes","6260001112230");
 assert.throws(()=>parse(bad5),/دووبارە/);
});
test("carton aliases without primary carton barcode cannot be registered",()=>{
 const invalid=new Map(valid);
 invalid.set("extra_carton_barcodes","6260001112261");
 assert.throws(()=>parse(invalid),/پێویستن/);
});
test("limits apply independently to both types of barcode aliases",()=>{
 for(const field of ["extra_barcodes","extra_carton_barcodes"]){
  const invalid=new Map(advanced);
  invalid.set(field,Array.from({length:31},(_,i)=>"62600013"+String(i).padStart(5,"0")).join("\n"));
  assert.throws(()=>parse(invalid),/سنوور/);
 }
});
test("carton requires a paired unique barcode, units per carton and its OWN sale price",()=>{
 for(const [key,val] of [["carton_barcode",""],["units_per_carton",""],["carton_price",""]]){
  const bad=new Map(advanced);bad.set(key,val);assert.throws(()=>parse(bad),/پێویستن/);
 }
 for(const v of ["1","0","2.5","-3","100001"]){
  const bad=new Map(advanced);bad.set("units_per_carton",v);
  assert.throws(()=>parse(bad),/نادروستە/);
 }
});
test("cost and selling prices must be safe, nonnegative whole IQD amounts",()=>{
 for(const v of ["-1","1.2","1000000000","Infinity","NaN"]){
  const bad=new Map(advanced);bad.set("purchase_price",v);assert.throws(()=>parse(bad),/نادروستە/);
 }
 const zero=new Map(valid);zero.set("price","0");assert.equal(parse(zero).unit_sale_price_iqd,0);
 const blank=new Map(valid);blank.set("price","");assert.throws(()=>parse(blank),/پێویستە/);
});
test("product form owns barcode definitions; cashier remains read-only and uses server carton pricing",()=>{
 const html=read("workspace.html"),owner=read("workspace.js"),cash=read("operations.js");
 for(const n of ["sku","plu","name","barcode","extra_barcodes","carton_barcode",
  "units_per_carton","purchase_price","price","carton_purchase_price","carton_price","extra_carton_barcodes"])
  assert.match(html,new RegExp('name="'+n+'"'),"catalog field missing "+n);
 assert.match(owner,/RetailCatalog\.fromForm/);
 assert.match(owner,/retail_register_product_v14/);
 assert.match(owner,/PGRST202/);
 assert.match(owner,/retail_create_product/);
 assert.match(cash,/retail_scan_catalog_v16/);
 assert.match(cash,/retail_checkout_packs_v16/);
 assert.match(cash,/b\.unit_type==="carton"/);
 const catalogHandler=cash.slice(cash.indexOf("async function saveOpsCatalogProduct(e){"),cash.indexOf("async function refreshLowStockView(){"));
 assert.match(catalogHandler,/retail_register_product_v14/);
 assert.match(catalogHandler,/role!=="owner"/);
 assert.doesNotMatch(catalogHandler,/db\.from\(["']retail_products|db\.from\(["']retail_barcodes/);
 assert.match(cash,/retail_checkout_cash/);
});
