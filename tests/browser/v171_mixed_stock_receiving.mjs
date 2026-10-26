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
 assert.equal(await page.locator('#stock-mode option[value="both"]').isDisabled(),false);
 await page.locator("#stock-mode").selectOption("both");
 assert.equal(await page.locator("#stock-both-fields").isVisible(),true);
 await page.locator("#stock-barcode").selectOption("6260001112247");
 await page.locator("#stock-quantity").fill("3");
 await page.locator("#stock-mixed-carton").selectOption("6260001112261");
 await page.locator("#stock-mixed-qty").fill("2");
 assert.equal(await page.locator("#stock-base-total").inputValue(),"27");
 await page.locator("#stock-form button[type='submit']").click();
 await page.waitForFunction(()=>window.__retailQA.stockReceipts.length===1);
 const state=await page.evaluate(()=>{
  const q=window.__retailQA,p=q.products.find(x=>x.name==="شیری 1 لیتر");
  return {stock:q.stock.find(x=>x.product_id===p.id)?.quantity,
    receipts:q.stockReceipts,audit:q.audit.filter(x=>x.action==="stock.receive_mixed_v171"),
    calls:q.called.filter(x=>x.name==="retail_receive_mixed_v171")};
 });
 assert.equal(state.stock,87);
 assert.equal(state.receipts.length,1);
 assert.equal(state.receipts[0].base_units,27);
 assert.equal(state.audit.length,1);
 assert.equal(state.calls.length,1);
 assert.match(await page.locator("#stock-list").innerText(),/7 کارتۆن \+ 3 دانە/);
 console.log("PASS V17.1 PC: 2 cartons x12 + 3 units in ONE receipt, resulting 87 base units");

 const retry=await page.evaluate(async()=>{
  const q=window.__retailQA,r=q.stockReceipts[0];
  return window.supabase.createClient().rpc("retail_receive_mixed_v171",{
   p_store:q.store.id,p_request:r.request,p_lines:r.lines,p_reason:r.reason});
 });
 assert.equal(retry.error,null);
 assert.equal(Number(retry.data),87);
 assert.equal(await page.evaluate(()=>window.__retailQA.stockReceipts.length),1);
 assert.equal(await page.evaluate(()=>window.__retailQA.stock.find(x=>x.product_id==="cccccccc-cccc-4ccc-8ccc-000000000017").quantity),87);
 console.log("PASS V17.1 PC: identical request cannot duplicate received stock");

 await page.locator("#stock-product").selectOption(id);
 await page.locator("#stock-mode").selectOption("both");
 await page.locator("#stock-quantity").fill("0");
 await page.locator("#stock-mixed-qty").fill("2");
 assert.equal(await page.locator("#stock-base-total").inputValue(),"");
 assert.deepEqual(errors,[]);
 console.log("PASS V17.1 PC: invalid unit quantity blocks an unbalanced stock receipt");
}finally{await browser.close()}
