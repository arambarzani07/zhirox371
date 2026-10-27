import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(resolve(root,file),"utf8");
const scope={};
new Function("window",read("product-catalog.js"))(scope);
const parse=scope.RetailCatalog.fromForm;
const tomato=()=>new Map([
 ["name","تەماتە"],["sale_mode","scale"],["plu","00001"],
 ["price","1250"],["purchase_price","900"]
]);

test("verified scale tomato uses PLU 00001 only, with IQD/kg price and no barcode",()=>{
 const v=parse(tomato());
 assert.equal(v.sale_mode,"scale");assert.equal(v.plu,"00001");
 assert.equal(v.unit_barcode,"");assert.deepEqual(v.unit_alias_barcodes,[]);
 assert.equal(v.unit_sale_price_iqd,1250);assert.equal(v.unit_purchase_price_iqd,900);
 assert.equal(v.advanced,true);assert.equal(v.carton,null);
 assert.equal(Math.round(v.unit_sale_price_iqd*480/1000),600);
});
test("never mistake a scale prefix, a full weight label, or a bad PLU for a fixed item barcode",()=>{
 for(const barcode of ["2700001","2700001004806"]){
  const input=tomato();input.set("barcode",barcode);
  assert.throws(()=>parse(input),/بارکۆدی دانە/);
 }
 for(const plu of ["","1","2700001","00000","000001","abcde"]){
  const input=tomato();input.set("plu",plu);
  assert.throws(()=>parse(input),/کۆدی تەرازوو/);
 }
 const aliased=tomato();aliased.set("extra_barcodes","12345");
 assert.throws(()=>parse(aliased),/فرەبارکۆدی دانە/);
 const zero=tomato();zero.set("price","0");
 assert.throws(()=>parse(zero),/نرخی کیلۆگرام/);
 const carton=tomato();carton.set("carton_barcode","6261111111111");
 assert.throws(()=>parse(carton),/خانەکانی کارتۆن/);
});
test("original unit and carton registration behavior remains compatible",()=>{
 const unit=parse(new Map([["name","شیر"],["sale_mode","unit"],
   ["barcode","6260001112223"],["price","1000"]]));
 assert.equal(unit.advanced,false);
 const both=parse(new Map([["name","شیر"],["sale_mode","both"],
   ["barcode","6260001112223"],["price","1000"],["carton_barcode","6260001112230"],
   ["units_per_carton","12"],["carton_price","11000"]]));
 assert.equal(both.sale_mode,"both");assert.equal(both.carton.units_per_carton,12);
});
test("server registration and editor require PLU-only scale mode and reserve duplicates",()=>{
 const v14=read("tests/v14/local_product_registration.sql");
 const v15=read("tests/v15/local_product_editor.sql");
 assert.match(v14,/retail_products_store_normalized_plu_unique/);
 assert.match(v14,/\('unit','carton','both','scale'\)/);
 assert.match(v14,/v_sale_mode NOT IN \('carton','scale'\)/);
 assert.match(v15,/v_sale_mode<>'scale'/);
 assert.match(v15,/THEN 'scale'/);
 assert.match(v15,/v_sale_mode NOT IN \('unit','carton','both','scale'\)/);
 assert.match(v14,/Owner permission required/);
 assert.match(v15,/Stale catalog revision/);
});
test("scale-only UI stays in product workspace without touching locked Home files",()=>{
 const html=read("workspace.html"),logic=read("workspace.js");
 assert.match(html,/name="sale_mode" value="scale"/);
 assert.match(html,/id="unit-barcode-field"/);
 assert.match(logic,/plu\.required=isScale/);
 assert.match(logic,/retail_register_product_v14/);
 assert.match(logic,/retail_update_product_v15/);
});
