// In-memory read-only same-origin static host for the isolated V36 LAN
// trial. Existing V33 HTTPS socket peer/origin/rate checks must run FIRST.
// No arbitrary paths, SPA fallback, directory access, secrets or source maps.
import {readFile,lstat} from "node:fs/promises";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
const sha=b=>createHash("sha256").update(b).digest("hex");
const nameOk=n=>n==="/index.html"||/^\/assets\/[A-Za-z0-9._-]+\.(?:js|css)$/.test(n);
const mime=n=>n==="/index.html"?"text/html; charset=utf-8":
 n.endsWith(".js")?"text/javascript; charset=utf-8":"text/css; charset=utf-8";
export async function createV36StaticHandler(dir){
 const base=resolve(dir);
 const stat=await lstat(join(base,"pilot-manifest-v36.json"));
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>20000)
  throw Error("invalid_pilot_manifest");
 const manifest=JSON.parse(await readFile(join(base,"pilot-manifest-v36.json"),"utf8"));
 if(manifest.format!=="zhirox-v36-isolated-pilot-v1"||
    !manifest.files||typeof manifest.files!=="object"||
    Object.keys(manifest.files).length<3||Object.keys(manifest.files).length>80||
    !manifest.files["/index.html"])
  throw Error("invalid_pilot_manifest");
 const loaded=new Map();
 for(const [name,digest] of Object.entries(manifest.files)){
  if(!nameOk(name)||typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest))
   throw Error("unexpected_asset_in_manifest");
  const target=join(base,name.slice(1));
  const s=await lstat(target);
  if(!s.isFile()||s.isSymbolicLink()||s.size>5_000_000)
   throw Error("unsafe_asset");
  const body=await readFile(target);
  if(sha(body)!==digest)throw Error("asset_digest_mismatch");
  loaded.set(name,body);
 }
 if(![...loaded].some(([name,body])=>name.endsWith(".js")&&
      body.toString("utf8").includes("data-local-v36-pilot")))
  throw Error("not_isolated_trial_bundle");
 return async(req,res,url)=>{
  if(req.method!=="GET"){
   res.writeHead(405,{"Content-Type":"application/json","Cache-Control":"no-store"});
   return res.end(JSON.stringify({error:"method_not_allowed"}));
  }
  if(url.search||url.hash){
   res.writeHead(400,{"Content-Type":"application/json","Cache-Control":"no-store"});
   return res.end(JSON.stringify({error:"invalid_asset_query"}));
  }
  const file=url.pathname==="/"?"/index.html":url.pathname;
  const body=loaded.get(file);
  if(!body){
   res.writeHead(404,{"Content-Type":"application/json","Cache-Control":"no-store"});
   return res.end(JSON.stringify({error:"asset_not_found"}));
  }
  res.writeHead(200,{
   "Content-Type":mime(file),
   "Cache-Control":"no-store, private",
   "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none'",
   "X-Frame-Options":"DENY","X-Content-Type-Options":"nosniff",
   "Referrer-Policy":"no-referrer"
  });
  res.end(body);
 };
}
