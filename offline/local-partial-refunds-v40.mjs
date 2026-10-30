// V40 disposable-LAN partial cash returns. Independent, revoked cashier
// session + independent manager approval. No client-supplied totals or prices.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalRefundHandlerV39} from "./local-refunds-v39.mjs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const send=(res,status,value)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(value));
};
async function readJSON(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return {status:415,error:"json_required"};
 const len=Number(req.headers["content-length"]||0);
 if(!Number.isSafeInteger(len)||len<0||len>2048)return {status:413,error:"payload_too_large"};
 const chunks=[];let n=0;
 try{
  for await(const x of req){n+=x.length;if(n>2048)return {status:413,error:"payload_too_large"};chunks.push(x);}
  const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value))
   return {status:400,error:"invalid_body"};
  return {value};
 }catch{return {status:400,error:"invalid_json"};}
}
export function createLocalPartialRefundHandlerV40({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalRefundHandlerV39({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const preview=url.pathname==="/api/local/v40/refundable-lines";
  const partial=url.pathname==="/api/local/v40/partial-refund";
  if(!preview&&!partial)return previous(req,res);
  if((preview&&req.method!=="GET")||(partial&&req.method!=="POST"))
   return send(res,405,{error:"method_not_allowed"});
  const bearer=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const cashier=bearer?await auth.authorize(bearer[1],["cashier"]).catch(()=>null):null;
  if(!cashier)return send(res,401,{error:"cashier_session_required"});
  if(preview){
   const q=[...url.searchParams.entries()];
   if(q.length!==1||q[0][0]!=="sale_id"||!uuid.test(q[0][1]))
    return send(res,400,{error:"invalid_sale_query"});
   try{
    const out=await pool.query(
     "SELECT l.sale_id,l.line_no,l.name_snapshot,l.sale_mode_snapshot,l.scan_quantity,l.quantity_base_units,l.line_total_minor,COALESCE(p.returned_base_units,0) AS returned_base_units,COALESCE(p.refunded_minor,0) AS refunded_minor,(f.refund_id IS NOT NULL) AS fully_refunded FROM zhirox_local.sale_lines l JOIN zhirox_local.receipt_snapshots_v34 v ON v.store_id=l.store_id AND v.sale_id=l.sale_id LEFT JOIN LATERAL (SELECT SUM(r.quantity_base_units) AS returned_base_units,SUM(r.refund_minor) AS refunded_minor FROM zhirox_local.partial_cash_refunds_v40 r WHERE r.store_id=l.store_id AND r.sale_id=l.sale_id AND r.line_no=l.line_no) p ON true LEFT JOIN zhirox_local.cash_refunds_v39 f ON f.store_id=l.store_id AND f.sale_id=l.sale_id AND f.line_no=l.line_no WHERE l.store_id=$1::uuid AND l.sale_id=$2::uuid ORDER BY l.line_no LIMIT 100",
     [cashier.store_id,q[0][1]]);
    return send(res,out.rows.length?200:404,
     out.rows.length?{ok:true,lines:out.rows}:{error:"verified_sale_not_found"});
   }catch{return send(res,503,{error:"local_database_unavailable"});}
  }
  if(url.search)return send(res,400,{error:"invalid_query"});
  const parsed=await readJSON(req);
  if(parsed.error)return send(res,parsed.status,{error:parsed.error});
  const x=parsed.value;
  if(Object.keys(x).sort().join(",")!=="line_no,quantity_base_units,reason,refund_id,restock,sale_id,shift_id"||
   !uuid.test(x.refund_id||"")||!uuid.test(x.sale_id||"")||
   !uuid.test(x.shift_id||"")||!Number.isSafeInteger(x.line_no)||
   x.line_no<1||x.line_no>100||!Number.isSafeInteger(x.quantity_base_units)||
   x.quantity_base_units<=0||typeof x.restock!=="boolean"||
   typeof x.reason!=="string"||x.reason!==x.reason.trim()||
   x.reason.length<3||x.reason.length>240)
   return send(res,400,{error:"invalid_partial_refund"});
  const approval=req.headers["x-zhirox-manager-token"];
  if(typeof approval!=="string"||approval.length>4096)
   return send(res,403,{error:"manager_approval_required"});
  const manager=await auth.authorize(approval,["owner","manager"]).catch(()=>null);
  if(!manager||manager.store_id!==cashier.store_id||manager.user_id===cashier.user_id)
   return send(res,403,{error:"separate_manager_required"});
  try{
   const out=await pool.query(
    "SELECT * FROM zhirox_local.refund_partial_line_v40($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::integer,$8::bigint,$9::boolean,$10::text)",
    [cashier.store_id,cashier.user_id,manager.user_id,x.shift_id,
      x.refund_id,x.sale_id,x.line_no,x.quantity_base_units,x.restock,x.reason]);
   return send(res,out.rows.length?200:503,
    out.rows.length?{ok:true,refund:out.rows[0]}:{error:"refund_not_confirmed"});
  }catch(e){
   if(e?.code==="P4001")return send(res,403,{error:"approval_or_shift_unavailable"});
   if(e?.code==="P4002")return send(res,409,{error:"quantity_exceeds_remaining_or_line_fully_refunded"});
   if(e?.code==="P4005")return send(res,409,{error:"insufficient_cash"});
   if(["P4003","P4006","23505"].includes(e?.code))
    return send(res,409,{error:"refund_conflict"});
   if(["22003","22023"].includes(e?.code))return send(res,400,{error:"invalid_partial_refund"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
