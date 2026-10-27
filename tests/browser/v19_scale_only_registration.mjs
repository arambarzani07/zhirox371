import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const fixture=readFileSync(resolve(root,"tests/browser/qa_supabase_fixture.js"),"utf8");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1110,height:820},colorScheme:"dark"});
const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:8765";
const pageErrors=[];page.on("pageerror",e=>pageErrors.push(e.message));
await page.route("https://cdn.jsdelivr.net/**",r=>r.fulfill({
 status:200,contentType:"application/javascript",body:"/* isolated QA client */"
}));
await page.addInitScript({content:fixture});
const field=n=>page.locator('#product-form [name="'+n+'"]');
const calls=n=>page.evaluate(name=>window.__retailQA.called.filter(x=>x.name===name).length,n);
try{
 await page.goto(origin+"/workspace.html?view=new",{waitUntil:"load"});
 await page.locator("#new-panel").waitFor({state:"visible"});
 await field("name").fill("تەماتە");
 await field("plu").fill("00001");
 await field("price").fill("1250");
 assert.equal(await field("barcode").inputValue(),"");
 assert.equal(await field("barcode").getAttribute("required"),null,
  "verified scale PLU makes unit barcode optional");
 assert.equal(await page.locator("#product-form").evaluate(f=>f.checkValidity()),true);
 await page.locator("#save-product").click();
 await page.waitForFunction(()=>window.__retailQA.advancedCatalogs.some(x=>x.name==="تەماتە"));
 assert.equal(await calls("retail_register_product_v14"),1);
 const saved=await page.evaluate(()=>{
  const q=window.__retailQA,p=q.advancedCatalogs.find(x=>x.name==="تەماتە");
  return {catalog:p,barcodes:q.barcodes.filter(b=>b.product_id===p.id)};
 });
 assert.equal(saved.catalog.plu,"00001");
 assert.equal(saved.catalog.unit_barcode,"");
 assert.equal(saved.catalog.unit_sale_price_iqd,1250);
 assert.deepEqual(saved.barcodes,[]);
 console.log("PASS scale-only product: owner registers PLU 00001, 1250 IQD/kg, zero fabricated barcodes");
 const inspect=await page.evaluate(async()=>{
  const q=window.__retailQA;
  return window.supabase.createClient().rpc("retail_resolve_barcode_v18",{
   p_store:q.store.id,p_code:"2700001004806"
  });
 });
 assert.equal(inspect.error,null);
 assert.equal(inspect.data?.found,true);
 assert.equal(inspect.data?.is_scale,true);
 assert.equal(Number(inspect.data?.price_minor),600);
 console.log("PASS real 2700001004806: 0.480 kg tomato at 600 IQD by store PLU");

 await page.locator('[data-tab="list"]').click();
 await page.locator('#search').fill("تەماتە");
 await page.waitForFunction(()=>document.querySelector("#results")?.innerText.includes("تەماتە"));
 await page.locator('#results .catalog-table-btn').first().click();
 await page.waitForFunction(()=>document.querySelector('#product-form [name="plu"]').value==="00001");
 assert.equal(await page.locator("#product-form").evaluate(f=>f.checkValidity()),true);
 assert.equal(await field("barcode").inputValue(),"");
 await field("price").fill("1500");
 await page.locator("#save-product").click();
 await page.waitForFunction(()=>window.__retailQA.advancedCatalogs.some(x=>x.name==="تەماتە"&&x.unit_sale_price_iqd===1500));
 assert.equal(await calls("retail_update_product_v15"),1);
 console.log("PASS scale-only editor: reopen and update price without demanding a fake barcode");

 await field("name").fill("دووبارە");
 await field("plu").fill("00002");
 await field("price").fill("1250");
 await field("barcode").fill("2700001");
 const before=await calls("retail_register_product_v14");
 await page.locator("#save-product").click();
 assert.match(await page.locator("#product-message").innerText(),/تەواو/);
 assert.equal(await calls("retail_register_product_v14"),before);
 assert.deepEqual(pageErrors,[]);
 console.log("PASS incomplete seven-digit 27+PLU barcode blocked before server write");
}finally{await browser.close()}
