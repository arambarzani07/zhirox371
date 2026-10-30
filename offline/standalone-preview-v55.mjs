// V55: offline preview for Windows EXE. No API, checkout, cloud, or database access.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createV36StaticHandler} from "./lan-pilot-static-v36.mjs";

export const V55_HOST="127.0.0.1";
export const V55_PORT=3555;
const headers={
 "Cache-Control":"no-store, private",
 "X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
 "X-Frame-Options":"DENY",
 "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};
const banner='<div id="v55-offline-preview-warning" dir="rtl" lang="ckb" style="position:relative;z-index:2147483647;background:#fff1bc;color:#753400;border-bottom:3px solid #ad7816;padding:12px;font:700 17px Tahoma,Arial,sans-serif;text-align:center">ZHIROX371 — تەنها پێشبینینی ئۆفلاینە. فرۆشتنی ڕاستەقینە و تۆمارکردنی پارە ناچالاکە. / OFFLINE PREVIEW — SALES DISABLED</div>';
function reply(res,status,body){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",...headers});
 res.end(JSON.stringify(body));
}
export async function createV55Preview({directory,port=V55_PORT}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error("v55_invalid_port");
 if(typeof directory!=="string"||!directory)throw Error("v55_missing_static_dir");
 const dir=resolve(directory);
 // Existing V36 handler verifies a complete SHA-256 asset allowlist and pilot marker.
 const staticHandler=await createV36StaticHandler(dir);
 const original=await readFile(join(dir,"index.html"),"utf8");
 if(!/<body(?:\s[^>]*)?>/i.test(original))throw Error("v55_invalid_original_html");
 const safeHtml=original.replace(/<body(\s[^>]*)?>/i,match=>match+banner);
 const server=createServer((req,res)=>{
   const authority=req.headers.host;
   const binding=server.address();
   const expected=V55_HOST+":"+(binding?.port||port);
   if(authority!==expected)return reply(res,403,{error:"v55_wrong_origin"});
   if(req.method!=="GET")return reply(res,405,{error:"v55_read_only"});
   let u;
   try{u=new URL(req.url||"/","http://"+expected);}catch{return reply(res,400,{error:"v55_bad_path"})}
   if(u.search||u.hash)return reply(res,400,{error:"v55_query_not_supported"});
   if(u.pathname==="/__zhirox_preview_health"){
     return reply(res,200,{app:"ZHIROX371",mode:"OFFLINE_PREVIEW_ONLY",
       live_sales:false,cloud_sync:false,local_db:false});
   }
   if(u.pathname.startsWith("/api/")||u.pathname.startsWith("/auth/"))
     return reply(res,403,{error:"v55_sales_disabled"});
   if(u.pathname==="/"||u.pathname==="/index.html"){
     res.writeHead(200,{"Content-Type":"text/html; charset=utf-8",...headers});
     return res.end(safeHtml);
   }
   Promise.resolve(staticHandler(req,res,u)).catch(()=>{
     if(!res.headersSent)reply(res,503,{error:"v55_static_unavailable"});
     else res.destroy();
   });
 });
 return server;
}
export async function listenV55Preview({directory,port=V55_PORT}={}){
 const server=await createV55Preview({directory,port});
 await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(port,V55_HOST,()=>{server.off("error",reject);resolve();});
 });
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.env.ZHIROX_RELEASE_MODE==="official"){
   console.error("v55_official_release_disabled");process.exitCode=1;
 }else{
   const dir=resolve(fileURLToPath(new URL("../dist/",import.meta.url)));
   listenV55Preview({directory:dir}).then(()=>{
     console.log("ZHIROX371 OFFLINE PREVIEW ONLY (NO CASH SALES) http://127.0.0.1:3555");
   }).catch(()=>{console.error("v55_preview_failed_or_port_in_use");process.exitCode=1;});
 }
}
