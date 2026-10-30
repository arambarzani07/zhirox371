import test from "node:test";
import assert from "node:assert/strict";
import {PUBLIC_ORIGIN,routes,inspectRoute,auditPublicPreview} from "./hosted-preview-preflight-v47.mjs";

function sample(path){
 if(path==="/")return '<h1>سوپەرمارکێتی کانی چنار</h1><script src="card-icons.js"></script><link href="ui-fixed-pc.css"><script>const specs=[</script>';
 if(path==="/operations.html"||path==="/workspace.html")
  return '<form id="login-form"></form><script src="auth-recovery.js"></script>';
 if(path==="/reset-password.html")return '<form id="password-form"></form>';
 if(path==="/ui-fixed-pc.css")return '.desktop {min-width: 1020px;}';
 if(path==="/card-icons.js")return 'const cash_register="cash-register"; window.RetailCardIcons={}';
 if(path==="/config.js")return 'window.RETAIL_CONFIG={supabaseUrl:"https://qcfmlyyzfykzszvtllrw.supabase.co",publishableKey:"sb_publishable_test"}';
 throw new Error("unexpected test route");
}
function mockedFetch(overrides={}){
 return async (url,init)=>{
  assert.equal(init.redirect,"manual");
  assert.equal(init.credentials,"omit");
  const path=new URL(url).pathname;
  const item=overrides[path]||{};
  return {status:item.status??200,
    headers:{get(name){return name==="location"?(item.location||null):null;}},
    text:async()=>item.body??sample(path)};
 };
}
test("V47 verifies every original public source page without a login, writes or secrets",async()=>{
 const r=await auditPublicPreview({request:mockedFetch()});
 assert.equal(r.online_preview,"PASS");
 assert.equal(r.release_status,"NO_GO");
 assert.equal(r.checks.length,routes.length);
 assert.ok(r.checks.every(x=>x.reason==="source_verified"));
 assert.ok(r.not_verified.includes("isolated LAN PostgreSQL cash checkout"));
 assert.equal(r.checked_origin,PUBLIC_ORIGIN);
 assert.ok(!JSON.stringify(r).includes("sb_publishable_test"));
});
test("V47 fails a 200 OK that actually serves a mismatched React demo",()=>{
 const result=inspectRoute("/",200,'<div id="root"></div><script src="/assets/index-abc.js"></script>');
 assert.equal(result.reason,"source_mismatch");
});
test("V47 refuses redirects including stale localhost and Vercel auth",async()=>{
 let r=await auditPublicPreview({request:mockedFetch({"/operations.html":{status:302,location:"http://localhost:3000"}})});
 assert.equal(r.online_preview,"FAIL");
 assert.equal(r.release_status,"NO_GO");
 assert.equal(r.checks.find(x=>x.path==="/operations.html").reason,"redirect_not_allowed");
});
test("V47 refuses a publishable config that accidentally includes a secret",async()=>{
 const r=await auditPublicPreview({request:mockedFetch({"/config.js":{body:sample("/config.js")+"; let a='sb_secret_BAD';"}})});
 assert.equal(r.online_preview,"FAIL");
 assert.equal(r.checks.find(x=>x.path==="/config.js").reason,"forbidden_secret_material");
});
test("V47 detects an inaccessible source route and never promotes it",async()=>{
 const r=await auditPublicPreview({request:mockedFetch({"/reset-password.html":{status:404}})});
 assert.equal(r.online_preview,"FAIL");
 assert.equal(r.release_status,"NO_GO");
});
test("V47 refuses arbitrary origins and private internal addresses before HTTP",async()=>{
 for(const origin of ["http://localhost:3000/","http://127.0.0.1:3301/","https://example.com/"]){
  await assert.rejects(auditPublicPreview({origin,request:()=>{throw Error("should not call")}}));
 }
});
