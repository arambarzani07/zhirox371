// V112: isolated, server-side signed checkout of fixed single-SKU bundle/set.
// NOT an HTTP route, payment settlement, device build or market deployment.
// Only the disposable V80 database grants the restricted SQL function.
import {createV111SignedPackQuoteAdapter} from "./proven-pack-quote-v111.mjs";
import {createV97CheckoutProofIssuer} from "./proven-checkout-v97.mjs";

export function createV112SignedPackCheckoutAdapter({
 authPool,gatePool,sessionSecret,proofKeyHex
}={}){
 if(!authPool?.query||!authPool?.connect||!gatePool?.query||
  authPool===gatePool||!sessionSecret||typeof proofKeyHex!=="string"||
  !/^[0-9a-f]{64}$/.test(proofKeyHex))
   throw Error("V112_distinct_server_only_auth_gate_pools_required");
 const quote=createV111SignedPackQuoteAdapter({
  authPool,gatePool,sessionSecret,proofKeyHex
 });
 const issue=createV97CheckoutProofIssuer({
  authPool,sessionSecret,proofKeyHex
 });
 return async function checkout({token,request_id,lines}={}){
  const q=await quote({token,request_id,lines});
  if(!q.eligible)return {approved:false,reason:q.reason,
   payment_settled:false,physical_stock_verified:false};
  if(!Array.isArray(q.line_quotes)||q.line_quotes.length!==lines.length)
   throw Error("V112_untrusted_or_incomplete_quote");
  const signedLines=q.line_quotes.map((entry,i)=>{
   const original=lines[i];
   if(entry.barcode!==original.barcode||entry.packs!==original.qty||
    !["bundle","set"].includes(entry.mode)||
    !Number.isSafeInteger(entry.price_minor)||entry.price_minor<1||
    !Number.isSafeInteger(entry.units_per_pack)||entry.units_per_pack<2)
    throw Error("V112_quote_does_not_match_request");
   return {barcode:entry.barcode,qty:entry.packs,
    expected_price_minor:entry.price_minor,
    expected_units_per_pack:entry.units_per_pack};
  });
  const proof=await issue({token,request_id,lines:signedLines});
  if(!proof)return {approved:false,reason:"invalid_session_or_checkout",
   payment_settled:false,physical_stock_verified:false};
  const {rows}=await gatePool.query(
   "SELECT approved,reason,audit_id,sale_id,receipt_no,total_minor,replayed FROM zhirox_local.checkout_proven_pack_fefo_v112($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)",
   [proof.store_id,proof.actor_id,proof.request_id,
    JSON.stringify(proof.lines),JSON.stringify(proof.proof)]
  );
  if(rows?.length!==1)throw Error("V112_no_atomic_pack_result");
  const r=rows[0];
  if(r.approved===true&&!r.replayed&&String(r.total_minor)!==String(q.total_minor))
   throw Error("V112_server_total_disagrees_with_quote");
  return {...r,payment_settled:false,physical_stock_verified:false,
   refund_authorized:false,scope:"disposable_test_only"};
 };
}
