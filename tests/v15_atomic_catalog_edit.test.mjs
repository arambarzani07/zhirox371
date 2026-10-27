import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(resolve(root,"workspace.js"),"utf8");
const migration=readFileSync(resolve(root,"db/v15_atomic_catalog_edit_20261027.sql"),"utf8");

test("editing calls one checked RPC; no partial upsert-and-catch fallback",()=>{
 assert.match(source,/db\.rpc\("retail_update_product_v15"/);
 assert.match(source,/p_expected_version:editing\.version/);
 assert.match(source,/db\.rpc\("retail_product_snapshot_v19"/);
 assert.doesNotMatch(source,/\.upsert\([^]*?\.catch\(\(\)=>\{\}\)/);
 assert.doesNotMatch(source,/db\.from\("retail_barcodes"\)\.upsert\(/);
 assert.doesNotMatch(source,/usedFallback/);
});
test("atomic database changes require owner, version and preserve retired barcode history",()=>{
 assert.match(migration,/SECURITY DEFINER/);
 assert.match(migration,/owner_user_id/);
 assert.match(migration,/catalog_version<>p_expected_version/);
 assert.match(migration,/ERRCODE='40001'/);
 assert.match(migration,/UPDATE public\.retail_barcodes SET active=false/);
 assert.match(migration,/Barcode already used by another product/);
 assert.match(migration,/product\.update_v15/);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.retail_update_product_v15/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.retail_update_product_v15/);
});
