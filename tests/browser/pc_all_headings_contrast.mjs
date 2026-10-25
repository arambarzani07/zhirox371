import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const repo=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const fixture=readFileSync(resolve(repo,"tests/browser/qa_supabase_fixture.js"),"utf8");
const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:8765";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:780},colorScheme:"dark"});
await page.route("https://cdn.jsdelivr.net/**",r=>r.fulfill({status:200,contentType:"application/javascript",body:"/* QA Supabase offline */"}));
await page.addInitScript({content:fixture});
let checked=0;
async function assertInk(selector,label,opts={}){
 const loc=page.locator(selector).first();
 await loc.waitFor({state:"visible"});
 const v=await loc.evaluate(el=>{
  const s=getComputedStyle(el),r=el.getBoundingClientRect();
  return {text:el.textContent.trim(),color:s.color,fill:s.webkitTextFillColor,weight:parseFloat(s.fontWeight),opacity:s.opacity,visibility:s.visibility,
    width:r.width,height:r.height};
 });
 assert.ok(v.text.length>0,label+" is empty");
 assert.equal(v.color,opts.color||"rgb(23, 43, 69)",label+": wrong CSS color "+JSON.stringify(v));
 assert.equal(v.fill,opts.color||"rgb(23, 43, 69)",label+": wrong Safari text fill "+JSON.stringify(v));
 assert.equal(v.opacity,"1",label+": faded label");
 assert.equal(v.visibility,"visible",label+": hidden label");
 assert.ok(v.weight>=800,label+": insufficient font weight "+JSON.stringify(v));
 assert.ok(v.width>0&&v.height>0,label+": offscreen or zero size");
 checked++;
}
async function fixedHeader(){
 const b=await page.locator(".market-banner").boundingBox();
 const h=await page.locator(".desktop > header").boundingBox();
 assert.ok(Math.abs(b.y)<=1,"fixed market banner shifted");
 assert.ok(Math.abs(h.y-70)<=1,"fixed desktop header shifted");
 assert.equal(await page.evaluate(()=>window.scrollY),0);
}
try{
 await page.goto(origin+"/index.html",{waitUntil:"load"});
 await assertInk("main h1","Home title");
 await assertInk(".module .name","main card title");
 await page.locator(".module").first().click();
 await assertInk(".drawerhead strong","expanded card heading");
 await assertInk(".subgrid .sub-name","subcard title");
 await fixedHeader();
 console.log("PASS: Home, main cards and expanded children are dark and fully opaque");

 await page.goto(origin+"/operations.html?view=cash",{waitUntil:"load"});
 await page.locator("#cash-panel").waitFor({state:"visible"});
 await assertInk("main h1","Cashier main title");
 await assertInk("#cash-panel h2","Cashier sale card heading");
 await assertInk("#cash-panel label.field","Cashier barcode label",{color:"rgb(48, 70, 95)"});
 await assertInk("#cash-panel .blank","Empty cart",{color:"rgb(48, 70, 95)"});
 await assertInk('#tabs button[data-tab="cash"].active',"Active tab white",{color:"rgb(255, 255, 255)"});
 await assertInk('#tabs button[data-tab="shift"]',"Inactive tab dark");
 await page.locator('[data-tab="shift"]').click();
 await assertInk("#shift-panel h2","Shift heading");
 await assertInk('#shift-open-form .field',"Shift opening label",{color:"rgb(48, 70, 95)"});
 await fixedHeader();
 console.log("PASS: Cashier, shift, field labels, empty cart and active/inactive tabs remain readable");

 await page.goto(origin+"/workspace.html?view=new",{waitUntil:"load"});
 await page.locator("#products-panel").waitFor({state:"visible"});
 await assertInk("main h1","Products main heading");
 await assertInk("#new-panel h2","New product heading");
 await assertInk('#product-form .form-col',"Product form label",{color:"rgb(48, 70, 95)"});
 await page.locator('[data-tab="list"]').click();
 await assertInk("#list-panel h2","Product list heading");
 await fixedHeader();
 console.log("PASS: Products new/list pages and form labels remain readable");

 for(const [route,heading] of [["qa.html","QA"],["diagnostics.html","Diagnostics"]]){
  await page.goto(origin+"/"+route,{waitUntil:"domcontentloaded"});
  await assertInk("main h1",heading+" main heading");
  await assertInk("main h2",heading+" section heading");
  await fixedHeader();
 }
 console.log("PASS: QA and Device Diagnostics headings remain readable");
 console.log("PASS: "+checked+" real DOM typography/contrast checks in dark-scheme Chromium");
}finally{
 await browser.close();
}
