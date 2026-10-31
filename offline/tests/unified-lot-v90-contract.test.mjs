import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTestSectionV82,TEST_SECTION_DATA_MODES} from "../test-market-sections-v82.mjs";
const sql=readFileSync("offline/migrations/036_unified_lot_ledger_v90.sql","utf8");
test("V90 only uses isolated test lot accounting with receipt FK, idempotency, ACID V1 sale and recorded returns",()=>{
 for(const token of [
  "lot_cutovers_v90","lot_checkouts_v90","lot_sale_allocations_v90","lot_returns_v90",
  "lot_inventory_v90","activate_unified_fefo_v90","checkout_unified_fefo_v90",
  "return_unified_lot_v90","checkout_cash_v1(","record_sale_return_v84(",
  "test_v90_authorized","test_v90_return_authorized","test_v89_receive_authorized",
  "test_v89_return_authorized","WHERE store_id=p_store AND request_id=p_request",
  "tracked_remaining<0","expires_on>=current_date",
  "CHECK ((opening_id IS NOT NULL","FOREIGN KEY(store_id,receipt_id,receipt_line_no)",
  "REVOKE ALL","FROM PUBLIC","P9007","P9005"
 ])assert.ok(sql.includes(token),token);
 assert.match(sql,/NOT v90_active AND route='test_v88_authorized'/);
 assert.match(sql,/v90_active AND route='test_v90_authorized'/);
 assert.match(sql,/role IN\('owner','manager','cashier'\)/);
 assert.doesNotMatch(sql,/GRANT\s+[^;]+\sTO PUBLIC/i);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE TABLE/i);
});
test("V90 manager-only Sorani UI shows verified SQL tracker, not real physical stock",async()=>{
 assert.ok(TEST_SECTION_DATA_MODES.manager_only.includes("expiry"));
 const queries=[];const store="isolated-demo";
 const pool={query:async(query,args)=>{
  queries.push({query,args});
  if(query.includes("section_registry_v78"))
   return {rows:[{section_id:"expiry",module_id:2,title:"بەسەرچوون",module_title:"کۆگا"}]};
  if(query.includes("lot_cutovers_v88"))return {rows:[{enabled:true,unified:true}]};
  return {rows:[{product_name:"water",lot_code:"TEST-FUTURE-004",
   starting_qty:"23",net_outflow:"0",tracked_remaining:"23",expiry_state:"later"}]};
 }};
 const cashier=await getTestSectionV82({pool,store,actor:"cashier",role:"cashier",sectionId:"expiry"});
 assert.equal(cashier.status,403);assert.equal(queries.length,1);
 const owner=await getTestSectionV82({pool,store,actor:"owner",role:"owner",sectionId:"expiry"});
 assert.equal(owner.status,200);
 assert.equal(owner.body.source,"isolated_postgresql");
 assert.equal(owner.body.write_enabled,false);
 assert.equal(owner.body.status,"read_only");
 assert.equal(owner.body.rows[0].tracked_remaining,"23");
 assert.deepEqual(queries.at(-1).args,[store]);
 assert.match(queries.at(-1).query,/lot_inventory_v90/);
 assert.match(queries.at(-1).query,/WHERE v\.store_id=\$1::uuid/);
 assert.match(owner.body.note,/نەک ژماردنەوەی فیزیکیی مارکێتی ڕاستەقینە/);
 assert.ok(owner.body.columns.some(c=>c.key==="net_outflow"));
 assert.ok(queries.every(c=>!(/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\s/i).test(c.query)));
});
