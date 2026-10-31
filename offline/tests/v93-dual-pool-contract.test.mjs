import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync("offline/migrations/038_v93_dual_pool_readonly_api.sql","utf8");
const api=readFileSync("offline/local-test-market-v93.mjs","utf8");
const integration=readFileSync("offline/tests/v93_dual_pool_api_real_pg.mjs","utf8");
const workflow=readFileSync(".github/workflows/v81-test-market-pc.yml","utf8");

test("V93 inherits ONLY V92 views, never grants privileged login or financial writes",()=>{
 for(const word of [
  "current_database()<>'zhirox_v80_disposable'",
  "current_user<>'v80test'",
  "مارکێتی تاقیکردنەوە",
  "NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS",
  "GRANT zhirox_v92_viewer TO zhirox_v93_api_reader",
  "WITH INHERIT TRUE, SET FALSE, ADMIN FALSE",
  "REVOKE EXECUTE ON ALL FUNCTIONS",
 ])assert.ok(sql.includes(word),word);
 assert.doesNotMatch(sql,/GRANT\s+(?:INSERT|UPDATE|DELETE|EXECUTE|ALL)\s+ON\s+(?:TABLE|FUNCTION|ALL)/i);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+(?:TABLE|SCHEMA|DATABASE)/i);
});
test("V93 HTTP does not expose finance POST; auth and readonly SQL use separate roles",()=>{
 for(const word of [
  "createLocalAuthV3",
  "createV93TestMarketHandler",
  "if(authPool===readPool)",
  "const auth=createLocalAuthV3({pool:authPool,secret,clock})",
  "await validateAuthDatabase(authPool)",
  "await validateReadDatabase(readPool)",
  "const result=await readPool.query(sql)",
  'const ROUTES=new Set(["login","stock","lots","receipts"])',
  'route==="login"?"POST":"GET"',
  'ZHIROX_V93_READONLY_API!=="YES_ISOLATED_V93_DUAL_POOL"',
  'server.listen(3312,"127.0.0.1",resolve)',
 ])assert.ok(api.includes(word),word);
 assert.doesNotMatch(api,/\b(?:INSERT INTO|UPDATE zhirox_local|DELETE FROM zhirox_local|checkout_unified_fefo_v90\s*\()/);
 assert.doesNotMatch(api,/GRANT|ALTER ROLE/);
 assert.match(api,/\!\["owner","manager"\]\.includes\(principal\.role\)/);
});
test("V93 CI authenticates both sessions using separate real PostgreSQL logins and no stored production password",()=>{
 for(const word of [
  'new pg.Pool({...pgOpts,user:"v80test"',
  "new pg.Pool({...pgOpts,user:role,password:secret",
  'randomBytes(32)',
  "ALTER ROLE ${role} LOGIN PASSWORD",
  "ALTER ROLE ${role} NOLOGIN PASSWORD NULL",
  "await forbiddenReadWrite",
  "await send(origin,\"/api/local/v93/login\"",
  "await businessState()",
 ])assert.ok(integration.includes(word),word);
 const v92=workflow.indexOf("node offline/tests/v92_real_pg_viewer_boundary.mjs");
 const migration=workflow.indexOf("offline/migrations/038_v93_dual_pool_readonly_api.sql",v92);
 const check=workflow.indexOf("node offline/tests/v93_dual_pool_api_real_pg.mjs",migration);
 const dump=workflow.indexOf("pg_dump -Fc --schema=zhirox_local",check);
 assert.ok(v92>0&&migration>v92&&check>migration&&dump>check);
});
