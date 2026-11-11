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
 await barcodeScreen.locator(".canva-catalog-home").click();
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
 await page.locator(".system-header .ws-link").filter({hasText:"کاشێر"}).click();
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
