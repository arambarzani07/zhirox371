import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const fixture=readFileSync(resolve(root,"tests/browser/qa_supabase_fixture.js"),"utf8");
const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:8765";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1140,height:820}});
const failures=[];page.on("pageerror",e=>failures.push(e.message));
await page.route("https://cdn.jsdelivr.net/**",r=>r.fulfill({status:200,contentType:"application/javascript",body:"/* local QA */"}));
await page.addInitScript({content:fixture+"(() => {\n const q=window.__retailQA,store=q.store;\n const id=\"cccccccc-cccc-4ccc-8ccc-000000000016\";\n q.products.push({id,store_id:store.id,name:\"شیری ١ لیتر\",price_minor:1000,currency:\"IQD\",active:true,catalog_version:1});\n q.advancedCatalogs.push({id,name:\"شیری ١ لیتر\",sale_mode:\"both\",unit_barcode:\"6260001112223\",\n  unit_alias_barcodes:[\"6260001112247\"],unit_sale_price_iqd:1000,unit_purchase_price_iqd:800,\n  carton:{barcode:\"6260001112230\",alias_barcodes:[\"6260001112261\"],name:\"کارتۆنی شیر\",\n    units_per_carton:12,purchase_price_iqd:9000,sale_price_iqd:11000}});\n for(const code of [\"6260001112223\",\"6260001112247\"])q.barcodes.push({\n  store_id:store.id,product_id:id,code,unit_type:\"unit\",units_per_scan:1,active:true});\n for(const code of [\"6260001112230\",\"6260001112261\"])q.barcodes.push({\n  store_id:store.id,product_id:id,code,unit_type:\"carton\",units_per_scan:12,active:true});\n q.stock.push({store_id:store.id,product_id:id,quantity:60});\n})();"});
const f=n=>page.locator('#product-form [name="'+n+'"]');
try{
 await page.goto(origin+"/workspace.html?view=new",{waitUntil:"load"});
 await page.locator("#products-panel").waitFor({state:"visible"});
 assert.equal(await page.locator("#unit-fields").isVisible(),true);
 assert.equal(await page.locator("#carton-fields").isVisible(),false);
 await page.locator('[name="sale_mode"][value="carton"]').check();
 assert.equal(await page.locator("#unit-fields").isVisible(),false);
 assert.equal(await page.locator("#carton-fields").isVisible(),true);
 assert.equal(await f("barcode").isDisabled(),true);
 await f("name").fill("کارتۆنی تەنها");
 await f("carton_barcode").fill("8811000010011");
 await f("extra_carton_barcodes").fill("8811000010012");
 await f("units_per_carton").fill("12");
 await f("carton_price").fill("11000");
 await page.locator("#save-product").click();
 await page.waitForFunction(()=>window.__retailQA.advancedCatalogs.some(x=>x.name==="کارتۆنی تەنها"));
 const carton=await page.evaluate(()=>window.__retailQA.advancedCatalogs.find(x=>x.name==="کارتۆنی تەنها"));
 assert.equal(carton.sale_mode,"carton");
 assert.equal(carton.unit_barcode,"");
 assert.equal(carton.unit_sale_price_iqd,null);
 assert.equal(await page.evaluate(()=>{
 const q=window.__retailQA,p=q.advancedCatalogs.find(x=>x.name==="کارتۆنی تەنها");
 return q.barcodes.filter(x=>x.product_id===p.id&&x.unit_type==="unit").length}),0);
 console.log("PASS V16 PC Products: carton-only registration has no false unit barcode");

 await page.locator('[name="sale_mode"][value="unit"]').check();
 assert.equal(await page.locator("#unit-fields").isVisible(),true);
 assert.equal(await page.locator("#carton-fields").isVisible(),false);
 assert.equal(await f("carton_barcode").isDisabled(),true);
 await page.locator('[name="sale_mode"][value="both"]').check();
 assert.equal(await page.locator("#unit-fields").isVisible(),true);
 assert.equal(await page.locator("#carton-fields").isVisible(),true);
 console.log("PASS V16 PC Products: switch unit/carton/both with correct required fields");

 await page.goto(origin+"/operations.html?view=cash",{waitUntil:"load"});
 await page.locator("#cash-panel").waitFor({state:"visible"});
 async function scan(code){await page.locator("#barcode").fill(code);await page.locator("#barcode").press("Enter");}
 await scan("6260001112261");await scan("6260001112261");
 await scan("6260001112247");await scan("6260001112247");await scan("6260001112247");
 assert.equal(await page.locator("#cart-list tbody tr").count(),2);
 assert.match(await page.locator("#cart-list").innerText(),/کارتۆن/);
 assert.match(await page.locator("#cart-list").innerText(),/دانە/);
 assert.match(await page.locator("#total").innerText(),/25,000/);
 console.log("PASS V16 PC Cashier: independent carton and unit basket lines total 25,000 IQD");

 await page.locator('[data-tab="shift"]').click();
 await page.locator('#shift-open-form input[name="opening"]').fill("100");
 await page.locator('#shift-open-form button[type="submit"]').click();
 await page.locator("#shift-active-forms").waitFor({state:"visible"});
 await page.locator('[data-tab="cash"]').click();
 await page.locator("#cash").fill("30000");
 await page.locator("#finish-sale").click();
 await page.waitForFunction(()=>window.__retailQA.sales.length===1);
 const state=await page.evaluate(()=>{
  const q=window.__retailQA,p=q.products.find(x=>x.name==="شیری ١ لیتر");
  return {sale:q.sales[0],stock:q.stock.find(x=>x.product_id===p.id)?.quantity,
    lines:q.saleItems.filter(x=>x.sale_id===q.sales[0].id),requests:q.called.filter(x=>x.name==="retail_checkout_packs_v16")};
 });
 assert.equal(state.sale.total_minor,25000);
 assert.equal(state.sale.change_due_minor,5000);
 assert.equal(state.stock,33);
 assert.equal(state.lines.length,2);
 assert.ok(state.lines.some(x=>x.package_type==="carton"&&x.quantity===2&&x.base_units===24&&x.unit_price_minor===11000));
 assert.ok(state.lines.some(x=>x.package_type==="unit"&&x.quantity===3&&x.base_units===3&&x.unit_price_minor===1000));
 assert.equal(state.requests.length,1);
 console.log("PASS V16 PC Cashier: 2 cartons+3 units posted, 27 base-unit deduction");

 await scan("6260001112261");await scan("6260001112261");await scan("6260001112261");
 assert.match(await page.locator("#scan-msg").innerText(),/کۆگا بەش ناکات/);
 assert.deepEqual(failures,[]);
 console.log("PASS V16 PC Cashier: cannot sell 3 cartons from 33 base units");
}finally{await browser.close();}
