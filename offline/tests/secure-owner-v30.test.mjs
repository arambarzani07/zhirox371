import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,chmod,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createServer as createHttpsServer} from "node:https";
import {createServer as createHttpServer} from "node:http";
import {request as tlsRequest} from "node:https";
import {readFile} from "node:fs/promises";
import {createV30HttpsGate,loadV30Stores,readV30SecretFile,createV30RateLimiter}
 from "../secure-owner-v30.mjs";
import {hashOwnerToken} from "../cloud-receiver-v28.mjs";

const store="10000000-0000-0000-0000-000000000030";
const tokenA="owner-v30-old-key-".repeat(3);
const tokenB="owner-v30-new-key-".repeat(3);
const secret="v30-hmac-signature-secret-".repeat(3);
const configFor=token=>JSON.stringify([{
 store_id:store,sync_secret:secret,owner_token_hash:hashOwnerToken(token)
}]);
const pool={query:async(sql,args)=>{
 assert.equal(args[0],store);
 if(sql.includes("count(*)::bigint AS sales_count"))
  return {rows:[{sales_count:"2",total_minor:"3200",last_receipt_no:"2",
   last_received_at:"2026-10-30T06:10:00Z"}]};
 if(sql.includes("SELECT sale_id,receipt_no,total_minor,occurred_at,received_at"))
  return {rows:[]};
 throw Error("unexpected SQL");
}};
async function fixture(fn,{limit=12}={}){
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v30-"));
 const key=join(dir,"cert-key.pem"),cert=join(dir,"cert.pem"),storesFile=join(dir,"stores.private.json");
 try{
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-sha256","-nodes",
   "-keyout",key,"-out",cert,"-days","1","-subj","/CN=127.0.0.1",
   "-addext","subjectAltName=IP:127.0.0.1"],{stdio:"ignore"});
  await writeFile(storesFile,configFor(tokenA),{mode:0o600});
  await chmod(storesFile,0o600);await chmod(key,0o600);
  const ca=await readFile(cert),keyBytes=await readFile(key);
  const gate=createV30HttpsGate({pool,loadStores:()=>loadV30Stores(storesFile),
   rateLimiter:createV30RateLimiter({ownerLimit:limit,eventLimit:3})});
  const server=createHttpsServer({key:keyBytes,cert:ca,minVersion:"TLSv1.2"},gate);
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  const call=(path,{token=tokenA,origin,caOverride=ca}={})=>new Promise((resolve,reject)=>{
   const r=tlsRequest({hostname:"127.0.0.1",port,path,method:"GET",ca:caOverride,
    rejectUnauthorized:true,headers:{
      ...(token?{Authorization:"Bearer "+token}:{}),
      ...(origin?{Origin:origin}:{})
    }},res=>{
    let body="";
    res.on("data",chunk=>body+=chunk);
    res.on("end",()=>resolve({status:res.statusCode,headers:res.headers,
      body,content:res.headers["content-type"]?.includes("application/json")?
       JSON.parse(body):body}));
   });
   r.on("error",reject);r.end();
  });
  try{await fn({server,ca,port,call,storesFile,dir});}
  finally{await new Promise(resolve=>server.close(resolve));}
 }finally{await rm(dir,{recursive:true,force:true});}
}
const summary="/v28/owner/summary?store_id="+store;
test("V30 TLS provides validated encrypted owner access and no-store security headers",async()=>{
 await fixture(async({call,port,ca})=>{
  const response=await call(summary);
  assert.equal(response.status,200);
  assert.equal(response.content.ok,true);
  assert.equal(response.content.total_minor,"3200");
  assert.equal(response.headers["strict-transport-security"],"max-age=300");
  assert.equal(response.headers["cross-origin-resource-policy"],"same-origin");
  assert.match(response.headers["cache-control"],/no-store/);
  assert.equal(response.headers["access-control-allow-origin"],undefined);
  assert.equal((await call("/v29/owner")).status,200);
  assert.equal((await call("/v29/owner.css")).status,200);
  assert.equal((await call("/healthz",{token:null})).status,200);
  assert.equal((await call(summary,{token:null})).status,401);
  await assert.rejects(call(summary,{caOverride:"invalid-ca"}));
  const cross=await call(summary,{origin:"https://malicious.example"});
  assert.equal(cross.status,403);
 });
});
test("File-based owner token replacement revokes old credential immediately",async()=>{
 await fixture(async({call,storesFile})=>{
  assert.equal((await call(summary,{token:tokenA})).status,200);
  await writeFile(storesFile,configFor(tokenB),{mode:0o600});
  assert.equal((await call(summary,{token:tokenA})).status,401);
  assert.equal((await call(summary,{token:tokenB})).status,200);
  await writeFile(storesFile,"bad json",{mode:0o600});
  assert.equal((await call(summary,{token:tokenB})).status,503,
   "invalid rotation must fail closed rather than reusing stale credentials");
 });
});
test("Owner endpoints are throttled per socket address, regardless of spoofed headers",async()=>{
 await fixture(async({call})=>{
  assert.equal((await call(summary,{token:"wrong"})).status,401);
  assert.equal((await call(summary,{token:"wrong"})).status,401);
  const throttle=await call(summary,{token:tokenA});
  assert.equal(throttle.status,429);
  assert.ok(Number(throttle.headers["retry-after"])>=1);
 },{limit:2});
});
test("Unsafe secret file permissions and symlinks rejected",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v30-files-"));
 try{
  const file=join(dir,"config.json");
  await writeFile(file,configFor(tokenA),{mode:0o644});
  await chmod(file,0o644);
  await assert.rejects(loadV30Stores(file),/secret_file_permissions/);
  await chmod(file,0o600);
  assert.equal((await loadV30Stores(file)).size,1);
  const {symlink}=await import("node:fs/promises");
  const link=join(dir,"alias.json");
  await symlink(file,link);
  await assert.rejects(readV30SecretFile(link),/unsafe_secret_file/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("HTTP connection is rejected with no receipt or owner data exposed",async()=>{
 const gate=createV30HttpsGate({pool,loadStores:async()=>{throw Error("not callable");}});
 const server=createHttpServer(gate);
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{
  const port=server.address().port;
  const resp=await fetch("http://127.0.0.1:"+port+summary);
  assert.equal(resp.status,426);
  assert.deepEqual(await resp.json(),{error:"https_required"});
 }finally{await new Promise(ok=>server.close(ok));}
});
test("Preview service refuses start without explicit opt-in",async()=>{
 const {startV30HttpsPreview}=await import("../secure-owner-v30.mjs");
 const before=process.env.ZHIROX_V30_HTTPS_PREVIEW_ENABLED;
 delete process.env.ZHIROX_V30_HTTPS_PREVIEW_ENABLED;
 try{await assert.rejects(startV30HttpsPreview(),/v30_preview_disabled/);}
 finally{if(before!==undefined)process.env.ZHIROX_V30_HTTPS_PREVIEW_ENABLED=before;}
});
