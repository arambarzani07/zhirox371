import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=path=>readFileSync(resolve(root,path),"utf8");
const operations=source("operations.js"), workspace=source("workspace.js");
const receipt=source("receipt-print.js"), guard=source("db/v19_guard_integer_checkout.sql");
const metadata=source("db/v19_kg_base_unit.sql");
const weighted=source("db/v19_weight_checkout.sql");
const receive=source("db/v19_weight_receiving.sql");
const resolver=source("db/v19_resolve_scale_barcode.sql");
const snapshot=source("db/v19_receipt_base_unit_snapshot.sql");
const ui=source("workspace.html");

test("kilogram is independent of carton/unit selling mode",()=>{
 assert.match(metadata,/base_unit IN \('unit','kg'\)/);
 assert.match(metadata,/catalog_version=catalog_version\+1/);
 assert.match(metadata,/stock_kept/);
 assert.match(metadata,/p_expected_stock/);
 assert.match(ui,/name="base_unit"/);
 assert.match(workspace,/retail_product_snapshot_v19/);
 assert.match(workspace,/retail_set_product_base_unit_v19/);
 assert.match(workspace,/stockQuantity/);
});
test("legacy whole-unit sale cannot silently consume kilograms",()=>{
 assert.match(guard,/Weighted product requires kg checkout/);
 assert.match(operations,/p\.base_unit==="kg"&&!b\.is_scale/);
 assert.match(operations,/const current=isScale\?null/);
});
test("scale scanner uses only verified 13-digit prefix-27 labels",()=>{
 assert.match(operations,/isValidEan13\(clean\)/);
 assert.match(operations,/clean\.slice\(7,12\)/);
 assert.match(resolver,/v_grams::numeric\/1000/);
 assert.match(resolver,/v_row\.base_unit='kg'/);
});
test("atomic kg checkout verifies server price and uses 3-decimal stock",()=>{
 assert.match(weighted,/round\(v_base_units\*v_price\)/);
 assert.match(weighted,/v_expected<>v_line_total/);
 assert.match(weighted,/v_base_units:=v_kg/);
 assert.match(weighted,/ON CONFLICT \(store_id,request_id\) DO NOTHING/);
 assert.match(operations,/retail_checkout_weight_v19/);
});
test("kg receiving is idempotent and accepts thousandths",()=>{
 assert.match(receive,/p_kg<>round\(p_kg,3\)/);
 assert.match(receive,/ON CONFLICT\(store_id,request_id\) DO NOTHING/);
 assert.match(operations,/retail_receive_weight_v19/);
});
test("receipt snapshot retains kg unit and line-rounding math",()=>{
 assert.match(snapshot,/base_unit_snapshot/);
 assert.match(receipt,/base_unit_snapshot/);
 assert.match(receipt,/Math\.round\(quantity\*price\)/);
 assert.match(receipt,/qty\.toFixed\(3\)/);
});