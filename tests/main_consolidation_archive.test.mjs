import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const blob=path=>{
  const data=readFileSync(resolve(root,path));
  return createHash("sha1").update("blob "+data.length+"\0").update(data).digest("hex");
};
test("Historical owner Home file preserved exactly, not silently rewritten",()=>{
 assert.equal(blob("design/source-faithful-home-preview.html"),
 "de57472e89371d1b446a1eaddaf2c454f2654ace");
});
test("Current React owner-locked Home source remains untouched",()=>{
 assert.equal(blob("src/components/HomeScreen.tsx"),
 "ddadae3c316835c730ed1ef3ba9db4be92336912");
});
test("Historical preview is standalone and cannot be confused with live React route",()=>{
 const src=readFileSync(resolve(root,"design/source-faithful-home-preview.html"),"utf8");
 const main=readFileSync(resolve(root,"src/App.tsx"),"utf8");
 assert.match(src,/<!doctype html>/i);
 assert.match(src,/source-faithful offline bundle/i);
 assert.doesNotMatch(main,/source-faithful-home-preview/);
 const audit=readFileSync(resolve(root,"docs/MAIN_BRANCH_CONSOLIDATION_20261030.md"),"utf8");
 for(const pr of ["#2","#3","#4","#12"]) assert.ok(audit.includes(pr),"unmerged historical PR must be disclosed");
 assert.match(audit,/not.*production/i);
});
