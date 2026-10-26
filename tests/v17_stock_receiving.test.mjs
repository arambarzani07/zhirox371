import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const sql=read("tests/v17/local_receive_packs.sql"),ops=read("operations.js"),html=read("operations.html");
test("V17 permits single-stock receiving through verified item barcode and pack conversion",()=>{
 assert.match(sql,/CREATE FUNCTION public\.retail_receive_packs_v17/);
 assert.match(sql,/retail_internal\.has_role\(p_store,array\['manager'\]\)/);
 assert.match(sql,/b\.store_id=p_store AND b\.code=p_barcode AND b\.active/);
 assert.match(sql,/p_expected_units<>v_units/);
 assert.match(sql,/v_increment=p_packages::numeric\*v_units/);
 assert.match(sql,/v_total=retail_internal\.receive_stock/);
 assert.match(sql,/stock\.receive_packs_v17/);
 assert.match(sql,/ON CONFLICT\(store_id,request_id\) DO NOTHING/);
 assert.match(sql,/v_existing\.actor_id IS DISTINCT FROM v_actor/);
 assert.match(sql,/REVOKE ALL ON public\.retail_stock_receipt_requests_v17/);
});
test("V17 PC unit/carton control adds only functional form controls",()=>{
 for(const id of ["stock-form","stock-product","stock-mode","stock-barcode","stock-quantity","stock-base-total"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ops,/function updateStockUnits\(/);
 assert.match(ops,/function updateStockBaseTotal\(/);
 assert.match(ops,/retail_receive_packs_v17/);
 assert.match(ops,/p_expected_units:units/);
 assert.match(ops,/p_packages:amount/);
 assert.match(ops,/stockAttempt\.fingerprint!==fingerprint/);
 assert.match(ops,/mode==="unit"/);
 assert.match(read(".github/workflows/pc-foundation.yml"),/tests\/browser\/v17_stock_receiving\.mjs/);
 assert.match(read(".github/workflows/pc-foundation.yml"),/tests\/v17\/local_receive_packs\.sql/);
});
