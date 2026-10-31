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
 assert.equal(await page.locator(".module,.sub,.drawer,.subgrid").count(),0,"old Home cards and drawers stay removed");
 assert.equal(await page.locator(".system-module-column .system-module-link").count(),12,"all 12 module names are stacked in column one");
 assert.equal(await page.locator(".system-submodule-column .system-submodule-link").count(),4,"four submodules stack in second column");
 const geometry=await page.evaluate(()=>{
  const rect=s=>document.querySelector(s).getBoundingClientRect();
  const first=rect(".system-module-column"),second=rect(".system-submodule-column"),content=rect(".system-content-column");
  const sub=Array.from(document.querySelectorAll(".system-submodule-link")).map(el=>el.getBoundingClientRect().top);
  return {first:{x:first.x,right:first.right,width:first.width},second:{x:second.x,right:second.right,width:second.width},
    content:{x:content.x,width:content.width},sub};
 });
 assert.ok(geometry.first.x>=geometry.second.right-2&&geometry.second.x>=geometry.content.x+geometry.content.width-2,
  "RTL module column, second submodule column, and full remaining PC content");
 assert.ok(geometry.sub.every((y,i)=>i===0||y>geometry.sub[i-1]),"submodules stack vertically");
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
       app:rect("#app"),content:rect(".system-content-column"),
       home:document.querySelector(".home-strip-only")?rect(".home-strip-only"):null};
   });
   assert.ok(Math.abs(geometry.banner.width-width)<=2,"market banner fills PC width");
   assert.ok(Math.abs(geometry.desktop.width-width)<=2,"desktop occupies PC width");
   assert.ok(Math.abs(geometry.app.width-width)<=2,"workspace occupies PC width");
   assert.ok(Math.abs(geometry.app.bottom-height)<=3,"workspace ends at PC bottom");
   assert.ok(geometry.header.x>=-2&&Math.abs(geometry.header.width-width)<=2,"full-width horizontal strip");
   if(geometry.home)assert.ok(
     Math.abs(geometry.home.width-geometry.content.width)<=2 &&
     Math.abs(geometry.home.x-geometry.content.x)<=2,
     "Home fills its entire third-column workspace, with no centered card");
 };
 await assertFullscreen(1440,900);
 await page.screenshot({path:"artifacts/system-v2/01-home.png",fullPage:false});
 await assertFullscreen(1920,1080);
 await page.screenshot({path:"artifacts/system-v2/00-home-full-pc-1920.png",fullPage:false});
 await assertFullscreen(1366,768);
 await page.screenshot({path:"artifacts/system-v2/00-home-full-pc-1366.png",fullPage:false});
 await assertFullscreen(1440,900);
 assert.equal(await page.locator(".home-strip-only").innerText(),"","Home has no unnecessary text");
 await page.locator(".system-module-link[data-module-id='1']").click();
 assert.equal(await page.locator(".system-module-link.selected").count(),1);
 assert.equal(await page.locator(".system-submodule-heading").innerText(),"کاڵاکان");
 await page.locator(".system-submodule-link[data-sub-icon='product-list']").click();
 assert.equal(await page.locator(".system-submodule-link.selected").count(),1,"selected subcard highlighted");
 assert.equal(await page.locator(".system-submodule-link.selected").getAttribute("aria-current"),"page");
 assert.ok((await page.locator(".system-submodule-link.selected").innerText()).includes("لیستی کاڵاکان"));
 await page.screenshot({path:"artifacts/system-v2/16-second-column-selected.png",fullPage:false});
 await nav.getByRole("button",{name:"سەرەتا",exact:true}).click();
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
