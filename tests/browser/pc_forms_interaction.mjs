import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const fixture=readFileSync(resolve(root,"tests/browser/qa_supabase_fixture.js"),"utf8");
const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:8765";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:760}});
const failures=[];
page.on("pageerror",e=>failures.push(e.message));
await page.route("https://cdn.jsdelivr.net/**",r=>r.fulfill({status:200,contentType:"application/javascript",body:"/* browser QA SDK isolated */"}));
await page.addInitScript({content:fixture});
async function text(selector){return (await page.locator(selector).innerText()).trim();}
async function click(selector){await page.locator(selector).click();}
async function calls(name){return page.evaluate(n=>window.__retailQA.called.filter(x=>x.name===n).length,name);}
async function layoutStationary(){
 const banner=await page.locator(".market-banner").boundingBox();
 const header=await page.locator(".desktop > header").boundingBox();
 assert.ok(Math.abs(banner.y)<1);
 assert.ok(Math.abs(header.y-70)<1);
 assert.equal(await page.evaluate(()=>window.scrollY),0);
}

try{
 // Product workflow runs the actual workspace JS against a zero-network QA fixture.
 await page.goto(origin+"/workspace.html?view=new",{waitUntil:"load"});
 await page.locator("#products-panel").waitFor({state:"visible"});
 await layoutStationary();
 assert.equal(await page.locator("#new-panel").isVisible(),true);
 assert.equal(await page.locator("#list-panel").isVisible(),false);

 // Browser-native field validation must prevent invalid amounts before RPC dispatch.
 await page.locator('#product-form input[name="name"]').fill("قەڵەم");
 await page.locator('#product-form input[name="barcode"]').fill("9911223344");
 await page.locator('#product-form input[name="price"]').fill("-1");
 assert.equal(await page.locator("#product-form").evaluate(el=>el.checkValidity()),false);
 assert.equal(await calls("retail_create_product"),0);

 await page.locator('#product-form input[name="price"]').fill("2500");
 await click("#save-product");
 await page.waitForFunction(()=>window.__retailQA.called.some(x=>x.name==="retail_create_product"));
 assert.match(await text("#product-message"),/تۆمارکرا/);
 assert.equal(await calls("retail_create_product"),1);

 // Duplicated barcode should display precise user guidance without creating a second row.
 await page.locator('#product-form input[name="name"]').fill("دووبارە");
 await page.locator('#product-form input[name="barcode"]').fill("9911223344");
 await page.locator('#product-form input[name="price"]').fill("2500");
 await click("#save-product");
 assert.match(await text("#product-message"),/پێشتر تۆمارکراوە/);
 assert.equal(await page.evaluate(()=>window.__retailQA.products.length),2);

 await click('[data-tab="list"]');
 await page.locator("#list-panel").waitFor({state:"visible"});
 await page.locator("#results table tbody tr").first().waitFor();
 assert.equal(await page.locator("#results table tbody tr").count(),2);
 await page.locator("#search").fill("قەڵەم");
 assert.equal(await page.locator("#results table tbody tr").count(),1);
 await page.locator("#search").fill("unmatched-code");
 assert.match(await text("#results"),/نەدۆزرایەوە/);
 await page.locator("#search").fill("");
 await click("#refresh");
 assert.equal(await page.locator("#results table tbody tr").count(),2);
 await layoutStationary();
 console.log("PASS: PC Products new/list/search/refresh, invalid price and duplicate barcode");

 // Cashier: a fresh fixture has one stocked item but no open shift.
 await page.goto(origin+"/operations.html?view=cash",{waitUntil:"load"});
 await page.locator("#operations-panel").waitFor({state:"visible"});
 await page.locator("#cash-panel").waitFor({state:"visible"});
 await layoutStationary();
 assert.equal(await page.locator("#finish-sale").isDisabled(),true);
 await page.locator("#barcode").fill("not-found");
 await page.locator("#barcode").press("Enter");
 assert.match(await text("#scan-msg"),/نەدۆزرایەوە/);
 assert.equal(await page.locator("#cart-list table").count(),0);

 await page.locator("#barcode").fill("4006381333931");
 await page.locator("#barcode").press("Enter");
 assert.equal(await page.locator("#cart-list table tbody tr").count(),1);
 assert.match(await text("#total"),/1,000/);
 await page.locator("#barcode").fill("4006381333931");
 await page.locator("#barcode").press("Enter");
 assert.match(await text("#total"),/2,000/);
 await page.locator("#barcode").fill("4006381333931");
 await page.locator("#barcode").press("Enter");
 assert.match(await text("#scan-msg"),/کۆگا بەش ناکات/);
 assert.equal(await calls("retail_checkout_cash"),0);

 // Shift opening allows Checkout, which must reject insufficient tender.
 await click('[data-tab="shift"]');
 await page.locator("#shift-panel").waitFor({state:"visible"});
 await page.locator('#shift-open-form input[name="opening"]').fill("-1");
 assert.equal(await page.locator("#shift-open-form").evaluate(e=>e.checkValidity()),false);
 assert.equal(await calls("retail_shift_open"),0);
 await page.locator('#shift-open-form input[name="opening"]').fill("100");
 await page.locator('#shift-open-form button[type="submit"]').click();
 await page.locator("#shift-active-forms").waitFor({state:"visible"});
 assert.equal(await calls("retail_shift_open"),1);
 await click('[data-tab="cash"]');
 assert.equal(await page.locator("#finish-sale").isDisabled(),false);
 await page.locator("#cash").fill("1000");
 await click("#finish-sale");
 assert.match(await text("#checkout-msg"),/نادروستە/);
 assert.equal(await calls("retail_checkout_cash"),0);
 await page.locator("#cash").fill("2500");
 await click("#finish-sale");
 await page.waitForFunction(()=>window.__retailQA.sales.length===1);
 await page.locator("#checkout-msg").getByText("58mm",{exact:false}).waitFor();
 assert.equal(await calls("retail_checkout_cash"),1);
 assert.equal(await page.evaluate(()=>window.__retailQA.stock[0].quantity),0);
 assert.equal(await page.locator("#cart-list table").count(),0);

 await click('[data-tab="receipts"]');
 await page.locator("#receipts-list table tbody tr").first().waitFor();
 assert.equal(await page.locator("#receipts-list table tbody tr").count(),1);
 assert.match(await text("#receipts-list"),/000001/);
 await layoutStationary();
 console.log("PASS: PC cashier barcode validation, stock cap, opening shift, cash check and safe mocked receipt");

 // Close a shift, with a movement in the same isolated test client.
 await click('[data-tab="shift"]');
 await page.locator('#shift-movement-form input[name="amount"]').fill("200");
 await page.locator('#shift-movement-form input[name="note"]').fill("QA only");
 await page.locator('#shift-movement-form button[type="submit"]').click();
 await page.waitForFunction(()=>window.__retailQA.movements.length===1);
 assert.equal(await calls("retail_cash_movement"),1);
 await page.locator('#shift-close-form input[name="counted"]').fill("2300");
 await page.locator('#shift-close-form button[type="submit"]').click();
 await page.waitForFunction(()=>window.__retailQA.sessions.length>0&&window.__retailQA.sessions[0].status==="closed");
 assert.equal(await calls("retail_shift_close"),1);
 assert.equal(await page.locator("#shift-report").isVisible(),true);
 await layoutStationary();
 console.log("PASS: PC shift movement, reconciliation and closing with no real backend");

 // Owner-only staff form must reject invalid identity before RPC.
 await click('[data-tab="staff"]');
 await page.locator('#staff-form input[name="user"]').fill("not-a-uuid");
 await page.locator('#staff-form button[type="submit"]').click();
 assert.match(await text("#staff-msg"),/ناسنامەی کارمەند نادروستە/);
 assert.equal(await calls("retail_assign_staff"),0);
 assert.deepEqual(failures,[],"actual page JS errors: "+failures.join("; "));
 console.log("PASS: PC owner staff ID validation and no JavaScript runtime errors");
}finally{
 await browser.close();
}
