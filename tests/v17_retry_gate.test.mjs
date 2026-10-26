import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const src=p=>readFileSync(resolve(root,p),"utf8");
const sql=src("tests/v17/local_receive_packs.sql");
test("V17 checks completed identical stock request before active-barcode validity",()=>{
 const replay=sql.indexOf("SELECT * INTO v_existing FROM public.retail_stock_receipt_requests_v17");
 const current=sql.indexOf("SELECT b.product_id,b.unit_type,b.units_per_scan,p.active");
 assert.ok(replay>0&&current>replay,"Idempotent retry must precede active barcode lookup");
 assert.match(sql,/v_existing\.actor_id IS DISTINCT FROM v_actor/);
 assert.match(sql,/v_existing\.barcode IS DISTINCT FROM p_barcode/);
 assert.match(sql,/v_existing\.packages IS DISTINCT FROM p_packages/);
 assert.match(sql,/v_existing\.units_per_package IS DISTINCT FROM p_expected_units/);
 assert.match(sql,/v_existing\.reason IS DISTINCT FROM p_reason/);
});
test("V17 receipt request deduplicates concurrent calls and prevents anonymous row access",()=>{
 assert.match(sql,/PRIMARY KEY\(store_id,request_id\)/);
 assert.match(sql,/ON CONFLICT\(store_id,request_id\) DO NOTHING/);
 assert.match(sql,/REVOKE ALL ON public\.retail_stock_receipt_requests_v17 FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/retail_internal\.has_role\(p_store,array\['manager'\]\)/);
 assert.match(sql,/stock\.receive_packs_v17/);
 const e2e=src("tests/v12/auth_rls_e2e.mjs");
 assert.match(e2e,/concurrentReceipts=await Promise\.all/);
 assert.match(e2e,/after its barcode became inactive/);
 assert.match(e2e,/replayed retired barcode cannot change reason/);
});
