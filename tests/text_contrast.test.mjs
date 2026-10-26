import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const css=read("ui-global.css");
const home=read("index.html");

test("nested primary module labels are explicitly dark, opaque and bold",()=>{
 assert.match(css,/body \.module \.name\s*\{[\s\S]*?color:\s*#172b45\s*!important/);
 assert.match(css,/body \.module \.name\s*\{[\s\S]*?-webkit-text-fill-color:\s*#172b45\s*!important/);
 assert.match(css,/body \.module \.name\s*\{[\s\S]*?opacity:\s*1\s*!important/);
 assert.match(css,/\.module :is\(\.name,\.end \.name,\.module-label strong,\.modbottom span\)/);
 assert.match(css,/font-weight:\s*850\s*!important/);
});

test("light subcard button descendants cannot inherit pale text",()=>{
 assert.match(css,/body \.sub :is\(span,strong,b\)/);
 assert.match(css,/body \.subgrid button :is\(span,strong,b\)/);
 assert.match(css,/body :is\(\.sub,\.subgrid button,\.subcards button\)\s*\{[\s\S]*?color:\s*#172b45\s*!important/);
 assert.match(css,/text-shadow:\s*none\s*!important/);
 assert.match(css,/color-scheme:\s*light/);
});

test("preserve icon colors and white primary button text",()=>{
 assert.match(css,/body \.module :is\(\.icon,\.symbol,\.modicon\)/);
 assert.match(css,/-webkit-text-fill-color:\s*currentColor/);
 assert.match(css,/body :is\(\.primary,\.tab\.active,\.filter\.active\)/);
 assert.match(css,/-webkit-text-fill-color:\s*#ffffff\s*!important/);
});

test("market banner remains legible and fixed on narrow viewports",()=>{
 assert.match(css,/position:\s*fixed/);
 assert.match(css,/font-size:\s*clamp\(17px,\s*3\.3vw,\s*28px\)/);
 assert.match(css,/max-width:\s*100vw/);
 assert.match(css,/white-space:\s*normal/);
});

test("desktop locked Home markup, modules and product link remain intact",()=>{
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
 assert.match(home,/const specs=\[/);
 assert.match(home,/class="market-banner">سوپەرمارکێتی کانی چنار/);
 assert.match(home,/href="\.\/ui-global\.css"/);
});
