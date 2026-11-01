// V97 test-only actor proof issuer. Cryptographically binds the live
// authenticated PostgreSQL session_version to an atomic FEFO checkout intent.
// Does not expose credentials or create an HTTP write route.
import {createHmac,randomBytes} from "node:crypto";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {assertV94AuthPrivilegeBoundary} from "./local-test-market-v94.mjs";
import {TEST_MARKET} from "./test-market-v80.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createV97CheckoutProofIssuer({authPool,sessionSecret,proofKeyHex,clock=()=>Date.now()}){
 if(!authPool?.query||!authPool?.connect||!sessionSecret||
  typeof proofKeyHex!=="string"||!/^[0-9a-f]{64}$/.test(proofKeyHex))
   throw Error("V97_requires_separate_auth_pool_and_secret");
 const auth=createLocalAuthV3({pool:authPool,secret:sessionSecret,clock});
 return async function issue({token,request_id,lines}={}){
  if(!UUID.test(request_id||"")||!Array.isArray(lines)||
    lines.length<1||lines.length>30)return null;
  await assertV94AuthPrivilegeBoundary(authPool);
  const actor=await auth.authorize(token,["owner","manager","cashier"]).catch(()=>null);
  if(!actor||actor.store_id!==TEST_MARKET.store||
    !Number.isSafeInteger(actor.sv)||actor.sv<1||actor.sv>999999999)return null;
  const result=await authPool.query("SELECT $1::jsonb::text AS canonical",[JSON.stringify(lines)]);
  const canonical=result.rows?.[0]?.canonical;
  if(typeof canonical!=="string"||canonical.length>4096)return null;
  const nonce=randomBytes(16).toString("hex");
  const exp=Math.floor(clock()/1000)+45;
  const mac=createHmac("sha256",Buffer.from(proofKeyHex,"hex"))
   .update([actor.store_id,actor.user_id,actor.sv,request_id,canonical,exp,nonce].join("|"),"utf8")
   .digest("hex");
  return {store_id:actor.store_id,actor_id:actor.user_id,
    request_id,lines,proof:{nonce,exp,sv:actor.sv,mac}};
 };
}

// Only a server-side role-bound PG pool may execute this test checkout.
// Never pass a gate credential to browser, scanner, cashier station or cloud.
export function createV97TestCheckoutAdapter({authPool,gatePool,sessionSecret,proofKeyHex}){
 if(!gatePool?.query||gatePool===authPool)
  throw Error("V97_distinct_restricted_gate_pool_required");
 const issue=createV97CheckoutProofIssuer({authPool,sessionSecret,proofKeyHex});
 return async function checkout({token,request_id,lines}={}){
  const p=await issue({token,request_id,lines});
  if(!p)return {approved:false,reason:"invalid_session_or_cart"};
  const {rows}=await gatePool.query(
   "SELECT approved,reason,audit_id,sale_id,receipt_no,total_minor,replayed FROM zhirox_local.checkout_proven_fefo_v97($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)",
   [p.store_id,p.actor_id,p.request_id,JSON.stringify(p.lines),JSON.stringify(p.proof)]
  );
  if(rows?.length!==1)throw Error("V97_no_atomic_checkout_result");
  return rows[0];
 };
}
