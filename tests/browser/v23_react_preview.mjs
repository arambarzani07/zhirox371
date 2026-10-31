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
 assert.equal(await page.locator(".module").count(),12,"React Home must have twelve main cards");
 assert.equal(await page.locator(".module").first().getAttribute("data-module"),"0");
 await page.locator(".module").first().click();
 assert.equal(await page.locator(".drawer .sub").count(),4,"each selected main card has four subcards");
 // Locked Home has no cashier shortcut in its header; navigate through the real subcard.
 await page.locator(".drawer .sub").first().click();
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
 console.log("PASS: 12 React Home cards, four Sorani subcards, offline demo scan, DEMO-RCP and printable non-fiscal watermark");
} finally {
 await browser.close();
}
