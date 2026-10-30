// V50: read-only audit that cross-checks local sales, pending outbox and cloud event IDs.
// Disposable loopback LAB only. A green report never authorizes real supermarket sales.
import {fileURLToPath} from "node:url";
import {reconcileStoreV28} from "./reconcile-cloud-v28.mjs";
import {reconcileEventIdsV29} from "./reconcile-events-v29.mjs";
import {validateReceiverUrl} from "./outbox-sync-worker-v27.mjs";
import {validId} from "./sync-wire-v27.mjs";

export function requireDisposablePostgres(value){
 let u;
 try{u=new URL(value)}catch{throw Error("v50_invalid_test_database_url")}
 if(!["postgresql:","postgres:"].includes(u.protocol)||
    !["127.0.0.1","localhost","[::1]"].includes(u.hostname)||
    !/(?:test|trial|disposable)/i.test(decodeURIComponent(u.pathname))||
    u.hash)throw Error("v50_requires_local_disposable_postgres");
 return value;
}
export function checkV50AuditLabConfig(env){
 if(env.ZHIROX_V50_CLOUD_AUDIT_LAB_ENABLED!=="true"||
    env.ZHIROX_V29_TEST_MODE!=="true"||
    env.ZHIROX_RELEASE_MODE==="official")throw Error("v50_lab_disabled");
 const storeId=env.ZHIROX_V29_STORE_ID;
 const ownerToken=env.ZHIROX_V29_OWNER_TOKEN;
 if(!validId(storeId)||typeof ownerToken!=="string"||ownerToken.length<32)
   throw Error("v50_missing_lab_owner_identity");
 const receiverUrl=validateReceiverUrl(env.ZHIROX_V29_RECEIVER_URL,true);
 const databaseUrl=requireDisposablePostgres(env.ZHIROX_LOCAL_DB_URL);
 // Do not return credentials in the user-visible audit report.
 return {storeId,ownerToken,receiverUrl,databaseUrl};
}
export function evaluateV50Evidence(summary,events){
 if(!summary||!events||summary.store_id!==events.store_id)
   throw Error("v50_inconsistent_store_evidence");
 const isNat=n=>Number.isSafeInteger(n)&&n>=0;
 for(const n of [summary.local_sales,summary.cloud_received_sales,
   summary.local_pending_events,summary.count_gap,
   events.local_checked,events.cloud_checked,events.local_missing_cloud,
   events.cloud_missing_local]){
   // count_gap can be negative when cloud has unexpected surplus
   if(!Number.isSafeInteger(n))throw Error("v50_invalid_count");
 }
 if(!isNat(summary.local_pending_events)||!isNat(events.local_missing_cloud)||
    !isNat(events.cloud_missing_local))throw Error("v50_invalid_count");
 const partial=events.local_partial||events.cloud_partial||
   events.status==="partial_not_verified";
 const conflict=summary.status==="conflict"||events.cloud_missing_local>0||
   (summary.count_gap<0)||(!partial && events.local_missing_cloud>summary.local_pending_events);
 const pending=summary.local_pending_events>0||summary.count_gap>0||
   events.local_missing_cloud>0||summary.status==="sync_pending_or_missing";
 let syncStatus;
 if(conflict)syncStatus="CONFLICT_REQUIRES_REVIEW";
 else if(partial)syncStatus="PARTIAL_NOT_VERIFIED";
 else if(pending)syncStatus="PENDING_OR_MISSING";
 else if(summary.count_gap===0&&events.local_missing_cloud===0&&
   events.cloud_missing_local===0&&events.status==="event_ids_match_non_atomic_snapshot"&&
   summary.status==="counts_match_not_event_proof"){
   syncStatus="MATCHED_NON_ATOMIC_LAB_SNAPSHOT";
 }else syncStatus="UNVERIFIED";
 return {
   project:"ZHIROX371",stage:"V50",release_status:"NO_GO",
   sync_status:syncStatus,store_id:summary.store_id,
   local_sales:summary.local_sales,
   cloud_received_sales:summary.cloud_received_sales,
   local_pending_events:summary.local_pending_events,
   local_missing_cloud:events.local_missing_cloud,
   cloud_missing_local:events.cloud_missing_local,
   event_ids_checked:{local:events.local_checked,cloud:events.cloud_checked},
   partial:!!partial, source:"DISPOSABLE_TEST_DATABASES_ONLY",
   warning:"Non-atomic independent reads. Never evidence of bank settlement, physical PC acceptance or production cloud delivery."
 };
}
export async function auditV50LabParity({pool,storeId,ownerToken,receiverUrl,fetchImpl=fetch}){
 // Strictly local/loopback even when called programmatically.
 if(!pool||typeof pool.query!=="function"||!validId(storeId)||
    typeof ownerToken!=="string"||ownerToken.length<32)
    throw Error("v50_invalid_audit_arguments");
 const target=validateReceiverUrl(receiverUrl,true);
 const summary=await reconcileStoreV28({
    pool,storeId,receiverUrl:target,ownerToken,testMode:true,fetchImpl});
 const events=await reconcileEventIdsV29({
    pool,storeId,receiverUrl:target,ownerToken,testMode:true,fetchImpl});
 return evaluateV50Evidence(summary,events);
}
export async function runV50LabParity({env=process.env,poolOverride,fetchImpl=fetch}={}){
 const cfg=checkV50AuditLabConfig(env);
 const {Pool}=poolOverride?{Pool:null}:await import("pg");
 const pool=poolOverride||new Pool({connectionString:cfg.databaseUrl,max:2,connectionTimeoutMillis:2000});
 try{
   const report=await auditV50LabParity({...cfg,pool,fetchImpl});
   return report;
 }finally{if(!poolOverride)await pool.end();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 runV50LabParity().then(result=>{
   console.log(JSON.stringify(result,null,2));
   // Report completion is a testing success, not GO_LIVE.
   if(result.sync_status!=="MATCHED_NON_ATOMIC_LAB_SNAPSHOT")process.exitCode=2;
 }).catch(()=>{console.error("v50_disposable_lab_parity_unavailable");process.exitCode=1;});
}
