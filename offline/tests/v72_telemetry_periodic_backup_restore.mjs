// V72 — 75-second bounded REAL HTTPS PostgreSQL read workload, CPU/RAM,
// three timed pg_dump snapshots and independently verified real pg_restore.
// Disposable GitHub lab only. NEVER a Windows or physical-market certification.
import assert from "node:assert/strict";
import {Pool} from "pg";
import {createServer as createHttpsServer,request as httpsRequest} from "node:https";
import {execFileSync} from "node:child_process";
import {promisify} from "node:util";
import {execFile} from "node:child_process";
import {mkdtemp,readFile,writeFile,mkdir,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {createV33LanHandler,createV33ClientLimiter} from "../lan-gateway-v33.mjs";
import {createLocalShiftHandlerV37} from "../local-shifts-v37.mjs";

const SOURCE="zhirox_v59_ci_test",RESTORE="zhirox_v72_restore_ci_test";
const store="10000000-0000-0000-0000-000000000059";
const evidence=resolve(process.env.ZHIROX_V72_EVIDENCE_DIR||"market-lab-evidence");
const id=process.env.ZHIROX_V72_POSTGRES_CONTAINER;
if(process.env.ZHIROX_V72_BOUNDED_TELEMETRY_TEST!=="true"||
 process.env.ZHIROX_V71_CRASH_TEST!=="true"||
 process.env.ZHIROX_V63_DB_ACTOR_PROOF!=="true"||
 process.env.ZHIROX_V64_AUTH_GATE_ENABLED!=="true"||
 process.env.PGHOST!=="127.0.0.1"||
 process.env.PGPORT!=="5432"||
 process.env.PGDATABASE!==SOURCE||process.env.PGUSER!=="localtest"||
 !process.env.PGPASSWORD||
 process.env.ZHIROX_RELEASE_MODE==="official"||
 !/^[a-f0-9]{64}$/.test(id||"")||
 !process.env.RUNNER_TEMP||
 !process.env.ZHIROX_V60_CI_DB_PASSWORD)
 throw Error("V72: non-disposable DB, missing proof gates or unsafe container");
const runAsync=promisify(execFile);
const temp=await mkdtemp(join(tmpdir(),"zhirox-v72-"));
const pg={host:"127.0.0.1",port:5432,database:SOURCE,max:8,
 connectionTimeoutMillis:4500,statement_timeout:7500};
const owner=new Pool({...pg,user:"localtest",password:process.env.PGPASSWORD});
const restricted=new Pool({...pg,user:"zhirox_v60_api_ci",
 password:process.env.ZHIROX_V60_CI_DB_PASSWORD});
let server,port,cert;
const sha=data=>createHash("sha256").update(JSON.stringify(data)).digest("hex");
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function cp(cmd,args){
 return execFileSync(cmd,args,{encoding:"utf8",timeout:12000}).trim();
}
assert.equal(cp("docker",["inspect","--format","{{.Config.Image}}",id]),"postgres:16",
 "Never inspect or access any non-disposable PostgreSQL container");
const serverVersion=(await owner.query("SHOW server_version_num")).rows[0].server_version_num;
assert.ok(Number(serverVersion)>=160000&&Number(serverVersion)<170000);

const queries={
 sales:"SELECT request_id::text,receipt_no::text,total_minor::text,cashier_id::text FROM zhirox_local.sales WHERE store_id=$1 ORDER BY receipt_no",
 receipts:"SELECT receipt_no::text,sale_id::text,lines,total_minor::text FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1 ORDER BY receipt_no",
 products:"SELECT id::text,stock_base_units::text,price_minor::text FROM zhirox_local.products WHERE store_id=$1 ORDER BY id",
 stock_ledger:"SELECT sale_id::text,product_id::text,delta_base_units::text FROM zhirox_local.stock_ledger WHERE store_id=$1 ORDER BY sale_id,product_id",
 intents:"SELECT request_id::text,cashier_id::text,state,sale_id::text,total_minor::text FROM zhirox_local.checkout_intents_v31 WHERE store_id=$1 ORDER BY request_id",
 shifts:"SELECT shift_id::text,cashier_id::text,state,expected_minor::text,counted_minor::text FROM zhirox_local.cash_shifts_v37 WHERE store_id=$1 ORDER BY shift_id",
 outbox:"SELECT event_id::text,aggregate_id::text,delivered_at IS NOT NULL AS delivered,attempt_count FROM zhirox_local.event_outbox WHERE store_id=$1 ORDER BY event_id",
 prints:"SELECT job_id::text,sale_id::text,state,width_mm FROM zhirox_local.print_requests_v35 WHERE store_id=$1 ORDER BY job_id",
 printer_attempts:"SELECT job_id::text,state FROM zhirox_local.print_dispatch_attempts_v54 WHERE store_id=$1 ORDER BY job_id",
 roles:"SELECT id::text,role,enabled,session_version FROM zhirox_local.local_users WHERE store_id=$1 ORDER BY id"
};
async function readAll(pool){
 const result={};
 for(const [key,sql] of Object.entries(queries))result[key]=(await pool.query(sql,[store])).rows;
 return result;
}
function assertV71State(s){
 assert.equal(s.sales.length,112);
 assert.equal(s.receipts.length,112);
 assert.equal(s.prints.length,112);
 assert.equal(s.outbox.filter(x=>!x.delivered).length,109);
 assert.equal(s.shifts.filter(x=>x.state==="open").length,0);
 assert.equal(s.printer_attempts.length,1);
 assert.equal(s.printer_attempts[0].state,"manual_review");
 assert.equal(s.prints.filter(x=>x.state==="queued").length,111);
 assert.equal(s.prints.filter(x=>x.state==="claimed").length,1);
 assert.equal(s.products.find(p=>p.id==="30000000-0000-0000-0000-000000000070")?.stock_base_units,"49");
 assert.equal(s.sales.reduce((sum,x)=>sum+BigInt(x.total_minor),0n),112230n);
}
const before=await readAll(owner);
assertV71State(before);
const initialHash=sha(before);
const workKey="v72-telemetry-HTTPS-local-only-session-secret-".repeat(2);

async function send(method,path,body,token){
 const started=performance.now();
 const raw=body===undefined?undefined:JSON.stringify(body);
 const value=await new Promise((done,fail)=>{
  const headers={Accept:"application/json"};
  if(raw!==undefined){
   headers["Content-Type"]="application/json";headers["Content-Length"]=Buffer.byteLength(raw);
  }
  if(token)headers.Authorization="Bearer "+token;
  const req=httpsRequest({hostname:"127.0.0.1",port,method,path,ca:cert,
    rejectUnauthorized:true,timeout:5000,headers},res=>{
   let data="";res.setEncoding("utf8");res.on("data",v=>data+=v);
   res.on("end",()=>{
    try{done({status:res.statusCode,data:JSON.parse(data)});}catch(e){fail(e);}
   });
  });
  req.once("error",fail);
  req.once("timeout",()=>req.destroy(Error("v72_https_timeout")));
  if(raw!==undefined)req.write(raw);req.end();
 });
 return {...value,latency_ms:+(performance.now()-started).toFixed(2)};
}
async function takeResources(tick){
 const output=cp("docker",["stats","--no-stream","--format","{{json .}}",id]);
 const rows=output.trim().split("\n");
 assert.equal(rows.length,1);
 const parsed=JSON.parse(rows[0]);
 const cpu=Number(String(parsed.CPUPerc).replace("%",""));
 const memoryText=String(parsed.MemUsage);
 const match=/^\s*([\d.]+)\s*(B|KiB|MiB|GiB)\s*\//i.exec(memoryText);
 assert.ok(match,"Docker must expose real PostgreSQL memory usage");
 const toMiB={B:1/1048576,KiB:1/1024,MiB:1,GiB:1024};
 const usageMiB=Number(match[1])*toMiB[match[2]];
 assert.ok(Number.isFinite(cpu)&&cpu>=0);
 assert.ok(Number.isFinite(usageMiB)&&usageMiB>0);
 const dbstats=(await owner.query(
  "SELECT numbackends,xact_commit,xact_rollback,blks_read,blks_hit,deadlocks FROM pg_stat_database WHERE datname=current_database()"
 )).rows[0];
 const active=(await owner.query(
  "SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database()"
 )).rows[0].n;
 return {tick,cpu_percent:cpu,used_memory_mib:+usageMiB.toFixed(2),
  active_connections:active,db_counters:Object.fromEntries(Object.entries(dbstats).map(([k,v])=>[k,String(v)]))};
}
async function backup(tick){
 assert.ok([0,25,50].includes(tick));
 const filename=join(temp,"zhirox-v72-"+tick+".dump");
 const {stderr}=await runAsync("pg_dump",[
  "--format=custom","--no-password","--file",filename
 ],{env:{...process.env,PGDATABASE:SOURCE},timeout:30000,maxBuffer:2048*1024});
 assert.equal(stderr.trim(),"");
 const file=await readFile(filename);
 assert.ok(file.byteLength>2000);
 assert.equal(file.subarray(0,5).toString("ascii"),"PGDMP");
 const backupHash=createHash("sha256").update(file).digest("hex");
 const listing=await runAsync("pg_restore",["--list",filename],
  {timeout:20000,maxBuffer:2048*1024});
 assert.ok(listing.stdout.includes("zhirox_local"));
 return {tick,filename,file_bytes:file.length,sha256:backupHash,
  path_is_private:true,authentic_pg_dump_format:"PGDMP"};
}
const startedAt=performance.now();
try{
 const certFile=join(temp,"local-cert.pem"),keyFile=join(temp,"local-key.pem");
 execFileSync("openssl",["req","-x509","-nodes","-newkey","rsa:2048","-sha256",
  "-days","1","-subj","/CN=localhost",
  "-addext","subjectAltName=IP:127.0.0.1,DNS:localhost",
  "-keyout",keyFile,"-out",certFile],{timeout:15000,stdio:"ignore"});
 const key=await readFile(keyFile);cert=await readFile(certFile);
 const local=createLocalShiftHandlerV37({pool:restricted,secret:workKey});
 const gateway=createV33LanHandler({pool:restricted,secret:workKey,
  peers:new Set(["127.0.0.1"]),localHandler:local,v64Protected:true,
  limiter:createV33ClientLimiter({limit:2000})});
 server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},gateway);
 await new Promise((done,fail)=>{
  server.once("error",fail);
  server.listen(0,"127.0.0.1",done);
 });
 port=server.address().port;
 const tokens=[];
 for(let n=1;n<=5;n++){
  const r=await send("POST","/api/local/v3/login",{
   store_id:store,username:"v68-cashier-"+n,
   password:"V68_SYNTHETIC_cashier_credential_only"
  });
  assert.equal(r.status,200);
  assert.ok(r.data.token);
  tokens.push(r.data.token);
 }
 assert.equal(new Set(tokens).size,5);
 const durations=[],metrics=[],archives=[];
 const endTick=75;
 for(let tick=0;tick<endTick;tick++){
  const target=startedAt+tick*1000;
  if(target>performance.now())await pause(target-performance.now());
  const requests=Promise.all(tokens.map((token,idx)=>
   send("GET","/api/local/v32/receipts?limit=20",undefined,token)
    .then(r=>{assert.equal(r.status,200,"live SQL receipt query failed");
      assert.ok(Array.isArray(r.data.receipts)&&r.data.receipts.length>0);
      durations.push({station:idx+1,second:tick,ms:r.latency_ms});
    })));
  const dump=[0,25,50].includes(tick)?backup(tick):Promise.resolve(null);
  const [_,archive]=await Promise.all([requests,dump]);
  if(archive)archives.push(archive);
  if([0,15,30,45,60,74].includes(tick))metrics.push(await takeResources(tick));
 }
 assert.equal(durations.length,375);
 assert.equal(metrics.length,6);
 assert.equal(archives.length,3);
 const after=await readAll(owner);
 assertV71State(after);
 assert.deepEqual(after,before,"HTTPS read workload and three backups MUST NOT mutate financial data");
 assert.equal(sha(after),initialHash);

 // Restore LAST genuine scheduled backup, not the V66 backup. Same disposable
 // shared PG16 service, separate newly-created database. No production access.
 const restored=await owner.query(
  "SELECT count(*)::integer AS n FROM pg_database WHERE datname=$1",[RESTORE]);
 assert.equal(restored.rows[0].n,0);
 await runAsync("createdb",["--template=template0",RESTORE],
  {env:{...process.env,PGDATABASE:"postgres"},timeout:20000});
 await runAsync("pg_restore",["--exit-on-error","--dbname",RESTORE,
  archives[2].filename],{timeout:50000,maxBuffer:2048*1024});
 const restore=new Pool({...pg,database:RESTORE,user:"localtest",
  password:process.env.PGPASSWORD});
 try{
  const restoredData=await readAll(restore);
  assertV71State(restoredData);
  assert.deepEqual(restoredData,before,
   "last automated database backup must restore EXACT 112 sales and all finance/stock states");
  assert.equal(sha(restoredData),initialHash);
 }finally{await restore.end();}
 const restrictedRestore=new Pool({...pg,database:RESTORE,
  user:"zhirox_v60_api_ci",password:process.env.ZHIROX_V60_CI_DB_PASSWORD});
 try{
  const permissions=(await restrictedRestore.query(
   "SELECT has_table_privilege(current_user,'zhirox_local.sales','INSERT') AS forge_sale, has_table_privilege(current_user,'zhirox_local.products','UPDATE') AS forge_stock"
  )).rows[0];
  assert.deepEqual(permissions,{forge_sale:false,forge_stock:false});
 }finally{await restrictedRestore.end();}
 const sorted=durations.map(x=>x.ms).sort((a,b)=>a-b);
 const percentile=p=>sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];
 const elapsedSeconds=(performance.now()-startedAt)/1000;
 assert.ok(elapsedSeconds>=74);
 const report={
  name:"V72 exact live telemetry + recurring backup and restore in disposable lab",
  acceptance:"PASS",release:"NO_GO",actual_disposable_postgresql16:true,
  continuous_runtime_seconds:+elapsedSeconds.toFixed(2),
  independent_cashier_identity_count:5,
  true_https_receipt_requests:durations.length,
  failed_https_receipt_requests:0,
  latency_ms:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),
   max:sorted.at(-1)},
  sample_count:metrics.length,resource_metrics:metrics,
  max_cpu_percent:Math.max(...metrics.map(x=>x.cpu_percent)),
  max_memory_mib:Math.max(...metrics.map(x=>x.used_memory_mib)),
  scheduled_backup_tick_seconds:archives.map(x=>x.tick),
  scheduled_backup_archive_checksums:archives.map(({tick,file_bytes,sha256,path_is_private})=>({tick,file_bytes,sha256,path_is_private})),
  real_pg_restore_to_separate_disposable_db:true,
  restored_financial_inventory_users_outbox_exact_sha256:initialHash,
  restored_restricted_sql_role_privileges:true,
  saved_sales:after.sales.length,saved_receipts:after.receipts.length,
  pending_cloud_outbox:after.outbox.filter(x=>!x.delivered).length,
  print_manual_review:after.printer_attempts.length,
  real_printer_tested:false,
  physical_market_tested:false,
  caveats:["bounded 75-second read workload, NOT overnight 24-hour soak",
   "only read-only cashier API under workload; checkout throughput previously covered V70",
   "CPU and memory are six point-in-time Docker container samples",
   "backups are genuine disposable pg_dump -Fc files not uploaded, encrypted, externally replicated or deployed",
   "backup snapshots run at seconds 0,25,50 only during a single CI test run, NOT a scheduled ongoing market service",
   "not five physical Windows terminals, real power loss, physical printer or actual internet WAN"]
 };
 await mkdir(evidence,{recursive:true});
 await writeFile(join(evidence,"v72-live-telemetry-autobackup-restore-evidence.json"),
  JSON.stringify(report,null,2)+"\n","utf8");
 console.log("V72 PASS "+JSON.stringify(report));
}finally{
 if(server)await new Promise(done=>server.close(done));
 await Promise.allSettled([owner.end(),restricted.end()]);
 await rm(temp,{recursive:true,force:true});
}
