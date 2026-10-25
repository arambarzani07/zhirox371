import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const workspace=read("workspace.js");
const v12=read("tests/v12/auth_rls_e2e.mjs");
const workflow=read(".github/workflows/pc-foundation.yml");
test("V12 store creation avoids INSERT RETURNING snapshot RLS rejection",()=>{
 const segment=workspace.slice(workspace.indexOf('$(\"store-form\").addEventListener'),workspace.indexOf('$(\"product-form\").addEventListener'));
 assert.match(segment,/\.insert\(\{owner_user_id:user\.id,name,currency:"IQD"\}\)/);
 assert.doesNotMatch(segment,/\.insert\([^;]*\.select\(/);
 assert.match(segment,/await loadStore\(\)/);
 assert.match(segment,/if\(!store\)throw/);
});
test("local GoTrue JWT and role test cannot call hosted Supabase URL",()=>{
 assert.match(v12, /127\\\.0\\\.0\\\.1\|localhost/);
 assert.match(v12, /SUPABASE_ACCESS_TOKEN/);
 assert.match(v12, /claims\.role,"authenticated"/);
 assert.match(v12, /retail_v12_auth_context/);
 assert.match(v12, /retail_assign_staff/);
 assert.match(v12, /retail_shift_open/);
});
test("V12 environment is isolated and disposed",()=>{
 assert.match(workflow,/v12-real-auth-rls:/);
 assert.match(workflow,/supabase start/);
 assert.match(workflow,/tests\/v12\/rls_mirror\.sql/);
 assert.match(workflow,/supabase stop --no-backup/);
 assert.doesNotMatch(workflow,/supabase (?:link|db push|migration up|db reset --linked)/);
});
