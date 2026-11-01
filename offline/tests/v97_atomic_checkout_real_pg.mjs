// V97: Real isolated PostgreSQL atomic FEFO sale under a restricted actor gate.
// Synthetic trial data only. No exposed payment endpoint or physical settlement.
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {createLocalAuthV3} from "../local-auth-v3.mjs";
import {createV97CheckoutProofIssuer,createV97TestCheckoutAdapter} from "../proven-checkout-v97.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";

for(const [key,value] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[key],value,"V97 must run only in disposable CI: "+key);
for(const key of ["PGPASSWORD","ZHIROX_TEST_CASHIER_PASSWORD","ZHIROX_LOCAL_SESSION_SECRET"])
 assert.ok(process.env[key],"Missing isolated test key "+key);
const authRole="zhirox_v94_auth",gateRole="zhirox_v95_gate";
const authPassword=randomBytes(32).toString("hex");
const gatePassword=randomBytes(32).toString("hex");
const db={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:25000};
const admin=new pg.Pool({...db,user:"v80test",password:process.env.PGPASSWORD,max:2});
const authPool=new pg.Pool({...db,user:authRole,password:authPassword,max:2});
const gatePool=new pg.Pool({...db,user:gateRole,password:gatePassword,max:4});
const enabled=[];
const request=n=>"97000000-0000-4000-8000-00000000000"+n;
const cart=qty=>[{product_id:TEST_MARKET.product2,qty}];
let originalVersion;
const summary=async()=>{
 const {rows:[x]}=await admin.query(`
 SELECT
 (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1)::integer AS sales,
 (SELECT coalesce(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1)::bigint AS gross,
 (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1)::integer AS events,
 (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS stock,
 (SELECT price_minor FROM zhirox_local.products WHERE store_id=$1 AND id=$2)::bigint AS price,
 (SELECT coalesce(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90
   WHERE store_id=$1 AND product_id=$2)::bigint AS lots,
 (SELECT count(*) FROM zhirox_local.lot_checkouts_v90 WHERE store_id=$1)::integer AS lot_sales,
 (SELECT count(*) FROM zhirox_local.sale_returns_v84 WHERE store_id=$1)::integer AS returns
 `,[TEST_MARKET.store,TEST_MARKET.product2]);
 return x;
};
const denied=async(sql,params=[],code="42501")=>{
 try{await gatePool.query(sql,params);assert.fail("Forbidden restricted SQL succeeded: "+sql)}
 catch(err){assert.equal(err.code,code,sql)}
};
async function call(doc,overrides={}){
 const {rows}=await gatePool.query(
  "SELECT * FROM zhirox_local.checkout_proven_fefo_v97($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)",
  [doc.store_id,overrides.actor||doc.actor_id,overrides.request||doc.request_id,
   JSON.stringify(overrides.lines||doc.lines),JSON.stringify(overrides.proof||doc.proof)]
 );
 assert.equal(rows.length,1);
 return rows[0];
}
try{
 const before=await summary();
 assert.equal(before.sales,7);
 assert.equal(Number(before.gross),98000);
 assert.equal(before.events,7);
 assert.equal(Number(before.stock),1);
 assert.equal(Number(before.lots),1);
 const {rows:[account]}=await admin.query(
  "SELECT session_version FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier]);
 originalVersion=account.session_version;
 const {rows:[keyRow]}=await admin.query(
  "SELECT encode(secret_key,'hex') AS hmac_key FROM zhirox_local.v96_proof_keys WHERE store_id=$1",
  [TEST_MARKET.store]);
 assert.match(keyRow.hmac_key,/^[0-9a-f]{64}$/);
 for(const [role,password] of [[authRole,authPassword],[gateRole,gatePassword]]){
  const {rows:[r]}=await admin.query(
   "SELECT rolcanlogin,rolsuper,rolcreaterole,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=$1",[role]);
  assert.deepEqual(Object.values(r),[false,false,false,false]);
  await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
  enabled.push(role);
 }
 assert.equal((await authPool.query("SELECT current_user AS who")).rows[0].who,authRole);
 assert.equal((await gatePool.query("SELECT current_user AS who")).rows[0].who,gateRole);
 await denied("SELECT * FROM zhirox_local.sales");
 await denied("SELECT password_hash FROM zhirox_local.local_users");
 await denied("SELECT * FROM zhirox_local.v96_proof_keys");
 await denied("SELECT * FROM zhirox_local.v97_checkout_audit");
 await denied("UPDATE zhirox_local.products SET stock_base_units=900 WHERE store_id=$1",
  [TEST_MARKET.store]);
 await denied("SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
  [TEST_MARKET.store,TEST_MARKET.cashier,request(1),JSON.stringify(cart(1))]);
 await denied("SELECT * FROM zhirox_local.preflight_checkout_bound_v96($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)",
  [TEST_MARKET.store,TEST_MARKET.cashier,request(1),JSON.stringify(cart(1)),JSON.stringify({})]);
 await denied("SET ROLE v80test");
 const localAuth=createLocalAuthV3({pool:authPool,
  secret:process.env.ZHIROX_LOCAL_SESSION_SECRET});
 const signedIn=await localAuth.login({store_id:TEST_MARKET.store,
  username:TEST_MARKET.cashierUsername,
  password:process.env.ZHIROX_TEST_CASHIER_PASSWORD});
 assert.equal(signedIn.role,"cashier");
 const issue=createV97CheckoutProofIssuer({
  authPool,sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,
  proofKeyHex:keyRow.hmac_key});
 assert.equal(await issue({token:"fake",request_id:request(1),lines:cart(1)}),null);
 const p=await issue({token:signedIn.token,request_id:request(1),lines:cart(1)});
 assert.equal(p.actor_id,TEST_MARKET.cashier);
 assert.equal(p.proof.sv,originalVersion);
 assert.equal((await call(p,{actor:TEST_MARKET.owner})).reason,"invalid_signature");
 assert.equal((await call(p,{request:request(2)})).reason,"invalid_signature");
 assert.equal((await call(p,{lines:cart(2)})).reason,"invalid_signature");
 assert.equal((await call(p,{proof:{...p.proof,mac:"0".repeat(64)}})).reason,"invalid_signature");
 assert.equal((await call(p,{proof:{...p.proof,exp:1700000000}})).reason,"expired_or_long_lived_proof");
 assert.equal((await call(p,{proof:{...p.proof,sv:p.proof.sv+1}})).reason,"invalid_signature");
 assert.deepEqual(await summary(),before,"Bad signature unexpectedly changed sale or stock");
 // Independently revoke the actor at the DB level AFTER a genuine proof
 // was issued. This must deny the old signed session without burning nonce.
 await admin.query("UPDATE zhirox_local.local_users SET session_version=session_version+1 WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier]);
 assert.equal((await call(p)).reason,"actor_revoked_or_unauthorized");
 await admin.query("UPDATE zhirox_local.local_users SET session_version=$3 WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier,originalVersion]);
 // Two independently signed attempts race for the final synthetic sugar unit.
 const pRace=await Promise.all([2,3].map(n=>
  issue({token:signedIn.token,request_id:request(n),lines:cart(1)})));
 const [a,b]=await Promise.all(pRace.map(doc=>call(doc)));
 const pair=[a,b];
 assert.equal(pair.filter(x=>x.approved).length,1,"Exactly one final-unit checkout should commit");
 assert.equal(pair.filter(x=>!x.approved).length,1,"Oversell attempt must be rejected");
 const winner=pair.find(x=>x.approved);
 const loser=pair.find(x=>!x.approved);
 assert.equal(winner.reason,"sale_committed");
 assert.equal(winner.replayed,false);
 assert.equal(loser.reason,"checkout_rejected");
 assert.equal(loser.sale_id,null);
 assert.equal((await call(pRace[pair.indexOf(winner)])).reason,"replayed_proof");
 const after=await summary();
 assert.equal(after.sales,8);
 assert.equal(after.events,8);
 assert.equal(Number(after.stock),0);
 assert.equal(Number(after.lots),0);
 assert.equal(Number(after.gross),Number(before.gross)+Number(before.price));
 assert.equal(after.lot_sales,before.lot_sales+1);
 assert.equal(after.returns,before.returns);
 const {rows:[sale]}=await admin.query(
  "SELECT total_minor,receipt_no,request_id,cashier_id FROM zhirox_local.sales WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,winner.sale_id]);
 assert.equal(Number(sale.total_minor),Number(before.price));
 assert.equal(sale.cashier_id,TEST_MARKET.cashier);
 assert.equal(String(sale.receipt_no),String(winner.receipt_no));
 const {rows:[alloc]}=await admin.query(
  "SELECT sum(quantity_base_units)::bigint AS qty FROM zhirox_local.lot_sale_allocations_v90 WHERE store_id=$1 AND sale_id=$2",
  [TEST_MARKET.store,winner.sale_id]);
 assert.equal(Number(alloc.qty),1);
 // Retried request gets a *new* HMAC/nonce and V90 returns the same receipt,
 // without repeating any committed stock, inventory or outbox mutation.
 const retry=await issue({token:signedIn.token,
  request_id:pair.indexOf(winner)===0?request(2):request(3),lines:cart(1)});
 const replay=await call(retry);
 assert.equal(replay.approved,true);
 assert.equal(replay.reason,"idempotent_replay");
 assert.equal(replay.replayed,true);
 assert.equal(replay.sale_id,winner.sale_id);
 assert.deepEqual(await summary(),after,"Idempotent retry double-booked stock or cash");
 const {rows:audit}=await admin.query(
  "SELECT approved,reason FROM zhirox_local.v97_checkout_audit WHERE store_id=$1",
  [TEST_MARKET.store]);
 const reasons=audit.map(x=>x.reason);
 assert.equal(reasons.length,12);
 assert.equal(reasons.filter(x=>x==="sale_committed").length,1);
 assert.equal(reasons.filter(x=>x==="idempotent_replay").length,1);
 assert.equal(reasons.filter(x=>x==="checkout_rejected").length,1);
 assert.equal(reasons.filter(x=>x==="replayed_proof").length,1);
 assert.equal(reasons.filter(x=>x==="actor_revoked_or_unauthorized").length,1);
 console.log("V97 PASS: one signed atomic trial checkout, one denied competing checkout, one idempotent retry, stock & LOT 1=>0, receipt/outbox exactly once; privilege and session revocation enforced.");
}finally{
 // Restore any temporarily bumped account session_version; all other synthetic
 // business data intentionally persists in the test snapshot.
 if(originalVersion!==undefined)await admin.query(
  "UPDATE zhirox_local.local_users SET session_version=$3 WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier,originalVersion]).catch(()=>{process.exitCode=1});
 await Promise.allSettled([gatePool.end(),authPool.end()]);
 for(const role of enabled.reverse()){
  try{await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`)}
  catch{console.error("V97 temporary PostgreSQL login cleanup failure",role);process.exitCode=1;}
 }
 await admin.end().catch(()=>{});
}
