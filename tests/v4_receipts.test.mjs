import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(resolve(root,file),"utf8");
const html=read("operations.html");
const js=read("operations.js");
const home=read("index.html");
const sql=read("db/v4_receipt_migration.sql");

test("V4 has receipt history and detail components",()=>{
 assert.match(html,/data-tab="receipts"/);
 assert.match(html,/id="receipts-panel"/);
 assert.match(html,/id="receipts-list"/);
 assert.match(html,/id="receipt-detail"/);
 assert.match(js,/\.from\("retail_sales"\)/);
 assert.match(js,/\.from\("retail_sale_items"\)/);
});
test("per-store receipt number is unique and incremented inside transaction",()=>{
 assert.match(sql,/create unique index retail_sales_receipt_unique/i);
 assert.match(sql,/create table public\.retail_receipt_counters/i);
 assert.match(sql,/last_no=public\.retail_receipt_counters\.last_no\+1/i);
 assert.match(sql,/receipt_no=v_receipt_number/i);
});
test("same request with changed actor or payload is rejected",()=>{
 assert.match(sql,/request_payload jsonb/i);
 assert.match(sql,/v_previous_payload is distinct from v_request_payload/);
 assert.match(sql,/v_previous_actor is distinct from v_actor/);
 assert.match(sql,/checkout request reused with different actor or payload/i);
});
test("pending checkout reuses same request and only clears on confirmation",()=>{
 assert.match(js,/pendingCheckout/);
 assert.match(js,/sessionStorage\.setItem/);
 assert.match(js,/sessionStorage\.getItem/);
 assert.match(js,/\.rpc\("retail_checkout_cash"/);
 assert.match(js,/p_request:pendingCheckout\.id/);
 assert.match(js,/p_items:pendingCheckout\.items/);
 assert.match(html,/id="retry-checkout"/);
});
test("Home design still has 12 fixed PC cards and routes receipts",()=>{
 assert.match(home,/min-width:1020px/);
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
 assert.match(home,/operations\.html\?view=/);
 assert.match(home,/tab===1\?"receipts":"cash"/);
});
test("scripts parse and no service role key is embedded",()=>{
 assert.doesNotThrow(()=>new Function(js));
 const script=home.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(script);
 assert.doesNotThrow(()=>new Function(script[1]));
 assert.doesNotMatch(js,/sb_secret_[A-Za-z0-9]+/);
});
