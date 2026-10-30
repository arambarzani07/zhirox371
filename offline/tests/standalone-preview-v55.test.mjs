import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {listenV55Preview} from "../standalone-preview-v55.mjs";

const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
async function fixture(fn){
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v55-preview-"));
 try{
   await mkdir(join(dir,"assets"));
   const files={
     "/index.html":Buffer.from("<!DOCTYPE html><html><head><meta charset='utf-8'><script type='module' src='/assets/pilot.js'></script><link rel='stylesheet' href='/assets/pilot.css'></head><body><div id='root'></div></body></html>"),
     "/assets/pilot.js":Buffer.from("const app='data-local-v36-pilot';document.querySelector('#root').textContent='سوپەرمارکێتی کانی چنار';"),
     "/assets/pilot.css":Buffer.from("body { direction: rtl; }")
   };
   for(const [name,bytes] of Object.entries(files)){
     await writeFile(join(dir,name.slice(1)),bytes);
   }
   await writeFile(join(dir,"pilot-manifest-v36.json"),JSON.stringify({
     format:"zhirox-v36-isolated-pilot-v1",files:Object.fromEntries(Object.entries(files)
       .map(([name,bytes])=>[name,hash(bytes)]))
   }));
   await fn(dir);
 }finally{await rm(dir,{recursive:true,force:true});}
}
async function request(port,path="/",method="GET",extra={}){
 return fetch("http://127.0.0.1:"+port+path,{method,redirect:"manual",...extra});
}
test("V55 startup directly exposes a real original Sorani app entrypoint and safe health marker",async()=>{
 await fixture(async directory=>{
   const server=await listenV55Preview({directory,port:0});
   const port=server.address().port;
   try{
     const page=await request(port);
     assert.equal(page.status,200);
     const html=await page.text();
     assert.match(html,/id="root"/);
     assert.match(html,/ZHIROX371 — تەنها پێشبینینی ئۆفلاینە/);
     assert.match(html,/SALES DISABLED/);
     assert.ok(page.headers.get("content-security-policy").includes("connect-src 'none'"));
     const js=await request(port,"/assets/pilot.js");
     assert.equal(js.status,200);
     assert.match(await js.text(),/data-local-v36-pilot/);
     const health=await request(port,"/__zhirox_preview_health");
     const data=await health.json();
     assert.deepEqual(data,{app:"ZHIROX371",mode:"OFFLINE_PREVIEW_ONLY",
       live_sales:false,cloud_sync:false,local_db:false});
   }finally{await new Promise(ok=>server.close(ok));}
 });
});
test("V55 FAIL-CLOSED: cannot post sales or reach DB/auth routes, even on same host",async()=>{
 await fixture(async directory=>{
   const server=await listenV55Preview({directory,port:0});
   const port=server.address().port;
   try{
     for(const method of ["POST","PUT","DELETE","PATCH"]){
       const res=await request(port,"/api/local/checkout",method);
       assert.equal(res.status,405);
     }
     for(const path of ["/api/local/checkout","/api/local/products","/auth/login"]){
       assert.equal((await request(port,path)).status,403);
     }
     assert.equal((await request(port,"/etc/passwd")).status,404);
     assert.equal((await request(port,"/?token=secret")).status,400);
     const wrongHost=await fetch("http://127.0.0.1:"+port+"/",{
       headers:{Host:"evil.example.com"},redirect:"manual"
     });
     assert.equal(wrongHost.status,403);
   }finally{await new Promise(ok=>server.close(ok));}
 });
});
test("V55 refuses altered JS and never serves a fake unverified bundle",async()=>{
 await fixture(async directory=>{
   await writeFile(join(directory,"assets","pilot.js"),"console.log('altered')");
   await assert.rejects(listenV55Preview({directory,port:0}));
 });
});
test("V55 never exposes public host or production mode",async()=>{
 await fixture(async directory=>{
   const server=await listenV55Preview({directory,port:0});
   try{assert.equal(server.address().address,"127.0.0.1");}
   finally{await new Promise(ok=>server.close(ok));}
 });
});
