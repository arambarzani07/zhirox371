import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const sql=read("offline/migrations/028_customer_debt_ledger_v79.sql");
const workflow=read(".github/workflows/v79-local-customer-debt.yml");
test("V79 is an isolated typed ledger, never a JSONB settings balance or live checkout",()=>{
 for(const token of ["customers_v79","customer_debt_ledger_v79","customer_debt_balances_v79",
  "amount_minor bigint","PRIMARY KEY(store_id,entry_id)","UNIQUE(store_id,request_id)",
  "FOREIGN KEY(store_id,customer_id)","FOREIGN KEY(store_id,actor_id)",
  "FOR UPDATE","SECURITY INVOKER","REVOKE ALL","FROM PUBLIC","block_customer_debt_mutation_v79"]) {
  assert.ok(sql.includes(token),token);
 }
 assert.doesNotMatch(sql,/GRANT\s+[^;]+\s+TO\s+PUBLIC/i);
 assert.doesNotMatch(sql,/INSERT\s+INTO\s+zhirox_local\.(?:sales|stock_ledger|cash_movements_v38|external_settlements_v42)\b/i);
});
test("V79 distinguishes an accounting-only debt repayment from verified tender",()=>{
 assert.match(sql,/not actual receipt of cash/i);
 assert.match(sql,/opening_debt.*repayment/);
 assert.match(sql,/repayment exceeds debt/);
 assert.match(sql,/manager required/);
});
test("V79 SQL CI never targets production database",()=>{
 assert.match(workflow,/zhirox_v79_disposable/);
 assert.match(workflow,/postgres:16/);
 assert.match(workflow,/035_v79_customer_debt.sql/);
 assert.ok(!/Supabase|production.*postgres:\/\//i.test(workflow));
});
