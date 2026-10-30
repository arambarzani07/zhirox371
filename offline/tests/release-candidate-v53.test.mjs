import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from "node:fs/promises";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {inspectV53ReleaseCandidate} from "../release-candidate-preflight-v53.mjs";

const hash=b=>createHash("sha256").update(b).digest("hex");
const files=[
 "node.exe","offline/lan-gateway-v33.mjs","offline/autosync-v49.mjs",
 "windows/Start-ZHIROX-Trial.ps1","windows/Start-ZHIROX-AutoSync-TRIAL.ps1",
 "node_modules/pg/package.json"
];
async function setup(fn){
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v53-preflight-"));
 try{
   for(const path of files){
     await mkdir(dirname(join(dir,path)),{recursive:true});
     await writeFile(join(dir,path),"test-only-file-"+path);
   }
   const index=Buffer.from("<!doctype html><html><body>isolated</body></html>");
   const js=Buffer.from("const x='data-local-v36-pilot'");
   const css=Buffer.from("body{direction:rtl}");
   for(const [name,body] of [["index.html",index],["assets/pilot.js",js],["assets/pilot.css",css]]){
     await mkdir(dirname(join(dir,"dist",name)),{recursive:true});
     await writeFile(join(dir,"dist",name),body);
   }
   await writeFile(join(dir,"dist/pilot-manifest-v36.json"),
     JSON.stringify({format:"zhirox-v36-isolated-pilot-v1",warning:"TEST ONLY",
       files:{"/index.html":hash(index),"/assets/pilot.js":hash(js),
         "/assets/pilot.css":hash(css)}}));
   await fn(dir);
 }finally{await rm(dir,{recursive:true,force:true});}
}
test("V53 clean synthetic Windows x64 installation passes integrity but always NO-GO",async()=>{
 await setup(async dir=>{
   const result=await inspectV53ReleaseCandidate(dir,{platform:"win32",arch:"x64"});
   assert.equal(result.installed_artifact_integrity,"PASS");
   assert.equal(result.failed_checks.length,0);
   assert.equal(result.manifest_asset_count,3);
   assert.equal(result.release_status,"NO_GO");
   assert.equal(result.actual_printer_certified,false);
   assert.equal(result.cloud_production_sync_certified,false);
 });
});
test("V53 cannot convert a valid install on Linux/arm64 into Windows certification",async()=>{
 await setup(async dir=>{
   for(const opt of [{platform:"linux",arch:"x64"},{platform:"win32",arch:"arm64"}]){
     const result=await inspectV53ReleaseCandidate(dir,opt);
     assert.equal(result.installed_artifact_integrity,"FAIL");
     assert.ok(result.failed_checks.includes("windows_x64_host"));
     assert.equal(result.status,"NO_GO");
   }
 });
});
test("V53 rejects changed JS/CSS, deleted runtime and extra CSV",async()=>{
 await setup(async dir=>{
   await writeFile(join(dir,"dist/assets/pilot.js"),"tampered payload");
   let result=await inspectV53ReleaseCandidate(dir,{platform:"win32",arch:"x64"});
   assert.ok(result.failed_checks.includes("manifested_static_assets_sha256"));
   await writeFile(join(dir,"dist/assets/pilot.js"),"const x='data-local-v36-pilot'");
   await writeFile(join(dir,"dist/assets/customer.csv"),"DO NOT SHIP REAL DATA");
   result=await inspectV53ReleaseCandidate(dir,{platform:"win32",arch:"x64"});
   assert.ok(result.failed_checks.includes("manifested_static_assets_sha256"));
   assert.equal(result.release_status,"NO_GO");
 });
});
test("V53 rejects symlinked files even when target contents match SHA",async t=>{
 await setup(async dir=>{
   const path=join(dir,"dist/assets/pilot.js");
   const target=join(dir,"pilot-copy.js");
   await writeFile(target,await readFile(path));
   await rm(path);
   try{await symlink(target,path);}catch{
     t.skip("This operating system restricts symlinks in the disposable test folder");
     return;
   }
   const result=await inspectV53ReleaseCandidate(dir,{platform:"win32",arch:"x64"});
   assert.ok(result.failed_checks.includes("manifested_static_assets_sha256"));
 });
});
test("V53 rejects manifest path traversal even if a hash is provided",async()=>{
 await setup(async dir=>{
   const p=join(dir,"dist/pilot-manifest-v36.json");
   const manifest=JSON.parse(await readFile(p,"utf8"));
   manifest.files["/../../secrets.js"]=hash(Buffer.from("fake"));
   await writeFile(p,JSON.stringify(manifest));
   const result=await inspectV53ReleaseCandidate(dir,{platform:"win32",arch:"x64"});
   assert.ok(result.failed_checks.includes("manifested_static_assets_sha256"));
 });
});
