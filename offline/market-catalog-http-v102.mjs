// V102 one-file read-only local CSV status/catalog/scan HTTP facade.
// Never publish on Vercel, GitHub Pages, or a non-loopback interface.
import http from "node:http";
import {createHash,timingSafeEqual} from "node:crypto";
import {fileURLToPath} from "node:url";
import {openMarketCSVV102} from "./market-catalog-v102.mjs";

const HOST="127.0.0.1",PORT=3320;
const BASE="/api/local/v102/";
function send(res,code,data){
 res.writeHead(code,{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer",
  "Content-Security-Policy":"default-src 'none'"
 });
 res.end(JSON.stringify(data));
}
function authorized(req,token){
 if(typeof req.headers.authorization!=="string"||
  !req.headers.authorization.startsWith("Bearer "))return false;
 const presented=req.headers.authorization.slice(7);
 if(presented.length<32||presented.length>2048)return false;
 const digest=x=>createHash("sha256").update(x).digest();
 return timingSafeEqual(digest(presented),digest(token));
}
export function createV102CatalogHandler({catalog,token,now=()=>Date.now()}){
 if(!catalog?.status||catalog.status.write_enabled!==false||
  typeof catalog.scan!=="function"||typeof catalog.search!=="function"||
  typeof token!=="string"||token.length<32||token.length>2048)
  throw Error("v102_catalog_and_strong_token_required");
 return function handle(req,res){
  const remote=req.socket.remoteAddress;
  const origin=req.headers.origin;
  if(!["127.0.0.1","::ffff:127.0.0.1","::1"].includes(remote)||
   !["127.0.0.1:3320","127.0.0.1:3000"].includes(req.headers.host)||
   (origin&&origin!=="http://127.0.0.1:3000"))
   return send(res,403,{ok:false,error:"local_only"});
  if(!authorized(req,token))return send(res,401,{ok:false,error:"unauthorized"});
  if(req.method!=="GET")return send(res,405,{ok:false,error:"read_only_method"});
  let url;
  try{url=new URL(req.url,"http://127.0.0.1:3320");}
  catch{return send(res,400,{ok:false,error:"invalid_path"});}
  const path=url.pathname;
  const lastModified=catalog.status.source_modified_at;
  const age=lastModified?Math.max(0,now()-Date.parse(lastModified)):null;
  const stale=age===null||age>24*60*60*1000;
  const proof={source:"OPERATOR_CSV_SNAPSHOT_NOT_LIVE_SQL_SERVER",
   checkout_enabled:false,write_enabled:false,stock_verified:false,
   stale,age_hours:age===null?null:Math.round(age/3600000)};
  if(path===BASE+"status")
   return send(res,200,{ok:true,...proof,...catalog.status});
  if(path===BASE+"scan"){
   const code=url.searchParams.get("code")||"";
   const result=catalog.scan(code);
   return send(res,result.ok?200:result.error==="ambiguous_barcode_refused"?409:404,
    {...result,...proof});
  }
  if(path===BASE+"products"){
   const q=url.searchParams.get("q")||"";
   const limit=Number(url.searchParams.get("limit")||"20");
   try{
    const items=catalog.search(q,limit);
    return send(res,200,{ok:true,items,count:items.length,...proof});
   }catch{return send(res,400,{ok:false,error:"invalid_search"});}
  }
  return send(res,404,{ok:false,error:"not_found"});
 };
}
export function createV102CatalogServer({catalog,token,now}){
 return http.createServer(createV102CatalogHandler({catalog,token,now}));
}
export async function startV102CatalogLocalOnly({
 csvPath,token,consent,port=PORT
}={}){
 if(consent!=="YES_OPERATOR_READONLY_CSV"||
  process.env.ZHIROX_V102_OPERATOR_READONLY_CSV!=="YES_OPERATOR_READONLY_CSV"||
  !Number.isInteger(port)||port!==PORT)
  throw Error("v102_explicit_operator_opt_in_required");
 const catalog=await openMarketCSVV102(csvPath);
 const server=createV102CatalogServer({catalog,token});
 try{
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(PORT,HOST,resolve);
  });
  return {server,status:catalog.status};
 }catch(e){server.close();throw e;}
}
// No implicit startup in public preview, GitHub Pages or offline POS.
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const fail=e=>{console.error("V102 read-only gateway refused:",e.message);process.exitCode=1;};
 startV102CatalogLocalOnly({
  csvPath:process.env.ZHIROX_V102_CSV_PATH,
  token:process.env.ZHIROX_V102_READ_TOKEN,
  consent:process.env.ZHIROX_V102_OPERATOR_READONLY_CSV
 }).then(({status})=>{
  console.log("V102 local CSV reader active at 127.0.0.1:3320; source rows:",
   status.valid_rows,"; checkout blocked.");
 }).catch(fail);
}
