// Real three-role PostgreSQL CI proof: server-issued HMAC bound to a signed
// V94 session, actor UUID, request UUID, canonical cart and expiring nonce.
// NO financial checkout or cash transfer is performed.
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {createLocalAuthV3} from "../local-auth-v3.mjs";
import {createV96ProofIssuer} from "../actor-proof-issuer-v96.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";

for(const [name,expected] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[name],expected,"V96 isolated test gate "+name);
for(const name of ["PGPASSWORD","ZHIROX_TEST_CASHIER_PASSWORD",
 "ZHIROX_LOCAL_SESSION_SECRET"])assert.ok(process.env[name],"V96 CI key missing "+name);
const roleAuth="zhirox_v94_auth",roleGate="zhirox_v95_gate";
const passwordAuth=randomBytes(32).toString("hex");
const passwordGate=randomBytes(32).toString("hex");
const proofKeyHex=randomBytes(32).toString("hex");
const opts={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:4000,statement_timeout:15000};
const admin=new pg.Pool({...opts,user:"v80test",password:process.env.PGPASSWORD,max:2});
const authPool=new pg.Pool({...opts,user:roleAuth,password:passwordAuth,max:2});
const gatePool=new pg.Pool({...opts,user:roleGate,password:passwordGate,max:3});
const enabled=[];
const request=n=>`96000000-0000-4000-8000-00000000000${n}`;
const items=qty=>[{product_id:TEST_MARKET.product2,qty}];
async function state(){
 const {rows:[x]}=await admin.query(`
 SELECT (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS receipts,
 (SELECT coalesce(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
 (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS outbox,
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS sugar,
 (SELECT coalesce(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90
  WHERE store_id=$1 AND product_id=$2)::bigint AS lots,
 (SELECT count(*) FROM zhirox_local.sale_returns_v84 WHERE store_id=$1)::integer AS returns
 `,[TEST_MARKET.store,TEST_MARKET.product2]);
 return x;
}
async function checkSQL(sql,params=[],expect="42501"){
 try{await gatePool.query(sql,params);assert.fail("unexpected SQL permission: "+sql)}
 catch(e){assert.equal(e.code,expect,sql);}
}
async function decision(doc,opts={}){
 const {rows}=await gatePool.query(
  "SELECT allowed,reason,audit_id FROM zhirox_local.preflight_checkout_bound_v96($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)",
  [doc.store_id,opts.actor||doc.actor_id,opts.request||doc.request_id,
   JSON.stringify(opts.lines||doc.lines),JSON.stringify(opts.proof||doc.proof)]);
 assert.equal(rows.length,1);
 return rows[0];
}
try{
 const before=await state();
 assert.deepEqual([before.receipts,Number(before.gross),before.outbox,
  Number(before.sugar),Number(before.lots)],[7,98000,7,1,1]);
 await admin.query("INSERT INTO zhirox_local.v96_proof_keys(store_id,secret_key) VALUES($1::uuid,decode($2,'hex'))",
  [TEST_MARKET.store,proofKeyHex]);
 const checks=(await admin.query(
  "SELECT rolname,rolcanlogin,rolsuper,rolcreaterole FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])",
  [[roleAuth,roleGate]])).rows;
 assert.equal(checks.length,2);
 for(const row of checks){
  assert.equal(row.rolcanlogin,false);assert.equal(row.rolsuper,false);
  assert.equal(row.rolcreaterole,false);
 }
 for(const [role,password] of [[roleAuth,passwordAuth],[roleGate,passwordGate]]){
  await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
  enabled.push(role);
 }
 assert.equal((await authPool.query("SELECT current_user AS actor")).rows[0].actor,roleAuth);
 assert.equal((await gatePool.query("SELECT current_user AS actor")).rows[0].actor,roleGate);
 await checkSQL("SELECT * FROM zhirox_local.v96_proof_keys");
 await checkSQL("SELECT * FROM zhirox_local.local_users");
 await checkSQL("UPDATE zhirox_local.products SET stock_base_units=999 WHERE store_id=$1",
  [TEST_MARKET.store]);
 await checkSQL("SELECT * FROM zhirox_local.preflight_checkout_v95($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
  [TEST_MARKET.store,TEST_MARKET.cashier,request(1),JSON.stringify(items(1))]);
 await checkSQL("SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
  [TEST_MARKET.store,TEST_MARKET.cashier,request(1),JSON.stringify(items(1))]);
 const auth=createLocalAuthV3({pool:authPool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET});
 const bad=await auth.login({store_id:TEST_MARKET.store,username:TEST_MARKET.cashierUsername,
  password:"incorrect-local-test-password"});
 assert.equal(bad,null);
 const session=await auth.login({store_id:TEST_MARKET.store,username:TEST_MARKET.cashierUsername,
  password:process.env.ZHIROX_TEST_CASHIER_PASSWORD});
 assert.equal(session?.role,"cashier");
 const issuer=createV96ProofIssuer({authPool,
  sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,proofKeyHex});
 assert.equal(await issuer({token:"forged",request_id:request(1),lines:items(1)}),null);
 const proof=await issuer({token:session.token,request_id:request(1),lines:items(1)});
 assert.equal(proof?.actor_id,TEST_MARKET.cashier);
 assert.equal(proof?.store_id,TEST_MARKET.store);
 assert.match(proof.proof.mac,/^[a-f0-9]{64}$/);
 const accepted=await decision(proof);
 assert.equal(accepted.allowed,true);assert.equal(accepted.reason,"allowed");
 assert.equal((await decision(proof)).reason,"replayed_proof");
 assert.equal((await decision(proof,{actor:TEST_MARKET.owner})).reason,"invalid_signature");
 assert.equal((await decision(proof,{request:request(2)})).reason,"invalid_signature");
 assert.equal((await decision(proof,{lines:items(2)})).reason,"invalid_signature");
 const invalid={...proof.proof,mac:"0".repeat(64)};
 assert.equal((await decision(proof,{proof:invalid})).reason,"invalid_signature");
 const expired={...proof.proof,exp:1_700_000_000};
 assert.equal((await decision(proof,{proof:expired})).reason,"expired_or_long_lived_proof");
 const second=await issuer({token:session.token,request_id:request(3),lines:items(2)});
 assert.equal((await decision(second)).reason,"insufficient_saleable_lots");
 const {rows:audit}=await admin.query(
  "SELECT allowed,reason FROM zhirox_local.v96_proof_audit WHERE store_id=$1",[TEST_MARKET.store]);
 assert.equal(audit.length,8);
 assert.equal(audit.filter(x=>x.allowed).length,1);
 assert.equal(audit.filter(x=>!x.allowed).length,7);
 const {rows:legacy}=await admin.query("SELECT count(*)::integer AS n FROM zhirox_local.checkout_intent_audit_v95");
 assert.equal(legacy[0].n,6,"Only two proof-valid calls may invoke old V95 financial-data preflight");
 const {rows:used}=await admin.query("SELECT count(*)::integer AS n FROM zhirox_local.v96_used_nonces");
 assert.equal(used[0].n,2);
 assert.deepEqual(await state(),before,"Signed preflight modified real synthetic sale, inventory or outbox");
 console.log("V96 PASS: signed actor-bound DB proof; 1 allowed, 7 denied, nonce replay and tampering refused; zero sales or inventory mutations.");
}finally{
 await Promise.allSettled([gatePool.end(),authPool.end()]);
 for(const role of enabled.reverse()){
  try{await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`)}
  catch{console.error("V96 test database credential cleanup failed:",role);process.exitCode=1;}
 }
 await admin.end().catch(()=>{});
}
