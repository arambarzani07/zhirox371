// Real Chromium regression for *browser DEMO* fixed packs. Not a fiscal checkout.
import assert from "node:assert/strict";
import {chromium} from "playwright";
const origin=process.env.PC_PREVIEW_ORIGIN || "http://127.0.0.1:3000";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},locale:"en-US"});
const page=await context.newPage();
const errors=[];
page.on("pageerror",error=>errors.push(error.message));
const key="kanichnar_retail_pos_v18";
const bundle={kind:"bundle",name:"دەستەی ئاوی تاقیکردنەوە",
 barcode:"BUNDLE-E2E-110",alias_barcodes:["BUNDLE-ALIAS-110"],
 units_per_pack:6,purchase_price_iqd:2000,sale_price_iqd:2700};
const set={kind:"set",name:"سێتی ئاوی تاقیکردنەوە",
 barcode:"SET-E2E-110",alias_barcodes:["SET-ALIAS-110"],
 units_per_pack:3,purchase_price_iqd:1100,sale_price_iqd:1400};
const product={
 id:"prod-e2e-fixed-110",name:"ئاوی تاقیکردنەوە",
 sale_mode:"both",base_unit:"unit",unit_barcode:"UNIT-E2E-110",
 unit_alias_barcodes:[],sku:null,plu:null,
 unit_purchase_price_iqd:350,unit_sale_price_iqd:500,
 carton:{name:"کارتۆنی ئاوی تاقیکردنەوە",barcode:"CARTON-E2E-110",
  alias_barcodes:[],units_per_carton:12,purchase_price_iqd:4200,sale_price_iqd:5500},
 extra_packs:[bundle,set],stock:21,min_stock:2,category:"تاقیکردنەوە"
};
try {
 await page.addInitScript(({key,product})=>{
   localStorage.setItem(key+"_products",JSON.stringify([product]));
   localStorage.removeItem(key+"_receipts");
   localStorage.removeItem(key+"_refunds");
 },{key,product});
 await page.goto(origin,{waitUntil:"networkidle"});
 assert.equal(await page.locator(".home-screen .module").count(),12,
   "locked 12-card Home must remain unchanged");
 await page.locator(".system-header .ws-link").filter({hasText:"کاشێر"}).click();
 const banner=page.getByRole("status",{name:"دۆخی تاقیکردنەوەی کاشێر"});
 await banner.waitFor({state:"visible"});
 assert.match(await banner.innerText(),/فرۆشتنی ڕاستەقینە نییە/);
 const code=page.getByTestId("pos-barcode-input");
 await code.waitFor({state:"visible"});
 // Multipliers and alias codes must use dedicated pack prices, not unit price.
 await code.fill("2*BUNDLE-E2E-110");
 await code.press("Enter");
 await code.fill("SET-E2E-110");
 await code.press("Enter");
 await code.fill("SET-ALIAS-110");
 await code.press("Enter");
 // 2*6+1*3+1*3=18 pieces, only 3 pieces remain.
 await code.fill("BUNDLE-ALIAS-110");
 await code.press("Enter");
 const stockError=page.getByText(/بڕی بەردەست لە کۆگا تەواوبووە/).first();
 await stockError.waitFor({state:"visible"});
 await page.keyboard.press("F4");
 const watermark=page.locator('[data-demo-watermark="true"]');
 await watermark.waitFor({state:"visible"});
 const paper=page.locator(".thermal-receipt-modal-box");
 assert.match(await paper.innerText(),/دەستەی ئاوی تاقیکردنەوە/);
 assert.match(await paper.innerText(),/سێتی ئاوی تاقیکردنەوە/);
 assert.match(await paper.innerText(),/8,200/);
 assert.match(await paper.innerText(),/DEMO-RCP-/);
 await page.waitForFunction((key)=>{
   const products=JSON.parse(localStorage.getItem(key+"_products")||"[]");
   return products.length===1&&products[0].stock===3;
 },key);
 const data=await page.evaluate(key=>({
   products:JSON.parse(localStorage.getItem(key+"_products")||"[]"),
   receipts:JSON.parse(localStorage.getItem(key+"_receipts")||"[]")
 }),key);
 assert.equal(data.products[0].stock,3);
 const latest=data.receipts.find(r=>String(r.receiptNumber).startsWith("DEMO-RCP-"));
 assert.ok(latest,"must persist a DEMO receipt");
 assert.equal(latest.total,8200);
 assert.deepEqual(latest.items.map(i=>[i.mode,i.qty,i.units,i.price]),
   [["bundle",2,6,2700],["set",2,3,1400]]);
 assert.deepEqual(errors,[],"no React runtime errors from bundle/set checkout");
 console.log("PASS: chromium fixed-pack scan, aliases, stock, receipt and locked Home");
} finally {await browser.close();}
