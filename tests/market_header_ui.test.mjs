import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const pages=["index.html","workspace.html","operations.html","receipt-print.html","diagnostics.html","qa.html"];
const css=read("ui-global.css");
const market="سوپەرمارکێتی کانی چنار";

test("the same supermarket name is fixed and displayed on all six PC pages",()=>{
 for(const path of pages){
   const html=read(path);
   assert.equal((html.match(/class="market-banner"/g)||[]).length,1,path);
   assert.equal((html.match(/ui-global\.css/g)||[]).length,1,path);
   assert.match(html,new RegExp(market),path);
   assert.ok(html.indexOf('href="./ui-global.css"')>html.indexOf("</style>"),path);
   assert.ok(html.indexOf("market-banner")>html.indexOf("<body>"),path);
 }
});
test("market header is viewport-fixed, full width and distinctly readable",()=>{
 assert.match(css,/\.market-banner\s*\{[\s\S]*?position:\s*fixed/);
 assert.match(css,/z-index:\s*10000/);
 assert.match(css,/width:\s*100%/);
 assert.match(css,/font-size:\s*28px/);
 assert.match(css,/font-weight:\s*900\s*!important/);
 assert.match(css,/color:\s*#fff\s*!important/);
 assert.match(css,/background:\s*#203e66/);
 assert.match(css,/padding-top:\s*var\(--market-banner-height\)\s*!important/);
});
test("bold and high-contrast text are shared without obscuring buttons",()=>{
 assert.match(css,/--market-ink:\s*#1b2e47/);
 assert.match(css,/--market-secondary-ink:\s*#41546b/);
 assert.match(css,/font-weight:\s*700/);
 assert.match(css,/font-weight:\s*850\s*!important/);
 assert.match(css, /\.tab:not\(\.active\)/);
 assert.match(css,/input,textarea\)::placeholder/);
});
test("supermarket banner is hidden on printed thermal receipts and diagnostic test strips",()=>{
 assert.match(css,/@media print\s*\{[\s\S]*?\.market-banner\s*\{\s*display:\s*none\s*!important/);
 assert.match(css,/@media print\s*\{[\s\S]*?body\s*\{\s*padding-top:\s*0\s*!important/);
 assert.match(read("receipt-print.html"),/@media print/);
 assert.match(read("diagnostics.html"),/@media print/);
});
test("locked Home 12-card grid and feature routes remain intact",()=>{
 const home=read("index.html");
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
 assert.match(home,/const specs=\[/);
 assert.match(home,/\.\/operations\.html\?view=/);
 assert.match(home,/min-width:1020px/);
});
