import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalFinancialAuditHandlerV45} from "../local-financial-audit-v45.mjs";
const store="10000000-0000-0000-0000-000000000045";
const manager="20000000-0000-0000-0000-000000000045";
const cashier="20000000-0000-0000-0000-000000000046";
const secret="v45-test-only-secret-and-not-production".repeat(3);
const codec=makeLocalSessionCodec(secret);
const good=codec.issue({store_id:store,user_id:manager,role:"manager"});
const cash=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const sqlCalls=[];
const checks=["evidence_pending_sale","evidence_cancelled_intent",
 "expired_held_stock","missing_reservation","sale_without_evidence",
 "sale_without_consumed_hold","sale_amount_mismatch"].map(
 (code,i)=>({check_code:code,case_count:i===0?"1":"0",
 proposed_external_minor:i===0?"1500":"0",
 severity:i===0?"critical":"review"}));
const pool={connect:async()=>{throw Error("not needed");},
 query:async(sql,args)=>{
  if(sql.startsWith("SELECT role,enabled,session_version,locked_until FROM zhirox_local.local_users"))
   return {rows:[{role:args[1]===manager?"manager":"cashier",
    enabled:true,session_version:1,locked_until:null}]};
  sqlCalls.push({sql,args});
  if(sql.includes("financial_integrity_audit_v45"))
   return {rows:checks};
  throw Error("unexpected query "+sql);
 }};
async function serve(fn){
 sqlCalls.length=0;
 const server=createServer(createLocalFinancialAuditHandlerV45({pool,secret}));
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(ok=>server.close(ok));}
}
const req=(base,path,t=good,method="GET")=>fetch(base+path,
 {method,headers:t?{Authorization:"Bearer "+t}:{}});
test("only a live signed manager sees SQL-derived seven-check audit",async()=>{
 await serve(async base=>{
  const url="/api/local/v45/financial-integrity";
  assert.equal((await req(base,url,null)).status,403);
  assert.equal((await req(base,url,cash)).status,403);
  const response=await req(base,url);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.read_only,true);
  assert.equal(body.provider_payment_verified,false);
  assert.equal(body.official_mixed_tender_enabled,false);
  assert.equal(body.proposed_amounts_are_not_bank_balances,true);
  assert.equal(body.checks.length,7);
  assert.deepEqual(sqlCalls,[{sql:
   "SELECT * FROM zhirox_local.financial_integrity_audit_v45($1::uuid)",args:[store]}]);
  assert.equal((await req(base,url+"?provider_paid=true")).status,400);
  assert.equal((await req(base,url,good,"POST")).status,405);
 });
});
test("no fake authorization or provider-confirm endpoint",async()=>{
 await serve(async base=>{
  assert.equal((await req(base,"/api/local/v45/verify-payment",good,"POST")).status,404);
  assert.equal((await req(base,"/api/local/v45/release-hold",good,"POST")).status,404);
  assert.equal((await req(base,"/api/local/v45/mark-refunded",good,"POST")).status,404);
  assert.equal(sqlCalls.length,0);
 });
});
