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
const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.route("https://cdn.jsdelivr.net/**",r=>r.fulfill({status:200,contentType:"application/javascript",body:"/* fixture stub */"}));
await page.addInitScript({content:fixture});
const input=name=>page.locator('#product-form [name="'+name+'"]');
try{
 await page.goto(origin+"/workspace.html?view=new",{waitUntil:"load"});
 await page.locator("#new-panel").waitFor({state:"visible"});
 await input("name").fill("تەماتە");
 await input("plu").fill("00001");
 await input("sku").fill("VEG-00001");
 await input("price").fill("1250");
 await input("purchase_price").fill("900");
 assert.equal(await input("barcode").inputValue(),"");
 assert.equal(await input("barcode").evaluate(e=>e.required),false);
 await page.locator("#save-product").click();
 await page.waitForFunction(()=>window.__retailQA.advancedCatalogs.some(x=>x.plu==="00001"));
 const v=await page.evaluate(()=>{
   const q=window.__retailQA;
   const p=q.advancedCatalogs.find(x=>x.plu==="00001");
   return {catalog:p,barcodes:q.barcodes.filter(x=>x.product_id===p.id),
      calls:q.called.filter(x=>x.name==="retail_register_product_v14").length};
 });
 assert.equal(v.catalog.unit_barcode,"");
 assert.equal(v.catalog.unit_sale_price_iqd,1250);
 assert.equal(v.barcodes.length,0);
 assert.equal(v.calls,1);
 console.log("PASS scale-only PC: save PLU 00001 at 1250 IQD/kg without invented fixed barcode");

 await input("name").fill("تەماتە دوو");
 await input("plu").fill("00002");
 await input("price").fill("1300");
 await input("barcode").fill("2700002");
 await page.locator("#save-product").click();
 assert.match(await page.locator("#product-message").innerText(),/کۆدی تەرازوو/);
 assert.equal(await page.evaluate(()=>window.__retailQA.advancedCatalogs.length),1);
 console.log("PASS incomplete scale prefix cannot be saved as normal unit barcode");

 await input("barcode").fill("");
 await page.evaluate(()=>{window.__retailQA.advancedRpcEnabled=false;});
 await page.locator("#save-product").click();
 assert.match(await page.locator("#product-message").innerText(),/V14/);
 assert.equal(await page.evaluate(()=>window.__retailQA.advancedCatalogs.length),1);
 console.log("PASS absent Supabase V14 RPC surfaces accurate error; no fabricated legacy fallback");
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
