// V42 status ONLY. There is NO endpoint that marks a payment successful.
// External confirmations MUST originate from a future vetted merchant-specific
// provider verifier with separate DB credentials, not from cashier/manager input.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalTenderPreflightHandlerV41} from "./local-tender-preflight-v41.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res,status,value){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(value));
}
export function createLocalTenderReportHandlerV42({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalTenderPreflightHandlerV41({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const report=url.pathname==="/api/local/v42/tender-report";
  const readiness=url.pathname==="/api/local/v42/merchant-readiness";
  if(!report&&!readiness)return previous(req,res);
  if(req.method!=="GET")return send(res,405,{error:"method_not_allowed"});
  const bearer=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const actor=bearer?await auth.authorize(bearer[1],["cashier"]).catch(()=>null):null;
  if(!actor)return send(res,401,{error:"cashier_session_required"});
  if(readiness){
   if(url.search)return send(res,400,{error:"invalid_query"});
   return send(res,200,{ok:true,external_provider_integrated:false,
    official_mixed_tender_enabled:false,release_ready:false,
    blockers:["provider_credentials_and_verified_settlement_missing",
     "independent_payment_verifier_role_unprovisioned",
     "post_capture_stock_and_price_compensation_untested",
     "provider_refund_workflow_missing",
     "physical_windows_lan_and_printer_not_accepted"]});
  }
  const params=[...url.searchParams.entries()];
  if(params.length!==1||params[0][0]!=="shift_id"||!UUID.test(params[0][1]))
   return send(res,400,{error:"invalid_query"});
  try{
   const r=await pool.query(
    "SELECT * FROM zhirox_local.tender_summary_v42($1::uuid,$2::uuid,$3::uuid)",
    [actor.store_id,actor.user_id,params[0][1]]);
   if(!r.rows.length)return send(res,404,{error:"shift_not_available"});
   return send(res,200,{ok:true,report:r.rows[0],
    external_provider_integrated:false,official_mixed_tender_enabled:false});
  }catch(e){
   return send(res,e?.code==="P3801"?404:503,
    {error:e?.code==="P3801"?"shift_not_available":"local_database_unavailable"});
  }
 };
}
