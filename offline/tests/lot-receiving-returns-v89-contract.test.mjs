import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTestSectionV82,TEST_SECTION_DATA_MODES} from "../test-market-sections-v82.mjs";
const sql=readFileSync("offline/migrations/035_lot_receiving_returns_v89.sql","utf8");
test("V89 receipts and return attribution require manager and preserve immutable per-store LOT evidence",()=>{
 for(const token of ["lot_receipt_batches_v89","lot_receipt_lines_v89","lot_returns_v89",
 "receive_order_lots_v89","return_opening_lot_v89","require_test_lot_manager_v88",
 "test_v89_receive_authorized","test_v89_return_authorized",
 "P8905","P8903","lot_receipt_lines_v89_immutable",
 "lot_returns_v89_immutable","REVOKE ALL","FROM PUBLIC",
 "FOREIGN KEY(store_id,sale_id,line_no,opening_id)",
 "quantity_base_units=v_qty","previous_count+p_qty>allocation.quantity_base_units"]){
  assert.ok(sql.includes(token),token);
 }
 assert.match(sql,/current_setting\('zhirox.v88_fefo_route',true\)/);
 assert.match(sql,/COALESCE\(current_setting/);
 assert.doesNotMatch(sql,/\bGRANT\s+[^;]*\s+TO PUBLIC/i);
});
test("V89 SQL receipt, return and expiry pages remain scoped read-only and private",async()=>{
 const cases=["receive-goods","return-arrow","expiry"];
 for(const sectionId of cases){
  assert.ok(TEST_SECTION_DATA_MODES.real_data.includes(sectionId));
  assert.ok(TEST_SECTION_DATA_MODES.manager_only.includes(sectionId));
  const calls=[];
  const pool={query:async(sql,args)=>{
   calls.push({sql,args});
   if(sql.includes("section_registry_v78"))return {rows:[{
     section_id:sectionId,title:sectionId,module_id:2,module_title:"test"}]};
   if(sql.includes("lot_cutovers_v88"))return {rows:[{enabled:true}]};
   return {rows:[{lot_code:"TEST-LOT",received_qty_base_units:3}]};
  }};
  const denied=await getTestSectionV82({pool,store:"test-market",actor:"cashier",role:"cashier",sectionId});
  assert.equal(denied.status,403);
  const ok=await getTestSectionV82({pool,store:"test-market",actor:"owner",role:"owner",sectionId});
  assert.equal(ok.status,200);
  assert.equal(ok.body.write_enabled,false);
  assert.equal(ok.body.source,"isolated_postgresql");
  assert.equal(ok.body.rows[0].lot_code,"TEST-LOT");
  assert.ok(ok.body.columns.some(c=>c.key==="lot_code"));
  const q=calls.at(-1);
  assert.deepEqual(q.args,["test-market"]);
  assert.doesNotMatch(q.sql,/\b(?:UPDATE|INSERT|DELETE|TRUNCATE)\s/i);
 }
});
