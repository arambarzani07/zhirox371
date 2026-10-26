import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const window={};new Function("window",read("product-catalog.js"))(window);
const parse=window.RetailCatalog.fromForm;
const unit=[["sale_mode","unit"],["name","شیر"],["barcode","6260001112223"],["price","1000"]];
const carton=[["sale_mode","carton"],["name","شیر"],["carton_barcode","6260001112230"],
 ["extra_carton_barcodes","6260001112261"],["units_per_carton","12"],
 ["carton_purchase_price","9000"],["carton_price","11000"]];
test("V16 explicit selling modes preserve a single product identity",()=>{
 const u=parse(new Map(unit));assert.equal(u.sale_mode,"unit");assert.equal(u.advanced,false);assert.equal(u.carton,null);
 const c=parse(new Map(carton));assert.equal(c.sale_mode,"carton");assert.equal(c.unit_barcode,"");assert.equal(c.unit_sale_price_iqd,null);
 assert.equal(c.carton.units_per_carton,12);assert.deepEqual(c.carton.alias_barcodes,["6260001112261"]);
 const b=parse(new Map([...unit,...carton,["sale_mode","both"]]));
 assert.equal(b.sale_mode,"both");assert.equal(b.unit_barcode,"6260001112223");
 assert.equal(b.carton.sale_price_iqd,11000);
});
test("V16 forbids incomplete modes, ghost unit codes and cartons without size",()=>{
 assert.throws(()=>parse(new Map([...unit,["sale_mode","carton"]])),/بارکۆدی دانە|خانەکانی دانە/);
 assert.throws(()=>parse(new Map([...carton,["sale_mode","unit"]])),/خانەکانی کارتۆن/);
 assert.throws(()=>parse(new Map([...unit,["sale_mode","both"]])),/پێویستن/);
 assert.throws(()=>parse(new Map([...carton,["units_per_carton","1"]])),/نادروستە/);
 assert.throws(()=>parse(new Map([...unit,["sale_mode","invalid"]])),/نادروستە/);
});
test("V16 form has three interactive modes and disables hidden fields",()=>{
 const html=read("workspace.html"),ui=read("workspace.js");
 for(const mode of ["unit","carton","both"])assert.match(html,new RegExp('name="sale_mode" value="'+mode+'"'));
 assert.match(html,/id="unit-fields"/);assert.match(html,/id="carton-fields"/);
 assert.match(ui,/function syncSellingMode/);assert.match(ui,/field\.disabled=!enabled/);
 assert.match(ui,/sellingModeFromSnapshot/);
});
test("V16 backend owns all pack prices, enforces base-unit stock and replay request fence",()=>{
 const sql=read("tests/v16/local_dual_sale_checkout.sql");
 const ops=read("operations.js");
 assert.match(sql,/CREATE FUNCTION public\.retail_scan_catalog_v16/);
 assert.match(sql,/CREATE FUNCTION public\.retail_checkout_packs_v16/);
 assert.match(sql,/retail_internal\.has_role/);
 assert.match(sql,/CASE WHEN b\.unit_type='carton' THEN c\.sale_price_minor ELSE p\.price_minor END/);
 assert.match(sql,/v_expected_price<>v_pack_price OR v_expected_units<>v_pack_units/);
 assert.match(sql,/v_need=jsonb_set/);
 assert.match(sql,/FROM jsonb_each_text\(v_need\) ORDER BY key/);
 assert.match(sql,/ON CONFLICT\(store_id,request_id\) DO NOTHING/);
 assert.match(sql,/v_prior_payload IS DISTINCT FROM v_request_payload/);
 assert.match(sql,/package_type,package_barcode,units_per_package,base_units/);
 assert.match(ops,/stockUsed\(p\.id\)\+units>stock/);
 assert.match(ops,/retail_checkout_packs_v16/);
 assert.match(ops,/expected_price_minor:x\.price/);
 assert.doesNotMatch(sql,/UPDATE public\.retail_products SET/);
});
