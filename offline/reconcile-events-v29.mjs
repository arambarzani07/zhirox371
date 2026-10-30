import {validateReceiverUrl} from "./outbox-sync-worker-v27.mjs";
import {validId} from "./sync-wire-v27.mjs";

const MAX_IDS=5000, PAGE=50;
const uuidAscending=(a,b)=>a<b?-1:a>b?1:0;
function validatePage(data,store,previous){
 if(data?.ok!==true||data.store_id!==store||
    data.source!=="received_cloud_events_not_local_inventory"||
    !Array.isArray(data.event_ids)||typeof data.has_more!=="boolean"||
    data.event_ids.length>PAGE||typeof data.next_cursor!=="string"&&
      data.next_cursor!==null)throw Error("invalid_remote_page");
 const ids=data.event_ids;
 if(ids.some((id,i)=>!validId(id)||
    i>0&&uuidAscending(ids[i-1].toLowerCase(),id.toLowerCase())>=0||
    previous&&uuidAscending(previous.toLowerCase(),id.toLowerCase())>=0))
   throw Error("remote_order_conflict");
 if(data.has_more&&(!ids.length||data.next_cursor!==ids[ids.length-1]))
   throw Error("invalid_remote_cursor");
 if(!data.has_more&&data.next_cursor!==null)throw Error("invalid_remote_cursor");
 return ids.map(id=>id.toLowerCase());
}
export async function reconcileEventIdsV29({pool,storeId,receiverUrl,ownerToken,
  testMode=false,fetchImpl=fetch,maxIds=MAX_IDS}){
 if(typeof pool?.query!=="function"||!validId(storeId)||
    typeof ownerToken!=="string"||ownerToken.length<32||
    !Number.isInteger(maxIds)||maxIds<1||maxIds>MAX_IDS)
  throw Error("invalid_reconciliation_config");
 const receiver=validateReceiverUrl(receiverUrl,testMode);
 const base=new URL(receiver);
 base.pathname="/v29/owner/event-ids";
 // Defensive bounded pagination: reports "partial", never declares a full
 // dataset matched when more IDs are not fetched.
 const localIds=[],remoteIds=[];
 let localCursor=null,remoteCursor=null,localPartial=false,remotePartial=false;
 while(true){
  const result=await pool.query(
   "SELECT event_id::text AS event_id FROM zhirox_local.event_outbox WHERE store_id=$1::uuid AND ($2::uuid IS NULL OR event_id>$2::uuid) ORDER BY event_id LIMIT $3::integer",
   [storeId,localCursor,PAGE+1]);
  const ids=result.rows.map(x=>x.event_id);
  if(ids.some((id,i)=>!validId(id)||
      i>0&&uuidAscending(ids[i-1],id)>=0||
      localCursor&&uuidAscending(localCursor,id)>=0))
   throw Error("invalid_local_order");
  const remaining=maxIds-localIds.length;
  const take=ids.slice(0,Math.min(PAGE,remaining));
  localIds.push(...take.map(x=>x.toLowerCase()));
  localPartial=ids.length>take.length;
  if(!localPartial||localIds.length>=maxIds)break;
  localCursor=take[take.length-1];
 }
 while(true){
  base.searchParams.set("store_id",storeId);
  base.searchParams.set("limit",String(PAGE));
  if(remoteCursor)base.searchParams.set("after",remoteCursor);
  else base.searchParams.delete("after");
  const response=await fetchImpl(base.toString(),{
   method:"GET",redirect:"error",cache:"no-store",credentials:"omit",
   headers:{Authorization:"Bearer "+ownerToken},signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)throw Error("cloud_event_ids_unavailable_"+response.status);
  const page=await response.json();
  const batch=validatePage(page,storeId,remoteCursor);
  const remaining=maxIds-remoteIds.length;
  const take=batch.slice(0,remaining);
  remoteIds.push(...take);
  remotePartial=page.has_more||batch.length>take.length;
  if(!remotePartial||remoteIds.length>=maxIds)break;
  remoteCursor=page.next_cursor;
 }
 // Compare unique event IDs. This is more precise than just matching totals;
 // both queries are non-transactional, so concurrent sync still needs review.
 const l=new Set(localIds),r=new Set(remoteIds);
 const missing=localIds.filter(id=>!r.has(id));
 const unexpected=remoteIds.filter(id=>!l.has(id));
 const partial=localPartial||remotePartial;
 return {store_id:storeId,local_checked:localIds.length,
  cloud_checked:remoteIds.length,local_partial:localPartial,
  cloud_partial:remotePartial,
  local_missing_cloud:missing.length,cloud_missing_local:unexpected.length,
  local_missing_ids:missing.slice(0,20),
  cloud_missing_ids:unexpected.slice(0,20),
  status:partial?"partial_not_verified":
    missing.length||unexpected.length?"event_mismatch":
    "event_ids_match_non_atomic_snapshot",
  warning:partial?
   "Only a bounded subset checked: do not infer the missing counts are complete.":
   "Event IDs matched across two separate reads, not an atomic cross-server snapshot."
 };
}
export async function runV29Reconciliation({poolOverride=null,fetchImpl=fetch}={}){
 if(process.env.ZHIROX_V29_RECONCILE_ENABLED!=="true")
  throw Error("v29_reconcile_disabled");
 if(!poolOverride&&!process.env.ZHIROX_LOCAL_DB_URL)
  throw Error("local_db_required");
 const pool=poolOverride||new(await import("pg")).Pool({
  connectionString:process.env.ZHIROX_LOCAL_DB_URL,max:2,
  connectionTimeoutMillis:2000
 });
 try{
  const result=await reconcileEventIdsV29({
   pool,storeId:process.env.ZHIROX_V29_STORE_ID,
   receiverUrl:process.env.ZHIROX_V29_RECEIVER_URL,
   ownerToken:process.env.ZHIROX_V29_OWNER_TOKEN,
   testMode:process.env.ZHIROX_V29_TEST_MODE==="true",fetchImpl
  });
  console.log(JSON.stringify(result));return result;
 }finally{if(!poolOverride)await pool.end();}
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 runV29Reconciliation().catch(()=>{console.error("v29_reconcile_failed");process.exitCode=1;});
}
