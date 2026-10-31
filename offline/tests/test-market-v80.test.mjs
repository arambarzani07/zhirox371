import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertTestMarketTarget,TEST_MARKET} from "../test-market-v80.mjs";
const source=readFileSync("offline/test-market-v80.mjs","utf8");
test("V80 account is always isolated, never production or another store",()=>{
 assert.doesNotThrow(()=>assertTestMarketTarget({consent:"YES_CREATE_TEST_MARKET",
   dbName:"zhirox_v80_disposable",host:"127.0.0.1",storeCount:0}));
 assert.doesNotThrow(()=>assertTestMarketTarget({consent:"YES_CREATE_TEST_MARKET",
   dbName:"zhirox_test_market",host:"localhost",storeCount:0}));
 for(const overrides of [
  {consent:""}, {consent:"YES"},
  {dbName:"postgres"}, {dbName:"production"},
  {dbName:"zhirox_local"}, {host:"192.168.1.3"},
  {host:"prod.supabase.com"}, {storeCount:1}
 ]){
  assert.throws(()=>assertTestMarketTarget({consent:"YES_CREATE_TEST_MARKET",
    dbName:"zhirox_v80_disposable",host:"127.0.0.1",storeCount:0,...overrides}),
    /refuse_nonempty_or_nonisolated_test_database/);
 }
});
test("account names, sample data and store identities are explicit and test-only",()=>{
 assert.equal(TEST_MARKET.name,"مارکێتی تاقیکردنەوە");
 assert.match(TEST_MARKET.ownerUsername,/test-market/);
 assert.match(TEST_MARKET.cashierUsername,/test-market/);
 assert.notEqual(TEST_MARKET.store,TEST_MARKET.owner);
 assert.match(source,/hashLocalPassword/);
 assert.match(source,/checkout_cash_v1/);
 assert.match(source,/record_customer_debt_v79/);
 assert.match(source,/COMMIT/);
 assert.match(source,/data_retained:true/);
 assert.doesNotMatch(source,/\b(?:DROP DATABASE|DELETE FROM|TRUNCATE TABLE)\b/i);
 assert.doesNotMatch(source,/production_supabase|supabase_url|pc_os_events/);
});
test("the test account never stores passwords in logs or database fixtures as plaintext",()=>{
 assert.match(source,/passwords:"never_logged"/);
 assert.match(source,/ZHIROX_TEST_OWNER_PASSWORD/);
 assert.match(source,/ZHIROX_TEST_CASHIER_PASSWORD/);
 assert.ok(!source.includes("console.log(passwordOwner)"));
 assert.ok(!source.includes("console.log(passwordCashier)"));
});
