import test from "node:test";
import assert from "node:assert/strict";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {assessReleaseV35,evaluateReleaseV35} from "./release-readiness-v35.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
test("current project MUST report NO_GO, including Demo financial surface and printer",async()=>{
 const report=await assessReleaseV35(root);
 assert.equal(report.status,"NO_GO");
 const ids=report.blockers.map(x=>x.id);
 for(const id of ["react-demo-route","local-cashier-dev-only","official-build-blocked",
  "print-queue-only","windows-device-certification","multi-pc-outage-test",
  "recovery-drill","finance-permissions","local-security-review"])
  assert.ok(ids.includes(id),"Missing blocker: "+id);
});
test("manual production acceptance can never be inferred solely from changed code",()=>{
 const report=evaluateReleaseV35({app:"",localMode:"",vite:"",printApi:""});
 assert.equal(report.status,"NO_GO");
 assert.ok(report.blockers.some(x=>x.id==="windows-device-certification"));
});
