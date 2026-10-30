// V59: actual PostgreSQL 16 + authenticated HTTPS cash-only test with WAN absent.
// Runs ONLY against a freshly isolated CI TEST database; never real customer data.
// No Cloud, external bank, hardware printer, production SQL or deploy.
import test from "node:test";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {createServer as createHttpsServer,request as httpsRequest} from "node:https";
import {mkdtemp,readFile,rm,mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {renderReceiptV34} from "../local-receipts-v34.mjs";
import {validateV54Job} from "../windows-print-dispatch-v54.mjs";
import {decodeScale27} from "../scale27-v26.mjs";
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
const mixedRequest="50000000-0000-0000-0000-000000000061";
const mixedPrint="60000000-0000-0000-0000-000000000060";
const water="30000000-0000-0000-0000-000000000061";
const tomatoes="30000000-0000-0000-0000-000000000062";
const waterUnit="6260053183981";
const waterCarton="6260053183982";
const scaleTag="2700001004806";
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
 // In V60, local web service has a separate NON-owner, explicitly scoped login.
 // The seeding/verifying pool stays administrative but is never passed to API.
 const v60=process.env.ZHIROX_V60_CI_RESTRICTED_ROLE==="true";
 if(v60&&(
   process.env.ZHIROX_V60_CI_DB_USER!=="zhirox_v60_api_ci"||
   process.env.ZHIROX_V60_CI_DB_PASSWORD!=="V60-SYNTHETIC-CI-ONLY-DO-NOT-REUSE"
 ))throw Error("v60_refuses_unscoped_api_role");
 const runtimePool=v60?new Pool({
  host:"127.0.0.1",port:5432,database:"zhirox_v59_ci_test",
  user:process.env.ZHIROX_V60_CI_DB_USER,
  password:process.env.ZHIROX_V60_CI_DB_PASSWORD,
  max:8,connectionTimeoutMillis:3000
 }):pool;
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
  if(process.env.ZHIROX_V63_CI_ACTOR_PROOF==="true"){
    // CI-only bcrypt enrollment. Existing scrypt hashes are never silently
    // converted. Real store users would need separately approved reenrollment.
    await pool.query(
      "INSERT INTO zhirox_local.actor_credentials_v63(store_id,cashier_id,verifier) SELECT store_id,id,zhirox_local.crypt($1,zhirox_local.gen_salt('bf',8)) FROM zhirox_local.local_users WHERE store_id=$2::uuid",
      [password,store]
    );
  }
  await pool.query(
   "INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units) VALUES ($1,$2,'V59 Synthetic Last Unit',1250,2),($1,$3,'V59 Synthetic Stale Quote',400,3)",
   [store,item,second]);
  await pool.query(
   "INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units) VALUES($1,$2,$3,1),($1,$4,$5,1)",
   [store,barcode,item,otherBarcode,second]);
  const v65=process.env.ZHIROX_V65_MARKET_DIGITAL_TWIN==="true";
  const labReport={lab:"ZHIROX V65 isolated supermarket digital twin",
    hardware_present:false,postgresql_real:true,https_real:true,
    two_independent_sessions:true,wan:"process-level egress denied; no cloud configured",
    printer:"file-backed paper width rendering, not physical paper",
    service_restart:"HTTPS process restarted; PostgreSQL remains on and data persisted",
    release:"NO_GO",checks:[]};
  if(v65){
    const {Socket}=await import("node:net");
    assert.throws(()=>new Socket().connect({host:"example.com",port:443}),
      /V65_WAN_DISCONNECTED/,"outside-WAN TLS connection must be refused BEFORE DNS");
    assert.throws(()=>new Socket().connect({host:"8.8.8.8",port:53}),
      /V65_WAN_DISCONNECTED/,"outside-LAN DNS connection must be refused");
    labReport.checks.push("network egress guard denies external Internet host and external DNS at socket level");
  }
  if(v65){
    // Additional real inventory for a physical-market-like basket:
    // 2 single water bottles + 1 carton (12 bottles) + 480g tomato.
    await pool.query(
     "INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units,base_unit,plu) VALUES ($1,$2,'ئاوی خواردنەوە',500,30,'unit',NULL),($1,$3,'تەماتە',11000,2000,'gram','00001')",
     [store,water,tomatoes]);
    await pool.query(
     "INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units,sale_mode,sale_price_minor) VALUES ($1,$2,$3,1,'unit',NULL),($1,$4,$3,12,'carton',5500)",
     [store,waterUnit,waterCarton]);
    assert.deepEqual(decodeScale27(scaleTag),{code:scaleTag,plu:"00001",grams:480,kg:"0.480"});
    labReport.checks.push("real product catalog: unit/carton/scale prefix-27");
  }
  const certPath=join(dir,"cert.pem"),keyPath=join(dir,"key.pem");
  execFileSync("openssl",[
   "req","-x509","-nodes","-newkey","rsa:2048","-sha256","-days","1",
   "-subj","/CN=localhost","-addext","subjectAltName=IP:127.0.0.1,DNS:localhost",
   "-keyout",keyPath,"-out",certPath
  ],{stdio:"ignore",timeout:15000});
  const [cert,key]=await Promise.all([readFile(certPath),readFile(keyPath)]);
  if(v60){
    const role=(await runtimePool.query(
      "SELECT current_user AS username, rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname=current_user"
    )).rows[0];
    assert.equal(role.username,"zhirox_v60_api_ci");
    for(const name of ["rolsuper","rolcreaterole","rolcreatedb","rolbypassrls"])
      assert.equal(role[name],false,"API may not have "+name);
    if(process.env.ZHIROX_V62_CI_INTENT_SHIFT_GUARD==="true"){
      const result=await runtimePool.query(
        "SELECT has_table_privilege(current_user,'zhirox_local.checkout_intents_v31','INSERT') AS intent_insert, has_table_privilege(current_user,'zhirox_local.checkout_intents_v31','UPDATE') AS intent_update, has_table_privilege(current_user,'zhirox_local.cash_shifts_v37','INSERT') AS shift_insert, has_table_privilege(current_user,'zhirox_local.cash_shifts_v37','UPDATE') AS shift_update, has_function_privilege(current_user,'zhirox_local.checkout_packs_scale_v26(uuid,uuid,uuid,jsonb,bigint)','EXECUTE') AS direct_checkout"
      );
      for(const [key,value] of Object.entries(result.rows[0])){
        assert.equal(value,false,"V62 caller must not have "+key);
      }
    }
    if(process.env.ZHIROX_V63_CI_ACTOR_PROOF==="true"){
      const sql="SELECT has_function_privilege(current_user,'zhirox_local.prepare_checkout_v31(uuid,uuid,uuid,jsonb,bigint)','EXECUTE') AS raw_prepare, has_function_privilege(current_user,'zhirox_local.commit_checkout_v31(uuid,uuid,uuid)','EXECUTE') AS raw_commit, has_function_privilege(current_user,'zhirox_local.open_cash_shift_v37(uuid,uuid,uuid,bigint)','EXECUTE') AS raw_shift";
      const r=(await runtimePool.query(sql)).rows[0];
      for(const [key,value] of Object.entries(r))
       assert.equal(value,false,"V63 unguarded SQL must not be callable by "+key);
    }
    if(process.env.ZHIROX_V64_CI_AUTH_GATE==="true"){
      const roleRow=(await runtimePool.query(
       "SELECT has_table_privilege(current_user,'zhirox_local.stores','UPDATE') AS stores_update, has_column_privilege(current_user,'zhirox_local.local_users','role','UPDATE') AS change_role, has_column_privilege(current_user,'zhirox_local.local_users','password_hash','UPDATE') AS change_password, has_column_privilege(current_user,'zhirox_local.local_users','session_version','UPDATE') AS change_session_version, has_column_privilege(current_user,'zhirox_local.local_users','enabled','UPDATE') AS enable_user, has_column_privilege(current_user,'zhirox_local.local_users','failed_attempts','UPDATE') AS update_fail_counter, has_column_privilege(current_user,'zhirox_local.local_users','locked_until','UPDATE') AS update_lockout"
      )).rows[0];
      for(const key of ["stores_update","change_role","change_password","change_session_version","enable_user"])
       assert.equal(roleRow[key],false,"V64 API may not mutate "+key);
      for(const key of ["update_fail_counter","update_lockout"])
       assert.equal(roleRow[key],true,"V64 auth needs only "+key);
    }
    // A compromised cashier API account must not own the schema or mutate
    // it structurally, even though existing SECURITY INVOKER routines still
    // need scoped table-level DML; production hardening requires another gate.
    for(const query of [
      ...(process.env.ZHIROX_V61_CI_CASH_EXECUTOR==="true"?[
        "INSERT INTO zhirox_local.sales(store_id,id,request_id,receipt_no,cashier_id,total_minor,request_payload) VALUES('10000000-0000-0000-0000-000000000059','90000000-0000-0000-0000-000000000059','91000000-0000-0000-0000-000000000059',999,'20000000-0000-0000-0000-000000000059',1,'[]'::jsonb)",
        "INSERT INTO zhirox_local.stock_ledger(store_id,id,product_id,sale_id,delta_base_units) VALUES('10000000-0000-0000-0000-000000000059','90000000-0000-0000-0000-000000000060','30000000-0000-0000-0000-000000000059','90000000-0000-0000-0000-000000000059',-2)",
        "UPDATE zhirox_local.products SET stock_base_units=999 WHERE store_id='10000000-0000-0000-0000-000000000059'",
        "INSERT INTO zhirox_local.event_outbox(store_id,event_id,aggregate_id,event_type,payload) VALUES('10000000-0000-0000-0000-000000000059','90000000-0000-0000-0000-000000000061','90000000-0000-0000-0000-000000000059','sale.completed','{}'::jsonb)"
      ]:[]),
      "CREATE TABLE zhirox_local.v60_forbidden_table(id int)",
      "TRUNCATE zhirox_local.sales",
      "DELETE FROM zhirox_local.sales",
      "ALTER TABLE zhirox_local.products ADD COLUMN v60_unapproved int",
      "UPDATE zhirox_local.receipt_snapshots_v34 SET total_minor=1",
      "UPDATE zhirox_local.print_requests_v35 SET state='printed'",
      "DELETE FROM zhirox_local.inventory_reservation_items_v43"
    ]){
      await assert.rejects(
        runtimePool.query(query),
        e=>e?.code==="42501"||e?.code==="55000",
        "V60 runtime SQL must reject "+query
      );
    }
  }
  let localHandler=createLocalShiftHandlerV37({pool:runtimePool,secret:sessionSecret});
  let gateway=createV33LanHandler({
   pool:runtimePool,secret:sessionSecret,peers:new Set(["127.0.0.1"]),
   localHandler,limiter:createV33ClientLimiter({limit:150}),
   v64Protected:process.env.ZHIROX_V64_CI_AUTH_GATE==="true"
  });
  server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},gateway);
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(0,"127.0.0.1",()=>{server.off("error",reject);resolve();});
  });
  let port=server.address().port;
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
  if(process.env.ZHIROX_V63_CI_ACTOR_PROOF==="true"){
    for(const route of ["/api/local/v3/checkout","/api/local/v25/checkout","/api/local/v26/checkout"]){
      const blocked=await post(route,{},tokenA);
      assert.equal(blocked.status,410,"legacy direct checkout must be unavailable: "+route);
      assert.equal(blocked.data.error,"legacy_checkout_disabled_use_v31");
    }
  }
  let proofA=null,proofB=null;
  if(process.env.ZHIROX_V63_CI_ACTOR_PROOF==="true"){
    const actorA=JSON.parse(Buffer.from(tokenA.split(".")[0],"base64url").toString("utf8"));
    const actorB=JSON.parse(Buffer.from(tokenB.split(".")[0],"base64url").toString("utf8"));
    proofA=actorA.db_proof;proofB=actorB.db_proof;
    assert.match(proofA,/^[a-f0-9]{64}$/);
    assert.match(proofB,/^[a-f0-9]{64}$/);
    assert.notEqual(proofA,proofB,"separate cashiers have distinct DB sessions");
    for(const [proof,st,actor] of [
      [proofA,store,b],[proofB,store,a],["0".repeat(64),store,a],
      [proofA,"10000000-0000-0000-0000-000000000060",a]
    ]){
      await assert.rejects(
        runtimePool.query("SELECT * FROM zhirox_local.open_cash_shift_v63($1,$2::uuid,$3::uuid,$4::uuid,$5::bigint)",
          [proof,st,actor,shiftA,0]),
        error=>error?.code==="P6301",
        "forged/cross-store/cross-cashier DB actor must be rejected"
      );
    }
    await assert.rejects(
      runtimePool.query("SELECT * FROM zhirox_local.prepare_checkout_v31($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::bigint)",
        [store,a,stale,JSON.stringify([{barcode:otherBarcode,qty:1}]),400]),
      error=>error?.code==="42501",
      "network-facing API cannot invoke unguarded V31 even using correct actor UUID"
    );
  }
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

  if(v65){
    labReport.checks.push("independent cashier sessions + final last-stock transaction");
    // Simulate a cashier service process restart without touching PostgreSQL.
    // This is NOT a mains power cut, physical LAN outage or Windows OS reboot.
    await new Promise(resolve=>server.close(resolve));
    localHandler=createLocalShiftHandlerV37({pool:runtimePool,secret:sessionSecret});
    gateway=createV33LanHandler({
      pool:runtimePool,secret:sessionSecret,peers:new Set(["127.0.0.1"]),
      localHandler,limiter:createV33ClientLimiter({limit:150}),v64Protected:true
    });
    server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},gateway);
    await new Promise((resolve,reject)=>{
      server.once("error",reject);
      server.listen(0,"127.0.0.1",()=>{server.off("error",reject);resolve();});
    });
    port=server.address().port;
    const afterRestart=await get("/api/local/v34/receipt?sale_id="+saleId,winnerToken);
    assert.equal(afterRestart.status,200,"receipt must survive HTTPS service restart");
    assert.equal(afterRestart.data.receipt.total_minor,"2500");
    assert.equal((await post("/api/local/v31/commit",{request_id:winnerRequest},winnerToken)).data.receipt.replayed,true);
    labReport.checks.push("HTTPS gateway restart with same local PostgreSQL: receipt + idempotent sale survive");

    // Simulate scanner key strokes, including scanners with Enter or CRLF.
    const scans=[waterUnit+"\r",waterCarton+"\n",scaleTag+"\r\n"];
    const decoded=scans.map(x=>x.replace(/[\r\n]+$/g,""));
    assert.deepEqual(decoded,[waterUnit,waterCarton,scaleTag]);
    for(const code of decoded){
      const found=await get("/api/local/v26/scan?code="+code,winnerToken);
      assert.equal(found.status,200,"authentic V26 scan must resolve "+code);
    }
    assert.equal((await get("/api/local/v26/scan?code=2700001004805",winnerToken)).status,400,
      "corrupted physical scale label must be rejected");
    labReport.checks.push("simulated HID keyboard CR/LF input, actual HTTPS barcode scan, invalid EAN rejection");

    // Live registered mixed unit+carton+weight transaction. Exactly 11,780 IQD.
    const basket=[
      {barcode:decoded[0],qty:2},{barcode:decoded[1],qty:1},
      {barcode:decoded[2],qty:1}
    ];
    const prepared=await post("/api/local/v31/prepare",
      {request_id:mixedRequest,lines:basket,expected_total_minor:11780},winnerToken);
    assert.equal(prepared.status,200);
    const mixed=await post("/api/local/v31/commit",{request_id:mixedRequest},winnerToken);
    assert.equal(mixed.status,200);
    assert.equal(mixed.data.receipt.total_minor,"11780");
    const mixedSaleId=mixed.data.receipt.sale_id;
    const repeat=await post("/api/local/v31/commit",{request_id:mixedRequest},winnerToken);
    assert.equal(repeat.data.receipt.replayed,true);
    assert.equal(repeat.data.receipt.sale_id,mixedSaleId);
    const mixedDetail=await get("/api/local/v34/receipt?sale_id="+mixedSaleId,winnerToken);
    assert.equal(mixedDetail.status,200);
    assert.equal(mixedDetail.data.receipt.lines.length,3);
    assert.equal(mixedDetail.data.receipt.lines.reduce((n,l)=>n+BigInt(l.line_total_minor),0n),11780n);
    const queue58=await post("/api/local/v35/print-jobs",
      {sale_id:mixedSaleId,job_id:mixedPrint,width_mm:58},winnerToken);
    assert.equal(queue58.status,202);
    assert.equal(queue58.data.hardware_printed,false);
    assert.equal((await post("/api/local/v35/print-jobs",
      {sale_id:mixedSaleId,job_id:mixedPrint,width_mm:58},winnerToken)).data.job.job_id,mixedPrint);
    const counts=(await pool.query(
     "SELECT (SELECT count(*)::integer FROM zhirox_local.sales WHERE store_id=$1) AS sales, (SELECT count(*)::integer FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1) AS receipts, (SELECT count(*)::integer FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL) AS pending, (SELECT count(*)::integer FROM zhirox_local.print_requests_v35 WHERE store_id=$1) AS print_jobs, (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2) AS water_remaining, (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$3) AS tomato_grams",
     [store,water,tomatoes])).rows[0];
    assert.equal(counts.sales,2);
    assert.equal(counts.receipts,2);
    assert.equal(counts.pending,2,"WAN is not available to the cashier app; cloud outbox remains pending");
    assert.equal(counts.print_jobs,2);
    assert.equal(counts.water_remaining,"16");
    assert.equal(counts.tomato_grams,"1520");
    labReport.checks.push("actual transactional mix 2 units + 1 carton + 0.480kg tomato, total 11,780 IQD");
    labReport.checks.push("two durable pending outbox events, two immutable receipts, no duplicate prints");

    const evidence=resolve(process.env.ZHIROX_V65_EVIDENCE_DIR||"market-lab-evidence");
    await mkdir(evidence,{recursive:true});
    const shot80=validateV54Job({...detail.data.receipt,
      store_name_snapshot:detail.data.receipt.store_name_snapshot,
      sale_id:saleId,job_id:printId,width_mm:80});
    const shot58=validateV54Job({...mixedDetail.data.receipt,
      store_name_snapshot:mixedDetail.data.receipt.store_name_snapshot,
      sale_id:mixedSaleId,job_id:mixedPrint,width_mm:58});
    assert.equal(shot80.total_iqd,"2500");
    assert.equal(shot58.total_iqd,"11780");
    await writeFile(join(evidence,"receipt-80mm.html"),renderReceiptV34(detail.data.receipt,80),"utf8");
    await writeFile(join(evidence,"receipt-58mm.html"),renderReceiptV34(mixedDetail.data.receipt,58),"utf8");
    await writeFile(join(evidence,"scanner-simulated.txt"),
      scans.map((s,i)=>String(i+1)+" | "+JSON.stringify(s)+" | "+decoded[i]).join("\n")+"\n","utf8");
    labReport.final_state={...counts,sale_1_iqd:"2500",sale_2_iqd:"11780",
      stock_units_after_mix:counts.water_remaining,
      tomato_grams_after_mix:counts.tomato_grams};
    labReport.thermal={widths_mm:[80,58],
      physical_printer_connected:false,printer_queue_hardware_printed:false,
      receipt_80:shot80,receipt_58:shot58};
    await writeFile(join(evidence,"lab-report.json"),JSON.stringify(labReport,null,2),"utf8");
  }

  const final=await pool.query(
   "SELECT (SELECT count(*)::integer FROM zhirox_local.sales WHERE store_id=$1) AS sales, (SELECT count(*)::integer FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL) AS pending, (SELECT count(*)::integer FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1) AS receipts, (SELECT count(*)::integer FROM zhirox_local.print_requests_v35 WHERE store_id=$1) AS print_jobs, (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2) AS remaining",
   [store,item]);
  assert.equal(final.rows[0].sales,1);
  assert.equal(final.rows[0].pending,1,"WAN offline: sale remains durably queued for later upload");
  assert.equal(final.rows[0].receipts,1);
  assert.equal(final.rows[0].print_jobs,1);
  assert.equal(final.rows[0].remaining,"0");
  assert.equal((await post("/api/local/v37/shift/close",
    {shift_id:shiftA,counted_minor:aWins?(v65?15280:3500):1000},tokenA)).status,200);
  assert.equal((await post("/api/local/v37/shift/close",
    {shift_id:shiftB,counted_minor:aWins?500:(v65?14780:3000)},tokenB)).status,200);
  assert.equal((await get("/api/local/v37/shift",tokenA)).data.shift,null);
  assert.equal((await get("/api/local/v37/shift",tokenB)).data.shift,null);
  if(proofA){
    // Revocation is immediately enforced by DB even if the HMAC JWT remains
    // otherwise valid: no actor cache or connection-affinity trust.
    await pool.query(
      "UPDATE zhirox_local.local_users SET session_version=session_version+1 WHERE store_id=$1 AND id=$2",
      [store,a]
    );
    await assert.rejects(
      runtimePool.query("SELECT * FROM zhirox_local.open_cash_shift_v63($1,$2::uuid,$3::uuid,$4::uuid,$5::bigint)",
        [proofA,store,a,shiftA,0]),
      error=>error?.code==="P6301",
      "revoked cashier must be rejected independently by database"
    );
    await pool.query(
      "UPDATE zhirox_local.actor_proofs_v63 SET expires_at=clock_timestamp()-interval '1 second' WHERE cashier_id=$1",[b]
    );
    await assert.rejects(
      runtimePool.query("SELECT * FROM zhirox_local.open_cash_shift_v63($1,$2::uuid,$3::uuid,$4::uuid,$5::bigint)",
        [proofB,store,b,shiftB,0]),
      error=>error?.code==="P6301",
      "expired proof must fail closed"
    );
  }
  if(process.env.ZHIROX_V64_CI_AUTH_GATE==="true"){
    // After 3 earlier login calls, only 5 more are allowed within the minute.
    // An unknown username cannot consume CPU beyond the per-peer ceiling.
    for(let i=0;i<(v65?8:5);i++){
     const bad=await post("/api/local/v3/login",
      {store_id:store,username:"v59-cashier-a",password:"v64-invalid-credentials"});
     assert.equal(bad.status,401);
    }
    const throttled=await post("/api/local/v3/login",
     {store_id:store,username:"v59-cashier-b",password});
    assert.equal(throttled.status,429);
    assert.equal(throttled.data.error,"login_rate_limited");
    const read=await get("/v33/health");
    assert.equal(read.status,200,"login-only throttle must not break cash register health check");
    const unsupported=await get("/api/local/v39/refunds",tokenB);
    assert.equal(unsupported.status,410,"unreviewed finance routes must be off by default");
    assert.equal(unsupported.data.error,"api_route_not_cleared_v64");
  }
  console.log((process.env.ZHIROX_V62_CI_INTENT_SHIFT_GUARD==="true"?"V62 guarded intents/shifts + ":process.env.ZHIROX_V61_CI_CASH_EXECUTOR==="true"?"V61 NOLOGIN cash executor + ":v60?"V60 restricted API role + ":"V59 ")+"PASS: real disposable PostgreSQL, verified loopback TLS, 2 sessions/shifts, 1 last-stock winner, immutable receipt, idempotent queue, pending local outbox. NO_GO");
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(v60)await runtimePool.end();
  await pool.end();
  await rm(dir,{recursive:true,force:true});
 }
});
