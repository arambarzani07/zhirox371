import test from "node:test";
import assert from "node:assert/strict";
import {runV49AutoSync,checkV49LabConfiguration} from "../autosync-v49.mjs";
const uuid="11111111-1111-4111-8111-111111111111";
const config={
 ZHIROX_V49_LAB_AUTOSYNC_ENABLED:"true",ZHIROX_V27_TEST_MODE:"true",
 ZHIROX_V27_STORE_ID:uuid,ZHIROX_V27_SYNC_SECRET:"x".repeat(48),
 ZHIROX_V27_RECEIVER_URL:"http://127.0.0.1:3418/v27/events",
 ZHIROX_LOCAL_DB_URL:"postgresql://localtest:fakepassword@127.0.0.1:5432/zhirox_disposable_test"
};
const stats=(changes={})=>({claimed:0,acked:0,retried:0,lostLease:0,...changes});
test("V49 rejects any live cloud receiver, real DB or missing opt-in",()=>{
 assert.deepEqual(checkV49LabConfiguration(config).receiverUrl,config.ZHIROX_V27_RECEIVER_URL);
 for(const partial of [
   {ZHIROX_V49_LAB_AUTOSYNC_ENABLED:"false"},
   {ZHIROX_V27_TEST_MODE:"false"},
   {ZHIROX_RELEASE_MODE:"official"},
   {ZHIROX_V27_RECEIVER_URL:"https://cloud.example.com/v27/events"},
   {ZHIROX_V27_RECEIVER_URL:"http://192.168.1.3:3418/v27/events"},
   {ZHIROX_V27_RECEIVER_URL:"http://localhost:3418/v27/events?x=1"},
   {ZHIROX_LOCAL_DB_URL:"postgresql://user:password@127.0.0.1:5432/zhirox_market"},
   {ZHIROX_LOCAL_DB_URL:"postgresql://user:password@192.168.1.3:5432/zhirox_test"},
   {ZHIROX_LOCAL_DB_URL:"postgresql://user:password@prod.supabase.co:5432/zhirox_test"},
   {ZHIROX_V27_SYNC_SECRET:"short"},
 ]){
   assert.throws(()=>checkV49LabConfiguration({...config,...partial}));
 }
});
test("V49 retries an internet outage without stopping a cashier or losing event id",async()=>{
 const signal=new AbortController(),status=[],waits=[],events=[];
 let attempts=0,active=0,maxActive=0;
 const runOnce=async()=>{
   active++;maxActive=Math.max(maxActive,active);
   try{
     attempts++;
     events.push("same-id");
     if(attempts<=2)throw Error("internet unavailable");
     if(attempts===3)return stats({claimed:1,retried:1});
     if(attempts===4)return stats({claimed:1,acked:1});
     signal.abort();
     return stats();
   }finally{active--;}
 };
 const result=await runV49AutoSync({
   signal:signal.signal,runOnce,pollMs:100,maxBackoffMs:800,
   wait:async(ms)=>{waits.push(ms);return !signal.signal.aborted;},
   onStatus:x=>status.push(x)
 });
 assert.deepEqual(waits,[100,200,100,100]);
 assert.deepEqual(events,Array(5).fill("same-id"));
 assert.equal(maxActive,1,"never send two overlapping sync cycles");
 assert.equal(status.filter(x=>x.phase==="retry").length,2);
 assert.equal(status.filter(x=>x.phase==="cycle"&&x.acked===1).length,1);
 assert.deepEqual(result,{stopped:true,cycles:2});
});
test("V49 backs off on unavailable PostgreSQL, then resumes",async()=>{
 const ctrl=new AbortController(),waits=[];
 let count=0;
 await runV49AutoSync({signal:ctrl.signal,pollMs:100,maxBackoffMs:300,
   runOnce:async()=>{
     count++;
     if(count<5)throw Error("DB not available");
     ctrl.abort();return stats();
   },wait:async n=>{waits.push(n);return true;}
 });
 assert.deepEqual(waits,[100,200,300,300]);
});
test("V49 refuses fake or incomplete V27 ACK counters",async()=>{
 const ctrl=new AbortController(),records=[];
 let n=0;
 await runV49AutoSync({signal:ctrl.signal,pollMs:100,maxBackoffMs:300,
   runOnce:async()=>{n++;if(n===2)ctrl.abort();return {acked:"incorrect"};},
   wait:async()=>true,onStatus:x=>records.push(x)});
 assert.equal(records[0].phase,"retry");
});
test("V49 won't run during already aborted Windows service shutdown",async()=>{
 const ctrl=new AbortController();ctrl.abort();
 let ran=false;
 const result=await runV49AutoSync({signal:ctrl.signal,runOnce:async()=>{ran=true;return stats()}});
 assert.equal(ran,false);assert.equal(result.cycles,0);
});
