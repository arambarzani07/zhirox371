import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTestSectionV82,TEST_SECTION_DATA_MODES} from "../test-market-sections-v82.mjs";
const schema=readFileSync("offline/migrations/030_sale_returns_v84.sql","utf8");
test("V84 return journal never posts cash or rewrites original receipts",()=>{
 for(const x of ["sale_returns_v84","PRIMARY KEY(store_id,return_id)",
 "UNIQUE(store_id,request_id)","FOREIGN KEY(store_id,sale_id,line_no)",
 "require","FOR UPDATE","deny_sale_return_mutation_v84",
 "unit_price_minor","accounting_only","restocked","FROM PUBLIC"]){
  if(x!=="require")assert.ok(schema.includes(x),x);
 }
 assert.match(schema,/role IN\('owner','manager'\)/);
 assert.match(schema,/v_prev_qty\+p_qty>v_line.quantity_base_units/);
 assert.doesNotMatch(schema,/(?:INSERT INTO|UPDATE|DELETE FROM)\s+zhirox_local\.(sales|cash_movements_v38|event_outbox)\b/i);
 assert.doesNotMatch(schema,/\bGRANT\s+[^;]*\sTO PUBLIC/i);
});
test("V84 returns screen is manager-only and store-scoped read-only",async()=>{
 assert.ok(TEST_SECTION_DATA_MODES.real_data.includes("return-arrow"));
 assert.ok(TEST_SECTION_DATA_MODES.manager_only.includes("return-arrow"));
 const queries=[];
 const pool={query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes("section_registry_v78"))return {rows:[{
   section_id:args[0],module_id:0,title:"گەڕاندنەوە",module_title:"کاشێر و فرۆشتن"
  }]};
  return {rows:[{receipt_no:1,amount_minor:"2500",restocked:true}]};
 }};
 const cashier=await getTestSectionV82({pool,store:"store-1",actor:"cashier",role:"cashier",sectionId:"return-arrow"});
 assert.equal(cashier.status,403);
 assert.equal(queries.length,1,"cannot query financial ledger even to hide results");
 const result=await getTestSectionV82({pool,store:"store-1",actor:"owner",role:"owner",sectionId:"return-arrow"});
 assert.equal(result.status,200);
 assert.equal(result.body.status,"read_only");
 assert.equal(result.body.write_enabled,false);
 assert.deepEqual(result.body.rows,[{receipt_no:1,amount_minor:"2500",restocked:true}]);
 assert.deepEqual(queries.at(-1).args,["store-1"]);
 assert.match(queries.at(-1).sql,/WHERE r\.store_id=\$1::uuid/);
 assert.match(result.body.note,/هیچ نەختینە/);
});
