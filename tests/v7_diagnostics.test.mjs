import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {inspectBarcode,isValidEan13} from "../diagnostics-core.mjs";

const base=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const file=name=>readFileSync(resolve(base,name),"utf8");
const html=file("diagnostics.html");
const js=file("diagnostics.js");
const home=file("index.html");

test("EAN-13 standard checksum handles known good and bad numeric barcodes",()=>{
 assert.equal(isValidEan13("4006381333931"),true);
 assert.equal(isValidEan13("4006381333932"),false);
 assert.equal(isValidEan13("2700002029709"),true);
 for (const code of ["","12345","12345678901234","abcdefghijkl","400638133393A",null,1234567890123]) {
   assert.equal(isValidEan13(code),false);
 }
});

test("prefix-27 supermarket-scale code extracts five-digit PLU without inventing weight or price",()=>{
 const p=inspectBarcode("2700002029709");
 assert.equal(p.type,"EAN-13");
 assert.equal(p.length,13);
 assert.equal(p.validEan13,true);
 assert.equal(p.possibleScaleBarcode,true);
 assert.equal(p.scaleItemCode,"00002");
 assert.ok(!("price" in p));
 assert.ok(!("weight" in p));
});

test("other values are not wrongly classified as scale barcodes",()=>{
 const p=inspectBarcode("4006381333931");
 assert.equal(p.possibleScaleBarcode,false);
 assert.equal(p.scaleItemCode,null);
 assert.equal(p.validEan13,true);
 const small=inspectBarcode("ABC 123");
 assert.equal(small.type,"ئەلفانوومێریک");
 assert.equal(small.validEan13,null);
 assert.equal(small.length,7);
});

test("tests work without Supabase, real scanner or financial data",()=>{
 assert.match(html,/id="scan-input"/);
 assert.match(html,/id="keyboard-input"/);
 assert.match(html,/id="test-print"/);
 assert.match(html,/type="module" src="\.\/diagnostics\.js"/);
 assert.match(js,/import \{ inspectBarcode \} from "\.\/diagnostics-core\.mjs"/);
 assert.doesNotMatch(js,/supabase|retail_sales|fetch\(/i);
 assert.doesNotMatch(html,/sb_secret_|sb_publishable_|retail_sales/);
});

test("printer diagnostic always clearly states it is not a real receipt",()=>{
 assert.match(html,/ئەمە پسووڵەی فرۆشتن نییە/);
 assert.match(html,/تاقیکردنەوەی چاپکەر/);
 assert.match(html,/option value="58"/);
 assert.match(html,/option value="80"/);
 assert.match(js,/window\.print\(\)/);
 assert.match(html,/@media print/);
 assert.match(html,/--diagnostic-paper/);
});

test("scanner data are not saved and browser printer enumeration is not falsely claimed",()=>{
 assert.doesNotMatch(js,/localStorage\.setItem\([^)]*(?:barcode|scan)/);
 assert.doesNotMatch(js,/sessionStorage\.setItem/);
 assert.match(js,/localStorage\.setItem\("retail_diagnostic_paper_width"/);
 assert.match(js,/navigator\.onLine/);
 assert.doesNotMatch(js,/navigator\.usb|navigator\.serial|enumerateDevices|printerName/);
});

test("locked Home links to diagnostics without changing 12-card grid",()=>{
 assert.match(home,/state\.open===7&&tab===2/);
 assert.match(home,/state\.open===9&&tab===3/);
 assert.match(home,/diagnostics\.html/);
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
});
