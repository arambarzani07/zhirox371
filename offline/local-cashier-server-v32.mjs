import http from "node:http";
import {fileURLToPath} from "node:url";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalDurableHandlerV31} from "./local-durable-server-v31.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const send=(res,status,value)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(value));
};
// V32 local-only gateway: read-only receipt history and definitive intent
// status for the authenticated cashier; sale writes delegate to V31 unchanged.
export function createLocalCashierHandlerV32({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalDurableHandlerV31({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","http://127.0.0.1");}
  catch{return send(res,400,{error:"invalid_url"});}
  const receipts=url.pathname==="/api/local/v32/receipts";
  const intent=url.pathname==="/api/local/v32/intent";
  if(!receipts&&!intent)return previous(req,res);
  if(req.method!=="GET")return send(res,405,{error:"method_not_allowed"});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const principal=match?await auth.authorize(match[1]).catch(()=>null):null;
  if(!principal)return send(res,401,{error:"invalid_session"});
  const params=[...url.searchParams.keys()];
  if(params.length!==new Set(params).size||
     params.some(x=>receipts?x!=="limit":x!=="request_id"))
   return send(res,400,{error:"invalid_query"});
  const requestId=url.searchParams.get("request_id");
  const limitString=url.searchParams.get("limit")||"20";
  if(intent&&(!UUID.test(requestId||"")||params.length!==1))
   return send(res,400,{error:"invalid_request_id"});
  if(receipts&&!/^(?:[1-9]|1[0-9]|20)$/.test(limitString))
   return send(res,400,{error:"invalid_limit"});
  try{
   if(receipts){
    const result=await pool.query(
      "SELECT id AS sale_id,receipt_no,total_minor,created_at FROM zhirox_local.sales WHERE store_id=$1::uuid AND cashier_id=$2::uuid ORDER BY created_at DESC,receipt_no DESC LIMIT $3::integer",
      [principal.store_id,principal.user_id,Number(limitString)]);
    return send(res,200,{ok:true,receipts:result.rows});
   }
   const result=await pool.query(
     "SELECT request_id,state,lines,expected_total_minor,sale_id,receipt_no,total_minor FROM zhirox_local.checkout_intents_v31 WHERE store_id=$1::uuid AND cashier_id=$2::uuid AND request_id=$3::uuid",
     [principal.store_id,principal.user_id,requestId]);
   return send(res,200,{ok:true,intent:result.rows[0]||null});
  }catch{return send(res,503,{error:"local_database_unavailable"});}
 };
}
export async function startLocalCashierV32(){
 if(process.env.ZHIROX_V32_LOCAL_CASHIER_TEST_ENABLED!=="true")
  throw Error("v32_local_test_disabled");
 if(!process.env.ZHIROX_LOCAL_DB_URL||!process.env.ZHIROX_LOCAL_SESSION_SECRET)
  throw Error("disposable_local_db_required");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:process.env.ZHIROX_LOCAL_DB_URL,max:5,
   connectionTimeoutMillis:2000});
 const server=http.createServer(createLocalCashierHandlerV32({
  pool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET
 }));
 server.listen(3308,"127.0.0.1");
 server.on("close",()=>pool.end());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startLocalCashierV32().catch(()=>{console.error("v32_local_start_failed");process.exitCode=1;});
}
