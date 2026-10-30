// V53: read-only Windows Release Candidate preflight. It never promotes to GO-LIVE.
// No market DB, cloud calls, credentials or hardware writes are performed.
import {createHash} from "node:crypto";
import {readFile,lstat,readdir,realpath} from "node:fs/promises";
import {dirname,join,relative,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";

const HASH=/^[a-f0-9]{64}$/;
const SAFE_ASSET=/^\/assets\/[A-Za-z0-9._-]+\.(?:js|css)$/;
const required=Object.freeze([
 "node.exe","offline/lan-gateway-v33.mjs","offline/autosync-v49.mjs",
 "windows/Start-ZHIROX-Trial.ps1","windows/Start-ZHIROX-AutoSync-TRIAL.ps1",
 "offline/windows-print-dispatch-v54.mjs","windows/Start-ZHIROX-Print-V54.ps1",
 "windows/Spool-ZHIROX-Receipt-V54.ps1",
 "node_modules/pg/package.json","dist/index.html","dist/pilot-manifest-v36.json"
]);

const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
async function secureRead(root,rel){
 const base=resolve(root),path=resolve(base,rel);
 const tail=relative(base,path);
 if(tail.startsWith(".."+sep)||tail===".."||tail==="")throw Error("outside_root_or_missing_file");
 // Every parent path is checked, not just the final file; reject junction-like
 // symlink escapes even when the final file looks ordinary.
 let cur=base;
 for(const segment of tail.split(sep)){
   cur=join(cur,segment);
   const s=await lstat(cur);
   if(s.isSymbolicLink())throw Error("symlink_not_allowed");
 }
 const stat=await lstat(path);
 if(!stat.isFile()||stat.size>150*1024*1024)throw Error("unsafe_rc_file");
 const [physicalRoot,physicalFile]=await Promise.all([realpath(base),realpath(path)]);
 const physicalTail=relative(physicalRoot,physicalFile);
 if(physicalTail.startsWith(".."+sep)||physicalTail===".."||
    physicalTail===""||physicalTail.startsWith(sep))
   throw Error("rc_path_escape");
 // Canonical Windows drive and pathname casing can differ even for genuine
 // regular files. Verify containment, not character-for-character casing.
 return readFile(path);
}
async function safeCheck(root,name,validator=null){
 try{
   const data=await secureRead(root,name);
   return {item:name,pass:validator?Boolean(validator(data)):data.length>0};
 }catch{return {item:name,pass:false};}
}
export async function inspectV53ReleaseCandidate(root,{platform=process.platform,arch=process.arch}={}){
 if(typeof root!=="string"||!root)throw Error("invalid_install_directory");
 const dir=resolve(root),checks=[];
 checks.push({item:"windows_x64_host",pass:platform==="win32"&&arch==="x64"});
 for(const file of required)checks.push(await safeCheck(dir,file));
 let manifest=null,assets=[];
 try{
   const blob=await secureRead(dir,"dist/pilot-manifest-v36.json");
   manifest=JSON.parse(blob.toString("utf8"));
   if(manifest.format!=="zhirox-v36-isolated-pilot-v1"||
      !manifest.files||typeof manifest.files!=="object"||
      Array.isArray(manifest.files)||Object.keys(manifest.files).length<3||
      !Object.hasOwn(manifest.files,"/index.html"))
      throw Error("invalid_manifest");
   const keys=Object.keys(manifest.files);
   if(keys.some(key=>key!=="/index.html"&&!SAFE_ASSET.test(key))||
      keys.some(key=>!HASH.test(manifest.files[key]))||
      !keys.some(key=>key.endsWith(".js"))||
      !keys.some(key=>key.endsWith(".css")))throw Error("unexpected_manifest_paths");
   for(const key of keys){
     const contents=await secureRead(dir,"dist"+key);
     if(sha(contents)!==manifest.files[key])throw Error("asset_hash_mismatch");
   }
   assets=await readdir(join(dir,"dist/assets"));
   if(assets.some(name=>!keys.includes("/assets/"+name)))throw Error("extra_unlisted_asset");
   checks.push({item:"manifested_static_assets_sha256",pass:true});
 }catch{
   checks.push({item:"manifested_static_assets_sha256",pass:false});
 }
 const hardFailed=checks.filter(x=>!x.pass).map(x=>x.item);
 return {
   project:"ZHIROX371",phase:"V53",kind:"WINDOWS_RELEASE_CANDIDATE_PREFLIGHT",
   installed_artifact_integrity:hardFailed.length===0?"PASS":"FAIL",
   status:"NO_GO",release_status:"NO_GO",
   offline_sale_hardware_certified:false,
   cloud_production_sync_certified:false,
   actual_printer_certified:false,
   independent_recovery_certified:false,
   code_signing_certified:false,
   physical_acceptance_certified:false,
   checks,failed_checks:hardFailed,
   manifest_asset_count:manifest?.files&&typeof manifest.files==="object"?
     Object.keys(manifest.files).length:0,
   note:"An intact test-only installer is NOT permission to accept customer money. Confirm physical devices, SQL permissions and backup/restore separately."
 };
}
const run=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(run){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
 inspectV53ReleaseCandidate(root).then(result=>{
   console.log(JSON.stringify(result,null,2));
   if(result.installed_artifact_integrity!=="PASS")process.exitCode=2;
 }).catch(()=>{console.error("v53_release_candidate_check_failed");process.exitCode=1;});
}
