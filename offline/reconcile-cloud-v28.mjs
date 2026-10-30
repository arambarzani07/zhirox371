import {validateReceiverUrl} from "./outbox-sync-worker-v27.mjs";
import {validId} from "./sync-wire-v27.mjs";

// Read-only reconciliation, run manually. This is NOT a replacement for
// a durable cloud outbox nor proof that all events have been delivered.
export async function reconcileStoreV28({pool,storeId,receiverUrl,ownerToken,
  testMode=false,fetchImpl=fetch}){
 if(typeof pool?.query!=="function"||!validId(storeId)||typeof ownerToken!=="string"||
    ownerToken.length<32)throw Error("invalid_reconciliation_config");
 const receiver=validateReceiverUrl(receiverUrl,testMode);
 const url=new URL(receiver);
 url.pathname="/v28/owner/summary";
 url.searchParams.set("store_id",storeId);
 // Source read only: never modify POS sales, inventory or outbox during report.
 const [local,pending]=await Promise.all([
   pool.query("SELECT count(*)::bigint AS count,coalesce(max(receipt_no),0)::bigint AS last_receipt_no,coalesce(sum(total_minor),0)::numeric AS total_minor FROM zhirox_local.sales WHERE store_id=$1::uuid",[storeId]),
   pool.query("SELECT count(*)::bigint AS pending FROM zhirox_local.event_outbox WHERE store_id=$1::uuid AND delivered_at IS NULL",[storeId])
 ]);
 const response=await fetchImpl(url.toString(),{
   method:"GET",redirect:"error",cache:"no-store",credentials:"omit",
   headers:{Authorization:"Bearer "+ownerToken},signal:AbortSignal.timeout(8000)
 });
 if(!response.ok)throw Error("cloud_summary_unavailable_"+response.status);
 const remote=await response.json();
 if(remote?.ok!==true||remote.store_id!==storeId||
    remote.source!=="received_cloud_events_not_local_inventory"||
    !Number.isSafeInteger(remote.sales_count)||remote.sales_count<0||
    !Number.isSafeInteger(remote.last_receipt_no)||remote.last_receipt_no<0||
    !/^\d+$/.test(String(remote.total_minor)))
   throw Error("untrusted_cloud_summary");
 const sales=Number(local.rows[0]?.count||0),last=Number(local.rows[0]?.last_receipt_no||0);
 const outstanding=Number(pending.rows[0]?.pending||0);
 if(!Number.isSafeInteger(sales)||!Number.isSafeInteger(last)||
    !Number.isSafeInteger(outstanding)||outstanding<0)
   throw Error("invalid_local_counts");
 // A count match is only a preliminary check: not per-event proof.
 return {
   store_id:storeId,local_sales:sales,cloud_received_sales:remote.sales_count,
   local_last_receipt:last,cloud_last_receipt:remote.last_receipt_no,
   local_pending_events:outstanding,
   count_gap:sales-remote.sales_count,
   status:remote.sales_count>sales||remote.last_receipt_no>last?"conflict":
     outstanding>0||remote.sales_count<sales||remote.last_receipt_no<last?
       "sync_pending_or_missing":"counts_match_not_event_proof",
   warning:"Count parity is not event-level reconciliation. Use immutable event IDs for definitive matching."
 };
}
export async function mainV28Reconciliation({poolOverride=null,fetchImpl=fetch}={}){
 if(process.env.ZHIROX_V28_RECONCILE_ENABLED!=="true")
   throw Error("reconciliation_disabled");
 const config={
   storeId:process.env.ZHIROX_V28_STORE_ID,
   receiverUrl:process.env.ZHIROX_V28_RECEIVER_URL,
   ownerToken:process.env.ZHIROX_V28_OWNER_TOKEN,
   testMode:process.env.ZHIROX_V28_TEST_MODE==="true",
   fetchImpl
 };
 if(!poolOverride&&!process.env.ZHIROX_LOCAL_DB_URL)throw Error("local_db_required");
 const pool=poolOverride||new (await import("pg")).Pool({
   connectionString:process.env.ZHIROX_LOCAL_DB_URL,max:2,connectionTimeoutMillis:2000
 });
 try{
   const result=await reconcileStoreV28({...config,pool});
   console.log(JSON.stringify(result));
   return result;
 }finally{if(!poolOverride)await pool.end();}
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 mainV28Reconciliation().catch(e=>{
   // Never print server URLs, credentials, tokens or database query results.
   console.error(e?.message==="reconciliation_disabled"?"reconciliation_disabled":"reconciliation_failed");
   process.exitCode=1;
 });
}
