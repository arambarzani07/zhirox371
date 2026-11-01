// V98 real localhost HTTP + restricted PostgreSQL security acceptance.
// Fully synthetic market, no cash, physical stock movement or real deployment.
import assert from "node:assert/strict";
import http from "node:http";
import {once} from "node:events";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {createV98TestCheckoutHandler,assertV98GatePrivileges} from "../local-checkout-http-v98.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";
import {assertV94AuthPrivilegeBoundary} from "../local-test-market-v94.mjs";
import {makeLocalSessionCodec} from "../local-session.mjs";

for(const [k,v] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[k],v,"V98 test environment guard: "+k);
for(const k of ["PGPASSWORD","ZHIROX_TEST_CASHIER_PASSWORD",
 "ZHIROX_TEST_OWNER_PASSWORD","ZHIROX_LOCAL_SESSION_SECRET"])
 assert.ok(process.env[k],"V98 missing temporary trial key: "+k);
const store=TEST_MARKET.store,water=TEST_MARKET.product1,sugar=TEST_MARKET.product2;
const authRole="zhirox_v94_auth",gateRole="zhirox_v95_gate";
const passwords={auth:randomBytes(32).toString("hex"),gate:randomBytes(32).toString("hex")};
const conf={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:25000};
const admin=new pg.Pool({...conf,user:"v80test",password:process.env.PGPASSWORD,max:3});
const authPool=new pg.Pool({...conf,user:authRole,password:passwords.auth,max:3});
const gatePool=new pg.Pool({...conf,user:gateRole,password:passwords.gate,max:4});
const enabled=[];
let server,dropNext=false,dropResolved;
const api="/api/local/v98/";
const request=n=>"98000000-0000-4000-8000-00000000000"+n;
const basket=qty=>[{product_id:water,qty}];
async function snapshot(){
 const {rows:[x]}=await admin.query(`
 SELECT
 (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS sales,
 (SELECT coalesce(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
 (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS outbox,
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS water,
 (SELECT price_minor FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS price,
 (SELECT coalesce(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90
   WHERE store_id=$1 AND product_id=$2)::bigint AS water_lots,
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$3)::bigint AS sugar,
 (SELECT count(*) FROM zhirox_local.lot_checkouts_v90 WHERE store_id=$1)::integer AS lot_sales
 `,[store,water,sugar]);
 return x;
}
async function post(base,route,body,token){
 const r=await fetch(base+api+route,{
  method:"POST",headers:{"Content-Type":"application/json",
   ...(token?{Authorization:"Bearer "+token}:{})},
  body:JSON.stringify(body)});
 return {status:r.status,body:await r.json(),headers:r.headers};
}
async function noPrivilege(sql,params=[]){
 try{await gatePool.query(sql,params);assert.fail("Restricted gate unexpectedly succeeded: "+sql)}
 catch(e){assert.equal(e.code,"42501",sql)}
}
try{
 const before=await snapshot();
 assert.equal(before.sales,8);assert.equal(before.outbox,8);
 assert.equal(Number(before.sugar),0);
 assert.ok(Number(before.water)>=3);
 assert.equal(Number(before.water),Number(before.water_lots));
 const {rows:[key]}=await admin.query(
  "SELECT encode(secret_key,'hex') AS secret FROM zhirox_local.v96_proof_keys WHERE store_id=$1",
  [store]);
 assert.match(key.secret,/^[0-9a-f]{64}$/);
 for(const [role,pass] of [[authRole,passwords.auth],[gateRole,passwords.gate]]){
  const {rows:[r]}=await admin.query(
   "SELECT rolcanlogin,rolsuper,rolcreaterole FROM pg_catalog.pg_roles WHERE rolname=$1",[role]);
  assert.deepEqual(Object.values(r),[false,false,false]);
  await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${pass}'`);
  enabled.push(role);
 }
 await assertV94AuthPrivilegeBoundary(authPool);
 await assertV98GatePrivileges(gatePool);
 await noPrivilege("INSERT INTO zhirox_local.sales(store_id,id,request_id,receipt_no,cashier_id,total_minor) VALUES($1,gen_random_uuid(),gen_random_uuid(),999,$2,0)",[store,TEST_MARKET.cashier]);
 await noPrivilege("UPDATE zhirox_local.products SET stock_base_units=999 WHERE store_id=$1",[store]);
 await noPrivilege("SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
  [store,TEST_MARKET.cashier,request(1),JSON.stringify(basket(1))]);
 server=http.createServer(createV98TestCheckoutHandler({
  authPool,gatePool,sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,
  proofKeyHex:key.secret,
  afterCommittedForTest:async({res})=>{
   if(dropNext){
    dropNext=false;
    res.destroy();
    if(dropResolved)dropResolved();
   }
  }
 }));
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const base="http://127.0.0.1:"+server.address().port;
 let r=await fetch(base+api+"checkout");
 assert.equal(r.status,405);
 r=await fetch(base+api+"refund",{method:"POST"});
 assert.equal(r.status,404);
 r=await fetch(base+api+"checkout?store_id=anything",{method:"POST"});
 assert.equal(r.status,400);
 r=await post(base,"checkout",{request_id:request(1),lines:basket(1)});
 assert.equal(r.status,401);
 r=await post(base,"login",{username:TEST_MARKET.cashierUsername,password:"not-valid"});
 assert.equal(r.status,401);
 r=await post(base,"login",{username:TEST_MARKET.cashierUsername,
  password:process.env.ZHIROX_TEST_CASHIER_PASSWORD,role:"owner"});
 assert.equal(r.status,400);
 const cashier=await post(base,"login",{username:TEST_MARKET.cashierUsername,
  password:process.env.ZHIROX_TEST_CASHIER_PASSWORD});
 assert.equal(cashier.status,200);assert.equal(cashier.body.role,"cashier");
 const owner=await post(base,"login",{username:TEST_MARKET.ownerUsername,
  password:process.env.ZHIROX_TEST_OWNER_PASSWORD});
 assert.equal(owner.status,200);assert.equal(owner.body.role,"owner");
 const cashierToken=cashier.body.token,ownerToken=owner.body.token;
 r=await post(base,"checkout",{request_id:request(1),lines:basket(1),actor_id:TEST_MARKET.owner},cashierToken);
 assert.equal(r.status,400);
 r=await post(base,"checkout",{request_id:request(1),lines:basket(1)}, "forged");
 assert.equal(r.status,401);
 const foreign=makeLocalSessionCodec(process.env.ZHIROX_LOCAL_SESSION_SECRET)
  .issue({user_id:TEST_MARKET.cashier,store_id:"10000000-0000-0000-0000-000000000001",role:"cashier",session_version:1});
 r=await post(base,"checkout",{request_id:request(1),lines:basket(1)},foreign);
 assert.equal(r.status,401);
 // Two separate local cashiers: both compete for shared LAN-style SQL state.
 const [first,second]=await Promise.all([
  post(base,"checkout",{request_id:request(1),lines:basket(1)},cashierToken),
  post(base,"checkout",{request_id:request(2),lines:basket(1)},ownerToken)
 ]);
 for(const receipt of [first,second]){
  assert.equal(receipt.status,201);
  assert.equal(receipt.body.reason,"sale_committed");
  assert.equal(receipt.body.replayed,false);
  assert.equal(receipt.body.physical_payment_received,false);
 }
 assert.notEqual(first.body.sale_id,second.body.sale_id);
 assert.notEqual(String(first.body.receipt_no),String(second.body.receipt_no));
 // An unchanged request reissues a fresh DB HMAC proof, but gets the original sale.
 r=await post(base,"checkout",{request_id:request(1),lines:basket(1)},cashierToken);
 assert.equal(r.status,200);
 assert.equal(r.body.reason,"idempotent_replay");
 assert.equal(r.body.sale_id,first.body.sale_id);
 const twoCommitted=await snapshot();
 assert.equal(twoCommitted.sales,before.sales+2);
 assert.equal(twoCommitted.outbox,before.outbox+2);
 assert.equal(Number(twoCommitted.water),Number(before.water)-2);
 assert.equal(Number(twoCommitted.water_lots),Number(before.water_lots)-2);
 // The DB commits a third genuine synthetic receipt, but the socket drops
 // BEFORE its response reaches the client. Retry must NOT double-sell.
 dropNext=true;
 let dropped=false;
 const destroyed=new Promise(resolve=>{dropResolved=resolve;});
 try{await post(base,"checkout",{request_id:request(3),lines:basket(1)},cashierToken);}
 catch{dropped=true;}
 await destroyed;
 assert.equal(dropped,true,"test must lose HTTP ACK after committed database sale");
 const {rows:[lostSale]}=await admin.query(
  "SELECT id,receipt_no,total_minor FROM zhirox_local.sales WHERE store_id=$1 AND request_id=$2",
  [store,request(3)]);
 assert.ok(lostSale?.id);
 r=await post(base,"checkout",{request_id:request(3),lines:basket(1)},cashierToken);
 assert.equal(r.status,200);
 assert.equal(r.body.reason,"idempotent_replay");
 assert.equal(r.body.sale_id,lostSale.id);
 assert.equal(String(r.body.receipt_no),String(lostSale.receipt_no));
 // Reusing a completed request ID with a changed cart must not create another sale.
 r=await post(base,"checkout",{request_id:request(1),lines:basket(2)},cashierToken);
 assert.equal(r.status,409);
 assert.equal(r.body.reason,"checkout_rejected");
 const after=await snapshot();
 assert.equal(after.sales,before.sales+3);
 assert.equal(after.outbox,before.outbox+3);
 assert.equal(Number(after.gross),Number(before.gross)+3*Number(before.price));
 assert.equal(Number(after.water),Number(before.water)-3);
 assert.equal(Number(after.water_lots),Number(before.water_lots)-3);
 assert.equal(after.sugar,before.sugar);
 assert.equal(after.lot_sales,before.lot_sales+3);
 console.log("V98 PASS: two parallel signed HTTP checkouts, dropped response after COMMIT recovered by same-request retry, 3 true receipts/outbox, no duplicate stock decrement, direct SQL writes denied.");
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await Promise.allSettled([authPool.end(),gatePool.end()]);
 for(const role of enabled.reverse()){
  try{await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`)}
  catch{console.error("V98 ephemeral role cleanup failed:",role);process.exitCode=1;}
 }
 await admin.end().catch(()=>{});
}
