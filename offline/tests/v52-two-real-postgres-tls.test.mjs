// V52: real PostgreSQL-to-PostgreSQL, TLS and WAN outage acceptance in DISPOSABLE CI.
// No production cloud host is contacted; the test-only DNS name resolves via explicit
// network adapter to a TLS server bound on 127.0.0.1.
import test from "node:test";
import assert from "node:assert/strict";
import {createServer as createHttpsServer,request as httpsRequest} from "node:https";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {Pool} from "pg";
import {syncOutboxOnce} from "../outbox-sync-worker-v27.mjs";
import {createV50LabHttpsHandler} from "../staging-https-v50.mjs";
import {parseV28Stores,hashOwnerToken} from "../cloud-receiver-v28.mjs";
import {auditV50LabParity} from "../cloud-readiness-v50.mjs";
import {requireDisposablePostgres} from "../cloud-readiness-v50.mjs";

const store="10000000-0000-0000-0000-000000000052";
const product="20000000-0000-0000-0000-000000000052";
const cashier="30000000-0000-0000-0000-000000000052";
const requestId="40000000-0000-0000-0000-000000000052";
const secret="v52-synthetic-hmac-secret-".repeat(3);
const owner="v52-synthetic-owner-token-".repeat(3);
const demoHostname="sync.zhirox-lab.example";
const approvedURL="https://"+demoHostname+"/v27/events";

function getDatabaseConfigs(env){
 if(env.ZHIROX_V52_REAL_DB_CI_ENABLED!=="true")throw Error("v52_not_enabled");
 const local=requireDisposablePostgres(env.ZHIROX_V52_LOCAL_DISPOSABLE_DB_URL);
 const cloud=requireDisposablePostgres(env.ZHIROX_V52_CLOUD_DISPOSABLE_DB_URL);
 if(local===cloud)throw Error("v52_databases_must_be_distinct");
 const l=new URL(local),c=new URL(cloud);
 if(l.pathname===c.pathname||l.port&&l.port!=="5432"||c.port&&c.port!=="5432")
   throw Error("v52_distinct_test_databases_required");
 if(!l.pathname.includes("v52")||!c.pathname.includes("v52"))
   throw Error("v52_requires_explicit_test_names");
 return {local,cloud};
}

// DNS is explicitly remapped to localhost ONLY for this CI harness. All HTTP
// requests still perform genuine TLS certificate verification for demoHostname.
// This adapter must never be shipped in a Windows installer or production app.
function labTlsAdapter({port,cert,link}){
 return async (url,opts={})=>{
   if(!link.online)throw Error("simulated_wan_unavailable");
   const u=new URL(url);
   const senderTarget=u.origin==="https://"+demoHostname;
   const observerTarget=u.origin==="http://127.0.0.1:3419";
   if(!senderTarget&&!observerTarget)throw Error("v52_unapproved_test_url");
   if(opts.redirect!=="error")throw Error("redirect_must_be_disabled");
   return await new Promise((resolve,reject)=>{
     const body=opts.body||"";
     const req=httpsRequest({
       hostname:"127.0.0.1",servername:demoHostname,port,
       path:u.pathname+u.search,method:opts.method||"GET",
       headers:opts.headers||{},ca:cert,rejectUnauthorized:true,
       timeout:3000
     },res=>{
       const chunks=[];
       res.on("data",chunk=>chunks.push(chunk));
       res.on("end",()=>{
         const raw=Buffer.concat(chunks).toString("utf8");
         resolve({ok:res.statusCode>=200&&res.statusCode<300,
           status:res.statusCode,json:async()=>JSON.parse(raw)});
       });
     });
     req.on("error",reject);
     req.on("timeout",()=>req.destroy(Error("test_https_timeout")));
     if(body)req.write(body);
     req.end();
   });
 };
}

test("V52 must NEVER run against production SQL, live Supabase or a single shared database",()=>{
 assert.throws(()=>getDatabaseConfigs({}),/v52_not_enabled/);
 assert.throws(()=>getDatabaseConfigs({ZHIROX_V52_REAL_DB_CI_ENABLED:"true",
   ZHIROX_V52_LOCAL_DISPOSABLE_DB_URL:"postgres://bad@prod.supabase.co/live_market",
   ZHIROX_V52_CLOUD_DISPOSABLE_DB_URL:"postgres://bad@127.0.0.1/ghi_v52_test"}));
 const url="postgresql://trial:trial@127.0.0.1:5432/zhirox_v52_local_test";
 assert.throws(()=>getDatabaseConfigs({ZHIROX_V52_REAL_DB_CI_ENABLED:"true",
   ZHIROX_V52_LOCAL_DISPOSABLE_DB_URL:url,ZHIROX_V52_CLOUD_DISPOSABLE_DB_URL:url}));
});

test("V52 real PostgreSQL and genuine trusted TLS: WAN down, remote-committed ACK lost, replay, event-ID parity",async t=>{
 const {local:localUrl,cloud:cloudUrl}=getDatabaseConfigs(process.env);
 const local=new Pool({connectionString:localUrl,max:3,connectionTimeoutMillis:2000});
 const cloud=new Pool({connectionString:cloudUrl,max:3,connectionTimeoutMillis:2000});
 const folder=await mkdtemp(join(tmpdir(),"zhirox-v52-disposable-"));
 const certPath=join(folder,"cert.pem"),keyPath=join(folder,"key.pem");
 let server=null;
 try{
   // Independent disposable DBs are pre-created and migrated by the GitHub CI job.
   const [localExists,cloudExists]=await Promise.all([
     local.query("SELECT to_regclass('zhirox_local.event_outbox') AS tbl"),
     cloud.query("SELECT to_regclass('zhirox_cloud_v28.received_sales') AS tbl")
   ]);
   assert.ok(localExists.rows[0].tbl);
   assert.ok(cloudExists.rows[0].tbl);
   const initial=await cloud.query("SELECT count(*)::int AS n FROM zhirox_cloud_v28.received_sales");
   assert.equal(initial.rows[0].n,0,"never run against existing/real Cloud records");
   await local.query("INSERT INTO zhirox_local.stores(id,name) VALUES($1,$2)",[store,"V52 DISPOSABLE TEST STORE"]);
   await local.query("INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units) VALUES($1,$2,$3,$4,$5)",
     [store,product,"V52 SYNTHETIC TOMATO",11000,10]);
   const sale=await local.query(
     "SELECT * FROM zhirox_local.checkout_cash_v1($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
     [store,cashier,requestId,JSON.stringify([{product_id:product,qty:2}])]);
   assert.equal(sale.rows[0].total_minor,"22000");
   assert.equal(sale.rows[0].replayed,false);
   const stock=await local.query("SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2",[store,product]);
   assert.equal(stock.rows[0].stock_base_units,"8");
   const before=await local.query("SELECT count(*)::int AS n FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL",[store]);
   assert.equal(before.rows[0].n,1,"checkout locally committed before network operation");

   execFileSync("openssl",["req","-x509","-nodes","-newkey","rsa:2048","-sha256",
     "-days","1","-subj","/CN="+demoHostname,
     "-addext","subjectAltName=DNS:"+demoHostname,
     "-keyout",keyPath,"-out",certPath],{stdio:"ignore",timeout:12000});
   const [cert,key]=await Promise.all([readFile(certPath),readFile(keyPath)]);
   const stores=parseV28Stores([{store_id:store,sync_secret:secret,owner_token_hash:hashOwnerToken(owner)}]);
   server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},
     createV50LabHttpsHandler({pool:cloud,stores}));
   await new Promise((ok,fail)=>{
     server.once("error",fail);
     server.listen(0,"127.0.0.1",()=>{server.off("error",fail);ok()});
   });
   const link={online:false};
   const tls=labTlsAdapter({port:server.address().port,cert,link});
   const sync=async(fetchImpl=tls)=>syncOutboxOnce({
     pool:local,storeId:store,receiverUrl:approvedURL,secret,testMode:false,fetchImpl
   });
   const missing=await sync();
   assert.deepEqual({acked:missing.acked,retried:missing.retried},{acked:0,retried:1});
   assert.equal((await cloud.query("SELECT count(*)::int AS n FROM zhirox_cloud_v28.received_sales")).rows[0].n,0);
   let pending=await local.query("SELECT delivered_at,attempt_count FROM zhirox_local.event_outbox WHERE store_id=$1",[store]);
   assert.equal(pending.rows[0].delivered_at,null);
   assert.equal(pending.rows[0].attempt_count,1);

   link.online=true; // network returns, but server's ACK gets lost after its COMMIT
   await local.query("UPDATE zhirox_local.event_outbox SET next_attempt_at=now()-interval '1 second' WHERE store_id=$1",[store]);
   let acknowledgedByRemote=false;
   const lostAck=await sync(async (...args)=>{
     const response=await tls(...args);
     assert.equal(response.status,200);
     assert.equal((await response.json()).accepted,true);
     acknowledgedByRemote=true;
     throw Error("simulated_lost_ack_post_remote_commit");
   });
   assert.equal(acknowledgedByRemote,true);
   assert.deepEqual({acked:lostAck.acked,retried:lostAck.retried},{acked:0,retried:1});
   assert.equal((await cloud.query("SELECT count(*)::int AS n FROM zhirox_cloud_v28.received_sales")).rows[0].n,1);
   pending=await local.query("SELECT delivered_at,attempt_count FROM zhirox_local.event_outbox WHERE store_id=$1",[store]);
   assert.equal(pending.rows[0].delivered_at,null,"lost ACK must not falsify local delivery");
   assert.equal(pending.rows[0].attempt_count,2);
   await local.query("UPDATE zhirox_local.event_outbox SET next_attempt_at=now()-interval '1 second' WHERE store_id=$1",[store]);
   const final=await sync();
   assert.equal(final.acked,1);
   const remote=await cloud.query("SELECT store_id,event_id,sale_id,receipt_no,total_minor FROM zhirox_cloud_v28.received_sales");
   assert.equal(remote.rows.length,1,"remote exactly-once database effect after at-least-once network attempts");
   assert.equal(remote.rows[0].total_minor,"22000");
   pending=await local.query("SELECT delivered_at,attempt_count FROM zhirox_local.event_outbox WHERE store_id=$1",[store]);
   assert.ok(pending.rows[0].delivered_at);
   assert.equal(pending.rows[0].attempt_count,3);
   // End-to-end reconciliation through genuine TLS using the V28/V29 owner API.
   const report=await auditV50LabParity({pool:local,storeId:store,
     ownerToken:owner,receiverUrl:"http://127.0.0.1:3419/v27/events",fetchImpl:tls});
   assert.equal(report.sync_status,"MATCHED_NON_ATOMIC_LAB_SNAPSHOT");
   assert.equal(report.release_status,"NO_GO");
   assert.equal(report.cloud_received_sales,1);
   assert.equal(report.local_pending_events,0);
   assert.equal(report.local_missing_cloud,0);
   const columns=await cloud.query(
     "SELECT column_name FROM information_schema.columns WHERE table_schema='zhirox_cloud_v28' AND table_name='received_sales'");
   assert.ok(!columns.rows.some(x=>["name","barcode","customer_name","basket"].includes(x.column_name)));
   // Sender replay with identical request_id is local sale idempotency, not a second sale.
   const again=await local.query("SELECT * FROM zhirox_local.checkout_cash_v1($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
    [store,cashier,requestId,JSON.stringify([{product_id:product,qty:2}])]);
   assert.equal(again.rows[0].replayed,true);
   const finalStock=await local.query("SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2",
     [store,product]);
   assert.equal(finalStock.rows[0].stock_base_units,"8");
   t.diagnostic("V52 synthetic: checkout local during WAN outage; remote commit survives lost ACK; replay idempotent; TLS event-ID parity confirmed. NO_GO.");
 }finally{
   if(server?.listening)await new Promise(ok=>server.close(ok));
   await Promise.allSettled([local.end(),cloud.end()]);
   await rm(folder,{recursive:true,force:true});
 }
});
