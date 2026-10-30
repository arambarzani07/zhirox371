// V38 local offline cash journal — opt-in disposable LAN test ONLY.
// All identities from signed local V3 principal; never from client payload.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalShiftHandlerV37} from "./local-shifts-v37.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const amount=n=>Number.isSafeInteger(n)&&n>=1&&n<=9999999999999;
function send(res,status,payload){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(payload));
}
async function parse(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return {error:"json_required",status:415};
 const declared=Number(req.headers["content-length"]||"0");
 if(!Number.isSafeInteger(declared)||declared<0||declared>4096)
  return {error:"payload_too_large",status:413};
 const chunks=[];let size=0;
 try{
  for await(const c of req){
   size+=c.length;
   if(size>4096)return {error:"payload_too_large",status:413};
   chunks.push(c);
  }
  const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value))
   return {error:"invalid_json",status:400};
  return {value};
 }catch{return {error:"invalid_json",status:400};}
}
export function createLocalCashLedgerHandlerV38({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalShiftHandlerV37({pool,secret,clock});
 return async(req,res)=>{
  let u;
  try{u=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const movement=u.pathname==="/api/local/v38/movement";
  const summary=u.pathname==="/api/local/v38/summary";
  const list=u.pathname==="/api/local/v38/movements";
  const close=u.pathname==="/api/local/v37/shift/close";
  if(!movement&&!summary&&!list&&!close)return previous(req,res);
  if((movement||close)?req.method!=="POST":req.method!=="GET")
   return send(res,405,{error:"method_not_allowed"});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const actor=match?await auth.authorize(match[1]).catch(()=>null):null;
  if(!actor)return send(res,401,{error:"invalid_session"});
  if(summary||list){
   const entries=[...u.searchParams.entries()];
   if(entries.length!==1||entries[0][0]!=="shift_id"||!UUID.test(entries[0][1]))
    return send(res,400,{error:"invalid_query"});
   const args=[actor.store_id,actor.user_id,entries[0][1]];
   try{
    const result=summary?
     await pool.query(
      "SELECT * FROM zhirox_local.cash_summary_v38($1::uuid,$2::uuid,$3::uuid)",args):
     await pool.query(
      "SELECT entry_id,shift_id,kind,amount_minor,reason,created_at FROM zhirox_local.cash_movements_v38 WHERE store_id=$1::uuid AND cashier_id=$2::uuid AND shift_id=$3::uuid ORDER BY created_at DESC,entry_id DESC LIMIT 100",args);
    if(summary&&!result.rows.length)return send(res,404,{error:"shift_not_found"});
    return send(res,200,summary?{ok:true,summary:result.rows[0]}:
      {ok:true,movements:result.rows,limit:100});
   }catch(e){
    return send(res,e?.code==="P3801"?404:503,{error:e?.code==="P3801"?
      "shift_not_found":"local_database_unavailable"});
   }
  }
  if(u.search)return send(res,400,{error:"invalid_query"});
  const parsed=await parse(req);
  if(parsed.error)return send(res,parsed.status,{error:parsed.error});
  const v=parsed.value;
  const keys=Object.keys(v).sort().join(",");
  if(movement){
   if(keys!=="amount_minor,entry_id,kind,reason,shift_id"||
      !UUID.test(v.entry_id||"")||!UUID.test(v.shift_id||"")||
      !["cash_in","cash_out","expense"].includes(v.kind)||
      !amount(v.amount_minor)||typeof v.reason!=="string"||
      v.reason.length<3||v.reason.length>240||
      v.reason.trim()!==v.reason)
    return send(res,400,{error:"invalid_movement"});
  }else{
   if(keys!=="counted_minor,shift_id"||!UUID.test(v.shift_id||"")||
      !Number.isSafeInteger(v.counted_minor)||v.counted_minor<0||
      v.counted_minor>9999999999999)
    return send(res,400,{error:"invalid_close"});
  }
  try{
   const result=movement?
    await pool.query(
     "SELECT * FROM zhirox_local.record_cash_movement_v38($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::text)",
     [actor.store_id,actor.user_id,v.shift_id,v.entry_id,v.kind,v.amount_minor,v.reason]):
    await pool.query(
     "SELECT * FROM zhirox_local.close_cash_shift_v38($1::uuid,$2::uuid,$3::uuid,$4::bigint)",
     [actor.store_id,actor.user_id,v.shift_id,v.counted_minor]);
   if(!result.rows.length)return send(res,503,{error:"cash_operation_unconfirmed"});
   return send(res,200,movement?{ok:true,movement:result.rows[0]}:
    {ok:true,shift:result.rows[0]});
  }catch(e){
   if(e?.code==="P3801")return send(res,404,{error:"shift_not_available"});
   if(["P3802","P3803","P3804","P3805","P3703","23505"].includes(e?.code))
    return send(res,409,{error:e?.code==="P3802"?"insufficient_cash":
     e?.code==="P3703"?"unfinished_checkout":"cash_conflict"});
   if(["22023","22003"].includes(e?.code))
    return send(res,400,{error:"invalid_cash_amount"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
