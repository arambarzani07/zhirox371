// V56: opt-in STAGING-only automatic HTTPS sender. Cashier never calls this.
// Deliberately NO-GO: no production activation, customer data or Windows service.
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {isIP} from "node:net";
import {runV49AutoSync} from "./autosync-v49.mjs";
import {syncOutboxOnce,validateReceiverUrl} from "./outbox-sync-worker-v27.mjs";
import {validId} from "./sync-wire-v27.mjs";

function localTestDb(value){
 let url;
 try{url=new URL(value);}catch{throw Error("v56_invalid_local_db");}
 if(!["postgres:","postgresql:"].includes(url.protocol)||
    url.hash||!url.username||!url.password||url.port&&url.port!=="5432"||
    !/^\/zhirox_v56_(?:[a-z0-9_]*_)?(?:test|trial|disposable|staging)$/i.test(url.pathname)||
    ["postgres","root","supabase_admin","service_role"].includes(decodeURIComponent(url.username).toLowerCase()))
   throw Error("v56_requires_disposable_least_privilege_db");
 const host=url.hostname;
 const loopback=["127.0.0.1","localhost","[::1]"].includes(host);
 const bytes=host.split(".").map(Number);
 const lan=isIP(host)===4&&bytes.length===4&&
   (bytes[0]===10||(bytes[0]===172&&bytes[1]>=16&&bytes[1]<=31)||
    (bytes[0]===192&&bytes[1]===168));
 if(!loopback&&!lan)throw Error("v56_db_must_be_local_lan");
 if(!loopback&&url.searchParams.get("sslmode")!=="verify-full")
   throw Error("v56_lan_db_requires_verified_tls");
 if(url.searchParams.has("sslmode")&&
    !["verify-full","verify-ca","require"].includes(url.searchParams.get("sslmode")))
   throw Error("v56_unsafe_db_sslmode");
 for(const key of url.searchParams.keys()){
   if(!["sslmode","sslrootcert","application_name"].includes(key))
     throw Error("v56_unexpected_db_parameter");
 }
 return value;
}

export function checkV56StagingConfiguration(env){
 if(!env||env.ZHIROX_V56_STAGING_AUTOSYNC_ENABLED!=="true"||
    env.ZHIROX_V56_ISOLATED_TEST_DATA!=="true"||
    env.ZHIROX_V27_TEST_MODE==="true"||
    env.ZHIROX_RELEASE_MODE==="official")
   throw Error("v56_staging_only_not_enabled");
 const storeId=env.ZHIROX_V56_STORE_ID;
 const secret=env.ZHIROX_V56_HMAC_SECRET;
 if(!validId(storeId)||typeof secret!=="string"||Buffer.byteLength(secret)<32)
   throw Error("v56_invalid_identity");
 const receiverUrl=validateReceiverUrl(env.ZHIROX_V56_STAGING_RECEIVER_URL,false);
 const remote=new URL(receiverUrl);
 const expected=env.ZHIROX_V56_EXPECTED_STAGING_HOST;
 // Exact endpoint, no userinfo, query, fragment or nonstandard port (V27).
 // Staging hostname is explicit; public DNS + genuine CA-verified TLS required.
 if(remote.port||isIP(remote.hostname)!==0||!expected||
    remote.hostname!==expected||!/(?:staging|sandbox)/i.test(remote.hostname)||
    remote.hostname.endsWith(".local")||remote.hostname.endsWith(".internal"))
   throw Error("v56_staging_https_hostname_required");
 return Object.freeze({
   storeId,secret,receiverUrl,
   localDb:localTestDb(env.ZHIROX_V56_LOCAL_DISPOSABLE_DB_URL)
 });
}

export async function startV56StagingAutoSync({
 env=process.env,signal,onStatus=()=>{},poolOverride=null,fetchImpl=fetch,
 wait,pollMs=5000,maxBackoffMs=60000
}={}){
 const config=checkV56StagingConfiguration(env); // refuse BEFORE DB or HTTP
 if(typeof onStatus!=="function"||typeof fetchImpl!=="function")
   throw Error("v56_invalid_worker_callbacks");
 const ownPool=!poolOverride;
 const pool=poolOverride||new (await import("pg")).Pool({
   connectionString:config.localDb,max:2,connectionTimeoutMillis:2000,
   idleTimeoutMillis:10000,application_name:"zhirox_v56_staging_only"
 });
 if(typeof pool.query!=="function")throw Error("v56_invalid_pool");
 try{
   return await runV49AutoSync({
     signal,pollMs,maxBackoffMs,
     ...(wait?{wait}:{}),
     runOnce:()=>syncOutboxOnce({
       pool,storeId:config.storeId,secret:config.secret,
       receiverUrl:config.receiverUrl,testMode:false,fetchImpl
     }),
     onStatus:x=>onStatus({...x,mode:"v56_https_staging",release_status:"NO_GO"})
   });
 }finally{
   if(ownPool)await pool.end();
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const controller=new AbortController();
 const stop=()=>controller.abort();
 process.once("SIGINT",stop);process.once("SIGTERM",stop);
 startV56StagingAutoSync({
   signal:controller.signal,
   onStatus:status=>console.log(JSON.stringify(status))
 }).catch(()=>{
   // Do not disclose DB URI, signing secret, HTTP body or customer payload.
   console.error("v56_staging_autosync_refused_or_failed");
   process.exitCode=1;
 }).finally(()=>{
   process.off("SIGINT",stop);process.off("SIGTERM",stop);
 });
}
