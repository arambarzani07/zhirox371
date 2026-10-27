import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const fixture=readFileSync(resolve(root,"tests/browser/qa_supabase_fixture.js"),"utf8");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1110,height:820}});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.route("https://cdn.jsdelivr.net/**",route=>route.fulfill({status:200,contentType:"application/javascript",body:"/* browser QA SDK shim */"}));
await page.addInitScript({content:fixture});
try {
 await page.goto((process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:8765")+"/workspace.html?view=new");
 await page.locator("#new-panel").waitFor({state:"visible"});
 await page.locator('[name="sale_mode"][value="scale"]').check();
 assert.equal(await page.locator("#unit-barcode-field").isVisible(),false);
 assert.equal(await page.locator("#unit-aliases-field").isVisible(),false);
 assert.equal(await page.locator("#carton-fields").isVisible(),false);
 assert.equal(await page.locator('#product-form [name="barcode"]').isDisabled(),true);
 await page.locator('#product-form [name="name"]').fill("تەماتە");
 await page.locator('#product-form [name="plu"]').fill("00001");
 await page.locator('#product-form [name="price"]').fill("1250");
 await page.locator('#product-form [name="purchase_price"]').fill("900");
 assert.equal(await page.locator("#product-form").evaluate(el=>el.checkValidity()),true);
 await page.locator("#save-product").click();
 await page.waitForFunction(()=>window.__retailQA.advancedCatalogs.length===1);
 const info=await page.evaluate(async()=>{
  const st=window.__retailQA,c=st.advancedCatalogs[0];
  const api=window.supabase.createClient();
  const snap=await api.rpc("retail_product_snapshot_v15",{p_store_id:st.store.id,p_product_id:c.id});
  const lookup=await api.rpc("retail_resolve_barcode_v18",{p_store:st.store.id,p_code:"2700001004806"});
  return {catalog:c,barcodeCount:st.barcodes.filter(x=>x.product_id===c.id).length,
   snapshot:snap.data,lookup:lookup.data,
   legacy:st.called.filter(x=>x.name==="retail_create_product").length};
 });
 assert.equal(info.catalog.sale_mode,"scale");
 assert.equal(info.catalog.unit_barcode,"");
 assert.equal(info.catalog.plu,"00001");
 assert.equal(info.barcodeCount,0);
 assert.equal(info.legacy,0,"cannot use legacy create_product RPC");
 assert.equal(info.snapshot.sale_mode,"scale");
 assert.equal(info.lookup.found,true);
 assert.equal(info.lookup.is_scale,true);
 assert.equal(Number(info.lookup.scale_weight_kg),0.48);
 assert.equal(Number(info.lookup.price_minor),600);
 console.log("PASS PLU-only scale item; no fake unit barcode, sale 480g => 600 IQD");

 await page.locator('[name="sale_mode"][value="scale"]').check();
 await page.locator('#product-form [name="name"]').fill("دووبارەی تەماتە");
 await page.locator('#product-form [name="plu"]').fill("00001");
 await page.locator('#product-form [name="price"]').fill("1250");
 await page.locator("#save-product").click();
 await page.waitForFunction(()=>window.__retailQA.called.filter(x=>x.name==="retail_register_product_v14").length===2);
 assert.equal(await page.evaluate(()=>window.__retailQA.advancedCatalogs.length),1);
 console.log("PASS duplicate PLU blocked in simulated isolated browser schema");
 assert.deepEqual(errors,[]);
}finally{await browser.close()}
