import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const base=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const load=p=>readFileSync(resolve(base,p),"utf8");
const css=load("ui-fixed-pc.css");

test("six desktop pages load the same fixed shell after global typography",()=>{
 for(const file of ["index.html","operations.html","workspace.html","diagnostics.html","qa.html","receipt-print.html"]){
  const markup=load(file);
  assert.equal((markup.match(/href="\.\/ui-fixed-pc\.css"/g)||[]).length,1,file);
  assert.ok(markup.indexOf("ui-fixed-pc.css")>markup.indexOf("ui-global.css"),file);
  assert.match(markup,/class="market-banner">سوپەرمارکێتی کانی چنار/);
 }
});

test("viewport and desktop header are locked independently of page scroll",()=>{
 assert.match(css,/html, body\s*\{[\s\S]*?overflow:\s*hidden\s*!important/);
 assert.match(css,/body > \.viewport\s*\{[\s\S]*?overflow-y:\s*hidden\s*!important/);
 assert.match(css,/body > \.viewport > \.desktop\s*\{[\s\S]*?display:\s*flex/);
 assert.match(css,/body > \.viewport > \.desktop > header\s*\{[\s\S]*?flex:\s*0 0 75px/);
 assert.match(css,/body > \.viewport > \.desktop > main\s*\{[\s\S]*?overflow-y:\s*auto/);
 assert.match(css,/scrollbar-gutter:\s*stable/);
});

test("expanded child drawer overlays lower cards without displacement or animation",()=>{
 assert.match(css,/#app\s*\{\s*position:\s*relative/);
 assert.match(css,/#app > \.drawer\s*\{[\s\S]*?position:\s*absolute\s*!important/);
 assert.match(css,/#app > \.drawer\s*\{[\s\S]*?z-index:\s*12/);
 assert.match(css,/#app > \.drawer\s*\{[\s\S]*?animation:\s*none\s*!important/);
 assert.match(css,/#app > \.row[\s\S]*?transition:\s*none\s*!important/);
 assert.match(css,/#app \.module\[aria-expanded="true"\] \.chev\s*\{[\s\S]*?transform:\s*none/);
});

test("fixed PC and printable 58/80mm thermal ticket remain separate",()=>{
 assert.match(css,/@media print\s*\{[\s\S]*?overflow:\s*visible\s*!important/);
 assert.match(css,/@media print\s*\{[\s\S]*?\.market-banner\s*\{\s*display:\s*none\s*!important/);
 assert.match(css,/body > \.shell\s*\{[\s\S]*?overflow-y:\s*auto/);
 assert.match(load("receipt-print.html"),/option value="58"/);
 assert.match(load("receipt-print.html"),/option value="80"/);
});
