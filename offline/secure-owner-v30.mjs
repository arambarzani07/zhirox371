import {createServer as createHttpsServer} from "node:https";
import {readFile,open} from "node:fs/promises";
import {constants} from "node:fs";
import {isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {createCloudReceiverV29} from "./cloud-receiver-v29.mjs";
import {parseV28Stores} from "./cloud-receiver-v28.mjs";

const stricterHeaders={
 "Cache-Control":"no-store, private",
 "X-Content-Type-Options":"nosniff",
 "X-Frame-Options":"DENY",
 "Referrer-Policy":"no-referrer",
 "Cross-Origin-Resource-Policy":"same-origin",
 "Permissions-Policy":"camera=(),microphone=(),geolocation=(),payment=()",
 "Strict-Transport-Security":"max-age=300"
};
function fail(res,status,error,extra={}){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  ...stricterHeaders,...extra});
 res.end(JSON.stringify({error}));
}
export async function readV30SecretFile(path,{allowWindows=false}={}){
 if(!isAbsolute(path||""))throw Error("absolute_secret_path_required");
 // O_NOFOLLOW plus fstat closes the symlink replacement race in an
 // lstat-then-open sequence. Linux and macOS enforce this in the kernel.
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW).catch(err=>{
  if(err?.code==="ELOOP")throw Error("unsafe_secret_file");
  throw err;
 });
 try{
  const st=await handle.stat();
  if(!st.isFile())throw Error("unsafe_secret_file");
  if(process.platform!=="win32"&&!allowWindows&&(st.mode&0o077)!==0)
   throw Error("secret_file_permissions_must_be_0600");
  if(st.size>32768||st.size<1)throw Error("invalid_secret_file_size");
  const bytes=await handle.readFile();
  if(bytes.length>32768||bytes.length<1)throw Error("invalid_secret_file_size");
  return bytes;
 }finally{await handle.close();}
}
export async function loadV30Stores(filePath){
 // The file must not live in the repository. Every request re-reads it:
 // deleting or replacing a token hash revokes access immediately.
 const raw=await readV30SecretFile(filePath);
 return parseV28Stores(raw.toString("utf8"));
}
function pathType(url,method){
 if(method==="POST"&&url.pathname==="/v27/events")return "event";
 if(method==="GET"&&
  (url.pathname.startsWith("/v28/owner/")||
   url.pathname==="/v29/owner/event-ids"))return "owner";
 return "asset";
}
export function createV30RateLimiter({now=()=>Date.now(),ownerLimit=12,eventLimit=60,
 windowMs=60000}={}){
 if(!Number.isSafeInteger(ownerLimit)||ownerLimit<1||
    !Number.isSafeInteger(eventLimit)||eventLimit<1||
    !Number.isSafeInteger(windowMs)||windowMs<1000)
  throw Error("invalid_rate_limits");
 const seen=new Map();
 return {allow(key,type){
  const at=now();
  // Bounded process-memory buckets; behind a proxy do NOT trust X-Forwarded-For.
  if(seen.size>2048){
   for(const [k,v] of seen)if(v.until<=at)seen.delete(k);
  }
  const name=type+":"+key;
  // Do not evict active buckets and accidentally grant fresh attempts.
  if(seen.size>2048&&!seen.has(name))
   return {ok:false,retryAfter:Math.ceil(windowMs/1000)};
  const limit=type==="event"?eventLimit:type==="owner"?ownerLimit:120;
  let row=seen.get(name);
  if(!row||row.until<=at){row={n:0,until:at+windowMs};seen.set(name,row);}
  if(row.n>=limit)return {ok:false,retryAfter:Math.max(1,Math.ceil((row.until-at)/1000))};
  row.n++;
  return {ok:true,retryAfter:0};
 }};
}
export function createV30HttpsGate({pool,loadStores,now=()=>Date.now(),
 rateLimiter=createV30RateLimiter({now})}){
 if(typeof pool?.query!=="function"||typeof loadStores!=="function")
  throw Error("invalid_secure_gateway_config");
 return async(req,res)=>{
  if(!req.socket?.encrypted)return fail(res,426,"https_required");
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return fail(res,400,"invalid_url");}
  if(url.pathname==="/healthz"&&req.method==="GET"&&!url.search){
   // No database/store/credential disclosure.
   res.writeHead(200,{"Content-Type":"application/json; charset=utf-8",...stricterHeaders});
   return res.end(JSON.stringify({ok:true}));
  }
  const origin=req.headers.origin;
  if(origin){
   // Explicit browser same-origin requests only. The independent outbox
   // sender has no Origin header. Never reflect arbitrary Access-Control-Allow-Origin.
   const base="https://"+req.headers.host;
   if(origin!==base)return fail(res,403,"cross_origin_forbidden");
  }
  const addr=req.socket.remoteAddress||"unknown";
  const type=pathType(url,req.method);
  const permitted=rateLimiter.allow(addr,type);
  if(!permitted.ok)
   return fail(res,429,"too_many_requests",{"Retry-After":String(permitted.retryAfter)});
  let stores;
  try{stores=await loadStores();}
  catch{return fail(res,503,"credentials_unavailable");}
  let handler;
  try{handler=createCloudReceiverV29({pool,stores,now});}
  catch{return fail(res,503,"credentials_unavailable");}
  for(const [key,value] of Object.entries(stricterHeaders))res.setHeader(key,value);
  // The existing V27-V29 handler owns API and asset responses. TLS and rate
  // limits are enforced BEFORE it is reached.
  try{await handler(req,res);}
  catch{if(!res.headersSent)fail(res,503,"request_failed");else res.destroy();}
 };
}
export async function startV30HttpsPreview(){
 if(process.env.ZHIROX_V30_HTTPS_PREVIEW_ENABLED!=="true")
  throw Error("v30_preview_disabled");
 const certPath=process.env.ZHIROX_V30_TLS_CERT_PATH,
       keyPath=process.env.ZHIROX_V30_TLS_KEY_PATH,
       credentialFile=process.env.ZHIROX_V30_CREDENTIALS_FILE,
       dbUrl=process.env.ZHIROX_V30_DISPOSABLE_DB_URL;
 if(!certPath||!keyPath||!credentialFile||!dbUrl)
  throw Error("missing_v30_config");
 // Fail startup if no usable certificate, private key or tenant config.
 const [cert,key]=await Promise.all([readFile(certPath),readV30SecretFile(keyPath)]);
 await loadV30Stores(credentialFile);
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:dbUrl,max:3,connectionTimeoutMillis:2000});
 const gate=createV30HttpsGate({pool,loadStores:()=>loadV30Stores(credentialFile)});
 const server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},gate);
 server.listen(3420,"127.0.0.1");
 server.on("close",()=>pool.end());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV30HttpsPreview().catch(()=>{
  console.error("v30_preview_failed");
  process.exitCode=1;
 });
}
