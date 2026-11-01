// V101 lab adapter: real nonloopback private NIC with TLS1.3 and
// certificate-revocable, signed PostgreSQL checkout. Not production POS.
import {createV100SecureServer,createV100MutualTLSHandler} from "./mtls-gateway-v100.mjs";
import {createV101PrivateNICPolicy} from "./private-nic-v101.mjs";
import {assertV94AuthPrivilegeBoundary} from "./local-test-market-v94.mjs";
import {assertV98GatePrivileges} from "./local-checkout-http-v98.mjs";

export function createV101PrivateNICServer({
 bindAddress,allowedPeers,interfaces,tls,authPool,gatePool,
 sessionSecret,proofKeyHex,deviceKeys,afterCommittedForTest
}){
 const networkPolicy=createV101PrivateNICPolicy({
  bindAddress,allowedPeers,interfaces
 });
 const handler=createV100MutualTLSHandler({
  authPool,gatePool,sessionSecret,proofKeyHex,deviceKeys,
  afterCommittedForTest,routePrefix:"/api/local/v101/",networkPolicy
 });
 return createV100SecureServer({tls,handler});
}
export async function startV101PrivateNICLab({
 bindAddress,allowedPeers,interfaces,tls,authPool,gatePool,
 sessionSecret,proofKeyHex,deviceKeys
}={}){
 if(process.env.ZHIROX_V101_PRIVATE_NIC!=="YES_DISPOSABLE_PRIVATE_NIC_LAB")
  throw Error("V101_explicit_disposable_lab_opt_in_required");
 if(!authPool?.query||!gatePool?.query)
  throw Error("V101_two_restricted_database_pools_required");
 await assertV94AuthPrivilegeBoundary(authPool);
 await assertV98GatePrivileges(gatePool);
 const server=createV101PrivateNICServer({
  bindAddress,allowedPeers,interfaces,tls,authPool,gatePool,
  sessionSecret,proofKeyHex,deviceKeys
 });
 try{
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(3318,bindAddress,resolve);
  });
  return server;
 }catch(e){
  server.close();
  throw e;
 }
}
// Deliberately no CLI/autostart. CI injects disposable DB and per-test
// CA/cert material. No production LAN listener is started by default.
