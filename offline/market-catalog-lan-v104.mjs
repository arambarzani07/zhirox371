// V104: isolated, read-only mTLS market catalog adapter.
// Reuses V100 TLS 1.3 mutual cert verification + DB fingerprint/revocation check,
// optional V101 exact RFC1918 NIC + peer allowlist, and V103 atomic fail-closed
// CSV watcher. Never writes to SQL, inventory or files; checkout is DISABLED.
import {createHash,timingSafeEqual} from "node:crypto";
import {fileURLToPath} from "node:url";
import {createV101PrivateNICPolicy} from "./private-nic-v101.mjs";
import {createV100SecureServer} from "./mtls-gateway-v100.mjs";
import {assertV98GatePrivileges} from "./local-checkout-http-v98.mjs";
import {createV103AtomicCatalog} from "./market-catalog-watch-v103.mjs";
import {TEST_MARKET} from "./test-market-v80.mjs";

export const V104_PORT=3322;
export const V104_BASE="/api/local/v104/";
const ALLOWED_DEVICES=new Set(["trial-pc-01","trial-pc-02"]);

function send(res,code,body){
 if(res.destroyed||res.headersSent)return;
 res.writeHead(code,{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"private, no-store, max-age=0",
  "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'"
 });
 res.end(JSON.stringify(body));
}
function validToken(header,expected){
 if(typeof header!=="string"||!header.startsWith("Bearer "))return false;
 const value=header.slice(7);
 if(value.length<32||value.length>2048)return false;
 const digest=x=>createHash("sha256").update(x).digest();
 return timingSafeEqual(digest(value),digest(expected));
}
export function createV104CatalogLANHandler({
 bindAddress="127.0.0.1",allowedPeers=null,interfaces,gatePool,watch,token
}={}){
 if(!gatePool?.query||!watch||typeof watch.snapshot!=="function"||
  typeof token!=="string"||token.length<32||token.length>2048)
  throw Error("v104_gate_pool_watcher_and_strong_token_required");
 const loopback=bindAddress==="127.0.0.1"&&allowedPeers===null;
 const nicPolicy=loopback?null:createV101PrivateNICPolicy({
  bindAddress,allowedPeers,interfaces
 });
 return async(req,res)=>{
  if(nicPolicy){
   if(!nicPolicy(req))
    return send(res,403,{ok:false,error:"private_nic_policy_refused"});
  }else{
   const peer=(req.socket.remoteAddress||"").replace(/^::ffff:/,"");
   const host="127.0.0.1:"+req.socket.localPort;
   if(!req.socket.encrypted||req.socket.authorized!==true||
    peer!=="127.0.0.1"||req.socket.localAddress!=="127.0.0.1"||
    req.headers.host!==host)
    return send(res,403,{ok:false,error:"private_nic_policy_refused"});
  }
  if(req.headers.origin)
   return send(res,403,{ok:false,error:"cors_origin_forbidden"});
  const cert=req.socket.getPeerCertificate?.();
  const deviceId=req.headers["x-zhirox-device-id"];
  const fp=cert?.fingerprint256?.replaceAll(":","").toUpperCase();
  if(!req.socket.encrypted||req.socket.authorized!==true||
   !ALLOWED_DEVICES.has(deviceId)||cert?.subject?.CN!==deviceId||
   !/^[A-F0-9]{64}$/.test(fp||""))
   return send(res,403,{ok:false,error:"device_certificate_not_enrolled"});
  try{
   const {rows}=await gatePool.query(
    "SELECT enabled,tls_fingerprint FROM zhirox_local.v100_trial_devices WHERE store_id=$1 AND device_id=$2",
    [TEST_MARKET.store,deviceId]
   );
   const record=rows?.[0];
   if(record?.enabled!==true||record.tls_fingerprint!==fp)
    return send(res,403,{ok:false,error:"device_certificate_not_enrolled"});
  }catch{
   return send(res,503,{ok:false,error:"device_registry_unavailable"});
  }
  if(!validToken(req.headers.authorization,token))
   return send(res,401,{ok:false,error:"unauthorized"});
  if(req.method!=="GET")
   return send(res,405,{ok:false,error:"read_only_method"});
  let url;
  try{url=new URL(req.url,"https://"+bindAddress+":"+req.socket.localPort);}
  catch{return send(res,400,{ok:false,error:"invalid_path"});}
  if(![V104_BASE+"status",V104_BASE+"scan",V104_BASE+"products"].includes(url.pathname))
   return send(res,404,{ok:false,error:"not_found"});
  const keys=[...url.searchParams.keys()];
  const expected=url.pathname===V104_BASE+"status"?[]:
   url.pathname===V104_BASE+"scan"?["code"]:["q","limit"];
  if(keys.some(k=>!expected.includes(k))||keys.length!==new Set(keys).size)
   return send(res,400,{ok:false,error:"invalid_query"});
  let state;
  try{state=await watch.snapshot();}
  catch{return send(res,503,{ok:false,error:"snapshot_unavailable"});}
  const proof={
   source:"OPERATOR_CSV_SNAPSHOT_NOT_LIVE_SQL_SERVER",
   transport:"PRIVATE_NIC_TLS13_MTLS_READONLY_LAB",
   device_id:deviceId,
   checkout_enabled:false,write_enabled:false,stock_verified:false
  };
  if(!state.ok)return send(res,503,{ok:false,...proof,
   error:"snapshot_unavailable_or_stale",snapshot_available:false});
  const {catalog,generation,lastSuccessful}=state;
  const verified={...proof,snapshot_available:true,generation,
   verified_at:lastSuccessful,stale:false};
  if(url.pathname===V104_BASE+"status"){
   const {valid_rows,invalid_rows,unique_barcodes,ambiguous_barcodes,
    source_modified_at,source_sha256}=catalog.status;
   return send(res,200,{ok:true,...verified,valid_rows,invalid_rows,
    unique_barcodes,ambiguous_barcodes,source_modified_at,source_sha256});
  }
  if(url.pathname===V104_BASE+"scan"){
   const code=url.searchParams.get("code")||"";
   const result=catalog.scan(code);
   const status=result.ok?200:
    result.error==="ambiguous_barcode_refused"?409:
    result.error==="invalid_barcode"?400:404;
   return send(res,status,{...result,...verified});
  }
  const q=url.searchParams.get("q")||"";
  const limit=url.searchParams.has("limit")?
   Number(url.searchParams.get("limit")):20;
  try{
   const items=catalog.search(q,limit);
   return send(res,200,{ok:true,...verified,count:items.length,items});
  }catch{
   return send(res,400,{ok:false,error:"invalid_search"});
  }
 };
}
export function createV104CatalogLANServer({
 bindAddress="127.0.0.1",allowedPeers=null,interfaces,tls,gatePool,watch,token
}={}){
 const handler=createV104CatalogLANHandler({
  bindAddress,allowedPeers,interfaces,gatePool,watch,token
 });
 return createV100SecureServer({tls,handler});
}
export async function startV104CatalogLANLab({
 bindAddress,allowedPeers,interfaces,tls,gatePool,csvPath,token,consent,port=V104_PORT
}={}){
 if(consent!=="YES_DISPOSABLE_V104_MTLS_CATALOG_LAB"||
  process.env.ZHIROX_V104_MTLS_CATALOG_LAB!=="YES_DISPOSABLE_V104_MTLS_CATALOG_LAB"||
  port!==V104_PORT)
  throw Error("v104_explicit_disposable_lab_opt_in_required");
 if(!gatePool?.query)throw Error("v104_restricted_gate_pool_required");
 await assertV98GatePrivileges(gatePool);
 const watch=createV103AtomicCatalog({csvPath});
 await watch.refresh({force:true});
 const server=createV104CatalogLANServer({
  bindAddress,allowedPeers,interfaces,tls,gatePool,watch,token
 });
 try{
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(V104_PORT,bindAddress,resolve);
  });
  watch.startPolling();
  server.on("close",()=>watch.stopPolling());
  return {server,watch};
 }catch(e){
  watch.stopPolling();
  server.close();
  throw e;
 }
}
// Deliberately no default CLI autostart without explicit disposable lab consent.
if(process.argv[1]===fileURLToPath(import.meta.url)){
 console.error("V104 disposable lab requires programmatic test runner with ephemeral CA/certs and gatePool; checkout DISABLED.");
 process.exitCode=1;
}
