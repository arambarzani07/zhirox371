import {createLocalAuthV3} from "./local-auth-v3.mjs";

// V79 isolated, opt-in READ-ONLY endpoint. This does not bind a network socket,
// alter cash accounting or expose a live debt-payment action. A real HTTPS/LAN
// gateway can mount this handler only after explicit release authorization.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const send=(res,status,payload)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(payload));
};
export function createLocalCustomerDebtHandlerV79({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("local_pg_pool_required");
 const auth=createLocalAuthV3({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","http://127.0.0.1");}
  catch{return send(res,400,{error:"bad_url"});}
  const list=url.pathname==="/api/local/v79/customers";
  const match=url.pathname.match(/^\/api\/local\/v79\/customers\/([^/]+)\/ledger$/);
  if(!list&&!match)return send(res,404,{error:"not_found"});
  if(req.method!=="GET")return send(res,405,{error:"read_only"});
  if(match&&!uuid.test(match[1]))return send(res,400,{error:"invalid_customer_id"});
  if([...url.searchParams.keys()].some(k=>k!=="limit")||url.searchParams.getAll("limit").length>1)
   return send(res,400,{error:"invalid_query"});
  const raw=url.searchParams.get("limit")??"20";
  if(!/^(?:[1-9]|[1-4][0-9]|50)$/.test(raw))
   return send(res,400,{error:"invalid_limit"});
  const bearer=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const principal=bearer?await auth.authorize(bearer[1],["owner","manager"]).catch(()=>null):null;
  if(!principal)return send(res,401,{error:"invalid_session"});
  try{
   if(list){
    const r=await pool.query(
     "SELECT c.customer_id,c.display_name,c.is_active,b.balance_minor FROM zhirox_local.customers_v79 c JOIN zhirox_local.customer_debt_balances_v79 b ON b.store_id=c.store_id AND b.customer_id=c.customer_id WHERE c.store_id=$1::uuid ORDER BY lower(c.display_name),c.customer_id LIMIT $2::int",
     [principal.store_id,Number(raw)]);
    return send(res,200,{ok:true,customers:r.rows});
   }
   const r=await pool.query(
    "SELECT entry_id,entry_type,amount_minor,reference,created_at FROM zhirox_local.customer_debt_ledger_v79 WHERE store_id=$1::uuid AND customer_id=$2::uuid ORDER BY created_at DESC,entry_id DESC LIMIT $3::int",
    [principal.store_id,match[1],Number(raw)]);
   return send(res,200,{ok:true,entries:r.rows});
  }catch{
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
