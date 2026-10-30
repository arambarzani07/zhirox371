// V66: real PostgreSQL 16 container restart + pg_dump / pg_restore integrity
// after V65's real HTTPS two-cashier lab. CI only: never production or actual PC.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {Pool} from "pg";
import {createServer as createHttpsServer,request as httpsRequest} from "node:https";
import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {createV33LanHandler,createV33ClientLimiter} from "../lan-gateway-v33.mjs";
import {createLocalShiftHandlerV37} from "../local-shifts-v37.mjs";

const SOURCE="zhirox_v59_ci_test",RESTORE="zhirox_v66_restore_ci_test";
const store="10000000-0000-0000-0000-000000000059";
const cashier="20000000-0000-0000-0000-000000000060";
const reqId="50000000-0000-0000-0000-000000000066";
const shiftId="40000000-0000-0000-0000-000000000066";
const jobId="60000000-0000-0000-0000-000000000066";
const proofSecret="v66-test-only-local-https-signed-session-secret-".repeat(2);
const bar="6260053183998";
const evidence=resolve(process.env.ZHIROX_V66_EVIDENCE_DIR||"market-lab-evidence");

if(process.env.ZHIROX_V66_ISOLATED_RECOVERY_TEST!=="true"||
   process.env.ZHIROX_V65_MARKET_DIGITAL_TWIN!=="true"||
   process.env.PGHOST!=="127.0.0.1"||
   process.env.PGUSER!=="localtest"||
   !process.env.PGPASSWORD||
   ![SOURCE,RESTORE].includes(process.env.PGDATABASE)||
   process.env.ZHIROX_RELEASE_MODE==="official")
 throw Error("V66 refuses non-disposable or real-store database");
const phase=process.argv[2];
if(!["before","after-restart","after-sale","restored"].includes(phase))
 throw Error("V66 expected one of before, after-restart, after-sale, restored");
if((phase==="restored")!==(process.env.PGDATABASE===RESTORE))
 throw Error("V66 phase/database mismatch");
const pool=new Pool({
 host:"127.0.0.1",port:5432,database:process.env.PGDATABASE,
 user:"localtest",password:process.env.PGPASSWORD,
 max:5,connectionTimeoutMillis:5000
});

async function readState(db){
 const q=async sql=>(await db.query(sql,[store])).rows;
 const state={
  sales:await q("SELECT request_id::text,receipt_no::text,total_minor::text,cashier_id::text FROM zhirox_local.sales WHERE store_id=$1 ORDER BY receipt_no"),
  receipts:await q("SELECT receipt_no::text,total_minor::text,sale_id::text,lines FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1 ORDER BY receipt_no"),
  products:await q("SELECT id::text,stock_base_units::text,price_minor::text FROM zhirox_local.products WHERE store_id=$1 ORDER BY id"),
  stock_ledger:await q("SELECT sale_id::text,product_id::text,delta_base_units::text FROM zhirox_local.stock_ledger WHERE store_id=$1 ORDER BY sale_id,product_id"),
  intents:await q("SELECT request_id::text,cashier_id::text,state,sale_id::text,total_minor::text FROM zhirox_local.checkout_intents_v31 WHERE store_id=$1 ORDER BY request_id"),
  shifts:await q("SELECT shift_id::text,cashier_id::text,state,opening_minor::text,counted_minor::text,expected_minor::text FROM zhirox_local.cash_shifts_v37 WHERE store_id=$1 ORDER BY shift_id"),
  pending_events:await q("SELECT event_id::text,aggregate_id::text,event_type,attempt_count FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL ORDER BY event_id"),
  print_jobs:await q("SELECT job_id::text,sale_id::text,width_mm,state FROM zhirox_local.print_requests_v35 WHERE store_id=$1 ORDER BY job_id"),
  account_roles:await q("SELECT id::text,role,enabled,session_version FROM zhirox_local.local_users WHERE store_id=$1 ORDER BY id"),
 };
 return state;
}
function summary(s){
 return Object.fromEntries(["sales","receipts","products","stock_ledger","intents","shifts","pending_events","print_jobs"].map(k=>[k,s[k].length]));
}
function fingerprint(s){return createHash("sha256").update(JSON.stringify(s)).digest("hex");}
async function put(name,obj){await mkdir(evidence,{recursive:true});await writeFile(join(evidence,name),JSON.stringify(obj,null,2)+"\n","utf8");}
async function read(name){return JSON.parse(await readFile(join(evidence,name),"utf8"));}
function ensureExpected(s,expected){
 assert.equal(s.sales.length,expected,"exact genuine sale count");
 assert.equal(s.receipts.length,expected,"immutable receipt count equals sales");
 assert.equal(s.pending_events.length,expected,"WAN absent => pending offline events");
 assert.equal(s.print_jobs.length,expected,"queued paper jobs cannot claim hardware printing");
 for(const receipt of s.receipts){
  assert.ok(Array.isArray(receipt.lines)&&receipt.lines.length>0);
  assert.equal(receipt.lines.reduce((sum,row)=>sum+BigInt(row.line_total_minor),0n),BigInt(receipt.total_minor));
 }
 const prices=s.sales.map(x=>Number(x.total_minor)).sort((a,b)=>a-b);
 assert.deepEqual(prices,expected===2?[2500,11780]:[400,2500,11780]);
 assert.ok(s.print_jobs.every(x=>x.state==="queued"),"physical printer was NEVER attached");
 assert.ok(s.shifts.every(x=>x.state==="closed"),"no unfinished cashier shift after test");
 const product=id=>s.products.find(p=>p.id===id)?.stock_base_units;
 assert.equal(product("30000000-0000-0000-0000-000000000059"),"0");
 assert.equal(product("30000000-0000-0000-0000-000000000061"),"16");
 assert.equal(product("30000000-0000-0000-0000-000000000062"),"1520");
 assert.equal(product("30000000-0000-0000-0000-000000000060"),expected===2?"3":"2");
}
async function post({port,cert,path,body,token}){
 const raw=JSON.stringify(body);
 return await new Promise((yes,no)=>{
  const headers={"Content-Type":"application/json","Content-Length":Buffer.byteLength(raw)};
  if(token)headers.Authorization="Bearer "+token;
  const req=httpsRequest({host:"127.0.0.1",port,path,method:"POST",headers,ca:cert,
    rejectUnauthorized:true,timeout:10000},res=>{
   let data="";res.setEncoding("utf8");res.on("data",x=>data+=x);
   res.once("end",()=>{try{yes({status:res.statusCode,data:JSON.parse(data)});}catch(e){no(e);}});
  });
  req.once("error",no);req.once("timeout",()=>req.destroy(Error("V66_TLS_TIMEOUT")));
  req.end(raw);
 });
}
async function runAfterPostgresRestart(){
 const runtime=new Pool({
  host:"127.0.0.1",port:5432,database:SOURCE,user:"zhirox_v60_api_ci",
  password:process.env.ZHIROX_V60_CI_DB_PASSWORD,
  connectionTimeoutMillis:5000,max:5
 });
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v66-"));
 let server;
 try{
  const certPath=join(dir,"cert.pem"),keyPath=join(dir,"key.pem");
  execFileSync("openssl",["req","-x509","-nodes","-newkey","rsa:2048",
   "-sha256","-days","1","-subj","/CN=localhost",
   "-addext","subjectAltName=IP:127.0.0.1,DNS:localhost",
   "-keyout",keyPath,"-out",certPath],{stdio:"ignore",timeout:15000});
  const [cert,key]=await Promise.all([readFile(certPath),readFile(keyPath)]);
  const localHandler=createLocalShiftHandlerV37({pool:runtime,secret:proofSecret});
  const handler=createV33LanHandler({pool:runtime,secret:proofSecret,
   peers:new Set(["127.0.0.1"]),localHandler,v64Protected:true,
   limiter:createV33ClientLimiter({limit:125})});
  server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},handler);
  await new Promise((yes,no)=>{server.once("error",no);server.listen(0,"127.0.0.1",yes);});
  const port=server.address().port,request=(path,body,token)=>post({port,cert,path,body,token});
  const logged=await request("/api/local/v3/login",{
    store_id:store,username:"v59-cashier-b",password:"v59-SYNTHETIC-only-LOCAL-pass"
  });
  assert.equal(logged.status,200,"cashier login must work AFTER REAL PostgreSQL restart");
  const token=logged.data.token;
  assert.ok(token);
  assert.equal((await request("/api/local/v37/shift/open",{
    shift_id:shiftId,opening_minor:0},token)).status,200);
  const prepared=await request("/api/local/v31/prepare",{
    request_id:reqId,lines:[{barcode:bar,qty:1}],expected_total_minor:400},token);
  assert.equal(prepared.status,200,"prepare real cash sale after DB restart");
  const committed=await request("/api/local/v31/commit",{request_id:reqId},token);
  assert.equal(committed.status,200,"commit real SQL financial sale after DB restart");
  assert.equal(committed.data.receipt.total_minor,"400");
  const saleId=committed.data.receipt.sale_id;
  const replay=await request("/api/local/v31/commit",{request_id:reqId},token);
  assert.equal(replay.status,200);
  assert.equal(replay.data.receipt.replayed,true);
  assert.equal(replay.data.receipt.sale_id,saleId);
  const print=await request("/api/local/v35/print-jobs",{
    sale_id:saleId,job_id:jobId,width_mm:80},token);
  assert.equal(print.status,202);
  assert.equal(print.data.hardware_printed,false);
  assert.equal((await request("/api/local/v37/shift/close",{
    shift_id:shiftId,counted_minor:400},token)).status,200);
  return {post_restart_cashier_login:true,post_restart_cash_sale_iqd:"400",
    sale_id:saleId,idempotent_replay:true,print_queued_not_printed:true,
    shift_closed:true};
 }finally{
  if(server)await new Promise(yes=>server.close(yes));
  await runtime.end();await rm(dir,{recursive:true,force:true});
 }
}

try{
 const current=await readState(pool);
 if(phase==="before"){
  ensureExpected(current,2);
  const record={phase,db:SOURCE,summary:summary(current),sha256:fingerprint(current),data:current};
  await put("v66-before-db-restart.json",record);
  console.log("V66 BEFORE: "+record.sha256+" "+JSON.stringify(record.summary));
 }else if(phase==="after-restart"){
  ensureExpected(current,2);
  const before=await read("v66-before-db-restart.json");
  assert.deepEqual(current,before.data,"all financial/account/stock rows identical after real PostgreSQL container restart");
  const outcome=await runAfterPostgresRestart();
  const updated=await readState(pool);
  ensureExpected(updated,3);
  const record={phase:"post-restart-live-sale",db:SOURCE,
   summary:summary(updated),sha256:fingerprint(updated),outcome,data:updated};
  await put("v66-after-restart-and-sale.json",record);
  console.log("V66 RESTART+SALE PASS: "+record.sha256+" "+JSON.stringify(record.summary));
 }else if(phase==="after-sale"){
  ensureExpected(current,3);
  const expected=await read("v66-after-restart-and-sale.json");
  assert.deepEqual(current,expected.data,"all states remain stable prior to backup");
  console.log("V66 BACKUP PRECHECK PASS: "+fingerprint(current));
 }else{
  ensureExpected(current,3);
  const expected=await read("v66-after-restart-and-sale.json");
  assert.deepEqual(current,expected.data,"pg_dump/pg_restore recovered exact committed financial and stock states");
  const runtime=new Pool({host:"127.0.0.1",database:RESTORE,port:5432,
    user:"zhirox_v60_api_ci",password:process.env.ZHIROX_V60_CI_DB_PASSWORD,
    connectionTimeoutMillis:5000});
  try{
   const acl=(await runtime.query(
    "SELECT has_table_privilege(current_user,'zhirox_local.sales','INSERT') AS forge_sale, has_table_privilege(current_user,'zhirox_local.products','UPDATE') AS forge_stock, has_function_privilege(current_user,'zhirox_local.prepare_checkout_v31(uuid,uuid,uuid,jsonb,bigint)','EXECUTE') AS bypass_intent"
   )).rows[0];
   assert.deepEqual(acl,{forge_sale:false,forge_stock:false,bypass_intent:false},
     "PostgreSQL restore MUST preserve network-facing SQL permissions");
  }finally{await runtime.end();}
  const report={name:"ZHIROX V66 supervised disposable recovery acceptance",
   physical_hardware:false,db_restart:"REAL PostgreSQL 16 GitHub container restart",
   backup:"REAL pg_dump -Fc, restore to independent disposable DB",
   source_db:SOURCE,restored_db:RESTORE,sha256:fingerprint(current),
   exact_financial_stock_match:true,
   restored_restricted_sql_permissions:true,
   real_post_restart_sale_iqd:"400",two_older_sales_preserved:true,
   offline_pending_events:current.pending_events.length,
   queued_paper_jobs_not_hardware_printed:current.print_jobs.length,
   summary:summary(current),go_live:"NO_GO",
   exclusions:["on-prem Windows PC","actual LAN switch disconnect",
    "physical POS printer","forced power cutoff","Supabase sync upload","backup encryption at rest"]};
  await put("v66-final-recovery-report.json",report);
  console.log("V66 VERIFIED RESTORE PASS: "+JSON.stringify(report));
 }
}finally{await pool.end();}
