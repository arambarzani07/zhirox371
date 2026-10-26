import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const sql=readFileSync(resolve(root,"tests/v12/least_privilege_revoke.local.sql"),"utf8");
const e2e=readFileSync(resolve(root,"tests/v12/auth_rls_e2e.mjs"),"utf8");
const workflow=readFileSync(resolve(root,".github/workflows/pc-foundation.yml"),"utf8");

test("V13 local repair revokes TRUNCATE only on thirteen explicit retail tables",()=>{
 const names=[...sql.matchAll(/public\.(retail_[a-z_]+)/g)].map(m=>m[1]);
 assert.equal(names.length,13,"Expected 13 explicit RLS-protected retail tables");
 assert.equal(new Set(names).size,13,"No repeated table in scope");
 assert.match(sql,/REVOKE TRUNCATE ON TABLE/);
 assert.match(sql,/FROM anon, authenticated;/);
 assert.doesNotMatch(sql,/ON ALL TABLES IN SCHEMA|\b(CASCADE|DROP|DELETE|ALTER|UPDATE|INSERT|TRUNCATE TABLE)\b/i);
});

test("V13 tests require observed risk, then deny TRUNCATE while allowing regular financial RPCs",()=>{
 assert.match(e2e,/has_table_privilege\('authenticated','public\.retail_customers','TRUNCATE'\)/);
 assert.match(e2e,/least_privilege_revoke\.local\.sql/);
 assert.match(e2e,/has_table_privilege\('anon',c\.oid,'TRUNCATE'\)/);
 assert.match(e2e,/assert\.notEqual\(blocked\.status,0/);
 assert.match(e2e,/retail_checkout_cash/);
 assert.match(e2e,/tenant isolation after REVOKE/);
});

test("V13 security tests use disposable GitHub Supabase, not production deployment",()=>{
 assert.match(workflow,/v12-real-auth-rls:/);
 assert.match(workflow,/supabase start/);
 assert.match(workflow,/supabase stop --no-backup/);
 assert.doesNotMatch(workflow,/supabase\s+(?:link|db push)/);
 assert.doesNotMatch(sql,/qcfmlyyzfykzszvtllrw|vllwundrtrgdqmkqbduy/);
});
