import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createServer as createHttpsServer,request as httpsRequest} from "node:https";
import {createV50LabHttpsHandler,checkV50HttpsLabConfig} from "../staging-https-v50.mjs";
import {hashOwnerToken,parseV28Stores} from "../cloud-receiver-v28.mjs";
import {signEvent} from "../sync-wire-v27.mjs";

const store="10000000-0000-0000-0000-000000000050";
const sale="20000000-0000-0000-0000-000000000050";
const event="40000000-0000-0000-0000-000000000050";
const secret="v50_strong_hmac_".repeat(4),owner="v50_owner_token_".repeat(4);
const stores=parseV28Stores([{store_id:store,sync_secret:secret,owner_token_hash:hashOwnerToken(owner)}]);
function cloud(){
 const records=new Map();
 return {records,query:async(sql,args)=>{
   if(sql.startsWith("INSERT INTO zhirox_cloud_v28.received_sales")){
     const [sid,eid,saleId,receipt,total,hash,occurred]=args;
     if(records.has(eid))return {rows:[]};
     records.set(eid,{store_id:sid,event_id:eid,sale_id:saleId,
       receipt_no:receipt,total_minor:total,event_hash:hash,occurred_at:occurred,
       received_at:new Date().toISOString()});
     return {rows:[{event_id:eid}]};
   }
   if(sql.startsWith("SELECT sale_id,receipt_no,total_minor,event_hash")){
     const row=records.get(args[1]);return {rows:row?[row]:[]};
   }
   if(sql.includes("event_id::text")&&sql.includes("zhirox_cloud_v28.received_sales"))
     return {rows:[...records.values()].map(x=>({event_id:x.event_id}))};
   throw Error("unexpected_db_call");
 }};
}
function requestHttps({port,cert,path,method="POST",payload,signature}){
 return new Promise((resolve,reject)=>{
   const body=payload?JSON.stringify(payload):"";
   const stamp=String(Date.now());
   const req=httpsRequest({hostname:"127.0.0.1",port,path,method,ca:cert,
      rejectUnauthorized:true,servername:"127.0.0.1",
      headers:method==="POST"?{"Content-Type":"application/json",
        "X-ZHIROX-Timestamp":stamp,"X-ZHIROX-Signature":signature||signEvent(body,secret,stamp)}:
        {"Authorization":"Bearer "+owner}},res=>{
     const chunks=[];res.on("data",x=>chunks.push(x));res.on("end",()=>{
       try{resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks).toString())})}
       catch(err){reject(err)}
     });
   });
   req.on("error",reject);if(body)req.write(body);req.end();
 });
}
test("V50 refuses cloud receiver without explicit disposable loopback DB opt-in",()=>{
 const env={
  ZHIROX_V50_HTTPS_LAB_ENABLED:"true",
  ZHIROX_V50_CLOUD_DISPOSABLE_DB_URL:"postgresql://test:test@127.0.0.1:5432/v50_disposable_test",
  ZHIROX_V50_LAB_STORES_JSON:JSON.stringify([{
    store_id:store,sync_secret:secret,owner_token_hash:hashOwnerToken(owner)}]),
  ZHIROX_V50_TLS_CERT_FILE:"/nonexistent-v50-cert",ZHIROX_V50_TLS_KEY_FILE:"/nonexistent-v50-key"
 };
 assert.equal(checkV50HttpsLabConfig(env).stores.size,1);
 for(const bad of [
   {ZHIROX_RELEASE_MODE:"official"},
   {ZHIROX_V50_HTTPS_LAB_ENABLED:"false"},
   {ZHIROX_V50_CLOUD_DISPOSABLE_DB_URL:"postgresql://a:b@prod.supabase.co:5432/disposable_test"},
   {ZHIROX_V50_CLOUD_DISPOSABLE_DB_URL:"postgresql://a:b@127.0.0.1:5432/real_market"},
   {ZHIROX_V50_LAB_STORES_JSON:"[]"},
   {ZHIROX_V50_TLS_KEY_FILE:""}
 ]) assert.throws(()=>checkV50HttpsLabConfig({...env,...bad}));
});
test("V50 signed events travel on real TLS 1.2+ loopback and reject forged signature",async t=>{
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v50-lab-"));
 const certFile=join(dir,"cert.pem"),keyFile=join(dir,"key.pem");
 try{
   execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
     "-sha256","-days","1","-subj","/CN=127.0.0.1",
     "-addext","subjectAltName=IP:127.0.0.1","-keyout",keyFile,"-out",certFile],
     {stdio:"ignore",timeout:10000});
 }catch{
   await rm(dir,{recursive:true,force:true});
   t.skip("OpenSSL not installed in this isolated CI environment");
   return;
 }
 const [cert,key]=await Promise.all([readFile(certFile),readFile(keyFile)]);
 const pool=cloud();
 const server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},
   createV50LabHttpsHandler({pool,stores}));
 try{
   await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
   const port=server.address().port;
   const payload={store_id:store,event_id:event,aggregate_id:sale,event_type:"sale.completed",
     created_at:new Date().toISOString(),
     payload:{sale_id:sale,receipt_no:3,total_minor:12000,
       package_breakdown:[{name:"PRIVATE LAB ITEM",barcode:"2700001004806"}]}};
   const one=await requestHttps({port,cert,path:"/v27/events",payload});
   assert.equal(one.status,200);assert.equal(one.data.event_id,event);
   assert.equal(one.data.duplicate,false);
   assert.equal(pool.records.size,1);
   assert.ok(!JSON.stringify([...pool.records.values()]).includes("PRIVATE LAB ITEM"));
   const retry=await requestHttps({port,cert,path:"/v27/events",payload});
   assert.equal(retry.status,200);assert.equal(retry.data.duplicate,true);
   const invalid=await requestHttps({port,cert,path:"/v27/events",payload,
     signature:"sha256="+"0".repeat(64)});
   assert.equal(invalid.status,401);
   const badBody={...payload,payload:{...payload.payload,total_minor:9999}};
   const conflict=await requestHttps({port,cert,path:"/v27/events",payload:badBody});
   assert.equal(conflict.status,409);
   const ids=await requestHttps({port,cert,path:"/v29/owner/event-ids?store_id="+store,
     method:"GET"});
   assert.equal(ids.status,200);assert.deepEqual(ids.data.event_ids,[event]);
 }finally{
   if(server.listening)await new Promise(ok=>server.close(ok));
   await rm(dir,{recursive:true,force:true});
 }
});
