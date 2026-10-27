import test from "node:test";
import assert from "node:assert/strict";
import "../scale-barcode.js";

const {inspect, isValidEan13} = globalThis.ScaleBarcode;

test("verified real tomato weight label decodes as 245 grams, not 245 units", () => {
 const p=inspect("2700001002451");
 assert.equal(p.valid,true);
 assert.equal(p.productCode,"2700001");
 assert.equal(p.grams,245);
 assert.equal(p.kilograms,0.245);
 assert.equal(p.eanCheckDigit,1);
 assert.equal(p.kilograms*1250,306.25);
});
test("EAN-13 checksum rejects a damaged scale label", () => {
 assert.equal(isValidEan13("2700001002451"),true);
 assert.equal(isValidEan13("2700001002452"),false);
 assert.equal(inspect("2700001002452").reason,"checksum");
});
test("zeros, ordinary barcodes and partial codes cannot be sold as scale grams",()=>{
 assert.equal(inspect("2700001000000")?.valid ?? false,false);
 assert.equal(inspect("2700001"),null);
 assert.equal(inspect("4006381333931"),null);
 assert.equal(inspect("27000010024"),null);
 assert.equal(inspect("2700002029709").kilograms,2.970);
});
