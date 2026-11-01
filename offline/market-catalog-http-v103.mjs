// V103 private loopback HTTP: no SQL, no CORS, no writes or public bind.
// Every request proves the selected file hasn't silently changed or gone stale.
import http from "node:http";
import {createHash,timingSafeEqual} from "node:crypto";
import {fileURLToPath} from "node:url";
import {createV103AtomicCatalog} from "./market-catalog-watch-v103.mjs";

const HOST="127.0.0.1",PORT=3321,BASE="/api/local/v103/";
const reply=(res,code,body)=>{
 if(res.headersSent)return;
 res.writeHead(code,{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"private, no-store, max-age=0",
  "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'"
 });
 res.end(JSON.stringify(body));
};
function tokenValid(given,want){
 if(typeof given!=="string"||!given.startsWith("Bearer "))return false;
 const value=given.slice(7);
 if(value.length<32||value.length>2048)return false;
 const digest=x=>createHash("sha256").update(x).digest();
 return timingSafeEqual(digest(value),digest(want));
}
export function createV103CatalogHandler({watch,token}={}){
 if(!watch||typeof watch.snapshot!=="function"||
  typeof token!=="string"||token.length<32||token.length>2048)
  throw Error("v103_secure_readonly_watcher_required");
 return async(req,res)=>{
  const peer=(req.socket.remoteAddress||"").replace(/^::ffff:/,"");
  if(peer!==HOST||
   ![HOST+":3321",HOST+":3000"].includes(req.headers.host)||
   (req.headers.origin&&req.headers.origin!=="http://"+HOST+":3000"))
   return reply(res,403,{ok:false,error:"local_only"});
  if(!tokenValid(req.headers.authorization,token))
   return reply(res,401,{ok:false,error:"unauthorized"});
  if(req.method!=="GET")return reply(res,405,{ok:false,error:"read_only_method"});
  let url;
  try{url=new URL(req.url,"http://"+HOST+":"+PORT);}
  catch{return reply(res,400,{ok:false,error:"invalid_path"});}
  if(![BASE+"status",BASE+"scan",BASE+"products"].includes(url.pathname))
   return reply(res,404,{ok:false,error:"not_found"});
  const keys=[...url.searchParams.keys()];
  const expected=url.pathname===BASE+"status"?[]:
   url.pathname===BASE+"scan"?["code"]:["q","limit"];
  if(keys.some(k=>!expected.includes(k))||
   keys.length!==new Set(keys).size)
   return reply(res,400,{ok:false,error:"invalid_query"});
  let state;
  try{state=await watch.snapshot();}
  catch{return reply(res,503,{ok:false,error:"snapshot_unavailable"});}
  const proof={source:"OPERATOR_CSV_SNAPSHOT_NOT_LIVE_SQL_SERVER",
   checkout_enabled:false,write_enabled:false,stock_verified:false};
  if(!state.ok)return reply(res,503,{ok:false,...proof,
   error:"snapshot_unavailable_or_stale",snapshot_available:false});
  const {catalog,generation,lastSuccessful}=state;
  const verified={...proof,snapshot_available:true,generation,
   verified_at:lastSuccessful,stale:false};
  if(url.pathname===BASE+"status"){
   // Only vetted public-facing metadata, no actual Windows file path or costs.
   const {valid_rows,invalid_rows,unique_barcodes,ambiguous_barcodes,
    source_modified_at,source_sha256}=catalog.status;
   return reply(res,200,{ok:true,...verified,valid_rows,invalid_rows,
    unique_barcodes,ambiguous_barcodes,source_modified_at,source_sha256});
  }
  if(url.pathname===BASE+"scan"){
   const code=url.searchParams.get("code")||"";
   const result=catalog.scan(code);
   const status=result.ok?200:
    result.error==="ambiguous_barcode_refused"?409:
    result.error==="invalid_barcode"?400:404;
   return reply(res,status,{...result,...verified});
  }
  const q=url.searchParams.get("q")||"";
  const limit=url.searchParams.has("limit")?
   Number(url.searchParams.get("limit")):20;
  try{
   const items=catalog.search(q,limit);
   return reply(res,200,{ok:true,...verified,count:items.length,items});
  }catch{
   return reply(res,400,{ok:false,error:"invalid_search"});
  }
 };
}
export function createV103CatalogServer({watch,token}={}){
 return http.createServer(createV103CatalogHandler({watch,token}));
}
export async function startV103CatalogLocalOnly({csvPath,token,consent,port=PORT}={}){
 if(consent!=="YES_OPERATOR_READONLY_CSV_REFRESH"||
  process.env.ZHIROX_V103_OPERATOR_READONLY_CSV_REFRESH!=="YES_OPERATOR_READONLY_CSV_REFRESH"||
  port!==PORT)
  throw Error("v103_explicit_operator_opt_in_required");
 const watch=createV103AtomicCatalog({csvPath});
 await watch.refresh({force:true});
 const server=createV103CatalogServer({watch,token});
 try{
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(PORT,HOST,resolve);
  });
  watch.startPolling();
  server.on("close",()=>watch.stopPolling());
  return {server,watch};
 }catch(e){watch.stopPolling();server.close();throw e;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 startV103CatalogLocalOnly({
  csvPath:process.env.ZHIROX_V103_CSV_PATH,
  token:process.env.ZHIROX_V103_READ_TOKEN,
  consent:process.env.ZHIROX_V103_OPERATOR_READONLY_CSV_REFRESH
 }).then(()=>console.log("V103 private read-only catalog watcher active at 127.0.0.1:3321; checkout DISABLED"))
  .catch(e=>{console.error("V103 private catalog watcher unavailable:",e.message);process.exitCode=1;});
}
