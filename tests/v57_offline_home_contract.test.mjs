import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFileSync(resolve(root,name),"utf8");
const sha1blob=b=>createHash("sha1").update("blob "+b.length+"\0").update(b).digest("hex");

test("V57 retains inherited React index and archived original Home unmodified",()=>{
 const hashes={
 "index.html":"ba44208524868a80297790edba872ec4745622df",
 "design/source-faithful-home-preview.html":"de57472e89371d1b446a1eaddaf2c454f2654ace",
 "ui-global.css":"14474a71940bfa79a25173623bcfbaf5387d3660",
 "ui-fixed-pc.css":"e55fc2ddbec2aa0e0e19d97c568592a6e6501a0c",
 "card-icons.css":"1c774c9d6f21221fb0972d88d3d4f303707f77a1",
 "card-icons.js":"b1b8f5b03c6585c7fd38fd91a22519fae4c7d5c5",
 "src/components/HomeScreen.tsx":"08f241a5b650bff5fbeda73416b65db3a209177d"
 };
 for(const [path,want] of Object.entries(hashes))
   assert.equal(sha1blob(readFileSync(resolve(root,path))),want,path);
});
test("V57 is opt-in inside separate production-mode isolated pilot, not Demo preview",()=>{
 const main=read("src/main.tsx");
 assert.match(main,/import\.meta\.env\.PROD&&import\.meta\.env\.VITE_V36_ISOLATED_LAN_PILOT==="true"/);
 assert.match(main,/if\(import\.meta\.env\.VITE_V57_ISOLATED_DESKTOP_SHELL==="true"\)/);
 assert.match(main,/import\('\.\/components\/OfflineDesktopShellV57'\)/);
 const shell=read("src/components/OfflineDesktopShellV57.tsx");
 assert.match(shell,/MODULE_SPECS\.length!==V57_APPROVED_MODULE_COUNT/);
 assert.match(shell,/V57_APPROVED_MODULE_COUNT=12/);
 assert.match(shell,/V57_APPROVED_SUBMODULE_COUNT=48/);
 assert.match(shell,/module===0&&\(sub===0\|\|sub===1\)/);
 assert.match(shell,/disabled=\{!enabled\}/);
 for(const disallowed of ["import {AppProvider","import {AppContext","from \"./CashierPos\"","localStorage","Supabase","DEMO-RCP","window.location","window.open"])
   assert.ok(!shell.includes(disallowed),disallowed);
 assert.match(read("src/localCashierModeV32.ts"),/import\.meta\.env\.DEV/);
 assert.match(read("vite.config.ts"),/an official cashier release is blocked/);
});
test("V57 preserves 3x4 card alignment, fixed desktop and a safe selected-row drawer",()=>{
 const css=read("src/offlineDesktopShellV57.css");
 assert.match(css,/min-width:1020px/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/position:absolute;top:calc\(100% \+ 4px\)/);
 assert.match(css,/75px/);
 assert.match(css,/#172b45/);
 assert.match(css,/@media print/);
});


test("V57 uses precisely all 12 approved Sorani card titles and 48 subcard labels in original order",()=>{
 const doc=read("DESIGN_LOCK.md");
 const source=read("src/components/CardIcon.tsx");
 const specs=source.slice(source.indexOf("export const MODULE_SPECS"),source.indexOf("interface CardIconProps"));
 const expected=[...doc.matchAll(/^\|\s*(\d{2})\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/gm)]
   .map(m=>({title:m[2].trim(),subs:m[3].split("؛").map(v=>v.trim())}));
 const titles=[...specs.matchAll(/^\s*title:\s*"([^"]+)"/gm)].map(m=>m[1]);
 const labels=[...specs.matchAll(/\{\s*label:\s*"([^"]+)"/gm)].map(m=>m[1]);
 assert.equal(expected.length,12);
 assert.equal(titles.length,12);
 assert.equal(labels.length,48);
 for(let i=0;i<12;i++){
   assert.equal(titles[i],expected[i].title,"module "+(i+1));
   assert.deepEqual(labels.slice(i*4,(i+1)*4),expected[i].subs,"submodules of "+titles[i]);
 }
});
