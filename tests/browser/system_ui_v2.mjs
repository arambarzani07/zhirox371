import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:3000";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},locale:"en-US"});
const errors=[];
page.on("pageerror",e=>errors.push(e.message));
const names=[
 ["کاشێر و فرۆشتن","03-cashier-demo.png"],
 ["کاڵاکان","04-products.png"],
 ["کۆگا","05-stock.png"],
 ["کڕیاران و حسابەکان","06-customers.png"],
 ["کڕین و دابینکەران","07-suppliers.png"],
 ["دارایی","08-finance.png"],
 ["ڕاپۆرت و شیکاری","09-reports.png"],
 ["ڕێکخستنەکان","10-settings.png"],
 ["ئافەر و داشکاندن","11-offers.png"],
 ["لیبڵ و چاپکردن","12-labels.png"],
 ["شێفت و کارمەندان","13-shifts.png"],
 ["چاودێری و مۆڵەتەکان","14-audit.png"]
];
const fullscreen=async(width,height)=>{
 await page.setViewportSize({width,height});
 const layout=await page.evaluate(()=>{
   const rect=s=>{
     const el=document.querySelector(s);
     if(!el)throw Error("missing "+s);
     const r=el.getBoundingClientRect();
     return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};
   };
   return {banner:rect(".market-banner"),desktop:rect("#root > .viewport > .desktop"),
     header:rect("header.system-double-strip"),app:rect("#app"),home:
       document.querySelector(".home-strip-only")?rect(".home-strip-only"):null};
 });
 assert.ok(Math.abs(layout.banner.width-width)<3,"store banner must span native PC");
 assert.ok(Math.abs(layout.desktop.width-width)<3,"desktop must span native PC");
 assert.ok(Math.abs(layout.header.width-width)<3,"ribbon must span native PC");
 assert.ok(Math.abs(layout.app.width-width)<3,"workspace must span native PC");
 assert.ok(Math.abs(layout.app.bottom-height)<4,"workspace extends to bottom of PC");
 if(layout.home)assert.ok(layout.home.x<3&&layout.home.width>=width-18,"Home is not centered card");
};
try{
 await mkdir("artifacts/system-v2",{recursive:true});
 await page.goto(origin,{waitUntil:"networkidle"});
 assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
 await page.locator(".home-strip-only").waitFor();
 const nav=page.locator(".system-primary-nav");
 const subnav=page.locator(".system-subnav");
 assert.equal(await nav.count(),1);
 assert.equal(await nav.locator("button").count(),13,"Home + 12 main tabs");
 assert.equal(await subnav.count(),1,"single secondary line");
 assert.equal(await subnav.locator("button").count(),0,"no subtab shown until module selection");
 assert.equal(await page.locator(".module,.drawer,.subgrid,.system-module-column,.system-submodule-column").count(),0,
  "no Home cards or vertical navigation columns");
 const adjacency=await page.evaluate(()=>{
   const a=document.querySelector(".market-banner").getBoundingClientRect();
   const b=document.querySelector(".system-primary-nav").getBoundingClientRect();
   return Math.abs(a.bottom-b.top)<3;
 });
 assert.ok(adjacency,"first ribbon directly beneath store name");
 await fullscreen(1440,900);
 await page.screenshot({path:"artifacts/system-v2/01-home.png",fullPage:false});
 await fullscreen(1920,1080);
 await page.screenshot({path:"artifacts/system-v2/00-home-full-pc-1920.png",fullPage:false});
 await fullscreen(1366,768);
 await page.screenshot({path:"artifacts/system-v2/00-home-full-pc-1366.png",fullPage:false});
 await fullscreen(1440,900);
 // All twelve main tabs expose exactly four horizontally arranged sub-tabs.
 for(let i=0;i<names.length;i++){
   const [label,file]=names[i];
   await nav.locator("button[data-module-id='"+i+"']").click();
   assert.equal(await nav.locator(".ws-link.active").count(),1,"one selected main module");
   assert.equal(await subnav.locator("button").count(),4,"four submodules for "+label);
   assert.equal(await subnav.locator(".system-subnav-link.selected").count(),1,"selected subtab visible "+label);
   assert.equal(await subnav.locator(".system-subnav-check").count(),1,"selected subtab marked with check "+label);
   assert.equal(await subnav.locator(".system-subnav-link.selected").getAttribute("aria-current"),"page");
   const g=await page.evaluate(()=>{
     const head=document.querySelector(".system-primary-nav").getBoundingClientRect();
     const row=document.querySelector(".system-subnav").getBoundingClientRect();
     const buttons=[...document.querySelectorAll(".system-subnav button")].map(x=>x.getBoundingClientRect());
     return {headBottom:head.bottom,rowY:row.y,buttonY:buttons.map(b=>b.y),
       buttonRight:buttons.map(b=>b.right),rowBottom:row.bottom,
       appY:document.querySelector("#app").getBoundingClientRect().y};
   });
   assert.ok(Math.abs(g.headBottom-g.rowY)<3&&Math.abs(g.rowBottom-g.appY)<3,"subnav directly between top nav and content");
   assert.ok(g.buttonY.every(y=>Math.abs(y-g.buttonY[0])<3),"all four subtabs horizontally aligned");
   assert.ok(g.buttonRight.every((v,k)=>k===0||v<g.buttonRight[k-1]),"subtabs flow RTL without stacked columns");
   assert.equal(await page.locator(".system-module-column,.system-submodule-column,.module,.drawer").count(),0);
   await fullscreen(1440,900);
   await page.screenshot({path:"artifacts/system-v2/"+file,fullPage:false});
 }
 // Every submodule has a stable, distinct full-width workspace identity.
 const visited=new Set();
 const sample=new Map([
  ["debt-book","17-debt-own-page.png"],
  ["supplier-accounts","18-supplier-accounts-own-page.png"],
  ["low-stock","19-low-stock-own-page.png"],
  ["change-history","20-audit-own-page.png"],
  ["coupon-ticket","21-coupon-own-page.png"]
 ]);
 for(let i=0;i<12;i++){
   await nav.locator("button[data-module-id='"+i+"']").click();
   const items=await subnav.locator("button[data-sub-icon]").evaluateAll(nodes=>
     nodes.map(n=>({icon:n.getAttribute("data-sub-icon"),label:n.textContent.replace("✓","").trim()})));
   assert.equal(items.length,4,"exactly four unique submodule destinations per category");
   for(const item of items){
     await subnav.locator("button[data-sub-icon='"+item.icon+"']").click();
     const panel=page.locator("section.section-workspace[data-section-id='"+item.icon+"']");
     await panel.waitFor();
     assert.equal(await panel.getAttribute("data-section-title"),item.label,"dedicated page title matches selected tab");
     assert.equal(await panel.locator("h1").first().innerText(),item.label,"no unrelated generic submodule page");
     assert.equal(await subnav.locator(".system-subnav-link.selected").getAttribute("data-sub-icon"),item.icon);
     assert.ok(!visited.has(item.icon),"no two submodules share the same page identity: "+item.icon);
     visited.add(item.icon);
     if(sample.has(item.icon)){
       await fullscreen(1440,900);
       await page.screenshot({path:"artifacts/system-v2/"+sample.get(item.icon),fullPage:false});
     }
   }
 }
 assert.equal(visited.size,48,"all 48 independent section pages rendered and navigated");
 await nav.locator("button[data-module-id='1']").click();
 await subnav.locator("button[data-sub-icon='add-box']").click();
 assert.equal(await subnav.locator(".system-subnav-link.selected").getAttribute("data-sub-icon"),"add-box",
  "subnav selection changes to new-product");
 assert.equal(await subnav.locator(".system-subnav-check").count(),1);
 await page.screenshot({path:"artifacts/system-v2/16-selected-product-subtab.png",fullPage:false});
 await subnav.locator("button[data-sub-icon='product-list']").click();
 assert.equal(await subnav.locator(".system-subnav-link.selected").getAttribute("data-sub-icon"),"product-list",
  "selected product-list tab remains indicated");
 await fullscreen(1920,1080);
 await page.screenshot({path:"artifacts/system-v2/15-products-full-pc-1920.png",fullPage:false});
 await nav.getByRole("button",{name:"سەرەتا",exact:true}).click();
 assert.equal(await page.locator(".home-strip-only").count(),1);
 assert.equal(await subnav.locator("button").count(),0);
 assert.deepEqual(errors,[],"no React errors while switching both horizontal ribbons");
 console.log("PASS PC two-ribbon Sorani navigation: 12 main, 48 sub-tabs, RTL selected state and native fullscreen");
}finally{await browser.close();}
