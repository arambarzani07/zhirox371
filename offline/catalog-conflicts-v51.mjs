// V51 versioned catalog/price/stock conflict analysis. No SQL, HTTP or writes.
// This is a PROPOSAL ONLY: live stock must remain authoritative on the store LAN.
import {validId} from "./sync-wire-v27.mjs";

const TYPES=new Set(["catalog.product_upsert","catalog.price_set","stock.snapshot"]);
const SOURCES=new Set(["local_pos","cloud_admin"]);
const natural=n=>Number.isSafeInteger(n)&&n>=0;
export function validateV51Delta(d){
 if(!d||typeof d!=="object"||Array.isArray(d)||
    !validId(d.store_id)||!validId(d.product_id)||!validId(d.event_id)||
    !TYPES.has(d.event_type)||!SOURCES.has(d.source)||
    !natural(d.base_version)||!natural(d.version)||d.version!==d.base_version+1||
    !d.payload||typeof d.payload!=="object"||Array.isArray(d.payload))
   return false;
 if(d.event_type==="catalog.product_upsert")
   return d.source==="local_pos"&&
     typeof d.payload.name==="string"&&
     d.payload.name.trim().length>0&&d.payload.name.length<=240&&
     ["unit","kg"].includes(d.payload.unit)&&
     Object.keys(d.payload).every(k=>["name","unit"].includes(k));
 if(d.event_type==="catalog.price_set")
   return natural(d.payload.sale_price_minor)&&
     Object.keys(d.payload).length===1&&
     Object.hasOwn(d.payload,"sale_price_minor"); // never transmit purchase cost
 if(d.event_type==="stock.snapshot")
   return d.source==="local_pos"&&natural(d.payload.stock_base_units)&&
     Object.keys(d.payload).length===1&&Object.hasOwn(d.payload,"stock_base_units");
 return false;
}
export function planV51CatalogDryRun({storeId,localVersions,deltas}){
 if(!validId(storeId)||!Array.isArray(localVersions)||localVersions.length>10000||
   !Array.isArray(deltas)||deltas.length>1000)throw Error("v51_invalid_dry_run_input");
 const cursor=new Map();
 for(const row of localVersions){
   if(!row||row.store_id!==storeId||!validId(row.product_id)||
      !natural(row.version)||cursor.has(row.product_id))
     throw Error("v51_invalid_local_version_snapshot");
   cursor.set(row.product_id,row.version);
 }
 const seen=new Map(),results=[];
 for(const d of deltas){
   if(!validateV51Delta(d)||d.store_id!==storeId){
     results.push({event_id:validId(d?.event_id)?d.event_id:null,
       status:"BLOCKED_INVALID_OR_FOREIGN",product_id:null});continue;
   }
   const fingerprint=JSON.stringify(d);
   const earlier=seen.get(d.event_id);
   if(earlier!==undefined){
     results.push({event_id:d.event_id,product_id:d.product_id,
       status:earlier===fingerprint?"DUPLICATE_NO_ACTION":"CONFLICTING_EVENT_ID"});
     continue;
   }
   seen.set(d.event_id,fingerprint);
   const existing=cursor.get(d.product_id);
   // New objects must be created at version 0 -> 1. Never implicitly reset existing objects.
   if(existing===undefined&&d.base_version!==0){
     results.push({event_id:d.event_id,product_id:d.product_id,status:"MISSING_PRODUCT_VERSION"});
     continue;
   }
   const current=existing??0;
   const state=d.base_version<current?"STALE_VERSION":
     d.base_version>current?"VERSION_GAP":"REVIEW_ONLY_NOT_APPLIED";
   results.push({event_id:d.event_id,product_id:d.product_id,status:state});
   if(state==="REVIEW_ONLY_NOT_APPLIED"){
     // Virtual cursor for DRY-RUN sequence analysis, NEVER the real local DB.
     cursor.set(d.product_id,d.version);
   }
 }
 const counts={};
 for(const r of results)counts[r.status]=(counts[r.status]||0)+1;
 return {
   project:"ZHIROX371",phase:"V51",store_id:storeId,mode:"DRY_RUN_ONLY",
   applied_count:0,local_mutations:0,cloud_mutations:0,
   proposed_count:results.length,results,counts,
   conflicts:results.filter(x=>x.status!=="REVIEW_ONLY_NOT_APPLIED"&&
       x.status!=="DUPLICATE_NO_ACTION").length,
   release_status:"NO_GO",
   warning:"Price and stock changes were NOT applied. Local LAN PostgreSQL is authoritative until owner-approved resolution and audited migrations."
 };
}
