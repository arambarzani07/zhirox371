import assert from "node:assert/strict";
import {chromium} from "playwright";

const root=process.env.PC_PREVIEW_ORIGIN||"http://127.0.0.1:8765";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:760},colorScheme:"dark"});
const css="#172b45",navy="#203e66";
function luminance(color){
 const parts=String(color).match(/[\d.]+/g);
 if(!parts||parts.length<3)throw Error("Unrecognized color "+color);
 const [r,g,b]=parts.slice(0,3).map(x=>Number(x)/255)
  .map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);
 return 0.2126*r+0.7152*g+0.0722*b;
}
const contrast=(a,b)=>{
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
};
async function checkText(locator,background,label,expected="#172b45"){
 const o=await locator.evaluate(el=>{
  const c=getComputedStyle(el),r=el.getBoundingClientRect(),parent=[];
  for(let p=el;p&&p!==document.documentElement;p=p.parentElement){
   const s=getComputedStyle(p);
   parent.push({opacity:s.opacity,filter:s.filter});
  }
  return {text:el.textContent.trim(),color:c.color,fill:c.webkitTextFillColor,
    opacity:c.opacity,weight:Number(c.fontWeight),width:r.width,height:r.height,parent};
 });
 assert.ok(o.text,label+" blank");
 assert.ok(o.width>0&&o.height>0,label+" off-screen/zero size");
 assert.equal(o.color,expected==="white"?"rgb(255, 255, 255)":expected==="original"?"rgb(27, 46, 71)":"rgb(23, 43, 69)",label+" ink");
 assert.equal(o.fill,o.color,label+" iOS WebKit fill");
 assert.ok(o.weight>=800||expected==="white",label+" font too light");
 for(const p of o.parent){assert.equal(p.opacity,"1",label+" faded by ancestor");assert.equal(p.filter,"none",label+" ancestor filter");}
 const ratio=contrast(o.fill,background);
 assert.ok(ratio>=7,label+" must have AAA text contrast; got "+ratio);
 return ratio;
}
try{
 for(const width of [1100,390]){
  await page.setViewportSize({width,height:760});
  await page.goto(root+"/index.html",{waitUntil:"load"});
  // Owner-locked Home remains byte-identical; existing shared CSS already
  // forces the right opaque ink without loading the new auxiliary stylesheet.
  assert.equal(await page.locator('link[href="./ui-contrast-lock.css"]').count(),0);
  assert.equal(await page.locator(".module").count(),12);
  await checkText(page.locator("main h1"),"rgb(245, 247, 250)","home title");
  await checkText(page.locator(".brand span"),"rgb(255, 255, 255)","PC header brand","original");
  for(let i=0;i<12;i++){
    await checkText(page.locator(".module .name").nth(i),"rgb(255, 255, 255)","main "+i);
    await page.locator(".module").nth(i).evaluate(el=>el.click());
    for(let j=0;j<4;j++)
      await checkText(page.locator(".drawer .sub-name").nth(j),"rgb(249, 250, 252)","sub "+i+"/"+j);
    await page.locator("[data-close]").evaluate(el=>el.click());
  }
  const banner=await page.locator(".market-banner").evaluate(el=>({
    bg:getComputedStyle(el).backgroundColor,
    ink:getComputedStyle(el).color,fill:getComputedStyle(el).webkitTextFillColor
  }));
  assert.equal(banner.bg,"rgb(32, 62, 102)");
  assert.equal(banner.ink,"rgb(255, 255, 255)");
  assert.equal(banner.fill,banner.ink);
  assert.ok(contrast(banner.ink,banner.bg)>=7);
  const desktopWidth=await page.locator(".desktop").evaluate(el=>el.getBoundingClientRect().width);
  assert.ok(desktopWidth>=1020);
  console.log("PASS "+width+"px dark-scheme desktop: 60/60 legible Sorani labels, fixed PC grid, white-on-navy header");
 }
 for(const name of ["operations.html","workspace.html","qa.html","diagnostics.html"]){
   await page.goto(root+"/"+name,{waitUntil:"domcontentloaded"});
   assert.equal(await page.locator('link[href="./ui-contrast-lock.css"]').count(),1);
   await checkText(page.locator("main h1"),"rgb(245, 247, 250)",name+" title");
   await checkText(page.locator(".brand span:last-child"),"rgb(255, 255, 255)",name+" brand");
 }
 console.log("PASS 5 PC pages use the same last-loaded locked high-contrast ink layer; receipt print excluded");
}finally{await browser.close();}
