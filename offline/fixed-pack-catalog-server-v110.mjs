// V110 isolated, loopback-only fixed-pack catalog registration pilot.
// Requires an explicitly disposable database and opt-in. No production write path.
import http from "node:http";
import {fileURLToPath} from "node:url";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalPacksScaleHandlerV26} from "./local-packs-scale-server-v26.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE=/^[A-Za-z0-9._-]{4,80}$/;
const keys=["aliases","barcode","expected_version","kind","name",
  "price_minor","product_id","request_id","units_per_pack"].sort().join(",");
const send=(res,status,payload)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(payload));
};
async function readBody(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
   return {error:"json_required",status:415};
 const buffers=[];let size=0;
 for await(const chunk of req){
   size+=chunk.length;
   if(size>8192)return {error:"payload_too_large",status:413};
   buffers.push(chunk);
 }
 try{
   const body=JSON.parse(Buffer.concat(buffers).toString("utf8"));
   if(!body||Array.isArray(body)||typeof body!=="object")
     return {error:"invalid_json",status:400};
   return {body};
 }catch{return {error:"invalid_json",status:400};}
}
function validate(body){
 if(Object.keys(body).sort().join(",")!==keys ||
   !UUID.test(body.request_id||"") || !UUID.test(body.product_id||"") ||
   !["bundle","set"].includes(body.kind) ||
   typeof body.name!=="string" || body.name!==body.name.trim() ||
   body.name.length<1 || body.name.length>120 ||
   typeof body.barcode!=="string" || !CODE.test(body.barcode) ||
   !Array.isArray(body.aliases) || body.aliases.length>30 ||
   !body.aliases.every(code=>typeof code==="string"&&CODE.test(code)) ||
   new Set([body.barcode,...body.aliases]).size!==1+body.aliases.length ||
   !Number.isSafeInteger(body.units_per_pack) ||
   body.units_per_pack<2 || body.units_per_pack>100000 ||
   !Number.isSafeInteger(body.price_minor) ||
   body.price_minor<1 || body.price_minor>999999999 ||
   !Number.isSafeInteger(body.expected_version) || body.expected_version<1)
   return false;
 return true;
}
export function createFixedPackCatalogHandlerV110({pool,secret,clock,enabled=false}={}){
 const auth=createLocalAuthV3({pool,secret,clock});
 const scan=createLocalPacksScaleHandlerV26({pool,secret,clock});
 return async(req,res)=>{
  const url=new URL(req.url||"/","http://localhost");
  if(url.pathname!=="/api/local/v110/fixed-pack"||req.method!=="POST")
    return scan(req,res);
  if(!enabled)return send(res,403,{error:"disposable_catalog_disabled"});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const actor=match?await auth.authorize(match[1],["owner","manager"]).catch(()=>null):null;
  if(!actor)return send(res,401,{error:"catalog_manager_required"});
  const parsed=await readBody(req);
  if(parsed.error)return send(res,parsed.status,{error:parsed.error});
  if(!validate(parsed.body))return send(res,400,{error:"invalid_pack_definition"});
  const p=parsed.body;
  try{
   const result=await pool.query(
    "SELECT next_version,replayed FROM zhirox_local.register_fixed_pack_v110($1::uuid,$2::uuid,$3::integer,$4::uuid,$5::uuid,$6::text,$7::text,$8::text,$9::text[],$10::integer,$11::bigint,$12::bigint)",
    [actor.store_id,actor.user_id,actor.sv,p.request_id,p.product_id,p.kind,
     p.name,p.barcode,p.aliases,p.units_per_pack,p.price_minor,p.expected_version]);
   const row=result.rows?.[0],version=Number(row?.next_version);
   if(!Number.isSafeInteger(version)||version<1||typeof row?.replayed!=="boolean")
     throw Error("malformed_catalog_reply");
   return send(res,200,{ok:true,next_version:version,replayed:row.replayed});
  }catch(error){
   if(error.code==="P0110")return send(res,403,{error:"disposable_database_required"});
   if(error.code==="P1101")return send(res,401,{error:"catalog_manager_required"});
   if(error.code==="P1102")return send(res,409,{error:"stale_catalog_version"});
   if(error.code==="23505")return send(res,409,{error:"barcode_conflict_or_replay_mismatch"});
   if(error.code==="22023")return send(res,400,{error:"invalid_pack_definition"});
   return send(res,503,{error:"local_database_unavailable"});
  }
 };
}
export async function startFixedPackCatalogPilotV110(){
 if(process.env.ZHIROX_V110_DISPOSABLE_ONLY!=="true"||
   !process.env.ZHIROX_LOCAL_DB_URL||!process.env.ZHIROX_LOCAL_SESSION_SECRET)
   throw Error("V110 only permits opted-in isolated disposable database");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:process.env.ZHIROX_LOCAL_DB_URL,
   max:5,connectionTimeoutMillis:2000});
 const database=await pool.query("SELECT current_database() AS name");
 if(database.rows?.[0]?.name!=="zhirox_v110_packs_disposable"){
   await pool.end();
   throw Error("V110 refused to bind a non-disposable database");
 }
 const server=http.createServer(createFixedPackCatalogHandlerV110({
  pool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET,enabled:true
 }));
 server.listen(3310,"127.0.0.1");
 server.on("close",()=>pool.end());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startFixedPackCatalogPilotV110().catch(e=>{console.error(e.message);process.exitCode=1;});
}
