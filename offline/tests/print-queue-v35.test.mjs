import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalPrintQueueHandlerV35} from "../local-print-queue-v35.mjs";
const store="10000000-0000-0000-0000-000000000035";
const cashier="20000000-0000-0000-0000-000000000035";
const other="20000000-0000-0000-0000-000000000036";
const sale="40000000-0000-0000-0000-000000000035";
const job="50000000-0000-0000-0000-000000000035";
const secret="v35-printer-queue-isolated-test-secret-".repeat(3);
const codec=makeLocalSessionCodec(secret);
const token=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const otherToken=codec.issue({store_id:store,user_id:other,role:"cashier"});
const records=[];
const pool={
 query:async(sql,args)=>{
  if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2"))
   return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
  records.push({sql,args});
  assert.match(sql,/^SELECT /);
  if(sql.includes("queue_print_v35")){
   if(args[1]!==cashier){const e=Error("not found");e.code="P3501";throw e;}
   if(args[3]!==job||args[4]!==80){const e=Error("conflicting");e.code="P3502";throw e;}
   return {rows:[{job_id:job,sale_id:sale,width_mm:80,state:"queued"}]};
  }
  if(sql.includes("FROM zhirox_local.print_requests_v35")){
   return {rows:args[1]===cashier&&args[2]===job?
    [{job_id:job,sale_id:sale,width_mm:80,state:"queued",created_at:"2026-10-30T09:00:00Z",processed_at:null}]:[]};
  }
  throw Error("unexpected SQL: "+sql);
 },connect:async()=>{throw Error("no API-side driver connection");}
};
async function run(testFn){
 records.length=0;
 const server=createServer(createLocalPrintQueueHandlerV35({pool,secret}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{await testFn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
function post(base,value,t=token){
 return fetch(base+"/api/local/v35/print-jobs",{method:"POST",
  headers:{"Authorization":"Bearer "+t,"Content-Type":"application/json"},
  body:JSON.stringify(value)});
}
test("queue receipts from authenticated cashier only, never claim actual printing",async()=>{
 await run(async base=>{
  const payload={sale_id:sale,job_id:job,width_mm:80};
  assert.equal((await post(base,payload,"garbage")).status,401);
  assert.equal((await post(base,payload,otherToken)).status,404);
  const first=await post(base,payload);
  assert.equal(first.status,202);
  const body=await first.json();
  assert.equal(body.job.state,"queued");
  assert.equal(body.hardware_printed,false);
  assert.match(body.notice,/not installed/);
  const replay=await post(base,payload);
  assert.equal(replay.status,202);
  const status=await fetch(base+"/api/local/v35/print-jobs?job_id="+job,
    {headers:{Authorization:"Bearer "+token}});
  assert.equal(status.status,200);
  assert.equal((await status.json()).hardware_printed,false);
  assert.deepEqual(records[0].args,[store,other,sale,job,80]);
  assert.ok(records.every(x=>x.sql.startsWith("SELECT ")));
 });
});
test("no arbitrary print text, price, wrong paper, or stealth reprint",async()=>{
 await run(async base=>{
  assert.equal((await post(base,{sale_id:sale,job_id:job,width_mm:80,raw:"ESC/POS"})).status,400);
  assert.equal((await post(base,{sale_id:sale,job_id:job,width_mm:72})).status,400);
  assert.equal((await post(base,{sale_id:sale,job_id:"bad",width_mm:80})).status,400);
  assert.equal((await post(base,{sale_id:sale,job_id:job,width_mm:58})).status,409);
  assert.equal((await post(base,{sale_id:sale,job_id:"50000000-0000-0000-0000-000000000036",width_mm:80})).status,409);
  assert.equal((await fetch(base+"/api/local/v35/print-jobs?job_id="+job+"&width_mm=80",
    {headers:{Authorization:"Bearer "+token}})).status,400);
  assert.equal((await fetch(base+"/api/local/v35/print-jobs",
    {method:"DELETE",headers:{Authorization:"Bearer "+token}})).status,405);
 });
});
