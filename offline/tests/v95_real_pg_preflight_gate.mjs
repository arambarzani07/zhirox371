// V95: actual restricted SQL role evaluates only synthetic preflight intents.
// It never calls a sale/return mutation path and never makes a payment.
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import pg from "pg";

for(const [key,value] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[key],value,"V95 isolated test guard "+key);
assert.ok(process.env.PGPASSWORD);
const store="88000000-0000-4000-8000-000000000080";
const cashier="88000000-0000-4000-8000-000000000082";
const sugar="88000000-0000-4000-8000-000000000092";
const role="zhirox_v95_gate";
const tempPassword=randomBytes(32).toString("hex");
const opts={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:15000};
const admin=new pg.Client({...opts,user:"v80test",password:process.env.PGPASSWORD});
const gate=new pg.Client({...opts,user:role,password:tempPassword});
let enabled=false,connected=false;
const req=(n)=>"95000000-0000-4000-8000-00000000000"+n;
const stockLines=(qty)=>JSON.stringify([{product_id:sugar,qty}]);
const state=async()=>{
 const {rows:[x]}=await admin.query(`
 SELECT (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS sales,
 (SELECT coalesce(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
 (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS outbox,
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS stock
 `,[store,sugar]);
 return x;
};
const decision=async(actor,request,lines)=>{
 const {rows}=await gate.query(
  "SELECT allowed,reason,audit_id FROM zhirox_local.preflight_checkout_v95($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
  [store,actor,request,lines]);
 assert.equal(rows.length,1);
 assert.match(rows[0].audit_id,/^[0-9a-f-]{36}$/i);
 return rows[0];
};
const denied=async(sql,values=[])=>{
 try{await gate.query(sql,values);assert.fail("unexpected DB privilege")}
 catch(e){assert.equal(e.code,"42501",sql);}
};
try{
 await admin.connect();
 const before=await state();
 assert.deepEqual([before.sales,Number(before.gross),before.outbox,Number(before.stock)],[7,98000,7,1]);
 const {rows:[who]}=await admin.query("SELECT rolcanlogin,rolsuper FROM pg_catalog.pg_roles WHERE rolname=$1",[role]);
 assert.equal(who.rolcanlogin,false);assert.equal(who.rolsuper,false);
 await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${tempPassword}'`);
 enabled=true;
 await gate.connect();connected=true;
 assert.equal((await gate.query("SELECT current_user AS identity")).rows[0].identity,role);
 await denied("UPDATE zhirox_local.products SET stock_base_units=999 WHERE store_id=$1",[store]);
 await denied("SELECT * FROM zhirox_local.local_users");
 await denied("SELECT * FROM zhirox_local.checkout_intent_audit_v95");
 await denied("SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",[store,cashier,req("1"),stockLines(1)]);
 await denied("SET ROLE v80test");
 let d=await decision(cashier,req("1"),stockLines(1));
 assert.equal(d.allowed,true);assert.equal(d.reason,"allowed");
 d=await decision(cashier,req("2"),stockLines(2));
 assert.equal(d.allowed,false);assert.equal(d.reason,"insufficient_saleable_lots");
 d=await decision(cashier,req("3"),stockLines(0));
 assert.equal(d.allowed,false);assert.equal(d.reason,"invalid_lines");
 d=await decision("95000000-0000-4000-8000-000000000099",req("4"),stockLines(1));
 assert.equal(d.allowed,false);assert.equal(d.reason,"actor_not_permitted");
 const {rows:records}=await admin.query(
  "SELECT allowed,reason,line_count FROM zhirox_local.checkout_intent_audit_v95 WHERE store_id=$1 ORDER BY checked_at,audit_id",[store]);
 assert.equal(records.length,4);
 assert.deepEqual(records.map(x=>x.reason).sort(),[
  "actor_not_permitted","allowed","insufficient_saleable_lots","invalid_lines"]);
 assert.deepEqual(await state(),before,"Audit and preflight cannot alter sales/stock/outbox");
 console.log("V95 PASS: genuine constrained SQL role, 1 allow + 3 deny audit records; no stock or checkout effects.");
}finally{
 if(connected)await gate.end().catch(()=>{});
 if(enabled)await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`).catch(e=>{
  console.error("V95 role cleanup failed");process.exitCode=1;
 });
 await admin.end().catch(()=>{});
}
