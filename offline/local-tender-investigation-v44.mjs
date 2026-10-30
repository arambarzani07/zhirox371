// V44 lab-only supervisor work queue. This module cannot confirm bank funds,
// create receipts, cancel captured intents, release held stock or invoke a
// payment provider. All findings are attributed to the signed local manager.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalReservationHandlerV43} from "./local-reservation-v43.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(["review_opened","provider_contacted","escalated","note_added"]);
function send(res,status,data){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(data));
}
async function readBody(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return {error:"json_required",status:415};
 const len=Number(req.headers["content-length"]||0);
 if(!Number.isSafeInteger(len)||len<0||len>1024)
  return {error:"payload_too_large",status:413};
 let n=0;const chunks=[];
 try{
  for await(const chunk of req){
   n+=chunk.length;if(n>1024)return {error:"payload_too_large",status:413};
   chunks.push(chunk);
  }
  const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value))
   return {error:"invalid_body",status:400};
  return {value};
 }catch{return {error:"invalid_json",status:400};}
}
export function createLocalTenderInvestigationHandlerV44({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const earlier=createLocalReservationHandlerV43({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const pending=url.pathname==="/api/local/v44/pending-tenders";
  const history=url.pathname==="/api/local/v44/review-history";
  const journal=url.pathname==="/api/local/v44/review-event";
  if(!pending&&!history&&!journal)return earlier(req,res);
  if(journal?req.method!=="POST":req.method!=="GET")
   return send(res,405,{error:"method_not_allowed"});
  const m=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const manager=m?await auth.authorize(m[1],["owner","manager"]).catch(()=>null):null;
  if(!manager)return send(res,403,{error:"manager_session_required"});
  try{
   if(pending){
    if(url.search)return send(res,400,{error:"invalid_query"});
    const result=await pool.query(
     "SELECT * FROM zhirox_local.pending_tender_cases_v44($1::uuid)",
     [manager.store_id]);
    return send(res,200,{ok:true,cases:result.rows,limit:100,
     provider_payment_verified:false,manual_review_does_not_settle:true});
   }
   if(history){
    const q=[...url.searchParams.entries()];
    if(q.length!==1||q[0][0]!=="request_id"||!UUID.test(q[0][1]))
     return send(res,400,{error:"invalid_query"});
    const result=await pool.query(
     "SELECT j.event_id,j.request_id,j.manager_id,j.action,j.note,j.created_at FROM zhirox_local.tender_review_events_v44 j WHERE j.store_id=$1::uuid AND j.request_id=$2::uuid ORDER BY j.created_at DESC,j.event_id DESC LIMIT 100",
     [manager.store_id,q[0][1]]);
    return send(res,200,{ok:true,events:result.rows,limit:100});
   }
   if(url.search)return send(res,400,{error:"invalid_query"});
   const parsed=await readBody(req);
   if(parsed.error)return send(res,parsed.status,{error:parsed.error});
   const x=parsed.value;
   if(Object.keys(x).sort().join(",")!=="action,event_id,note,request_id"||
    !UUID.test(x.event_id||"")||!UUID.test(x.request_id||"")||
    !ACTIONS.has(x.action)||typeof x.note!=="string"||
    x.note.length<5||x.note.length>240||x.note!==x.note.trim())
    return send(res,400,{error:"invalid_review_event"});
   const result=await pool.query(
    "SELECT * FROM zhirox_local.record_tender_review_v44($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text)",
    [manager.store_id,manager.user_id,x.request_id,x.event_id,x.action,x.note]);
   if(!result.rows.length)return send(res,503,{error:"review_unconfirmed"});
   return send(res,200,{ok:true,event:result.rows[0],
    provider_payment_verified:false,manual_review_does_not_settle:true});
  }catch(e){
   if(e?.code==="P4401")return send(res,403,{error:"manager_not_enabled"});
   if(e?.code==="P4402")return send(res,409,{error:"case_no_longer_pending"});
   if(["P4403","23505"].includes(e?.code))
    return send(res,409,{error:"immutable_review_conflict"});
   if(e?.code==="22023")return send(res,400,{error:"invalid_review_event"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
