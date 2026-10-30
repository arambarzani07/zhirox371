import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalTenderReportHandlerV42} from "../local-tender-report-v42.mjs";
const store="10000000-0000-0000-0000-000000000042";
const cashier="20000000-0000-0000-0000-000000000042";
const other="20000000-0000-0000-0000-000000000043";
const shift="40000000-0000-0000-0000-000000000042";
const secret="v42-session-lab-not-for-production".repeat(3);
const codec=makeLocalSessionCodec(secret);
const token=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const stranger=codec.issue({store_id:store,user_id:other,role:"cashier"});
const calls=[];
const pool={connect:async()=>{throw Error("not needed");},query:async(sql,args)=>{
 if(sql.startsWith("SELECT role,enabled,session_version,locked_until FROM zhirox_local.local_users"))
  return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
 calls.push({sql,args});assert.ok(sql.startsWith("SELECT "));
 if(sql.includes("tender_summary_v42"))
  return {rows:args[1]===cashier?[{gross_sales_minor:"25000",
   cash_sales_minor:"10000",bank_sales_minor:"15000",
   cash_refunds_minor:"0",expected_drawer_minor:"11200"}]:[]};
 throw Error("unexpected SQL "+sql);
}};
async function serve(fn){
 calls.length=0;
 const server=createServer(createLocalTenderReportHandlerV42({pool,secret}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
const fetchIt=(base,path,session=token,method="GET")=>
 fetch(base+path,{method,headers:session?{Authorization:"Bearer "+session}:{}});
test("cash register can read only own SQL-derived cash/bank totals",async()=>{
 await serve(async base=>{
  const path="/api/local/v42/tender-report?shift_id="+shift;
  assert.equal((await fetchIt(base,path,null)).status,401);
  assert.equal((await fetchIt(base,path,stranger)).status,404);
  const r=await fetchIt(base,path);
  assert.equal(r.status,200);const data=await r.json();
  assert.equal(data.report.cash_sales_minor,"10000");
  assert.equal(data.report.bank_sales_minor,"15000");
  assert.equal(data.report.gross_sales_minor,"25000");
  assert.equal(data.report.expected_drawer_minor,"11200");
  assert.equal(data.external_provider_integrated,false);
  assert.equal(data.official_mixed_tender_enabled,false);
  assert.deepEqual(calls.find(c=>c.sql.includes("tender_summary_v42")).args,
    [store,other,shift]);
  assert.equal((await fetchIt(base,path+"&amount_minor=1")).status,400);
  assert.equal((await fetchIt(base,path,token,"POST")).status,405);
 });
});
test("merchant readiness never asserts a live bank integration",async()=>{
 await serve(async base=>{
  const path="/api/local/v42/merchant-readiness";
  const r=await fetchIt(base,path);
  assert.equal(r.status,200);
  const readiness=await r.json();
  assert.equal(readiness.external_provider_integrated,false);
  assert.equal(readiness.official_mixed_tender_enabled,false);
  assert.equal(readiness.release_ready,false);
  assert.ok(readiness.blockers.includes("provider_credentials_and_verified_settlement_missing"));
  assert.equal((await fetchIt(base,path+"?approved=true")).status,400);
  assert.equal((await fetchIt(base,path,null)).status,401);
  assert.equal((await fetchIt(base,path,token,"POST")).status,405);
  assert.equal((await fetchIt(base,"/api/local/v42/verify-payment",token,"POST")).status,404);
  assert.equal(calls.length,0);
 });
});
