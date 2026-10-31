import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync("offline/migrations/037_v92_isolated_viewer_privilege_boundary.sql","utf8");
const lab=readFileSync("offline/tests/v92_real_pg_viewer_boundary.mjs","utf8");
const workflow=readFileSync(".github/workflows/v81-test-market-pc.yml","utf8");

test("V92 cannot migrate a real database and default viewer has no access beyond fixed-store read views",()=>{
 for(const required of [
  "current_database()<>'zhirox_v80_disposable'",
  "current_user<>'v80test'",
  "مارکێتی تاقیکردنەوە",
  "CREATE ROLE zhirox_v92_viewer",
  "NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
  "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zhirox_local FROM PUBLIC",
  "ALTER DEFAULT PRIVILEGES FOR ROLE v80test REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC",
  "security_barrier=true",
  "v92_stock_readonly",
  "v92_lots_readonly",
  "v92_receipts_readonly",
  "GRANT SELECT ON zhirox_local.v92_stock_readonly",
 ])assert.ok(sql.includes(required),required);
 assert.match(sql,/WHERE p\.store_id='88000000-0000-4000-8000-000000000080'::uuid/);
 assert.match(sql,/WHERE store_id='88000000-0000-4000-8000-000000000080'::uuid/g);
 assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE|EXECUTE|ALL)\b[^;]+TO zhirox_v92_viewer/i);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+(?:TABLE|DATABASE|SCHEMA)\b/i);
});

test("V92 real independent restricted login is short-lived, attacks are denied and test ledger remains unchanged",()=>{
 for(const required of [
  "PGDATABASE:\"zhirox_v80_disposable\"",
  "ZHIROX_V81_TEST_MARKET:\"YES_LOCAL_TEST_READ_ONLY\"",
  "randomBytes(32)",
  "new pg.Client",
  "ALTER ROLE ${role} LOGIN PASSWORD",
  "ALTER ROLE ${role} NOLOGIN PASSWORD NULL",
  "SET ROLE v80test",
  "SET SESSION AUTHORIZATION v80test",
  "checkout_unified_fefo_v90",
  "set_config('zhirox.v88_fefo_route','test_v90_authorized',true)",
  "ROLLBACK TO SAVEPOINT guarded",
  "assert.deepEqual(await snapshot(),before",
 ]) assert.ok(lab.includes(required),required);
 assert.doesNotMatch(lab,/\b(?:DROP|TRUNCATE|DELETE FROM zhirox_local\.stores)\b/i);
});

test("V92 CI migration happens after V91 transaction race, tests independent session then makes backup",()=>{
 const v91=workflow.indexOf("node offline/tests/v91_unified_lot_concurrency_real_pg.mjs");
 const migration=workflow.indexOf("offline/migrations/037_v92_isolated_viewer_privilege_boundary.sql",v91);
 const v92=workflow.indexOf("node offline/tests/v92_real_pg_viewer_boundary.mjs",migration);
 const archive=workflow.indexOf("pg_dump -Fc --schema=zhirox_local",v92);
 assert.ok(v91>0 && migration>v91 && v92>migration && archive>v92);
});
