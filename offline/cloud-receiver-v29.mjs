import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {timingSafeEqual} from "node:crypto";
import {fileURLToPath} from "node:url";
import {createCloudReceiverV28,hashOwnerToken,parseV28Stores} from "./cloud-receiver-v28.mjs";
import {validId} from "./sync-wire-v27.mjs";

const noCache={"Cache-Control":"no-store, private","Referrer-Policy":"no-referrer",
  "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY"};
const uiCsp="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const uiPath=new URL("./owner-v29.html",import.meta.url);
const scriptPath=new URL("./owner-v29.js",import.meta.url);
const cssPath=new URL("./owner-v29.css",import.meta.url);
function bearerAuthorized(header,ownerHash){
 const match=/^Bearer ([^\s]{32,512})$/.exec(header||"");
 if(!match||!ownerHash)return false;
 const presented=Buffer.from(hashOwnerToken(match[1]),"hex");
 const expected=Buffer.from(ownerHash,"hex");
 return timingSafeEqual(presented,expected);
}
export function createCloudReceiverV29({pool,stores,now=()=>Date.now()}){
 if(!pool||typeof pool.query!=="function"||!(stores instanceof Map)||!stores.size)
  throw Error("invalid_receiver_config");
 const previous=createCloudReceiverV28({pool,stores,now});
 return async(req,res)=>{
  const respond=(status,data)=>{
   res.writeHead(status,{...noCache,"Content-Type":"application/json; charset=utf-8"});
   res.end(JSON.stringify(data));
  };
  let url;
  try{url=new URL(req.url||"/","http://localhost");}
  catch{return respond(400,{error:"invalid_url"});}
  if(req.method==="GET"&&!url.search&&
     (url.pathname==="/v29/owner"||url.pathname==="/v29/owner-app.js"||url.pathname==="/v29/owner.css")){
   // Preview assets contain NO account data, credentials or default owner IDs.
   try{
    const js=url.pathname.endsWith(".js"),css=url.pathname.endsWith(".css");
    const content=await readFile(js?scriptPath:css?cssPath:uiPath);
    res.writeHead(200,{...noCache,"Content-Security-Policy":uiCsp,
      "Content-Type":js?"text/javascript; charset=utf-8":css?"text/css; charset=utf-8":"text/html; charset=utf-8"});
    res.end(content);
   }catch{respond(503,{error:"owner_preview_unavailable"});}
   return;
  }
  if(req.method==="GET"&&url.pathname==="/v29/owner/event-ids"){
   const params=[...url.searchParams.keys()];
   if(params.some(k=>!["store_id","after","limit"].includes(k))||
      params.length!==new Set(params).size)
    return respond(400,{error:"invalid_query"});
   const storeId=url.searchParams.get("store_id");
   if(!validId(storeId)||!bearerAuthorized(req.headers.authorization,
      stores.get(storeId)?.owner_token_hash))
    return respond(401,{error:"unauthorized"});
   const after=url.searchParams.get("after");
   const limitString=url.searchParams.get("limit")||"50";
   if((after!==null&&!validId(after))||
       !/^(?:[1-9]|[1-4][0-9]|50)$/.test(limitString))
    return respond(400,{error:"invalid_pagination"});
   const limit=Number(limitString);
   try{
    const result=await pool.query(
     "SELECT event_id::text AS event_id FROM zhirox_cloud_v28.received_sales WHERE store_id=$1::uuid AND ($2::uuid IS NULL OR event_id>$2::uuid) ORDER BY event_id LIMIT $3::integer",
     [storeId,after||null,limit+1]);
    const ids=result.rows.map(r=>r.event_id);
    if(ids.some(id=>!validId(id)))return respond(503,{error:"untrusted_inbox"});
    const more=ids.length>limit;
    return respond(200,{ok:true,store_id:storeId,event_ids:ids.slice(0,limit),
      next_cursor:more?ids[limit-1]:null,has_more:more,
      source:"received_cloud_events_not_local_inventory"});
   }catch{return respond(503,{error:"read_unavailable"});}
  }
  return previous(req,res);
 };
}
// Isolated localhost only; public deployment requires TLS/proxy, owner OAuth
// and rate limiting. No production/hosted database reads or writes here.
export async function startV29PreviewReceiver(){
 if(process.env.ZHIROX_V29_PREVIEW_ENABLED!=="true")throw Error("owner_preview_disabled");
 if(!process.env.ZHIROX_V29_TEST_DATABASE_URL)throw Error("disposable_database_required");
 const stores=parseV28Stores(process.env.ZHIROX_V29_STORES_JSON);
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:process.env.ZHIROX_V29_TEST_DATABASE_URL,
   max:3,connectionTimeoutMillis:2000});
 const server=createServer(createCloudReceiverV29({pool,stores}));
 server.listen(3419,"127.0.0.1");
 server.on("close",()=>pool.end());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV29PreviewReceiver().catch(()=>{console.error("owner_preview_failed");process.exitCode=1;});
}
