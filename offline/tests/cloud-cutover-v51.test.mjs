import test from "node:test";
import assert from "node:assert/strict";
import {validateV51ProposedCloudEndpoint,inspectV51CloudCutover} from "../cloud-cutover-v51.mjs";
import {validateV51Delta,planV51CatalogDryRun} from "../catalog-conflicts-v51.mjs";

const store="10000000-0000-0000-0000-000000000051";
const other="10000000-0000-0000-0000-000000000052";
const product="20000000-0000-0000-0000-000000000051";
const event=n=>"40000000-0000-0000-0000-"+String(n).padStart(12,"0");
const price=(n,base,amount,source="cloud_admin")=>({
 store_id:store,product_id:product,event_id:event(n),
 event_type:"catalog.price_set",source,base_version:base,version:base+1,
 payload:{sale_price_minor:amount}
});
test("V51 Cloud config validates exact HTTPS target and never contacts the host",()=>{
 assert.deepEqual(validateV51ProposedCloudEndpoint(
   "https://sync.zhirox.example.com/v27/events","sync.zhirox.example.com"),
   {hostname:"sync.zhirox.example.com",endpoint:"https://sync.zhirox.example.com/v27/events"});
 for(const [url,host] of [
  ["http://sync.example.com/v27/events","sync.example.com"],
  ["https://127.0.0.1/v27/events","127.0.0.1"],
  ["https://192.168.1.3/v27/events","192.168.1.3"],
  ["https://localhost/v27/events","localhost"],
  ["https://a.local/v27/events","a.local"],
  ["https://169.254.169.254/v27/events","169.254.169.254"],
  ["https://user:secret@sync.example.com/v27/events","sync.example.com"],
  ["https://sync.example.com:8443/v27/events","sync.example.com"],
  ["https://sync.example.com/v27/events?secret=x","sync.example.com"],
  ["https://sync.example.com/v27/events#token","sync.example.com"],
  ["https://sync.example.com/v28/owner/latest","sync.example.com"],
  ["https://evil.example.com/v27/events","sync.example.com"],
  ["https://sync.example.com:443/v27/events","sync.example.com"],
 ]){
   assert.throws(()=>validateV51ProposedCloudEndpoint(url,host));
 }
});
test("V51 requires 9 independent approvals but checkbox claims can never promote to production",()=>{
 const base={storeId:store,receiverUrl:"https://sync.example.org/v27/events",
  approvedHostname:"sync.example.org",evidence:{}};
 const report=inspectV51CloudCutover(base);
 assert.equal(report.missing.length,9);
 assert.equal(report.release_status,"NO_GO");
 assert.equal(report.network_contacted,false);
 assert.equal(report.cloud_db_modified,false);
 const verified=inspectV51CloudCutover({
   ...base,evidence:Object.fromEntries(report.missing.map(k=>[k,true]))});
 assert.equal(verified.all_checked,true);
 assert.equal(verified.release_status,"NO_GO");
 assert.equal(verified.scope,"sales_events_only");
 assert.ok(!JSON.stringify(verified).includes("password"));
});
test("V51 catalog protocol accepts safe integer IQD sales prices but no cost disclosures",()=>{
 assert.ok(validateV51Delta(price(1,0,11000)));
 assert.ok(!validateV51Delta({...price(1,0,11000),payload:
   {sale_price_minor:11000,purchase_price_minor:9000}}));
 assert.ok(!validateV51Delta(price(1,0,-1)));
 assert.ok(!validateV51Delta(price(1,0,1.25)));
 assert.ok(!validateV51Delta({...price(1,0,11000),store_id:"not-a-uuid"}));
 assert.ok(validateV51Delta({...price(1,0,11000),event_type:"catalog.product_upsert",
   source:"local_pos",payload:{name:"تەماتە",unit:"kg"}}));
 assert.ok(validateV51Delta({...price(1,0,11000),event_type:"stock.snapshot",
   source:"local_pos",payload:{stock_base_units:1200}}));
 assert.ok(!validateV51Delta({...price(1,0,11000),event_type:"stock.snapshot",
   source:"cloud_admin",payload:{stock_base_units:1200}}));
});
test("V51 reports stale versions, missing objects, conflicts and idempotent duplicates without writes",()=>{
 const initial=[{store_id:store,product_id:product,version:5}];
 const p1=price(1,5,11000);
 const p2=price(2,6,12000);
 const old=price(3,4,8000);
 const future=price(4,12,14000);
 const missing={...price(5,3,9999),product_id:"20000000-0000-0000-0000-000000000052"};
 const invalid={...price(6,7,100),store_id:other};
 const plan=planV51CatalogDryRun({
  storeId:store,localVersions:initial,
  deltas:[p1,p2,p1,{...p1,payload:{sale_price_minor:11001}},old,future,missing,invalid]
 });
 assert.deepEqual(plan.results.map(x=>x.status),[
  "REVIEW_ONLY_NOT_APPLIED","REVIEW_ONLY_NOT_APPLIED",
  "DUPLICATE_NO_ACTION","CONFLICTING_EVENT_ID","STALE_VERSION",
  "VERSION_GAP","MISSING_PRODUCT_VERSION","BLOCKED_INVALID_OR_FOREIGN"
 ]);
 assert.equal(plan.applied_count,0);
 assert.equal(plan.local_mutations,0);
 assert.equal(plan.cloud_mutations,0);
 assert.equal(plan.release_status,"NO_GO");
 assert.deepEqual(initial,[{store_id:store,product_id:product,version:5}]);
});
test("V51 disallows cross-store snapshots, duplicate local versions and huge dry run batches",()=>{
 assert.throws(()=>planV51CatalogDryRun({storeId:store,
  localVersions:[{store_id:other,product_id:product,version:0}],deltas:[]}));
 assert.throws(()=>planV51CatalogDryRun({storeId:store,
  localVersions:[{store_id:store,product_id:product,version:0},
   {store_id:store,product_id:product,version:0}],deltas:[]}));
 assert.throws(()=>planV51CatalogDryRun({storeId:store,localVersions:[],
   deltas:Array(1001).fill(price(1,0,200))}));
});
