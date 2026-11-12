import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:3000";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1320,height:900},locale:"en-US"});
const page=await context.newPage();
// Browser printing is intercepted: this is a DEMO, never a real thermal printer.
await page.addInitScript(() => {
 window.__zhiroxPrintCalls=0;
 window.print=() => {window.__zhiroxPrintCalls+=1;};
});
const errors=[];
page.on("pageerror",error=>errors.push(error.message));
try {
 await page.goto(origin,{waitUntil:"networkidle"});
 assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
 // Owner-locked 12 main modules. Each expands to four Sorani subcards.
 assert.equal(await page.locator(".home-screen .module").count(),12);
 assert.deepEqual(
   await page.locator(".home-screen .module .name").allTextContents(),
   ["فرۆشتن و کاشێر","کاڵا و نرخ","کۆگا و بەسەرچوون","کڕین و دابینکردن",
    "کڕیار و قەرز","سندووق و دارایی","کارمەند و دەسەڵات","ئۆفەر و پاداشت",
    "ڕاپۆرت و شیکاری","ئاگاداری و پەسندکردن","ئامێر و تۆڕ","ڕێکخستن و پاراستن"]
 );
 assert.deepEqual(
   await page.locator(".home-screen .module").evaluateAll(nodes => nodes.map(n => n.getAttribute("data-canva-card"))),
   Array.from({length:12},(_,i)=>String(i+1).padStart(2,"0"))
 );
 assert.equal(await page.locator(".market-banner .zhirox-canva-brand").innerText(),"ZHIROX");
 await page.locator(".home-screen .module").first().click();
 assert.equal(await page.locator(".home-screen .subgrid .sub").count(),4);
 await page.locator(".home-screen .module").first().click();
 assert.equal(await page.locator(".home-screen .drawer").count(),0);
 // Canva 045: stock approvals have NO authoritative feed in the DEMO.
 // Navigation 036 → 040 → 043 → 045 must preserve the fail-closed gate.
 await page.locator(".home-screen .module").nth(2).click();
 await page.locator(".home-screen .subgrid .sub").first().click();
 const stock036=page.locator('[data-canva-screen="036"]');
 await stock036.waitFor({state:"visible"});
 await stock036.getByRole("button",{name:"ژماردنی کۆگا"}).click();
 const count040=page.locator('[data-canva-screen="040"]');
 await count040.waitFor({state:"visible"});
 await count040.getByRole("button",{name:"پێداچوونەوەی جیاوازییەکان"}).click();
 const reconcile043=page.locator('[data-canva-screen="043"]');
 await reconcile043.waitFor({state:"visible"});
 assert.equal(await reconcile043.getByRole("button",{name:"داواکردنی پەسەندکردن"}).isDisabled(),true);
 await reconcile043.getByRole("button",{name:"بینینی داواکارییەکانی کۆگا"}).click();
 const approvals045=page.locator('[data-canva-screen="045"]');
 await approvals045.waitFor({state:"visible"});
 assert.equal(await approvals045.locator("h1").innerText(),"پەسەندکردنی کردارەکانی کۆگا");
 assert.equal(await approvals045.locator("tbody tr[data-approval-placeholder]").count(),4);
 assert.equal(await approvals045.getByRole("button",{name:"پەسەندکردن",exact:true}).isDisabled(),true);
 assert.equal(await approvals045.getByRole("button",{name:"ڕەتکردنەوە",exact:true}).isDisabled(),true);
 assert.equal(await approvals045.getByRole("status").innerText().then(s=>s.includes("پەیوەست نییە")),true);
 assert.equal(await approvals045.locator(".stock-036-summary dd").first().innerText(),"—");
 for(const label of ["پەسەندکراو","ڕەتکراوە","چاوەڕوان"]){
  await approvals045.getByRole("button",{name:label,exact:true}).click();
  assert.equal(await approvals045.getByRole("button",{name:label,exact:true}).getAttribute("aria-pressed"),"true");
  assert.equal(await approvals045.locator("tbody tr[data-approval-placeholder]").count(),4);
 }
 await approvals045.getByPlaceholder("ناسنامەی داواکاری، کاڵا یان کارمەند").fill("fake-request");
 assert.equal(await approvals045.locator("tbody tr[data-approval-placeholder]").count(),4);
 await approvals045.getByRole("button",{name:"گەڕانەوە بۆ کۆگا"}).click();
 await page.locator('[data-canva-screen="036"]').waitFor({state:"visible"});
 await page.locator('[data-canva-screen="036"]').getByRole("button",{name:"ماڵەوە",exact:true}).click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 046: original supplier directory and actual DEMO debt; no invented status.
 // Card 04 subcard 1 is purchase request (047), subcard 2 is suppliers (046).
 await page.locator(".home-screen .module").nth(3).click();
 await page.locator(".home-screen .subgrid .sub").nth(1).click();
 const suppliers046=page.locator('[data-canva-screen="046"]');
 await suppliers046.waitFor({state:"visible"});
 assert.equal(await suppliers046.locator("h1").innerText(),"دابینکەران و زانیارییان");
 assert.equal(await suppliers046.locator("tbody tr[data-supplier-status]").count(),3);
 assert.equal(await suppliers046.getByRole("button",{name:"زیادکردنی دابینکەر"}).isDisabled(),true);
 assert.equal(await suppliers046.getByRole("button",{name:"بینینی وردەکاری"}).isDisabled(),true);
 assert.equal(await suppliers046.locator("tbody tr[data-supplier-status='unverified']").count(),3);
 await suppliers046.getByRole("button",{name:"چالاک",exact:true}).click();
 assert.equal(await suppliers046.locator("tbody tr[data-supplier-status]").count(),0);
 await suppliers046.getByRole("button",{name:"ناچالاک",exact:true}).click();
 assert.equal(await suppliers046.locator("tbody tr[data-supplier-status]").count(),0);
 await suppliers046.getByRole("button",{name:"هەموو",exact:true}).click();
 await suppliers046.getByPlaceholder("ناو، ناسنامە یان ژمارەی تۆمار").fill("sup-2");
 assert.equal(await suppliers046.locator("tbody tr[data-supplier-status]").count(),1);
 await suppliers046.getByRole("button",{name:"دابینکەری شیرەمەنی چیا"}).click();
 assert.equal(await suppliers046.locator(".canva-supplier-aside dd").nth(0).innerText(),"دابینکەری شیرەمەنی چیا");
 assert.equal(await suppliers046.locator(".canva-supplier-aside dd").nth(2).innerText(),"180,000 IQD");
 await suppliers046.getByRole("button",{name:"بینینی وردەکاری"}).click();
 assert.match(await suppliers046.getByRole("region",{name:"زانیاری پەیوەندی"}).innerText(),/0770 111 2233/);
 await suppliers046.getByRole("button",{name:"کۆی قەرز"}).click();
 assert.equal(await page.locator('[data-section-id="supplier-accounts"]').count(),1);
 const accounts052=page.locator('[data-canva-screen="052"]');
 await accounts052.getByRole("button",{name:"مێژووی پارەدان"}).click();
 const payments053=page.locator('[data-canva-screen="053"]');
 await payments053.getByRole("button",{name:"پارەدانی نوێ"}).click();
 await payments053.getByRole("combobox",{name:"دابینکەر",exact:true}).selectOption("sup-1");
 await payments053.getByLabel("بڕی پارەی دراو").fill("999999999");
 assert.equal(await payments053.getByRole("button",{name:"تۆمارکردنی پارەدان بە دابینکەر"}).isDisabled(),true);
 await payments053.getByRole("combobox",{name:"سەرچاوەی پارەدان",exact:true}).selectOption("safe");
 await payments053.getByLabel("بڕی پارەی دراو").fill("250");
 await payments053.getByRole("button",{name:"تۆمارکردنی پارەدان بە دابینکەر"}).click();
 assert.match(await payments053.locator("tbody").innerText(),/250 IQD/);
 await payments053.getByRole("button",{name:"ماڵەوە",exact:true}).click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 047: request draft only. Actual procurement, manager approval,
 // stock movement and real supplier payments remain untouched.
 await page.locator(".home-screen .module").nth(3).click();
 await page.locator(".home-screen .subgrid .sub").first().click();
 const request047=page.locator('[data-canva-screen="047"]');
 await request047.waitFor({state:"visible"});
 assert.equal(await request047.locator("h1").innerText(),"داواکاریی کڕین");
 assert.equal(await request047.getByRole("button",{name:"ناردن بۆ پەسەندکردن"}).isDisabled(),true);
 assert.equal(await request047.getByRole("button",{name:"پاشەکەوتکردنی ڕەشنووس"}).isDisabled(),false);
 await request047.getByPlaceholder("ناوی کاڵا یان بارکۆد").fill("2000000000018");
 await request047.getByRole("button",{name:/ئاوی کانی چنار 500ml — 2000000000018/}).click();
 await request047.locator("#purchase-047-unit").selectOption("carton");
 await request047.locator("#purchase-047-quantity").fill("0");
 await request047.locator("#purchase-047-supplier").selectOption("sup-1");
 await request047.getByRole("button",{name:"هەڵبژاردن",exact:true}).click();
 assert.equal(await request047.locator("tbody tr[data-purchase-line]").count(),0);
 assert.match(await request047.getByRole("status").innerText(),/گەورەتر لە سفر/);
 await request047.locator("#purchase-047-quantity").fill("2");
 await request047.getByRole("button",{name:"هەڵبژاردن",exact:true}).click();
 assert.equal(await request047.locator("tbody tr[data-purchase-line]").count(),1);
 assert.match(await request047.locator("tbody tr[data-purchase-line]").innerText(),/2000000000025/);
 assert.match(await request047.locator(".canva-purchase-line-supplier").innerText(),/کۆمپانیای ئەلبورز/);
 assert.match(await request047.locator(".canva-purchase-summary").innerText(),/کارتۆن: 2/);
 assert.equal(await request047.getByRole("button",{name:"ناردن بۆ پەسەندکردن"}).isDisabled(),true);
 await request047.getByRole("button",{name:"پاشەکەوتکردنی ڕەشنووس"}).click();
 assert.match(await request047.getByRole("status").innerText(),/تەنها لەم وێبگەڕەدا/);
 // Canva 048→049: review draft comparison without stock writes or an official PO.
 await request047.getByRole("button",{name:"فەرمانی کڕین لە ڕەشنووسی پاشەکەوتکراو"}).click();
 const order048=page.locator('[data-canva-screen="048"]');
 await order048.waitFor({state:"visible"});
 assert.equal(await order048.getByRole("button",{name:"ناردن بۆ پەسەندکردن"}).isDisabled(),true);
 await order048.getByRole("button",{name:"پێداچوونەوەی وەرگرتن — ڕەشنووس"}).click();
 const receiving049=page.locator('[data-canva-screen="049"]');
 await receiving049.waitFor({state:"visible"});
 assert.equal(await receiving049.locator("h1").innerText(),"وەرگرتنی کڕین لە دابینکەر");
 assert.equal(await receiving049.locator("tbody tr[data-receiving049-row]").count(),1);
 assert.equal(await receiving049.getByRole("button",{name:"پشتڕاستکردنەوەی وەرگرتن"}).isDisabled(),true);
 assert.equal(await receiving049.locator('input[aria-label="ناسنامەی فەرمانی کڕین"]').inputValue(),"");
 assert.equal(await receiving049.getByRole("button",{name:"پاشەکەوتکردنی ڕەشنووس"}).isDisabled(),true);
 const receivedBox=receiving049.getByRole("textbox",{name:"بڕی وەرگیراو: ئاوی کانی چنار 500ml"});
 await receivedBox.fill("1.5");
 assert.equal(await receivedBox.getAttribute("aria-invalid"),"true");
 assert.equal(await receiving049.getByRole("button",{name:"پاشەکەوتکردنی ڕەشنووس"}).isDisabled(),true);
 await receivedBox.fill("1");
 assert.equal(await receivedBox.getAttribute("aria-invalid"),"false");
 assert.match(await receiving049.locator('[data-receiving049-difference="short"]').innerText(),/\+24 دانە/);
 await receiving049.getByRole("button",{name:"ئاوی کانی چنار 500ml"}).click();
 await receiving049.getByRole("textbox",{name:"ژمارەی پسووڵەی دابینکەر"}).fill("INVOICE-DEMO-12");
 await receiving049.getByLabel("بەرواری بەسەرچوون").fill("2027-05-12");
 await receiving049.getByRole("button",{name:"پاشەکەوتکردنی ڕەشنووس"}).click();
 assert.match(await receiving049.getByRole("status").last().innerText(),/کۆگا نەگۆڕاوە/);
 await receiving049.getByRole("button",{name:"گەڕانەوە بۆ فەرمانی کڕین"}).click();
 await page.locator('[data-canva-screen="048"]').waitFor({state:"visible"});
 await page.locator('[data-canva-screen="048"]').getByRole("button",{name:"پێداچوونەوەی وەرگرتن — ڕەشنووس"}).click();
 await page.locator('[data-canva-screen="049"]').waitFor({state:"visible"});
 assert.equal(await page.locator('[data-canva-screen="049"]').getByRole("textbox",{name:"بڕی وەرگیراو: ئاوی کانی چنار 500ml"}).inputValue(),"1");
 assert.equal(await page.locator('[data-canva-screen="049"]').getByRole("textbox",{name:"ژمارەی پسووڵەی دابینکەر"}).inputValue(),"INVOICE-DEMO-12");
 assert.equal(await page.locator('[data-canva-screen="049"]').getByRole("button",{name:"پشتڕاستکردنەوەی وەرگرتن"}).isDisabled(),true);
 await page.locator('[data-canva-screen="049"]').getByRole("button",{name:"ماڵەوە",exact:true}).click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 await page.locator(".home-screen .module").nth(3).click();
 await page.locator(".home-screen .subgrid .sub").first().click();
 await page.locator('[data-canva-screen="047"]').waitFor({state:"visible"});
 assert.equal(await page.locator('[data-canva-screen="047"] tbody tr[data-purchase-line]').count(),1);
 await page.locator('[data-canva-screen="047"]').getByRole("button",{name:"کڕین و دابینکەران"}).click();
 await page.locator('[data-canva-screen="046"]').waitFor({state:"visible"});
 await page.locator('[data-canva-screen="046"]').getByRole("button",{name:"ماڵەوە"}).click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 021: product list + detail stay in the same route, filters apply
 // in place and the item details are data-bound (not a flat Canva image).
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(1).click();
 const catalog=page.locator('[data-canva-screen="021"]');
 await catalog.waitFor({state:"visible"});
 assert.equal(await catalog.locator(".canva-catalog-page-heading h1").innerText(),"لیستی کاڵا و نرخ");
 assert.equal(await catalog.locator(".canva-catalog-unit-filters button").count(),4);
 const layout=await catalog.locator(".canva-catalog-layout").evaluate(el=>{
   const children=Array.from(el.children).map(child=>child.getBoundingClientRect());
   return {listX:children[0].x,listWidth:children[0].width,asideX:children[1].x};
 });
 assert.ok(layout.listX>layout.asideX,"RTL product list must stay to the right of details");
 await catalog.getByRole("button",{name:"کیلۆ",exact:true}).click();
 assert.equal(await catalog.getByRole("button",{name:"کیلۆ",exact:true}).getAttribute("aria-pressed"),"true");
 await catalog.getByRole("button",{name:"هەموو",exact:true}).click();
 assert.equal(await catalog.getByRole("button",{name:"هەموو",exact:true}).getAttribute("aria-pressed"),"true");
 const productPick=catalog.locator(".canva-catalog-pick").first();
 if(await productPick.count()){
   await productPick.click();
   assert.notEqual(await catalog.locator(".canva-catalog-aside dd").first().innerText(),"—");
 }
 await catalog.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 024: validate actual barcode UI, mode switching and per-unit alias
 // in isolated React DEMO state (never a production stock/price mutation).
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(3).click();
 const barcodeScreen=page.locator('[data-canva-screen="024"]');
 await barcodeScreen.waitFor({state:"visible"});
 assert.equal(await barcodeScreen.locator("h1").innerText(),"بارکۆدەکان و جۆرەکانی فرۆشتن");
 assert.equal(await barcodeScreen.locator(".canva-barcode-mode-tabs button").count(),5);
 assert.equal(await barcodeScreen.getByRole("button",{name:"کارتۆن",exact:true}).isDisabled(),true);
 await barcodeScreen.getByPlaceholder("هەڵبژاردنی کاڵا بە ناو یان بارکۆد").fill("2000000000018");
 await barcodeScreen.getByRole("button",{name:/ئاوی کانی چنار 500ml — 2000000000018/}).click();
 assert.equal(await barcodeScreen.getByRole("button",{name:"کارتۆن",exact:true}).isEnabled(),true);
 await barcodeScreen.getByRole("button",{name:"کارتۆن",exact:true}).click();
 assert.equal(await barcodeScreen.getByRole("button",{name:"کارتۆن",exact:true}).getAttribute("aria-pressed"),"true");
 assert.match(await barcodeScreen.locator(".canva-barcode-table").innerText(),/2000000000025/);
 await barcodeScreen.getByRole("button",{name:"زیادکردنی بارکۆدی نوێ"}).click();
 await barcodeScreen.locator("#canva-barcode-new-alias").fill("2000000099991");
 await barcodeScreen.locator(".canva-barcode-alias-edit").getByRole("button",{name:"پاشەکەوت"}).click();
 assert.match(await barcodeScreen.locator(".canva-barcode-table").innerText(),/2000000099991/);
 assert.equal(await barcodeScreen.locator(".canva-barcode-table tbody tr").count(),2);
 await barcodeScreen.getByRole("button",{name:"زیادکردنی بارکۆدی نوێ"}).click();
 await barcodeScreen.locator("#canva-barcode-new-alias").fill("2000000099991");
 await barcodeScreen.locator(".canva-barcode-alias-edit").getByRole("button",{name:"پاشەکەوت"}).click();
 assert.equal(await barcodeScreen.locator(".canva-barcode-table tbody tr").count(),2,
   "Repeated carton alias must be rejected rather than duplicated");
 // Canva 026: read-only exact match scanner, verify local assignment and
 // no mutation, with one-key Enter behavior as used by HID barcode scanners.
 await barcodeScreen.locator(".canva-barcode-duplicate-open").click();
 const duplicateScreen=page.locator('[data-canva-screen="026"]');
 await duplicateScreen.waitFor({state:"visible"});
 assert.equal(await duplicateScreen.locator("h1").innerText(),"پشکنینی بارکۆدی دووبارە");
 const duplicateInput=duplicateScreen.locator("#canva-duplicate-barcode-input");
 await duplicateInput.fill("2000000000025");
 await duplicateInput.press("Enter");
 assert.equal(await duplicateScreen.locator(".canva-duplicate-table tbody tr").count(),1);
 assert.match(await duplicateScreen.locator(".canva-duplicate-table").innerText(),/کارتۆن/);
 assert.equal(await duplicateScreen.locator(".canva-duplicate-aside dd").first().innerText(),"یەک خاوەند");
 await duplicateInput.fill("0000000099999");
 await duplicateScreen.getByRole("button",{name:"پشکنین",exact:true}).click();
 assert.match(await duplicateScreen.getByRole("status").innerText(),/نەدۆزرایەوە/);
 await duplicateInput.fill("20 000");
 await duplicateInput.press("Enter");
 assert.equal(await duplicateScreen.locator(".canva-duplicate-aside dd").first().innerText(),"بارکۆدی نادروست");
 await duplicateScreen.getByRole("button",{name:"هەڵوەشاندنەوەی داواکاری"}).click();
 assert.equal(await duplicateInput.inputValue(),"");
 await duplicateScreen.getByRole("button",{name:"گەڕانەوە بۆ بارکۆدەکان"}).click();
 assert.equal(await page.locator('[data-canva-screen="024"]').count(),1);
 // Canva 031: navigate from original barcode page and add one carton
 // alias in the isolated local DEMO; duplicate ownership remains guarded.
 await barcodeScreen.getByRole("button",{name:"بارکۆدە زیادەکانی هەر یەکە"}).click();
 const extras031=page.locator('[data-canva-screen="031"]');
 await extras031.waitFor({state:"visible"});
 assert.equal(await extras031.locator("h1").innerText(),"بارکۆدە زیادەکانی هەر یەکە");
 assert.equal(await extras031.locator(".canva-extra-tabs button").count(),5);
 assert.equal(await extras031.getByRole("button",{name:"کارتۆن",exact:true}).getAttribute("aria-pressed"),"true");
 const before031=await extras031.locator(".canva-extra-table tbody tr").count();
 await extras031.locator("#canva-031-new-code").fill("2000000099992");
 await extras031.getByRole("button",{name:"زیادکردن",exact:true}).click();
 assert.equal(await extras031.locator(".canva-extra-table tbody tr").count(),before031+1);
 assert.match(await extras031.locator(".canva-extra-table").innerText(),/2000000099992/);
 await extras031.locator("#canva-031-new-code").fill("2000000099992");
 await extras031.getByRole("button",{name:"زیادکردن",exact:true}).click();
 assert.match(await extras031.getByRole("status").innerText(),/پێشتر/);
 assert.equal(await extras031.locator(".canva-extra-table tbody tr").count(),before031+1);
 await extras031.getByRole("button",{name:"گەڕانەوە بۆ بارکۆدەکان"}).click();
 assert.equal(await page.locator('[data-canva-screen="024"]').count(),1);
 assert.match(await barcodeScreen.locator(".canva-barcode-table").innerText(),/2000000099992/);
 await barcodeScreen.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 029: user-facing permission matrix is only a role specification;
 // no authenticated actor, no real requests, and no authorization granted.
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(2).click();
 await page.getByRole("button",{name:"دەسەڵاتی کاشێر و بەڕێوەبەر"}).click();
 const permissions029=page.locator('[data-canva-screen="029"]');
 await permissions029.waitFor({state:"visible"});
 assert.equal(await permissions029.locator("h1").innerText(),"دەسەڵاتی کاشێر و بەڕێوەبەر");
 assert.equal(await permissions029.locator(".canva-permission-table tbody tr").count(),5);
 assert.equal(await permissions029.locator('[data-policy-action="change-sale-price"] td').nth(1).innerText(),"داواکاری");
 assert.equal(await permissions029.locator('[data-policy-action="change-sale-price"] td').nth(2).innerText(),"دەستکاری");
 assert.equal(await permissions029.locator(".canva-permission-aside dd").first().innerText(),"پشتڕاست نەکراوە");
 assert.equal(await permissions029.getByRole("button",{name:"ناردنی داواکاری"}).isDisabled(),true);
 await permissions029.getByPlaceholder("هۆکاری داواکاری بنووسە").fill("دروستکردنی داواکاریی تاقیکردنەوە");
 assert.equal(await permissions029.locator(".canva-permission-aside dd").last().innerText(),"نەنێردراوە");
 assert.equal(await permissions029.getByRole("button",{name:"ناردنی داواکاری"}).isDisabled(),true);
 await permissions029.locator('[data-policy-action="bulk-price"]').getByRole("button",{name:"گۆڕینی نرخ بەکۆمەڵ"}).click();
 assert.equal(await page.locator('[data-canva-screen="028"]').count(),1);
 await page.locator('[data-canva-screen="028"]').getByRole("button",{name:"هەڵوەشاندنەوە",exact:true}).click();
 await page.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 030: no trusted requests and no authorization while demo-only.
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(2).click();
 await page.getByRole("button",{name:"پێداچوونەوە و پەسەندکردنی گۆڕانکاری"}).click();
 const review030=page.locator('[data-canva-screen="030"]');
 await review030.waitFor({state:"visible"});
 assert.equal(await review030.locator("h1").innerText(),"پێداچوونەوە و پەسەندکردنی گۆڕانکاری");
 assert.equal(await review030.locator(".canva-review-table tbody tr").count(),4);
 assert.equal(await review030.getByRole("button",{name:"پەسەندکردن",exact:true}).isDisabled(),true);
 assert.equal(await review030.getByRole("button",{name:"ڕەتکردنەوە",exact:true}).isDisabled(),true);
 await review030.locator("#canva-030-status").selectOption("pending");
 assert.match(await review030.getByRole("status").innerText(),/هیچ داواکاریی چاوەڕوانێکی پشتڕاستکراو/);
 assert.equal(await review030.locator(".canva-review-table tbody tr[data-review-type]").count(),0);
 await review030.getByRole("button",{name:"کاڵا و نرخ"}).click();
 await page.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 032: source-based base-unit factor table, no silent conversion
 // from kilograms to pieces and no unverified write request.
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(2).click();
 await page.getByRole("button",{name:"ڕێژەی گۆڕینی یەکەکان"}).click();
 const ratios032=page.locator('[data-canva-screen="032"]');
 await ratios032.waitFor({state:"visible"});
 assert.equal(await ratios032.locator("h1").innerText(),"ڕێژەی گۆڕینی یەکەکان");
 assert.equal(await ratios032.locator(".canva-ratio-table tbody tr").count(),5);
 assert.equal(await ratios032.getByRole("button",{name:"داواکردنی پاشەکەوتکردن"}).isDisabled(),true);
 await ratios032.getByPlaceholder("کاڵا بە بارکۆد یان ناو هەڵبژێرە").fill("2000000000018");
 await ratios032.getByRole("button",{name:/ئاوی کانی چنار 500ml — 2000000000018/}).click();
 const carton032=ratios032.locator('[data-unit-ratio-mode="carton"]');
 assert.equal(await carton032.locator("td").nth(0).innerText(),"کارتۆن");
 assert.equal(await carton032.locator("td").nth(1).innerText(),"دانە");
 assert.equal(await carton032.locator("td").nth(2).innerText(),"24");
 assert.equal(await carton032.locator("td").nth(4).innerText(),"چالاک");
 assert.equal(await ratios032.locator('[data-unit-ratio-mode="kg"] td').nth(2).innerText(),"—");
 await ratios032.getByRole("button",{name:"پشکنینی ڕێژەکان"}).click();
 assert.match(await ratios032.getByRole("status").innerText(),/2 جۆری یەکەی چالاک/);
 await ratios032.getByRole("button",{name:"گەڕانەوە",exact:true}).click();
 await page.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 033: selected-product DEMO gross profit and missing costs,
 // without retroactively inventing purchase prices or granting permission.
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(2).click();
 await page.getByRole("button",{name:"پشکنینی قازانج و نرخی کاڵا"}).click();
 const profit033=page.locator('[data-canva-screen="033"]');
 await profit033.waitFor({state:"visible"});
 assert.equal(await profit033.locator(".canva-profit-table tbody tr").count(),5);
 await profit033.getByPlaceholder("کاڵایەک هەڵبژێرە").fill("2000000000018");
 await profit033.getByRole("button",{name:/ئاوی کانی چنار 500ml — 2000000000018/}).click();
 const single033=profit033.locator('[data-profit-mode="unit"]');
 assert.match(await single033.locator("td").nth(1).innerText(),/175 IQD/);
 assert.match(await single033.locator("td").nth(2).innerText(),/250 IQD/);
 assert.match(await single033.locator("td").nth(3).innerText(),/75 IQD/);
 assert.match(await single033.locator("td").nth(4).innerText(),/30\.0 %/);
 await profit033.locator('[data-profit-mode="carton"]').getByRole("button",{name:"کارتۆن"}).click();
 assert.match(await profit033.locator(".canva-profit-aside dd").nth(0).innerText(),/5,000 IQD/);
 assert.match(await profit033.locator(".canva-profit-aside dd").nth(1).innerText(),/3,800 IQD/);
 assert.match(await profit033.locator(".canva-profit-aside dd").nth(2).innerText(),/1,200 IQD/);
 assert.equal(await profit033.locator('[data-profit-mode="kg"] td').nth(3).innerText(),"— IQD");
 await profit033.getByRole("button",{name:"داواکردنی گۆڕینی نرخ"}).click();
 assert.equal(await page.locator('[data-canva-screen="029"]').count(),1);
 assert.equal(await page.locator('[data-canva-screen="029"]').getByRole("button",{name:"ناردنی داواکاری"}).isDisabled(),true);
 await page.locator('[data-canva-screen="029"]').getByRole("button",{name:"گەڕانەوە",exact:true}).click();
 await page.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 034: CSV input must only preview and never silently add
 // a new product or overwrite an existing real or DEMO barcode.
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(1).click();
 await page.getByRole("button",{name:"پێشبینینی هاوردەکردنی CSV"}).click();
 const import034=page.locator('[data-canva-screen="034"]');
 await import034.waitFor({state:"visible"});
 assert.equal(await import034.locator("h1").innerText(),"پێشبینینی هاوردەکردنی کاڵاکان");
 assert.equal(await import034.getByRole("button",{name:"پشکنینی فایل"}).isDisabled(),true);
 await import034.locator("#canva-034-file").setInputFiles({
  name:"test-preview.csv",mimeType:"text/csv",
  buffer:Buffer.from([
   "name,barcode,price,unit",
   "ئاوی نوێ,0000000091234,450,دانە",
   "دووبارە,2000000000018,250,دانە"
  ].join(String.fromCharCode(10)))
 });
 await import034.getByRole("button",{name:"پشکنینی فایل"}).click();
 assert.equal(await import034.locator(".canva-import-table tbody tr[data-import-status]").count(),2);
 assert.equal(await import034.locator(".canva-import-table tbody tr[data-import-status='ready']").count(),1);
 assert.equal(await import034.locator(".canva-import-table tbody tr[data-import-status='error']").count(),1);
 assert.match(await import034.locator(".canva-import-table tbody").innerText(),/بارکۆد پێشتر/);
 assert.equal(await import034.locator(".canva-import-aside dd").first().innerText(),"2");
 assert.equal(await import034.locator(".canva-import-aside dd").nth(1).innerText(),"1");
 assert.match(await import034.getByRole("status").innerText(),/هیچ کاڵایەک هاوردە نەکراوە/);
 await import034.getByRole("button",{name:"گەڕانەوە",exact:true}).click();
 assert.equal(await page.locator(".section-workspace__metric").first().innerText().then(x=>x.includes("لیستی کاڵاکان")),true);
 await page.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 035: never claim a barcode is active or permit unauthorized
 // stop/restoration when the DEMO product model lacks trusted status.
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(1).click();
 await page.getByRole("button",{name:"ناچالاککردن و گەڕاندنەوەی کاڵا"}).click();
 const lifecycle035=page.locator('[data-canva-screen="035"]');
 await lifecycle035.waitFor({state:"visible"});
 assert.equal(await lifecycle035.locator("h1").innerText(),"ناچالاککردن و گەڕاندنەوەی کاڵا");
 assert.equal(await lifecycle035.getByRole("button",{name:"داواکردنی ناچالاککردن"}).isDisabled(),true);
 assert.equal(await lifecycle035.getByRole("button",{name:"گەڕاندنەوەی کاڵا"}).isDisabled(),true);
 await lifecycle035.getByPlaceholder("دۆزینەوەی کاڵا بە ناو یان بارکۆد").fill("2000000000018");
 await lifecycle035.getByRole("button",{name:/ئاوی کانی چنار 500ml — 2000000000018/}).click();
 assert.ok(await lifecycle035.locator(".canva-lifecycle-table tbody tr[data-lifecycle-status]").count()>=3);
 assert.equal(await lifecycle035.locator(".canva-lifecycle-table tbody tr[data-lifecycle-status='unverified']").count(),await lifecycle035.locator(".canva-lifecycle-table tbody tr[data-lifecycle-status]").count());
 assert.match(await lifecycle035.locator(".canva-lifecycle-table tbody").innerText(),/2000000000025/);
 assert.equal(await lifecycle035.locator(".canva-lifecycle-aside dd").nth(0).innerText(),"پشتڕاست نەکراوە");
 assert.equal(await lifecycle035.locator(".canva-lifecycle-aside dd").nth(1).innerText(),"—");
 await lifecycle035.getByPlaceholder("هۆکاری ناچالاککردن").fill("هۆکاری تاقیکردنەوە، نەک داواکاری فەرمی");
 assert.equal(await lifecycle035.getByRole("button",{name:"داواکردنی ناچالاککردن"}).isDisabled(),true);
 assert.equal(await lifecycle035.getByRole("button",{name:"گەڕاندنەوەی کاڵا"}).isDisabled(),true);
 await lifecycle035.getByRole("button",{name:"کاڵا و نرخ"}).click();
 await page.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 028: preview only, before any real local DEMO price edits.
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(2).click();
 await page.getByRole("button",{name:"گۆڕینی نرخ بەکۆمەڵ"}).click();
 const bulk028=page.locator('[data-canva-screen="028"]');
 await bulk028.waitFor({state:"visible"});
 assert.equal(await bulk028.locator("h1").innerText(),"گۆڕینی نرخ بەکۆمەڵ");
 assert.equal(await bulk028.getByRole("button",{name:"نرخی بەکۆمەڵ"}).isDisabled(),true);
 assert.equal(await bulk028.locator(".canva-bulk-price-table tbody tr").count(),3);
 await bulk028.locator("#canva-028-category").selectOption({label:"خواردنەوەکان"});
 await bulk028.locator("#canva-028-change").fill("10");
 await bulk028.getByRole("button",{name:"پێشبینینی گۆڕانکاری"}).click();
 const water028=bulk028.locator(".canva-bulk-price-table tbody tr").filter({hasText:"ئاوی کانی چنار 500ml"}).first();
 assert.equal(await water028.count(),1);
 assert.match(await water028.innerText(),/250 IQD/);
 assert.match(await water028.innerText(),/275 IQD/);
 assert.match(await bulk028.getByRole("status").innerText(),/هیچ نرخێکی ڕاستەقینە ناگۆڕدرێت/);
 await bulk028.getByRole("button",{name:"هەڵوەشاندنەوە",exact:true}).click();
 await page.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 027: compare actual unit/carton prices without automatic guesses.
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(2).click();
 await page.getByRole("button",{name:"نرخەکانی هەر جۆری یەکە"}).click();
 const perUnit027=page.locator('[data-canva-screen="027"]');
 await perUnit027.waitFor({state:"visible"});
 assert.equal(await perUnit027.locator(".canva-unit-price-table tbody tr").count(),5);
 assert.equal(await perUnit027.getByRole("button",{name:"داواکردنی گۆڕینی نرخ"}).isDisabled(),true);
 await perUnit027.getByPlaceholder("کاڵا بە ناو یان بارکۆد هەڵبژێرە").fill("2000000000018");
 await perUnit027.getByRole("button",{name:/ئاوی کانی چنار 500ml — 2000000000018/}).click();
 const unit027=perUnit027.locator('[data-unit-price-mode="unit"]');
 const carton027=perUnit027.locator('[data-unit-price-mode="carton"]');
 assert.equal(await unit027.locator("td").nth(1).innerText(),"دانە");
 assert.match(await unit027.locator("td").nth(3).innerText(),/250/);
 assert.equal(await carton027.locator("td").nth(2).innerText(),"24");
 assert.match(await carton027.locator("td").nth(3).innerText(),/5,000/);
 assert.equal(await perUnit027.locator('[data-unit-price-mode="kg"] td').first().innerText(),"—");
 assert.equal(await perUnit027.locator(".canva-unit-price-aside dd").nth(2).innerText(),"—",
   "Do not invent historical price-change date");
 await perUnit027.getByRole("button",{name:"گەڕانەوە بۆ کاڵاکان"}).click();
 await page.locator(".canva-catalog-home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 // Canva 025: change a local DEMO product price, then read the actual
 // before/after audit event. Never infer approval or import legacy history.
 await page.locator(".home-screen .module").nth(1).click();
 await page.locator(".home-screen .subgrid .sub").nth(1).click();
 const list025=page.locator('[data-canva-screen="021"]');
 await list025.waitFor({state:"visible"});
 await list025.locator(".canva-catalog-pick").first().click();
 await list025.locator(".canva-catalog-aside").getByRole("button",{name:"بینینی وردەکاری"}).click();
 const edit025=page.locator(".canva-catalog-new-layout form");
 const saleInput025=edit025.locator('input[type="number"]').nth(1);
 const originalSale025=Number(await saleInput025.inputValue());
 assert.ok(Number.isSafeInteger(originalSale025) && originalSale025>0);
 await saleInput025.fill(String(originalSale025+7));
 await edit025.getByRole("button",{name:"پاشەکەوتکردنی گۆڕانکارییەکان"}).click();
 await page.locator(".canva-catalog-edit-permission").getByRole("button",{name:"مێژووی گۆڕانکاریی نرخەکان"}).click();
 const priceHistory025=page.locator('[data-canva-screen="025"]');
 await priceHistory025.waitFor({state:"visible"});
 assert.equal(await priceHistory025.locator("h1").innerText(),"مێژووی گۆڕانکاریی نرخەکان");
 const firstAudit025=priceHistory025.locator(".canva-history-table tbody tr").first();
 assert.ok(await firstAudit025.count(),"Real DEMO price change must appear");
 const before025=await firstAudit025.locator("td").nth(3).innerText();
 const after025=await firstAudit025.locator("td").nth(4).innerText();
 assert.match(before025,new RegExp(String(originalSale025)));
 assert.match(after025,new RegExp(String(originalSale025+7)));
 assert.match(await firstAudit025.locator("td").nth(5).innerText(),/تاقیکردنەوە/);
 assert.equal(await priceHistory025.locator(".canva-history-aside dd").nth(1).innerText(),"—",
  "Unverified managerial approval count must not be fabricated");
 await priceHistory025.getByRole("button",{name:"پشکنینی وردەکاری"}).click();
 assert.equal(await page.locator('[data-canva-screen="023"]').count(),1);
 await page.locator(".canva-catalog-new-heading").getByRole("button",{name:"ماڵەوە"}).click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 await page.locator('[data-canva-card="01"]').click();
 await page.locator('#locked-home-subcards [data-section-target="barcode-scan"]').click();
 const banner=page.getByRole("status",{name:"دۆخی تاقیکردنەوەی کاشێر"});
 await banner.waitFor({state:"visible"});
 assert.match(await banner.innerText(),/فرۆشتنی ڕاستەقینە نییە/);
 // Stable semantic input ID: visible Sorani guidance may evolve independently.
 const barcode=page.getByTestId("pos-barcode-input");
 assert.equal(await barcode.getAttribute("aria-label"),"بارکۆدی کاڵا");
 await barcode.waitFor({state:"visible"});
 // Canva 002: real React controls mirror the approved Sorani desktop geometry.
 const pageHeading=page.locator('[data-canva-page-heading="002"]');
 assert.equal(await pageHeading.locator("h1").innerText(),"فرۆشتن و کاشێر");
 assert.equal(await pageHeading.getByRole("button",{name:"ماڵەوە"}).count(),1);
 assert.equal(await page.locator(".canva-ticket-history").innerText(),"پسووڵەکان");
 assert.equal(await page.locator(".canva-pos-summary-title").innerText(),"پوختەی پارەدان");
 assert.equal(await page.locator(".canva-pos-totals dt").count(),3);
 const posColumns=await page.locator(".ws-pos-layout").evaluate(el=>{
   const children=Array.from(el.children).map(child=>child.getBoundingClientRect());
   return {basketX:children[0].x,basketW:children[0].width,summaryX:children[1].x,summaryW:children[1].width};
 });
 assert.ok(posColumns.basketX>posColumns.summaryX,"RTL basket must be to the right of the summary");
 assert.ok(posColumns.basketW>posColumns.summaryW*1.5,"Basket must remain the wider Canva column");
 // Canva 002 presents five ticket slots; switching preserves each basket.
 const tickets=page.locator("[data-canva-ticket]");
 assert.equal(await tickets.count(),5);
 assert.equal(await tickets.first().getAttribute("data-canva-ticket"),"01");
 const bank=page.getByRole("button",{name:/بانکی — هێشتا کارا نییە/});
 assert.equal(await bank.isDisabled(),true);
 const mixed=page.getByRole("button",{name:/تێکەڵ — هێشتا کارا نییە/});
 assert.equal(await mixed.isDisabled(),true);
 await page.locator('[data-canva-ticket="02"]').click();
 assert.equal(await page.locator('[data-canva-ticket="02"]').getAttribute("aria-pressed"),"true");
 await context.setOffline(true);
 await barcode.fill("2000000000018");
 await barcode.press("Enter");
 await page.getByText("ئاوی کانی چنار 500ml").first().waitFor({state:"visible"});
 await page.locator('[data-canva-ticket="01"]').click();
 assert.equal(await page.locator("#finish-sale").isDisabled(),true);
 await page.locator('[data-canva-ticket="02"]').click();
 assert.equal(await page.locator("#finish-sale").isDisabled(),false);
 assert.equal(await page.locator('[data-canva-ticket="02"]').getAttribute("aria-pressed"),"true");
 assert.equal(await page.locator('[data-demo-watermark="true"]').count(),0);
 // Offline DEMO checkout stays on the same cashier screen: never auto-open a modal.
 await page.keyboard.press("F4");
 const inline=page.locator('[data-inline-checkout-confirmation="true"]');
 await inline.waitFor({state:"visible"});
 assert.equal(await page.locator(".thermal-receipt-backdrop").count(),0);
 assert.match(await inline.innerText(),/DEMO-RCP-/);
 const ticket=page.locator('#zhirox-inline-print-ticket[data-demo-receipt="true"]');
 assert.equal(await ticket.count(),1);
 assert.match(await ticket.textContent(),/بەڵگەی فرۆشتنی ڕاستەقینە نییە/);
 assert.equal(await page.evaluate(() => window.__zhiroxPrintCalls),1);
 assert.equal(await page.locator("#finish-sale").isDisabled(),true);
 // An extra F4 after clearing the cart must not record/print a second sale.
 await page.keyboard.press("F4");
 assert.equal(await page.evaluate(() => window.__zhiroxPrintCalls),1);
 // A reprint is allowed, but is not another checkout.
 await inline.getByRole("button",{name:"دووبارە چاپ"}).click();
 assert.equal(await page.evaluate(() => window.__zhiroxPrintCalls),2);
 assert.equal(await page.locator('[data-inline-checkout-confirmation="true"]').count(),1);
 assert.deepEqual(errors,[],"React client should not throw when internet disappears during demo checkout");
 console.log("PASS: locked Home navigation, offline Demo checkout, no modal, single print, safe reprint");
} finally {
 await browser.close();
}
