import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTestSectionV82,TEST_SECTION_DATA_MODES} from "../test-market-sections-v82.mjs";
const schema=readFileSync("offline/migrations/029_supplier_receiving_v83.sql","utf8");
const store="88000000-0000-4000-8000-000000000080";
test("purchasing PostgreSQL is typed, store-scoped, idempotent and manager-only",()=>{
 for(const word of ["suppliers_v83","purchase_orders_v83","purchase_order_lines_v83",
  "goods_receipts_v83","goods_receipt_lines_v83","UNIQUE(store_id,request_id)",
  "FOREIGN KEY(store_id,product_id)","require_purchase_manager_v83",
  "FOR UPDATE","block_supply_ledger_change_v83","REVOKE ALL","FROM PUBLIC"]){
   assert.ok(schema.includes(word),word);
 }
 assert.doesNotMatch(schema,/GRANT\s+[^;]+\s+TO\s+PUBLIC/gi);
 assert.doesNotMatch(schema,/DROP\s+TABLE|TRUNCATE\s+TABLE/gi);
});
test("all four supplier submodules have read-only queries and no cashier access",async()=>{
 const names=["purchase-order","supplier-building","receive-goods","supplier-accounts"];
 for(const id of names){
  assert.ok(TEST_SECTION_DATA_MODES.real_data.includes(id),id);
  assert.ok(TEST_SECTION_DATA_MODES.manager_only.includes(id),id);
 }
 const calls=[];
 const pool={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes("section_registry_v78"))return {rows:[{
   section_id:args[0],title:args[0],module_title:"کڕین و دابینکەران",module_id:4,slot:1
  }]};
  return {rows:[{display_name:"دابینکەری نموونەی تاقیکردنەوە"}]};
 }};
 for(const sectionId of names){
  let result=await getTestSectionV82({pool,store,actor:"test-cashier",role:"cashier",sectionId});
  assert.equal(result.status,403,sectionId);
  const before=calls.length;
  result=await getTestSectionV82({pool,store,actor:"owner",role:"owner",sectionId});
  assert.equal(result.status,200,sectionId);
  assert.equal(result.body.status,"read_only",sectionId);
  assert.equal(result.body.write_enabled,false);
  assert.equal(result.body.source,"isolated_postgresql");
  assert.equal(result.body.rows[0].display_name,"دابینکەری نموونەی تاقیکردنەوە");
  const q=calls.slice(before).find(x=>!x.sql.includes("section_registry_v78"));
  assert.ok(q,sectionId);
  assert.deepEqual(q.args,[store]);
  assert.match(q.sql,/WHERE (s|o|g)\.store_id=\$1::uuid/);
  assert.doesNotMatch(q.sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP)\s/i);
 }
});
