import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import {once} from "node:events";
import {X509Certificate} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtemp,writeFile,rm,utimes,symlink} from "node:fs/promises";
import {readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {localV101PrivateInterfaces} from "../private-nic-v101.mjs";
import {createV103AtomicCatalog} from "../market-catalog-watch-v103.mjs";
import {
 V104_PORT,V104_BASE,
 createV104CatalogLANHandler,
 createV104CatalogLANServer,
 startV104CatalogLANLab
} from "../market-catalog-lan-v104.mjs";
import {createV104CatalogLANClient} from "../market-catalog-lan-client-v104.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";

const mkCSV=(price,name="ئاوی کانی چنار")=>[
 "ItemNameID,ItemCode,ItemName,SalePrice,WholeSalePrice",
 "1,6260053183974,"+name+","+price+",150",
 "2,8698686920297,پەنیر,2500,1200",
 "3,1112223334445,کاڵای یەکەم,1000,800",
 "4,1112223334445,کاڵای دووەم,2000,1500"
].join("\n")+"\n";
const bearer="V104_PRIVATE_LAN_READ_TOKEN_".repeat(2);

test("V104 real TLS 1.3 mTLS read-only catalog: two enrolled devices, immediate DB revocation, cert rotation, atomic CSV refresh and fail-closed stale/invalid source",async()=>{
 const rfc1918=localV101PrivateInterfaces()[0];
 const bindIp=rfc1918||"127.0.0.1";
 const peers=rfc1918?[rfc1918]:null;
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v104-lan-"));
 const csv=join(dir,"market.csv");
 await writeFile(csv,mkCSV(1250));
 const openssl=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"pipe",timeout:10000});
 openssl("req","-x509","-newkey","rsa:2048","-sha256","-nodes",
  "-days","1","-subj","/CN=ZHIROX-V104-TEST-CA","-keyout","ca.key","-out","ca.crt");
 await writeFile(join(dir,"server.ext"),
  "basicConstraints=CA:FALSE\nsubjectAltName=IP:"+bindIp+"\nextendedKeyUsage=serverAuth\n");
 await writeFile(join(dir,"client.ext"),
  "basicConstraints=CA:FALSE\nextendedKeyUsage=clientAuth\n");
 for(const [prefix,cn,ext] of [
  ["server",bindIp,"server.ext"],
  ["pc1","trial-pc-01","client.ext"],
  ["pc2","trial-pc-02","client.ext"],
  ["pc1_next","trial-pc-01","client.ext"]
 ]){
  openssl("req","-newkey","rsa:2048","-sha256","-nodes",
   "-subj","/CN="+cn,"-keyout",prefix+".key","-out",prefix+".csr");
  openssl("x509","-req","-in",prefix+".csr","-CA","ca.crt",
   "-CAkey","ca.key","-CAcreateserial","-days","1","-sha256",
   "-extfile",ext,"-out",prefix+".crt");
 }
 const mat=name=>readFileSync(join(dir,name));
 const fp=name=>new X509Certificate(mat(name+".crt"))
  .fingerprint256.replaceAll(":","").toUpperCase();

 // Durable device registry state (backed by gatePool query per request)
 const devices=new Map([
  ["trial-pc-01",{enabled:true,tls_fingerprint:fp("pc1")}],
  ["trial-pc-02",{enabled:true,tls_fingerprint:fp("pc2")}]
 ]);
 const queries=[];
 const gatePool={
  async query(sql,params){
   queries.push({sql,params});
   assert.match(sql,/SELECT enabled,tls_fingerprint FROM zhirox_local\.v100_trial_devices/);
   assert.equal(params[0],TEST_MARKET.store);
   const rec=devices.get(params[1]);
   return {rows:rec?[rec]:[]};
  }
 };

 const watch=createV103AtomicCatalog({csvPath:csv});
 await watch.refresh({force:true});
 const server=createV104CatalogLANServer({
  bindAddress:bindIp,allowedPeers:peers,
  tls:{ca:mat("ca.crt"),cert:mat("server.crt"),key:mat("server.key")},
  gatePool,watch,token:bearer
 });
 server.listen(V104_PORT,bindIp);
 await once(server,"listening");
 const origin="https://"+bindIp+":"+V104_PORT;
 const ca=mat("ca.crt");

 const pc1=createV104CatalogLANClient({
  origin,deviceId:"trial-pc-01",token:bearer,
  ca,cert:mat("pc1.crt"),key:mat("pc1.key")
 });
 const pc2=createV104CatalogLANClient({
  origin,deviceId:"trial-pc-02",token:bearer,
  ca,cert:mat("pc2.crt"),key:mat("pc2.key")
 });

 try{
  // Both enrolled devices can query status, scan and search over TLS 1.3 mTLS
  const [st1,st2]=await Promise.all([pc1.status(),pc2.status()]);
  assert.equal(st1.status,200);
  assert.equal(st2.status,200);
  assert.equal(st1.body.valid_rows,4);
  assert.equal(st1.body.ambiguous_barcodes,1);
  assert.equal(st1.body.checkout_enabled,false);
  assert.equal(st1.body.write_enabled,false);
  assert.equal(st1.body.stock_verified,false);
  assert.equal(st1.body.device_id,"trial-pc-01");
  assert.equal(st2.body.device_id,"trial-pc-02");
  assert.equal(st1.headers["access-control-allow-origin"],undefined);
  assert.doesNotMatch(JSON.stringify(st1.body),/WholeSalePrice|market\.csv|150|1200/);

  const scan1=await pc1.scan("6260053183974");
  assert.equal(scan1.status,200);
  assert.equal(scan1.body.item.price_minor,1250);
  assert.equal(scan1.body.item.name,"ئاوی کانی چنار");

  // Ambiguous barcode refuses scan on LAN just like V102/V103
  const amb=await pc2.scan("1112223334445");
  assert.equal(amb.status,409);
  assert.equal(amb.body.error,"ambiguous_barcode_refused");

  const searchRes=await pc2.search("پەنیر");
  assert.equal(searchRes.status,200);
  assert.equal(searchRes.body.count,1);
  assert.equal(searchRes.body.items[0].price_minor,2500);

  // Operator updates CSV atomically -> both devices immediately see new price
  await writeFile(csv,mkCSV(1750,"ئاوی نوێی کانی چنار"));
  const [fresh1,fresh2]=await Promise.all([
   pc1.scan("6260053183974"),
   pc2.scan("6260053183974")
  ]);
  assert.equal(fresh1.status,200);
  assert.equal(fresh2.status,200);
  assert.equal(fresh1.body.item.price_minor,1750);
  assert.equal(fresh2.body.item.price_minor,1750);
  assert.equal(fresh1.body.generation,2);

  // Immediate DB revocation of trial-pc-02 blocks its next request without restart
  devices.set("trial-pc-02",{enabled:false,tls_fingerprint:fp("pc2")});
  const revoked=await pc2.scan("6260053183974");
  assert.equal(revoked.status,403);
  assert.equal(revoked.body.error,"device_certificate_not_enrolled");

  // PC1 continues working while PC2 is revoked
  const pc1StillOk=await pc1.scan("6260053183974");
  assert.equal(pc1StillOk.status,200);
  assert.equal(pc1StillOk.body.item.price_minor,1750);

  // Certificate rotation in DB immediately invalidates PC1's old cert and accepts new cert
  devices.set("trial-pc-01",{enabled:true,tls_fingerprint:fp("pc1_next")});
  const oldCertDenied=await pc1.status();
  assert.equal(oldCertDenied.status,403);
  const pc1Rotated=createV104CatalogLANClient({
   origin,deviceId:"trial-pc-01",token:bearer,
   ca,cert:mat("pc1_next.crt"),key:mat("pc1_next.key")
  });
  const rotatedOk=await pc1Rotated.scan("6260053183974");
  assert.equal(rotatedOk.status,200);
  assert.equal(rotatedOk.body.item.price_minor,1750);

  // Corrupted CSV fails closed (503) and never serves stale 1750 price
  await writeFile(csv,"ItemNameID,ItemCode,ItemName,SalePrice\n1,bad,broken,NOT_NUMBER\n");
  const broken=await pc1Rotated.scan("6260053183974");
  assert.equal(broken.status,503);
  assert.equal(broken.body.snapshot_available,false);

  // Repaired CSV restores service with new generation
  await writeFile(csv,mkCSV(2000));
  const repaired=await pc1Rotated.scan("6260053183974");
  assert.equal(repaired.status,200);
  assert.equal(repaired.body.item.price_minor,2000);

  // Stale file (>24h old) fails closed
  const oldTime=new Date(Date.now()-48*3600*1000);
  await utimes(csv,oldTime,oldTime);
  const staleRes=await pc1Rotated.status();
  assert.equal(staleRes.status,503);
  assert.equal(staleRes.body.error,"snapshot_unavailable_or_stale");
  await utimes(csv,new Date(),new Date());
  assert.equal((await pc1Rotated.status()).status,200);

  // Symlink swap fails closed
  const targetCsv=join(dir,"other.csv");
  await writeFile(targetCsv,mkCSV(9000));
  await rm(csv);
  await symlink(targetCsv,csv);
  const symRes=await pc1Rotated.scan("6260053183974");
  assert.equal(symRes.status,503);
  assert.equal(symRes.body.snapshot_available,false);
 }finally{
  watch.stopPolling();
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  await rm(dir,{recursive:true,force:true});
 }
});

test("V104 rejects missing client cert, wrong Host, CORS Origin, bad bearer, write verbs, checkout paths and non-RFC1918 binds",async()=>{
 const rfc1918=localV101PrivateInterfaces()[0];
 const bindIp=rfc1918||"127.0.0.1";
 const peers=rfc1918?[rfc1918]:null;
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v104-guard-"));
 const csv=join(dir,"market.csv");
 await writeFile(csv,mkCSV(1500));
 const openssl=(...args)=>execFileSync("openssl",args,{cwd:dir,stdio:"pipe",timeout:10000});
 openssl("req","-x509","-newkey","rsa:2048","-sha256","-nodes",
  "-days","1","-subj","/CN=ZHIROX-V104-GUARD-CA","-keyout","ca.key","-out","ca.crt");
 await writeFile(join(dir,"server.ext"),
  "basicConstraints=CA:FALSE\nsubjectAltName=IP:"+bindIp+"\nextendedKeyUsage=serverAuth\n");
 await writeFile(join(dir,"client.ext"),
  "basicConstraints=CA:FALSE\nextendedKeyUsage=clientAuth\n");
 for(const [prefix,cn,ext] of [
  ["server",bindIp,"server.ext"],
  ["pc1","trial-pc-01","client.ext"]
 ]){
  openssl("req","-newkey","rsa:2048","-sha256","-nodes",
   "-subj","/CN="+cn,"-keyout",prefix+".key","-out",prefix+".csr");
  openssl("x509","-req","-in",prefix+".csr","-CA","ca.crt",
   "-CAkey","ca.key","-CAcreateserial","-days","1","-sha256",
   "-extfile",ext,"-out",prefix+".crt");
 }
 const mat=name=>readFileSync(join(dir,name));
 const fp=name=>new X509Certificate(mat(name+".crt"))
  .fingerprint256.replaceAll(":","").toUpperCase();
 const gatePool={
  async query(){
   return {rows:[{enabled:true,tls_fingerprint:fp("pc1")}]};
  }
 };
 const watch=createV103AtomicCatalog({csvPath:csv});
 await watch.refresh({force:true});

 // Non-RFC1918 bind addresses are rejected before server creation
 const mockInterfaces={eth0:[{family:"IPv4",internal:false,address:"192.168.7.12"}]};
 for(const badBind of ["0.0.0.0","8.8.8.8","192.168.254.251"]){
  assert.throws(()=>createV104CatalogLANHandler({
   bindAddress:badBind,allowedPeers:["192.168.7.12"],interfaces:mockInterfaces,gatePool,watch,token:bearer
  }),/exact_private_NIC/);
 }
 // Valid RFC1918 interface policy works with injected interfaces
 const rfcHandler=createV104CatalogLANHandler({
  bindAddress:"192.168.7.12",allowedPeers:["192.168.7.21"],interfaces:mockInterfaces,gatePool,watch,token:bearer
 });
 assert.equal(typeof rfcHandler,"function");

 // Startup without explicit consent fails closed
 await assert.rejects(()=>startV104CatalogLANLab({
  bindAddress:bindIp,allowedPeers:peers,
  tls:{ca:mat("ca.crt"),cert:mat("server.crt"),key:mat("server.key")},
  gatePool,csvPath:csv,token:bearer,
  consent:"YES_DISPOSABLE_V104_MTLS_CATALOG_LAB"
 }),/opt_in_required/);

 const server=createV104CatalogLANServer({
  bindAddress:bindIp,allowedPeers:peers,
  tls:{ca:mat("ca.crt"),cert:mat("server.crt"),key:mat("server.key")},
  gatePool,watch,token:bearer
 });
 server.listen(V104_PORT,bindIp);
 await once(server,"listening");
 const origin="https://"+bindIp+":"+V104_PORT;
 const ca=mat("ca.crt");
 const cert=mat("pc1.crt");
 const key=mat("pc1.key");

 const rawReq=(path,opts={})=>new Promise((resolve,reject)=>{
  const req=https.request(origin+path,{
   ca,cert,key,minVersion:"TLSv1.3",maxVersion:"TLSv1.3",
   checkServerIdentity:()=>undefined,
   method:opts.method||"GET",
   headers:{
    "Authorization":"Bearer "+bearer,
    "x-zhirox-device-id":"trial-pc-01",
    ...opts.headers
   },timeout:4000
  },res=>{
   const chunks=[];
   res.on("data",c=>chunks.push(c));
   res.on("end",()=>resolve({
    status:res.statusCode,
    body:JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}")
   }));
  });
  req.on("error",reject);
  req.end();
 });

 try{
  // Connection without client cert is rejected at TLS handshake
  await assert.rejects(()=>new Promise((resolve,reject)=>{
   const req=https.request(origin+V104_BASE+"status",{ca,method:"GET"},res=>{
    res.resume();res.on("end",()=>resolve(res.statusCode));
   });
   req.on("error",reject);req.end();
  }));

  // Spoofed Host header is rejected by NIC policy
  const badHost=await rawReq(V104_BASE+"status",{headers:{Host:"zhirox.com"}});
  assert.equal(badHost.status,403);
  assert.equal(badHost.body.error,"private_nic_policy_refused");

  // Browser Origin header is rejected (no CORS/browser scraping on mTLS LAN route)
  const withOrigin=await rawReq(V104_BASE+"status",{headers:{Origin:"https://zhirox.com"}});
  assert.equal(withOrigin.status,403);
  assert.equal(withOrigin.body.error,"cors_origin_forbidden");

  // Claimed device ID mismatching certificate CN is rejected
  const wrongDevice=await rawReq(V104_BASE+"status",{headers:{"x-zhirox-device-id":"trial-pc-02"}});
  assert.equal(wrongDevice.status,403);
  assert.equal(wrongDevice.body.error,"device_certificate_not_enrolled");

  // Wrong bearer token is rejected with 401
  const badToken=await rawReq(V104_BASE+"status",{headers:{Authorization:"Bearer WRONG"}});
  assert.equal(badToken.status,401);

  // Every write HTTP method is rejected with 405
  for(const method of ["POST","PUT","PATCH","DELETE","OPTIONS"]){
   const res=await rawReq(V104_BASE+"status",{method});
   assert.equal(res.status,405,method);
  }

  // Checkout / sales routes do not exist (404)
  for(const forbidden of ["checkout","sales","login","refund"]){
   const res=await rawReq(V104_BASE+forbidden);
   assert.equal(res.status,404,forbidden);
  }

  // Unexpected query parameters are rejected (400)
  assert.equal((await rawReq(V104_BASE+"status?extra=1")).status,400);
  assert.equal((await rawReq(V104_BASE+"scan?code=6260053183974&extra=1")).status,400);
  assert.equal((await rawReq(V104_BASE+"products?q=%D9%BE%D9%86%DB%8C%D8%B1&limit=999")).status,400);
 }finally{
  watch.stopPolling();
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  await rm(dir,{recursive:true,force:true});
 }
});

test("V104 client enforces private RFC1918 or 127.0.0.1 HTTPS origin and public build stays untouched",async()=>{
 assert.throws(()=>createV104CatalogLANClient({
  origin:"http://192.168.1.10:3322",deviceId:"trial-pc-01",
  token:bearer,ca:"x",cert:"y",key:"z"
 }),/private_nic_https_mtls/);
 assert.throws(()=>createV104CatalogLANClient({
  origin:"https://8.8.8.8:3322",deviceId:"trial-pc-01",
  token:bearer,ca:"x",cert:"y",key:"z"
 }),/private_nic_https_mtls/);
 assert.throws(()=>createV104CatalogLANClient({
  origin:"https://zhirox.com:3322",deviceId:"trial-pc-01",
  token:bearer,ca:"x",cert:"y",key:"z"
 }),/private_nic_https_mtls/);

 const main=readFileSync("src/main.tsx","utf8");
 const vite=readFileSync("vite.config.ts","utf8");
 const host=readFileSync("offline/market-catalog-lan-v104.mjs","utf8");
 assert.doesNotMatch(main,/v104|3322/i,"public React entrypoint must never mount V104 LAN watcher");
 assert.match(vite,/official cashier release is blocked/);
 assert.doesNotMatch(host,/0\.0\.0\.0|INSERT INTO|UPDATE zhirox_local\.products|checkout_proven/);
});
