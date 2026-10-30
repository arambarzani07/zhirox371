// V59: actual PostgreSQL 16 + authenticated HTTPS cash-only test with WAN absent.
// Runs ONLY against a freshly isolated CI TEST database; never real customer data.
// No Cloud, external bank, hardware printer, production SQL or deploy.
import test from "node:test";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {createServer as createHttpsServer,request as httpsRequest} from "node:https";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {hashLocalPassword} from "../local-password.mjs";
import {createV33LanHandler,createV33ClientLimiter} from "../lan-gateway-v33.mjs";
import {createLocalShiftHandlerV37} from "../local-shifts-v37.mjs";

const store="10000000-0000-0000-0000-000000000059";
const a="20000000-0000-0000-0000-000000000059";
const b="20000000-0000-0000-0000-000000000060";
const item="30000000-0000-0000-0000-000000000059";
const second="30000000-0000-0000-0000-000000000060";
const shiftA="40000000-0000-0000-0000-000000000059";
const shiftB="40000000-0000-0000-0000-000000000060";
const stale="50000000-0000-0000-0000-000000000058";
const reqA="50000000-0000-0000-0000-000000000059";
const reqB="50000000-0000-0000-0000-000000000060";
const printId="60000000-0000-0000-0000-000000000059";
const password="v59-SYNTHETIC-only-LOCAL-pass";
const barcode="6260053183974";
const otherBarcode="6260053183998";
const sessionSecret="v59-isolated-https-signing-key-not-for-production-".repeat(2);

function assertDisposableEnv(env){
 if(env.ZHIROX_V59_DISPOSABLE_CI_TEST!=="true" ||
    env.PGHOST!=="127.0.0.1" ||
    env.PGDATABASE!=="zhirox_v59_ci_test" ||
    env.PGUSER!=="localtest" ||
    !env.PGPASSWORD ||
    env.ZHIROX_RELEASE_MODE==="official")
  throw Error("v59_refuses_non_disposable_database");
}
assertDisposableEnv(process.env);

async function requestVerifiedTLS({port,cert,path,method="GET",token,body}){
 const payload=body===undefined?undefined:JSON.stringify(body);
 return await new Promise((resolve,reject)=>{
  const headers={"Accept":"application/json"};
  if(token)headers.Authorization="Bearer "+token;
  if(payload!==undefined){
   headers["Content-Type"]="application/json";
   headers["Content-Length"]=Buffer.byteLength(payload);
  }
  const req=httpsRequest({
    hostname:"127.0.0.1",servername:"127.0.0.1",port,path,method,headers,
    ca:cert,rejectUnauthorized:true,timeout:6000
  },res=>{
    let response="";
    res.setEncoding("utf8");
    res.on("data",chunk=>response+=chunk);
    res.on("end",()=>{
      try{resolve({
        status:res.statusCode,headers:res.headers,
        data:res.headers["content-type"]?.includes("application/json")?
             JSON.parse(response):response
      });}catch(e){reject(e);}
    });
  });
  req.once("error",reject);
  req.once("timeout",()=>req.destroy(Error("v59_loopback_tls_timeout")));
  if(payload!==undefined)req.write(payload);
  req.end();
 });
}
test("V59 REAL PostgreSQL + TLS: two authenticated cashiers never oversell or duplicate receipts, no WAN",async()=>{
 const pool=new Pool({
  host:"127.0.0.1",port:5432,database:"zhirox_v59_ci_test",
  user:"localtest",password:process.env.PGPASSWORD,
  max:8,connectionTimeoutMillis:3000
 });
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v59-only-ci-"));
 let server=null;
 try{
  const empty=await pool.query(
   "SELECT (SELECT count(*) FROM zhirox_local.stores)::integer AS stores, (SELECT count(*) FROM zhirox_local.sales)::integer AS sales");
  assert.deepEqual(empty.rows[0],{stores:0,sales:0},
   "hard refusal against a populated/non-disposable store");
  const hash=await hashLocalPassword(password);
  await pool.query("INSERT INTO zhirox_local.stores(id,name) VALUES($1,$2)",
    [store,"ZHIROX V59 DISPOSABLE TEST STORE"]);
  for(const [id,username] of [[a,"v59-cashier-a"],[b,"v59-cashier-b"]]){
   await pool.query(
    "INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role) VALUES($1,$2,$3,$4,'cashier')",
    [store,id,username,hash]);
  }
  await pool.query(
   "INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units) VALUES ($1,$2,'V59 Synthetic Last Unit',1250,2),($1,$3,'V59 Synthetic Stale Quote',400,3)",
   [store,item,second]);
  await pool.query(
   "INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units) VALUES($1,$2,$3,1),($1,$4,$5,1)",
   [store,barcode,item,otherBarcode,second]);
  const certPath=join(dir,"cert.pem"),keyPath=join(dir,"key.pem");
  execFileSync("openssl",[
   "req","-x509","-nodes","-newkey","rsa:2048","-sha256","-days","1",
   "-subj","/CN=localhost","-addext","subjectAltName=IP:127.0.0.1,DNS:localhost",
   "-keyout",keyPath,"-out",certPath
  ],{stdio:"ignore",timeout:15000});
  const [cert,key]=await Promise.all([readFile(certPath),readFile(keyPath)]);
  const localHandler=createLocalShiftHandlerV37({pool,secret:sessionSecret});
  const gateway=createV33LanHandler({
   pool,secret:sessionSecret,peers:new Set(["127.0.0.1"]),
   localHandler,limiter:createV33ClientLimiter({limit:150})
  });
  server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},gateway);
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(0,"127.0.0.1",()=>{server.off("error",reject);resolve();});
  });
  const port=server.address().port;
  const get=(path,token)=>requestVerifiedTLS({port,cert,path,token});
  const post=(path,body,token)=>requestVerifiedTLS({port,cert,path,token,body,method:"POST"});

  // This is validated HTTPS on loopback; no remote Cloud endpoint exists.
  const health=await get("/v33/health");
  assert.equal(health.status,200);
  assert.equal(health.data.mode,"isolated_lan_test");
  assert.equal((await get("/api/local/v26/scan?code="+barcode)).status,401);
  assert.equal((await post("/api/local/v3/login",
   {store_id:store,username:"v59-cashier-a",password:"invalid-password"})).status,401);
  const loginA=await post("/api/local/v3/login",
   {store_id:store,username:"v59-cashier-a",password});
  const loginB=await post("/api/local/v3/login",
   {store_id:store,username:"v59-cashier-b",password});
  assert.equal(loginA.status,200);
  assert.equal(loginB.status,200);
  const tokenA=loginA.data.token,tokenB=loginB.data.token;
  assert.ok(tokenA&&tokenB&&tokenA!==tokenB);
  assert.equal((await post("/api/local/v31/prepare",
   {store_id:store,request_id:reqA,lines:[],expected_total_minor:0},tokenA)).status,400,
   "browser may not inject store identity");
  assert.equal((await post("/api/local/v37/shift/open",
   {shift_id:shiftA,opening_minor:1000},tokenA)).status,200);
  assert.equal((await post("/api/local/v37/shift/open",
   {shift_id:shiftB,opening_minor:500},tokenB)).status,200);
  const scan=await get("/api/local/v26/scan?code="+barcode,tokenA);
  assert.equal(scan.status,200);
  assert.equal(scan.data.product.price_minor,"1250");
  assert.equal(scan.data.product.stock_base_units,"2");

  // Exact server-side price checks must reject stale quotes with zero side effects.
  assert.equal((await post("/api/local/v31/prepare",
   {request_id:stale,lines:[{barcode:otherBarcode,qty:1}],expected_total_minor:399},tokenA)).status,200);
  const staleCommit=await post("/api/local/v31/commit",{request_id:stale},tokenA);
  assert.equal(staleCommit.status,409);
  assert.equal(staleCommit.data.error,"price_changed");
  assert.equal((await post("/api/local/v31/cancel",{request_id:stale},tokenA)).status,200);
  assert.equal(Number((await pool.query(
   "SELECT count(*)::int AS n FROM zhirox_local.sales WHERE store_id=$1",[store])).rows[0].n),0);

  // Both independent local sessions prepare the exact last two units.
  for(const [requestId,token] of [[reqA,tokenA],[reqB,tokenB]]){
   const prepared=await post("/api/local/v31/prepare",
    {request_id:requestId,lines:[{barcode,qty:2}],expected_total_minor:2500},token);
   assert.equal(prepared.status,200);
   assert.equal(prepared.data.intent.state,"prepared");
  }
  const [saleA,saleB]=await Promise.all([
   post("/api/local/v31/commit",{request_id:reqA},tokenA),
   post("/api/local/v31/commit",{request_id:reqB},tokenB)
  ]);
  const succeeded=[saleA,saleB].filter(r=>r.status===200);
  const refused=[saleA,saleB].filter(r=>r.status===409);
  assert.equal(succeeded.length,1,"two cashiers must not sell same last units");
  assert.equal(refused.length,1,"the loser must get a definite stock conflict");
  assert.equal(succeeded[0].data.receipt.total_minor,"2500");
  const aWins=saleA.status===200;
  const winnerToken=aWins?tokenA:tokenB;
  const loserToken=aWins?tokenB:tokenA;
  const winnerRequest=aWins?reqA:reqB,loserRequest=aWins?reqB:reqA;
  const saleId=succeeded[0].data.receipt.sale_id;
  assert.equal((await post("/api/local/v31/cancel",
    {request_id:loserRequest},loserToken)).status,200);
  const replay=await post("/api/local/v31/commit",{request_id:winnerRequest},winnerToken);
  assert.equal(replay.status,200);
  assert.equal(replay.data.receipt.replayed,true);
  assert.equal(replay.data.receipt.sale_id,saleId);
  const detail=await get("/api/local/v34/receipt?sale_id="+saleId,winnerToken);
  assert.equal(detail.status,200);
  assert.equal(detail.data.receipt.total_minor,"2500");
  assert.equal(detail.data.receipt.lines.length,1);
  assert.equal((await get("/api/local/v34/receipt?sale_id="+saleId,loserToken)).status,404,
   "cashier may not read another cashier's immutable receipt");

  const queue=await post("/api/local/v35/print-jobs",
   {sale_id:saleId,job_id:printId,width_mm:80},winnerToken);
  assert.equal(queue.status,202);
  assert.equal(queue.data.job.state,"queued");
  assert.equal(queue.data.hardware_printed,false);
  const queueAgain=await post("/api/local/v35/print-jobs",
   {sale_id:saleId,job_id:printId,width_mm:80},winnerToken);
  assert.equal(queueAgain.status,202);
  assert.equal(queueAgain.data.job.job_id,printId);
  const print=await get("/api/local/v35/print-jobs?job_id="+printId,winnerToken);
  assert.equal(print.data.hardware_printed,false);
  assert.equal((await get("/api/local/v35/print-jobs?job_id="+printId,loserToken)).status,404);

  const final=await pool.query(
   "SELECT (SELECT count(*)::integer FROM zhirox_local.sales WHERE store_id=$1) AS sales, (SELECT count(*)::integer FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL) AS pending, (SELECT count(*)::integer FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1) AS receipts, (SELECT count(*)::integer FROM zhirox_local.print_requests_v35 WHERE store_id=$1) AS print_jobs, (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2) AS remaining",
   [store,item]);
  assert.equal(final.rows[0].sales,1);
  assert.equal(final.rows[0].pending,1,"WAN offline: sale remains durably queued for later upload");
  assert.equal(final.rows[0].receipts,1);
  assert.equal(final.rows[0].print_jobs,1);
  assert.equal(final.rows[0].remaining,"0");
  assert.equal((await post("/api/local/v37/shift/close",
    {shift_id:shiftA,counted_minor:aWins?3500:1000},tokenA)).status,200);
  assert.equal((await post("/api/local/v37/shift/close",
    {shift_id:shiftB,counted_minor:aWins?500:3000},tokenB)).status,200);
  assert.equal((await get("/api/local/v37/shift",tokenA)).data.shift,null);
  assert.equal((await get("/api/local/v37/shift",tokenB)).data.shift,null);
  console.log("V59 PASS: real disposable PostgreSQL, verified loopback TLS, 2 sessions/shifts, 1 last-stock winner, immutable receipt, idempotent queue, pending local outbox. NO_GO");
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await pool.end();
  await rm(dir,{recursive:true,force:true});
 }
});
