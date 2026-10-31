import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTestSectionV82,TEST_SECTION_DATA_MODES} from "../test-market-sections-v82.mjs";
const schema=readFileSync("offline/migrations/032_expiry_lots_v86.sql","utf8");
test("expiry lots are immutable, store-scoped and actual received quantities not unsold balances",()=>{
 for(const x of ["expiry_lots_v86","FOREIGN KEY(store_id,receipt_id,receipt_line_no)",
   "UNIQUE(store_id,receipt_id,receipt_line_no,lot_code)","received_qty_base_units",
   "FOR UPDATE","allocated+p_qty>received.quantity_base_units",
   "block_expiry_lot_mutation_v86","REVOKE ALL","FROM PUBLIC"]){
  assert.ok(schema.includes(x),x);
 }
 assert.match(schema,/role IN\('owner','manager'\)/);
 assert.doesNotMatch(schema,/\b(?:UPDATE|DELETE FROM)\s+zhirox_local\.(?:products|sales|stock_ledger)\b/i);
 assert.doesNotMatch(schema,/\bGRANT\s+[^;]*\s+TO PUBLIC/i);
});
test("expiry warehouse page uses session-derived store, denies cashiers and does no inventory writes",async()=>{
 assert.ok(TEST_SECTION_DATA_MODES.real_data.includes("expiry"));
 assert.ok(TEST_SECTION_DATA_MODES.manager_only.includes("expiry"));
 const calls=[];
 const pool={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes("section_registry_v78"))return {rows:[{
    section_id:args[0],module_id:2,title:"بەسەرچوون",module_title:"کۆگا"}]};
  return {rows:[{product_name:"test",lot_code:"TEST-EXP-001",received_qty_base_units:"2",
   expires_on:"2026-11-01",days_to_expiry:1,expiry_state:"near_expiry"}]};
 }};
 const denied=await getTestSectionV82({pool,store:"test-store",actor:"cashier",role:"cashier",sectionId:"expiry"});
 assert.equal(denied.status,403);assert.equal(calls.length,1);
 const allowed=await getTestSectionV82({pool,store:"test-store",actor:"owner",role:"owner",sectionId:"expiry"});
 assert.equal(allowed.status,200);
 assert.equal(allowed.body.status,"read_only");assert.equal(allowed.body.write_enabled,false);
 assert.equal(allowed.body.rows.length,1);
 assert.ok(allowed.body.columns.some(x=>x.key==="received_qty_base_units"));
 assert.match(allowed.body.note,/کۆگای ماوەی هەر بەچ نازانرێت/);
 const q=calls.at(-1);assert.deepEqual(q.args,["test-store"]);
 assert.match(q.sql,/WHERE b\.store_id=\$1::uuid/);
 assert.doesNotMatch(q.sql,/\b(?:UPDATE|INSERT|DELETE|TRUNCATE)\b/i);
});
