import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const fixture=readFileSync(resolve(root,"tests/browser/qa_supabase_fixture.js"),"utf8");
const seed=String.raw`(() => {
 const q=window.__retailQA,id="cccccccc-cccc-4ccc-8ccc-000000000018";
 q.products.push({id,store_id:q.store.id,name:"شیری 1 لیتر",
  price_minor:1000,currency:"IQD",active:true,catalog_version:1});
 q.advancedCatalogs.push({id,name:"شیری 1 لیتر",sale_mode:"both",
  unit_barcode:"6260001112223",unit_alias_barcodes:["6260001112247"],
  unit_sale_price_iqd:1000,unit_purchase_price_iqd:750,
  carton:{barcode:"6260001112230",alias_barcodes:["6260001112261"],
   name:"کارتۆنی شیر",units_per_carton:12,
   purchase_price_iqd:9000,sale_price_iqd:11000}});
 for(const code of ["6260001112223","6260001112247","62600011122"])
  q.barcodes.push({store_id:q.store.id,product_id:id,
   code,unit_type:"unit",units_per_scan:1,active:true});
 for(const code of ["6260001112230","6260001112261"])
  q.barcodes.push({store_id:q.store.id,product_id:id,
   code,unit_type:"carton",units_per_scan:12,active:true});
 q.barcodes.push({store_id:q.store.id,product_id:id,
  code:"6260001112999",unit_type:"carton",units_per_scan:12,active:false});
 q.stock.push({store_id:q.store.id,product_id:id,quantity:60});
})();`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1140,height:780}});
const failures=[];page.on("pageerror",e=>failures.push(e.message));
await page.route("https://cdn.jsdelivr.net/**",r=>r.fulfill({
 status:200,contentType:"application/javascript",body:"/* isolated QA */"
}));
await page.addInitScript({content:fixture+seed});
try {
 await page.goto("http://127.0.0.1:8765/operations.html?view=cash",{waitUntil:"load"});
 await page.locator("#cash-panel").waitFor({state:"visible"});
 assert.equal(await page.locator("#scan-form button:visible").count(),0);
 assert.equal(await page.locator('#scan-form input[name="barcode"]').count(),1);
 assert.equal(await page.locator("#barcode").isVisible(),true);
 assert.equal((await page.locator("#cash-panel").innerText()).includes("سکانی دانە"),false);
 assert.equal((await page.locator("#cash-panel").innerText()).includes("سکانی کارتۆن"),false);

 async function automaticScan(code,total){
   await page.locator("#barcode").fill(code); // no Enter, no click
   await page.waitForFunction(expected=>document.querySelector("#total")?.textContent===expected,
    Number(total).toLocaleString("en-US")+" IQD");
   assert.equal(await page.locator("#barcode").inputValue(),"");
 }
 await automaticScan("6260001112223",1000);    // unit primary
 await automaticScan("6260001112247",2000);    // unit alias
 await automaticScan("6260001112230",13000);   // carton primary
 await automaticScan("6260001112261",24000);   // carton alias
 assert.equal(await page.locator("#cart-list tbody tr").count(),2);
 assert.match(await page.locator("#cart-list").innerText(),/دانە/);
 assert.match(await page.locator("#cart-list").innerText(),/کارتۆن/);
 assert.match(await page.locator("#total").innerText(),/24,000/);
 console.log("PASS auto scanner: four primary/alias unit and carton codes resolve in one input without extra buttons or Enter");

 // A valid shorter code is a prefix of the primary unit code, so pause
 // must NOT bill the shorter unit early.
 await page.locator("#barcode").fill("62600011122");
 await page.waitForTimeout(320);
 assert.equal(await page.locator("#barcode").inputValue(),"62600011122");
 assert.equal(await page.locator("#total").innerText(),"24,000 IQD");
 await page.locator("#barcode").press("Enter");
 await page.waitForFunction(()=>document.querySelector("#total")?.textContent==="25,000 IQD");
 assert.equal(await page.locator("#barcode").inputValue(),"");
 console.log("PASS prefix protection: a barcode which prefixes a longer code requires Enter");

 // Most HID scanners add Enter: timer must be cancelled to prevent duplication.
 await page.locator("#barcode").fill("6260001112247");
 await page.locator("#barcode").press("Enter");
 await page.waitForFunction(()=>document.querySelector("#total")?.textContent==="26,000 IQD");
 await page.waitForTimeout(320);
 assert.equal(await page.locator("#total").innerText(),"26,000 IQD");
 console.log("PASS HID Enter: immediate scan occurs exactly once");

 // Inactive barcode is not auto-scanned and cannot be submitted manually.
 await page.locator("#barcode").fill("6260001112999");
 await page.waitForTimeout(320);
 assert.equal(await page.locator("#total").innerText(),"26,000 IQD");
 await page.locator("#barcode").press("Enter");
 assert.match(await page.locator("#scan-msg").innerText(),/نەدۆزرایەوە/);
 assert.equal(await page.locator("#total").innerText(),"26,000 IQD");
 console.log("PASS retired barcode: neither input auto-scan nor Enter can sell inactive alias");

 // Unknown Enter scans clear the input, so the NEXT scanner burst cannot be
 // concatenated with an old bad code. Basket remains unchanged.
 assert.equal(await page.locator("#barcode").inputValue(),"");
 assert.equal(await page.evaluate(()=>document.activeElement?.id),"barcode");
 await page.locator("#cash").fill("32000");
 await page.locator("#cash").press("F2");
 assert.equal(await page.evaluate(()=>document.activeElement?.id),"barcode");
 await page.locator("#barcode").fill("unrecognized");
 await page.locator("#barcode").press("Escape");
 assert.equal(await page.locator("#barcode").inputValue(),"");
 assert.equal(await page.locator("#total").innerText(),"26,000 IQD");
 console.log("PASS PC keys: F2 restores one scan input; Escape discards only partial scan");

 await page.locator('#cart-list [data-delta="1"]').first().click();
 assert.equal(await page.locator("#total").innerText(),"29,000 IQD");
 assert.equal(await page.evaluate(()=>document.activeElement?.id),"barcode");
 await page.locator('#cart-list [data-delta="-1"]').first().click();
 assert.equal(await page.locator("#total").innerText(),"26,000 IQD");
 assert.equal(await page.evaluate(()=>document.activeElement?.id),"barcode");
 await page.locator("#clear-cart").click();
 assert.equal(await page.locator("#total").innerText(),"0 IQD");
 assert.equal(await page.evaluate(()=>document.activeElement?.id),"barcode");
 console.log("PASS continuous scan focus: plus/minus quantity and clear cart restore barcode focus without extra buttons");

 assert.deepEqual(failures,[]);
}finally{await browser.close()}
