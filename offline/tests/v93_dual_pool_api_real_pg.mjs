// V93 isolated CI integration: real distinct owner authentication + restricted
// PostgreSQL network login for read-only API data. No production deployment.
import assert from "node:assert/strict";
import http from "node:http";
import {once} from "node:events";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {createV93TestMarketHandler} from "../local-test-market-v93.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";
import {makeLocalSessionCodec} from "../local-session.mjs";

const EXPECT={
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY",
};
for(const [key,val] of Object.entries(EXPECT))
 assert.equal(process.env[key],val,`V93 CI safety check: ${key}`);
for(const name of ["PGPASSWORD","ZHIROX_TEST_OWNER_PASSWORD","ZHIROX_TEST_CASHIER_PASSWORD","ZHIROX_LOCAL_SESSION_SECRET"])
 assert.ok(process.env[name],`V93 CI requires ${name}`);

const role="zhirox_v93_api_reader";
const secret=randomBytes(32).toString("hex");
const pgOpts={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:15000};
const authPool=new pg.Pool({...pgOpts,user:"v80test",password:process.env.PGPASSWORD,max:2});
const readPool=new pg.Pool({...pgOpts,user:role,password:secret,max:4});
let enabled=false,server=null;
async function businessState(){
 const {rows}=await authPool.query(`
 SELECT
  (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS sales,
  (SELECT coalesce(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
  (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS outbox,
  (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS sugar,
  (SELECT coalesce(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90 WHERE store_id=$1 AND product_id=$2)::bigint AS lots,
  (SELECT count(*) FROM zhirox_local.sale_returns_v84 WHERE store_id=$1)::integer AS returns
 `,[TEST_MARKET.store,TEST_MARKET.product2]);
 return rows[0];
}
const send=async (origin,path,{token,method="GET",json}={})=>{
 const headers={...(token?{Authorization:"Bearer "+token}:{}),...(json?{"Content-Type":"application/json"}:{})};
 const resp=await fetch(origin+path,{method,headers,...(json?{body:JSON.stringify(json)}:{})});
 return {status:resp.status,body:await resp.json()};
};
async function forbiddenReadWrite(query,params=[]){
 try{await readPool.query(query,params);assert.fail("V93 role got forbidden operation: "+query)}
 catch(error){if(error.code!=="42501")throw error;}
}
try{
 const initial=await businessState();
 assert.deepEqual([Number(initial.sales),Number(initial.gross),Number(initial.outbox),Number(initial.sugar),Number(initial.lots)],
  [7,98000,7,1,1]);
 const check=(await authPool.query("SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=$1",[role])).rows;
 assert.equal(check.length,1);assert.equal(check[0].rolcanlogin,false);
 await authPool.query(`ALTER ROLE ${role} LOGIN PASSWORD '${secret}'`);
 enabled=true;
 const [{rows:[auth]}, {rows:[read]}]=await Promise.all([
  authPool.query("SELECT current_user AS actor,current_database() AS db"),
  readPool.query("SELECT current_user AS actor,current_database() AS db")
 ]);
 assert.equal(auth.actor,"v80test");assert.equal(read.actor,role);
 assert.equal(read.db,"zhirox_v80_disposable");
 await forbiddenReadWrite("SELECT * FROM zhirox_local.local_users");
 await forbiddenReadWrite("UPDATE zhirox_local.products SET stock_base_units=100 WHERE store_id=$1",[TEST_MARKET.store]);
 await forbiddenReadWrite("SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,gen_random_uuid(),$3::jsonb)",[
  TEST_MARKET.store,TEST_MARKET.cashier,JSON.stringify([{product_id:TEST_MARKET.product2,qty:1}])
 ]);
 // No V93 handler can use the auth owner pool for business reads.
 assert.throws(()=>createV93TestMarketHandler({authPool,readPool:authPool,
  secret:process.env.ZHIROX_LOCAL_SESSION_SECRET}),/separate_pools/);
 server=http.createServer(createV93TestMarketHandler({
  authPool,readPool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET
 }));
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const origin="http://127.0.0.1:"+server.address().port;
 let response=await send(origin,"/api/local/v93/stock");
 assert.equal(response.status,401);
 response=await send(origin,"/api/local/v93/stock",{method:"POST",json:{product_id:TEST_MARKET.product2,qty:100}});
 assert.equal(response.status,405);
 response=await send(origin,"/api/local/v93/refund",{method:"POST",json:{}});
 assert.equal(response.status,404);
 response=await send(origin,"/api/local/v93/stock?store_id=anything");
 assert.equal(response.status,400);
 response=await send(origin,"/api/local/v93/login",{method:"POST",json:{username:TEST_MARKET.cashierUsername,password:"bad",role:"owner"}});
 assert.equal(response.status,400);
 const cashierLogin=await send(origin,"/api/local/v93/login",{method:"POST",json:{
  username:TEST_MARKET.cashierUsername,password:process.env.ZHIROX_TEST_CASHIER_PASSWORD
 }});
 assert.equal(cashierLogin.status,200);
 assert.equal(cashierLogin.body.role,"cashier");
 const cashierToken=cashierLogin.body.token;
 const ownerLogin=await send(origin,"/api/local/v93/login",{method:"POST",json:{
  username:TEST_MARKET.ownerUsername,password:process.env.ZHIROX_TEST_OWNER_PASSWORD
 }});
 assert.equal(ownerLogin.status,200);
 assert.equal(ownerLogin.body.role,"owner");
 const ownerToken=ownerLogin.body.token;
 response=await send(origin,"/api/local/v93/stock",{token:cashierToken});
 assert.equal(response.status,200);
 assert.equal(response.body.source,"restricted_postgresql_v93");
 assert.equal(response.body.status,"read_only");
 assert.equal(response.body.stock.length,2);
 assert.equal(Number(response.body.stock.find(x=>x.product_id===TEST_MARKET.product2).tracked_lot_units),1);
 response=await send(origin,"/api/local/v93/lots",{token:cashierToken});
 assert.equal(response.status,403);
 response=await send(origin,"/api/local/v93/receipts",{token:cashierToken});
 assert.equal(response.status,403);
 response=await send(origin,"/api/local/v93/lots",{token:ownerToken});
 assert.equal(response.status,200);
 assert.ok(response.body.lots.some(x=>x.lot_code==="SUGAR-NEW-89"));
 response=await send(origin,"/api/local/v93/receipts",{token:ownerToken});
 assert.equal(response.status,200);
 assert.equal(response.body.receipts.length,7);
 assert.equal(response.body.receipts[0].receipt_no,"7");
 const codec=makeLocalSessionCodec(process.env.ZHIROX_LOCAL_SESSION_SECRET);
 const foreign=codec.issue({user_id:TEST_MARKET.owner,store_id:"10000000-0000-0000-0000-000000000001",role:"owner",session_version:1});
 response=await send(origin,"/api/local/v93/stock",{token:foreign});
 assert.equal(response.status,401);
 const probes=await Promise.all(Array.from({length:12},()=>send(origin,"/api/local/v93/stock",{token:cashierToken})));
 assert.ok(probes.every(x=>x.status===200&&x.body.stock.length===2));
 assert.deepEqual(await businessState(),initial,"V93 HTTP and denied DML altered business ledger");
 console.log("V93 PASS: actual test-market HTTP login + distinct PostgreSQL restricted role served 12 parallel GETs, manager limits, unknown store rejection and denied writes; V91 ledger unchanged.");
}finally{
 if(server)await new Promise(resolve=>server.close(()=>resolve()));
 await readPool.end().catch(()=>{});
 if(enabled)await authPool.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`).catch(error=>{
  console.error("V93 test-only role cleanup failure");process.exitCode=1;throw error;
 });
 await authPool.end().catch(()=>{});
}
