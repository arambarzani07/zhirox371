import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const qa=read("qa.html");
const home=read("index.html");
const fixture=read("tests/integration/fixture.sql");
const runner=read("tests/integration/concurrency.test.mjs");
const workflow=read(".github/workflows/pc-foundation.yml");

test("V8 owner-facing QA screen contains scenario list, filters and truthful status",()=>{
 assert.match(qa,/<html lang="ckb" dir="rtl">/);
 assert.match(qa,/id="cases"/);
 assert.match(qa,/data-filter="sale"/);
 assert.match(qa,/data-filter="shift"/);
 assert.match(qa,/data-filter="auth"/);
 assert.doesNotMatch(qa,/class="tag">تاقیگەی جیاواز/);
 assert.match(qa,/id="case-description"/);
 assert.match(qa,/id="case-expected"/);
 assert.match(qa,/actions\/workflows\/pc-foundation\.yml/);
 assert.doesNotMatch(qa,/sb_secret_|retail_checkout_cash\(/);
});
test("locked Home routes to QA only through its existing audit subcard",()=>{
 assert.match(home,/state\.open===11&&tab===3/);
 assert.match(home,/\.\/qa\.html/);
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
});
test("CI uses isolated PostgreSQL with no Supabase keys or connection",()=>{
 assert.match(workflow,/postgres-concurrency:/);
 assert.match(workflow,/image: postgres:16/);
 assert.match(workflow,/PGDATABASE: retail_qa/);
 assert.match(workflow,/tests\/integration\/fixture\.sql/);
 assert.match(workflow,/tests\/integration\/concurrency\.test\.mjs/);
 assert.doesNotMatch(workflow,/sb_secret_|service_role|supabase\.co/);
});
test("fixture includes real transactional code paths and required constraints",()=>{
 assert.match(fixture,/CREATE OR REPLACE FUNCTION retail_internal\.checkout_cash/);
 assert.match(fixture,/CREATE OR REPLACE FUNCTION retail_internal\.shift_close/);
 assert.match(fixture,/CREATE OR REPLACE FUNCTION retail_internal\.cash_movement/);
 assert.match(fixture,/unique\(store_id,request_id\)/);
 assert.match(fixture,/where status='open'/);
 assert.match(fixture,/for update/);
});
test("concurrent test suite executes ten isolated scenarios",()=>{
 const count=(runner.match(/^test\("/gm)||[]).length;
 assert.equal(count,10);
 assert.match(runner,/Promise\.all/);
 assert.match(runner,/spawn\("psql"/);
 assert.match(runner,/Cashier permission required/);
 assert.match(runner,/No open cash shift/);
});
