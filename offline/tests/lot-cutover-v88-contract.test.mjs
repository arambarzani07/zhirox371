import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTestSectionV82,TEST_SECTION_DATA_MODES} from "../test-market-sections-v82.mjs";
const schema=readFileSync("offline/migrations/034_lot_cutover_v88.sql","utf8");
test("V88 one-way opt-in LOT baseline refuses unmatched stock and routes legacy writes to a fail-closed test guard",()=>{
 for(const k of ["opening_lot_counts_v88","lot_cutovers_v88","lot_checkouts_v88",
 "lot_sale_allocations_v88","activate_fefo_test_v88","checkout_fefo_test_v88",
 "total<>p.stock_base_units","counted_qty","ORDER BY b.expires_on,b.opening_id",
 "stock_base_units","expires_on>=current_date","set_config('zhirox.v88_fefo_route'",
 "block_legacy_sale_v88","block_legacy_return_v88","block_legacy_goods_v88",
 "FOREIGN KEY(store_id,opening_id)","REVOKE ALL","FROM PUBLIC"]){
  assert.ok(schema.includes(k),k);
 }
 assert.match(schema,/current_database\(\) NOT IN\('zhirox_v80_disposable','zhirox_test_market'\)/);
 assert.match(schema,/role IN\('owner','manager'\)/);
 assert.match(schema,/lot_cutovers_v88 WHERE store_id=p_store/);
 assert.match(schema,/lot_checkout.*immutable|checkout_v88_immutable/s);
 assert.match(schema,/P8807/);
 assert.doesNotMatch(schema,/\bGRANT\s+[^;]*\s+TO PUBLIC/i);
});
test("V88 opening LOT read-only PC is store-scoped and manager-only, reports only an asserted test count",async()=>{
 assert.ok(TEST_SECTION_DATA_MODES.manager_only.includes("expiry"));
 const calls=[];
 const pool={query:async(query,args)=>{
  calls.push({query,args});
  if(query.includes("section_registry_v78"))return {rows:[{
    section_id:"expiry",module_id:2,title:"بەسەرچوون",module_title:"کۆگا"
  }]};
  if(query.includes("lot_cutovers_v88"))return {rows:[{enabled:true}]};
  return {rows:[{product_name:"TEST water",lot_code:"TEST-SOON-002",
    counted_qty:"1",allocated_v88:"1",tracked_remaining:"0",expiry_state:"near_expiry"}]};
 }};
 const cashier=await getTestSectionV82({pool,store:"isolated",actor:"cashier",role:"cashier",sectionId:"expiry"});
 assert.equal(cashier.status,403);
 assert.equal(calls.length,1);
 const own=await getTestSectionV82({pool,store:"isolated",actor:"owner",role:"owner",sectionId:"expiry"});
 assert.equal(own.status,200);
 assert.equal(own.body.source,"isolated_postgresql");
 assert.equal(own.body.write_enabled,false);
 assert.equal(own.body.rows[0].tracked_remaining,"0");
 assert.deepEqual(calls.at(-1).args,["isolated"]);
 assert.match(calls.at(-1).query,/lot_sale_allocations_v88/);
 assert.match(own.body.note,/ژماردنەوەی فیزیکیی پشتڕاستکراوی مارکێتی ڕاستەقینە نییە/);
 assert.deepEqual(own.body.columns.map(x=>x.key).slice(2,5),
  ["lot_origin","counted_qty","allocated_v88"]);
 assert.ok(calls.every(x=>x.query.includes("section_registry_v78")||x.args[0]==="isolated"));
});
