import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=n=>readFileSync(resolve(root,n),"utf8");
const context={};
new Function("window",read("product-catalog.js"))(context);
const parse=context.RetailCatalog.fromForm;
const tomato=new Map([
 ["name","تەماتە"],["sale_mode","unit"],["sku","VEG-00001"],
 ["plu","00001"],["barcode",""],["price","1250"],["purchase_price","900"]
]);

test("Scale PLU 00001 registers without manufactured ordinary barcode",()=>{
 const p=parse(tomato);
 assert.equal(p.unit_barcode,"");
 assert.equal(p.plu,"00001");
 assert.equal(p.scale_only,true);
 assert.equal(p.advanced,true);
 assert.equal(p.unit_sale_price_iqd,1250);
 assert.equal(p.unit_purchase_price_iqd,900);
 assert.deepEqual(p.unit_alias_barcodes,[]);
 assert.equal(p.carton,null);
});
test("Scale prefix 2700001 is not a valid fixed unit barcode for PLU 00001",()=>{
 const bad=new Map(tomato);bad.set("barcode","2700001");
 assert.throws(()=>parse(bad),/کۆدی تەرازوو/);
});
test("A product without a barcode must have a valid exact five-digit scale PLU",()=>{
 for(const plu of ["","1","0001","000001","ABC01"]){
   const bad=new Map(tomato);bad.set("plu",plu);
   assert.throws(()=>parse(bad),/بارکۆدی دانە پێویستە/);
 }
});
test("Scale-only products cannot register unit aliases without a fixed primary barcode",()=>{
 const bad=new Map(tomato);bad.set("extra_barcodes","6260001112223");
 assert.throws(()=>parse(bad),/فرەبارکۆدی دانە/);
});
test("Ordinary unit and carton products keep original required barcodes",()=>{
 const unit=new Map(tomato);unit.set("plu","");unit.set("barcode","6260001112223");
 const d=parse(unit);assert.equal(d.unit_barcode,"6260001112223");assert.equal(d.scale_only,false);
 const both=new Map(unit);both.set("sale_mode","both");both.set("plu","00001");both.set("barcode","");
 assert.throws(()=>parse(both),/بارکۆدی دانە پێویستە/);
});
test("The scale registration fix remains QA-only and preserves locked Home",()=>{
 const sql=read("tests/v14/local_product_registration.sql"),edit=read("tests/v15/local_product_editor.sql");
 assert.match(sql,/CREATE UNIQUE INDEX retail_products_store_scale_plu_unique/);
 assert.match(sql,/v_unit_code IS NOT NULL THEN/);
 assert.match(sql,/Owner permission required/);
 assert.match(sql,/Scale-only product cannot have unit aliases/);
 assert.match(edit,/coalesce\(v_plu,''\)/);
 assert.match(edit,/v_unit_code IS NOT NULL THEN v_codes:=array_append/);
 assert.match(edit,/v_carton.product_id IS NOT NULL THEN NULL/);
 const html=read("workspace.html");
 assert.match(html,/name="plu"/);
 assert.match(html,/name="barcode" maxlength="60" autocomplete="off"/);
 assert.doesNotMatch(html,/name="barcode" maxlength="60" required/);
});
