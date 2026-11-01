// V101 real RFC1918 NIC TLS + PostgreSQL checkout. Runner NIC is real,
// though two trial cashier clients still run on the same CI machine.
// NO physical multi-PC LAN or actual market hardware claim.
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
import {localV101PrivateInterfaces,createV101PrivateNICPolicy} from "../private-nic-v101.mjs";
import {createV101PrivateNICServer} from "../private-lan-gateway-v101.mjs";
import {createV100MTLSTestClient} from "../mtls-client-v100.mjs";
import {assertV98GatePrivileges} from "../local-checkout-http-v98.mjs";
import {assertV94AuthPrivilegeBoundary} from "../local-test-market-v94.mjs";

for(const [name,value] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[name],value,"V101 disposable CI guard: "+name);
for(const name of ["PGPASSWORD","ZHIROX_TEST_CASHIER_PASSWORD",
 "ZHIROX_TEST_OWNER_PASSWORD","ZHIROX_LOCAL_SESSION_SECRET"])
 assert.ok(process.env[name],"V101 temporary trial key "+name);

const nic=localV101PrivateInterfaces()[0];
assert.ok(nic,"V101 requires an assigned nonloopback RFC1918 interface");
assert.notEqual(nic,"127.0.0.1");
const trial=mkdtempSync(join(tmpdir(),"zhirox-v101-nic-"));
const openssl=(...args)=>execFileSync("openssl",args,{cwd:trial,stdio:"pipe",timeout:10000});
const mat=name=>readFileSync(join(trial,name));
const store=TEST_MARKET.store,water=TEST_MARKET.product1;
const authRole="zhirox_v94_auth",gateRole="zhirox_v95_gate";
const passAuth=randomBytes(32).toString("hex"),passGate=randomBytes(32).toString("hex");
const cfg={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:25000};
const admin=new pg.Pool({...cfg,user:"v80test",password:process.env.PGPASSWORD,max:2});
const authPool=new pg.Pool({...cfg,user:authRole,password:passAuth,max:3});
const gatePool=new pg.Pool({...cfg,user:gateRole,password:passGate,max:4});
const deviceKeys={"trial-pc-01":randomBytes(32).toString("hex"),
 "trial-pc-02":randomBytes(32).toString("hex")};
const active=[];
let server,dropNext=false;
const request=n=>"10100000-0000-4000-8000-0000000000"+String(n).padStart(2,"0");
const basket=()=>[{product_id:water,qty:1}];
function createCertificates(){
 openssl("req","-x509","-newkey","rsa:2048","-sha256","-nodes",
  "-days","1","-subj","/CN=ZHIROX-V101-TEST-CA",
  "-keyout","ca.key","-out","ca.crt");
 writeFileSync(join(trial,"server.ext"),
  "basicConstraints=CA:FALSE\nsubjectAltName=IP:"+nic+"\nextendedKeyUsage=serverAuth\n");
 writeFileSync(join(trial,"client.ext"),
  "basicConstraints=CA:FALSE\nextendedKeyUsage=clientAuth\n");
 for(const [prefix,cn,ext] of [
  ["server",nic,"server.ext"],["pc1","trial-pc-01","client.ext"],
  ["pc2","trial-pc-02","client.ext"]]){
  openssl("req","-newkey","rsa:2048","-sha256","-nodes",
   "-subj","/CN="+cn,"-keyout",prefix+".key","-out",prefix+".csr");
  openssl("x509","-req","-in",prefix+".csr","-CA","ca.crt",
   "-CAkey","ca.key","-CAcreateserial","-days","1","-sha256",
   "-extfile",ext,"-out",prefix+".crt");
 }
}
const fingerprint=p=>new X509Certificate(mat(p+".crt"))
 .fingerprint256.replaceAll(":","").toUpperCase();
async function snapshot(){
 const {rows:[x]}=await admin.query(`
 SELECT
  (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS sales,
  (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS events,
  (SELECT coalesce(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
  (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS water,
  (SELECT price_minor FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS price,
  (SELECT coalesce(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90
    WHERE store_id=$1 AND product_id=$2)::bigint AS lot
 `,[store,water]);
 return x;
}
function newGateway(proofKeyHex){
 return createV101PrivateNICServer({
  bindAddress:nic,allowedPeers:[nic],
  tls:{ca:mat("ca.crt"),cert:mat("server.crt"),key:mat("server.key")},
  authPool,gatePool,sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,
  proofKeyHex,deviceKeys,afterCommittedForTest:async({res})=>{
   if(dropNext){dropNext=false;res.destroy();}
  }
 });
}
async function listen(server){
 server.listen(3318,nic);await once(server,"listening");
 assert.equal(server.address().address,nic);
}
async function close(server){
 await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
}
async function insecureAttempt(path,options={}){
 return new Promise((resolve,reject)=>{
  const req=https.request(path,{...options,timeout:3500},res=>{
   res.resume();res.on("end",()=>resolve(res.statusCode));
  });
  req.on("error",reject);
  req.on("timeout",()=>req.destroy(Error("V101_TLS_timeout")));
  req.end();
 });
}
try{
 const before=await snapshot();
 assert.equal(before.sales,17);
 assert.equal(before.events,17);
 assert.ok(Number(before.water)>=3);
 assert.equal(before.water,before.lot);
 assert.throws(()=>createV101PrivateNICPolicy({
  bindAddress:"0.0.0.0",allowedPeers:[nic]
 }),/exact_private_NIC/);
 assert.throws(()=>createV101PrivateNICPolicy({
  bindAddress:"127.0.0.1",allowedPeers:[nic]
 }),/exact_private_NIC/);
 assert.throws(()=>createV101PrivateNICPolicy({
  bindAddress:nic,allowedPeers:["8.8.8.8"]
 }),/exact_private_NIC/);
 assert.throws(()=>createV101PrivateNICPolicy({
  bindAddress:"192.168.254.249",allowedPeers:[nic]
 }),/exact_private_NIC/);
 createCertificates();
 const {rows:[proof]}=await admin.query(
  "SELECT encode(secret_key,'hex') AS secret FROM zhirox_local.v96_proof_keys WHERE store_id=$1",[store]);
 assert.match(proof.secret,/^[0-9a-f]{64}$/);
 for(const [role,password] of [[authRole,passAuth],[gateRole,passGate]]){
  const {rows:[r]}=await admin.query(
   "SELECT rolcanlogin,rolsuper FROM pg_roles WHERE rolname=$1",[role]);
  assert.deepEqual([r.rolcanlogin,r.rolsuper],[false,false]);
  await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
  active.push(role);
 }
 await assertV94AuthPrivilegeBoundary(authPool);
 await assertV98GatePrivileges(gatePool);
 // V100 leaves both fixed device IDs enrolled (PC2 revoked, PC1 rotated).
 // Re-enroll only those already-known synthetic identities for V101.
 const enrollment=await admin.query(`
  UPDATE zhirox_local.v100_trial_devices
  SET tls_fingerprint=CASE device_id
   WHEN 'trial-pc-01' THEN $2
   WHEN 'trial-pc-02' THEN $3 END,
   enabled=true,revoked_at=NULL
  WHERE store_id=$1 AND device_id IN ('trial-pc-01','trial-pc-02')`,
  [store,fingerprint("pc1"),fingerprint("pc2")]);
 assert.equal(enrollment.rowCount,2,"V100 must have exactly two known synthetic device IDs");
 server=newGateway(proof.secret);await listen(server);
 const origin="https://"+nic+":3318";
 const ca=mat("ca.crt");
 const pc1=createV100MTLSTestClient({
  origin,deviceId:"trial-pc-01",secretHex:deviceKeys["trial-pc-01"],
  ca,cert:mat("pc1.crt"),key:mat("pc1.key"),
  routePrefix:"/api/local/v101/"
 });
 const pc2=createV100MTLSTestClient({
  origin,deviceId:"trial-pc-02",secretHex:deviceKeys["trial-pc-02"],
  ca,cert:mat("pc2.crt"),key:mat("pc2.key"),
  routePrefix:"/api/local/v101/"
 });
 // Absence of signed client cert and untrusted CA must fail closed.
 await assert.rejects(()=>insecureAttempt(origin+"/api/local/v101/login",{
  ca,method:"POST"
 }));
 await assert.rejects(()=>insecureAttempt(origin+"/api/local/v101/login",{
  ca:Buffer.from("NOT A TRUSTED CA"),method:"POST"
 }));
 const [login1,login2]=await Promise.all([
  pc1.login(TEST_MARKET.cashierUsername,process.env.ZHIROX_TEST_CASHIER_PASSWORD),
  pc2.login(TEST_MARKET.ownerUsername,process.env.ZHIROX_TEST_OWNER_PASSWORD)
 ]);
 assert.equal(login1.status,200);
 assert.equal(login2.status,200);
 const [first,second]=await Promise.all([
  pc1.checkout({request_id:request(1),lines:basket()}),
  pc2.checkout({request_id:request(2),lines:basket()})
 ]);
 assert.equal(first.status,201);
 assert.equal(second.status,201);
 assert.notEqual(first.body.sale_id,second.body.sale_id);
 assert.notEqual(String(first.body.receipt_no),String(second.body.receipt_no));
 const two=await snapshot();
 assert.equal(two.sales,19);
 assert.equal(two.events,19);
 assert.equal(Number(two.water),Number(before.water)-2);
 // Actual nonloopback NIC listener unavailable, preserving the same
 // local actor sessions and request ID while LAN server restarts.
 await close(server);server=null;
 const unavailable=await pc1.checkout({request_id:request(3),lines:basket()});
 assert.equal(unavailable.status,0);
 assert.equal(unavailable.body.error,"unknown_commit_retry_same_request");
 assert.deepEqual(await snapshot(),two);
 server=newGateway(proof.secret);dropNext=true;await listen(server);
 const recovered=await pc1.checkout({request_id:request(3),lines:basket()});
 assert.equal(recovered.status,200);
 assert.equal(recovered.body.reason,"idempotent_replay");
 assert.equal(recovered.body.replayed,true);
 const repeated=await pc1.checkout({request_id:request(3),lines:basket()});
 assert.equal(repeated.status,200);
 assert.equal(repeated.body.sale_id,recovered.body.sale_id);
 // Immediate device revocation blocks even an established TLS session.
 await admin.query(`
  UPDATE zhirox_local.v100_trial_devices
  SET enabled=false,revoked_at=clock_timestamp()
  WHERE store_id=$1 AND device_id='trial-pc-02'`,[store]);
 const blocked=await pc2.checkout({request_id:request(4),lines:basket()});
 assert.equal(blocked.status,403);
 assert.equal(blocked.body.error,"device_certificate_not_enrolled");
 const after=await snapshot();
 assert.equal(after.sales,20);
 assert.equal(after.events,20);
 assert.equal(Number(after.water),Number(before.water)-3);
 assert.equal(Number(after.lot),Number(before.lot)-3);
 assert.equal(Number(after.gross),Number(before.gross)+3*Number(before.price));
 const {rows:[counts]}=await admin.query(
  "SELECT count(*)::integer AS sales,count(DISTINCT receipt_no)::integer AS unique_receipts FROM zhirox_local.sales WHERE store_id=$1 AND request_id=ANY($2::uuid[])",
  [store,[request(1),request(2),request(3)]]);
 assert.equal(counts.sales,3);assert.equal(counts.unique_receipts,3);
 console.log("V101 PASS: genuine nonloopback private NIC with TLS 1.3 mTLS, two signed device clients, stopped+restarted TLS listener, preserved request retry after lost COMMIT ACK, 3 atomic synthetic receipts only.");
}finally{
 if(server)await close(server).catch(()=>{});
 await Promise.allSettled([authPool.end(),gatePool.end()]);
 for(const role of active.reverse()){
  try{await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`)}
  catch{console.error("V101 temporary SQL login reset failed",role);process.exitCode=1;}
 }
 await admin.end().catch(()=>{});
 rmSync(trial,{recursive:true,force:true});
}
