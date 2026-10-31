// V77: local staging and atomic pointer policy for FUTURE signed Windows releases.
// No network, no production activation, no user-data/database modification.
// A cryptographic signature and independent release authorization are prerequisites.
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir,rename,rm,stat} from "node:fs/promises";
import {resolve,join,dirname} from "node:path";
import {randomUUID} from "node:crypto";

export function validateCandidateManifest(manifest,{allowUnsignedLab=false}={}){
 if(!manifest||typeof manifest!=="object"||Array.isArray(manifest)||
    manifest.format!=="zhirox-v77-release-v1"||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.version||"")||
    !/^[a-f0-9]{64}$/.test(manifest.sha256||"")||
    typeof manifest.file!=="string"||
    !/^ZHIROX371-[a-zA-Z0-9.-]+\.exe$/.test(manifest.file)||
    manifest.file.includes(".."))
   throw Error("v77_invalid_release_manifest");
 if(!allowUnsignedLab)throw Error("v77_production_requires_signed_release_and_manual_certification");
 if(manifest.channel!=="isolated-lab"||manifest.production_ready!==false)
   throw Error("v77_release_is_not_disposable_lab");
 return manifest;
}
export async function stageLabCandidate({candidatePath,manifest,installRoot,
  authorizedTestRoot,afterStage=()=>{}}){
 validateCandidateManifest(manifest,{allowUnsignedLab:true});
 if(typeof installRoot!=="string"||typeof authorizedTestRoot!=="string"||
    resolve(installRoot)!==resolve(authorizedTestRoot)||
    !/(^|[\\/])zhirox[-_]disposable[-_]test($|[\\/])/i.test(resolve(installRoot)))
   throw Error("v77_only_preapproved_disposable_test_root");
 if(typeof candidatePath!=="string"||candidatePath!==resolve(candidatePath)||
    candidatePath.endsWith(".lnk"))throw Error("v77_invalid_candidate_path");
 const data=await readFile(candidatePath);
 if(data.length<64||data.length>150*1024*1024||
   createHash("sha256").update(data).digest("hex")!==manifest.sha256)
   throw Error("v77_candidate_integrity_failed");
 if(data[0]!==0x4d||data[1]!==0x5a)throw Error("v77_candidate_not_windows_exe");
 const base=resolve(installRoot);
 const current=join(base,"current.json"),previous=join(base,"previous.json");
 const versions=join(base,"versions");
 await mkdir(versions,{recursive:true});
 const target=join(versions,manifest.version+"-"+manifest.sha256.slice(0,12));
 await mkdir(target,{recursive:true});
 const stage=join(target,manifest.file);
 try{
  await writeFile(stage,data,{flag:"wx"});
 }catch(e){if(e.code!=="EEXIST")throw e;
  const existing=await readFile(stage);
  if(createHash("sha256").update(existing).digest("hex")!==manifest.sha256)
   throw Error("v77_existing_stage_hash_mismatch");
 }
 await afterStage({stagedPath:stage}); // health checks MUST complete before activation
 let old=null;
 try{old=JSON.parse(await readFile(current,"utf8"));}catch(e){
   if(e.code!=="ENOENT")throw e;
 }
 const pointer={format:"zhirox-v77-active-lab-v1",version:manifest.version,
   file:stage,sha256:manifest.sha256,channel:"isolated-lab"};
 const temp=join(base,"current."+randomUUID()+".tmp");
 // previous state stays available for a single one-step explicit rollback.
 if(old){
  const pre=join(base,"previous."+randomUUID()+".tmp");
  await writeFile(pre,JSON.stringify(old));
  await rename(pre,previous);
 }
 await writeFile(temp,JSON.stringify(pointer));
 await rename(temp,current);
 return {active:pointer,previous:old,lab_only:true};
}
export async function rollbackLab({installRoot,authorizedTestRoot}){
 const base=resolve(installRoot);
 if(base!==resolve(authorizedTestRoot)||
    !/(^|[\\/])zhirox[-_]disposable[-_]test($|[\\/])/i.test(base))
   throw Error("v77_rollback_only_isolated_test_root");
 const previous=JSON.parse(await readFile(join(base,"previous.json"),"utf8"));
 if(previous.format!=="zhirox-v77-active-lab-v1"||
   previous.channel!=="isolated-lab"||
   !previous.file.startsWith(join(base,"versions")+String.fromCharCode(47))&&
   !previous.file.startsWith(join(base,"versions")+String.fromCharCode(92)))
   throw Error("v77_invalid_rollback_pointer");
 const bytes=await readFile(previous.file);
 if(createHash("sha256").update(bytes).digest("hex")!==previous.sha256)
   throw Error("v77_rollback_hash_mismatch");
 const temp=join(base,"current."+randomUUID()+".tmp");
 await writeFile(temp,JSON.stringify(previous));
 await rename(temp,join(base,"current.json"));
 await rm(join(base,"previous.json"));
 return {active:previous,lab_only:true};
}
