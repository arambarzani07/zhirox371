import assert from "node:assert/strict";
import {chromium} from "playwright";

const origin=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:8765";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:700}});
function near(actual,wanted,label){
 assert.ok(Math.abs(actual-wanted)<1.5,label+": expected "+wanted+", got "+actual);
}
const position=async()=>page.locator(".module").evaluateAll(nodes=>nodes.map(n=>({
 x:Math.round(n.offsetLeft),y:Math.round(n.offsetTop),w:Math.round(n.offsetWidth),h:Math.round(n.offsetHeight)
})));
try{
 await page.goto(origin+"/index.html",{waitUntil:"load"});
 const header=page.locator(".desktop > header"),main=page.locator(".desktop > main");
 near((await header.boundingBox()).y,70,"header below fixed banner");
 const original=await position();
 assert.equal(original.length,12);
 assert.equal(new Set(original.slice(0,4).map(p=>p.y)).size,1);
 for(let i=0;i<12;i++){
  await page.locator(".module").nth(i).evaluate(el=>el.click());
  assert.deepEqual(await position(),original,"opening subcards shifts main card "+i);
  assert.equal(await page.locator(".subgrid .sub").count(),4);
  const v=await page.locator(".drawer").evaluate(e=>{
   const cs=getComputedStyle(e);return {position:cs.position,opacity:cs.opacity,animation:cs.animationName,visible:e.getBoundingClientRect().width>0};
  });
  assert.equal(v.position,"absolute");
  assert.equal(v.opacity,"1");
  assert.equal(v.animation,"none");
  assert.equal(v.visible,true);
 }
 await page.locator(".module").nth(11).evaluate(el=>el.click());
 assert.deepEqual(await position(),original,"closing drawer shifts grid");
 await main.evaluate(e=>e.scrollTop=200);
 assert.ok(await main.evaluate(e=>e.scrollTop)>0,"PC inner content must scroll");
 near((await header.boundingBox()).y,70,"header moves on scroll");
 assert.equal(await page.evaluate(()=>window.scrollY),0);
 console.log("PASS: 12 main cards never shift when all 12 child drawers open or close; header is fixed");

 for(const path of ["operations.html","workspace.html","diagnostics.html","qa.html"]){
  await page.goto(origin+"/"+path,{waitUntil:"domcontentloaded"});
  const hd=page.locator(".desktop > header"),m=page.locator(".desktop > main");
  near((await hd.boundingBox()).y,70,path+" header");
  assert.equal(await m.evaluate(e=>getComputedStyle(e).overflowY),"auto",path+" scroll");
  assert.ok(await m.evaluate(e=>e.getBoundingClientRect().width)>=1020,path+" width");
  await m.evaluate(e=>{
   const probe=document.createElement("div");probe.style.height="2200px";e.append(probe);e.scrollTop=600;
  });
  assert.ok(await m.evaluate(e=>e.scrollTop)>=500,path+" can't scroll internally");
  near((await hd.boundingBox()).y,70,path+" header after scroll");
  assert.equal(await page.evaluate(()=>window.scrollY),0,path+" page moved");
 }
 console.log("PASS: all four auxiliary PC shells have fixed headers and independent inner scrolling");

 await page.goto(origin+"/index.html",{waitUntil:"domcontentloaded"});
 await page.setViewportSize({width:390,height:650});
 assert.ok(await page.locator(".desktop").evaluate(e=>e.getBoundingClientRect().width)>=1020);
 const outer=await page.locator(".viewport").evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));
 assert.ok(outer.scroll>outer.client,"narrow view must pan horizontally without shrinking PC");
 assert.equal(await page.evaluate(()=>window.scrollY),0);
 console.log("PASS: narrow view retains desktop proportions with horizontal-only pan");

 await page.goto(origin+"/receipt-print.html",{waitUntil:"domcontentloaded"});
 assert.equal(await page.locator(".shell").evaluate(e=>getComputedStyle(e).overflowY),"auto");
 await page.emulateMedia({media:"print"});
 const printed=await page.evaluate(()=>({
  overflow:getComputedStyle(document.body).overflow,
  banner:getComputedStyle(document.querySelector(".market-banner")).display
 }));
 assert.equal(printed.overflow,"visible");
 assert.equal(printed.banner,"none");
 console.log("PASS: receipt preview scrolls separately and thermal print remains unblocked");
}finally{await browser.close();}
