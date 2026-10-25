import assert from "node:assert/strict";
import {chromium} from "playwright";

const url=process.env.PC_PREVIEW_URL || "http://127.0.0.1:8765/index.html";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:880}});
let checked=0;
async function readable(locator,description){
 const v=await locator.evaluate(el=>{
   const cs=getComputedStyle(el);
   const rect=el.getBoundingClientRect();
   const opacities=[];
   for(let p=el;p&&p!==document.documentElement;p=p.parentElement){
     if(p.matches(".module,.drawer,.sub,.subgrid,.sub-footer,.end,.name,.sub-name,.drawerhead"))
       opacities.push({className:p.className,opacity:getComputedStyle(p).opacity,filter:getComputedStyle(p).filter});
   }
   return {
     text:el.textContent.trim(),color:cs.color,fill:cs.webkitTextFillColor,
     weight:Number(cs.fontWeight),opacity:cs.opacity,visibility:cs.visibility,
     width:rect.width,height:rect.height,opacities
   };
 });
 assert.ok(v.text.length>0,description+" blank text");
 assert.equal(v.color,"rgb(23, 43, 69)",description+" ink: "+JSON.stringify(v));
 assert.equal(v.fill,"rgb(23, 43, 69)",description+" Safari text fill");
 assert.equal(v.opacity,"1",description+" is faded");
 assert.ok(v.weight>=800,description+" not bold: "+v.weight);
 assert.equal(v.visibility,"visible",description+" hidden");
 assert.ok(v.width>0&&v.height>0,description+" not displayed");
 for(const p of v.opacities){
   assert.equal(p.opacity,"1",description+" ancestor opacity "+JSON.stringify(p));
   assert.equal(p.filter,"none",description+" ancestor filter "+JSON.stringify(p));
 }
 checked++;
}
try{
 const response=await page.goto(url,{waitUntil:"load",timeout:20000});
 assert.equal(response.status(),200);
 assert.equal(await page.locator(".module").count(),12);
 for(let i=0;i<12;i++){
   await readable(page.locator(".module .name").nth(i),"main card "+(i+1));
   await page.locator(".module").nth(i).click();
   assert.equal(await page.locator(".subgrid .sub").count(),4,"four subcards at module "+i);
   const opacity=await page.locator(".drawer").evaluate(x=>({opacity:getComputedStyle(x).opacity,animation:getComputedStyle(x).animationName}));
   assert.equal(opacity.opacity,"1","drawer must not fade");
   assert.equal(opacity.animation,"none","drawer must not animate through unreadable opacity");
   for(let j=0;j<4;j++){
     await readable(page.locator(".subgrid .sub-name").nth(j),"subcard "+(i+1)+"/"+(j+1));
   }
   // Drawer is an overlay by design; close it before selecting another main card.
   await page.locator("[data-close]").click();
   assert.equal(await page.locator(".drawer").count(),0);
 }
 assert.equal(checked,60);
 const desktopWidth=await page.locator(".desktop").evaluate(x=>x.getBoundingClientRect().width);
 assert.ok(desktopWidth>=1020,"desktop layout width changed");
 const firstRow=await page.locator(".module").evaluateAll(els=>els.slice(0,4).map(x=>Math.round(x.getBoundingClientRect().top)));
 assert.equal(new Set(firstRow).size,1,"desktop no longer uses 4 cards per row");
 console.log("PASS: 60 of 60 icon-card labels are bold, dark, visible and fully opaque at PC width");

 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({colorScheme:"dark"});
 await page.goto(url,{waitUntil:"load"});
 assert.equal(await page.locator(".module").count(),12);
 const mobileDesktop=await page.locator(".desktop").evaluate(x=>x.getBoundingClientRect().width);
 assert.ok(mobileDesktop>=1020,"PC layout collapsed at iPhone width");
 await readable(page.locator(".module .name").first(),"narrow viewport with dark scheme");
 await page.locator(".module").first().click();
 for(let i=0;i<4;i++)await readable(page.locator(".subgrid .sub-name").nth(i),"iPhone/dark subcard "+(i+1));
 console.log("PASS: original desktop layout and visible text preserved within narrow/dark host");
}finally{
 await browser.close();
}
