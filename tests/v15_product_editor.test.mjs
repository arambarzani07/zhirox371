import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const sql=read("tests/v15/local_product_editor.sql"),
 ui=read("workspace.html"),app=read("workspace.js"),
 cashier=read("operations.js"),workflow=read(".github/workflows/pc-foundation.yml");
test("V15 product form includes edit/cancel/history without adding overlay guidance",()=>{
 for(const id of ["product-form-title","cancel-edit","history-product","product-history","product-history-list"])
  assert.match(ui,new RegExp('id="'+id+'"'));
 assert.match(app,/async function beginEdit/);
 assert.match(app,/retail_product_snapshot_v19/);
 assert.match(app,/retail_update_product_v15/);
 assert.match(app,/retail_product_history_v15/);
 assert.match(app,/p_expected_version:editing.version/);
 assert.match(app,/owner_user_id/);
 assert.match(sql,/product\.update_v15/);
});
test("V15 database edits lock and version a single record while preserving old barcodes",()=>{
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/v_actual_version<>p_expected_version/);
 assert.match(sql,/errcode='40001'/);
 assert.match(sql,/SET active=false/);
 assert.doesNotMatch(sql,/DELETE FROM public\.retail_barcodes/i);
 assert.match(sql,/ON CONFLICT\(store_id,code\)/);
 assert.match(sql,/product_id<>p_product_id/);
 assert.match(sql,/product\.update_v15/);
 assert.match(sql,/'before',v_old,'after',v_new/);
});
test("V15 keeps dangerous functions owner-only and QA environment offline",()=>{
 for(const name of ["retail_update_product_v15","retail_product_history_v15","retail_product_snapshot_v15"])
  assert.match(sql,new RegExp("FUNCTION public\\."+name));
 assert.match(sql,/owner_user_id=v_owner/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.retail_update_product_v15/);
 assert.match(workflow,/tests\/v15\/local_product_editor\.sql/);
 assert.match(workflow,/supabase stop --no-backup/);
 assert.match(workflow,/node tests\/browser\/v15_product_editor\.mjs/);
});
test("retired barcode aliases cannot resolve at cashier; existing hosted schema still supported",()=>{
 assert.match(cashier,/select\("product_id,code,unit_type,units_per_scan,active"\)/);
 assert.match(cashier,/\.filter\(b=>b\.active!==false\)/);
 assert.match(cashier,/PGRST204/);
 assert.match(cashier,/retail_scan_catalog_v16/);
 assert.match(cashier,/b\.active!==false/);
 const editor=cashier.slice(cashier.indexOf("async function saveOpsCatalogProduct(e){"),cashier.indexOf("async function refreshLowStockView(){"));
 assert.match(editor,/retail_product_snapshot_v19/);
 assert.match(editor,/retail_update_product_v15/);
 assert.match(editor,/p_expected_version:Number\(original.version\)/);
 assert.doesNotMatch(editor,/db\.from\(["']retail_products|db\.from\(["']retail_barcodes/);
});
