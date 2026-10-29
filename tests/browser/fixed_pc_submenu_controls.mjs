import assert from "node:assert/strict";
import { chromium } from "playwright";

const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:8765";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:730}});
const modulePosition=()=>page.locator(".module").evaluateAll(nodes=>nodes.map(n=>({
 x:Math.round(n.offsetLeft),y:Math.round(n.offsetTop)
})));
const assertFixed=async baseline=>assert.deepEqual(await modulePosition(),baseline,"main cards shifted when submenu changed");

try{
 await page.goto(origin+"/index.html",{waitUntil:"load"});
 const first=await modulePosition();
 assert.equal(first.length,12);
 await page.locator(".module").first().click();
 assert.equal(await page.locator(".drawer").count(),1);
 assert.equal(await page.locator(".module").first().getAttribute("aria-expanded"),"true");
 assert.equal(await page.locator(".module").first().getAttribute("aria-controls"),"market-card-submenu");
 assert.equal(await page.locator(".drawer").getAttribute("role"),"region");
 await assertFixed(first);

 // One keyboard action should dismiss and return focus without scrolling.
 await page.keyboard.press("Escape");
 assert.equal(await page.locator(".drawer").count(),0);
 assert.equal(await page.locator(".module").first().getAttribute("aria-expanded"),"false");
 assert.equal(await page.locator(".module").first().evaluate(n=>document.activeElement===n),true);
 await assertFixed(first);

 // Explicit close button restores focus and keeps all 12 card locations.
 await page.locator(".module").nth(2).click();
 await page.locator("[data-close]").click();
 assert.equal(await page.locator(".drawer").count(),0);
 assert.equal(await page.locator(".module").nth(2).evaluate(n=>document.activeElement===n),true);
 await assertFixed(first);

 // Click on content outside open drawer closes it.
 await page.locator(".module").first().click();
 await page.locator("main h1").click();
 assert.equal(await page.locator(".drawer").count(),0);
 await assertFixed(first);

 // Clicking unused drawer background dismisses while active child buttons remain live.
 await page.locator(".module").first().click();
 await page.locator(".drawerhead strong").click();
 assert.equal(await page.locator(".drawer").count(),0);
 await assertFixed(first);

 // Keyboard activation remains functional and navigates a real child page.
 await page.locator(".module").nth(1).focus();
 await page.keyboard.press("Enter");
 assert.equal(await page.locator(".drawer").count(),1);
 await page.locator("[data-sub='2']").click(); // price center placeholder inside Home
 assert.equal(await page.locator(".page").count(),1);
 assert.match(await page.locator(".pagehead h2").innerText(),/نرخەکان/);
 await page.locator("[data-back]").click();
 assert.equal(await page.locator(".module").count(),12);
 await assertFixed(first);
 console.log("PASS: Escape, outside click, drawer click, focus restore, keyboard and Back; 12 cards stationary");

 // Main content retains its position after toggles; outer window never scrolls.
 assert.equal(await page.evaluate(()=>window.scrollY),0);
 await page.setViewportSize({width:390,height:700});
 await page.emulateMedia({colorScheme:"dark"});
 await page.locator(".module").first().evaluate(n=>n.click());
 assert.equal(await page.locator(".subgrid .sub").count(),4);
 await page.keyboard.press("Escape");
 assert.equal(await page.locator(".drawer").count(),0);
 assert.equal(await page.evaluate(()=>window.scrollY),0);
 assert.ok(await page.locator(".desktop").evaluate(x=>x.getBoundingClientRect().width)>=1020);
 console.log("PASS: fixed PC keyboard dismissal works in narrow/dark viewing without redesign");
}finally{await browser.close();}
