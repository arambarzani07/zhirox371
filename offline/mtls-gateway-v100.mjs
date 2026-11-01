// V100: isolated CI mutual-TLS device certificate trial. Localhost ONLY.
// Certificate private keys are generated externally, never stored in this
// repository, PostgreSQL or API payloads. This is not a LAN deployment.
import https from "node:https";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createV99DualDeviceHandler} from "./local-dual-device-v99.mjs";
import {assertV98GatePrivileges} from "./local-checkout-http-v98.mjs";
import {assertV94AuthPrivilegeBoundary} from "./local-test-market-v94.mjs";
import {TEST_MARKET} from "./test-market-v80.mjs";

const allowed=new Set(["trial-pc-01","trial-pc-02"]);
export function createV100MutualTLSHandler({
 authPool,gatePool,sessionSecret,proofKeyHex,deviceKeys,afterCommittedForTest,
 routePrefix="/api/local/v100/",networkPolicy=null
}){
 if(!gatePool?.query||gatePool===authPool)
  throw Error("V100_restricted_gate_pool_required");
 const underlying=createV99DualDeviceHandler({
  authPool,gatePool,sessionSecret,proofKeyHex,deviceKeys,
  afterCommittedForTest,routePrefix,networkPolicy
 });
 return async(req,res)=>{
  const certificate=req.socket.getPeerCertificate?.();
  const deviceId=req.headers["x-zhirox-device-id"];
  const fingerprint=certificate?.fingerprint256?.replaceAll(":","").toUpperCase();
  if(!req.socket.encrypted||req.socket.authorized!==true||
   !allowed.has(deviceId)||certificate?.subject?.CN!==deviceId||
   !/^[A-F0-9]{64}$/.test(fingerprint||""))
   return reject(res);
  try{
   // Re-check on EVERY request against the real database so revocation
   // takes effect without server restart, in-process HMAC state or TTL.
   const {rows}=await gatePool.query(
    "SELECT enabled,tls_fingerprint FROM zhirox_local.v100_trial_devices WHERE store_id=$1 AND device_id=$2",
    [TEST_MARKET.store,deviceId]
   );
   const record=rows?.[0];
   if(record?.enabled!==true||record.tls_fingerprint!==fingerprint)
    return reject(res);
  }catch{return reject(res);}
  return underlying(req,res);
 };
}
function reject(res){
 if(res.destroyed)return;
 res.writeHead(403,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify({error:"device_certificate_not_enrolled"}));
}
export function createV100SecureServer({tls,handler}){
 if(!tls?.key||!tls?.cert||!tls?.ca||typeof handler!=="function")
  throw Error("V100_mtls_materials_required");
 return https.createServer({
  key:tls.key,cert:tls.cert,ca:tls.ca,requestCert:true,
  rejectUnauthorized:true,minVersion:"TLSv1.3",
  maxVersion:"TLSv1.3"
 },handler);
}
function localRoleUrl(raw,name){
 if(!raw)throw Error("V100_explicit_sql_role_url_required");
 const u=new URL(raw);
 if(!["postgres:","postgresql:"].includes(u.protocol)||
  !["localhost","127.0.0.1","[::1]"].includes(u.hostname)||
  u.pathname!=="/zhirox_v80_disposable"||
  decodeURIComponent(u.username)!==name||!u.password||u.search||u.hash)
  throw Error("V100_disposable_localhost_pg_only");
 return raw;
}
export async function startV100MutualTLSLab(){
 if(process.env.ZHIROX_V100_MTLS!=="YES_ISOLATED_V100_MTLS_TEST")
  throw Error("V100_test_only_explicit_opt_in_required");
 const authUrl=localRoleUrl(process.env.ZHIROX_V100_AUTH_DB_URL,"zhirox_v94_auth");
 const gateUrl=localRoleUrl(process.env.ZHIROX_V100_GATE_DB_URL,"zhirox_v95_gate");
 const tls={
  key:readFileSync(process.env.ZHIROX_V100_TLS_SERVER_KEY),
  cert:readFileSync(process.env.ZHIROX_V100_TLS_SERVER_CERT),
  ca:readFileSync(process.env.ZHIROX_V100_TLS_CA)
 };
 const {Pool}=await import("pg");
 const authPool=new Pool({connectionString:authUrl,max:2,connectionTimeoutMillis:4000});
 const gatePool=new Pool({connectionString:gateUrl,max:4,connectionTimeoutMillis:4000});
 try{
  await assertV94AuthPrivilegeBoundary(authPool);
  await assertV98GatePrivileges(gatePool);
  const handler=createV100MutualTLSHandler({
   authPool,gatePool,sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,
   proofKeyHex:process.env.ZHIROX_V100_PROOF_KEY_HEX,
   deviceKeys:{
    "trial-pc-01":process.env.ZHIROX_V100_PC01_KEY,
    "trial-pc-02":process.env.ZHIROX_V100_PC02_KEY
   }
  });
  const server=createV100SecureServer({tls,handler});
  server.on("close",()=>{void Promise.allSettled([authPool.end(),gatePool.end()]);});
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(3317,"127.0.0.1",resolve);
  });
  return server;
 }catch(error){
  await Promise.allSettled([authPool.end(),gatePool.end()]);
  throw error;
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV100MutualTLSLab().catch(e=>{
  console.error("V100_disposable_mTLS_unavailable:",e.message);
  process.exitCode=1;
 });
}
