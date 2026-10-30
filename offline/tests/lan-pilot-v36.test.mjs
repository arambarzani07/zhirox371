import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:http";
import {packageV36Pilot} from "../../scripts/package-lan-pilot-v36.mjs";
import {createV36StaticHandler} from "../lan-pilot-static-v36.mjs";
import {createV33LanHandler} from "../lan-gateway-v33.mjs";

async function fixture(fn,marker=true){
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v36-pilot-"));
 await mkdir(join(dir,"assets"));
 await writeFile(join(dir,"index.html"),`<!doctype html><script type="module" src="/assets/main.js"></script>`);
 await writeFile(join(dir,"assets","main.js"),marker?
   'document.body.dataset.localPilot="data-local-v36-pilot";':'document.body.innerText="ordinary demo";');
 await writeFile(join(dir,"assets","style.css"),"body{direction:rtl}");
 try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}
}
async function serve(handler,callback){
 const s=createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  handler(req,res,url);
 });
 await new Promise(ok=>s.listen(0,"127.0.0.1",ok));
 try{await callback("http://127.0.0.1:"+s.address().port);}
 finally{await new Promise(ok=>s.close(ok));}
}
test("only a fully hashed isolated-pilot bundle may be mounted",async()=>{
 await fixture(async dir=>{
  const manifest=await packageV36Pilot(dir);
  assert.equal(manifest.format,"zhirox-v36-isolated-pilot-v1");
  const handler=await createV36StaticHandler(dir);
  await serve(handler,async base=>{
   const root=await fetch(base+"/");
   assert.equal(root.status,200);
   assert.match(root.headers.get("content-security-policy"),/connect-src 'self'/);
   assert.match(await root.text(),/assets\/main.js/);
   assert.equal((await fetch(base+"/assets/main.js")).status,200);
   assert.equal((await fetch(base+"/assets/style.css")).status,200);
   for(const path of ["/.env","/src/main.tsx","/offline/lan-gateway-v33.mjs",
    "/assets/private.map","/api/local/v3/login"]){
    assert.equal((await fetch(base+path)).status,404,path);
   }
   assert.equal((await fetch(base+"/assets/main.js?cb=1")).status,400);
   assert.equal((await fetch(base+"/",{method:"POST"})).status,405);
  });
  await writeFile(join(dir,"assets","main.js"),"tampered javascript");
  await assert.rejects(createV36StaticHandler(dir),/asset_digest_mismatch/);
 });
 await fixture(async dir=>{
  await assert.rejects(packageV36Pilot(dir),/not_an_isolated_v36_pilot_build/);
 },false);
});
test("V33 remains fail-closed without TLS even if valid static handler is provided",async()=>{
 await fixture(async dir=>{
  await packageV36Pilot(dir);
  const staticHandler=await createV36StaticHandler(dir);
  const gate=createV33LanHandler({
   pool:{query:async()=>({rows:[]}),connect:async()=>{throw Error("no db");}},
   secret:"v36-test-only-strong-secret".repeat(2),peers:new Set(["127.0.0.1"]),
   staticHandler
  });
  const s=createServer(gate);
  await new Promise(ok=>s.listen(0,"127.0.0.1",ok));
  try{
   const response=await fetch("http://127.0.0.1:"+s.address().port+"/");
   assert.equal(response.status,426);
   assert.equal((await response.json()).error,"https_required");
  }finally{await new Promise(ok=>s.close(ok));}
 });
});
