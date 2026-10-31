// V68: 5 independent HTTPS cashier sessions, concurrent last-stock race,
// simulated LAN gateway interruption and recovery of durably prepared checkout.
// Real PostgreSQL 16 and TLS on loopback only. NO actual LAN cable/Windows POS.
import assert from "node:assert/strict";
import {Pool} from "pg";
import {createServer as createHttpsServer,request as httpsRequest} from "node:https";
import {mkdtemp,readFile,rm,mkdir,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {hashLocalPassword} from "../local-password.mjs";
import {createV33LanHandler,createV33ClientLimiter} from "../lan-gateway-v33.mjs";
import {createLocalShiftHandlerV37} from "../local-shifts-v37.mjs";

const store="10000000-0000-0000-0000-000000000059";
const db="zhirox_v59_ci_test",receiver="zhirox_v67_receiver_ci_test";
const productId="30000000-0000-0000-0000-000000000068";
const barcode="V68UNITBASKET";
const recoveryBarcode="6260053183998";
const password="V68_SYNTHETIC_cashier_credential_only";
const sessionSecret="v68-local-proof-bound-https-test-secret-".repeat(2);
const evidence=resolve(process.env.ZHIROX_V68_EVIDENCE_DIR||"market-lab-evidence");
if(process.env.ZHIROX_V68_FIVE_CASHIER_LAB!=="true"||
  process.env.ZHIROX_V65_MARKET_DIGITAL_TWIN!=="true"||
  process.env.ZHIROX_V63_DB_ACTOR_PROOF!=="true"||
  process.env.ZHIROX_V64_AUTH_GATE_ENABLED!=="true"||
  process.env.PGHOST!=="127.0.0.1"||
  process.env.PGDATABASE!==db||
  process.env.PGUSER!=="localtest"||
  !process.env.PGPASSWORD||
  process.env.ZHIROX_RELEASE_MODE==="official")
 throw Error("V68 refuses any non-disposable production context");

const dba=new Pool({host:"127.0.0.1",port:5432,user:"localtest",
 password:process.env.PGPASSWORD,database:db,max:8,connectionTimeoutMillis:5000});
const runtime=new Pool({host:"127.0.0.1",port:5432,
 user:"zhirox_v60_api_ci",password:process.env.ZHIROX_V60_CI_DB_PASSWORD,
 database:db,max:12,connectionTimeoutMillis:5000});
const dir=await mkdtemp(join(tmpdir(),"zhirox-v68-"));
const uuidFrom=(prefix,n)=>prefix+String(n).padStart(12,"0");
const clients=Array.from({length:5},(_,i)=>({
 i:i+1,
 id:uuidFrom("20000000-0000-0000-0000-",68+i),
 shift:uuidFrom("40000000-0000-0000-0000-",68+i),
 request:uuidFrom("50000000-0000-0000-0000-",68+i),
 print:uuidFrom("60000000-0000-0000-0000-",68+i),
 username:"v68-cashier-"+(i+1)
}));
const recoveryRequest="50000000-0000-0000-0000-000000000080";
const recoveryPrint="60000000-0000-0000-0000-000000000080";
let server,port,cert,key;

async function jsonRequest(method,path,body,token){
 const payload=body===undefined?undefined:JSON.stringify(body);
 return await new Promise((resolve,reject)=>{
  const headers={"Accept":"application/json"};
  if(token)headers.Authorization="Bearer "+token;
  if(payload!==undefined){
   headers["Content-Type"]="application/json";
   headers["Content-Length"]=Buffer.byteLength(payload);
  }
  const req=httpsRequest({hostname:"127.0.0.1",port,method,path,
   headers,ca:cert,rejectUnauthorized:true,timeout:7000},res=>{
   let raw="";
   res.setEncoding("utf8");res.on("data",x=>raw+=x);
   res.on("end",()=>{
    try{resolve({status:res.statusCode,data:JSON.parse(raw)})}
    catch(e){reject(e)}
   });
  });
  req.once("error",reject);
  req.once("timeout",()=>req.destroy(Error("V68_HTTPS_TIMEOUT")));
  if(payload!==undefined)req.write(payload);
  req.end();
 });
}
const get=(path,token)=>jsonRequest("GET",path,undefined,token);
const post=(path,body,token)=>jsonRequest("POST",path,body,token);
async function startGateway(fixedPort=0){
 const localHandler=createLocalShiftHandlerV37({pool:runtime,secret:sessionSecret});
 const handler=createV33LanHandler({pool:runtime,secret:sessionSecret,
  peers:new Set(["127.0.0.1"]),localHandler,v64Protected:true,
  limiter:createV33ClientLimiter({limit:250})});
 server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},handler);
 await new Promise((yes,no)=>{
  server.once("error",no);
  server.listen(fixedPort,"127.0.0.1",()=>{server.off("error",no);yes();});
 });
 port=server.address().port;
}
async function stopGateway(){
 await new Promise((yes,no)=>server.close(e=>e?no(e):yes()));
 server=null;
}
async function count(query,args=[store]){
 return Number((await dba.query(query,args)).rows[0].n);
}
try{
 const baseline=await dba.query(
  "SELECT (SELECT count(*)::int FROM zhirox_local.sales WHERE store_id=$1) AS sales, (SELECT count(*)::int FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL) AS pending, (SELECT count(*)::int FROM zhirox_local.print_requests_v35 WHERE store_id=$1) AS jobs",[store]);
 assert.deepEqual(baseline.rows[0],{sales:3,pending:0,jobs:3},
  "V68 must reuse the exact verified V67 data and empty pending queue");
 const hash=await hashLocalPassword(password);
 const existing=await count(
  "SELECT count(*)::integer AS n FROM zhirox_local.local_users WHERE store_id=$1 AND username LIKE 'v68-cashier-%'");
 assert.equal(existing,0,"V68 may not duplicate artificial cashiers");
 const stale=await count(
  "SELECT count(*)::integer AS n FROM zhirox_local.products WHERE store_id=$1 AND id=$2",
  [store,productId]);
 assert.equal(stale,0,"V68 may not overwrite existing products");
 for(const person of clients){
  await dba.query(
   "INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role) VALUES($1,$2,$3,$4,'cashier')",
   [store,person.id,person.username,hash]);
  await dba.query(
   "INSERT INTO zhirox_local.actor_credentials_v63(store_id,cashier_id,verifier) VALUES ($1,$2,zhirox_local.crypt($3,zhirox_local.gen_salt('bf',8)))",
   [store,person.id,password]);
 }
 await dba.query(
  "INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units,base_unit) VALUES($1,$2,$3,1000,15,'unit')",
  [store,productId,"کالای تاقیکردنەوەی هاوکاتی 5 کاشێر"]);
 await dba.query(
  "INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units,sale_mode) VALUES($1,$2,$3,1,'unit')",
  [store,barcode,productId]);

 const certificate=join(dir,"cert.pem"),privateKey=join(dir,"key.pem");
 execFileSync("openssl",["req","-x509","-nodes","-newkey","rsa:2048",
  "-sha256","-days","1","-subj","/CN=localhost",
  "-addext","subjectAltName=IP:127.0.0.1,DNS:localhost",
  "-keyout",privateKey,"-out",certificate],{stdio:"ignore",timeout:15000});
 [cert,key]=await Promise.all([readFile(certificate),readFile(privateKey)]);
 await startGateway();
 assert.equal((await get("/v33/health")).status,200);

 // Real TLS, five independent authenticated cashier identities, one PostgreSQL.
 const logins=await Promise.all(clients.map(person=>post("/api/local/v3/login",{
  store_id:store,username:person.username,password
 })));
 for(let i=0;i<clients.length;i++){
  assert.equal(logins[i].status,200,"5 distinct independent cashier sessions");
  clients[i].token=logins[i].data.token;
  assert.ok(clients[i].token);
 }
 assert.equal(new Set(clients.map(x=>x.token)).size,5);
 for(const person of clients){
  const opened=await post("/api/local/v37/shift/open",{
   shift_id:person.shift,opening_minor:0
  },person.token);
  assert.equal(opened.status,200,"each cashier must have independent open shift");
 }
 assert.equal((await get("/api/local/v26/scan?code="+barcode,clients[0].token)).status,200);
 const prep=await Promise.all(clients.map(person=>post("/api/local/v31/prepare",{
  request_id:person.request,lines:[{barcode,qty:4}],expected_total_minor:4000
 },person.token)));
 for(const r of prep)assert.equal(r.status,200,"all five cashiers can queue independent intent");
 const attempts=await Promise.all(clients.map(person=>
  post("/api/local/v31/commit",{request_id:person.request},person.token)
 ));
 const winners=clients.filter((_,i)=>attempts[i].status===200);
 const losers=clients.filter((_,i)=>attempts[i].status===409);
 assert.equal(winners.length,3,"15 units cannot satisfy five simultaneous orders of 4");
 assert.equal(losers.length,2,"two stock-conflicting orders must be rejected");
 assert.equal(await count(
  "SELECT count(*)::int AS n FROM zhirox_local.sales WHERE store_id=$1"),6);
 assert.equal(String((await dba.query(
  "SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2",[store,productId]
 )).rows[0].stock_base_units),"3");
 for(let i=0;i<clients.length;i++){
  const person=clients[i],out=attempts[i];
  if(out.status===200){
   assert.equal(out.data.receipt.total_minor,"4000");
   const retry=await post("/api/local/v31/commit",{request_id:person.request},person.token);
   assert.equal(retry.status,200);
   assert.equal(retry.data.receipt.replayed,true);
   assert.equal(retry.data.receipt.sale_id,out.data.receipt.sale_id);
   const q=await post("/api/local/v35/print-jobs",{
    sale_id:out.data.receipt.sale_id,job_id:person.print,width_mm:80
   },person.token);
   assert.equal(q.status,202);
   assert.equal(q.data.hardware_printed,false);
  }else{
   const cancel=await post("/api/local/v31/cancel",{request_id:person.request},person.token);
   assert.equal(cancel.status,200);
   assert.equal(cancel.data.state,"cancelled");
  }
 }
 // Commit only after recovering this DURABLY PREPARED intent on LAN restoration.
 const recoverer=losers[0];
 const prepare=await post("/api/local/v31/prepare",{
  request_id:recoveryRequest,
  lines:[{barcode:recoveryBarcode,qty:1}],expected_total_minor:400
 },recoverer.token);
 assert.equal(prepare.status,200);
 const before=await get("/api/local/v31/recover",recoverer.token);
 assert.equal(before.status,200);
 assert.equal(before.data.intent.request_id,recoveryRequest);
 assert.equal(before.data.intent.state,"prepared");
 const other=await get("/api/local/v31/recover",winners[0].token);
 assert.equal(other.data.intent,null,"a distinct cashier must not see this pending transaction");
 assert.equal(await count(
  "SELECT count(*)::int AS n FROM zhirox_local.sales WHERE store_id=$1"),6);

 // A real local HTTPS socket port is stopped. PostgreSQL stays live.
 const samePort=port;
 await stopGateway();
 await assert.rejects(
  get("/api/local/v31/recover",recoverer.token),
  err=>err?.code==="ECONNREFUSED",
  "the cashier client actually loses its LAN-like HTTPS server TCP session");
 assert.equal(await count(
  "SELECT count(*)::int AS n FROM zhirox_local.checkout_intents_v31 WHERE store_id=$1 AND request_id=$2 AND state='prepared'",
  [store,recoveryRequest]),1,"prepared transaction MUST survive gateway loss");
 assert.equal(await count(
  "SELECT count(*)::int AS n FROM zhirox_local.sales WHERE store_id=$1"),6,
  "network failure cannot silently complete an uncommitted sale");

 // Bring the authenticated gateway back, listening on exactly the old port.
 await startGateway(samePort);
 assert.equal((await get("/v33/health")).status,200);
 const recovered=await get("/api/local/v31/recover",recoverer.token);
 assert.equal(recovered.status,200);
 assert.equal(recovered.data.intent.request_id,recoveryRequest);
 const committed=await post("/api/local/v31/commit",{
  request_id:recoveryRequest
 },recoverer.token);
 assert.equal(committed.status,200,"uncommitted sale can finish after LAN-like loss");
 assert.equal(committed.data.receipt.total_minor,"400");
 assert.equal((await post("/api/local/v31/commit",{
  request_id:recoveryRequest
 },recoverer.token)).data.receipt.replayed,true);
 assert.equal((await get("/api/local/v31/recover",recoverer.token)).data.intent,null);
 const receipt=await get("/api/local/v34/receipt?sale_id="+committed.data.receipt.sale_id,recoverer.token);
 assert.equal(receipt.status,200);
 assert.equal(receipt.data.receipt.total_minor,"400");
 const pq=await post("/api/local/v35/print-jobs",{
  sale_id:committed.data.receipt.sale_id,job_id:recoveryPrint,width_mm:58
 },recoverer.token);
 assert.equal(pq.status,202);
 assert.equal(pq.data.hardware_printed,false);
 const closeResults=[];
 for(const person of clients){
  const amount=4000*(winners.some(x=>x.id===person.id)?1:0)+
    (person.id===recoverer.id?400:0);
  const c=await post("/api/local/v37/shift/close",{
   shift_id:person.shift,counted_minor:amount
  },person.token);
  assert.equal(c.status,200,"cashier shift must reconcile after simulated LAN interruption");
  assert.equal(String(c.data.shift.variance_minor),"0");
  closeResults.push({cashier:person.username,cash_iqd:amount,variance:"0"});
 }
 const totals=(await dba.query(
  "SELECT (SELECT count(*)::int FROM zhirox_local.sales WHERE store_id=$1) AS sales, (SELECT coalesce(sum(total_minor),0)::bigint FROM zhirox_local.sales WHERE store_id=$1) AS amount, (SELECT count(*)::int FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1) AS receipts, (SELECT count(*)::int FROM zhirox_local.print_requests_v35 WHERE store_id=$1) AS print_jobs, (SELECT count(*)::int FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL) AS pending, (SELECT count(*)::int FROM zhirox_local.cash_shifts_v37 WHERE store_id=$1 AND state='open') AS open_shifts",
 [store])).rows[0];
 assert.equal(totals.sales,7);
 assert.equal(String(totals.amount),"27080");
 assert.equal(totals.receipts,7);
 assert.equal(totals.print_jobs,7);
 assert.equal(totals.pending,4,"new sales persist locally even when remote receiver not used");
 assert.equal(totals.open_shifts,0);
 const remotePool=new Pool({host:"127.0.0.1",port:5432,user:"localtest",
  password:process.env.PGPASSWORD,database:"zhirox_v67_receiver_ci_test"});
 try{
  assert.equal(Number((await remotePool.query(
   "SELECT count(*)::int AS n FROM zhirox_cloud_v28.received_sales WHERE store_id=$1",[store]
  )).rows[0].n),3,"no cloud mock upload was triggered by cashier traffic");
 }finally{await remotePool.end();}
 const report={
  name:"ZHIROX V68 five-cashier physical-like LAN Digital Twin",
  physical_client_count:0,real_https_authenticated_clients:5,
  actual_shared_postgresql:true,external_wan_internet_used:false,
  test_race:{initial_stock_base_units:15,simultaneous_cashiers:5,
    each_requested_units:4,successes:3,rejected:2,remaining_units:3,
    oversold:false},
  network_interruption:{type:"actual HTTPS listener shutdown/port refused; DB stays available",
    original_port_reused:true,uncommitted_intent_persisted:true,
    recovered_after_restart:true,new_sale_iqd:400,replay_idempotent:true},
  after_test:{sales:7,total_iqd:"27080",receipts:7,
    queued_print_jobs:7,new_pending_outbox:4,open_cash_shifts:0},
  cashier_closures:closeResults,store_data_synthetic:true,
  untested:["five physical Windows computers","router switch cable break",
   "PostgreSQL host outage during this gateway cut","physical thermal print",
   "Windows installer","actual payment settlement","cloud real Supabase upload"],
  go_live:"NO_GO"
 };
 await mkdir(evidence,{recursive:true});
 await writeFile(join(evidence,"v68-five-cashier-lan-recovery-report.json"),
  JSON.stringify(report,null,2)+"\n","utf8");
 console.log("V68 PASS: "+JSON.stringify({race:report.test_race,
  network:report.network_interruption,final:report.after_test,release:"NO_GO"}));
}finally{
 if(server)await stopGateway().catch(()=>{});
 await runtime.end();await dba.end();
 await rm(dir,{recursive:true,force:true});
}
