import {createEventEnvelope,signEvent,validId} from "./sync-wire-v27.mjs";

const SENDER_PATH="/v27/events";
export function validateReceiverUrl(value,testMode=false){
 let url;
 try{url=new URL(value);}catch{throw Error("invalid_receiver_url");}
 if(url.username||url.password||url.search||url.hash||url.pathname!==SENDER_PATH)
   throw Error("invalid_receiver_url");
 const local=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
 // No arbitrary HTTP, LAN, intranet or production redirects.
 if(testMode){
   if(!local||url.protocol!=="http:")throw Error("test_receiver_must_be_loopback");
 }else if(url.protocol!=="https:"||local||/^(?:10|127|192\.168)\./.test(url.hostname)||
            /^172\.(?:1[6-9]|2[0-9]|3[01])\./.test(url.hostname)){
   throw Error("production_receiver_requires_external_https");
 }
 return url.toString();
}
function safeReason(error){
 const code=error instanceof Error?error.message:"delivery_failed";
 return String(code).replace(/[^a-zA-Z0-9_.:-]/g,"_").slice(0,120);
}
export async function syncOutboxOnce({pool,storeId,receiverUrl,secret,
                                      testMode=false,fetchImpl=fetch,now=()=>Date.now(),
                                      maxBatch=10}){
 if(!pool||typeof pool.query!=="function"||!validId(storeId)||
    typeof secret!=="string"||Buffer.byteLength(secret)<32||
    !Number.isInteger(maxBatch)||maxBatch<1||maxBatch>20)
   throw Error("invalid_sender_configuration");
 const target=validateReceiverUrl(receiverUrl,testMode);
 // Never hold PostgreSQL row locks or a transaction during HTTP calls.
 const claimed=await pool.query(
   "SELECT * FROM zhirox_local.claim_outbox_v27($1::uuid,$2::integer,$3::integer)",
   [storeId,maxBatch,60]
 );
 const stats={claimed:claimed.rows.length,acked:0,retried:0,lostLease:0};
 for(const row of claimed.rows){
   let delivered=false,reason="delivery_failed";
   try{
     if(row.store_id!==storeId||!validId(row.lease_token))throw Error("invalid_lease");
     const body=JSON.stringify(createEventEnvelope(row));
     if(Buffer.byteLength(body)>65536)throw Error("event_too_large");
     const timestamp=String(now());
     const signature=signEvent(body,secret,timestamp);
     const resp=await fetchImpl(target,{
       method:"POST",redirect:"error",cache:"no-store",credentials:"omit",
       headers:{"Content-Type":"application/json","X-ZHIROX-Timestamp":timestamp,
                "X-ZHIROX-Signature":signature},
       body,signal:AbortSignal.timeout(8000)
     });
     if(resp.ok){
       const ack=await resp.json();
       delivered=ack?.ok===true&&ack?.store_id===storeId&&
         ack?.event_id===row.event_id&&ack?.accepted===true;
       if(!delivered)reason="invalid_remote_ack";
     }else reason="remote_http_"+resp.status;
   }catch(error){reason=safeReason(error);}
   const result=delivered?
      await pool.query("SELECT zhirox_local.ack_outbox_v27($1::uuid,$2::uuid,$3::uuid) AS ok",
        [storeId,row.event_id,row.lease_token]):
      await pool.query("SELECT zhirox_local.fail_outbox_v27($1::uuid,$2::uuid,$3::uuid,$4::text) AS ok",
        [storeId,row.event_id,row.lease_token,reason]);
   if(result.rows[0]?.ok===true){
     if(delivered)stats.acked++;else stats.retried++;
   }else stats.lostLease++;
 }
 return stats;
}
export async function startV27SyncWorker({once=false,poolOverride=null,fetchImpl=fetch}={}){
 if(process.env.ZHIROX_V27_SYNC_ENABLED!=="true")throw Error("sync_is_disabled");
 const storeId=process.env.ZHIROX_V27_STORE_ID;
 const secret=process.env.ZHIROX_V27_SYNC_SECRET;
 const receiverUrl=process.env.ZHIROX_V27_RECEIVER_URL;
 const testMode=process.env.ZHIROX_V27_TEST_MODE==="true";
 validateReceiverUrl(receiverUrl,testMode);
 if(!validId(storeId)||!secret||Buffer.byteLength(secret)<32)throw Error("invalid_config");
 if(!poolOverride&&!process.env.ZHIROX_LOCAL_DB_URL)throw Error("local_db_required");
 const pool=poolOverride||new (await import("pg")).Pool({
   connectionString:process.env.ZHIROX_LOCAL_DB_URL,max:2,connectionTimeoutMillis:2000
 });
 let stop=false;
 const halt=()=>{stop=true;};
 if(!once){process.once("SIGINT",halt);process.once("SIGTERM",halt);}
 try{
   do{
     const stats=await syncOutboxOnce({pool,storeId,secret,receiverUrl,testMode,fetchImpl});
     // Operational counts only; never log secrets, receipts or customer data.
     console.log(JSON.stringify({type:"v27_sync",...stats}));
     if(once||stop)break;
     await new Promise(resolve=>setTimeout(resolve,5000));
   }while(!stop);
 }finally{
   if(!once){process.off("SIGINT",halt);process.off("SIGTERM",halt);}
   if(!poolOverride)await pool.end();
 }
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 const once=process.argv.includes("--once");
 startV27SyncWorker({once}).catch(e=>{
   console.error("v27_sync_error:",safeReason(e));
   process.exitCode=1;
 });
}
