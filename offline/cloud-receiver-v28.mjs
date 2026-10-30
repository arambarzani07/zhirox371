import {createHash,timingSafeEqual} from "node:crypto";
import {createServer} from "node:http";
import {fileURLToPath} from "node:url";
import {digest,validId,validateEnvelope,verifyEventSignature} from "./sync-wire-v27.mjs";

const uuid=validId;
const MAX_BODY=65536;
const MAX_EVENTS=50;
const SHA256=/^[0-9a-f]{64}$/;
const nameSafeError=e=>(e&&e.code==="23505")?"conflicting_sale_or_receipt":"inbox_unavailable";
export const hashOwnerToken=token=>createHash("sha256").update(token).digest("hex");
export function parseV28Stores(input){
 const rows=typeof input==="string"?JSON.parse(input):input;
 if(!Array.isArray(rows)||rows.length<1||rows.length>100)throw Error("invalid_stores");
 const stores=new Map();
 for(const item of rows){
   if(!item||!uuid(item.store_id)||typeof item.sync_secret!=="string"||
      Buffer.byteLength(item.sync_secret)<32||!SHA256.test(item.owner_token_hash||"")||
      stores.has(item.store_id))throw Error("invalid_store_config");
   stores.set(item.store_id,{
     sync_secret:item.sync_secret,owner_token_hash:item.owner_token_hash
   });
 }
 return stores;
}
function safeOwnerBearer(header,config){
 const match=/^Bearer ([^\s]{32,512})$/.exec(header||"");
 if(!match||!config)return false;
 const presented=Buffer.from(hashOwnerToken(match[1]),"hex");
 const expected=Buffer.from(config.owner_token_hash,"hex");
 return presented.length===expected.length&&timingSafeEqual(presented,expected);
}
export function createCloudReceiverV28({pool,stores,now=()=>Date.now()}){
 if(typeof pool?.query!=="function"||!(stores instanceof Map)||stores.size<1)
   throw Error("invalid_cloud_receiver_config");
 return async(req,res)=>{
   const send=(status,body)=>{
     res.writeHead(status,{
       "Content-Type":"application/json; charset=utf-8",
       "Cache-Control":"no-store, private",
       "Pragma":"no-cache",
       "X-Content-Type-Options":"nosniff",
       "Referrer-Policy":"no-referrer"
     });
     res.end(JSON.stringify(body));
   };
   let url;
   try{url=new URL(req.url||"/","http://localhost");}
   catch{return send(400,{error:"invalid_url"});}
   if(req.method==="POST"&&url.pathname==="/v27/events"&&!url.search){
     if(!String(req.headers["content-type"]||"").startsWith("application/json"))
       return send(415,{error:"content_type"});
     let parts=[],size=0;
     try{
       for await(const chunk of req){
         size+=chunk.length;
         if(size>MAX_BODY)return send(413,{error:"payload_too_large"});
         parts.push(chunk);
       }
     }catch{return send(400,{error:"body_read_failed"});}
     const raw=Buffer.concat(parts).toString("utf8");
     let event;
     try{event=JSON.parse(raw);}catch{return send(400,{error:"invalid_json"});}
     const secret=stores.get(event?.store_id)?.sync_secret;
     if(!secret||!verifyEventSignature(raw,secret,
       req.headers["x-zhirox-timestamp"],
       req.headers["x-zhirox-signature"],now()))
       return send(401,{error:"unauthorized"});
     if(!validateEnvelope(event))
       return send(400,{error:"invalid_event"});
     // Minimum dataset only: sale_id / receipt number / total / event hash.
     // Customer/product names, basket breakdown, and credentials NEVER reach cloud DB.
     const receiptNo=Number(event.payload.receipt_no);
     const totalMinor=Number(event.payload.total_minor);
     const bodyHash=digest(raw);
     try{
       const inserted=await pool.query(
         "INSERT INTO zhirox_cloud_v28.received_sales(store_id,event_id,sale_id,receipt_no,total_minor,event_hash,occurred_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::bigint,$6::text,$7::timestamptz) ON CONFLICT(store_id,event_id) DO NOTHING RETURNING event_id",
         [event.store_id,event.event_id,event.aggregate_id,receiptNo,totalMinor,bodyHash,event.created_at]
       );
       if(!inserted.rows.length){
         const old=await pool.query(
           "SELECT sale_id,receipt_no,total_minor,event_hash FROM zhirox_cloud_v28.received_sales WHERE store_id=$1::uuid AND event_id=$2::uuid",
           [event.store_id,event.event_id]
         );
         const stored=old.rows[0];
         if(!stored||stored.sale_id!==event.aggregate_id||
            Number(stored.receipt_no)!==receiptNo||
            Number(stored.total_minor)!==totalMinor||
            stored.event_hash.trim()!==bodyHash)
           return send(409,{error:"conflicting_event_id"});
       }
       return send(200,{ok:true,accepted:true,store_id:event.store_id,
         event_id:event.event_id,duplicate:inserted.rows.length===0});
     }catch(err){return send(err?.code==="23505"?409:503,{error:nameSafeError(err)});}
   }
   if(req.method==="GET"&&
      (url.pathname==="/v28/owner/summary"||url.pathname==="/v28/owner/latest")){
     if([...url.searchParams.keys()].some(key=>!["store_id","limit"].includes(key)))
       return send(400,{error:"invalid_query"});
     const storeId=url.searchParams.get("store_id");
     const ownerConfig=stores.get(storeId);
     if(!uuid(storeId)||!safeOwnerBearer(req.headers.authorization,ownerConfig))
       return send(401,{error:"unauthorized"});
     try{
       if(url.pathname==="/v28/owner/summary"){
         if(url.searchParams.has("limit"))return send(400,{error:"invalid_query"});
         const summary=await pool.query(
           "SELECT count(*)::bigint AS sales_count,coalesce(sum(total_minor),0)::numeric AS total_minor,coalesce(max(receipt_no),0)::bigint AS last_receipt_no,coalesce(max(received_at),NULL) AS last_received_at FROM zhirox_cloud_v28.received_sales WHERE store_id=$1::uuid",
           [storeId]
         );
         const row=summary.rows[0];
         const maxReceipt=Number(row?.last_receipt_no||0);
         const count=Number(row?.sales_count||0);
         return send(200,{ok:true,store_id:storeId,
           source:"received_cloud_events_not_local_inventory",
           sales_count:count,total_minor:String(row?.total_minor||"0"),
           last_receipt_no:maxReceipt,
           possible_missing_receipts:Math.max(0,maxReceipt-count),
           last_received_at:row?.last_received_at||null,
           available_categories:["sale.completed"],
           unavailable_categories:["price.change","stock.low","sale.refund",
              "shift.open","shift.close","security.alert"]
         });
       }
       const limitRaw=url.searchParams.get("limit")||"20";
       if(!/^(?:[1-9]|[1-4]\d|50)$/.test(limitRaw))
         return send(400,{error:"invalid_limit"});
       const latest=await pool.query(
         "SELECT sale_id,receipt_no,total_minor,occurred_at,received_at FROM zhirox_cloud_v28.received_sales WHERE store_id=$1::uuid ORDER BY received_at DESC,event_id DESC LIMIT $2::integer",
         [storeId,Math.min(MAX_EVENTS,Number(limitRaw))]
       );
       return send(200,{ok:true,store_id:storeId,events:latest.rows});
     }catch{return send(503,{error:"read_unavailable"});}
   }
   return send(404,{error:"not_found"});
 };
}
// Real cloud deployment is intentionally disabled pending HTTPS reverse proxy,
// restricted DB role, stable secret management, rate limits and owner login.
export async function startV28CloudReceiver(){
 if(process.env.ZHIROX_V28_RECEIVER_ENABLED!=="true")throw Error("cloud_receiver_disabled");
 if(!process.env.ZHIROX_V28_CLOUD_TEST_DATABASE_URL)
   throw Error("disposable_cloud_database_required");
 const stores=parseV28Stores(process.env.ZHIROX_V28_STORES_JSON);
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:process.env.ZHIROX_V28_CLOUD_TEST_DATABASE_URL,
                      max:4,connectionTimeoutMillis:2000});
 const server=createServer(createCloudReceiverV28({pool,stores}));
 server.listen(3418,"127.0.0.1");
 server.on("close",()=>pool.end());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV28CloudReceiver().catch(err=>{
   console.error(err?.message==="cloud_receiver_disabled"?"cloud_receiver_disabled":"cloud_receiver_failed");
   process.exitCode=1;
 });
}
