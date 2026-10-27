import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const fixture=readFileSync(resolve(root,"tests/browser/qa_supabase_fixture.js"),"utf8");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1140,height:850}});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.route("https://cdn.jsdelivr.net/**",r=>r.fulfill({
 status:200,contentType:"application/javascript",body:"/* local only */"
}));
const sale="ffffffff-ffff-4fff-8fff-000000000116";
const seed="(() => {\n const q=window.__retailQA,id=\"ffffffff-ffff-4fff-8fff-000000000116\";\n q.sales.push({id,store_id:q.store.id,receipt_no:16,total_minor:25000,\n  cash_received_minor:30000,change_due_minor:5000,cashier_id:q.account.id,\n  status:\"posted\",created_at:\"2026-10-26T06:00:00Z\"});\n q.saleItems.push({store_id:q.store.id,sale_id:id,product_id:q.products[0].id,\n  product_name_snapshot:\"شیری ١ لیتر (کارتۆن)\",quantity:2,unit_price_minor:11000,\n  package_type:\"carton\",package_barcode:\"6260001112261\",units_per_package:12,base_units:24});\n q.saleItems.push({store_id:q.store.id,sale_id:id,product_id:q.products[0].id,\n  product_name_snapshot:\"شیری ١ لیتر (دانە)\",quantity:3,unit_price_minor:1000,\n  package_type:\"unit\",package_barcode:\"6260001112247\",units_per_package:1,base_units:3});\n})();";
await page.addInitScript({content:fixture+seed});
try{
 await page.goto("http://127.0.0.1:8765/operations.html?view=receipts",{waitUntil:"load"});
 await page.locator("#receipts-list tbody tr").first().waitFor();
 await page.locator('[data-receipt="'+sale+'"]').click();
 const detail=await page.locator("#receipt-detail").innerText();
 assert.match(detail,/2 کارتۆن × 12 دانە/);
 assert.match(detail,/3 دانە/);
 assert.match(detail,/11,000 IQD/);
 assert.match(detail,/1,000 IQD/);
 assert.match(detail,/25,000 IQD/);
 console.log("PASS V16 receipts: historical details distinguish carton x12 and loose units at original prices");

 await page.goto("http://127.0.0.1:8765/receipt-print.html?sale="+sale+"&paper=58",{waitUntil:"load"});
 await page.locator("#sheet").waitFor({state:"visible"});
 assert.equal(await page.locator("#print").isDisabled(),false);
 assert.equal(await page.locator("#paper").inputValue(),"58");
 // Modern thermal print is six ruled table columns, not stacked .line blocks.
 assert.equal(await page.locator("#receipt-lines tr").count(),2);
 const grid=page.locator(".receipt-items");
 assert.deepEqual(await grid.locator("thead th").allTextContents(),
   ["ژمارە","ناوی کاڵا","یەکە","نرخ","بڕ","کۆ"]);
 const rows=grid.locator("tbody tr");
 assert.equal(await rows.nth(0).locator("td").nth(2).innerText(),"کارتۆن\\n12 دانە");
 assert.equal(await rows.nth(0).locator("td").nth(3).innerText(),"11,000");
 assert.equal(await rows.nth(0).locator("td").nth(4).innerText(),"2");
 assert.equal(await rows.nth(0).locator("td").nth(5).innerText(),"22,000");
 assert.equal(await rows.nth(1).locator("td").nth(2).innerText(),"دانە");
 assert.equal(await rows.nth(1).locator("td").nth(3).innerText(),"1,000");
 assert.equal(await rows.nth(1).locator("td").nth(4).innerText(),"3");
 assert.equal(await rows.nth(1).locator("td").nth(5).innerText(),"3,000");
 assert.equal(await page.locator("#total").innerText(),"25,000 IQD");
 assert.equal(await page.locator("#change").innerText(),"5,000 IQD");
 await page.locator("#paper").selectOption("80");
 const width=await page.evaluate(()=>document.documentElement.style.getPropertyValue("--receipt-paper"));
 assert.equal(width,"80mm");
 console.log("PASS V16 printing: 58/80mm receipt retains units, carton size, immutable prices and change");
 assert.deepEqual(errors,[]);
}finally{await browser.close()}
