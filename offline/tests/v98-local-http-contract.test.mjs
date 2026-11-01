import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const server=readFileSync("offline/local-checkout-http-v98.mjs","utf8");
const integration=readFileSync("offline/tests/v98_http_atomic_real_pg.mjs","utf8");
const workflow=readFileSync(".github/workflows/v81-test-market-pc.yml","utf8");

test("V98 HTTP is isolated loopback only with exact route and strong session",()=>{
 for(const needle of [
  "ZHIROX_V98_TEST_HTTP",
  "YES_ISOLATED_V98_CHECKOUT_TEST_ONLY",
  'server.listen(3315,"127.0.0.1",resolve)',
  "createV97TestCheckoutAdapter",
  "assertV94AuthPrivilegeBoundary",
  "assertV98GatePrivileges",
  'has_table_privilege(current_user,\'zhirox_local.sales\',\'INSERT\')',
  'has_function_privilege(current_user,',
  'req.socket.remoteAddress',
  'req.headers.host',
  'if(req.method!=="POST")',
  'if(url.search)',
  'if(length>8192)',
  'Object.keys(body).some(k=>!["request_id","lines"].includes(k))',
  'result.replayed?200:201',
  'return respond(res,503,{error:"isolated_test_database_unavailable"})'
 ])assert.ok(server.includes(needle),needle);
 assert.doesNotMatch(server,/Access-Control-Allow-Origin/);
 assert.doesNotMatch(server,/UPDATE zhirox_local.products|INSERT INTO zhirox_local.sales/);
 assert.doesNotMatch(server,/server\.listen\([^\n]*"0\.0\.0\.0"/);
});
test("V98 genuine HTTP PostgreSQL acceptance checks retry after dropped response",()=>{
 for(const needle of [
  'assert.equal(before.sales,8)',
  'post(base,"login"',
  'Promise.all([',
  'dropNext=true',
  'res.destroy()',
  'await destroyed',
  'request(3)',
  'idempotent_replay',
  'assert.equal(after.sales,before.sales+3)',
  'assert.equal(after.outbox,before.outbox+3)',
  'assert.equal(Number(after.water),Number(before.water)-3)',
  'ALTER ROLE ${role} NOLOGIN PASSWORD NULL'
 ])assert.ok(integration.includes(needle),needle);
 const v97=workflow.indexOf("node offline/tests/v97_atomic_checkout_real_pg.mjs");
 const v98=workflow.indexOf("node offline/tests/v98_http_atomic_real_pg.mjs",v97);
 const dump=workflow.indexOf("pg_dump -Fc --schema=zhirox_local",v98);
 assert.ok(v97>0&&v98>v97&&dump>v98);
});
