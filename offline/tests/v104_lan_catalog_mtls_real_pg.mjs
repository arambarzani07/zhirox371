// V104 real PostgreSQL + real private-NIC TLS 1.3 mTLS read-only catalog acceptance.
// Verifies that two enrolled devices query the V103 atomic CSV catalog over the
// runner's RFC1918 interface, DB certificate revocation and rotation take effect
// immediately on the next request, and zero sales/outbox/stock mutations occur.
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
import {localV101PrivateInterfaces} from "../private-nic-v101.mjs";
import {assertV98GatePrivileges} from "../local-checkout-http-v98.mjs";
import {createV103AtomicCatalog} from "../market-catalog-watch-v103.mjs";
import {V104_PORT,V104_BASE,createV104CatalogLANServer} from "../market-catalog-lan-v104.mjs";
import {createV104CatalogLANClient} from "../market-catalog-lan-client-v104.mjs";

for(const [name,value] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[name],value,"V104 disposable CI guard: "+name);
assert.ok(process.env.PGPASSWORD,"V104 temporary PGPASSWORD required");

const nic=localV101PrivateInterfaces()[0];
assert.ok(nic,"V104 requires an assigned non-loopback RFC1918 interface");
const trial=mkdtempSync(join(tmpdir(),"zhirox-v104-pg-"));
const openssl=(...args)=>execFileSync("openssl",args,{cwd:trial,stdio:"pipe",timeout:10000});
const mat=name=>readFileSync(join(trial,name));
const store=TEST_MARKET.store,water=TEST_MARKET.product1;
const gateRole="zhirox_v95_gate",passGate=randomBytes(32).toString("hex");
const bearer="V104_CI_EPHEMERAL_READ_TOKEN_"+randomBytes(24).toString("hex");
const cfg={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:25000};
const admin=new pg.Pool({...cfg,user:"v80test",password:process.env.PGPASSWORD,max:2});
const gatePool=new pg.Pool({...cfg,user:gateRole,password:passGate,max:4});
const csvPath=join(trial,"market-catalog.csv");
let server,watch,roleActivated=false;

const mkCSV=(price,name="ئاوی کانی چنار")=>[
 "ItemNameID,ItemCode,ItemName,SalePrice,WholeSalePrice",
 "1,6260053183974,"+name+","+price+",150",
 "2,8698686920297,پەنیر,2500,1200"
].join("\n")+"\n";

function createCertificates(){
 openssl("req","-x509","-newkey","rsa:2048","-sha256","-nodes",
  "-days","1","-subj","/CN=ZHIROX-V104-PG-CA","-keyout","ca.key","-out","ca.crt");
 writeFileSync(join(trial,"server.ext"),
  "basicConstraints=CA:FALSE\nsubjectAltName=IP:"+nic+"\nextendedKeyUsage=serverAuth\n");
 writeFileSync(join(trial,"client.ext"),
  "basicConstraints=CA:FALSE\nextendedKeyUsage=clientAuth\n");
 for(const [prefix,cn,ext] of [
  ["server",nic,"server.ext"],
  ["pc1","trial-pc-01","client.ext"],
  ["pc2","trial-pc-02","client.ext"],
  ["pc1_rot","trial-pc-01","client.ext"]
 ]){
  openssl("req","-newkey","rsa:2048","-sha256","-nodes",
   "-subj","/CN="+cn,"-keyout",prefix+".key","-out",prefix+".csr");
  openssl("x509","-req","-in",prefix+".csr","-CA","ca.crt",
   "-CAkey","ca.key","-CAcreateserial","-days","1","-sha256",
   "-extfile",ext,"-out",prefix+".crt");
 }
}
const fp=p=>new X509Certificate(mat(p+".crt"))
 .fingerprint256.replaceAll(":","").toUpperCase();

async function dbSnapshot(){
 const {rows:[x]}=await admin.query(`
  SELECT
   (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS sales,
   (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS events,
   (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS water,
   (SELECT coalesce(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90
     WHERE store_id=$1 AND product_id=$2)::bigint AS lot
 `,[store,water]);
 return x;
}

try{
 const before=await dbSnapshot();
 writeFileSync(csvPath,mkCSV(1250));
 createCertificates();
 const {rows:[r]}=await admin.query(
  "SELECT rolcanlogin,rolsuper FROM pg_roles WHERE rolname=$1",[gateRole]);
 assert.deepEqual([r.rolcanlogin,r.rolsuper],[false,false]);
 await admin.query(`ALTER ROLE ${gateRole} LOGIN PASSWORD '${passGate}'`);
 roleActivated=true;
 await assertV98GatePrivileges(gatePool);

 const enroll=await admin.query(`
  UPDATE zhirox_local.v100_trial_devices
  SET tls_fingerprint=CASE device_id
   WHEN 'trial-pc-01' THEN $2
   WHEN 'trial-pc-02' THEN $3 END,
   enabled=true,revoked_at=NULL
  WHERE store_id=$1 AND device_id IN ('trial-pc-01','trial-pc-02')`,
  [store,fp("pc1"),fp("pc2")]);
 assert.equal(enroll.rowCount,2);

 watch=createV103AtomicCatalog({csvPath});
 await watch.refresh({force:true});
 server=createV104CatalogLANServer({
  bindAddress:nic,allowedPeers:[nic],
  tls:{ca:mat("ca.crt"),cert:mat("server.crt"),key:mat("server.key")},
  gatePool,watch,token:bearer
 });
 server.listen(V104_PORT,nic);
 await once(server,"listening");
 const origin="https://"+nic+":"+V104_PORT;
 const ca=mat("ca.crt");

 const pc1=createV104CatalogLANClient({
  origin,deviceId:"trial-pc-01",token:bearer,
  ca,cert:mat("pc1.crt"),key:mat("pc1.key")
 });
 const pc2=createV104CatalogLANClient({
  origin,deviceId:"trial-pc-02",token:bearer,
  ca,cert:mat("pc2.crt"),key:mat("pc2.key")
 });

 // Unauthenticated TLS attempt fails closed
 await assert.rejects(()=>new Promise((resolve,reject)=>{
  const req=https.request(origin+V104_BASE+"status",{ca,method:"GET"},res=>{
   res.resume();res.on("end",()=>resolve(res.statusCode));
  });
  req.on("error",reject);req.end();
 }));

 const [s1,s2]=await Promise.all([
  pc1.scan("6260053183974"),
  pc2.scan("6260053183974")
 ]);
 assert.equal(s1.status,200);
 assert.equal(s2.status,200);
 assert.equal(s1.body.item.price_minor,1250);
 assert.equal(s2.body.item.price_minor,1250);

 // Operator atomic CSV update seen by both devices
 writeFileSync(csvPath,mkCSV(1600,"ئاوی کانی چنار نوێ"));
 const updated=await pc1.scan("6260053183974");
 assert.equal(updated.status,200);
 assert.equal(updated.body.item.price_minor,1600);
 assert.equal(updated.body.generation,2);

 // Revoke PC2 in PostgreSQL -> immediately blocked on next catalog query
 await admin.query(`
  UPDATE zhirox_local.v100_trial_devices
  SET enabled=false,revoked_at=clock_timestamp()
  WHERE store_id=$1 AND device_id='trial-pc-02'`,[store]);
 const blocked=await pc2.scan("6260053183974");
 assert.equal(blocked.status,403);
 assert.equal(blocked.body.error,"device_certificate_not_enrolled");

 // Rotate PC1 fingerprint in PostgreSQL -> old cert denied, new cert accepted
 await admin.query(`
  UPDATE zhirox_local.v100_trial_devices
  SET tls_fingerprint=$2
  WHERE store_id=$1 AND device_id='trial-pc-01'`,[store,fp("pc1_rot")]);
 assert.equal((await pc1.status()).status,403);
 const pc1Next=createV104CatalogLANClient({
  origin,deviceId:"trial-pc-01",token:bearer,
  ca,cert:mat("pc1_rot.crt"),key:mat("pc1_rot.key")
 });
 assert.equal((await pc1Next.scan("6260053183974")).status,200);

 // Verify zero database mutations to sales, outbox, stock or LOT balances
 const after=await dbSnapshot();
 assert.deepEqual(after,before);
 console.log("V104 PASS: real PostgreSQL device registry + private-NIC TLS 1.3 mTLS read-only CSV catalog watcher verified with zero financial or stock writes.");
}finally{
 if(watch)watch.stopPolling();
 if(server)await new Promise(r=>server.close(()=>r())).catch(()=>{});
 await gatePool.end().catch(()=>{});
 if(roleActivated){
  try{await admin.query(`ALTER ROLE ${gateRole} NOLOGIN PASSWORD NULL`);}
  catch{console.error("V104 role reset failed");process.exitCode=1;}
 }
 await admin.end().catch(()=>{});
 rmSync(trial,{recursive:true,force:true});
}
