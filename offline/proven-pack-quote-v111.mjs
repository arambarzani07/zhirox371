// V111 isolated PostgreSQL server-only, authenticated, read-only FEFO pack quote.
// Deliberately no checkout, commit, refund or money-changing HTTP route.
// Both pools are server-side: never export the restricted database credential
// or HMAC secret to browser clients, cashiers or connected market networks.
import {createV97CheckoutProofIssuer} from "./proven-checkout-v97.mjs";
const packLine=l=>l&&typeof l==="object"&&!Array.isArray(l) &&
 Object.keys(l).sort().join(",")==="barcode,qty" &&
 typeof l.barcode==="string" && /^[A-Za-z0-9._-]{4,80}$/.test(l.barcode) &&
 Number.isSafeInteger(l.qty)&&l.qty>0&&l.qty<=100;

export function createV111SignedPackQuoteAdapter({authPool,gatePool,sessionSecret,proofKeyHex}={}){
 if(!authPool?.query||!authPool?.connect||!gatePool?.query||
    authPool===gatePool||!sessionSecret||
    typeof proofKeyHex!=="string"||!/^[0-9a-f]{64}$/.test(proofKeyHex))
   throw Error("V111_distinct_restricted_server_pools_required");
 const issue=createV97CheckoutProofIssuer({authPool,sessionSecret,proofKeyHex});
 return async function quote({token,request_id,lines}={}){
  if(!Array.isArray(lines)||lines.length<1||lines.length>30||
     !lines.every(packLine))return {eligible:false,reason:"invalid_pack_quote"};
  const signed=await issue({token,request_id,lines});
  if(!signed)return {eligible:false,reason:"invalid_session_or_quote"};
  const {rows}=await gatePool.query(
   "SELECT eligible,reason,total_minor,required_base_units,line_quotes FROM zhirox_local.quote_proven_fefo_pack_v111($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)",
   [signed.store_id,signed.actor_id,signed.request_id,
    JSON.stringify(signed.lines),JSON.stringify(signed.proof)]
  );
  if(rows?.length!==1)throw Error("V111_missing_signed_quote");
  return {
   eligible:rows[0].eligible===true,reason:rows[0].reason,
   total_minor:rows[0].total_minor,
   required_base_units:rows[0].required_base_units,
   line_quotes:rows[0].line_quotes,
   checkout_authorized:false // An advisory quote NEVER becomes a stock hold.
  };
 };
}
