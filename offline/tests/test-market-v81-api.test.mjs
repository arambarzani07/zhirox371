import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {once} from "node:events";
import {createTestMarketHandlerV81} from "../local-test-market-v81.mjs";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";
test("V81 fail-closed test market: registered store and signed role gate; never writes",async()=>{
 const secret="v81-test-market-session-secret-using-only-test-keys-987654";
 const code=makeLocalSessionCodec(secret);
 const owner=code.issue({user_id:TEST_MARKET.owner,store_id:TEST_MARKET.store,role:"owner",session_version:1});
 const cashier=code.issue({user_id:TEST_MARKET.cashier,store_id:TEST_MARKET.store,role:"cashier",session_version:1});
 const foreign=code.issue({user_id:TEST_MARKET.owner,store_id:"10000000-0000-0000-0000-000000000000",role:"owner",session_version:1});
 let dbName="zhirox_test_market",storeId=TEST_MARKET.store;
 const calls=[];
 const pool={
  connect:async()=>({query:async()=>({rows:[]}),release(){}}),
  query:async(sql,args=[])=>{
   calls.push({sql,args});
   if(sql.includes("current_database()"))return {rows:[{dbname:dbName}]};
   if(sql==="SELECT id,name FROM zhirox_local.stores")
     return {rows:[{id:storeId,name:TEST_MARKET.name}]};
   if(sql.includes("FROM zhirox_local.local_users"))
    return {rows:[{role:args[1]===TEST_MARKET.owner?"owner":"cashier",enabled:true,session_version:1,locked_until:null}]};
   if(sql.includes("FROM zhirox_local.products p"))
    return {rows:[{id:TEST_MARKET.product1,name:"ئاوی تاقیکردنەوە",price_minor:"2500",stock_base_units:"22",barcode:"TESTV80-ITEM-001"}]};
   if(sql.includes("FROM zhirox_local.sales"))
    return {rows:[{receipt_no:"1",total_minor:"8000"}]};
   if(sql.includes("FROM zhirox_local.customer_debt_ledger_v79"))
    return {rows:[{entry_type:"opening_debt",amount_minor:"15000"}]};
   if(sql.includes("FROM zhirox_local.customer_debt_balances_v79"))
    return {rows:[{customer_id:TEST_MARKET.customer,display_name:"کڕیاری تاقیکردنەوە",balance_minor:"10000"}]};
   throw Error("unmatched SQL "+sql);
  }
 };
 const server=http.createServer(createTestMarketHandlerV81({pool,secret}));
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const origin="http://127.0.0.1:"+server.address().port;
 const get=(path,token,method="GET")=>fetch(origin+path,{method,
  ...(token?{headers:{Authorization:"Bearer "+token}}:{})});
 try{
  assert.equal((await get("/api/local/v81/products")).status,401);
  assert.equal((await get("/api/local/v81/customers",cashier)).status,403);
  assert.equal((await get("/api/local/v81/customers",foreign)).status,401);
  assert.equal((await get("/api/local/v81/customers",owner,"POST")).status,405);
  assert.equal((await get("/api/local/v81/products?store_id=somebody",owner)).status,400);
  assert.equal((await get("/api/local/v81/products",owner)).status,200);
  assert.equal((await get("/api/local/v81/sales",cashier)).status,200);
  assert.equal((await get("/api/local/v81/customers",owner)).status,200);
  assert.equal((await get("/api/local/v81/customers/"+TEST_MARKET.customer+"/ledger",owner)).status,200);
  const sql=calls.find(c=>c.sql.includes("FROM zhirox_local.customer_debt_ledger_v79"));
  assert.deepEqual(sql.args,[TEST_MARKET.store,TEST_MARKET.customer]);
  const cashierQuery=calls.find(c=>c.sql.includes("SELECT receipt_no,total_minor,created_at"));
  assert.deepEqual(cashierQuery.args,[TEST_MARKET.store,TEST_MARKET.cashier]);
  dbName="production_db";
  assert.equal((await get("/api/local/v81/products",owner)).status,503);
  dbName="zhirox_test_market";storeId="10000000-0000-0000-0000-000000000001";
  assert.equal((await get("/api/local/v81/products",owner)).status,503);
  assert.equal(calls.filter(c=>/INSERT|UPDATE|DELETE|TRUNCATE|DROP/i.test(c.sql)).length,0);
 }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))}
});
