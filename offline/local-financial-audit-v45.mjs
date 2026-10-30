// V45 read-only integrity diagnostics. No bank confirmation, no actions.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalReconciliationHandlerV44} from "./local-reconciliation-v44.mjs";
function send(res,status,data){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(data));
}
export function createLocalFinancialAuditHandlerV45({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalReconciliationHandlerV44({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","https://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  if(url.pathname!=="/api/local/v45/financial-integrity")
   return previous(req,res);
  if(req.method!=="GET")return send(res,405,{error:"method_not_allowed"});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const principal=match?await auth.authorize(match[1],["owner","manager"]).catch(()=>null):null;
  if(!principal)return send(res,403,{error:"manager_session_required"});
  if(url.search)return send(res,400,{error:"invalid_query"});
  try{
   const q=await pool.query(
    "SELECT * FROM zhirox_local.financial_integrity_audit_v45($1::uuid)",
    [principal.store_id]);
   const rows=q.rows;
   if(!Array.isArray(rows)||rows.length!==7)
    return send(res,503,{error:"incomplete_financial_audit"});
   return send(res,200,{ok:true,checks:rows,
    provider_payment_verified:false,official_mixed_tender_enabled:false,
    proposed_amounts_are_not_bank_balances:true,read_only:true});
  }catch{return send(res,503,{error:"local_database_unavailable"});}
 };
}
