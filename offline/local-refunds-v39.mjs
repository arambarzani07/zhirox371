// V39 isolated LAN only: dual-session manager-approved FULL-LINE cash refunds.
// Never accept client-supplied refund amounts, product IDs or stock deltas.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalCashLedgerHandlerV38} from "./local-cash-ledger-v38.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const send=(res,status,value)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(value));
};
async function parseBody(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return {status:415,error:"json_required"};
 const declared=Number(req.headers["content-length"]||0);
 if(!Number.isSafeInteger(declared)||declared<0||declared>2048)
  return {status:413,error:"payload_too_large"};
 const chunks=[];let length=0;
 try{
  for await(const c of req){
   length+=c.length;if(length>2048)return {status:413,error:"payload_too_large"};
   chunks.push(c);
  }
  const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value))
   return {status:400,error:"invalid_request"};
  return {value};
 }catch{return {status:400,error:"invalid_json"};}
}
export function createLocalRefundHandlerV39({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalCashLedgerHandlerV38({pool,secret,clock});
 return async(req,res)=>{
  let u;
  try{u=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const preview=u.pathname==="/api/local/v39/refundable-lines";
  const refund=u.pathname==="/api/local/v39/refund";
  if(!preview&&!refund)return previous(req,res);
  if(preview?req.method!=="GET":req.method!=="POST")
   return send(res,405,{error:"method_not_allowed"});
  const bearer=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const cashier=bearer?await auth.authorize(bearer[1],["cashier"]).catch(()=>null):null;
  if(!cashier)return send(res,401,{error:"cashier_session_required"});
  if(preview){
   const entries=[...u.searchParams.entries()];
   if(entries.length!==1||entries[0][0]!=="sale_id"||!UUID.test(entries[0][1]))
    return send(res,400,{error:"invalid_sale"});
   try{
    const x=await pool.query(
     "SELECT l.sale_id,l.line_no,l.name_snapshot,l.sale_mode_snapshot,l.scan_quantity,l.quantity_base_units,l.line_total_minor,(r.refund_id IS NOT NULL) AS refunded FROM zhirox_local.sale_lines l JOIN zhirox_local.receipt_snapshots_v34 v ON v.store_id=l.store_id AND v.sale_id=l.sale_id LEFT JOIN zhirox_local.cash_refunds_v39 r ON r.store_id=l.store_id AND r.sale_id=l.sale_id AND r.line_no=l.line_no WHERE l.store_id=$1::uuid AND l.sale_id=$2::uuid ORDER BY l.line_no LIMIT 100",
     [cashier.store_id,entries[0][1]]);
    return x.rows.length?send(res,200,{ok:true,lines:x.rows}):
     send(res,404,{error:"verified_sale_not_found"});
   }catch{return send(res,503,{error:"local_database_unavailable"});}
  }
  if(u.search)return send(res,400,{error:"invalid_query"});
  const parsed=await parseBody(req);
  if(parsed.error)return send(res,parsed.status,{error:parsed.error});
  const x=parsed.value;
  if(Object.keys(x).sort().join(",")!=="line_no,reason,refund_id,restock,sale_id,shift_id"||
   !UUID.test(x.refund_id||"")||!UUID.test(x.sale_id||"")||
   !UUID.test(x.shift_id||"")||!Number.isSafeInteger(x.line_no)||
   x.line_no<1||x.line_no>100||typeof x.restock!=="boolean"||
   typeof x.reason!=="string"||x.reason.trim()!==x.reason||
   x.reason.length<3||x.reason.length>240)
   return send(res,400,{error:"invalid_refund_request"});
  const approval=req.headers["x-zhirox-manager-token"];
  if(typeof approval!=="string"||approval.length>4096)
   return send(res,403,{error:"separate_manager_approval_required"});
  const manager=await auth.authorize(approval,["owner","manager"]).catch(()=>null);
  if(!manager||manager.store_id!==cashier.store_id||
   manager.user_id===cashier.user_id)
   return send(res,403,{error:"separate_manager_approval_required"});
  try{
   const r=await pool.query(
    "SELECT * FROM zhirox_local.refund_full_line_v39($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::integer,$8::boolean,$9::text)",
    [cashier.store_id,cashier.user_id,manager.user_id,x.shift_id,
     x.refund_id,x.sale_id,x.line_no,x.restock,x.reason]);
   return r.rows.length?send(res,200,{ok:true,refund:r.rows[0]}):
    send(res,503,{error:"refund_not_confirmed"});
  }catch(e){
   if(e?.code==="P3901")return send(res,403,{error:"approval_or_open_shift_required"});
   if(e?.code==="P3902")return send(res,404,{error:"verified_sale_line_not_available"});
   if(e?.code==="P3903")return send(res,409,{error:"insufficient_cash_for_refund"});
   if(["P3905","23505"].includes(e?.code))
    return send(res,409,{error:"refund_already_processed_or_conflicting"});
   if(["22023","22003"].includes(e?.code))
    return send(res,400,{error:"invalid_refund_request"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
