import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTestSectionV82,TEST_SECTION_DATA_MODES} from "../test-market-sections-v82.mjs";
const sql=readFileSync("offline/migrations/031_test_cashbook_v85.sql","utf8");
test("V85 cashbook is separate, typed, manager-only and never linked to historical sales",()=>{
 for(const part of ["test_cash_shifts_v85","test_cash_movements_v85",
 "start_test_shift_v85","record_test_cash_movement_v85",
 "close_test_shift_v85","expected_minor","variance_minor",
 "TEST ONLY","REVOKE ALL","FOR UPDATE","P8504"]){
  assert.ok(sql.includes(part),part);
 }
 assert.match(sql,/role IN\('owner','manager'\)/);
 assert.doesNotMatch(sql,/(?:INSERT INTO|UPDATE|DELETE FROM)\s+zhirox_local\.(sales|cash_movements_v38|cash_shifts_v37|sale_returns_v84)\b/i);
 assert.doesNotMatch(sql,/\bGRANT\s+[^;]*\sTO PUBLIC/i);
});
test("four V85 PC pages are store-scoped read-only and denied to cashier",async()=>{
 const items=["cash-drawer","cash-movements","expense-fall","shift-clock"];
 const sqls=[];
 const pool={query:async(query,args)=>{
  sqls.push({query,args});
  if(query.includes("section_registry_v78"))
   return {rows:[{section_id:args[0],module_id:5,title:"TEST CASH",module_title:"دارایی"}]};
  return {rows:[{status:"closed",expected_minor:"53000",variance_minor:"-500"}]};
 }};
 for(const id of items){
  assert.ok(TEST_SECTION_DATA_MODES.real_data.includes(id));
  assert.ok(TEST_SECTION_DATA_MODES.manager_only.includes(id));
  const count=sqls.length;
  const cashier=await getTestSectionV82({pool,store:"store-A",actor:"cashier",role:"cashier",sectionId:id});
  assert.equal(cashier.status,403,id);
  assert.equal(sqls.length,count+1,"private data should not be queried");
  const owner=await getTestSectionV82({pool,store:"store-A",actor:"owner",role:"owner",sectionId:id});
  assert.equal(owner.status,200,id);
  assert.equal(owner.body.status,"read_only");
  assert.equal(owner.body.write_enabled,false);
  assert.equal(owner.body.rows[0].expected_minor,"53000");
  const q=sqls.at(-1);
  assert.deepEqual(q.args,["store-A"]);
  assert.match(q.query,/WHERE (?:m|q)\.store_id=\$1::uuid/);
  assert.doesNotMatch(q.query,/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE)\s/i);
 }
});
