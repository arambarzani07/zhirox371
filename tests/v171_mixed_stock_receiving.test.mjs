import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const sql=read("tests/v17/local_receive_mixed_v171.sql");
const ops=read("operations.js");
const html=read("operations.html");
test("V17.1 manager-only mixed unit/carton receipt has exact atomic server stock conversion",()=>{
 assert.match(sql,/CREATE FUNCTION public\.retail_receive_mixed_v171/);
 assert.match(sql,/retail_internal\.has_role\(p_store,array\['manager'\]\)/);
 assert.match(sql,/jsonb_array_length\(p_lines\)<>2/);
 assert.match(sql,/FOR SHARE OF b,p/);
 assert.match(sql,/IF v_product<>v_found THEN/);
 assert.match(sql,/v_seen_unit=true/);
 assert.match(sql,/v_seen_carton=true/);
 assert.match(sql,/v_base=v_base\+v_packages::numeric\*v_units/);
 assert.match(sql,/v_total=retail_internal\.receive_stock/);
 assert.match(sql,/ON CONFLICT\(store_id,request_id\) DO NOTHING/);
 assert.match(sql,/v_existing\.lines IS DISTINCT FROM p_lines/);
 assert.match(sql,/stock\.receive_mixed_v171/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.retail_stock_mixed_receipts_v171 FROM PUBLIC,anon,authenticated/);
});
test("V17.1 PC combined receiving preserves locked main design, price-independent receiving and retry ID",()=>{
 assert.match(html,/id="stock-mode"[^>]*>[\s\S]*?<option value="both">دانە و کارتۆن/);
 for(const id of ["stock-both-fields","stock-mixed-carton","stock-mixed-qty","stock-base-total"])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ops,/function updateStockBaseTotal\(/);
 assert.match(ops,/stock-mixed-qty/);
 assert.match(ops,/retail_receive_mixed_v171/);
 assert.match(ops,/stockAttempt\.uncertain/);
 assert.match(ops,/const fingerprint=JSON\.stringify/);
 assert.doesNotMatch(ops,/db\.rpc\("retail_receive_stock"/,
  "avoid unsafe idempotency bypass through legacy write API");
 const home=read("index.html");
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
});
test("V17.1 runs only against disposable Supabase and fixture browser",()=>{
 const ci=read(".github/workflows/pc-foundation.yml");
 assert.match(ci,/tests\/v17\/local_receive_mixed_v171\.sql/);
 assert.match(ci,/tests\/browser\/v171_mixed_stock_receiving\.mjs/);
 const e2e=read("tests/v12/auth_rls_e2e.mjs");
 assert.match(e2e,/parallelMixed=await Promise\.all/);
 assert.match(e2e,/localSQL\("select base_units from public\.retail_stock_mixed_receipts_v171/);
});
