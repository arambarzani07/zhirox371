import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080},locale:"en-US"});
const errors=[],outside=[];
page.on("pageerror",e=>errors.push(e.message));
page.on("request",req=>{
 const host=new URL(req.url()).hostname;
 if(!["localhost","127.0.0.1"].includes(host))outside.push(host);
});
const root=page.locator("[data-v81-test-market=true]");
const moduleButton=id=>page.locator(".v81-first-row nav button[data-module-id='"+id+"']");
const subButton=id=>page.locator(".v81-second-row button[data-sub-icon='"+id+"']");
const section=id=>page.locator("[data-testid=v82-section][data-section-id='"+id+"']");
try{
 await mkdir("artifacts/v81",{recursive:true});
 await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
 await root.waitFor();
 assert.equal(await page.locator(".market-banner").count(),0,"never use live market brand");
 await page.getByLabel("وشەی نهێنی").fill(process.env.ZHIROX_TEST_OWNER_PASSWORD);
 await page.getByRole("button",{name:"چوونە ژوورەوە"}).click();
 await page.locator(".v81-first-row nav").waitFor();
 assert.equal(await page.locator(".v81-first-row nav button").count(),13,"Home + 12 categories");
 assert.equal(await page.locator(".v81-second-row button").count(),0,"Home remains card-free");
 assert.equal(await page.locator(".v81-overview").count(),0,"no fake Home cards");
 const geometry=await page.evaluate(()=>{
  const r=document.querySelector(".v81-root").getBoundingClientRect();
  const title=document.querySelector(".v81-market-title").getBoundingClientRect();
  const nav=document.querySelector(".v81-first-row").getBoundingClientRect();
  return {w:r.width,h:r.height,titleBottom:title.bottom,navTop:nav.top};
 });
 assert.ok(Math.abs(geometry.w-1920)<3&&Math.abs(geometry.h-1080)<3);
 assert.ok(Math.abs(geometry.titleBottom-geometry.navTop)<3);
 await page.screenshot({path:"artifacts/v81/00-empty-home-full-pc-1920.png",fullPage:false});
 // All 48 actual module pages are navigable; no one is quietly treated as another.
 const visited=new Set(),maturity={read_only:0,planned:0};
 for(let id=0;id<12;id++){
  await moduleButton(id).click();
  const subs=await page.locator(".v81-second-row button[data-sub-icon]").evaluateAll(elements=>
   elements.map(e=>({id:e.getAttribute("data-sub-icon"),label:e.textContent.replace("✓","").trim()})));
  assert.equal(subs.length,4,"module "+id+" must have exactly four dedicated PC subpages");
  const y=await page.locator(".v81-second-row button").evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().top));
  assert.ok(y.every(t=>Math.abs(t-y[0])<3),"second navigation is one horizontal RTL line");
  for(const sub of subs){
   await subButton(sub.id).click();
   await section(sub.id).waitFor({timeout:10000});
   assert.ok(!visited.has(sub.id),"duplicate page identity "+sub.id);
   visited.add(sub.id);
   assert.equal((await page.locator(".v81-page-heading h1").innerText()).trim(),sub.label);
   assert.equal(await page.locator(".v81-second-row button.selected").count(),1);
   const badge=await section(sub.id).locator(".v82-section-meta span").innerText();
   if(badge.includes("PostgreSQL"))maturity.read_only++;
   else maturity.planned++;
   assert.equal(await page.locator("button:has-text('فرۆشتنی ڕاستەقینە')").count(),0);
  }
 }
 assert.equal(visited.size,48,"every submodule needs own section endpoint");
 assert.ok(maturity.read_only>=15,"real PG-backed subsection coverage");
 assert.ok(maturity.planned>=12,"unimplemented subsections are labeled, not fabricated");
 // Real PostgreSQL financial view is within reports, not Home.
 await moduleButton(6).click();
 await section("sales-trend").waitFor();
 await page.locator("[data-testid=real-postgres-overview]").waitFor();
 const overview=await page.locator("[data-testid=real-postgres-overview]").innerText();
 assert.match(overview,/11,000 IQD/);
 assert.match(overview,/10,000 IQD/);
 await page.screenshot({path:"artifacts/v81/01-real-pg-test-market-home-1920.png",fullPage:false});
 await moduleButton(1).click();
 await subButton("product-list").click();
 await section("product-list").waitFor();
 assert.match(await section("product-list").innerText(),/نموونە — ئاوی تاقیکردنەوە/);
 assert.match(await section("product-list").innerText(),/2,500 IQD/);
 await page.screenshot({path:"artifacts/v81/02-test-market-products.png",fullPage:false});
 await moduleButton(0).click();
 await subButton("receipt").click();
 await section("receipt").waitFor();
 assert.match(await section("receipt").innerText(),/8,000 IQD/);
 await page.screenshot({path:"artifacts/v81/03-real-postgres-receipts.png",fullPage:false});
 await moduleButton(3).click();
 await subButton("single-customer").click();
 await section("single-customer").waitFor();
 assert.match(await section("single-customer").innerText(),/10,000 IQD/);
 await page.getByRole("button",{name:"بینینی مامەڵەکان"}).click();
 await section("single-customer").waitFor();
 await page.locator(".v81-table").getByText("15,000 IQD").waitFor();
 assert.match(await section("single-customer").innerText(),/5,000 IQD/);
 await page.screenshot({path:"artifacts/v81/04-real-postgres-customer-debt-history.png",fullPage:false});
 await moduleButton(8).click();
 await subButton("coupon-ticket").click();
 await section("coupon-ticket").waitFor();
 assert.match(await section("coupon-ticket").innerText(),/هێشتا تەواو نەکراون/);
 await page.screenshot({path:"artifacts/v81/05-planned-submodule-no-mock-data.png",fullPage:false});
 // Log in as cashier; all modules remain visible, private records are denied.
 await page.getByRole("button",{name:"دەرچوون"}).click();
 await page.getByLabel("ناوی هەژمار").fill("test-market-cashier");
 await page.getByLabel("وشەی نهێنی").fill(process.env.ZHIROX_TEST_CASHIER_PASSWORD);
 await page.getByRole("button",{name:"چوونە ژوورەوە"}).click();
 await page.locator(".v81-first-row nav").waitFor();
 assert.equal(await page.locator(".v81-first-row nav button").count(),13);
 await moduleButton(3).click();
 await page.getByRole("alert").waitFor();
 assert.match(await page.getByRole("alert").innerText(),/تەنها بۆ خاوەن مارکێت/);
 assert.equal(await page.locator("[data-testid=v82-section]").count(),0);
 await moduleButton(0).click();
 await subButton("receipt").click();
 await section("receipt").waitFor();
 assert.match(await section("receipt").innerText(),/8,000 IQD/);
 assert.deepEqual(errors,[],"no React errors in all 48 transitions");
 assert.deepEqual(outside,[],"no external/cloud network calls");
 console.log("V82 PASS 12 main × 4 submodule pages, real SQL pages and honest planned states; owner/cashier isolation");
}finally{await browser.close();}
