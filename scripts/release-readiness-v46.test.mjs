import test from "node:test";
import assert from "node:assert/strict";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {assessReleaseV46,fieldBlockers,labRequirements} from "./release-readiness-v46.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
test("V46 records precise CI files but NEVER mislabels simulated acceptance as real field approval",async()=>{
 const result=await assessReleaseV46(root);
 assert.equal(result.phase,"V46");
 assert.equal(result.status,"NO_GO");
 assert.equal(result.mode.includes("disposable PostgreSQL"),true);
 assert.ok(result.lab_files.every(x=>x.present));
 assert.ok(result.repo_configuration.official_vite_build_refused);
 assert.ok(result.repo_configuration.react_demo_still_reachable);
 const blockers=new Set(result.blockers.map(x=>x.id));
 for(const name of ["physical-printer","lan-isolation","real-backup-restore",
   "live-db-least-privilege","provider-mixed-tender","live-system-go-no-go"])
   assert.ok(blockers.has(name),name+" cannot disappear because CI passed");
});
test("No demo URL, fake release flag or hardware environment variable can assert GO-LIVE",async()=>{
 for(const fake of ["GO","true","official","production"]){
  process.env.ZHIROX_FORCE_GO_LIVE=fake;
  process.env.VITE_ZHIROX_RELEASE_MODE=fake;
  const status=await assessReleaseV46(root);
  assert.equal(status.status,"NO_GO");
 }
 delete process.env.ZHIROX_FORCE_GO_LIVE;
 delete process.env.VITE_ZHIROX_RELEASE_MODE;
 assert.ok(fieldBlockers.length>=8);
 assert.ok(labRequirements.length>=7);
});
