import {createServer} from "node:http";
import {fileURLToPath} from "node:url";
import {digest,validateEnvelope,verifyEventSignature,validId} from "./sync-wire-v27.mjs";

// This deliberately simulates a cloud receiver on loopback in a disposable DB.
// Never deploy it on the real cloud or expose on LAN.
export function createTestReceiverV27({pool,secret,storeId,now=()=>Date.now()}){
 if(typeof pool?.query!=="function"||!validId(storeId)||
    typeof secret!=="string"||Buffer.byteLength(secret)<32)throw Error("invalid_receiver_config");
 return async(req,res)=>{
   const send=(status,value)=>{
     res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
       "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
     res.end(JSON.stringify(value));
   };
   if(req.method!=="POST"||req.url!=="/v27/events")return send(404,{error:"not_found"});
   if(!String(req.headers["content-type"]||"").startsWith("application/json"))
     return send(415,{error:"content_type"});
   let size=0,chunks=[];
   try{
     for await(const chunk of req){
       size+=chunk.length;
       if(size>65536)return send(413,{error:"event_too_large"});
       chunks.push(chunk);
     }
   }catch{return send(400,{error:"read_failed"});}
   const raw=Buffer.concat(chunks).toString("utf8");
   if(!verifyEventSignature(raw,secret,req.headers["x-zhirox-timestamp"],
      req.headers["x-zhirox-signature"],now()))
     return send(401,{error:"invalid_signature"});
   let envelope;
   try{envelope=JSON.parse(raw);}catch{return send(400,{error:"invalid_json"});}
   if(!validateEnvelope(envelope)||envelope.store_id!==storeId)
     return send(403,{error:"invalid_store_or_event"});
   const hash=digest(raw);
   try{
     const added=await pool.query(
       "INSERT INTO zhirox_cloud_test.received_events(store_id,event_id,aggregate_id,event_type,event_hash,payload) VALUES($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::jsonb) ON CONFLICT(store_id,event_id) DO NOTHING RETURNING event_id",
       [storeId,envelope.event_id,envelope.aggregate_id,envelope.event_type,hash,
        JSON.stringify(envelope.payload)]
     );
     if(!added.rows.length){
       const existing=await pool.query(
         "SELECT aggregate_id,event_type,event_hash FROM zhirox_cloud_test.received_events WHERE store_id=$1::uuid AND event_id=$2::uuid",
         [storeId,envelope.event_id]
       );
       const row=existing.rows[0];
       if(!row||row.event_hash.trim()!==hash||row.aggregate_id!==envelope.aggregate_id||
          row.event_type!==envelope.event_type)
         return send(409,{error:"conflicting_event_id"});
     }
     return send(200,{ok:true,accepted:true,store_id:storeId,event_id:envelope.event_id,
       duplicate:added.rows.length===0});
   }catch{return send(503,{error:"inbox_unavailable"});}
 };
}
export async function startTestReceiverV27(){
 if(process.env.ZHIROX_V27_RECEIVER_TEST_MODE!=="true")
   throw Error("test_receiver_disabled");
 const secret=process.env.ZHIROX_V27_SYNC_SECRET;
 const storeId=process.env.ZHIROX_V27_STORE_ID;
 if(!process.env.ZHIROX_V27_TEST_RECEIVER_DB_URL)throw Error("test_receiver_db_required");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:process.env.ZHIROX_V27_TEST_RECEIVER_DB_URL,max:3});
 const server=createServer(createTestReceiverV27({pool,secret,storeId}));
 server.listen(3407,"127.0.0.1");
 server.on("close",()=>pool.end());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startTestReceiverV27().catch(e=>{console.error(e.message);process.exitCode=1;});
}
