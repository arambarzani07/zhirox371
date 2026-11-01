// V99 real PostgreSQL + HTTP two independent synthetic clients; no WAN.
import assert from "node:assert/strict";
import http from "node:http";
import {once} from "node:events";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {createV99DualDeviceHandler} from "../local-dual-device-v99.mjs";
import {createV99TrialClient} from "../device-client-v99.mjs";
import {signV99DeviceRequest} from "../device-guard-v99.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";
import {assertV98GatePrivileges} from "../local-checkout-http-v98.mjs";
import {assertV94AuthPrivilegeBoundary} from "../local-test-market-v94.mjs";

for(const [key,value] of Object.entries({
 PGHOST:"127.0.0.1",PGUSER:"v80test",PGDATABASE:"zhirox_v80_disposable",
 ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[key],value,"V99 isolated CI "+key);
for(const name of ["PGPASSWORD","ZHIROX_TEST_CASHIER_PASSWORD",
 "ZHIROX_TEST_OWNER_PASSWORD","ZHIROX_LOCAL_SESSION_SECRET"])
 assert.ok(process.env[name],"V99 ephemeral login credential "+name);
const settings={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:4500,statement_timeout:25000};
const authRole="zhirox_v94_auth",gateRole="zhirox_v95_gate";
const passwords={auth:randomBytes(32).toString("hex"),gate:randomBytes(32).toString("hex")};
const deviceKeys={
 "trial-pc-01":randomBytes(32).toString("hex"),
 "trial-pc-02":randomBytes(32).toString("hex")
};
const admin=new pg.Pool({...settings,user:"v80test",password:process.env.PGPASSWORD,max:2});
const authPool=new pg.Pool({...settings,user:authRole,password:passwords.auth,max:3});
const gatePool=new pg.Pool({...settings,user:gateRole,password:passwords.gate,max:4});
const enabled=[];
let server,dropNext=false;
const store=TEST_MARKET.store;
const water=TEST_MARKET.product1;
const request=n=>"99000000-0000-4000-8000-00000000000"+n;
const cart=qty=>[{product_id:water,qty}];
async function snapshot(){
 const {rows:[r]}=await admin.query(`
 SELECT (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS sales,
 (SELECT COALESCE(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
 (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS outbox,
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS water,
 (SELECT price_minor FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS price,
 (SELECT COALESCE(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90
 WHERE store_id=$1 AND product_id=$2)::bigint AS water_lots
 `,[store,water]);
 return r;
}
const noWanTransport=async(url,opts)=>{
 if(new URL(url).hostname!=="127.0.0.1")
  throw Error("V99_offline_WAN_transport_blocked");
 return fetch(url,opts);
};
async function rawRequest(origin,route,body,headers={}){
 const response=await fetch(origin+"/api/local/v99/"+route,{
  method:"POST",headers:{"Content-Type":"application/json",...headers},
  body:JSON.stringify(body)
 });
 return {status:response.status,body:await response.json()};
}
try{
 const before=await snapshot();
 assert.equal(before.sales,11);
 assert.equal(before.outbox,11);
 assert.ok(Number(before.water)>=3);
 assert.equal(Number(before.water),Number(before.water_lots));
 const {rows:[key]}=await admin.query(
  "SELECT encode(secret_key,'hex') AS hex FROM zhirox_local.v96_proof_keys WHERE store_id=$1",[store]);
 assert.match(key.hex,/^[0-9a-f]{64}$/);
 for(const [role,password] of [[authRole,passwords.auth],[gateRole,passwords.gate]]){
  const {rows:[r]}=await admin.query(
   "SELECT rolcanlogin,rolsuper FROM pg_catalog.pg_roles WHERE rolname=$1",[role]);
  assert.deepEqual([r.rolcanlogin,r.rolsuper],[false,false]);
  await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
  enabled.push(role);
 }
 await assertV94AuthPrivilegeBoundary(authPool);
 await assertV98GatePrivileges(gatePool);
 server=http.createServer(createV99DualDeviceHandler({
  authPool,gatePool,sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,
  proofKeyHex:key.hex,deviceKeys,
  afterCommittedForTest:async({res})=>{
   if(dropNext){dropNext=false;res.destroy();}
  }
 }));
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const origin="http://127.0.0.1:"+server.address().port;
 // Both devices have different local secrets, independent session credentials.
 const pc1=createV99TrialClient({origin,deviceId:"trial-pc-01",
  secretHex:deviceKeys["trial-pc-01"],transport:noWanTransport});
 const pc2=createV99TrialClient({origin,deviceId:"trial-pc-02",
  secretHex:deviceKeys["trial-pc-02"],transport:noWanTransport});
 await assert.rejects(()=>noWanTransport("https://example.invalid/not-internet",{}),
  /WAN_transport_blocked/);
 assert.equal((await rawRequest(origin,"login",{
  username:TEST_MARKET.cashierUsername,
  password:process.env.ZHIROX_TEST_CASHIER_PASSWORD})).status,403);
 const loginData={username:TEST_MARKET.cashierUsername,
  password:process.env.ZHIROX_TEST_CASHIER_PASSWORD};
 const deviceHeaders=signV99DeviceRequest({
  deviceId:"trial-pc-01",secretHex:deviceKeys["trial-pc-01"],
  method:"POST",path:"/api/local/v99/login",body:loginData
 });
 const firstRaw=await rawRequest(origin,"login",loginData,deviceHeaders);
 assert.equal(firstRaw.status,200);
 assert.equal((await rawRequest(origin,"login",loginData,deviceHeaders)).status,403,
  "HMAC replay nonce must be rejected");
 assert.equal((await rawRequest(origin,"login",{...loginData,password:"tampered"},deviceHeaders)).status,403);
 assert.equal((await rawRequest(origin,"login",loginData,{
  ...deviceHeaders,"x-zhirox-device-id":"trial-pc-02"})).status,403);
 const login1=await pc1.login(TEST_MARKET.cashierUsername,
  process.env.ZHIROX_TEST_CASHIER_PASSWORD);
 const login2=await pc2.login(TEST_MARKET.ownerUsername,
  process.env.ZHIROX_TEST_OWNER_PASSWORD);
 assert.equal(login1.status,200);assert.equal(login1.body.device_id,"trial-pc-01");
 assert.equal(login2.status,200);assert.equal(login2.body.device_id,"trial-pc-02");
 const [a,b]=await Promise.all([
  pc1.checkout({request_id:request(1),lines:cart(1)}),
  pc2.checkout({request_id:request(2),lines:cart(1)})
 ]);
 assert.equal(a.status,201);assert.equal(b.status,201);
 assert.equal(a.body.device_id,"trial-pc-01");
 assert.equal(b.body.device_id,"trial-pc-02");
 assert.notEqual(a.body.receipt_no,b.body.receipt_no);
 assert.notEqual(a.body.sale_id,b.body.sale_id);
 let x=await pc1.checkout({request_id:request(1),lines:cart(1)});
 assert.equal(x.status,200);
 assert.equal(x.body.reason,"idempotent_replay");
 assert.equal(x.body.sale_id,a.body.sale_id);
 await assert.rejects(()=>pc1.checkout({request_id:request(1),lines:cart(2)}),
  /request_id_cannot_change_basket/);
 // After SQL COMMIT, drop HTTP response. Client transparently retries with
 // EXACT same immutable basket/request ID and a fresh device HMAC nonce.
 dropNext=true;
 x=await pc2.checkout({request_id:request(3),lines:cart(1)});
 assert.equal(x.status,200);
 assert.equal(x.body.reason,"idempotent_replay");
 assert.equal(x.body.replayed,true);
 const after=await snapshot();
 assert.equal(after.sales,before.sales+3);
 assert.equal(after.outbox,before.outbox+3);
 assert.equal(Number(after.gross),Number(before.gross)+3*Number(before.price));
 assert.equal(Number(after.water),Number(before.water)-3);
 assert.equal(Number(after.water_lots),Number(before.water_lots)-3);
 const {rows}=await admin.query(
  "SELECT count(*)::integer AS qty,count(DISTINCT receipt_no)::integer AS receipts FROM zhirox_local.sales WHERE store_id=$1 AND request_id=ANY($2::uuid[])",
  [store,[request(1),request(2),request(3)]]);
 assert.equal(rows[0].qty,3);
 assert.equal(rows[0].receipts,3);
 console.log("V99 PASS: two independently signed trial PCs, WAN transport blocked, LAN-like local PostgreSQL sales continue, device HMAC replay/tamper blocked, ACK-loss retried identically, three receipts only.");
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await Promise.allSettled([authPool.end(),gatePool.end()]);
 for(const role of enabled.reverse()){
  try{await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`);}
  catch{console.error("V99 temporary SQL login cleanup failed",role);process.exitCode=1;}
 }
 await admin.end().catch(()=>{});
}
