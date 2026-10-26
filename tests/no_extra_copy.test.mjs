import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");

test("all future full-system previews are subject to zero-extra-copy policy",()=>{
 const p=read("PREVIEW_POLICY.md");
 assert.match(p,/Zero-extra-copy PC rule/);
 assert.match(p,/12-card, 48-subcard previews/);
 assert.match(p,/accessibility descriptions non-visible/);
 assert.match(p,/actionable validation\/error\/safety warnings/);
});

test("device diagnostics show useful operational data, no instructional filler",()=>{
 const html=read("diagnostics.html");
 for(const text of [
  "بارکۆد بسکانە یان بنووسە و Enter بکە",
  "خانەکە هەڵبژێرە و دوگمەیەک دابگرە",
  "چاپکەر و پانیی کاغەز لە Print Dialog هەڵبژێرە"
 ])assert.ok(!html.includes(text),"unnecessary instruction still visible: "+text);
 for(const id of ["scan-form","scan-feedback","scan-input","keyboard-input","key-last","network-status","page-status","test-print","print-feedback","test-sheet"])
  assert.match(html,new RegExp('id="'+id+'"'),"missing functional diagnostic id "+id);
 assert.match(html,/ئەمە پسووڵەی فرۆشتن نییە/,"print test safety label must remain");
 assert.match(html,/network-status" title=/,"substantive network limitation retained as accessible tooltip");
});

test("QA keeps real test details/filters and source links without instructional footnotes",()=>{
 const html=read("qa.html");
 assert.doesNotMatch(html,/class="notice"/);
 assert.doesNotMatch(html,/class="tag">تاقیگەی جیاواز/);
 for(const id of ["cases","case-title","case-description","case-expected"])
  assert.match(html,new RegExp('id="'+id+'"'),"QA functionality removed "+id);
 for(const filter of ["all","sale","shift","auth"])
  assert.match(html,new RegExp('data-filter="'+filter+'"'));
 assert.match(html,/github\.com\/arambarzani07\/zhirox371\/actions/);
});

test("locked Home CSS and entire 12-card topology remain untouched by copy clean-up",()=>{
 const html=read("index.html");
 assert.match(html,/const specs=\[/);
 assert.match(html,/className="drawer"/);
 assert.match(html,/data-module/);
});
