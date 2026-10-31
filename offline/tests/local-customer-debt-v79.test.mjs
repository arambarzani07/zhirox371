import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {once} from "node:events";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalCustomerDebtHandlerV79} from "../local-customer-debt-v79.mjs";

test("V79 debt reads are manager-only, store-bound and strictly read-only",async()=>{
 const secret="v79_disposable_64_character_local_auth_secret_123456789abcdef";
 const store="10000000-0000-0000-0000-000000000079";
 const user="20000000-0000-0000-0000-000000000079";
 const customer="30000000-0000-0000-0000-000000000079";
 const codec=makeLocalSessionCodec(secret);
 const manager=codec.issue({store_id:store,user_id:user,role:"manager",session_version:1});
 const cashier=codec.issue({store_id:store,user_id:user,role:"cashier",session_version:1});
 const calls=[];
 const pool={
   connect:async()=>({release(){}}),
   query:async(sql,args)=>{
     calls.push({sql,args});
     if(sql.includes("FROM zhirox_local.local_users"))
       return {rows:[{role:"manager",enabled:true,session_version:1,locked_until:null}]};
     if(sql.includes("FROM zhirox_local.customers_v79 c"))
       return {rows:[{customer_id:customer,display_name:"تاقیکردنەوە",balance_minor:"1000",is_active:true}]};
     if(sql.includes("FROM zhirox_local.customer_debt_ledger_v79"))
       return {rows:[{entry_id:customer,entry_type:"opening_debt",amount_minor:"1000"}]};
     throw Error("unexpected query");
   }
 };
 const server=http.createServer(createLocalCustomerDebtHandlerV79({pool,secret}));
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const origin="http://127.0.0.1:"+server.address().port;
 const call=(path,token,method="GET")=>fetch(origin+path,{
   method,headers:token?{Authorization:"Bearer "+token}:{}
 });
 try{
  let response=await call("/api/local/v79/customers");
  assert.equal(response.status,401);
  response=await call("/api/local/v79/customers",cashier);
  assert.equal(response.status,401);
  assert.equal(calls.length,0,"no DB reads for unauthorized requests");
  response=await call("/api/local/v79/customers?limit=2",manager);
  assert.equal(response.status,200);
  assert.equal((await response.json()).customers.length,1);
  const q=calls.find(v=>v.sql.includes("FROM zhirox_local.customers_v79 c"));
  assert.deepEqual(q.args,[store,2],"store derived from signed session, not client");
  assert.match(q.sql,/WHERE c.store_id=\$1::uuid/);
  response=await call("/api/local/v79/customers/"+customer+"/ledger?limit=3",manager);
  assert.equal(response.status,200);
  assert.equal((await response.json()).entries.length,1);
  const ledger=calls.find(v=>v.sql.includes("FROM zhirox_local.customer_debt_ledger_v79"));
  assert.deepEqual(ledger.args,[store,customer,3]);
  response=await call("/api/local/v79/customers",manager,"POST");
  assert.equal(response.status,405,"no financial write endpoint");
  response=await call("/api/local/v79/customers?store_id=attacker",manager);
  assert.equal(response.status,400);
  response=await call("/api/local/v79/customers?limit=10&limit=20",manager);
  assert.equal(response.status,400);
  response=await call("/api/local/v79/customers/not-valid/ledger",manager);
  assert.equal(response.status,400);
  response=await call("/api/local/v79/customers?limit=999",manager);
  assert.equal(response.status,400);
  response=await call("/api/local/v79/not-found",manager);
  assert.equal(response.status,404);
  assert.ok(!calls.some(v=>/INSERT|UPDATE|DELETE|ALTER/i.test(v.sql)),"no write SQL");
 }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
