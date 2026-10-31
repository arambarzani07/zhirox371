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
 // A native PC viewport must be filled, not a centered card inside margins.
 const assertFullscreen=async(width,height)=>{
   await page.setViewportSize({width,height});
   const geometry=await page.evaluate(()=>{
     const rect=selector=>{const el=document.querySelector(selector);if(!el)throw Error("not found: "+selector);
       const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
     return {windowWidth:window.innerWidth,windowHeight:window.innerHeight,
       banner:rect(".market-banner"),viewport:rect("#root > .viewport"),
       desktop:rect("#root > .viewport > .desktop"),header:rect("header.system-strip-only"),
       app:rect("#app"),home:document.querySelector(".home-strip-only")?rect(".home-strip-only"):null};
   });
   assert.ok(Math.abs(geometry.banner.width-width)<=2,"market banner fills PC width");
   assert.ok(Math.abs(geometry.desktop.width-width)<=2,"desktop occupies PC width");
   assert.ok(Math.abs(geometry.app.width-width)<=2,"workspace occupies PC width");
   assert.ok(Math.abs(geometry.app.bottom-height)<=3,"workspace ends at PC bottom");
   assert.ok(geometry.header.x>=-2&&Math.abs(geometry.header.width-width)<=2,"full-width horizontal strip");
   if(geometry.home)assert.ok(Math.abs(geometry.home.width-width)<=2,"no centered Home card");
 };
 await assertFullscreen(1440,900);
 await page.screenshot({path:"artifacts/system-v2/01-home.png",fullPage:false});
 await assertFullscreen(1920,1080);
 await page.screenshot({path:"artifacts/system-v2/00-home-full-pc-1920.png",fullPage:false});
 await assertFullscreen(1366,768);
 await page.screenshot({path:"artifacts/system-v2/00-home-full-pc-1366.png",fullPage:false});
 await assertFullscreen(1440,900);
 assert.equal(await page.locator(".home-strip-only").innerText(),"","Home has no unnecessary text");
 for(const [label,file] of names){
  const button=nav.getByRole("button",{name:label,exact:true});
  await button.click();
  assert.equal(await nav.locator("button.active").count(),1,"only one active module");
  const content=page.locator("#app");
  assert.ok((await content.innerText()).length>12,"feature view is reachable: "+label);
  assert.equal(await page.locator(".module,.drawer,.sub").count(),0,"feature never resurrects cards");
  await assertFullscreen(1440,900);
  await page.screenshot({path:"artifacts/system-v2/"+file,fullPage:false});
  if(label==="کاڵاکان"){
    await assertFullscreen(1920,1080);
    await page.screenshot({path:"artifacts/system-v2/15-products-full-pc-1920.png",fullPage:false});
    await assertFullscreen(1440,900);
  }
 }
 await nav.getByRole("button",{name:"سەرەتا",exact:true}).click();
 assert.equal(await page.locator(".home-strip-only").count(),1);
 assert.equal(await page.locator(".module").count(),0);
 assert.deepEqual(errors,[],"no client error while navigating horizontal strip");
 console.log("PASS V2: 13-button horizontal ribbon and 12 module routes, without Home cards");
}finally{await browser.close();}
