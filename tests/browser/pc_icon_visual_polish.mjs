import assert from "node:assert/strict";
import {chromium} from "playwright";

const url=process.env.PC_PREVIEW_URL || "http://127.0.0.1:8765/index.html";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:850},colorScheme:"dark"});
const positions=()=>page.locator(".module").evaluateAll(all=>all.map(n=>[
  Math.round(n.getBoundingClientRect().x),Math.round(n.getBoundingClientRect().y)
]));
async function assertVisualBadge(selector,id){
 const visual=await page.locator(selector).evaluate(el=>{
  const css=getComputedStyle(el),svg=el.querySelector("svg"),s=getComputedStyle(svg),halo=svg.querySelector(".pictogram-halo");
  const geom=el.getBoundingClientRect();
  return {
   text:svg.textContent,shadow:css.boxShadow,bg:css.backgroundImage,border:css.borderTopStyle,
   opacity:css.opacity,fill:s.fill,stroke:s.stroke,width:Math.round(geom.width),height:Math.round(geom.height),
   svgWidth:Math.round(svg.getBoundingClientRect().width),hasHalo:!!halo,
   hasPaths:!!svg.querySelector("path,rect,circle,line,polyline"),
   iconKey:svg.innerHTML
  };
 });
 assert.ok(visual.bg.includes("linear-gradient"),id+" missing two-tone color");
 assert.ok(visual.shadow.includes("rgb"),id+" missing subtle depth");
 assert.equal(visual.border,"solid",id+" missing thin badge outline");
 assert.equal(visual.opacity,"1",id+" faded badge");
 assert.equal(visual.hasHalo,true,id+" missing accent detail");
 assert.equal(visual.hasPaths,true,id+" missing semantic pictogram");
 assert.ok(visual.svgWidth>=23,id+" pictogram too small");
 assert.ok(visual.width>=39&&visual.height>=39,id+" icon badge too small");
 return visual.iconKey;
}
try{
 await page.goto(url,{waitUntil:"load"});
 assert.equal(await page.locator(".module").count(),12);
 const expected=await positions(),patterns=[];
 for(let i=0;i<12;i++){
   patterns.push(await assertVisualBadge(".module:nth-of-type("+ (i%4+1)+") .icon", "main "+i).catch(async()=>{
    return assertVisualBadge(".module .icon >> nth="+i, "main "+i);
   }));
   await page.locator(".module").nth(i).evaluate(el=>el.click());
   assert.deepEqual(await positions(),expected,"PC card positions moved when opening icon group "+i);
   const subs=page.locator(".drawer .sub-icon");
   assert.equal(await subs.count(),4);
   for(let j=0;j<4;j++){
     patterns.push(await assertVisualBadge(".drawer .sub-icon >> nth="+j, "sub "+i+"/"+j));
   }
   await page.locator("[data-close]").click();
 }
 assert.equal(new Set(patterns).size,60,"one or more SVG pictogram logos are duplicated");
 assert.equal(await page.locator(".module").count(),12);
 assert.deepEqual(await positions(),expected);
 const text=await page.locator(".module .name").first().evaluate(el=>{
   const css=getComputedStyle(el);return [css.color,css.opacity,Number(css.fontWeight)];
 });
 assert.deepEqual(text,["rgb(23, 43, 69)","1",900]);
 console.log("PASS: 60 unique premium duotone SVG badges, 12 locked main cards and legible Sorani labels");
 await page.setViewportSize({width:390,height:740});
 assert.ok(await page.locator(".desktop").evaluate(el=>el.getBoundingClientRect().width)>=1020);
 const icon=await page.locator(".module .icon").first().evaluate(el=>({
   bg:getComputedStyle(el).backgroundImage,width:Math.round(el.getBoundingClientRect().width)
 }));
 assert.ok(icon.bg.includes("linear-gradient")&&icon.width>=49,"premium badges lost in narrow preview");
 console.log("PASS: premium logo visuals preserved in narrow/dark viewing without reflow");
}finally{await browser.close();}
