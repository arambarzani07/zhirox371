// V103: local operator CSV file reader with atomic fail-closed refresh.
// Genuine file bytes only. Never imports into SQL, writes a catalog, or starts on WAN.
import {lstat} from "node:fs/promises";
import {openMarketCSVV102} from "./market-catalog-v102.mjs";

export const V103_INTERVAL_MS=5*60*1000;
export const V103_MAX_AGE_MS=24*60*60*1000;
const signature=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(":");
const safeFileStat=async path=>{
 const s=await lstat(path);
 if(!s.isFile()||s.isSymbolicLink()||s.size<20||s.size>16*1024*1024)
  throw Error("v103_source_invalid");
 return s;
};

export function createV103AtomicCatalog({
 csvPath,clock=()=>Date.now(),loader=openMarketCSVV102,
 probe=safeFileStat,refreshIntervalMs=V103_INTERVAL_MS,
 maxAgeMs=V103_MAX_AGE_MS
}={}){
 if(typeof csvPath!=="string"||!csvPath||
  typeof clock!=="function"||typeof loader!=="function"||
  typeof probe!=="function"||refreshIntervalMs!==V103_INTERVAL_MS||
  maxAgeMs!==V103_MAX_AGE_MS)
  throw Error("v103_operator_file_and_fixed_refresh_policy_required");
 let current=null,signatureValue=null,lastHashCheck=0,pending=null;
 let unavailableReason="snapshot_unavailable",generation=0,lastSuccessful=null,timer=null;
 const freshness=c=>{
  const timestamp=c?.status?.source_modified_at?Date.parse(c.status.source_modified_at):NaN;
  const delta=clock()-timestamp;
  return Number.isFinite(delta)&&delta>=-5*60*1000&&delta<=maxAgeMs;
 };
 const invalidate=reason=>{
  current=null;signatureValue=null;unavailableReason=reason;
 };
 async function refresh({force=false}={}){
  if(pending)return pending;
  pending=(async()=>{
   try{
    const before=signature(await probe(csvPath));
    if(!force&&current&&before===signatureValue&&clock()-lastHashCheck<V103_INTERVAL_MS){
     return;
    }
    const candidate=await loader(csvPath);
    const after=signature(await probe(csvPath));
    if(before!==after)throw Error("v103_source_changed_during_read");
    if(!candidate?.status||candidate.status.write_enabled!==false||
     candidate.status.checkout_enabled!==false||
     typeof candidate.scan!=="function"||typeof candidate.search!=="function"||
     !freshness(candidate))
      throw Error("v103_source_untrusted_or_stale");
    // Only publish after both file stat checks, parse, integrity and freshness.
    if(!current||current.status.source_sha256!==candidate.status.source_sha256){
     current=candidate;generation++;
    }
    signatureValue=after;
    lastHashCheck=clock();
    lastSuccessful=new Date(clock()).toISOString();
    unavailableReason=null;
   }catch{
    // An invalid, missing or stale source must NEVER retain old trusted prices.
    invalidate("snapshot_unavailable_or_stale");
   }
  })();
  try{await pending;}finally{pending=null;}
 }
 async function snapshot(){
  await refresh();
  if(current&&!freshness(current)){
   invalidate("snapshot_unavailable_or_stale");
  }
  return current?{ok:true,catalog:current,generation,lastSuccessful}:{
   ok:false,error:unavailableReason||"snapshot_unavailable",generation,
   lastSuccessful
  };
 }
 function startPolling(){
  if(timer)return;
  timer=setInterval(()=>{void refresh({force:true});},V103_INTERVAL_MS);
  timer.unref?.();
 }
 function stopPolling(){if(timer){clearInterval(timer);timer=null;}}
 return Object.freeze({refresh,snapshot,startPolling,stopPolling});
}
