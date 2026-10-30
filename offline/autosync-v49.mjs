// V49: isolated, opt-in automatic offline/online retry scheduler for the V27 outbox.
// DOES NOT change checkout, run on live databases, or deploy an HTTPS cloud receiver.
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {syncOutboxOnce,validateReceiverUrl} from "./outbox-sync-worker-v27.mjs";
import {validId} from "./sync-wire-v27.mjs";

export const V49_DEFAULT_POLL_MS=5000;
export const V49_DEFAULT_MAX_BACKOFF_MS=60000;

export function v49Wait(ms,signal){
 if(signal?.aborted)return Promise.resolve(false);
 return new Promise(resolve=>{
   let finished=false;
   const done=value=>{
     if(finished)return;
     finished=true;
     clearTimeout(timer);
     signal?.removeEventListener("abort",abort);
     resolve(value);
   };
   const abort=()=>done(false);
   const timer=setTimeout(()=>done(true),ms);
   signal?.addEventListener("abort",abort,{once:true});
   if(signal?.aborted)done(false);
 });
}
// No network reachability probe: DNS and ICMP availability do not confirm an authenticated
// receiver, and the checkout lane must NEVER wait for or depend on a cloud response.
export async function runV49AutoSync({
 runOnce,signal,
 wait=v49Wait,
 onStatus=()=>{},
 pollMs=V49_DEFAULT_POLL_MS,
 maxBackoffMs=V49_DEFAULT_MAX_BACKOFF_MS
}){
 if(typeof runOnce!=="function"||typeof wait!=="function"||typeof onStatus!=="function"||
   !Number.isInteger(pollMs)||pollMs<100||pollMs>60000||
   !Number.isInteger(maxBackoffMs)||maxBackoffMs<pollMs||maxBackoffMs>900000)
  throw Error("invalid_v49_scheduler_config");
 let failures=0,cycles=0;
 while(!signal?.aborted){
   try{
     const stats=await runOnce();
     if(signal?.aborted)break;
     if(!stats||!["claimed","acked","retried","lostLease"].every(k=>
        Number.isSafeInteger(stats[k])&&stats[k]>=0))
       throw Error("invalid_v27_sync_stats");
     failures=0;cycles++;
     // Operational totals only; no event payload, invoice, tokens or secrets.
     onStatus({phase:"cycle",cycles,claimed:stats.claimed,acked:stats.acked,
       retried:stats.retried,lostLease:stats.lostLease,next_ms:pollMs});
     if(!(await wait(pollMs,signal)))break;
   }catch{
     if(signal?.aborted)break;
     failures=Math.min(failures+1,15);
     const delay=Math.min(maxBackoffMs,pollMs*2**Math.min(failures-1,14));
     onStatus({phase:"retry",failures,next_ms:delay});
     if(!(await wait(delay,signal)))break;
   }
 }
 return {stopped:true,cycles};
}
export function checkV49LabConfiguration(env){
 if(env.ZHIROX_V49_LAB_AUTOSYNC_ENABLED!=="true"||
    env.ZHIROX_V27_TEST_MODE!=="true"||
    env.ZHIROX_RELEASE_MODE==="official")throw Error("v49_lab_not_enabled");
 const storeId=env.ZHIROX_V27_STORE_ID;
 const secret=env.ZHIROX_V27_SYNC_SECRET;
 const receiver=env.ZHIROX_V27_RECEIVER_URL;
 const localDb=env.ZHIROX_LOCAL_DB_URL;
 if(!validId(storeId)||typeof secret!=="string"||Buffer.byteLength(secret)<32||
    typeof localDb!=="string"||!localDb)throw Error("v49_lab_config_invalid");
 // The V49 Windows bundle is lab only: the receiver is loopback and the database
 // MUST be an isolated PostgreSQL test/trial/disposable database on localhost.
 validateReceiverUrl(receiver,true);
 let url;
 try{url=new URL(localDb);}catch{throw Error("invalid_local_test_db_url");}
 if(!["postgres:","postgresql:"].includes(url.protocol)||
    !["127.0.0.1","localhost","[::1]"].includes(url.hostname)||
    !/(?:test|trial|disposable)/i.test(decodeURIComponent(url.pathname)) ||
    url.hash)throw Error("v49_requires_loopback_test_postgres");
 return {storeId,secret,receiverUrl:receiver,localDb};
}
export async function startV49LabAutoSync({env=process.env,signal,onStatus}={}){
 const c=checkV49LabConfiguration(env); // validate before opening DB
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:c.localDb,max:2,connectionTimeoutMillis:2000});
 const controller=new AbortController();
 const halt=()=>controller.abort();
 signal?.addEventListener("abort",halt,{once:true});
 if(signal?.aborted)controller.abort();
 // Only attach process SIG handlers to a standalone command line worker.
 try{
   return await runV49AutoSync({
     signal:controller.signal,
     runOnce:()=>syncOutboxOnce({
       pool,storeId:c.storeId,secret:c.secret,receiverUrl:c.receiverUrl,testMode:true}),
     onStatus:onStatus||(()=>{})
   });
 }finally{
   signal?.removeEventListener("abort",halt);
   await pool.end();
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const controller=new AbortController();
 const stop=()=>controller.abort();
 process.once("SIGINT",stop);process.once("SIGTERM",stop);
 startV49LabAutoSync({
   signal:controller.signal,
   onStatus:status=>console.log(JSON.stringify({type:"v49_lab_sync",...status}))
 }).catch(()=>{console.error("v49_lab_autosync_refused_or_failed");process.exitCode=1;})
   .finally(()=>{process.off("SIGINT",stop);process.off("SIGTERM",stop);});
}
