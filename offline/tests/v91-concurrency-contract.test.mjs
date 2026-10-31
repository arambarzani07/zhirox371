import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const src=readFileSync("offline/tests/v91_unified_lot_concurrency_real_pg.mjs","utf8");
const workflow=readFileSync(".github/workflows/v81-test-market-pc.yml","utf8");

test("V91 real PostgreSQL race is opt-in to a loopback disposable named market and has no browser financial writes",()=>{
  for(const token of [
    'PGHOST: "127.0.0.1"',
    'PGDATABASE: "zhirox_v80_disposable"',
    'PGUSER: "v80test"',
    'ZHIROX_V81_TEST_MARKET: "YES_LOCAL_TEST_READ_ONLY"',
    'مارکێتی تاقیکردنەوە',
    'checkout_unified_fefo_v90',
    'return_unified_lot_v90',
    'Promise.allSettled',
    '23514',
    'P9003',
    'accounting_only',
    'await pool.end()',
  ]) assert.ok(src.includes(token),token);
  assert.doesNotMatch(src,/\b(?:fetch|axios|https?\.request)\s*\(/);
  assert.doesNotMatch(src,/\b(?:DROP|TRUNCATE|ALTER)\s+(?:TABLE|SCHEMA|DATABASE)/i);
  assert.doesNotMatch(src,/\b(?:SUPABASE_URL|SERVICE_ROLE_KEY|DATABASE_URL)\b/);
});
test("V91 runs only AFTER V90 SQL fixture and V81 read-only browser proof",()=>{
  const fixture=workflow.indexOf("offline/tests/051_v90_unified_lot_fixture.sql");
  const browser=workflow.indexOf("node tests/browser/v81_test_market_real_pg.mjs");
  const race=workflow.indexOf("node offline/tests/v91_unified_lot_concurrency_real_pg.mjs");
  assert.ok(fixture>=0 && browser>fixture && race>browser);
  assert.match(workflow,/V91 concurrent LOT checkout and return acceptance/);
  assert.match(workflow,/postgres:16/);
});
