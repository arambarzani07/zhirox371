import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const source=read("card-icons.js");
const scope={window:{}};
runInNewContext(source,scope);
const icons=scope.window.RetailCardIcons;
const home=read("index.html"),css=read("card-icons.css");

test("exactly 12 distinct main icon IDs are defined",()=>{
 assert.equal(icons.main.length,12);
 assert.equal(new Set([...icons.main]).size,12);
});
test("all 48 subcards get their own unique SVG icon IDs",()=>{
 assert.equal(icons.sub.length,12);
 for(const x of icons.sub)assert.equal(x.length,4);
 const ids=icons.sub.flatMap(x=>Array.from(x));
 assert.equal(ids.length,48);
 assert.equal(new Set(ids).size,48);
 assert.equal(new Set([...icons.main,...ids]).size,60);
});
test("every semantic icon has a valid static inline SVG wrapper and visual strokes",()=>{
 for(const id of [...icons.main,...icons.sub.flatMap(x=>Array.from(x))]){
  const xml=icons.svg(id);
  assert.match(xml,/^<svg /,id);
  assert.match(xml,/viewBox="0 0 24 24"/,id);
  assert.match(xml,/aria-hidden="true"/,id);
  assert.match(xml,/stroke="currentColor"/,id);
  assert.match(xml,/(?:<path |<rect |<circle |<line |<polyline )/,id);
  assert.match(xml,/<\/svg>$/,id);
  assert.doesNotMatch(xml,/(?:https?:\/\/|<script|onload\s*=|onclick\s*=)/i,id);
 }
});
test("each Home main and child card renders its matching SVG at runtime",()=>{
 assert.match(home,/src="\.\/card-icons\.js"/);
 assert.match(home,/href="\.\/card-icons\.css"/);
 assert.match(home,/cardIcons\.svg\(cardIcons\.main\[i\]\)/);
 assert.match(home,/cardIcons\.svg\(cardIcons\.sub\[state\.open\]\[j\]\)/);
 assert.match(home,/class="sub-icon"/);
 assert.match(home,/class="sub-name"/);
 assert.match(home,/specs\[state\.open\]\[4\]\[tab\]/);
});
test("SVG presentation uses module theme and icons stay above legible child labels",()=>{
 assert.match(css,/\.module \.icon svg/);
 assert.match(css,/\.subgrid \.sub-icon svg/);
 assert.match(css,/stroke:\s*var\(--color\)/);
 assert.match(css,/background:\s*var\(--light\)/);
 assert.match(css,/flex-direction:\s*column/);
 assert.match(css,/\.subgrid \.sub-footer \.sub-name/);
 assert.match(css,/#172b45\s*!important/);
});
test("desktop 4-column grid, card ordering and print/banner are not changed",()=>{
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
 assert.match(home,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(home,/class="market-banner">سوپەرمارکێتی کانی چنار/);
 assert.doesNotMatch(css,/@media\s*\(max-width/);
});
test("icon gallery does not require remote image or icon libraries",()=>{
 assert.doesNotMatch(source,/(?:fetch\(|src="https?:|cdn\.|<img|import\s)/);
 assert.equal(Object.isFrozen(icons.main),true);
 assert.equal(Object.isFrozen(icons.sub),true);
});
