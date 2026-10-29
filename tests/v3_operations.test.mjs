import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=filename=>readFileSync(resolve(root,filename),"utf8");
const home=read("index.html");
const cash=read("operations.html");
const logic=read("operations.js");
const contract=read("db/V3_CONTRACT.md");
test("locked Home desktop dimensions and 3x4 grid remain unchanged",()=>{
 assert.match(home,/\.desktop\{min-width:1020px/);
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
 assert.match(home,/Math\.floor\(state\.open\/4\)/);
 const cards=home.slice(home.indexOf("const specs=["),home.indexOf("];",home.indexOf("const specs=["))+2);
 assert.equal((cards.match(/^\["[^"\n]+","#[0-9a-fA-F]{6}"/gm)||[]).length,12);
});
test("Home links to live feature workspaces but includes no new banner",()=>{
 assert.match(home,/workspace\.html\?view=/);
 assert.match(home,/operations\.html\?view=/);
 assert.doesNotMatch(home,/DESIGN PREVIEW|MOCK DATA|SYSTEM ONLINE/i);
});
test("desktop operations UI exposes five permission-dependent tabs",()=>{
 for(const tab of ["cash","stock","staff","audit","receipts"])
   assert.match(cash,new RegExp('data-tab="'+tab+'"'));
 assert.match(cash,/min-width:1020px/);
 assert.match(cash,/<html lang="ckb" dir="rtl">/);
});
test("cash operation prices come from loaded catalog and checkout uses RPC",()=>{
 assert.match(logic,/\.from\("retail_products"\)/);
 assert.match(logic,/\.from\("retail_barcodes"\)/);
 assert.match(logic,/\.from\("retail_stock_balances"\)/);
 assert.match(logic,/retail_checkout_cash/);
 assert.match(logic,/retail_checkout_packs_v16/);
 assert.match(logic,/requestId=crypto\.randomUUID\(\)/);
 assert.match(logic,/pendingCheckout/);
 assert.doesNotMatch(logic,/\.from\("retail_sales"\)\.insert/);
});
test("role permissions and audit read from Supabase",()=>{
 assert.match(logic,/\.from\("retail_memberships"\)/);
 assert.match(logic,/\.rpc\("retail_assign_staff"/);
 assert.match(logic,/retail_receive_packs_v17/);
 assert.match(logic,/retail_receive_mixed_v171/);
 assert.doesNotMatch(logic,/\.rpc\("retail_receive_stock"/);
 assert.match(logic,/\.from\("retail_audit_events"\)/);
 assert.match(logic,/role==="owner"/);
});
test("client scripts parse and contract records important limitations",()=>{
 assert.doesNotThrow(()=>new Function(logic));
 assert.match(contract,/not approved for production use/i);
 assert.match(contract,/whole-unit quantity only/);
 assert.match(contract,/concurrent checkout/i);
});
