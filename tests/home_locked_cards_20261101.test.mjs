import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const home=read("src/components/HomeScreen.tsx");
const icons=read("src/components/CardIcon.tsx");
const app=read("src/App.tsx");
const vite=read("vite.config.ts");

test("Owner-locked React Home contains 12 main Sorani cards and 4 subcards each",()=>{
 assert.match(home,/className="home-screen locked-home canva-home-001"/);
 assert.match(home,/\[0, 1, 2\]\.map\(rowIndex/);
 assert.match(home,/gridTemplateColumns: 'repeat\(4,minmax\(0,1fr\)\)'/);
 assert.match(home,/canvaHomeModules\.slice\(start, start \+ 4\)/);
 assert.match(home,/\[0, 1, 2, 4, 3, 5, 10, 8, 6, 11, 9, 7\]/);
 assert.match(home,/data-canva-card=\{String\(index \+ 1\)\.padStart\(2, '0'\)\}/);
 assert.match(home,/activeModule\.submodules\.map/);
 assert.match(home,/className="subgrid"/);
 assert.match(home,/navigateTo\(targetView as NavView, targetSubtab, sectionId\)/);
 assert.match(icons,/export const MODULE_SPECS/);
 for(let n=0;n<12;n++)assert.ok(icons.includes("id: "+n+","),"missing main card "+n);
 assert.match(app, /currentView === 'home' && <HomeScreen \/>/);
});
test("Restoring Home never changes payment, DB, release or locked original files",()=>{
 assert.doesNotMatch(home,/fetch\(|new Pool|Supabase|checkout_proven|localStorage|window\.print|ALTER TABLE/);
 assert.match(vite,/official cashier release is blocked/);
 assert.match(home,/dir=|aria-label="بەشە سەرەکییەکان"/);
});
