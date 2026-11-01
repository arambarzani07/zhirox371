// V98: isolated CI ONLY, localhost HTTP facade for V97 atomic test sale.
// No real market payments, cloud, cashier web app or production deployment.
// Never send PostgreSQL role credentials or proof key to a client.
import http from "node:http";
import {fileURLToPath} from "node:url";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {assertV94AuthPrivilegeBoundary} from "./local-test-market-v94.mjs";
import {createV97TestCheckoutAdapter} from "./proven-checkout-v97.mjs";
import {TEST_MARKET} from "./test-market-v80.mjs";

const DB="zhirox_v80_disposable";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const API="/api/local/v98/";
function respond(res,status,body){
 if(res.destroyed)return;
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private","X-Frame-Options":"DENY",
  "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
  "Content-Security-Policy":"default-src 'none'"}); // No CORS opt-in
 res.end(JSON.stringify(body));
}
async function parseBody(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))return null;
 if(Number(req.headers["content-length"]||0)>8192)return null;
 let length=0;const chunks=[];
 try{
  for await(const chunk of req){
   length+=chunk.length;
   if(length>8192)return null;
   chunks.push(chunk);
  }
  const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return value&&typeof value==="object"&&!Array.isArray(value)?value:null;
 }catch{return null;}
}
export async function assertV98GatePrivileges(pool){
 const {rows}=await pool.query(`
 SELECT current_database() AS db,current_user AS actor,
 has_table_privilege(current_user,'zhirox_local.products','UPDATE') AS stock_write,
 has_table_privilege(current_user,'zhirox_local.sales','INSERT') AS sales_write,
 has_table_privilege(current_user,'zhirox_local.local_users','SELECT') AS accounts_read,
 has_function_privilege(current_user,
  'zhirox_local.checkout_proven_fefo_v97(uuid,uuid,uuid,jsonb,jsonb)','EXECUTE') AS bound_checkout,
 has_function_privilege(current_user,
  'zhirox_local.preflight_checkout_bound_v96(uuid,uuid,uuid,jsonb,jsonb)','EXECUTE') AS old_proof,
 has_function_privilege(current_user,
  'zhirox_local.checkout_unified_fefo_v90(uuid,uuid,uuid,jsonb)','EXECUTE') AS unsigned_checkout
 `);
 const x=rows?.[0];
 if(x?.db!==DB||x.actor!=="zhirox_v95_gate"||x.stock_write!==false||
 x.sales_write!==false||x.accounts_read!==false||x.bound_checkout!==true||
 x.old_proof!==false||x.unsigned_checkout!==false)
  throw Error("V98_dedicated_sql_checkout_role_required");
 return true;
}
// afterCommittedForTest may destroy the connection to simulate lost ACK after
// real COMMIT. Only integration tests should supply it; no runtime entry uses it.
export function createV98TestCheckoutHandler({
 authPool,gatePool,sessionSecret,proofKeyHex,afterCommittedForTest,
 routePrefix=API,deviceGuard=null
}){
 if(!authPool?.query||!authPool?.connect||!gatePool?.query||
  authPool===gatePool||typeof sessionSecret!=="string"||
  Buffer.byteLength(sessionSecret)<32||!/^[0-9a-f]{64}$/.test(proofKeyHex||""))
  throw Error("V98_dedicated_isolated_pg_pools_and_secrets_required");
 if(!((routePrefix===API&&deviceGuard===null)||
      (routePrefix==="/api/local/v99/"&&typeof deviceGuard==="function")))
  throw Error("V99_device_guard_route_pair_required");
 const auth=createLocalAuthV3({pool:authPool,secret:sessionSecret});
 const checkout=createV97TestCheckoutAdapter({
  authPool,gatePool,sessionSecret,proofKeyHex
 });
 return async(req,res)=>{
  // Reject non-loopback peers AND Host-header mismatches (DNS rebinding).
  const addr=req.socket.remoteAddress;
  const host=req.headers.host||"";
  if(!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(addr)||
    !/^(?:127\.0\.0\.1|localhost):[0-9]{2,5}$/.test(host))
   return respond(res,403,{error:"loopback_only"});
  let url;
  try{url=new URL(req.url||"/","http://127.0.0.1");}
  catch{return respond(res,400,{error:"invalid_url"})}
  if(!url.pathname.startsWith(routePrefix))return respond(res,404,{error:"not_found"});
  const route=url.pathname.slice(routePrefix.length);
  if(!["login","checkout"].includes(route))return respond(res,404,{error:"not_found"});
  if(req.method!=="POST")return respond(res,405,{error:"method_not_allowed"});
  if(url.search)return respond(res,400,{error:"unexpected_query"});
  const body=await parseBody(req);
  if(!body)return respond(res,400,{error:"invalid_json_body"});
  let deviceId=null;
  if(deviceGuard){
   deviceId=await deviceGuard({headers:req.headers,method:req.method,path:url.pathname,body});
   if(!deviceId)return respond(res,403,{error:"device_authentication_required"});
  }
  try{
   await assertV94AuthPrivilegeBoundary(authPool);
   if(route==="login"){
    if(Object.keys(body).some(k=>!["username","password"].includes(k))||
      ![TEST_MARKET.cashierUsername,TEST_MARKET.ownerUsername].includes(body.username)||
      typeof body.password!=="string"||body.password.length<1||
      Buffer.byteLength(body.password)>1024)
     return respond(res,400,{error:"invalid_login"});
    const session=await auth.login({store_id:TEST_MARKET.store,
      username:body.username,password:body.password});
    if(!session)return respond(res,401,{error:"invalid_credentials"});
    return respond(res,200,{ok:true,scope:"ISOLATED_TEST_ONLY",
      token:session.token,role:session.role,expires_in_seconds:session.expires_in_seconds,
      ...(deviceId?{device_id:deviceId}:{})});
   }
   const authHeader=req.headers.authorization||"";
   const match=/^Bearer (\S+)$/.exec(authHeader);
   if(!match)return respond(res,401,{error:"invalid_session"});
   if(Object.keys(body).some(k=>!["request_id","lines"].includes(k))||
      !UUID.test(body.request_id||"")||!Array.isArray(body.lines)||
      body.lines.length<1||body.lines.length>30)
    return respond(res,400,{error:"invalid_checkout_intent"});
   await assertV98GatePrivileges(gatePool);
   const result=await checkout({
    token:match[1],request_id:body.request_id,lines:body.lines
   });
   if(result.reason==="invalid_session_or_cart")
    return respond(res,401,{error:"invalid_session"});
   const status=result.approved?(result.replayed?200:201):409;
   // Never expose SQL error details or secrets to the browser.
   const payload={ok:result.approved,scope:"ISOLATED_TEST_ONLY",
    mode:"synthetic_atomic_pg",reason:result.reason,
    audit_id:result.audit_id,
    ...(result.approved?{sale_id:result.sale_id,receipt_no:result.receipt_no,
      total_minor:result.total_minor,replayed:result.replayed}:{}),
    physical_payment_received:false,...(deviceId?{device_id:deviceId}:{})};
   if(afterCommittedForTest && result.approved && !result.replayed){
    await afterCommittedForTest({result,req,res});
    if(res.destroyed)return;
   }
   return respond(res,status,payload);
  }catch{return respond(res,503,{error:"isolated_test_database_unavailable"})}
 };
}
function strictLocalUrl(raw,identity){
 if(!raw)throw Error("V98_explicit_role_url_required");
 const url=new URL(raw);
 if(!["postgres:","postgresql:"].includes(url.protocol)||
  !["127.0.0.1","localhost","[::1]"].includes(url.hostname)||
  url.pathname!=="/"+DB||decodeURIComponent(url.username)!==identity||
  !url.password||url.search||url.hash)
  throw Error("V98_disposable_loopback_role_url_required");
 return raw;
}
export async function startV98LocalCheckoutServer(){
 if(process.env.ZHIROX_V98_TEST_HTTP!=="YES_ISOLATED_V98_CHECKOUT_TEST_ONLY")
  throw Error("V98_test_only_explicit_opt_in_required");
 const authUrl=strictLocalUrl(process.env.ZHIROX_V98_AUTH_DB_URL,"zhirox_v94_auth");
 const gateUrl=strictLocalUrl(process.env.ZHIROX_V98_GATE_DB_URL,"zhirox_v95_gate");
 const sessionSecret=process.env.ZHIROX_LOCAL_SESSION_SECRET;
 const proofKeyHex=process.env.ZHIROX_V98_PROOF_KEY_HEX;
 const {Pool}=await import("pg");
 const authPool=new Pool({connectionString:authUrl,max:2,connectionTimeoutMillis:4000});
 const gatePool=new Pool({connectionString:gateUrl,max:4,connectionTimeoutMillis:4000});
 try{
  await assertV94AuthPrivilegeBoundary(authPool);
  await assertV98GatePrivileges(gatePool);
  const server=http.createServer(createV98TestCheckoutHandler({
   authPool,gatePool,sessionSecret,proofKeyHex
  }));
  server.on("close",()=>{void Promise.allSettled([authPool.end(),gatePool.end()]);});
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(3315,"127.0.0.1",resolve);
  });
  return server;
 }catch(error){
  await Promise.allSettled([authPool.end(),gatePool.end()]);
  throw error;
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV98LocalCheckoutServer().catch(e=>{
  console.error("V98_test_checkout_unavailable:",e.message);process.exitCode=1;
 });
}
