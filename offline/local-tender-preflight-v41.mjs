// V41: unverified external tender quotes, NOT bank/card payment processing.
// CASH-only V31 remains the ONLY committable tender until trusted provider
// settlement integration is deployed and independently verified.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalPartialRefundHandlerV40} from "./local-partial-refunds-v40.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res,status,value){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(value));
}
async function json(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return {status:415,error:"json_required"};
 const len=Number(req.headers["content-length"]||0);
 if(!Number.isSafeInteger(len)||len<0||len>2048)
  return {status:413,error:"payload_too_large"};
 let n=0;const chunks=[];
 try{
  for await(const chunk of req){
   n+=chunk.length;if(n>2048)return {status:413,error:"payload_too_large"};
   chunks.push(chunk);
  }
  const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value))
   return {status:400,error:"invalid_body"};
  return {value};
 }catch{return {status:400,error:"invalid_json"};}
}
export function createLocalTenderPreflightHandlerV41({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalPartialRefundHandlerV40({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const post=url.pathname==="/api/local/v41/tender-plan";
  const get=url.pathname==="/api/local/v41/tender-status";
  if(!post&&!get)return previous(req,res);
  if(post?req.method!=="POST":req.method!=="GET")
   return send(res,405,{error:"method_not_allowed"});
  const bearer=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const cashier=bearer?await auth.authorize(bearer[1],["cashier"]).catch(()=>null):null;
  if(!cashier)return send(res,401,{error:"cashier_session_required"});
  if(get){
   const q=[...url.searchParams.entries()];
   if(q.length!==1||q[0][0]!=="request_id"||!UUID.test(q[0][1]))
    return send(res,400,{error:"invalid_query"});
   try{
    const rows=await pool.query(
     "SELECT p.request_id,p.cash_minor,p.external_minor,p.external_method,p.state,p.created_at,i.state AS intent_state FROM zhirox_local.tender_plans_v41 p JOIN zhirox_local.checkout_intents_v31 i ON i.store_id=p.store_id AND i.request_id=p.request_id WHERE p.store_id=$1::uuid AND p.cashier_id=$2::uuid AND p.request_id=$3::uuid",
     [cashier.store_id,cashier.user_id,q[0][1]]);
    return send(res,200,{ok:true,plan:rows.rows[0]||null,
     external_settlement_supported:false});
   }catch{return send(res,503,{error:"local_database_unavailable"});}
  }
  if(url.search)return send(res,400,{error:"invalid_query"});
  const parsed=await json(req);
  if(parsed.error)return send(res,parsed.status,{error:parsed.error});
  const x=parsed.value;
  if(Object.keys(x).sort().join(",")!=="cash_minor,external_method,external_minor,request_id"||
    !UUID.test(x.request_id||"")||
    !Number.isSafeInteger(x.cash_minor)||!Number.isSafeInteger(x.external_minor)||
    x.cash_minor<0||x.external_minor<0||x.cash_minor+x.external_minor>9999999999999||
    x.cash_minor+x.external_minor===0||
    !["none","card","bank_transfer"].includes(x.external_method)||
    (x.external_minor===0&&(x.external_method!=="none"||x.cash_minor===0))||
    (x.external_minor>0&&x.external_method==="none"))
    return send(res,400,{error:"invalid_tender_plan"});
  try{
   const result=await pool.query(
    "SELECT * FROM zhirox_local.plan_tender_v41($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::bigint,$6::text)",
    [cashier.store_id,cashier.user_id,x.request_id,x.cash_minor,
     x.external_minor,x.external_method]);
   if(!result.rows.length)return send(res,503,{error:"tender_plan_not_confirmed"});
   return send(res,200,{ok:true,plan:result.rows[0],
    external_settlement_supported:false,
    checkout_allowed:result.rows[0].state==="cash_ready"});
  }catch(e){
   if(["P4102","P4103","23505"].includes(e?.code))
    return send(res,409,{error:"tender_plan_conflict_or_unprepared_intent"});
   if(e?.code==="22023")return send(res,400,{error:"invalid_tender_plan"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
