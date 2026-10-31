import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import vm from "node:vm";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const config=read("config.js");
const app=read("src/context/AppContext.tsx");
const cashier=read("src/components/CashierPos.tsx");
const receipt=read("src/components/ThermalReceiptModal.tsx");
const home=readFileSync(resolve(root,"src/components/HomeScreen.tsx"));
const icon=readFileSync(resolve(root,"src/components/CardIcon.tsx"));
const gitBlob=buf=>createHash("sha1").update("blob "+buf.length+"\0").update(buf).digest("hex");

test("Default browser does not fabricate Supabase sign-in, stores, sync, or service workers",()=>{
 const writes=[];
 const genuine={createClient(){return {auth:"actual"};}};
 const win={supabase:genuine,RETAIL_DEMO_MODE:false,addEventListener(){writes.push("event")}};
 const storage={getItem(){writes.push("read");return null;},setItem(){writes.push("write");}};
 const navigator={serviceWorker:{register(){writes.push("worker");}}};
 const sandbox={window:win,navigator,localStorage:storage,
    fetch(){writes.push("fetch");},setInterval(){writes.push("interval");},
    CustomEvent:function(){}};
 vm.runInNewContext(config,sandbox,{timeout:1500,filename:"config.js"});
 assert.equal(win.supabase,genuine,"must not replace real Supabase SDK");
 assert.equal(win.RETAIL_CONFIG.offlineFirst,false,"local mock is not a verified production offline server");
 assert.deepEqual(writes,[],"normal browser load must not read/write local mock state or schedule network/sync");
});
test("Offline facade can run only under explicit disposable demo opt-in",()=>{
 assert.match(config,/window\.RETAIL_DEMO_MODE!==true\)return/);
 assert.match(config,/offlineFirst:window\.RETAIL_DEMO_MODE===true/);
 assert.match(config,/const DEFAULT_OWNER_ID=/,"legacy test fixture should remain recognizable as fake");
 assert.match(config,/const offlineSupabaseFacade=/);
});
test("React cashier is visibly marked as browser-only demo, including keyboard checkout",()=>{
 assert.match(cashier,/role="status" aria-label="دۆخی تاقیکردنەوەی کاشێر"/);
 assert.match(cashier,/فرۆشتنی ڕاستەقینە نییە/);
 assert.match(app,/const STORAGE_KEY = 'kanichnar_retail_pos_v18'/);
 assert.ok(app.includes('const receiptNum = `DEMO-RCP-'), 'receipt IDs must be unmistakably demo-only');
 assert.match(app,/فرۆشتنی تاقیکردنەوە/);
});
test("Every printable React thermal receipt is marked not a fiscal sale",()=>{
 assert.match(receipt,/data-demo-watermark="true"/);
 assert.match(receipt,/بەڵگەی فرۆشتنی ڕاستەقینە نییە/);
 assert.match(receipt,/پسووڵەی تاقیکردنەوە/);
 assert.match(receipt,/window\.print\(\)/);
});
test("Approved React Home repair and immutable original reference remain source-locked",()=>{
 assert.equal(gitBlob(home),"08f241a5b650bff5fbeda73416b65db3a209177d","repair is frozen to its reviewed Home implementation");
 // Existing owner-locked legacy Home source is also unchanged by this patch.
 assert.match(read("tests/owner_locked_home_sha.test.mjs"),/c364336a84b2c92cf121d7682671b309eccd4b05/);
 assert.match(icon.toString("utf8"),/MODULE_SPECS/);
});
