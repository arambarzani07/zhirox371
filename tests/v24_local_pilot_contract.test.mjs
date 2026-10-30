import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const client=read("src/localPilotV24.ts");
const ui=read("src/components/LocalPostgresPilotV24.tsx");
const config=read("vite.config.ts");
const cashier=read("src/components/CashierPos.tsx");
const home=read("src/components/HomeScreen.tsx");
const server=read("offline/local-pos-api-v3.mjs");

test("Pilot cannot be enabled in production build or externally accessed by Vite",()=>{
 assert.match(client,/import\.meta\.env\.DEV&&import\.meta\.env\.VITE_ENABLE_LOCAL_PILOT==="true"/);
 assert.match(config,/pilot\?'127\.0\.0\.1':'0\.0\.0\.0'/);
 assert.match(config,/target:localCashier\?'http:\/\/127\.0\.0\.1:3308':'http:\/\/127\.0\.0\.1:3307'/);
 assert.match(config,/\.\.\.\(pilot\?\{proxy/);
 assert.match(cashier,/\{pilotEnabled && <LocalPostgresPilotV24/);
 assert.match(home,/MODULE_SPECS/);
});

test("Browser never receives PostgreSQL credentials or an arbitrary API target",()=>{
 assert.match(client,/fetch\(path,/);
 assert.match(client,/credentials:"omit"/);
 assert.match(client,/!path\.startsWith\("\/api\/local\/v"\)/);
 assert.doesNotMatch(client,/postgres:\/\/|http:\/\/[a-z0-9.-]+:\d+|supabase\.from\(/i);
 assert.match(ui,/sessionStorage\.setItem\(pendingKey\(store\),JSON\.stringify\(request\)\)/);
 assert.doesNotMatch(ui,/localStorage\.setItem|sessionStorage\.setItem\([^)]*token/);
});

test("Local API authorizes the caller and checkout SQL is server scoped",()=>{
 assert.match(server,/auth\.authorize\(match\[1\]\)/);
 assert.match(server,/caller_must_not_supply_identity/);
 assert.match(server,/\[principal\.store_id, principal\.user_id, input\.request_id, JSON\.stringify\(input\.lines\)\]/);
 assert.ok(client.includes('"/api/local/v26/checkout"'));
 assert.ok(client.includes('"/api/local/v31/prepare"'));
 assert.ok(client.includes('"/api/local/v31/commit"'));
 assert.ok(client.includes('"/api/local/v26/scan?code="'));
 assert.match(client,/Number\.isSafeInteger\(line\.qty\)/);
 assert.match(server,/checkout_packs_scale_v26/);
});

test("An ambiguous checkout freezes basket, preserves UUID and offers replay only",()=>{
 assert.match(ui,/sessionStorage\.setItem\(pendingKey\(store\),JSON\.stringify\(request\)\)/);
 assert.match(ui,/pending\?"دووبارە ناردنی هەمان داواکاری"/);
 assert.match(ui,/setPending\(request\)/);
 assert.match(ui,/if\(pending\)request=pending/);
 assert.match(ui,/recoverDurableLocal\(session\.token\)/);
 assert.match(ui,/prepareDurableLocal\(token,request\)/);
 assert.match(ui,/commitDurableLocal\(token,request\.request_id\)/);
 assert.match(ui,/x\.item\.sale_mode==="scale"/);
 assert.match(ui,/crypto\.randomUUID\(\),total\)/);
 assert.match(client,/expected_total_minor: number/);
 assert.match(ui,/sessionStorage\.removeItem\(pendingKey\(store\)\)/);
 assert.match(ui,/!!pending/);
 assert.match(ui,/داشکاندن، قەرز/);
});

test("Demo cashier, QR/thermal receipt, and old React financial paths are unchanged",()=>{
 assert.match(cashier,/فرۆشتنی ڕاستەقینە نییە/);
 assert.match(read("src/context/AppContext.tsx"),/DEMO-RCP-/);
 assert.match(read("src/components/ThermalReceiptModal.tsx"),/data-demo-watermark="true"/);
 assert.doesNotMatch(ui,/setProducts\(|setReceipts\(|setCurrentShift\(/);
});
