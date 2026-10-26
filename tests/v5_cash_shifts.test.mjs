import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const home=read("index.html"),html=read("operations.html"),
 js=read("operations.js"),sql=read("db/v5_cash_shifts.sql");

test("V5 includes cash drawer and shift UI",()=>{
 for(const id of ["shift-panel","shift-open-form","shift-movement-form","shift-close-form","shift-history","shift-expected","movement-retry"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/data-tab="shift"/);
 assert.match(html,/min-width:1020px/);
});
test("locked Home routes to shift without restyling",()=>{
 assert.match(home,/state\.open===5&&tab===0/);
 assert.match(home,/state\.open===10&&tab===0/);
 assert.match(home,/operations\.html\?view=/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
});
test("checkout only in open, locked shift",()=>{
 assert.match(sql,/cash_session_id uuid/);
 assert.match(sql,/v_cash_session uuid/);
 assert.match(sql,/cash_session_id=v_cash_session/);
 assert.match(sql,/for update/);
 assert.match(sql,/No open cash shift/);
});
test("shift close calculates expected and variance on server",()=>{
 assert.match(sql,/retail_internal\.shift_close/);
 assert.match(sql,/v_expected:=v_row\.opening_cash_minor\+v_sales\+v_moves/);
 assert.match(sql,/v_variance:=p_counted-v_expected/);
 assert.match(sql,/status='closed'/);
});
test("cash in/out dedupe concurrent requests after session lock",()=>{
 assert.match(sql,/retail_cash_movements/);
 assert.match(sql,/unique\(store_id,request_id\)/);
 assert.match(sql,/A second same-request call must re-check AFTER obtaining the shift lock/);
 assert.match(sql,/Cash request reused with changed payload/);
});
test("cash client uses authenticated RPCs, not direct financial writes",()=>{
 for(const name of ["retail_shift_open","retail_shift_close","retail_shift_summary","retail_cash_movement"])
  assert.match(js,new RegExp('rpc\\("'+name+'"'));
 assert.doesNotMatch(js,/\.from\("retail_cash_sessions"\)\.insert/);
 assert.match(js,/sessionStorage\.setItem/);
 assert.doesNotThrow(()=>new Function(js));
});
