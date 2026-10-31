// V94 genuine independent PostgreSQL auth role + HTTP session acceptance.
// Only synthetic test-market rows, CI loopback. No production DB, no payouts.
import assert from "node:assert/strict";
import http from "node:http";
import {once} from "node:events";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {createV93TestMarketHandler} from "../local-test-market-v93.mjs";
import {assertV94AuthPrivilegeBoundary} from "../local-test-market-v94.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";
import {makeLocalSessionCodec} from "../local-session.mjs";

for(const [key,value] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[key],value,"V94 isolated CI guard: "+key);
for(const key of ["PGPASSWORD","ZHIROX_TEST_OWNER_PASSWORD","ZHIROX_TEST_CASHIER_PASSWORD","ZHIROX_LOCAL_SESSION_SECRET"])
 assert.ok(process.env[key],"V94 missing CI test credential: "+key);
const authRole="zhirox_v94_auth",readerRole="zhirox_v93_api_reader";
const secrets={auth:randomBytes(32).toString("hex"),read:randomBytes(32).toString("hex")};
const settings={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",connectionTimeoutMillis:4000,statement_timeout:15000};
const admin=new pg.Pool({...settings,user:"v80test",password:process.env.PGPASSWORD,max:2});
const authPool=new pg.Pool({...settings,user:authRole,password:secrets.auth,max:3});
const readPool=new pg.Pool({...settings,user:readerRole,password:secrets.read,max:3});
const enabled=[];
let server;
async function queryState(){
 const {rows:[state]}=await admin.query(`
 SELECT
 (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS receipts,
 (SELECT COALESCE(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
 (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS outbox,
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS sugar_stock,
 (SELECT COALESCE(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90
  WHERE store_id=$1 AND product_id=$2)::bigint AS sugar_lots,
 (SELECT count(*) FROM zhirox_local.sale_returns_v84 WHERE store_id=$1)::integer AS returns
 `,[TEST_MARKET.store,TEST_MARKET.product2]);
 return state;
}
async function denied(pool,sql,params=[]){
 try{await pool.query(sql,params);assert.fail("Unexpected SQL privilege: "+sql)}
 catch(error){if(error.code!=="42501")throw error;}
}
async function httpReq(base,path,{method="GET",token,body}={}){
 const res=await fetch(base+path,{method,headers:{
  ...(token?{Authorization:"Bearer "+token}:{}),...(body?{"Content-Type":"application/json"}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
 return {status:res.status,json:await res.json()};
}
try{
 const before=await queryState();
 assert.deepEqual([Number(before.receipts),Number(before.gross),Number(before.outbox),
  Number(before.sugar_stock),Number(before.sugar_lots)],[7,98000,7,1,1]);
 const {rows:roles}=await admin.query(
  "SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])",[[authRole,readerRole]]);
 assert.equal(roles.length,2);
 for(const r of roles){
  assert.equal(r.rolcanlogin,false);assert.equal(r.rolsuper,false);
  assert.equal(r.rolcreatedb,false);assert.equal(r.rolcreaterole,false);
  assert.equal(r.rolbypassrls,false);
 }
 // No static passwords are committed; only ephemeral roles enabled inside CI.
 for(const [role,password] of [[authRole,secrets.auth],[readerRole,secrets.read]]){
  await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
  enabled.push(role);
 }
 assert.equal((await authPool.query("SELECT current_user AS actor")).rows[0].actor,authRole);
 assert.equal((await readPool.query("SELECT current_user AS actor")).rows[0].actor,readerRole);
 await assertV94AuthPrivilegeBoundary(authPool);
 // The auth role can lock rows and update failure counters, not prices or admin fields.
 await denied(authPool,"SELECT * FROM zhirox_local.products");
 await denied(authPool,"SELECT * FROM zhirox_local.sales");
 await denied(authPool,"SELECT * FROM zhirox_local.event_outbox");
 await denied(authPool,"SELECT * FROM zhirox_local.v92_stock_readonly");
 await denied(authPool,"UPDATE zhirox_local.products SET stock_base_units=999 WHERE store_id=$1",[TEST_MARKET.store]);
 await denied(authPool,"UPDATE zhirox_local.local_users SET role='owner' WHERE store_id=$1",[TEST_MARKET.store]);
 await denied(authPool,"UPDATE zhirox_local.local_users SET password_hash='forged' WHERE store_id=$1",[TEST_MARKET.store]);
 await denied(authPool,"DELETE FROM zhirox_local.local_users WHERE store_id=$1",[TEST_MARKET.store]);
 await denied(authPool,"SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,gen_random_uuid(),$3::jsonb)",[
  TEST_MARKET.store,TEST_MARKET.cashier,JSON.stringify([{product_id:TEST_MARKET.product2,qty:1}])
 ]);
 await denied(readPool,"SELECT password_hash FROM zhirox_local.local_users");
 // No privileged auth pool is passed to HTTP handler.
 server=http.createServer(createV93TestMarketHandler({
  authPool,readPool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET,
  expectedAuthRole:authRole,routePrefix:"/api/local/v94/"
 }));
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const base="http://127.0.0.1:"+server.address().port;
 assert.equal((await httpReq(base,"/api/local/v94/stock")).status,401);
 assert.equal((await httpReq(base,"/api/local/v94/stock",{method:"POST",body:{qty:30}})).status,405);
 assert.equal((await httpReq(base,"/api/local/v94/refund",{method:"POST",body:{}})).status,404);
 assert.equal((await httpReq(base,"/api/local/v93/stock")).status,404);
 const bad=await httpReq(base,"/api/local/v94/login",{method:"POST",
  body:{username:TEST_MARKET.cashierUsername,password:"wrong-password"}});
 assert.equal(bad.status,401);
 const {rows:[fail]}=await admin.query(
  "SELECT failed_attempts FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier]);
 assert.equal(fail.failed_attempts,1,"Restricted auth login should increment failure count");
 const cashier=await httpReq(base,"/api/local/v94/login",{method:"POST",
  body:{username:TEST_MARKET.cashierUsername,password:process.env.ZHIROX_TEST_CASHIER_PASSWORD}});
 assert.equal(cashier.status,200);
 assert.equal(cashier.json.role,"cashier");
 const owner=await httpReq(base,"/api/local/v94/login",{method:"POST",
  body:{username:TEST_MARKET.ownerUsername,password:process.env.ZHIROX_TEST_OWNER_PASSWORD}});
 assert.equal(owner.status,200);
 assert.equal(owner.json.role,"owner");
 const {rows:[reset]}=await admin.query(
  "SELECT failed_attempts FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier]);
 assert.equal(reset.failed_attempts,0,"Good login must reset failed attempt counter");
 const stock=await httpReq(base,"/api/local/v94/stock",{token:cashier.json.token});
 assert.equal(stock.status,200);
 assert.equal(stock.json.source,"restricted_postgresql_v93");
 assert.equal(stock.json.status,"read_only");
 assert.equal(Number(stock.json.stock.find(x=>x.product_id===TEST_MARKET.product2)?.stock_base_units),1);
 assert.equal((await httpReq(base,"/api/local/v94/lots",{token:cashier.json.token})).status,403);
 assert.equal((await httpReq(base,"/api/local/v94/receipts",{token:cashier.json.token})).status,403);
 const receipts=await httpReq(base,"/api/local/v94/receipts",{token:owner.json.token});
 assert.equal(receipts.status,200);assert.equal(receipts.json.receipts.length,7);
 assert.equal((await httpReq(base,"/api/local/v94/lots",{token:owner.json.token})).status,200);
 const foreign=makeLocalSessionCodec(process.env.ZHIROX_LOCAL_SESSION_SECRET).issue({
  user_id:TEST_MARKET.owner,store_id:"10000000-0000-0000-0000-000000000001",role:"owner",session_version:1});
 assert.equal((await httpReq(base,"/api/local/v94/stock",{token:foreign})).status,401);
 const parallel=await Promise.all(Array.from({length:10},()=>
  httpReq(base,"/api/local/v94/stock",{token:cashier.json.token})));
 assert.ok(parallel.every(x=>x.status===200&&x.json.stock.length===2));
 assert.deepEqual(await queryState(),before,"V94 restricted authentication changed financial trial records");
 console.log("V94 PASS: two distinct non-owner SQL logins, failed/successful local account auth, no forged prices/stock/roles, signed read-only routes, immutable V91 financial state.");
}finally{
 if(server)await new Promise(resolve=>server.close(()=>resolve()));
 await Promise.allSettled([authPool.end(),readPool.end()]);
 for(const role of enabled.reverse()){
  try{await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`)}
  catch(e){console.error("V94 temporary login cleanup FAILED for role",role);
   process.exitCode=1;}
 }
 await admin.end().catch(()=>{});
}
