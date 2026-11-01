// V96 local CI test-market only: issue a short-lived HMAC actor proof only
// after a real V94 restricted-auth session verifies successfully.
// PostgreSQL independently validates this signature and one-use nonce.
// THIS DOES NOT CHARGE MONEY, MUTATE STOCK OR AUTHORIZE A REAL CHECKOUT.
import {createHmac,randomBytes} from "node:crypto";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {assertV94AuthPrivilegeBoundary} from "./local-test-market-v94.mjs";
import {TEST_MARKET} from "./test-market-v80.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createV96ProofIssuer({authPool,sessionSecret,proofKeyHex,clock=()=>Date.now()}){
 if(!authPool?.query||!authPool?.connect||!sessionSecret||
  typeof proofKeyHex!=="string"||!/^[0-9a-f]{64}$/.test(proofKeyHex))
  throw Error("V96_dedicated_auth_pool_and_HMAC_key_required");
 const auth=createLocalAuthV3({pool:authPool,secret:sessionSecret,clock});
 return async function issue({token,request_id,lines}={}){
  if(!UUID.test(request_id||"")||!Array.isArray(lines)||
   lines.length<1||lines.length>30)return null;
  await assertV94AuthPrivilegeBoundary(authPool);
  const actor=await auth.authorize(token,["owner","manager","cashier"]).catch(()=>null);
  if(!actor||actor.store_id!==TEST_MARKET.store)return null;
  // PostgreSQL jsonb has its own text canonicalization. Get the exact byte
  // representation as text under the low-privilege auth connection, then sign.
  const result=await authPool.query("SELECT $1::jsonb::text AS canonical",
   [JSON.stringify(lines)]);
  const canonical=result.rows?.[0]?.canonical;
  if(typeof canonical!=="string"||canonical.length>4096)return null;
  const nonce=randomBytes(16).toString("hex");
  const exp=Math.floor(clock()/1000)+45;
  const message=[actor.store_id,actor.user_id,request_id,canonical,exp,nonce].join("|");
  const mac=createHmac("sha256",Buffer.from(proofKeyHex,"hex"))
   .update(message,"utf8").digest("hex");
  return {
   store_id:actor.store_id,actor_id:actor.user_id,request_id,lines,
   proof:{nonce,exp,mac}
  };
 };
}
