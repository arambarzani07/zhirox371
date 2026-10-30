// V35 isolated LAN trial: request and inspect a *durable* print intent.
// Printing hardware is deliberately NOT connected: "queued" != "printed".
// Live requests MUST pass through V33 TLS/peer/origin gate.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalReceiptHandlerV34} from "./local-receipts-v34.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const send=(res,status,body)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(body));
};
async function parseBody(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return {status:415,error:"json_required"};
 const declared=Number(req.headers["content-length"]||"0");
 if(!Number.isFinite(declared)||declared<0||declared>2048)
  return {status:413,error:"payload_too_large"};
 let length=0,parts=[];
 try{
  for await(const part of req){
   length+=part.length;
   if(length>2048)return {status:413,error:"payload_too_large"};
   parts.push(part);
  }
  const value=JSON.parse(Buffer.concat(parts).toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value)||
     Object.keys(value).sort().join(",")!=="job_id,sale_id,width_mm"||
     !UUID.test(value.sale_id||"")||!UUID.test(value.job_id||"")||
     (value.width_mm!==58&&value.width_mm!==80))
   return {status:400,error:"invalid_print_request"};
  return {value};
 }catch{return {status:400,error:"invalid_json"};}
}
export function createLocalPrintQueueHandlerV35({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalReceiptHandlerV34({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  if(url.pathname!=="/api/local/v35/print-jobs")return previous(req,res);
  if(req.method!=="POST"&&req.method!=="GET")
   return send(res,405,{error:"method_not_allowed"});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const actor=match?await auth.authorize(match[1]).catch(()=>null):null;
  if(!actor)return send(res,401,{error:"invalid_session"});
  if(req.method==="GET"){
   const entries=[...url.searchParams.entries()];
   if(entries.length!==1||entries[0][0]!=="job_id"||!UUID.test(entries[0][1]))
    return send(res,400,{error:"invalid_job_query"});
   try{
    const out=await pool.query(
     "SELECT job_id,sale_id,width_mm,state,created_at,processed_at FROM zhirox_local.print_requests_v35 WHERE store_id=$1::uuid AND cashier_id=$2::uuid AND job_id=$3::uuid",
     [actor.store_id,actor.user_id,entries[0][1]]);
    return out.rows.length?send(res,200,{ok:true,job:out.rows[0],
      hardware_printed:out.rows[0].state==="printed"}):
      send(res,404,{error:"print_job_not_found"});
   }catch{return send(res,503,{error:"local_database_unavailable"});}
  }
  if(url.search)return send(res,400,{error:"invalid_print_query"});
  const parsed=await parseBody(req);
  if(parsed.error)return send(res,parsed.status,{error:parsed.error});
  const {sale_id,job_id,width_mm}=parsed.value;
  try{
   const out=await pool.query(
    "SELECT * FROM zhirox_local.queue_print_v35($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::smallint)",
    [actor.store_id,actor.user_id,sale_id,job_id,width_mm]);
   if(!out.rows.length)return send(res,503,{error:"print_queue_unavailable"});
   return send(res,202,{ok:true,job:out.rows[0],
     hardware_printed:false,
     notice:"Queue-only test. Physical printer worker is not installed."});
  }catch(e){
   if(e?.code==="P3501")return send(res,404,{error:"verified_receipt_not_found"});
   if(e?.code==="P3502"||e?.code==="23505")return send(res,409,{error:"duplicate_or_conflicting_print_request"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
