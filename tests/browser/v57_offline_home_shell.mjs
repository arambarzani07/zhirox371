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
 assert.equal(await page.locator(".system-module-column,.system-submodule-column,.v57-module,.v57-drawer").count(),0,
   "offline shell no longer contains sidebars or cards");
 const nav=page.locator("[data-v57-navigation=true]");
 const subs=page.locator("[data-v57-subnav=horizontal]");
 assert.equal(await nav.count(),1);
 assert.equal(await nav.locator("button").count(),13,"Home plus twelve main tabs");
 assert.equal(await subs.locator("button").count(),0,"no selected submodules until a module is chosen");
 await mkdir("artifacts/v57",{recursive:true});
 await page.screenshot({path:"artifacts/v57/01-navigation-only.png",fullPage:false});
 // All module names are browsable; none of the unconnected module actions is executable.
 for(let id=0;id<12;id++){
   await nav.locator("button[data-module-id='"+id+"']").click();
   assert.equal(await subs.locator("button").count(),4,"four horizontal subtabs for "+id);
   const positions=await subs.locator("button").evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
   assert.ok(positions.every(p=>Math.abs(p-positions[0])<3),"subtabs share one horizontal line");
   assert.equal(await subs.locator("button:not(:disabled)").count(),id===0?2:0,
    "isolated PG pilot exposes only two cashier actions");
 }
 await nav.locator("button[data-module-id='0']").click();
 await subs.locator("button[data-sub-icon='barcode-scan']").click();
 assert.equal(await page.locator("[data-v57-screen=cashier]").count(),1);
 assert.equal(await subs.locator(".system-subnav-link.selected").count(),1);
 assert.equal(await subs.locator(".system-subnav-check").count(),1,"active local subtab has clear check");
 assert.equal(await subs.locator(".system-subnav-link.selected").getAttribute("aria-current"),"page");
 await page.screenshot({path:"artifacts/v57/03-offline-selected-submodule.png",fullPage:false});
 await page.getByRole("heading",{name:"کاشێر و فرۆشتن — PostgreSQL"}).waitFor();
 assert.equal(await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).count(),1);
 await page.screenshot({path:"artifacts/v57/02-local-cashier-login.png",fullPage:false});
 await page.keyboard.press("Escape");
 assert.equal(await page.locator("[data-v57-screen=home]").count(),1);
 await page.keyboard.press("F1");
 assert.equal(await page.locator("[data-v57-screen=cashier]").count(),1);
 await nav.getByRole("button",{name:"سەرەتا"}).click();
 assert.equal(await page.locator("[data-v57-screen=home]").count(),1);
 assert.equal(await subs.locator("button").count(),0);
 assert.deepEqual(errors,[]);
 assert.deepEqual(external,[],"offline pilot cannot contact public cloud");
 console.log("PASS V57: horizontal subnav and fail-closed local cashier; no cards or side columns");
}finally{await browser.close();}
