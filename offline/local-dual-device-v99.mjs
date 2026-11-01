// V99 disposable test-only dual-device gateway. LAN architecture exercise
// is simulated by independent clients to localhost; NOT a real LAN listener.
import http from "node:http";
import {fileURLToPath} from "node:url";
import {createV98TestCheckoutHandler,assertV98GatePrivileges} from "./local-checkout-http-v98.mjs";
import {assertV94AuthPrivilegeBoundary} from "./local-test-market-v94.mjs";
import {createV99DeviceGuard} from "./device-guard-v99.mjs";

export function createV99DualDeviceHandler({
 authPool,gatePool,sessionSecret,proofKeyHex,deviceKeys,afterCommittedForTest
}){
 const deviceGuard=createV99DeviceGuard({deviceKeys});
 return createV98TestCheckoutHandler({
  authPool,gatePool,sessionSecret,proofKeyHex,afterCommittedForTest,
  routePrefix:"/api/local/v99/",deviceGuard
 });
}
function restrictedDbUrl(raw,actor){
 if(typeof raw!=="string"||!raw)throw Error("V99_requires_local_test_pg_url");
 const parsed=new URL(raw);
 if(!["postgres:","postgresql:"].includes(parsed.protocol)||
  !["localhost","127.0.0.1","[::1]"].includes(parsed.hostname)||
  parsed.pathname!=="/zhirox_v80_disposable"||
  decodeURIComponent(parsed.username)!==actor||!parsed.password||
  parsed.search||parsed.hash)
  throw Error("V99_restricted_disposable_postgres_identity_required");
 return raw;
}
export async function startV99DualDeviceLab(){
 if(process.env.ZHIROX_V99_DUAL_DEVICE!=="YES_ISOLATED_V99_LOCAL_LAB")
  throw Error("V99_disposable_explicit_opt_in_required");
 const authUrl=restrictedDbUrl(process.env.ZHIROX_V99_AUTH_DB_URL,"zhirox_v94_auth");
 const gateUrl=restrictedDbUrl(process.env.ZHIROX_V99_GATE_DB_URL,"zhirox_v95_gate");
 const keys={
  "trial-pc-01":process.env.ZHIROX_V99_PC01_KEY,
  "trial-pc-02":process.env.ZHIROX_V99_PC02_KEY
 };
 const sessionSecret=process.env.ZHIROX_LOCAL_SESSION_SECRET;
 const proofKeyHex=process.env.ZHIROX_V99_PROOF_KEY_HEX;
 const {Pool}=await import("pg");
 const authPool=new Pool({connectionString:authUrl,max:2,connectionTimeoutMillis:4000});
 const gatePool=new Pool({connectionString:gateUrl,max:4,connectionTimeoutMillis:4000});
 try{
  await assertV94AuthPrivilegeBoundary(authPool);
  await assertV98GatePrivileges(gatePool);
  const handler=createV99DualDeviceHandler({
   authPool,gatePool,sessionSecret,proofKeyHex,deviceKeys:keys
  });
  const server=http.createServer(handler);
  server.on("close",()=>{void Promise.allSettled([authPool.end(),gatePool.end()]);});
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(3316,"127.0.0.1",resolve);
  });
  return server;
 }catch(error){
  await Promise.allSettled([authPool.end(),gatePool.end()]);
  throw error;
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV99DualDeviceLab().catch(error=>{
  console.error("V99_test_dual_device_unavailable:",error.message);
  process.exitCode=1;
 });
}
