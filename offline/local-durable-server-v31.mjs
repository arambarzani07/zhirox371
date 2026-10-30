import http from "node:http";
import {fileURLToPath} from "node:url";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalPacksScaleHandlerV26} from "./local-packs-scale-server-v26.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const routes=new Set(["/api/local/v31/prepare","/api/local/v31/commit",
 "/api/local/v31/cancel","/api/local/v31/recover"]);
const send=(res,status,value)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(value));
};
async function json(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return {error:"json_required",status:415};
 let bytes=0,parts=[];
 try{
  for await(const part of req){
   bytes+=part.length;
   if(bytes>65536)return {error:"payload_too_large",status:413};
   parts.push(part);
  }
  const obj=JSON.parse(Buffer.concat(parts).toString("utf8"));
  if(!obj||typeof obj!=="object"||Array.isArray(obj))
   return {error:"invalid_json",status:400};
  return {value:obj};
 }catch{return {error:"invalid_json",status:400};}
}
const errorResult=error=>{
 switch(error?.code){
  case "P3101":return [404,"intent_not_found"];
  case "P3102":return [409,"unfinished_checkout"];
  case "P3103":return [409,"intent_cancelled"];
  case "P3701":return [409,"open_shift_required"];
  case "P2501":return [409,"price_changed"];
  case "23505":case "23514":return [409,"checkout_conflict"];
  case "22023":case "22003":return [400,"invalid_checkout"];
  default:return [503,"local_database_unavailable"];
 }
};
export function createLocalDurableHandlerV31({pool,secret,clock}){
 if(!pool||typeof pool.query!=="function"||typeof pool.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalPacksScaleHandlerV26({pool,secret,clock});
 return async(req,res)=>{
  const url=new URL(req.url||"/","http://localhost");
  if(!routes.has(url.pathname))return previous(req,res);
  const isRecover=req.method==="GET"&&url.pathname==="/api/local/v31/recover";
  if(!isRecover&&(req.method!=="POST"||url.search))
   return send(res,404,{error:"not_found"});
  if(isRecover&&url.search)return send(res,400,{error:"invalid_query"});
  if(req.method!=="POST"&&req.method!=="GET")
   return send(res,405,{error:"method_not_allowed"});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const principal=match?await auth.authorize(match[1]).catch(()=>null):null;
  if(!principal)return send(res,401,{error:"invalid_session"});
  let payload={};
  if(!isRecover){
   const parsed=await json(req);
   if(parsed.error)return send(res,parsed.status,{error:parsed.error});
   payload=parsed.value;
   if("store_id" in payload||"cashier_id" in payload||
      "user_id" in payload||"role" in payload)
    return send(res,400,{error:"caller_must_not_supply_identity"});
   // V40 safety: mixed/card/credit tender is not yet settled or audited.
   // Never silently accept a client tender that V31 would book as CASH.
   const exactFields=url.pathname==="/api/local/v31/prepare"?
     "expected_total_minor,lines,request_id":"request_id";
   if(Object.keys(payload).sort().join(",")!==exactFields)
    return send(res,409,{error:"unsupported_payment_or_checkout_fields"});
   if(!UUID.test(payload.request_id||""))
    return send(res,400,{error:"invalid_checkout"});
  }
  if(url.pathname==="/api/local/v31/prepare"){
   if(!Array.isArray(payload.lines)||payload.lines.length<1||payload.lines.length>100||
      !payload.lines.every(line=>line&&typeof line.barcode==="string"&&
        /^[A-Za-z0-9._-]{4,80}$/.test(line.barcode)&&
        Number.isSafeInteger(line.qty)&&line.qty>0&&line.qty<=100)||
      !Number.isSafeInteger(payload.expected_total_minor)||
      payload.expected_total_minor<0||payload.expected_total_minor>9999999999999)
    return send(res,400,{error:"invalid_checkout"});
  }
  const client=await pool.connect().catch(()=>null);
  if(!client)return send(res,503,{error:"local_database_unavailable"});
  try{
   if(isRecover){
    const {rows}=await client.query(
     "SELECT request_id,state,lines,expected_total_minor,sale_id,receipt_no,total_minor FROM zhirox_local.checkout_intents_v31 WHERE store_id=$1::uuid AND cashier_id=$2::uuid AND state='prepared' ORDER BY created_at LIMIT 2",
      [principal.store_id,principal.user_id]
    );
    if(rows.length>1)return send(res,409,{error:"multiple_unfinished"});
    return send(res,200,{ok:true,intent:rows[0]||null});
   }
   if(url.pathname==="/api/local/v31/prepare"){
    const {rows}=await client.query(
     "SELECT * FROM zhirox_local.prepare_checkout_v31($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::bigint)",
     [principal.store_id,principal.user_id,payload.request_id,
       JSON.stringify(payload.lines),payload.expected_total_minor]
    );
    return send(res,200,{ok:true,intent:rows[0]});
   }
   if(url.pathname==="/api/local/v31/commit"){
    const {rows}=await client.query(
     "SELECT * FROM zhirox_local.commit_checkout_v31($1::uuid,$2::uuid,$3::uuid)",
     [principal.store_id,principal.user_id,payload.request_id]
    );
    return send(res,200,{ok:true,receipt:rows[0]});
   }
   const {rows}=await client.query(
    "SELECT zhirox_local.cancel_checkout_v31($1::uuid,$2::uuid,$3::uuid) AS state",
    [principal.store_id,principal.user_id,payload.request_id]
   );
   return send(res,200,{ok:true,state:rows[0]?.state});
  }catch(error){
   const [status,code]=errorResult(error);
   return send(res,status,{error:code});
  }finally{client.release();}
 };
}
export async function startLocalV31DurablePilot(){
 if(process.env.ZHIROX_V31_TEST_ENABLED!=="true")
  throw Error("v31_test_disabled");
 if(!process.env.ZHIROX_LOCAL_DB_URL||!process.env.ZHIROX_LOCAL_SESSION_SECRET)
  throw Error("disposable_local_db_required");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:process.env.ZHIROX_LOCAL_DB_URL,
  max:5,connectionTimeoutMillis:2000});
 const server=http.createServer(createLocalDurableHandlerV31({
  pool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET
 }));
 server.listen(3307,"127.0.0.1");
 server.on("close",()=>pool.end());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startLocalV31DurablePilot().catch(()=>{console.error("v31_test_start_failed");process.exitCode=1;});
}
