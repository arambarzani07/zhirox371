import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");

test("V32 primary cashier uses explicit double opt-in and never renders Demo POS",()=>{
 const m=read("src/localCashierModeV32.ts"),a=read("src/App.tsx");
 const page=read("src/components/LocalCashierV32.tsx");
 assert.match(m,/pilotEnabled&&import\.meta\.env\.DEV&&/);
 assert.match(m,/VITE_V32_LOCAL_CASHIER==="true"/);
 assert.match(a,/localCashierV32 \? <LocalCashierV32 \/> : <CashierPos \/>/);
 assert.match(a,/!\(localCashierV32 && currentView === 'pos'\)/);
 assert.doesNotMatch(page,/useApp|completeCheckout|setReceipts|localStorage/);
 assert.match(page,/<LocalPostgresPilotV24 standalone\/>/);
});
test("V32 session-specific receipts never fall back to Demo after an offline failure",()=>{
 const client=read("src/localCashierHistoryV32.ts"),ui=read("src/components/LocalPostgresPilotV24.tsx");
 const server=read("offline/local-cashier-server-v32.mjs");
 const vite=read("vite.config.ts");
 assert.match(client,/credentials:"omit"/);
 assert.match(client,/\/api\/local\/v32\/receipts\?limit=20/);
 assert.doesNotMatch(client,/useApp|supabase|localStorage/);
 assert.match(ui,/getLocalIntentStatusV32\(session\.token/);
 assert.match(ui,/status\?\.state==="committed"/);
 assert.match(ui,/sessionStorage\.removeItem\(pendingKey\(store\)\)/);
 assert.match(ui,/standalone&&<details className="pos-clean__history" open=\{Boolean\(last\)\}/);
 assert.match(ui,/<section aria-label="مێژووی پسووڵەی ناوخۆیی"/);
 assert.doesNotMatch(server,/supabase|DEMO-RCP|localhost:3000/);
 assert.match(server,/cashier_id=\$2::uuid/);
 assert.match(server,/store_id=\$1::uuid/);
 assert.match(server,/server.listen\(3308,"127\.0\.0\.1"\)/);
 assert.match(vite,/target:localCashier\?'http:\/\/127\.0\.0\.1:3308':'http:\/\/127\.0\.0\.1:3307'/);
});
