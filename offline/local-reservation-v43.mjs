// V43 private LAN TEST API. Reserves validated unit/carton stock only.
// NEVER captures, verifies or settles a bank payment.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalTenderReportHandlerV42} from "./local-tender-report-v42.mjs";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res,code,data){
 res.writeHead(code,{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(data));
}
export function createLocalReservationHandlerV43({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalTenderReportHandlerV42({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const hold=url.pathname==="/api/local/v43/reserve";
  const status=url.pathname==="/api/local/v43/reservation-status";
  if(!hold&&!status)return previous(req,res);
  if(hold?req.method!=="POST":req.method!=="GET")
   return send(res,405,{error:"method_not_allowed"});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const actor=match?await auth.authorize(match[1],["cashier"]).catch(()=>null):null;
  if(!actor)return send(res,401,{error:"cashier_session_required"});
  let requestId;
  if(status){
   const q=[...url.searchParams.entries()];
   if(q.length!==1||q[0][0]!=="request_id"||!uuid.test(q[0][1]))
    return send(res,400,{error:"invalid_query"});
   requestId=q[0][1];
  }else{
   if(url.search)return send(res,400,{error:"invalid_query"});
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
    return send(res,415,{error:"json_required"});
   const len=Number(req.headers["content-length"]||"0");
   if(!Number.isSafeInteger(len)||len<0||len>256)
    return send(res,413,{error:"payload_too_large"});
   const chunks=[];let bytes=0;
   try{
    for await(const part of req){
     bytes+=part.length;
     if(bytes>256)return send(res,413,{error:"payload_too_large"});
     chunks.push(part);
    }
    const data=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!data||typeof data!=="object"||Array.isArray(data)||
     Object.keys(data).join(",")!=="request_id"||!uuid.test(data.request_id))
     return send(res,400,{error:"invalid_reservation_request"});
    requestId=data.request_id;
   }catch{return send(res,400,{error:"invalid_json"});}
  }
  try{
   if(hold){
    const result=await pool.query(
     "SELECT * FROM zhirox_local.hold_checkout_reservation_v43($1::uuid,$2::uuid,$3::uuid)",
     [actor.store_id,actor.user_id,requestId]);
    if(!result.rows.length)return send(res,503,{error:"reservation_unconfirmed"});
    return send(res,200,{ok:true,reservation:result.rows[0],
     provider_payment_verified:false,external_settlement_supported:false});
   }
   const result=await pool.query(
    "SELECT h.request_id,h.state,h.expires_at,h.quoted_total_minor,clock_timestamp()>=h.expires_at AS expired, EXISTS(SELECT 1 FROM zhirox_local.external_settlements_v42 e WHERE e.store_id=h.store_id AND e.request_id=h.request_id) AS external_evidence_recorded FROM zhirox_local.inventory_reservation_sessions_v43 h WHERE h.store_id=$1::uuid AND h.cashier_id=$2::uuid AND h.request_id=$3::uuid",
    [actor.store_id,actor.user_id,requestId]);
   return send(res,200,{ok:true,reservation:result.rows[0]||null,
    provider_payment_verified:false,external_settlement_supported:false});
  }catch(e){
   const err=e?.code;
   if(err==="P4301")return send(res,409,{error:"insufficient_unreserved_stock"});
   if(err==="P4302")return send(res,409,{error:"stale_price_or_barcode"});
   if(err==="P4304")return send(res,409,{error:"scale_reservation_not_supported"});
   if(err==="P4305")return send(res,409,{error:"expired_needs_reconciliation"});
   if(err==="P4303")return send(res,409,{error:"invalid_reservation_state"});
   if(err==="22023")return send(res,400,{error:"invalid_reservation_request"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
