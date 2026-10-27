import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import "../cashier-v20-core.js";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const js=readFileSync(resolve(root,"operations.js"),"utf8");
const html=readFileSync(resolve(root,"operations.html"),"utf8");
const core=globalThis.CashierV20;
const tomato=(code,grams,price)=>({
 id:"tomato",name:"تەماتە",barcode:code,mode:"unit",isScale:true,
 scaleGrams:grams,scaleLabel:(grams/1000).toFixed(3)+" کگم",
 unitKgPrice:1250,price,units:grams/1000,qty:1
});
const water=(code="6290000000000",mode="unit",units=1,price=500)=>({
 id:"water",name:"ئاو",barcode:code,mode,isScale:false,scaleGrams:null,
 price,units,qty:1
});

test("Different weighted tomatoes retain their own label and exact 3-decimal kg",()=>{
 const first=core.add([],tomato("2700001002451",245,306),10);
 assert.equal(first.ok,true);
 const second=core.add(first.cart,tomato("2700001003800",380,475),10);
 // The business-rule layer uses scanned metadata; EAN13 checksum belongs to the server scanner.
 assert.equal(second.ok,true);
 assert.equal(second.cart.length,2);
 assert.deepEqual(second.cart.map(x=>x.units),[0.245,0.38]);
 assert.equal(second.cart.reduce((s,x)=>s+x.units,0),0.625);
 assert.equal(core.validate(second.cart,()=>10).subtotal,781);
 assert.equal(core.used(second.cart,"tomato"),0.625);
});
test("Rescanning an identical scale label cannot silently charge it twice",()=>{
 const one=core.add([],tomato("2700001002451",245,306),5);
 const again=core.add(one.cart,tomato("2700001002451",245,306),5);
 assert.equal(again.ok,false);
 assert.equal(again.reason,"duplicate_scale");
 assert.equal(one.cart.length,1);
});
test("Unit and carton duplicates merge only when barcode, price and pack match",()=>{
 let r=core.add([],water(),40);r=core.add(r.cart,water(),40);
 assert.equal(r.ok,true);assert.equal(r.cart.length,1);assert.equal(r.cart[0].qty,2);
 const newAlias=core.add(r.cart,water("6290000000001","unit",1,500),40);
 assert.equal(newAlias.ok,true);assert.equal(newAlias.cart.length,2);
 const carton=core.add(newAlias.cart,water("6290000000010","carton",12,5100),40);
 assert.equal(carton.ok,true);assert.equal(carton.cart.length,3);
 const invalidStock=core.add(carton.cart,water("6290000000010","carton",12,5100),15);
 assert.equal(invalidStock.ok,false);assert.equal(invalidStock.reason,"stock");
});
test("Changing basket quantity is an integer-only, stock-aware operation",()=>{
 const one=core.add([],water(),10);
 assert.equal(core.edit(one.cart,0,4,10).cart[0].qty,4);
 assert.equal(core.edit(one.cart,0,10,3).reason,"stock");
 assert.equal(core.edit(one.cart,0,2.5,10).reason,"quantity");
 assert.equal(core.edit(one.cart,0,-1,10).reason,"quantity");
 assert.equal(core.edit(one.cart,0,0,10).cart.length,0);
 assert.equal(one.cart[0].qty,1,"input array must stay immutable");
});
test("Weight is immutable; deleting its line is allowed",()=>{
 const one=core.add([],tomato("2700001002451",245,306),5);
 assert.equal(core.edit(one.cart,0,2,5).reason,"scale_immutable");
 assert.equal(core.edit(one.cart,0,0,5).cart.length,0);
});
test("Cumulative stock across different weighted packs cannot exceed kg inventory",()=>{
 const first=core.add([],tomato("2700001002451",245,306),0.5);
 const second=core.add(first.cart,tomato("2700001003800",380,475),0.5);
 assert.equal(second.ok,false);assert.equal(second.reason,"stock");
 assert.equal(core.validate(first.cart,()=>0.244).reason,"stock");
});
test("Pending checkout requires server-based price, package, and stock preflight",()=>{
 assert.match(js,/async function verifyCartAtServer\(\)/);
 assert.match(js,/db\.rpc\("retail_resolve_barcode_v18"/);
 assert.match(js,/Number\(data\.price_minor\)===line\.price/);
 assert.match(js,/Number\(data\.scale_grams\)===Number\(line\.scaleGrams\)/);
 assert.match(js,/window\.CashierV20\.validate\(cart,id=>latestStock\.get\(id\)\)/);
 assert.match(js,/if\(cart\.some\(x=>x\.outdated\)\)/);
 assert.match(js,/try\{await verifyCartAtServer\(\);\}/);
 assert.match(js,/requestId=crypto\.randomUUID\(\)/);
});
test("Scanner requires live server, no silent fallback for outages or duplicate labels",()=>{
 assert.match(js,/resolveBarcodeServer\(code,\{strict:true\}\)/);
 assert.match(js,/if\(strict\)return null/);
 assert.match(js,/if\(res\.error&&strict\)throw res\.error/);
 assert.match(js,/parseScaleBarcode\(code\)/);
 assert.match(js,/window\.CashierV20\.add\(cart,/);
 assert.match(js,/duplicate_scale:"ئەم لیبڵە/);
});
test("Locked Home unmodified; V20 modifies only cashier-owned UI and pure rules",()=>{
 assert.match(html,/<script src="\.\/cashier-v20-core\.js"><\/script>/);
 assert.match(html,/dir="rtl"/);
 assert.match(html,/min-width:1020px/);
 assert.match(js,/data\.removeLine/);
 assert.match(js,/data\.quantityLine/);
 assert.match(js,/line\.outdated/);
});