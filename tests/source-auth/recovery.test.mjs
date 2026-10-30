import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('forgot-password button exists in both original login pages, but not Home',()=>{
 for(const page of ['workspace.html','operations.html']){
  const text=source(page);
  assert.match(text,/src="\.\/auth-recovery\.js" defer/);
  assert.match(text,/id="login-form"/);
  assert.equal((text.match(/src="\.\/auth-recovery\.js"/g)||[]).length,1);
 }
 assert.doesNotMatch(source('index.html'),/auth-recovery\.js|reset-password\.html/);
});
test('recovery uses public Supabase API and same-origin callback only',()=>{
 const js=source('auth-recovery.js'), html=source('reset-password.html');
 assert.match(js,/\.auth\.resetPasswordForEmail\(email, \{ redirectTo \}\)/);
 assert.match(js,/new URL\('\.\/reset-password\.html', location\.href\)/);
 assert.match(html,/\.auth\.updateUser\(\{password:pass\}\)/);
 assert.match(html,/type=recovery/);
 assert.match(html,/history\.replaceState/);
 assert.match(html,/minlength="12"/);
 for(const text of [js,html]){
  assert.doesNotMatch(text,/service_role|sb_secret_|auth\.admin\.|createUser\(|signUp\(/);
 }
});
test('recovery does not touch store, money or stock',()=>{
 const js=source('auth-recovery.js'),html=source('reset-password.html');
 for(const text of [js,html]){
  assert.doesNotMatch(text,/retail_products|retail_sales|retail_stores|checkout|cash_shifts|stock_base_units/);
 }
});
