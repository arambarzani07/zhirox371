import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";

const browser=await chromium.launch({headless:true});
const errors=[],external=[];
const page=await browser.newPage({viewport:{width:1366,height:900}});
page.on("pageerror",e=>errors.push(e.message));
page.on("request",req=>{
 const url=new URL(req.url());
 if(!["127.0.0.1","localhost"].includes(url.hostname))external.push(url.hostname);
});
try {
 await page.goto("http://127.0.0.1:3057/",{waitUntil:"networkidle"});
 await page.locator("[data-v57-home=true]").waitFor();
 assert.equal(await page.locator("[data-local-v36-pilot=true]").count(),1);
 assert.equal(await page.locator("[data-v57-screen=home]").count(),1);
 assert.equal(await page.locator(".market-banner").count(),1);
 assert.equal(await page.locator("#finish-sale").count(),0);
 assert.equal(await page.locator("[data-demo-watermark]").count(),0);
 await mkdir("artifacts/v57",{recursive:true});
 await page.screenshot({path:"artifacts/v57/01-home-12cards.png",fullPage:false});

 // Functional navigation only. The owner has explicitly removed ALL visual
 // locks: no tests of rows, card counts, dimensions, colors or fixed positions.
 const moduleCount=await page.locator(".v57-module").count();
 assert.ok(moduleCount>0,"Home must offer a route to the local cashier");
 let foundCashier=false;
 for(let i=0;i<moduleCount;i++){
  const card=page.locator(".v57-module").nth(i);
  const isCashier=(await card.getAttribute("data-module-id"))==="0";
  await card.click();
  const region=page.locator(".v57-drawer");
  assert.equal(await region.count(),1);
  assert.equal(await page.locator(".v57-module[aria-expanded=true]").count(),1);
  const enabledCount=await region.locator(".v57-sub:not(:disabled)").count();
  if(isCashier){
    foundCashier=true;
    assert.equal(enabledCount,2,"Only local new sale and receipt history are usable");
    await page.screenshot({path:"artifacts/v57/02-home-cashier-subcards.png",fullPage:false});
  }else assert.equal(enabledCount,0,"unfinished features stay disabled");
  await region.getByRole("button",{name:"داخستن"}).click();
 }
 assert.equal(foundCashier,true,"cashier must remain discoverable, whatever the layout");

 await page.locator('.v57-module[data-module-id="0"]').click();
 await page.locator(".v57-drawer .v57-sub:not(:disabled)").first().click();
 await page.getByRole("heading",{name:"کاشێر و فرۆشتن — PostgreSQL"}).waitFor();
 assert.equal(await page.locator("[data-v57-screen=cashier]").count(),1);
 await page.screenshot({path:"artifacts/v57/03-local-cashier-login.png",fullPage:false});
 assert.equal(await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).count(),1);
 await page.keyboard.press("Escape");
 assert.equal(await page.locator("[data-v57-screen=home]").count(),1);
 await page.keyboard.press("F1");
 assert.equal(await page.locator("[data-v57-screen=cashier]").count(),1);
 await page.getByRole("button",{name:"سەرەتا"}).click();
 assert.equal(await page.locator("[data-v57-screen=home]").count(),1);
 assert.deepEqual(errors,[]);
 assert.deepEqual(external,[],"offline pilot cannot call public cloud");
 console.log("V57 PASS: editable Home UI, fail-closed unfinished features and isolated PostgreSQL cashier");
} finally {await browser.close();}
