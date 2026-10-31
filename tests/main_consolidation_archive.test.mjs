import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
test("Historical preview is standalone and cannot be confused with live React route",()=>{
 const src=readFileSync(resolve(root,"design/source-faithful-home-preview.html"),"utf8");
 const main=readFileSync(resolve(root,"src/App.tsx"),"utf8");
 assert.match(src,/<!doctype html>/i);
 assert.match(src,/source-faithful offline bundle/i);
 assert.doesNotMatch(main,/source-faithful-home-preview/);
 const audit=readFileSync(resolve(root,"docs/MAIN_BRANCH_CONSOLIDATION_20261030.md"),"utf8");
 const workspace=readFileSync(resolve(root,"DESIGN_WORKSPACE.md"),"utf8");
 assert.match(workspace,/UNLOCKED/);
 for(const pr of ["#2","#3","#4","#12"]) assert.ok(audit.includes(pr),"unmerged historical PR must be disclosed");
 assert.match(audit,/not.*production/i);
});
