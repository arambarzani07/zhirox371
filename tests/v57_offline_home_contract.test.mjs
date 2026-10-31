import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFileSync(resolve(root,name),"utf8");

// The owner revoked the visual design freeze. This suite safeguards the local
// cashier boundary, NOT card counts, screen geometry, CSS hashes or appearance.
test("V57 remains opt-in and isolated from the browser Demo",()=>{
 const main=read("src/main.tsx");
 assert.match(main,/import\.meta\.env\.PROD&&import\.meta\.env\.VITE_V36_ISOLATED_LAN_PILOT==="true"/);
 assert.match(main,/if\(import\.meta\.env\.VITE_V57_ISOLATED_DESKTOP_SHELL==="true"\)/);
 assert.match(main,/import\('\.\/components\/OfflineDesktopShellV57'\)/);
 const shell=read("src/components/OfflineDesktopShellV57.tsx");
 assert.match(shell,/const allowed=/);
 assert.match(shell,/moduleId===0/);
 assert.match(shell,/iconName==="barcode-scan"/);
 assert.match(shell,/iconName==="receipt"/);
 assert.match(shell,/disabled=\{!enabled\}/);
 assert.doesNotMatch(shell,/V57_APPROVED_MODULE_COUNT|V57_APPROVED_SUBMODULE_COUNT|v57_locked_home_structure_mismatch/);
 for(const disallowed of ["import {AppProvider","import {AppContext","from \"./CashierPos\"","localStorage","Supabase","DEMO-RCP","window.location","window.open"])
  assert.ok(!shell.includes(disallowed),disallowed);
 assert.match(read("src/localCashierModeV32.ts"),/import\.meta\.env\.DEV/);
 assert.match(read("vite.config.ts"),/an official cashier release is blocked/);
});

test("Owner-authorized new design workspace has no old visual freeze",()=>{
 const workspace=read("DESIGN_WORKSPACE.md");
 assert.match(workspace,/Status: UNLOCKED/);
 assert.match(workspace,/no design freeze/i);
});
