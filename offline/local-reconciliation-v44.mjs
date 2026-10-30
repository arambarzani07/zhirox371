// V44 — manager-only read/review of unresolved bank cases in disposable LAN.
// No endpoint can set paid, reverse funds, cancel a hold, or post a sale.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalReservationHandlerV43} from "./local-reservation-v43.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res,status,payload){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(payload));
}
async function read(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return {status:415,error:"json_required"};
 const n=Number(req.headers["content-length"]||"0");
 if(!Number.isSafeInteger(n)||n<0||n>1200)return {status:413,error:"payload_too_large"};
 const chunks=[];let length=0;
 try{
  for await(const c of req){
   length+=c.length;if(length>1200)return {status:413,error:"payload_too_large"};
   chunks.push(c);
  }
  const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if(!body||typeof body!=="object"||Array.isArray(body))
   return {status:400,error:"invalid_body"};
  return {body};
 }catch{return {status:400,error:"invalid_json"};}
}
export function createLocalReconciliationHandlerV44({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalReservationHandlerV43({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const list=url.pathname==="/api/local/v44/bank-exceptions";
  const notes=url.pathname==="/api/local/v44/review-notes";
  if(!list&&!notes)return previous(req,res);
  if(list?req.method!=="GET":!["GET","POST"].includes(req.method))
   return send(res,405,{error:"method_not_allowed"});
  const bearer=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const actor=bearer?await auth.authorize(bearer[1],["owner","manager"]).catch(()=>null):null;
  if(!actor)return send(res,403,{error:"manager_session_required"});
  if(list){
   const q=[...url.searchParams.entries()];
   if(q.length>1||(q.length===1&&q[0][0]!=="limit"))
    return send(res,400,{error:"invalid_query"});
   const limit=q.length?Number(q[0][1]):100;
   if(!Number.isSafeInteger(limit)||limit<1||limit>100||
     (q.length&&!/^[1-9][0-9]{0,2}$/.test(q[0][1])))
    return send(res,400,{error:"invalid_limit"});
   try{
    const r=await pool.query(
     "SELECT * FROM zhirox_local.tender_exceptions_v44($1::uuid,$2::integer)",
     [actor.store_id,limit]);
    return send(res,200,{ok:true,cases:r.rows,
      provider_payment_verified:false,operator_actions_are_notes_only:true});
   }catch{return send(res,503,{error:"local_database_unavailable"});}
  }
  if(req.method==="GET"){
   const q=[...url.searchParams.entries()];
   if(q.length!==1||q[0][0]!=="request_id"||!UUID.test(q[0][1]))
    return send(res,400,{error:"invalid_query"});
   try{
    const r=await pool.query(
     "SELECT n.note_id,n.request_id,n.manager_id,n.category,n.note,n.created_at FROM zhirox_local.tender_review_notes_v44 n WHERE n.store_id=$1::uuid AND n.request_id=$2::uuid ORDER BY n.created_at,n.note_id LIMIT 100",
     [actor.store_id,q[0][1]]);
    return send(res,200,{ok:true,notes:r.rows});
   }catch{return send(res,503,{error:"local_database_unavailable"});}
  }
  if(url.search)return send(res,400,{error:"invalid_query"});
  const parsed=await read(req);
  if(parsed.error)return send(res,parsed.status,{error:parsed.error});
  const x=parsed.body;
  if(Object.keys(x).sort().join(",")!=="category,note,note_id,request_id"||
   !UUID.test(x.note_id||"")||!UUID.test(x.request_id||"")||
   typeof x.note!=="string"||x.note!==x.note.trim()||
   x.note.length<10||x.note.length>500||
   !["investigating","contacted_provider","awaiting_bank_response",
     "requires_supervisor_followup","hardware_network_check"].includes(x.category))
   return send(res,400,{error:"invalid_review_note"});
  try{
   const r=await pool.query(
    "SELECT * FROM zhirox_local.record_review_note_v44($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text)",
    [actor.store_id,actor.user_id,x.note_id,x.request_id,x.category,x.note]);
   if(!r.rows.length)return send(res,503,{error:"review_note_unconfirmed"});
   return send(res,200,{ok:true,review:r.rows[0],
    bank_payment_confirmed:false,funds_refunded:false,
    inventory_hold_released:false});
  }catch(e){
   if(e?.code==="P4401")return send(res,403,{error:"manager_disabled_or_invalid"});
   if(e?.code==="P4402")return send(res,404,{error:"external_plan_not_found"});
   if(["P4403","23505"].includes(e?.code))
    return send(res,409,{error:"immutable_review_note_conflict"});
   if(e?.code==="22023")return send(res,400,{error:"invalid_review_note"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
