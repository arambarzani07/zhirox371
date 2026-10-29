import http from "node:http";
import {fileURLToPath} from "node:url";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalCatalogHandlerV5} from "./local-catalog-server-v5.mjs";
import {decodeScale27} from "./scale27-v26.mjs";

// LOCAL-ONLY development pilot, no WAN/LAN binding and no production writes.
const respond=(res,status,data)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 res.end(JSON.stringify(data));
};
export function createLocalPacksScaleHandlerV26({pool,secret,clock}){
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalCatalogHandlerV5({pool,secret,clock});
 return async(req,res)=>{
  const path=new URL(req.url||"/","http://localhost");
  if(path.pathname!=="/api/local/v26/scan"||req.method!=="GET")
   return previous(req,res);
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const principal=match?await auth.authorize(match[1]).catch(()=>null):null;
  if(!principal)return respond(res,401,{error:"invalid_session"});
  const code=path.searchParams.get("code")||"";
  if(!/^[A-Za-z0-9._-]{4,80}$/.test(code))
   return respond(res,400,{error:"invalid_barcode"});
  try{
   // Never fallback malformed prefix-27 to a unit alias.
   const looksScale=/^27[0-9]{11}$/.test(code);
   const label=looksScale?decodeScale27(code):null;
   if(looksScale&&!label)return respond(res,400,{error:"invalid_scale_label"});
   if(label){
     const {rows}=await pool.query(
       "SELECT p.id,p.name,p.price_minor,p.stock_base_units FROM zhirox_local.products p WHERE p.store_id=$1 AND p.plu=$2 AND p.base_unit='gram' AND p.active",
       [principal.store_id,label.plu]
     );
     const p=rows[0];
     if(!p)return respond(res,404,{error:"scale_plu_not_found"});
     const kgPrice=Number(p.price_minor),stock=Number(p.stock_base_units);
     const labelTotal=Math.floor((label.grams*kgPrice)/1000+0.5);
     if(!Number.isSafeInteger(kgPrice)||!Number.isSafeInteger(stock)||!Number.isSafeInteger(labelTotal)||
       kgPrice<0||stock<0||labelTotal<0)return respond(res,409,{error:"invalid_price"});
     return respond(res,200,{ok:true,product:{
       id:p.id,name:p.name,barcode:code,base_unit:"gram",sale_mode:"scale",
       quantity_base_units:label.grams,weight_grams:label.grams,
       unit_price_minor:String(kgPrice),price_minor:String(labelTotal),
       stock_base_units:String(stock)
     }});
   }
   const {rows}=await pool.query(
     "SELECT p.id,p.name,p.price_minor AS base_price_minor,p.stock_base_units,b.quantity_base_units,b.sale_mode,b.sale_price_minor FROM zhirox_local.barcodes b JOIN zhirox_local.products p ON p.store_id=b.store_id AND p.id=b.product_id WHERE b.store_id=$1 AND b.code=$2 AND b.active AND p.active AND p.base_unit='unit' LIMIT 1",
     [principal.store_id,code]
   );
   const p=rows[0];
   if(!p)return respond(res,404,{error:"barcode_not_found"});
   const perScan=Number(p.quantity_base_units),stock=Number(p.stock_base_units);
   const price=Number(p.sale_price_minor??p.base_price_minor),mode=p.sale_mode;
   if(!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(stock)||stock<0||
     !Number.isSafeInteger(perScan)||perScan<1||
     !["unit","carton"].includes(mode)||
     (mode==="unit"&&perScan!==1)||(mode==="carton"&&perScan<2))
     return respond(res,409,{error:"invalid_pack_definition"});
   return respond(res,200,{ok:true,product:{
     id:p.id,name:p.name,barcode:code,base_unit:"unit",sale_mode:mode,
     quantity_base_units:perScan,weight_grams:null,
     unit_price_minor:String(price),price_minor:String(price),stock_base_units:String(stock)
   }});
  }catch{return respond(res,503,{error:"local_database_unavailable"});}
 };
}
export async function startPacksScalePilotV26(){
 const {Pool}=await import("pg");
 if(!process.env.ZHIROX_LOCAL_DB_URL||!process.env.ZHIROX_LOCAL_SESSION_SECRET)
  throw Error("disposable local DB and session secret are required");
 const pool=new Pool({connectionString:process.env.ZHIROX_LOCAL_DB_URL,max:5,connectionTimeoutMillis:2000});
 const server=http.createServer(createLocalPacksScaleHandlerV26({
   pool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET
 }));
 server.listen(3306,"127.0.0.1");
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startPacksScalePilotV26().catch(e=>{console.error(e.message);process.exitCode=1;});
}
