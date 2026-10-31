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
 ["ڕێکخستن","10-settings.png"],
 ["ئافەر","11-offers.png"],
 ["لیبڵ","12-labels.png"],
 ["شێفت","13-shifts.png"],
 ["چاودێری","14-audit.png"]
];
try{
 await mkdir("artifacts/system-v2",{recursive:true});
 await page.goto(origin,{waitUntil:"networkidle"});
 assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
 await page.locator(".home-strip-only").waitFor();
 const nav=page.locator("header.system-strip-only .system-nav");
 assert.equal(await nav.count(),1);
 assert.equal(await nav.locator("button").count(),13);
 assert.equal(await page.locator(".module,.sub,.drawer,.subgrid").count(),0,"all Home cards and subcards removed");
 const tokens=await page.evaluate(()=>({
  banner:getComputedStyle(document.documentElement).getPropertyValue("--market-banner-height").trim(),
  header:document.querySelector(".system-strip-only").getBoundingClientRect(),
  market:document.querySelector(".market-banner").getBoundingClientRect()
 }));
 assert.equal(tokens.banner,"56px");
 assert.ok(Math.abs(tokens.header.top-tokens.market.bottom)<2,"only ribbon sits directly beneath market name");
 await page.screenshot({path:"artifacts/system-v2/01-home.png",fullPage:false});
 assert.equal(await page.locator(".home-strip-only").innerText(),"","Home has no unnecessary text");
 for(const [label,file] of names){
  const button=nav.getByRole("button",{name:label,exact:true});
  await button.click();
  assert.equal(await nav.locator("button.active").count(),1,"only one active module");
  const content=page.locator("#app");
  assert.ok((await content.innerText()).length>12,"feature view is reachable: "+label);
  assert.equal(await page.locator(".module,.drawer,.sub").count(),0,"feature never resurrects cards");
  await page.screenshot({path:"artifacts/system-v2/"+file,fullPage:false});
 }
 await nav.getByRole("button",{name:"سەرەتا",exact:true}).click();
 assert.equal(await page.locator(".home-strip-only").count(),1);
 assert.equal(await page.locator(".module").count(),0);
 assert.deepEqual(errors,[],"no client error while navigating horizontal strip");
 console.log("PASS V2: 13-button horizontal ribbon and 12 module routes, without Home cards");
}finally{await browser.close();}
