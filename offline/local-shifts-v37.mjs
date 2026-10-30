// V37 isolated LAN cash shifts. Store/cashier ALWAYS come from the signed,
// server-revocable V3 principal. Values are integers (IQD minor units).
// Checkout and its shift attribution are enforced in PostgreSQL by V37 SQL.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalPrintQueueHandlerV35} from "./local-print-queue-v35.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cash=n=>Number.isSafeInteger(n)&&n>=0&&n<=9999999999999;
function send(res,status,value){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(value));
}
async function body(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return {status:415,error:"json_required"};
 if(Number(req.headers["content-length"]||0)>2048)return {status:413,error:"payload_too_large"};
 let parts=[],size=0;
 try{
  for await(const chunk of req){
   size+=chunk.length;if(size>2048)return {status:413,error:"payload_too_large"};
   parts.push(chunk);
  }
  const obj=JSON.parse(Buffer.concat(parts).toString("utf8"));
  if(!obj||Array.isArray(obj)||typeof obj!=="object")
   return {status:400,error:"invalid_json"};
  return {value:obj};
 }catch{return {status:400,error:"invalid_json"};}
}
export function createLocalShiftHandlerV37({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalPrintQueueHandlerV35({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const status=url.pathname==="/api/local/v37/shift";
  const opening=url.pathname==="/api/local/v37/shift/open";
  const closing=url.pathname==="/api/local/v37/shift/close";
  if(!status&&!opening&&!closing)return previous(req,res);
  if((status&&req.method!=="GET")||(!status&&req.method!=="POST"))
   return send(res,405,{error:"method_not_allowed"});
  if(url.search)return send(res,400,{error:"invalid_query"});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const actor=match?await auth.authorize(match[1]).catch(()=>null):null;
  if(!actor)return send(res,401,{error:"invalid_session"});
  const guarded=process.env.ZHIROX_V63_DB_ACTOR_PROOF==="true";
  if(guarded&&!(typeof actor.db_proof==="string"&&/^[a-f0-9]{64}$/.test(actor.db_proof)))
    return send(res,401,{error:"invalid_db_actor_proof"});
  if(status){
   try{
    const r=await pool.query(
     "SELECT shift_id,state,opening_minor,cash_sales_minor,expected_minor,counted_minor,variance_minor,opened_at,closed_at FROM zhirox_local.cash_shifts_v37 WHERE store_id=$1::uuid AND cashier_id=$2::uuid AND state='open' LIMIT 1",
     [actor.store_id,actor.user_id]);
    return send(res,200,{ok:true,shift:r.rows[0]||null});
   }catch{return send(res,503,{error:"local_database_unavailable"});}
  }
  const input=await body(req);
  if(input.error)return send(res,input.status,{error:input.error});
  const v=input.value;
  const expected=opening?["opening_minor","shift_id"]:["counted_minor","shift_id"];
  if(Object.keys(v).sort().join(",")!==expected.sort().join(",")||
     !UUID.test(v.shift_id||"")||!cash(opening?v.opening_minor:v.counted_minor))
   return send(res,400,{error:"invalid_shift_request"});
  try{
   const r=opening?
    await pool.query(guarded?
      "SELECT * FROM zhirox_local.open_cash_shift_v63($1::text,$2::uuid,$3::uuid,$4::uuid,$5::bigint)":
      "SELECT * FROM zhirox_local.open_cash_shift_v37($1::uuid,$2::uuid,$3::uuid,$4::bigint)",
     [...(guarded?[actor.db_proof]:[]),actor.store_id,actor.user_id,v.shift_id,v.opening_minor]):
    await pool.query(guarded?
      "SELECT * FROM zhirox_local.close_cash_shift_v63($1::text,$2::uuid,$3::uuid,$4::uuid,$5::bigint)":
      "SELECT * FROM zhirox_local.close_cash_shift_v37($1::uuid,$2::uuid,$3::uuid,$4::bigint)",
     [...(guarded?[actor.db_proof]:[]),actor.store_id,actor.user_id,v.shift_id,v.counted_minor]);
   if(!r.rows?.length)return send(res,503,{error:"shift_not_confirmed"});
   return send(res,200,{ok:true,shift:r.rows[0]});
  }catch(e){
   if(e?.code==="P6301")return send(res,401,{error:"invalid_db_actor_proof"});
   if(e?.code==="P3701")return send(res,404,{error:"shift_or_cashier_not_available"});
   if(e?.code==="P3702"||e?.code==="P3703"||e?.code==="P3704"||
      e?.code==="23505"||e?.code==="23514")
    return send(res,409,{error:e.code==="P3703"?"unfinished_checkout":"shift_conflict"});
   if(e?.code==="22023"||e?.code==="22003")
    return send(res,400,{error:"invalid_shift_request"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
