import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true});
const errors=[],external=[];
const page=await browser.newPage({viewport:{width:1366,height:900}});
page.on("pageerror",error=>errors.push(error.message));
page.on("request",req=>{
 const url=new URL(req.url());
 if(!["127.0.0.1","localhost"].includes(url.hostname))external.push(url.hostname);
});
try{
 await page.goto("http://127.0.0.1:3057/",{waitUntil:"networkidle"});
 const shell=page.locator("[data-v57-locked-home=true]");
 await shell.waitFor();
 assert.equal(await page.locator("[data-local-v36-pilot=true]").count(),1);
 assert.equal(await page.locator("[data-v57-screen=home]").count(),1);
 assert.equal(await page.locator(".market-banner").count(),1);
 assert.equal((await page.locator(".market-banner").innerText()).trim(),"سوپەرمارکێتی کانی چنار");
 assert.equal(await page.locator(".v57-row").count(),3);
 assert.equal(await page.locator(".v57-module").count(),12);
 assert.equal(await page.locator(".v57-sub").count(),0);
 assert.equal(await page.getByRole("heading",{name:"بەشە سەرەکییەکان"}).count(),1);
 assert.equal(await page.locator("#finish-sale").count(),0);
 assert.equal(await page.locator("[data-demo-watermark]").count(),0);
 const widths=await page.locator(".v57-row").first().locator(".v57-module").evaluateAll(items=>
  items.map(item=>({x:item.getBoundingClientRect().x,w:item.getBoundingClientRect().width})));
 assert.equal(widths.length,4);
 assert.ok(widths.every(item=>Math.abs(item.w-widths[0].w)<1),"four equal cards per row");
 assert.ok(widths.every(item=>item.w>150),"desktop card width remains readable");
 let count=0;
 for(let i=0;i<12;i++){
   await page.locator(".v57-module").nth(i).click();
   const region=page.locator(".v57-drawer");
   assert.equal(await region.count(),1,"only one drawer opens");
   assert.equal(await region.locator(".v57-sub").count(),4);
   assert.equal(await page.locator(".v57-module[aria-expanded=true]").count(),1);
   assert.equal(await page.locator(".v57-module").count(),12,"opening drawer never hides or reorders cards");
   const rects=await page.evaluate(()=>{
     const selected=document.querySelector(".v57-module[aria-expanded=true]").closest(".v57-row-block");
     const next=selected.nextElementSibling;
     return {drawer:selected.querySelector(".v57-drawer").getBoundingClientRect().top,
       row:selected.querySelector(".v57-row").getBoundingClientRect().bottom,
       nextY:next?next.getBoundingClientRect().top:null};
   });
   assert.ok(rects.drawer>=rects.row-1,"drawer stays beneath chosen row");
   if(i===0)assert.equal(await region.locator(".v57-sub:not(:disabled)").count(),2);
   else assert.equal(await region.locator(".v57-sub:not(:disabled)").count(),0,
     "unimplemented modules must fail closed rather than mount Demo");
   count+=4;
   await region.getByRole("button",{name:"داخستن"}).click();
   assert.equal(await region.count(),0);
 }
 assert.equal(count,48,"12 x 4 subcards checked");
 // Opening the safe new-sale subcard preserves the local PostgreSQL cashier.
 await page.locator(".v57-module").first().click();
 await page.locator(".v57-drawer .v57-sub").first().click();
 await page.getByRole("heading",{name:"کاشێر و فرۆشتن — PostgreSQL"}).waitFor();
 assert.equal(await page.locator("[data-v57-screen=cashier]").count(),1);
 assert.equal(await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).count(),1);
 assert.equal(await page.locator("[data-v57-screen=home]").count(),0);
 await page.keyboard.press("Escape");
 assert.equal(await page.locator("[data-v57-screen=home]").count(),1);
 await page.keyboard.press("F1");
 assert.equal(await page.locator("[data-v57-screen=cashier]").count(),1);
 await page.getByRole("button",{name:"سەرەتا"}).click();
 assert.equal(await page.locator(".v57-module").count(),12);
 assert.deepEqual(errors,[]);
 assert.deepEqual(external,[],"no public-cloud dependencies on locked offline Home");
 console.log("V57 PASS: fixed 12x4 Home, 48 tested subcards, fail-closed routes, isolated local cashier and return navigation");
}finally{await browser.close();}
