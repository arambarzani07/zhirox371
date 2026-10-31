// V92: Real authenticated non-owner PostgreSQL session tests privilege denial.
// All login credentials are generated ephemerally; no real cashier access is enabled.
// This script is for the isolated PostgreSQL CI test market AFTER V91 transactions.
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import pg from "pg";

const required={
 PGHOST:"127.0.0.1",
 PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",
 ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY",
};
for(const [key,value] of Object.entries(required))
 assert.equal(process.env[key],value,`V92 unsafe database environment: ${key}`);
assert.ok(process.env.PGPASSWORD,"disposable test DB password required");
const store="88000000-0000-4000-8000-000000000080";
const cashier="88000000-0000-4000-8000-000000000082";
const sugar="88000000-0000-4000-8000-000000000092";
const role="zhirox_v92_viewer";
const ephemeralPassword=randomBytes(32).toString("hex");
const settings={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:15000};
const admin=new pg.Client({...settings,user:"v80test",password:process.env.PGPASSWORD});
const viewer=new pg.Client({...settings,user:role,password:ephemeralPassword});
let enabled=false,connected=false;

async function snapshot(){
 const {rows}=await admin.query(`
 SELECT
 (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS sales,
 (SELECT coalesce(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
 (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS events,
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS stock,
 (SELECT coalesce(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90
   WHERE store_id=$1 AND product_id=$2)::bigint AS tracked,
 (SELECT count(*) FROM zhirox_local.sale_returns_v84 WHERE store_id=$1)::integer AS returns
 `,[store,sugar]);
 return rows[0];
}
async function denied(query,params=[],expected="42501"){
 try{
  await viewer.query(query,params);
  assert.fail(`Unexpected privilege: ${query.slice(0,75)}`);
 }catch(error){
  if(error.code!==expected)throw error;
 }
}
try{
 await admin.connect();
 const {rows:guard}=await admin.query(`SELECT current_database() AS db,current_user AS actor,
 (SELECT count(*) FROM zhirox_local.stores) AS stores,
 (SELECT name FROM zhirox_local.stores WHERE id=$1) AS market,
 (SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=$2) AS initially_login`,
 [store,role]);
 assert.equal(guard[0].db,"zhirox_v80_disposable");
 assert.equal(guard[0].actor,"v80test");
 assert.equal(Number(guard[0].stores),1);
 assert.equal(guard[0].market,"مارکێتی تاقیکردنەوە");
 assert.equal(guard[0].initially_login,false);
 const before=await snapshot();
 assert.equal(Number(before.sales),7);
 assert.equal(Number(before.gross),98000);
 assert.equal(Number(before.stock),1);
 assert.equal(Number(before.tracked),1);
 const checks=await admin.query(
  "SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_catalog.pg_roles WHERE rolname=$1",[role]);
 assert.equal(checks.rows.length,1);
 for(const x of Object.values(checks.rows[0]))assert.equal(x,false);

 // V92 CI temporarily enables one random password for a real separate connection.
 // Finally always revokes the LOGIN capability and removes the password.
 await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${ephemeralPassword}'`);
 enabled=true;
 await viewer.connect();
 connected=true;
 const who=(await viewer.query("SELECT current_user AS actor,session_user AS login")).rows[0];
 assert.equal(who.actor,role);assert.equal(who.login,role);
 const stocks=(await viewer.query("SELECT product_id,stock_base_units,tracked_lot_units FROM zhirox_local.v92_stock_readonly")).rows;
 assert.equal(stocks.length,2);
 const s=stocks.find(x=>x.product_id===sugar);
 assert.equal(Number(s.stock_base_units),1);assert.equal(Number(s.tracked_lot_units),1);
 const totals=(await viewer.query("SELECT count(*)::integer AS n,coalesce(sum(total_minor),0)::bigint AS gross FROM zhirox_local.v92_receipts_readonly")).rows[0];
 assert.equal(totals.n,7);assert.equal(Number(totals.gross),98000);
 const lots=(await viewer.query("SELECT lot_code,tracked_remaining FROM zhirox_local.v92_lots_readonly WHERE lot_code='SUGAR-NEW-89'")).rows;
 assert.equal(lots.length,1);assert.equal(Number(lots[0].tracked_remaining),1);

 // From a genuine restricted login, base tables and secrets are not visible.
 await denied("SELECT * FROM zhirox_local.products LIMIT 1");
 await denied("SELECT password_hash FROM zhirox_local.local_users LIMIT 1");
 await denied("SELECT * FROM zhirox_local.sales LIMIT 1");
 await denied("SELECT * FROM zhirox_local.sale_returns_v84 LIMIT 1");
 await denied("UPDATE zhirox_local.products SET stock_base_units=100000 WHERE store_id=$1 AND id=$2",[store,sugar]);
 await denied("DELETE FROM zhirox_local.sales WHERE store_id=$1",[store]);
 await denied("INSERT INTO zhirox_local.sales (store_id,id,request_id,receipt_no,cashier_id,total_minor) VALUES ($1,gen_random_uuid(),gen_random_uuid(),999,$2,0)",[store,cashier]);
 await denied("CREATE TABLE zhirox_local.v92_evil_test (id integer)");
 await denied("SET ROLE v80test");
 await denied("SET SESSION AUTHORIZATION v80test");
 // A user-supplied routing custom GUC is not a security credential.
 await viewer.query("BEGIN");
 try{
  await viewer.query("SELECT set_config('zhirox.v88_fefo_route','test_v90_authorized',true)");
  await viewer.query("SAVEPOINT guarded");
  await denied("SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,gen_random_uuid(),$3::jsonb)",[store,cashier,JSON.stringify([{product_id:sugar,qty:1}])]);
  await viewer.query("ROLLBACK TO SAVEPOINT guarded");
  await denied("INSERT INTO zhirox_local.sales (store_id,id,request_id,receipt_no,cashier_id,total_minor) VALUES ($1,gen_random_uuid(),gen_random_uuid(),999,$2,0)",[store,cashier]);
  await viewer.query("ROLLBACK TO SAVEPOINT guarded");
  await viewer.query("COMMIT");
 }catch(error){await viewer.query("ROLLBACK");throw error;}
 assert.deepEqual(await snapshot(),before,"Non-owner security probes mutated the V91 business state");
 console.log("V92 PASS: a separately authenticated restricted PostgreSQL role can read fixed-store views, cannot view secrets, spoof stock, execute finance functions or exploit the GUC test flag.");
} finally{
 if(connected)await viewer.end().catch(()=>{});
 if(enabled)await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`).catch(error=>{
  console.error("V92 cleanup failed: the isolated CI viewer role may still permit login");
  process.exitCode=1;
  throw error;
 });
 await admin.end().catch(()=>{});
}
