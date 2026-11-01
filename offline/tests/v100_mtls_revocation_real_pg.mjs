// V100 genuine PostgreSQL + OpenSSL TLS1.3 mutual certificate acceptance.
// CI-only localhost, synthetic sales/LOTS. No production LAN exposure.
import assert from "node:assert/strict";
import https from "node:https";
import {once} from "node:events";
import {randomBytes,X509Certificate} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import pg from "pg";
import {TEST_MARKET} from "../test-market-v80.mjs";
import {createV100SecureServer,createV100MutualTLSHandler} from "../mtls-gateway-v100.mjs";
import {createV100MTLSTestClient} from "../mtls-client-v100.mjs";
import {signV99DeviceRequest} from "../device-guard-v99.mjs";
import {assertV98GatePrivileges} from "../local-checkout-http-v98.mjs";
import {assertV94AuthPrivilegeBoundary} from "../local-test-market-v94.mjs";

for(const [name,value] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[name],value,"V100 disposable CI only: "+name);
for(const name of ["PGPASSWORD","ZHIROX_TEST_CASHIER_PASSWORD",
 "ZHIROX_TEST_OWNER_PASSWORD","ZHIROX_LOCAL_SESSION_SECRET"])
 assert.ok(process.env[name],"V100 isolated test secret "+name);
const testDir=mkdtempSync(join(tmpdir(),"zhirox-v100-certs-"));
const run=(...args)=>execFileSync("openssl",args,{cwd:testDir,stdio:"pipe",timeout:10000});
const material=name=>readFileSync(join(testDir,name));
const store=TEST_MARKET.store;
const water=TEST_MARKET.product1;
const roleAuth="zhirox_v94_auth",roleGate="zhirox_v95_gate";
const authPwd=randomBytes(32).toString("hex"),gatePwd=randomBytes(32).toString("hex");
const opts={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:25000};
const admin=new pg.Pool({...opts,user:"v80test",password:process.env.PGPASSWORD,max:2});
const authPool=new pg.Pool({...opts,user:roleAuth,password:authPwd,max:2});
const gatePool=new pg.Pool({...opts,user:roleGate,password:gatePwd,max:4});
const keys={"trial-pc-01":randomBytes(32).toString("hex"),
 "trial-pc-02":randomBytes(32).toString("hex")};
let server,dropNext=false;
const enabled=[];
const request=n=>"10000000-0000-4000-8000-0000000000"+String(n).padStart(2,"0");
const cart=qty=>[{product_id:water,qty}];
function certs(){
 run("req","-x509","-newkey","rsa:2048","-sha256","-nodes",
  "-days","1","-subj","/CN=ZHIROX-V100-TEST-CA",
  "-keyout","ca.key","-out","ca.crt");
 writeFileSync(join(testDir,"server.ext"),
  "basicConstraints=CA:FALSE\nsubjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n");
 writeFileSync(join(testDir,"client.ext"),
  "basicConstraints=CA:FALSE\nextendedKeyUsage=clientAuth\n");
 for(const [prefix,cn,ext] of [
   ["server","127.0.0.1","server.ext"],
   ["pc1","trial-pc-01","client.ext"],
   ["pc2","trial-pc-02","client.ext"],
   ["pc1rotated","trial-pc-01","client.ext"]]){
  run("req","-newkey","rsa:2048","-sha256","-nodes",
   "-subj","/CN="+cn,"-keyout",prefix+".key","-out",prefix+".csr");
  run("x509","-req","-in",prefix+".csr","-CA","ca.crt","-CAkey","ca.key",
   "-CAcreateserial","-days","1","-sha256","-extfile",ext,
   "-out",prefix+".crt");
 }
}
const fingerprint=prefix=>new X509Certificate(material(prefix+".crt"))
 .fingerprint256.replaceAll(":","").toUpperCase();
async function state(){
 const {rows:[r]}=await admin.query(`
 SELECT (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS sales,
 (SELECT COALESCE(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
 (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS outbox,
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS water,
 (SELECT price_minor FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS price,
 (SELECT COALESCE(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90
   WHERE store_id=$1 AND product_id=$2)::bigint AS lots
 `,[store,water]);
 return r;
}
async function rawTLS(base,{cert,key,body,headers={}}={}){
 return new Promise((resolve,reject)=>{
  const data=JSON.stringify(body??{});
  const req=https.request(base+"/api/local/v100/login",{
   method:"POST",ca:material("ca.crt"),cert,key,rejectUnauthorized:true,
   minVersion:"TLSv1.3",maxVersion:"TLSv1.3",
   headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(data),...headers},
   timeout:4000
  },res=>{
   const chunks=[];
   res.on("data",c=>chunks.push(c));
   res.on("error",reject);
   res.on("end",()=>resolve({status:res.statusCode,
    body:JSON.parse(Buffer.concat(chunks).toString("utf8"))}));
  });
  req.on("error",reject);
  req.on("timeout",()=>req.destroy(new Error("TLS timeout")));
  req.end(data);
 });
}
try{
 const before=await state();
 assert.equal(before.sales,14);assert.equal(before.outbox,14);
 assert.ok(Number(before.water)>=3);
 assert.equal(Number(before.water),Number(before.lots));
 certs();
 const ca=material("ca.crt"),serverCert=material("server.crt");
 const serverKey=material("server.key");
 const {rows:[keyRow]}=await admin.query(
  "SELECT encode(secret_key,'hex') AS hmac FROM zhirox_local.v96_proof_keys WHERE store_id=$1",[store]);
 assert.match(keyRow.hmac,/^[0-9a-f]{64}$/);
 for(const [role,pwd] of [[roleAuth,authPwd],[roleGate,gatePwd]]){
  const {rows:[x]}=await admin.query(
   "SELECT rolcanlogin,rolsuper FROM pg_catalog.pg_roles WHERE rolname=$1",[role]);
  assert.deepEqual([x.rolcanlogin,x.rolsuper],[false,false]);
  await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${pwd}'`);
  enabled.push(role);
 }
 await assertV94AuthPrivilegeBoundary(authPool);
 await assertV98GatePrivileges(gatePool);
 await admin.query(`
  INSERT INTO zhirox_local.v100_trial_devices(store_id,device_id,tls_fingerprint)
  VALUES ($1,'trial-pc-01',$2),($1,'trial-pc-02',$3)
 `,[store,fingerprint("pc1"),fingerprint("pc2")]);
 await assert.rejects(()=>gatePool.query(
   "UPDATE zhirox_local.v100_trial_devices SET enabled=false WHERE store_id=$1",[store]),
   e=>e?.code==="42501");
 await assert.rejects(()=>gatePool.query(
   "SELECT * FROM zhirox_local.local_users"),
   e=>e?.code==="42501");
 server=createV100SecureServer({
  tls:{ca,cert:serverCert,key:serverKey},
  handler:createV100MutualTLSHandler({
   authPool,gatePool,sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,
   proofKeyHex:keyRow.hmac,deviceKeys:keys,
   afterCommittedForTest:async({res})=>{
    if(dropNext){dropNext=false;res.destroy();}
   }
  })
 });
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const origin="https://127.0.0.1:"+server.address().port;
 const pc1=createV100MTLSTestClient({origin,deviceId:"trial-pc-01",
  secretHex:keys["trial-pc-01"],ca,cert:material("pc1.crt"),key:material("pc1.key")});
 const pc2=createV100MTLSTestClient({origin,deviceId:"trial-pc-02",
  secretHex:keys["trial-pc-02"],ca,cert:material("pc2.crt"),key:material("pc2.key")});
 await assert.rejects(()=>rawTLS(origin,{
  body:{username:TEST_MARKET.cashierUsername,
    password:process.env.ZHIROX_TEST_CASHIER_PASSWORD}
 }));
 const login1=await pc1.login(TEST_MARKET.cashierUsername,
  process.env.ZHIROX_TEST_CASHIER_PASSWORD);
 const login2=await pc2.login(TEST_MARKET.ownerUsername,
  process.env.ZHIROX_TEST_OWNER_PASSWORD);
 assert.equal(login1.status,200);assert.equal(login2.status,200);
 const [a,b]=await Promise.all([
  pc1.checkout({request_id:request(1),lines:cart(1)}),
  pc2.checkout({request_id:request(2),lines:cart(1)})
 ]);
 assert.equal(a.status,201);assert.equal(b.status,201);
 assert.notEqual(a.body.sale_id,b.body.sale_id);
 assert.notEqual(String(a.body.receipt_no),String(b.body.receipt_no));
 assert.equal(a.body.device_id,"trial-pc-01");assert.equal(b.body.device_id,"trial-pc-02");
 // Revoke pc2 after it logged in. It must fail BEFORE any sale despite
 // valid mutual TLS, HMAC, valid cashier session and no server restart.
 await admin.query(`
  UPDATE zhirox_local.v100_trial_devices
  SET enabled=false,revoked_at=clock_timestamp()
  WHERE store_id=$1 AND device_id='trial-pc-02'`,[store]);
 const denied=await pc2.checkout({request_id:request(4),lines:cart(1)});
 assert.equal(denied.status,403);
 assert.equal(denied.body.error,"device_certificate_not_enrolled");
 assert.deepEqual(await state(),{
  ...before,sales:before.sales+2,outbox:before.outbox+2,
  gross:String(Number(before.gross)+2*Number(before.price)),
  water:String(Number(before.water)-2),lots:String(Number(before.lots)-2)
 });
 // PC1 still works during revocation of PC2. The third sale commits,
 // but its HTTPS response is destroyed: same request recovers receipt.
 dropNext=true;
 const recovered=await pc1.checkout({request_id:request(3),lines:cart(1)});
 assert.equal(recovered.status,200);
 assert.equal(recovered.body.replayed,true);
 const {rows:[sale]}=await admin.query(
  "SELECT id,receipt_no FROM zhirox_local.sales WHERE store_id=$1 AND request_id=$2",
  [store,request(3)]);
 assert.equal(recovered.body.sale_id,sale.id);
 const after=await state();
 assert.equal(after.sales,17);
 assert.equal(after.outbox,17);
 assert.equal(Number(after.water),Number(before.water)-3);
 assert.equal(Number(after.lots),Number(before.lots)-3);
 assert.equal(Number(after.gross),Number(before.gross)+3*Number(before.price));
 // Certificate rotation: register a different same-identity certificate,
 // deny old fingerprint immediately while accepting the newly enrolled one.
 await admin.query(`
  UPDATE zhirox_local.v100_trial_devices
   SET tls_fingerprint=$2 WHERE store_id=$1 AND device_id='trial-pc-01'`,
  [store,fingerprint("pc1rotated")]);
 await assert.rejects(()=>pc1.checkout({request_id:request(5),lines:cart(1)}),
  /request_id_cannot_change_basket|V100/).catch(async()=>{
   // The client reports HTTP 403 rather than throwing on normal rejection.
   const rejection=await pc1.checkout({request_id:request(5),lines:cart(1)});
   assert.equal(rejection.status,403);
  });
 const rotated=createV100MTLSTestClient({origin,deviceId:"trial-pc-01",
  secretHex:keys["trial-pc-01"],ca,cert:material("pc1rotated.crt"),
  key:material("pc1rotated.key")});
 const rotatedLogin=await rotated.login(TEST_MARKET.cashierUsername,
  process.env.ZHIROX_TEST_CASHIER_PASSWORD);
 assert.equal(rotatedLogin.status,200);
 assert.deepEqual(await state(),after);
 console.log("V100 PASS: real TLS1.3 mTLS two signed devices, 3 atomic receipts, instant PostgreSQL certificate revocation, old cert rejected/rotated cert accepted, lost TLS response idempotently recovered.");
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await Promise.allSettled([gatePool.end(),authPool.end()]);
 for(const role of enabled.reverse()){
  try{await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`);}
  catch{console.error("V100 temporary SQL role cleanup failed",role);process.exitCode=1;}
 }
 await admin.end().catch(()=>{});
 rmSync(testDir,{recursive:true,force:true});
}
