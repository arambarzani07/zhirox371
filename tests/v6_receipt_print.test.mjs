import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(resolve(root,file),"utf8");
const printHtml=read("receipt-print.html");
const printJs=read("receipt-print.js");
const opsHtml=read("operations.html");
const opsJs=read("operations.js");
const v6Sql=read("db/v6_receipt_name_snapshot.sql");
const home=read("index.html");

test("58mm and 80mm receipt widths are user selectable",()=>{
 assert.match(printHtml,/<option value="58">58mm<\/option>/);
 assert.match(printHtml,/<option value="80">80mm<\/option>/);
 assert.match(printHtml,/@media print/);
 assert.match(printHtml,/@page\{size:auto;margin:0\}/);
 assert.match(printJs,/--receipt-paper/);
 assert.match(printJs,/--receipt-content/);
});

test("receipt stays unprintable until authenticated posted sale is validated",()=>{
 assert.match(printHtml,/<button[^>]*id="print"[^>]*disabled/);
 assert.match(printHtml,/id="sheet" hidden/);
 assert.match(printJs,/auth\.getUser\(\)/);
 assert.match(printJs,/\.eq\("status","posted"\)\.single\(\)/);
 assert.match(printJs,/head\.receipt_no==null/);
 assert.match(printJs,/computed-discount!==total/);
 assert.match(printJs,/paid-total!==change/);
 assert.match(printJs,/items\.length===0\|\|items\.length>=200/);
 assert.match(printJs,/item\.product_name_snapshot/);
 assert.match(printJs,/window\.print\(\)/);
});

test("printed user content is text-only, with no unsafe HTML interpolation",()=>{
 assert.match(printJs,/node\.textContent\s*=\s*String\(text\)/);
 assert.match(printJs,/\$\("store-name"\)\.textContent=store\.data\.name/);
 assert.doesNotMatch(printJs,/innerHTML\s*=/);
 assert.doesNotThrow(()=>new Function(printJs));
});

test("item snapshot persists in transactional checkout",()=>{
 assert.match(v6Sql,/ADD COLUMN product_name_snapshot text/i);
 assert.match(v6Sql,/select name,price_minor,active,currency into v_name_snapshot/);
 assert.match(v6Sql,/values\(p_store,v_sale,v_product,v_qty,v_price,v_name_snapshot\)/);
});

test("posted receipt history offers paper links and snapshot names",()=>{
 assert.match(opsJs,/function printLink\(/);
 assert.match(opsJs,/\.\/receipt-print\.html\?sale=/);
 assert.match(opsJs,/product_name_snapshot/);
 assert.match(opsJs,/printLink\(sale\.id,"58","58mm"\)/);
 assert.match(opsJs,/printLink\(sale\.id,"80","80mm"\)/);
 assert.match(opsHtml,/receipt-print-actions/);
 assert.doesNotThrow(()=>new Function(opsJs));
});

test("locked desktop Home remains 3 x 4 cards",()=>{
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
 assert.match(home,/min-width:1020px/);
});
