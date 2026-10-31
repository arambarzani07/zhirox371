import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:3000";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1320,height:900},locale:"en-US"});
const page=await context.newPage();
const errors=[];
page.on("pageerror",error=>errors.push(error.message));
try {
 await page.goto(origin,{waitUntil:"networkidle"});
 assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
 // No frozen Home dimensions, row counts, icon choices or subcard count.
 // This browser smoke test only verifies that the cashier remains reachable.
 assert.equal(await page.locator(".home-screen .module").count(),0);
 await page.locator(".system-header .ws-link").filter({hasText:"کاشێر"}).click();
 const banner=page.getByRole("status",{name:"دۆخی تاقیکردنەوەی کاشێر"});
 await banner.waitFor({state:"visible"});
 assert.match(await banner.innerText(),/فرۆشتنی ڕاستەقینە نییە/);
 const barcode=page.getByPlaceholder("بارکۆد بسکێنە یان کۆدی کاڵا لێبدە...");
 await context.setOffline(true);
 await barcode.fill("2000000000018");
 await barcode.press("Enter");
 await page.getByText("ئاوی کانی چنار 500ml").first().waitFor({state:"visible"});
 assert.equal(await page.locator('[data-demo-watermark="true"]').count(),0);
 // The browser demo intentionally works offline, but stores only in LocalStorage.
 await page.keyboard.press("F4");
 const watermark=page.locator('[data-demo-watermark="true"]');
 await watermark.waitFor({state:"visible"});
 assert.match(await watermark.innerText(),/بەڵگەی فرۆشتنی ڕاستەقینە نییە/);
 assert.match(await page.getByText(/DEMO-RCP-/).first().innerText(),/DEMO-RCP-/);
 assert.deepEqual(errors,[],"React client should not throw when internet disappears during demo checkout");
 console.log("PASS: redesignable Home navigation, offline Demo scan and explicitly non-fiscal receipt");
} finally {
 await browser.close();
}
