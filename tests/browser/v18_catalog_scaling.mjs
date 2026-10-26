import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const fixture=readFileSync(resolve(root,"tests/browser/qa_supabase_fixture.js"),"utf8");
const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:8765";

const seed50k=String.raw`(() => {
  const q=window.__retailQA,storeId=q.store.id;
  q.products[0].name="تەماتە";
  q.products[0].plu="00001";
  q.products[0].price_minor=1250;
  q.stock[0].quantity=5;
  q.sessions.push({id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",store_id:storeId,cashier_id:q.account.id,opening_cash_minor:100000,opened_at:new Date().toISOString(),status:"open",variance_minor:null});
  for(let i=1;i<=50000;i++){
    const id="18000000-0000-4000-8000-"+String(i).padStart(12,"0");
    const pad=String(i).padStart(6,"0");
    const u1="6261"+pad+"01";
    const c1="6262"+pad+"02";
    const alias=i%2===0?"6263"+pad+"03":"6264"+pad+"04";
    const unitPrice=1000+(i%10)*250;
    const cartonPrice=unitPrice*10;
    q.products.push({
      id,store_id:storeId,name:"کاڵای ژمارە "+i,sku:"SKU-"+pad,plu:String(100000+i),
      price_minor:unitPrice,currency:"IQD",active:true,catalog_version:1
    });
    q.advancedCatalogs.push({
      id,name:"کاڵای ژمارە "+i,sku:"SKU-"+pad,plu:String(100000+i),sale_mode:"both",
      unit_barcode:u1,unit_alias_barcodes:i%2===0?[alias]:[],
      unit_sale_price_iqd:unitPrice,unit_purchase_price_iqd:unitPrice-200,
      carton:{
        name:"کارتۆنی "+i,barcode:c1,alias_barcodes:i%2===1?[alias]:[],
        units_per_carton:12,purchase_price_iqd:cartonPrice-1500,sale_price_iqd:cartonPrice
      }
    });
    q.barcodes.push(
      {store_id:storeId,product_id:id,code:u1,unit_type:"unit",units_per_scan:1,active:true},
      {store_id:storeId,product_id:id,code:c1,unit_type:"carton",units_per_scan:12,active:true},
      {store_id:storeId,product_id:id,code:alias,unit_type:i%2===0?"unit":"carton",units_per_scan:i%2===0?1:12,active:true}
    );
    q.stock.push({store_id:storeId,product_id:id,quantity:i===49998?0:i===49997?3:120});
  }
  const lastId="18000000-0000-4000-8000-000000050000";
  q.barcodes.push(
    {store_id:storeId,product_id:lastId,code:"6261050000",unit_type:"unit",units_per_scan:1,active:true},
    {store_id:storeId,product_id:lastId,code:"6269999999999",unit_type:"carton",units_per_scan:12,active:false}
  );
  q.indexVersion=(q.indexVersion||0)+1;
})();`;

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1180,height:840}});
const failures=[];
page.on("pageerror",e=>failures.push(e.message));
await page.route("https://cdn.jsdelivr.net/**",r=>r.fulfill({
  status:200,contentType:"application/javascript",body:"/* isolated V18 QA */"
}));
await page.addInitScript({content:fixture+seed50k});

try{
  // 1. Verify Workspace 50-item pagination, Price Inspection, and Barcode Inspection on 50,000 products / 150,000 barcodes
  const t0=Date.now();
  await page.goto(origin+"/workspace.html?view=list",{waitUntil:"load"});
  await page.locator("#list-panel").waitFor({state:"visible"});
  const loadListMs=Date.now()-t0;

  assert.equal(await page.locator("#results tbody tr").count(),50,"Catalog list must render exactly 50 rows per page");
  assert.equal(await page.locator("#list-pagination").isVisible(),true);
  assert.equal(await page.locator("#list-page-info").innerText(),"1–50 / 50,001");
  assert.equal(await page.locator("#list-prev").isDisabled(),true);
  assert.equal(await page.locator("#list-next").isDisabled(),false);

  // Navigate to next page (51-100)
  await page.locator("#list-next").click();
  await page.waitForFunction(()=>document.querySelector("#list-page-info")?.textContent==="51–100 / 50,001");
  assert.equal(await page.locator("#results tbody tr").count(),50);
  assert.equal(await page.locator("#list-prev").isDisabled(),false);

  // Server search for product #50000 by carton barcode
  await page.locator("#search").fill("626205000002");
  await page.waitForFunction(()=>document.querySelectorAll("#results tbody tr").length===1);
  assert.match(await page.locator("#results tbody tr").first().innerText(),/کاڵای ژمارە 50000/);
  console.log(`PASS V18 Workspace Catalog: 50-item pagination and server search across 50,001 products (${loadListMs}ms initial load)`);

  // 2. Price Inspection tab (نرخەکان) + V19 Thermal Barcode Label Preview
  await page.locator('[data-tab="prices"]').click();
  await page.locator("#prices-panel").waitFor({state:"visible"});
  assert.equal(await page.locator("#prices-results tbody tr").count(),50);
  assert.equal(await page.locator("#prices-page-info").innerText(),"1–50 / 50,001");
  await page.locator("#prices-search").fill("SKU-050000");
  await page.waitForFunction(()=>document.querySelectorAll("#prices-results tbody tr").length===1);
  const priceRowText=await page.locator("#prices-results tbody tr").first().innerText();
  assert.match(priceRowText,/کاڵای ژمارە 50000/);
  assert.match(priceRowText,/هەردووکیان/);
  assert.match(priceRowText,/1,000 IQD/);
  assert.match(priceRowText,/10,000 IQD/);
  assert.match(priceRowText,/12 دانە/);
  assert.doesNotMatch(priceRowText,/800/,"Purchase cost must never appear in price inspection");

  // Click V19 label button to open thermal shelf/barcode sticker preview
  await page.locator("#prices-results .catalog-label-btn").first().click();
  await page.locator("#barcode-label-box").waitFor({state:"visible"});
  assert.match(await page.locator("#label-product-name").innerText(),/کاڵای ژمارە 50000/);
  assert.match(await page.locator("#label-price-text").innerText(),/1,000 IQD/);
  assert.equal(await page.locator("#label-code-text").innerText(),"626105000001");
  assert.ok((await page.locator("#label-barcode-svg rect").count())>15,"SVG barcode bars must be rendered");
  await page.locator("#label-close-btn").click();
  console.log("PASS V18/V19 Workspace Price Inspection & Shelf Label: unit/carton prices, pack size, and SVG thermal label preview verified");

  // 3. Barcode Inspection tab (بارکۆدەکان)
  await page.locator('[data-tab="barcodes"]').click();
  await page.locator("#barcodes-panel").waitFor({state:"visible"});
  assert.equal(await page.locator("#barcodes-results tbody tr").count(),50);
  assert.equal(await page.locator("#barcodes-page-info").innerText(),"1–50 / 150,002");

  // Exact barcode inspection via #barcode-inspect-form (including verified scale barcode 2700001004806)
  await page.locator("#barcode-inspect-input").fill("2700001004806");
  await page.locator('#barcode-inspect-form button[type="submit"]').click();
  await page.locator("#barcode-inspect-result").waitFor({state:"visible"});
  const scaleInspectText=await page.locator("#barcode-inspect-result").innerText();
  assert.match(scaleInspectText,/2700001004806/);
  assert.match(scaleInspectText,/تەماتە/);
  assert.match(scaleInspectText,/0\.480 کگم/);
  assert.match(scaleInspectText,/600 IQD/);

  await page.locator("#barcode-inspect-input").fill("626305000003");
  await page.locator('#barcode-inspect-form button[type="submit"]').click();
  await page.locator("#barcode-inspect-result").waitFor({state:"visible"});
  const inspectText=await page.locator("#barcode-inspect-result").innerText();
  assert.match(inspectText,/626305000003/);
  assert.match(inspectText,/کاڵای ژمارە 50000/);
  assert.match(inspectText,/دانە/);
  assert.match(inspectText,/1,000 IQD/);

  // Filter barcode directory by carton alias of product #49999
  await page.locator("#barcodes-search").fill("626404999904");
  await page.waitForFunction(()=>document.querySelectorAll("#barcodes-results tbody tr").length===1);
  const barcodeRowText=await page.locator("#barcodes-results tbody tr").first().innerText();
  assert.match(barcodeRowText,/626404999904/);
  assert.match(barcodeRowText,/کارتۆن/);
  assert.match(barcodeRowText,/12 دانە/);
  assert.match(barcodeRowText,/فرەبارکۆد/);
  console.log("PASS V18 Workspace Barcode Inspection: 150,002-barcode directory, scale barcode 2700001004806, and exact unit/carton alias inspector verified");

  // 4. Cashier Hybrid Auto-Scan on 50,000-product / 150,000-barcode catalog + Verified Real Scale Barcode 2700001004806
  await page.goto(origin+"/operations.html?view=cash",{waitUntil:"load"});
  await page.locator("#cash-panel").waitFor({state:"visible"});

  // Ensure browser only cached the first 50 products on boot, NOT 50,000
  const initialCatalogPageCalls=await page.evaluate(()=>window.__retailQA.called.filter(c=>c.name==="retail_catalog_page_v18").length);
  assert.equal(initialCatalogPageCalls,1);

  // Auto-scan (no Enter) product #50,000's unit alias (626305000003) which is NOT in initial 50-item page
  await page.locator("#barcode").fill("626305000003");
  await page.waitForFunction(()=>document.querySelector("#total")?.textContent==="1,000 IQD");
  assert.equal(await page.locator("#barcode").inputValue(),"");

  // Auto-scan (no Enter) product #50,000's primary carton barcode (626205000002)
  await page.locator("#barcode").fill("626205000002");
  await page.waitForFunction(()=>document.querySelector("#total")?.textContent==="11,000 IQD");
  assert.equal(await page.locator("#barcode").inputValue(),"");

  // Auto-scan (no Enter) product #49,999's carton alias (626404999904, price = 32,500 IQD)
  await page.locator("#barcode").fill("626404999904");
  await page.waitForFunction(()=>document.querySelector("#total")?.textContent==="43,500 IQD");
  assert.equal(await page.locator("#barcode").inputValue(),"");

  // Prefix-collision protection on server-indexed code: "6261050000" is a valid unit barcode
  // for product #50,000, but is a prefix of "626105000001". Pause must wait for Enter!
  await page.locator("#barcode").fill("6261050000");
  await page.waitForTimeout(320);
  assert.equal(await page.locator("#barcode").inputValue(),"6261050000");
  assert.equal(await page.locator("#total").innerText(),"43,500 IQD");
  await page.locator("#barcode").press("Enter");
  await page.waitForFunction(()=>document.querySelector("#total")?.textContent==="44,500 IQD");
  assert.equal(await page.locator("#barcode").inputValue(),"");

  // Retired barcode, invalid EAN-13 scale checksum (2700001004805), and unverified prefix (2100001004804) must be rejected
  for(const badCode of ["6269999999999","2700001004805","2100001004804"]){
    await page.locator("#barcode").fill(badCode);
    await page.waitForTimeout(250);
    assert.equal(await page.locator("#total").innerText(),"44,500 IQD");
    await page.locator("#barcode").press("Enter");
    assert.match(await page.locator("#scan-msg").innerText(),/نەدۆزرایەوە/);
    assert.equal(await page.locator("#total").innerText(),"44,500 IQD");
  }

  // Scan Verified Real Scale Barcode (2700001004806 -> Prefix 27, PLU 00001 تەماتە, Weight 00480 = 0.480 kg, Check 6, Price 1,250 IQD/kg -> 600 IQD)
  await page.locator("#barcode").fill("2700001004806");
  await page.waitForFunction(()=>document.querySelector("#total")?.textContent==="45,100 IQD");
  const cartText=await page.locator("#cart-body").innerText();
  assert.match(cartText,/تەماتە \(0\.480 کگم\)/);
  assert.match(cartText,/600 IQD/);

  // Apply Cashier Discount of 100 IQD -> Net Total becomes 45,000 IQD
  await page.locator("#discount").fill("100");
  assert.equal(await page.locator("#total").innerText(),"45,000 IQD");

  // Verify Quick Tender button (exact cash) and F4 Hold/Resume Cart workflow
  await page.locator('#quick-cash-row [data-tender="exact"]').click();
  assert.equal(await page.locator("#cash").inputValue(),"45000");
  assert.equal(await page.locator("#change").innerText(),"0 IQD");
  await page.locator('#quick-cash-row [data-tender="5000"]').click();
  assert.equal(await page.locator("#cash").inputValue(),"50000");
  assert.equal(await page.locator("#change").innerText(),"5,000 IQD");

  // Park current cart with F4, verify basket clears and parked-bar slot button appears, then resume
  await page.keyboard.press("F4");
  assert.equal(await page.locator("#total").innerText(),"0 IQD");
  assert.equal(await page.locator("#parked-bar").isVisible(),true);
  assert.match(await page.locator("#parked-bar").innerText(),/45,000 IQD/);
  await page.locator('#parked-bar [data-resume-slot="0"]').click();
  assert.equal(await page.locator("#total").innerText(),"45,000 IQD");
  assert.equal(await page.locator("#parked-bar").isVisible(),false);

  // Set exact cash (45,000 IQD), complete sale, verify fractional stock deduction (5 -> 4.52 kg), and test V19 Sales Return (گەڕاندنەوە)
  await page.locator('#quick-cash-row [data-tender="exact"]').click();
  await page.locator('#checkout-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector("#total")?.textContent==="0 IQD");
  assert.equal(await page.evaluate(()=>window.__retailQA.stock[0].quantity),4.52,"Stock of تەماتە must deduct 0.480 kg (5 -> 4.52 kg)");

  // Switch to Receipts tab and return the newly posted sale
  await page.locator('[data-tab="receipts"]').click();
  await page.locator("#receipts-panel").waitFor({state:"visible"});
  assert.match(await page.locator("#receipt-detail").innerText(),/داشکاندن: 100 IQD/);
  assert.match(await page.locator("#receipt-detail").innerText(),/تەماتە \(0\.480 کگم\)/);
  await page.locator('#receipts-list [data-return-sale]').first().click();
  await page.waitForFunction(()=>document.querySelector("#receipts-list")?.textContent?.includes("گەڕاوە"));
  assert.match(await page.locator("#receipt-detail").innerText(),/ئەم پسوولەیە گەڕێندراوەتەوە/);
  assert.equal(await page.evaluate(()=>window.__retailQA.stock[0].quantity),5,"Returning sale must restore 0.480 kg back to 5 kg");
  console.log("PASS V18/V19 Cashier Hybrid Scanner, Verified Real Scale Barcode 2700001004806 (0.480 kg = 600 IQD), Discount, Multi-Slot Park, and Sales Return verified");

  // 5. Paginated Stock panel in operations.html + V19 low/out-of-stock filter + quick row pick
  await page.locator('[data-tab="stock"]').click();
  await page.locator("#stock-panel").waitFor({state:"visible"});
  assert.equal(await page.locator("#stock-pagination").isVisible(),true);
  assert.match(await page.locator("#stock-page-info").innerText(),/50,001/);

  // Filter by Out-of-Stock (تەواوبوو (0)) -> only product #49998 has 0 stock
  await page.locator("#stock-filter").selectOption("out");
  await page.waitForFunction(()=>document.querySelectorAll("#stock-list tbody tr").length===1);
  assert.match(await page.locator("#stock-list").innerText(),/کاڵای ژمارە 49998/);
  assert.match(await page.locator("#stock-list").innerText(),/تەواوبوو/);

  // Reset filter to all and search by SKU-049997 (low stock = 3)
  await page.locator("#stock-filter").selectOption("all");
  await page.locator("#stock-search").fill("SKU-049997");
  await page.waitForFunction(()=>document.querySelectorAll("#stock-list tbody tr").length===1);
  assert.match(await page.locator("#stock-list").innerText(),/کاڵای ژمارە 49997/);
  assert.match(await page.locator("#stock-list").innerText(),/کەمبووە/);
  await page.locator("#stock-list .stock-pick-btn").first().click();
  assert.equal(await page.locator("#stock-product").inputValue(),"18000000-0000-4000-8000-000000049997");
  console.log("PASS V18/V19 Stock Pagination, Low/Out-of-Stock Filter & Quick Pick verified");

  assert.deepEqual(failures,[]);
}finally{
  await browser.close();
}
