// V112: isolated, server-side signed checkout of fixed single-SKU bundle/set.
// NOT an HTTP route, payment settlement, device build or market deployment.
// Only the disposable V80 database grants the restricted SQL function.
import {createV111SignedPackQuoteAdapter} from "./proven-pack-quote-v111.mjs";
import {createV97CheckoutProofIssuer} from "./proven-checkout-v97.mjs";

const packLine=x=>x&&typeof x==="object"&&!Array.isArray(x)&&
 Object.keys(x).sort().join(",")==="barcode,expected_price_minor,expected_units_per_pack,qty" &&
 typeof x.barcode==="string" && /^[A-Za-z0-9._-]{4,80}$/.test(x.barcode)&&
 Number.isSafeInteger(x.qty)&&x.qty>0&&x.qty<=100&&
 Number.isSafeInteger(x.expected_price_minor)&&x.expected_price_minor>0&&x.expected_price_minor<=999999999&&
 Number.isSafeInteger(x.expected_units_per_pack)&&x.expected_units_per_pack>=2&&x.expected_units_per_pack<=100000;

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

 // Call prepare BEFORE transmission, durably retaining request_id and
 // prepared_lines in the caller's offline intent journal for ACK-loss retry.
 // Preparation never reserves stock or consumes an authorization nonce.
 async function prepare({token,request_id,lines}={}){
  const q=await quote({token,request_id,lines});
  if(!q.eligible)return {eligible:false,reason:q.reason,checkout_authorized:false};
  if(!Array.isArray(q.line_quotes)||q.line_quotes.length!==lines.length)
   throw Error("V112_untrusted_or_incomplete_quote");
  const prepared_lines=q.line_quotes.map((entry,i)=>{
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
  return {eligible:true,reason:"prepared_not_sold",request_id,
   prepared_lines,total_minor:q.total_minor,checkout_authorized:false};
 }

 // Retry ONLY with the identical durable prepared_lines + request UUID:
 // re-quoting could fail after the original sale depleted stock.
 async function checkout({token,request_id,lines,prepared_lines}={}){
  let signedLines,anticipatedTotal;
  if(prepared_lines!==undefined){
   if(!Array.isArray(prepared_lines)||!prepared_lines.length||
    prepared_lines.length>30||!prepared_lines.every(packLine)||
    (lines!==undefined&&(
     !Array.isArray(lines)||lines.length!==prepared_lines.length||
     lines.some((x,i)=>x.barcode!==prepared_lines[i].barcode||
      x.qty!==prepared_lines[i].qty))))
    return {approved:false,reason:"invalid_prepared_pack_intent",payment_settled:false};
   signedLines=prepared_lines;
   anticipatedTotal=prepared_lines.reduce((sum,x)=>
    sum+BigInt(x.qty)*BigInt(x.expected_price_minor),0n);
   if(anticipatedTotal>9999999999999n)
    return {approved:false,reason:"invalid_prepared_pack_intent",payment_settled:false};
  }else{
   const p=await prepare({token,request_id,lines});
   if(!p.eligible)return {approved:false,reason:p.reason,payment_settled:false};
   signedLines=p.prepared_lines;
   anticipatedTotal=BigInt(p.total_minor);
  }
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
  if(r.approved===true&&String(r.total_minor)!==anticipatedTotal.toString())
   throw Error("V112_server_total_disagrees_with_signed_intent");
  return {...r,prepared_lines:signedLines,payment_settled:false,
   physical_stock_verified:false,refund_authorized:false,
   scope:"disposable_test_only"};
 }
 checkout.prepare=prepare;
 return checkout;
}
