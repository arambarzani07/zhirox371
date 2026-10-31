// V71: genuinely terminate disposable PostgreSQL 16 process (Docker SIGKILL),
// restart the SAME data directory, preserve a prepared cash checkout AND fence
// an ambiguous printer-spool claim for manual review. No actual hardware.
import assert from "node:assert/strict";
import {Pool} from "pg";
import {request as httpsRequest,createServer as createHttpsServer} from "node:https";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp,readFile,writeFile,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createV33LanHandler,createV33ClientLimiter} from "../lan-gateway-v33.mjs";
import {createLocalShiftHandlerV37} from "../local-shifts-v37.mjs";
import {validateV54Job} from "../windows-print-dispatch-v54.mjs";

const store="10000000-0000-0000-0000-000000000059";
const reqId="50000000-0000-0000-0000-000000000711";
const shift="40000000-0000-0000-0000-000000000711";
const printId="60000000-0000-0000-0000-000000000711";
const secret="v71-disposable-local-only-gateway-secret-".repeat(2);
const evidence=resolve(process.env.ZHIROX_V71_EVIDENCE_DIR||"market-lab-evidence");
const containerId=process.env.ZHIROX_V71_POSTGRES_CONTAINER;
if(process.env.ZHIROX_V71_CRASH_TEST!=="true"||
 process.env.ZHIROX_V70_SOAK_ENABLED!=="true"||
 process.env.ZHIROX_V63_DB_ACTOR_PROOF!=="true"||
 process.env.ZHIROX_V64_AUTH_GATE_ENABLED!=="true"||
 process.env.PGHOST!=="127.0.0.1"||process.env.PGPORT!=="5432"||
 process.env.PGUSER!=="localtest"||
 process.env.PGDATABASE!=="zhirox_v59_ci_test"||
 !process.env.PGPASSWORD||
 process.env.ZHIROX_RELEASE_MODE==="official"||
 typeof containerId!=="string"||!/^[a-f0-9]{64}$/.test(containerId))
 throw Error("V71 refuses non-disposable or unspecified PostgreSQL container");

const pgConn={host:"127.0.0.1",port:5432,database:"zhirox_v59_ci_test",
 connectionTimeoutMillis:3500,statement_timeout:6500,max:4};
const dba=new Pool({...pgConn,user:"localtest",password:process.env.PGPASSWORD});
const api=new Pool({...pgConn,user:"zhirox_v60_api_ci",
 password:process.env.ZHIROX_V60_CI_DB_PASSWORD});
let server,cert,port,killOccurred=false,startOccurred=false;
dba.on("error",()=>{});api.on("error",()=>{});
const dir=await mkdtemp(join(tmpdir(),"v71-crash-lab-"));
const q=async sql=>(await dba.query(sql,[store])).rows;
const snapshot=async()=>{
 const statements={
  sales:"SELECT request_id::text,receipt_no::text,total_minor::text FROM zhirox_local.sales WHERE store_id=$1 ORDER BY receipt_no",
  receipts:"SELECT receipt_no::text,lines,total_minor::text FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1 ORDER BY receipt_no",
  stock:"SELECT id::text,stock_base_units::text FROM zhirox_local.products WHERE store_id=$1 ORDER BY id",
  ledger:"SELECT sale_id::text,product_id::text,delta_base_units::text FROM zhirox_local.stock_ledger WHERE store_id=$1 ORDER BY sale_id,product_id",
  intents:"SELECT request_id::text,cashier_id::text,state,sale_id::text,total_minor::text FROM zhirox_local.checkout_intents_v31 WHERE store_id=$1 ORDER BY request_id",
  prints:"SELECT job_id::text,sale_id::text,state,width_mm FROM zhirox_local.print_requests_v35 WHERE store_id=$1 ORDER BY job_id",
  print_attempts:"SELECT job_id::text,state FROM zhirox_local.print_dispatch_attempts_v54 WHERE store_id=$1 ORDER BY job_id",
  outbox:"SELECT event_id::text,delivered_at IS NOT NULL AS acked,attempt_count FROM zhirox_local.event_outbox WHERE store_id=$1 ORDER BY event_id",
  shifts:"SELECT shift_id::text,state,expected_minor::text,counted_minor::text FROM zhirox_local.cash_shifts_v37 WHERE store_id=$1 ORDER BY shift_id"
 };
 const data={};
 for(const [key,sql] of Object.entries(statements))data[key]=await q(sql);
 return data;
};
const sha=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
async function http(method,path,body,token){
 const payload=body===undefined?undefined:JSON.stringify(body);
 return await new Promise((resolve,reject)=>{
  const headers={Accept:"application/json"};
  if(payload!==undefined){
   headers["Content-Type"]="application/json";
   headers["Content-Length"]=Buffer.byteLength(payload);
  }
  if(token)headers.Authorization="Bearer "+token;
  const req=httpsRequest({hostname:"127.0.0.1",port,path,method,
    ca:cert,rejectUnauthorized:true,timeout:5500,headers},res=>{
   let raw="";res.setEncoding("utf8");res.on("data",x=>raw+=x);
   res.on("end",()=>{try{resolve({status:res.statusCode,data:JSON.parse(raw)});}catch(e){reject(e);}});
  });
  req.once("error",reject);req.once("timeout",()=>req.destroy(Error("v71_https_timeout")));
  if(payload!==undefined)req.write(payload);
  req.end();
 });
}
const post=(path,body,token)=>http("POST",path,body,token);
const get=(path,token)=>http("GET",path,undefined,token);
function docker(...args){
 return execFileSync("docker",args,{encoding:"utf8",timeout:20000}).trim();
}
try{
 const [first]=await q(
  "SELECT count(*)::integer AS n FROM zhirox_local.sales WHERE store_id=$1");
 assert.equal(first.n,111,"must follow exact real V70 completed 100-sales CI");
 assert.equal((await q("SELECT count(*)::integer AS n FROM zhirox_local.print_requests_v35 WHERE store_id=$1 AND state='queued'"))[0].n,111);
 assert.equal((await q("SELECT count(*)::integer AS n FROM zhirox_local.cash_shifts_v37 WHERE store_id=$1 AND state='open'"))[0].n,0);
 assert.equal((await q("SELECT stock_base_units::text AS n FROM zhirox_local.products WHERE store_id=$1 AND id='30000000-0000-0000-0000-000000000070'"))[0].n,"50");
 assert.equal(docker("inspect","--format","{{.Config.Image}}",containerId),"postgres:16",
  "only the disposable postgres:16 image may be interrupted");
 // Genuine HTTPS gateway held open for the entire PostgreSQL kill/restart.
 const certPath=join(dir,"cert.pem"),keyPath=join(dir,"key.pem");
 execFileSync("openssl",["req","-x509","-nodes","-newkey","rsa:2048",
  "-sha256","-days","1","-subj","/CN=localhost",
  "-addext","subjectAltName=IP:127.0.0.1,DNS:localhost",
  "-keyout",keyPath,"-out",certPath],{stdio:"ignore",timeout:15000});
 const key=await readFile(keyPath);cert=await readFile(certPath);
 const local=createLocalShiftHandlerV37({pool:api,secret});
 const handler=createV33LanHandler({pool:api,secret,
  peers:new Set(["127.0.0.1"]),localHandler:local,
  v64Protected:true,limiter:createV33ClientLimiter({limit:200})});
 server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},handler);
 await new Promise((yes,no)=>{server.once("error",no);server.listen(0,"127.0.0.1",yes);});
 port=server.address().port;

 const login=await post("/api/local/v3/login",{
  store_id:store,username:"v68-cashier-1",password:"V68_SYNTHETIC_cashier_credential_only"
 });
 assert.equal(login.status,200);
 const token=login.data.token;
 assert.ok(token);
 assert.equal((await post("/api/local/v37/shift/open",
  {shift_id:shift,opening_minor:0},token)).status,200);
 const prepared=await post("/api/local/v31/prepare",{
  request_id:reqId,lines:[{barcode:"V70SOAKUNIT",qty:1}],expected_total_minor:750
 },token);
 assert.equal(prepared.status,200);
 assert.equal(prepared.data.intent.state,"prepared");
 assert.equal((await get("/api/local/v31/recover",token)).data.intent.request_id,reqId);

 // Simulate an ambiguous spooler crash AFTER transactional print claim.
 // Do not submit to any physical printer and NEVER silently replay the claim.
 const selected=(await q(
  "SELECT job_id::text,sale_id::text FROM zhirox_local.print_requests_v35 WHERE store_id=$1 AND state='queued' ORDER BY job_id DESC LIMIT 1"))[0];
 assert.ok(selected?.job_id);
 const claimed=(await dba.query(
  "SELECT * FROM zhirox_local.claim_print_dispatch_v54($1::uuid,$2::uuid)",
  [store,selected.job_id])).rows;
 assert.equal(claimed.length,1);
 const validated=validateV54Job(claimed[0]);
 assert.ok([58,80].includes(validated.paper_width_mm));
 assert.equal((await q(
  "SELECT count(*)::integer AS n FROM zhirox_local.print_dispatch_attempts_v54 WHERE store_id=$1 AND state='claimed'"))[0].n,1);
 const before=await snapshot();
 const checksum=sha(before);
 assert.equal(before.sales.length,111);
 assert.equal(before.print_attempts.length,1);
 assert.equal(before.intents.find(x=>x.request_id===reqId)?.state,"prepared");
 assert.equal(before.prints.find(x=>x.job_id===selected.job_id)?.state,"claimed");

 // TRUE SIGKILL (non-graceful) of ONLY the ephemeral postgres:16 container.
 // GitHub runner remains alive; the Node HTTPS gateway stays bound to its port.
 const time=Date.now();
 const killed=docker("kill","--signal=KILL",containerId);
 assert.equal(killed,containerId);
 killOccurred=true;
 assert.equal(docker("inspect","--format","{{.State.Running}}",containerId),"false");
 const unhealthy=await get("/api/local/v31/recover",token);
 assert.ok([401,503].includes(unhealthy.status),
  "DB down MUST deny financial recovery, never pretend successful checkout");
 assert.equal((await get("/v33/health")).status,200,
  "HTTPS listener health is not evidence of DB readiness; actual DB financial routes must fail closed");
 assert.equal(docker("start",containerId),containerId);
 startOccurred=true;
 let ready=false;
 for(let retry=0;retry<45;retry++){
  try{
   const status=execFileSync("pg_isready",["-h","127.0.0.1","-p","5432",
    "-U","localtest","-d","zhirox_v59_ci_test"],
    {timeout:1500,encoding:"utf8"});
   if(status.includes("accepting connections")){ready=true;break;}
  }catch{}
  await new Promise(res=>setTimeout(res,700));
 }
 assert.equal(ready,true,"PostgreSQL must successfully perform actual WAL crash recovery");
 const after=await snapshot();
 assert.equal(sha(after),checksum,"every original sale, receipt, stock, intent, print claim and outbox unchanged across SIGKILL");
 assert.deepEqual(after,before);
 const recovered=await get("/api/local/v31/recover",token);
 assert.equal(recovered.status,200);
 assert.equal(recovered.data.intent?.request_id,reqId);
 assert.equal(recovered.data.intent?.state,"prepared");
 const commit=await post("/api/local/v31/commit",{request_id:reqId},token);
 assert.equal(commit.status,200);
 assert.equal(commit.data.receipt.total_minor,"750");
 const replay=await post("/api/local/v31/commit",{request_id:reqId},token);
 assert.equal(replay.status,200);
 assert.equal(replay.data.receipt.replayed,true);
 assert.equal(replay.data.receipt.sale_id,commit.data.receipt.sale_id);
 const print=await post("/api/local/v35/print-jobs",{
  sale_id:commit.data.receipt.sale_id,job_id:printId,width_mm:80
 },token);
 assert.equal(print.status,202);
 assert.equal(print.data.hardware_printed,false);
 const closed=await post("/api/local/v37/shift/close",{
  shift_id:shift,counted_minor:750
 },token);
 assert.equal(closed.status,200);
 assert.equal(String(closed.data.shift.variance_minor),"0");

 // A crashed spooler leaves an irrecoverably ambiguous 'claimed' attempt.
 // Test existing fenced recovery protocol: NEVER send a second print implicitly.
 await assert.rejects(
  dba.query("SELECT * FROM zhirox_local.claim_print_dispatch_v54($1::uuid,$2::uuid)",
   [store,selected.job_id]),err=>err?.code==="P5401");
 const finished=await dba.query(
  "SELECT zhirox_local.finish_print_dispatch_v54($1::uuid,$2::uuid,'manual_review') AS ok",
  [store,selected.job_id]);
 assert.equal(finished.rows[0]?.ok,true);
 const secondFinish=await dba.query(
  "SELECT zhirox_local.finish_print_dispatch_v54($1::uuid,$2::uuid,'submitted_to_windows') AS ok",
  [store,selected.job_id]);
 assert.equal(secondFinish.rows[0]?.ok,false,
  "manual-review jobs cannot later be silently marked submitted");
 const printState=await dba.query(
  "SELECT pr.state AS queue_state,att.state AS dispatch_state FROM zhirox_local.print_requests_v35 pr JOIN zhirox_local.print_dispatch_attempts_v54 att USING(store_id,job_id) WHERE pr.store_id=$1 AND pr.job_id=$2",
  [store,selected.job_id]);
 assert.deepEqual(printState.rows,[{queue_state:"claimed",dispatch_state:"manual_review"}]);

 const summary=(await dba.query(
  "SELECT (SELECT count(*)::integer FROM zhirox_local.sales WHERE store_id=$1) AS sales, (SELECT coalesce(sum(total_minor),0)::bigint FROM zhirox_local.sales WHERE store_id=$1) AS amount, (SELECT count(*)::integer FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1) AS receipts, (SELECT count(*)::integer FROM zhirox_local.print_requests_v35 WHERE store_id=$1) AS print_jobs, (SELECT count(*)::integer FROM zhirox_local.print_requests_v35 WHERE store_id=$1 AND state='queued') AS queued, (SELECT count(*)::integer FROM zhirox_local.print_requests_v35 WHERE store_id=$1 AND state='claimed') AS print_ambiguous, (SELECT count(*)::integer FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL) AS pending, (SELECT count(*)::integer FROM zhirox_local.cash_shifts_v37 WHERE store_id=$1 AND state='open') AS open_shifts, (SELECT stock_base_units::text FROM zhirox_local.products WHERE store_id=$1 AND id='30000000-0000-0000-0000-000000000070') AS sku70_remaining",
  [store])).rows[0];
 assert.deepEqual(summary,{sales:112,amount:"112230",receipts:112,print_jobs:112,
  queued:111,print_ambiguous:1,pending:109,open_shifts:0,sku70_remaining:"49"});
 const remote=new Pool({...pgConn,user:"localtest",password:process.env.PGPASSWORD,
  database:"zhirox_v67_receiver_ci_test"});
 try{
  assert.equal((await remote.query(
   "SELECT count(*)::integer AS n FROM zhirox_cloud_v28.received_sales WHERE store_id=$1",[store]
  )).rows[0].n,3,"no cloud dependency for local recovery");
 }finally{await remote.end();}
 const report={
  lab:"ZHIROX V71 non-graceful PostgreSQL WAL recovery and print fencing",
  postgres:"genuine docker kill --signal KILL, then docker start of same disposable PostgreSQL 16 data",
  no_physical_power_cut:true,
  precrash_immutable_snapshot_sha256:checksum,
  postcrash_identical_rows:true,
  killed_postgres_process:true,postgres_crash_recovered:true,
  https_listener_remained_running:true,
  financial_api_failed_closed_while_postgres_down:true,
  prepared_intent_survived:true,commit_once_after_recovery:true,
  receipt_replay_verified:true,
  print_worker_emulated_not_hardware:true,
  ambiguous_print_fenced_manual_review:true,
  repeat_print_claim_rejected:true,
  hardware_printed:false,
  elapsed_downtime_ms:Date.now()-time,
  totals:summary,
  release:"NO_GO",
  NOT_TESTED:["physical UPS/mains power cut","real thermal printer and paper",
   "Windows Print Spooler process crash","Windows POS terminals","24-hour stress test",
   "production PostgreSQL WAL disk failure","physical switch/cable","cloud Supabase"]
 };
 await mkdir(evidence,{recursive:true});
 await writeFile(join(evidence,"v71-postgres-sigkill-recovery-and-print-fence.json"),
  JSON.stringify(report,null,2)+"\n","utf8");
 console.log("V71 PASS "+JSON.stringify(report));
}finally{
 if(killOccurred&&!startOccurred){
  try{docker("start",containerId)}catch{}
 }
 if(server)await new Promise(yes=>server.close(()=>yes()));
 await Promise.allSettled([dba.end(),api.end()]);
 await rm(dir,{recursive:true,force:true});
}
