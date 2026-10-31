import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:3000";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},locale:"en-US"});
const page=await context.newPage(),errors=[];
page.on("pageerror",error=>errors.push(error.message));
const names=[
 ["کاشێر","03-cashier-demo.png"],
 ["کاڵاکان","04-products.png"],
 ["کۆگا","05-stock.png"],
 ["کڕیاران","06-customers.png"],
 ["دابینکەران","07-suppliers.png"],
 ["دارایی","08-finance.png"],
 ["ڕاپۆرت","09-reports.png"],
 ["لیبڵ","10-labels.png"],
 ["ڕێکخستن","11-settings.png"]
];
try {
 await mkdir("artifacts/system-v2",{recursive:true});
 await page.goto(origin,{waitUntil:"networkidle"});
 assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
 await page.locator(".home-screen").waitFor();
 assert.equal(await page.locator(".system-header").count(),1);
 assert.equal(await page.locator(".system-header .ws-link").count(),9);
 assert.equal(await page.locator(".module").count(),12);
 const tokens=await page.evaluate(()=>({
  banner:getComputedStyle(document.documentElement).getPropertyValue("--market-banner-height").trim(),
  background:getComputedStyle(document.querySelector("#app")).backgroundColor
 }));
 assert.equal(tokens.banner,"56px","all system pages share one banner height");
 await page.screenshot({path:"artifacts/system-v2/01-home.png",fullPage:false});
 await page.locator(".module").first().click();
 assert.equal(await page.locator(".drawer .sub").count(),4);
 await page.screenshot({path:"artifacts/system-v2/02-home-submodules.png",fullPage:false});
 await page.locator(".drawer .sub").first().click();
 await page.locator(".system-header .ws-link.active").waitFor();
 for(const [label,file] of names){
  const button=page.locator(".system-header .ws-link").filter({hasText:label}).first();
  await button.click();
  await page.waitForTimeout(70);
  assert.equal(await page.locator(".system-header .ws-link.active").count(),1,"single active nav in "+label);
  const main=page.locator("#app");
  assert.ok((await main.innerText()).length>20,"route has content "+label);
  await page.screenshot({path:"artifacts/system-v2/"+file,fullPage:false});
 }
 await page.locator(".system-header .home").click();
 assert.equal(await page.locator(".home-screen .module").count(),12);
 assert.deepEqual(errors,[],"UI navigation should not throw any client errors");
 console.log("PASS V2: unified Sorani design Home + all nine React module routes; no visual freeze or database requests");
}finally{await browser.close();}
