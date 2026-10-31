import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {validateCandidateManifest,stageLabCandidate,rollbackLab} from "../safe-update-v77.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
test("V77 cannot certify production, raw URL or wrong channel",()=>{
 const x={format:"zhirox-v77-release-v1",version:"1.2.3",file:"ZHIROX371-1.2.3.exe",
  sha256:"a".repeat(64),channel:"isolated-lab",production_ready:false};
 assert.throws(()=>validateCandidateManifest(x),/signed_release/);
 assert.throws(()=>validateCandidateManifest({...x,channel:"production"},{allowUnsignedLab:true}));
 assert.throws(()=>validateCandidateManifest({...x,file:"../bad.exe"},{allowUnsignedLab:true}));
});
test("V77 stages two real MZ binaries, does one-step rollback, refuses tampering and unsafe root",async()=>{
 const base=await mkdtemp(join(tmpdir(),"zhirox-v77-"));
 const root=join(base,"zhirox-disposable-test");
 const a=join(base,"one.exe"),b=join(base,"two.exe");
 const x=Buffer.concat([Buffer.from("MZ"),Buffer.alloc(1024,0x41)]);
 const y=Buffer.concat([Buffer.from("MZ"),Buffer.alloc(1024,0x42)]);
 const manifest=(version,file,bytes)=>({format:"zhirox-v77-release-v1",
   version,file,sha256:sha(bytes),channel:"isolated-lab",production_ready:false});
 try{
  await writeFile(a,x);await writeFile(b,y);
  const m1=manifest("1.0.0","ZHIROX371-1.0.0.exe",x);
  await assert.rejects(stageLabCandidate({candidatePath:a,manifest:m1,installRoot:base,authorizedTestRoot:base}));
  await stageLabCandidate({candidatePath:a,manifest:m1,installRoot:root,authorizedTestRoot:root});
  const active1=JSON.parse(await readFile(join(root,"current.json")));
  assert.equal(active1.version,"1.0.0");
  const m2=manifest("1.0.1","ZHIROX371-1.0.1.exe",y);
  await assert.rejects(stageLabCandidate({candidatePath:b,manifest:m2,installRoot:root,authorizedTestRoot:root,
    afterStage:()=>{throw Error("health_failure")}}),/health_failure/);
  assert.equal(JSON.parse(await readFile(join(root,"current.json"))).version,"1.0.0");
  await stageLabCandidate({candidatePath:b,manifest:m2,installRoot:root,authorizedTestRoot:root});
  assert.equal(JSON.parse(await readFile(join(root,"current.json"))).version,"1.0.1");
  await rollbackLab({installRoot:root,authorizedTestRoot:root});
  assert.equal(JSON.parse(await readFile(join(root,"current.json"))).version,"1.0.0");
  await assert.rejects(rollbackLab({installRoot:root,authorizedTestRoot:root}),{code:"ENOENT"});
  await assert.rejects(stageLabCandidate({candidatePath:b,
     manifest:manifest("1.0.2","ZHIROX371-1.0.2.exe",x),
     installRoot:root,authorizedTestRoot:root}),/integrity_failed/);
 }finally{await rm(base,{recursive:true,force:true})}
});
