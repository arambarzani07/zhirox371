import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const read=p=>readFileSync(p,"utf8");
const registry=read("src/components/CardIcon.tsx");
const sql=read("offline/migrations/027_section_settings_v78.sql");
const screen=read("src/components/SectionWorkspace.tsx");
const entries=[...registry.matchAll(/\{\s*label:\s*"([^"]+)",\s*iconName:\s*"([^"]+)"/g)]
 .map(m=>({name:m[1],id:m[2]}));
const seed=[...sql.matchAll(/^\s*\(\d+,\d+,'([^']+)','[^']+','([^']+)','(demo_ui|read_only_demo|planned)'\)/gm)]
 .map(m=>({name:m[2],id:m[1],state:m[3]}));
test("12 x 4 source routes match unique seeded local SQL section IDs",()=>{
 assert.equal(entries.length,48);
 assert.equal(seed.length,48);
 assert.equal(new Set(entries.map(e=>e.id)).size,48);
 assert.equal(new Set(seed.map(e=>e.id)).size,48);
 assert.deepEqual(entries,seed.map(({id,name})=>({id,name})));
});
test("section data flow uses explicit unique IDs and never silently reuses another screen",()=>{
 for(const fragment of ['activeSectionId','data-section-id','data-section-title']){
   assert.ok(screen.includes(fragment)||read("src/context/AppContext.tsx").includes(fragment),fragment);
 }
 assert.match(read("src/components/Header.tsx"),/sub\.iconName\)/);
 assert.match(read("src/App.tsx"),/SectionWorkspace key=\{activeSectionId\}/);
});
test("database settings are per store and per section, private, versioned and audited",()=>{
 for(const fragment of ["PRIMARY KEY(store_id,section_id,setting_key)","REFERENCES zhirox_local.stores",
  "REFERENCES zhirox_local.section_registry_v78","SECURITY INVOKER","FROM PUBLIC",
  "FOR UPDATE","section_settings_audit_v78","role IN('owner','manager')"]){
  assert.ok(sql.includes(fragment),fragment);
 }
 assert.ok(!/GRANT\s+[^;]+\s+TO\s+PUBLIC/gi.test(sql));
});
test("registry status accurately distinguishes demo, read-only and unimplemented",()=>{
 assert.equal(seed.filter(x=>x.state==="demo_ui").length,20);
 assert.equal(seed.filter(x=>x.state==="read_only_demo").length,12);
 assert.equal(seed.filter(x=>x.state==="planned").length,16);
});
