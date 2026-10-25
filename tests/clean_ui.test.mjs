import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
const base=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const src=p=>readFileSync(resolve(base,p),"utf8");

test("unfinished Home routes never falsely suggest an empty real database",()=>{
 const home=src("index.html");
 assert.match(home, /هێشتا ئامادە نییە/);
 assert.match(home, /title==="لیستی کاڵاکان"&&state\.products\.length/);
 assert.match(home, /state\.open===11&&tab===3/);
 assert.match(home, /for\(let r=0;r<3;r\+\+\)/);
 assert.match(home, /for\(let c=0;c<4;c\+\+\)/);
});
test("clean cashier interface keeps all functional IDs and security-relevant controls",()=>{
 const ui=src("operations.html");
 for(const id of ["login-form","scan-form","checkout-form","retry-checkout","shift-open-form","shift-close-form",
  "shift-movement-form","stock-form","staff-form","receipts-list","audit-list"])
  assert.match(ui,new RegExp('id="'+id+'"'));
 assert.match(ui, /id="finish-sale">تەواوکردن<\/button>/);
 assert.match(ui, /id="shift-panel"/);
});
test("scanner test print is never mistaken for a real receipt",()=>{
 const diagnostics=src("diagnostics.html");
 assert.match(diagnostics, /ئەمە پسووڵەی فرۆشتن نییە/);
 assert.match(diagnostics, /تاقیکردنەوەی چاپ/);
 assert.match(diagnostics, /type="module" src="\.\/diagnostics\.js"/);
});
test("QA copy remains short without falsifying automated test status",()=>{
 const qa=src("qa.html");
 assert.doesNotMatch(qa, /class="tag">تاقیگەی جیاواز/);
 assert.doesNotMatch(qa, /ئەم پەڕەیە داتابەیس ناگۆڕێت/);
 assert.match(qa, /id="case-description"/);
 assert.match(qa, /id="case-expected"/);
 assert.match(qa, /actions\/workflows\/pc-foundation\.yml/);
});
