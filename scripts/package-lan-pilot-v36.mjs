// Build-only, offline V36 bundle manifest. No deploy and no live DB access.
// Run AFTER an isolated VITE_V36_ISOLATED_LAN_PILOT=true Vite build.
// Publishing the manifest does NOT certify the build for real sales.
import {readFile,writeFile,readdir} from "node:fs/promises";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const SHA=content=>createHash("sha256").update(content).digest("hex");
export async function packageV36Pilot(distDir){
 const folder=resolve(distDir);
 const index=await readFile(join(folder,"index.html"));
 const assets=await readdir(join(folder,"assets"),{withFileTypes:true});
 const names=assets.filter(a=>a.isFile()&&/^[A-Za-z0-9._-]+\.(js|css)$/.test(a.name))
  .map(a=>"/assets/"+a.name).sort();
 if(!names.some(n=>n.endsWith(".js"))||!names.some(n=>n.endsWith(".css")))
  throw Error("pilot_assets_missing");
 const files={"/index.html":SHA(index)};
 let pilotMarker=false;
 for(const name of names){
  const body=await readFile(join(folder,name.slice(1)));
  files[name]=SHA(body);
  if(name.endsWith(".js")&&body.toString("utf8").includes("data-local-v36-pilot"))
   pilotMarker=true;
 }
 if(!pilotMarker)throw Error("not_an_isolated_v36_pilot_build");
 if(index.toString("utf8").includes("RETAIL_DEMO_MODE"))throw Error("unexpected_legacy_demo_flag");
 const manifest={
  format:"zhirox-v36-isolated-pilot-v1",warning:"TEST ONLY — no fiscal or official POS",
  created_at:new Date().toISOString(),files
 };
 await writeFile(join(folder,"pilot-manifest-v36.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"w"});
 return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=process.argv[2]||"dist";
 packageV36Pilot(dir).then(m=>console.log("V36 test-only manifest: "+Object.keys(m.files).length+" assets"))
  .catch(e=>{console.error("V36 PACKAGE REFUSED: "+e.message);process.exitCode=1;});
}
