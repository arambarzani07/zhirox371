import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getTestSectionV82,TEST_SECTION_DATA_MODES} from "../test-market-sections-v82.mjs";
const spec=readFileSync("src/components/CardIcon.tsx","utf8");
const registry=readFileSync("offline/migrations/027_section_settings_v78.sql","utf8");
const all=[...spec.matchAll(/\{\s*label:\s*"([^"]+)",\s*iconName:\s*"([a-z0-9-]+)"/g)].map(m=>({label:m[1],id:m[2]}));
const seed=[...registry.matchAll(/\(\d+,\d+,'([a-z0-9-]+)','[^']+','([^']+)','(?:demo_ui|read_only_demo|planned)'\)/g)].map(m=>({id:m[1],label:m[2]}));
const store="88000000-0000-4000-8000-000000000080";
test("all 48 Sorani submodules match the per-store PostgreSQL section registry",()=>{
 assert.equal(all.length,48);
 assert.equal(new Set(all.map(s=>s.id)).size,48);
 assert.deepEqual(all.map(x=>x.id),seed.map(x=>x.id));
 assert.deepEqual(all.map(x=>x.label),seed.map(x=>x.label));
 assert.ok(TEST_SECTION_DATA_MODES.real_data.length>15,"some real PostgreSQL sections implemented");
});
test("all 48 sections return a unique read-only or explicitly unimplemented page without financial mutation",async()=>{
 const queries=[];
 let sectionId="";
 const pool={query:async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.includes("FROM zhirox_local.section_registry_v78")){
   const known=all.find(x=>x.id===args[0]);
   return {rows:known?[{section_id:known.id,module_id:0,slot:1,module_title:"TEST",title:known.label,ui_state:"planned"}]:[]};
  }
  return {rows:[]};
 }};
 for(const item of all){
  sectionId=item.id;
  const resp=await getTestSectionV82({pool,store,actor:"88000000-0000-4000-8000-000000000081",role:"owner",sectionId});
  assert.equal(resp.status,200,sectionId);
  assert.equal(resp.body.section.id,item.id,sectionId);
  assert.equal(resp.body.section.title,item.label,sectionId);
  assert.equal(resp.body.source,"isolated_postgresql");
  assert.equal(resp.body.write_enabled,false);
  assert.ok(["read_only","planned"].includes(resp.body.status),sectionId);
  assert.ok(Array.isArray(resp.body.columns),sectionId);
  assert.ok(Array.isArray(resp.body.rows),sectionId);
 }
 assert.ok(queries.every(q=>!/(?:^|\s)(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\s/i.test(q.sql)),"no mutating SQL");
 assert.ok(queries.filter(q=>!q.sql.includes("section_registry_v78")).every(q=>q.args[0]===store),"query must contain server-derived store");
 const unknown=await getTestSectionV82({pool,store,actor:"test",role:"owner",sectionId:"not-registered"});
 assert.equal(unknown.status,404);
});
test("cashier cannot read private debt, manager roster or financial audit but can read own sales",async()=>{
 const calls=[];
 const pool={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes("section_registry_v78"))return {rows:[{
    section_id:args[0],module_id:3,slot:1,module_title:"test",title:"test",ui_state:"planned"}]};
  return {rows:[]};
 }};
 for(const id of TEST_SECTION_DATA_MODES.manager_only){
  const before=calls.length;
  const r=await getTestSectionV82({pool,store,actor:"test-cashier",role:"cashier",sectionId:id});
  assert.equal(r.status,403,id);
  assert.equal(calls.length,before+1,"only public registry lookup allowed on denied cashier path");
 }
 const r=await getTestSectionV82({pool,store,actor:"test-cashier",role:"cashier",sectionId:"receipt"});
 assert.equal(r.status,200);
 assert.ok(calls.at(-1).sql.includes("cashier_id=$2::uuid"));
 assert.deepEqual(calls.at(-1).args,[store,"test-cashier"]);
});
