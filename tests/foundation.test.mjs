import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>readFileSync(resolve(root,file),"utf8");
const home=read("index.html");
const workspace=read("workspace.html");
const logic=read("workspace.js");
const config=read("config.js");

test("approved desktop Home retains 3 x 4 module grid",()=>{
  assert.match(home,/\.row\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
  assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
  assert.equal((home.match(/^\["[^"\n]+","#[a-fA-F0-9]{6}"/gm)||[]).length,12);
  assert.match(home,/if\(Math\.floor\(state\.open\/4\)===r/);
});
test("design-first Home has no demo banner and retains RTL",()=>{
  assert.match(home,/<html lang="ckb" dir="rtl">/);
  assert.doesNotMatch(home,/DESIGN PREVIEW|INTERACTIVE PROTOTYPE|نمایشی دیزاین/i);
});
test("internal Products navigation is available",()=>{
  assert.match(home,/workspace\.html\?view=/);
  assert.match(workspace,/id="product-form"/);
  assert.match(workspace,/id="store-form"/);
  assert.match(workspace,/id="login-form"/);
  assert.match(workspace,/@supabase\/supabase-js@2\.118\.0/);
});
test("real Products calls require Supabase authentication and use atomic RPC",()=>{
  assert.match(logic,/auth\.getUser\(/);
  assert.match(logic,/auth\.signInWithPassword/);
  assert.match(logic,/\.rpc\("retail_create_product"/);
  assert.match(logic,/\.from\("retail_stores"\)/);
  assert.match(logic,/\.from\("retail_products"\)/);
});
test("public client config contains no service-role/secret key",()=>{
  assert.match(config,/sb_publishable_/);
  assert.doesNotMatch(config,/sb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(config,/eyJ[A-Za-z0-9_.-]+/);
});
