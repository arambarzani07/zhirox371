import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync("offline/migrations/039_v94_restricted_auth_role.sql","utf8");
const api=readFileSync("offline/local-test-market-v94.mjs","utf8");
const reused=readFileSync("offline/local-test-market-v93.mjs","utf8");
const integration=readFileSync("offline/tests/v94_restricted_auth_real_pg.mjs","utf8");
const ci=readFileSync(".github/workflows/v81-test-market-pc.yml","utf8");

test("V94 restricted auth role has only test-store SELECT and two account-counter UPDATE grants",()=>{
 for(const required of [
  "current_database()<>'zhirox_v80_disposable'","current_user<>'v80test'",
  "مارکێتی تاقیکردنەوە",
  "CREATE ROLE zhirox_v94_auth",
  "NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
  "GRANT SELECT (id,name) ON TABLE zhirox_local.stores",
  "GRANT SELECT (store_id,id,username,password_hash,role,enabled",
  "GRANT UPDATE (failed_attempts,locked_until)",
  "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zhirox_local",
 ])assert.ok(sql.includes(required),required);
 assert.doesNotMatch(sql,/GRANT\s+(?:INSERT|DELETE|TRUNCATE|ALL|EXECUTE)\s+ON\b/i);
 assert.doesNotMatch(sql,/GRANT UPDATE\s+ON TABLE/i);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+(?:TABLE|DATABASE|SCHEMA)/i);
});
test("V94 HTTP is restricted localhost-only with separate nonowner auth/viewer login",()=>{
 for(const needle of [
  "assertV94AuthPrivilegeBoundary",
  'const AUTH_ROLE="zhirox_v94_auth"',
  'const READ_ROLE="zhirox_v93_api_reader"',
  'ZHIROX_V94_READONLY_API!=="YES_ISOLATED_V94_AUTH_ROLE"',
  "V94_auth_privilege_boundary_refused",
  "has_column_privilege(current_user,'zhirox_local.local_users','failed_attempts','UPDATE')",
  "has_table_privilege(current_user,'zhirox_local.products','UPDATE')",
  'server.listen(3313,"127.0.0.1",resolve)',
  'routePrefix:"/api/local/v94/"',
 ])assert.ok(api.includes(needle),needle);
 assert.ok(reused.includes('expectedAuthRole="v80test"'));
 assert.ok(reused.includes('routePrefix="/api/local/v93/"'));
 assert.ok(reused.includes('(expectedAuthRole==="zhirox_v94_auth" && routePrefix==="/api/local/v94/")'));
 assert.ok(reused.includes("await validateAuthDatabase(authPool,expectedAuthRole)"));
 assert.doesNotMatch(api,/\b(?:INSERT INTO|UPDATE zhirox_local|DELETE FROM zhirox_local)\b/);
});
test("V94 real tests verify denied financial writes and counter updates before test backup",()=>{
 for(const token of [
  'PGDATABASE:"zhirox_v80_disposable"',
  'randomBytes(32)',
  "failed_attempts",
  "UPDATE zhirox_local.local_users SET role='owner'",
  "UPDATE zhirox_local.products SET stock_base_units=999",
  "SELECT * FROM zhirox_local.checkout_unified_fefo_v90",
  "ALTER ROLE ${role} NOLOGIN PASSWORD NULL",
  "assert.deepEqual(await queryState(),before",
  '"/api/local/v94/receipts"',
 ])assert.ok(integration.includes(token),token);
 const v93=ci.indexOf("node offline/tests/v93_dual_pool_api_real_pg.mjs");
 const migration=ci.indexOf("offline/migrations/039_v94_restricted_auth_role.sql",v93);
 const testRun=ci.indexOf("node offline/tests/v94_restricted_auth_real_pg.mjs",migration);
 const dump=ci.indexOf("pg_dump -Fc --schema=zhirox_local",testRun);
 assert.ok(v93>0&&migration>v93&&testRun>migration&&dump>testRun);
});
