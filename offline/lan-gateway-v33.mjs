// V33 isolated LAN transport gate: no Internet, cloud, direct DB driver in
// browser or open HTTP API. NOT an approved production LAN installer.
import {createServer as createHttpsServer} from "node:https";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createLocalCashierHandlerV32} from "./local-cashier-server-v32.mjs";

export function normalizePeer(ip){
 if(typeof ip!=="string")return null;
 const v=ip.startsWith("::ffff:")?ip.slice(7):ip;
 if(v==="::1")return "127.0.0.1";
 const parts=v.split(".");
 if(parts.length!==4||parts.some(p=>!(/^(?:0|[1-9][0-9]{0,2})$/.test(p))||
   Number(p)>255))return null;
 return parts.join(".");
}
export function privateIPv4(host){
 const ip=normalizePeer(host);
 if(!ip)return false;
 const [a,b]=ip.split(".").map(Number);
 return a===10||(a===172&&b>=16&&b<=31)||
   (a===192&&b===168)||a===127;
}
export function parseV33Peers(value){
 if(typeof value!=="string"||!value.length)throw Error("lan_peers_required");
 const peers=value.split(",").map(x=>x.trim());
 if(peers.length<1||peers.length>32||peers.some(x=>!privateIPv4(x)||x!==normalizePeer(x))||
    new Set(peers).size!==peers.length)
  throw Error("invalid_peer_allowlist");
 return new Set(peers);
}
const securityHeaders={
 "Cache-Control":"no-store, private",
 "X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
 "Cross-Origin-Resource-Policy":"same-origin"
};
function reject(res,status,error,extra={}){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
   ...securityHeaders,...extra});
 res.end(JSON.stringify({error}));
}
export function createV33ClientLimiter({now=()=>Date.now(),windowMs=60000,limit=25}={}){
 if(!Number.isSafeInteger(windowMs)||windowMs<1000||
    !Number.isSafeInteger(limit)||limit<1)throw Error("bad_rate_limits");
 const buckets=new Map();
 return ip=>{
  const t=now(),name=ip;
  if(buckets.size>=256&&!buckets.has(name)){
   for(const [k,v] of buckets)if(t>=v.expires)buckets.delete(k);
   if(buckets.size>=256)return false;
  }
  const prev=buckets.get(name);
  const item=!prev||prev.expires<=t?{count:0,expires:t+windowMs}:prev;
  if(item.count>=limit)return false;
  item.count++;buckets.set(name,item);
  return true;
 };
}
export function createV33LanHandler({pool,secret,peers,allowedOrigin=null,now=()=>Date.now(),
 limiter=createV33ClientLimiter({now}),localHandler=null,staticHandler=null}){
 if(!pool||typeof pool.query!=="function"||typeof pool.connect!=="function"||
    !(peers instanceof Set)||!peers.size||[...peers].some(p=>!privateIPv4(p))||
    typeof secret!=="string"||Buffer.byteLength(secret)<32||
    (allowedOrigin!==null&&!/^https:\/\/[A-Za-z0-9.:-]+$/.test(allowedOrigin)))
  throw Error("invalid_v33_gateway");
 if(localHandler!==null&&typeof localHandler!=="function")throw Error("invalid_local_handler");
 if(staticHandler!==null&&typeof staticHandler!=="function")throw Error("invalid_static_handler");
 const local=localHandler||createLocalCashierHandlerV32({pool,secret});
 return async(req,res)=>{
  if(!req.socket?.encrypted)return reject(res,426,"https_required");
  const peer=normalizePeer(req.socket.remoteAddress);
  // Must use real socket source, NEVER an X-Forwarded-For header.
  if(!peer||!peers.has(peer))return reject(res,403,"unregistered_lan_peer");
  if(req.headers.origin&&(allowedOrigin===null||req.headers.origin!==allowedOrigin))
   return reject(res,403,"origin_not_allowed");
  if(req.method==="OPTIONS")return reject(res,405,"preflight_disabled");
  if(!limiter(peer))return reject(res,429,"too_many_requests",{"Retry-After":"60"});
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return reject(res,400,"invalid_url");}
  if(url.pathname==="/v33/health"&&req.method==="GET"&&!url.search){
   res.writeHead(200,{"Content-Type":"application/json",...securityHeaders});
   return res.end(JSON.stringify({ok:true,mode:"isolated_lan_test"}));
  }
  if(!url.pathname.startsWith("/api/local/")){
   if(!staticHandler)return reject(res,404,"not_found");
   try{return await staticHandler(req,res,url);}
   catch{return reject(res,503,"trial_assets_unavailable");}
  }
  // Content length is only a preflight guard. Underlying V3/V31 routes also
  // validate parsed JSON; do not assume this bounds streamed bodies.
  if(Number(req.headers["content-length"]||0)>65536)
   return reject(res,413,"body_too_large");
  for(const [k,v] of Object.entries(securityHeaders))res.setHeader(k,v);
  try{await local(req,res);}
  catch{if(!res.headersSent)reject(res,503,"local_api_unavailable");else res.destroy();}
 };
}
export async function startV33LanTrial(){
 if(process.env.ZHIROX_V33_LAN_TRIAL_ENABLED!=="true")
  throw Error("lan_trial_disabled");
 const host=process.env.ZHIROX_V33_BIND_IP;
 if(!privateIPv4(host))throw Error("private_bind_ip_required");
 const peers=parseV33Peers(process.env.ZHIROX_V33_ALLOWED_PEERS);
 const certPath=process.env.ZHIROX_V33_TLS_CERT_PATH;
 const keyPath=process.env.ZHIROX_V33_TLS_KEY_PATH;
 const dbUrl=process.env.ZHIROX_V33_DISPOSABLE_DB_URL;
 const secret=process.env.ZHIROX_LOCAL_SESSION_SECRET;
 if(!certPath||!keyPath||!dbUrl||!secret||Buffer.byteLength(secret)<32)
  throw Error("trial_credentials_required");
 // HTTPS is required even inside a trusted LAN, and the preview needs a CA
 // specifically trusted on EACH test client. No plaintext fallback.
 const [cert,key]=await Promise.all([readFile(certPath),readFile(keyPath)]);
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:dbUrl,max:8,connectionTimeoutMillis:2000});
 const origin=process.env.ZHIROX_V33_ALLOWED_ORIGIN||null;
 // Explicit opt-in: V34 never exposes receipts on a default V33 test gateway.
 const v34=process.env.ZHIROX_V34_RECEIPT_PREVIEW_ENABLED==="true";
 const v35=process.env.ZHIROX_V35_PRINT_QUEUE_ENABLED==="true";
 if(v35&&!v34)throw Error("v35_requires_v34_receipts");
 const v36=process.env.ZHIROX_V36_LAN_PILOT_ENABLED==="true";
 if(v36&&(!v35||!v34))throw Error("v36_requires_print_and_receipt_api");
 if(v36&&!origin)throw Error("v36_requires_exact_https_origin");
 const localHandler=v35?
  (await import("./local-print-queue-v35.mjs")).createLocalPrintQueueHandlerV35({pool,secret}):
  v34?(await import("./local-receipts-v34.mjs")).createLocalReceiptHandlerV34({pool,secret}):null;
 const staticHandler=v36?
  await (await import("./lan-pilot-static-v36.mjs")).createV36StaticHandler(
    process.env.ZHIROX_V36_STATIC_DIR||""):null;
 const handler=createV33LanHandler({pool,secret,peers,allowedOrigin:origin,localHandler,staticHandler});
 const server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},handler);
 server.listen(3433,host);
 server.on("close",()=>pool.end());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV33LanTrial().catch(()=>{console.error("v33_lan_trial_failed");process.exitCode=1;});
}
