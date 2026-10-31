import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTestSectionV82,TEST_SECTION_DATA_MODES} from "../test-market-sections-v82.mjs";
const sql=readFileSync("offline/migrations/033_fefo_checkout_v87.sql","utf8");
const fixture=readFileSync("offline/tests/045_v87_fefo_fixture.sql","utf8");
test("FEFO test checkout is atomic with V1 sale and keeps lot allocations immutable",()=>{
 for(const token of ["lot_checkouts_v87","lot_sale_allocations_v87",
 "checkout_fefo_test_v87","checkout_cash_v1(","FOR UPDATE",
 "expires_on>=current_date","ORDER BY b.expires_on ASC,b.batch_id ASC",
 "LEAST(v_need,v_free)","v_need<>0","P8705","P8703",
 "lot_allocation_immutable_v87","REVOKE ALL","FROM PUBLIC",
 "FOREIGN KEY(store_id,sale_id,line_no)"]){
  assert.ok(sql.includes(token),token);
 }
 assert.match(sql,/role IN\('owner','manager','cashier'\)/);
 assert.ok(sql.includes("request_payload IS DISTINCT FROM v_payload"));
 assert.ok(sql.includes("v_result.replayed"));
 assert.doesNotMatch(sql,/\bGRANT\s+[^;]*\sTO PUBLIC/i);
 assert.match(fixture,/sum\(total_minor\).*?24500/s);
});
test("expiry UI distinguishes V87 tracked lot accounting from physical unsold stock",async()=>{
 assert.ok(TEST_SECTION_DATA_MODES.real_data.includes("expiry"));
 assert.ok(TEST_SECTION_DATA_MODES.manager_only.includes("expiry"));
 const queries=[];
 const pool={query:async(query,args)=>{
  queries.push({query,args});
  if(query.includes("section_registry_v78"))
   return {rows:[{section_id:args[0],module_id:2,title:"بەسەرچوون",module_title:"کۆگا"}]};
  return {rows:[{lot_code:"TEST-SOON-002",received_qty_base_units:"4",
    allocated_v87:"3",tracked_remaining:"1",expiry_state:"near_expiry"}]};
 }};
 const denied=await getTestSectionV82({pool,store:"test-store",actor:"cashier",role:"cashier",sectionId:"expiry"});
 assert.equal(denied.status,403);assert.equal(queries.length,1);
 const allowed=await getTestSectionV82({pool,store:"test-store",actor:"owner",role:"owner",sectionId:"expiry"});
 assert.equal(allowed.status,200);assert.equal(allowed.body.write_enabled,false);
 assert.equal(allowed.body.rows[0].tracked_remaining,"1");
 assert.deepEqual(queries.at(-1).args,["test-store"]);
 assert.match(queries.at(-1).query,/lot_sale_allocations_v87/);
 assert.match(allowed.body.note,/کۆگای فیزیکی و پاراستنی تەواوی فرۆشتن نییە/);
 assert.doesNotMatch(queries.at(-1).query,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s/i);
});
