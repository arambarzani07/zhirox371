import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const fixture=readFileSync(resolve(root,"tests/browser/qa_supabase_fixture.js"),"utf8");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1140,height:820}});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.route("https://cdn.jsdelivr.net/**",r=>r.fulfill({
 status:200,contentType:"application/javascript",body:"/* isolated QA */"
}));
await page.addInitScript({content:fixture+"(() => {\nconst q=window.__retailQA,id=\"cccccccc-cccc-4ccc-8ccc-000000000017\";\nq.products.push({id,store_id:q.store.id,name:\"شیری 1 لیتر\",price_minor:1000,currency:\"IQD\",active:true,catalog_version:1});\nq.advancedCatalogs.push({id,name:\"شیری 1 لیتر\",sale_mode:\"both\",unit_barcode:\"6260001112223\",\n unit_alias_barcodes:[\"6260001112247\"],unit_sale_price_iqd:1000,\n carton:{barcode:\"6260001112230\",alias_barcodes:[\"6260001112261\"],\n units_per_carton:12,sale_price_iqd:11000}});\nfor(const code of [\"6260001112223\",\"6260001112247\"])q.barcodes.push({\n store_id:q.store.id,product_id:id,code,unit_type:\"unit\",units_per_scan:1,active:true});\nfor(const code of [\"6260001112230\",\"6260001112261\"])q.barcodes.push({\n store_id:q.store.id,product_id:id,code,unit_type:\"carton\",units_per_scan:12,active:true});\nq.barcodes.push({store_id:q.store.id,product_id:id,code:\"6260001112999\",\n unit_type:\"carton\",units_per_scan:12,active:false});\nq.stock.push({store_id:q.store.id,product_id:id,quantity:60});\n})();"});
try{
 await page.goto("http://127.0.0.1:8765/operations.html?view=stock",{waitUntil:"load"});
 await page.locator("#stock-panel").waitFor({state:"visible"});
 const id="cccccccc-cccc-4ccc-8ccc-000000000017";
 await page.locator("#stock-product").selectOption(id);
 await page.locator("#stock-mode").selectOption("carton");
 await page.locator("#stock-barcode").selectOption("6260001112261");
 await page.locator("#stock-quantity").fill("2");
 assert.equal(await page.locator("#stock-base-total").inputValue(),"24");
 assert.equal(await page.locator("#stock-barcode option").count(),2);
 assert.equal(await page.locator("#stock-barcode option[value='6260001112999']").count(),0);
 await page.locator("#stock-form button[type='submit']").click();
 await page.waitForFunction(()=>window.__retailQA.stockReceipts.length===1);
 let data=await page.evaluate(()=>{
 const q=window.__retailQA;return {
  stock:q.stock.find(x=>x.product_id==="cccccccc-cccc-4ccc-8ccc-000000000017").quantity,
  receipts:q.stockReceipts,audit:q.audit.filter(x=>x.action==="stock.receive_packs_v17")
 }});
 assert.equal(data.stock,84);
 assert.equal(data.receipts[0].base_units,24);
 assert.equal(data.audit.length,1);
 assert.match(await page.locator("#stock-list").innerText(),/7 کارتۆن \+ 0 دانە/);
 console.log("PASS V17 PC: carton alias receiving two packs converts 2*12=24 units and 84 units display as 7 cartons");

 await page.locator("#stock-product").selectOption(id);
 await page.locator("#stock-mode").selectOption("unit");
 await page.locator("#stock-barcode").selectOption("6260001112247");
 await page.locator("#stock-quantity").fill("3");
 assert.equal(await page.locator("#stock-base-total").inputValue(),"3");
 await page.locator("#stock-form button[type='submit']").click();
 await page.waitForFunction(()=>window.__retailQA.stockReceipts.length===2);
 data=await page.evaluate(()=>{
 const q=window.__retailQA;return {
  stock:q.stock.find(x=>x.product_id==="cccccccc-cccc-4ccc-8ccc-000000000017").quantity,
  receipts:q.stockReceipts,audit:q.audit.filter(x=>x.action==="stock.receive_packs_v17")
 }});
 assert.equal(data.stock,87);
 assert.equal(data.audit.length,2);
 assert.match(await page.locator("#stock-list").innerText(),/7 کارتۆن \+ 3 دانە/);
 console.log("PASS V17 PC: unit alias receiving 3 more units shares same stock, 7 cartons plus 3 loose");

 await page.locator("#stock-product").selectOption(id);
 await page.locator("#stock-mode").selectOption("carton");
 await page.locator("#stock-quantity").fill("0");
 assert.equal(await page.locator("#stock-base-total").inputValue(),"");
 assert.deepEqual(errors,[]);
}finally{await browser.close()}
