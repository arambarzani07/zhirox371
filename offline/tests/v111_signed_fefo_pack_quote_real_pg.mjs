// V111 real PostgreSQL proof-bound bundle/set quote against V97+V90 fixture.
// Non-fiscal, read-only: there is NO V111 package checkout route.
import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {createLocalAuthV3} from "../local-auth-v3.mjs";
import {createV97CheckoutProofIssuer} from "../proven-checkout-v97.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";

for(const [key,value] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[key],value,"V111 requires isolated V80 runner: "+key);
for(const key of ["PGPASSWORD","ZHIROX_TEST_CASHIER_PASSWORD","ZHIROX_LOCAL_SESSION_SECRET"])
 assert.ok(process.env[key],"V111 missing disposable test-only credential");
const db={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:25000};
const authPassword=randomBytes(32).toString("hex");
const gatePassword=randomBytes(32).toString("hex");
const admin=new pg.Pool({...db,user:"v80test",password:process.env.PGPASSWORD,max:2});
const authPool=new pg.Pool({...db,user:"zhirox_v94_auth",password:authPassword,max:2});
const gatePool=new pg.Pool({...db,user:"zhirox_v95_gate",password:gatePassword,max:2});
const nonceRequest=n=>"11100000-0000-4000-8000-00000000000"+n;
const lines=[
 {barcode:"V111-BUNDLE",qty:2},
 {barcode:"V111-SET",qty:1}
];
const snapshot=async()=>{
 const {rows:[v]}=await admin.query(`
 SELECT (SELECT count(*)::integer FROM zhirox_local.sales WHERE store_id=$1) AS sales,
 (SELECT coalesce(sum(total_minor),0)::bigint FROM zhirox_local.sales WHERE store_id=$1) AS money,
 (SELECT count(*)::integer FROM zhirox_local.sale_lines WHERE store_id=$1) AS lines,
 (SELECT count(*)::integer FROM zhirox_local.stock_ledger WHERE store_id=$1) AS ledger,
 (SELECT count(*)::integer FROM zhirox_local.event_outbox WHERE store_id=$1) AS events,
 (SELECT count(*)::integer FROM zhirox_local.lot_sale_allocations_v90 WHERE store_id=$1) AS allocations,
 (SELECT stock_base_units::bigint FROM zhirox_local.products WHERE store_id=$1 AND id=$2) AS water,
 (SELECT coalesce(sum(tracked_remaining),0)::bigint FROM zhirox_local.lot_inventory_v90 WHERE store_id=$1 AND product_id=$2) AS lots
 `,[TEST_MARKET.store,TEST_MARKET.product1]);
 return v;
};
const call=async(doc,changes={})=>{
 const {rows}=await gatePool.query(
  "SELECT * FROM zhirox_local.quote_proven_fefo_pack_v111($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)",
  [doc.store_id,changes.actor||doc.actor_id,changes.request||doc.request_id,
   JSON.stringify(changes.lines||doc.lines),JSON.stringify(changes.proof||doc.proof)]
 );
 assert.equal(rows.length,1);return rows[0];
};
const requireDenied=async(sql,args=[],code="42501")=>{
 try{await gatePool.query(sql,args);assert.fail("restricted SQL unexpectedly succeeded");}
 catch(error){assert.equal(error.code,code,sql)}
};
let originalVersion;
try{
 assert.equal((await snapshot()).sales,8,"V111 must run after V97 CI fixture");
 const {rows:[key]}=await admin.query(
  "SELECT encode(secret_key,'hex') AS key FROM zhirox_local.v96_proof_keys WHERE store_id=$1",
  [TEST_MARKET.store]);
 assert.match(key.key,/^[0-9a-f]{64}$/);
 const {rows:[account]}=await admin.query(
  "SELECT session_version FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier]);
 originalVersion=account.session_version;
 for(const [role,password] of [["zhirox_v94_auth",authPassword],["zhirox_v95_gate",gatePassword]]){
  await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
 }
 await requireDenied("SELECT * FROM zhirox_local.barcodes");
 await requireDenied("SELECT * FROM zhirox_local.lot_inventory_v90");
 await requireDenied("SELECT * FROM zhirox_local.v96_proof_keys");
 await requireDenied("UPDATE zhirox_local.products SET stock_base_units=1 WHERE store_id=$1",
  [TEST_MARKET.store]);
 await requireDenied("SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
  [TEST_MARKET.store,TEST_MARKET.cashier,nonceRequest(1),JSON.stringify([{product_id:TEST_MARKET.product1,qty:1}])]);
 const auth=createLocalAuthV3({pool:authPool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET});
 const accountLogin=await auth.login({
   store_id:TEST_MARKET.store,username:TEST_MARKET.cashierUsername,
   password:process.env.ZHIROX_TEST_CASHIER_PASSWORD
 });
 assert.equal(accountLogin.role,"cashier");
 const issue=createV97CheckoutProofIssuer({
  authPool,sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,proofKeyHex:key.key
 });
 const before=await snapshot();
 const p=await issue({token:accountLogin.token,request_id:nonceRequest(1),lines});
 assert.ok(p,"valid cashier should receive a signed server quote intent");
 const valid=await call(p);
 assert.equal(valid.eligible,true);
 assert.equal(valid.reason,"eligible_for_quote_only");
 assert.equal(Number(valid.total_minor),8200);
 assert.equal(Number(valid.required_base_units),15);
 assert.deepEqual(valid.line_quotes.map(x=>[x.mode,x.packs,x.units_per_pack,x.price_minor,x.base_units]),
  [["bundle",2,6,2700,12],["set",1,3,2800,3]]);
 // Same HMAC can quote twice because quotes DO NOT consume a sale nonce or hold stock.
 assert.deepEqual(await call(p),valid);
 assert.equal((await call(p,{actor:TEST_MARKET.owner})).reason,"invalid_signature");
 assert.equal((await call(p,{request:nonceRequest(2)})).reason,"invalid_signature");
 assert.equal((await call(p,{lines:[{barcode:"V111-SET",qty:1}]})).reason,"invalid_signature");
 assert.equal((await call(p,{proof:{...p.proof,mac:"0".repeat(64)}})).reason,"invalid_signature");
 assert.equal((await call(p,{proof:{...p.proof,exp:1700000000}})).reason,"expired_quote");
 // The signed account is live-checked even though its proof MAC is valid.
 await admin.query("UPDATE zhirox_local.local_users SET session_version=session_version+1 WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier]);
 assert.equal((await call(p)).reason,"actor_revoked_or_unauthorized");
 await admin.query("UPDATE zhirox_local.local_users SET session_version=$3 WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier,originalVersion]);

 // DB price is authoritative and independent of the underlying unit price.
 await admin.query("UPDATE zhirox_local.barcodes SET sale_price_minor=2900 WHERE store_id=$1 AND code='V111-SET'",
  [TEST_MARKET.store]);
 const repriced=await call(p);
 assert.equal(repriced.eligible,true);
 assert.equal(Number(repriced.total_minor),8300);
 await admin.query("UPDATE zhirox_local.barcodes SET sale_price_minor=2800 WHERE store_id=$1 AND code='V111-SET'",
  [TEST_MARKET.store]);

 const tooMany=await issue({
  token:accountLogin.token,request_id:nonceRequest(3),
  lines:[{barcode:"V111-BUNDLE",qty:5}]
 });
 const lacking=await call(tooMany);
 assert.equal(lacking.eligible,false);
 assert.equal(lacking.reason,"insufficient_nonexpired_lot_stock");
 assert.equal(Number(lacking.required_base_units),30);
 assert.equal((await call(await issue({
  token:accountLogin.token,request_id:nonceRequest(4),
  lines:[{barcode:"TESTV80-ITEM-001",qty:1}]
 }))).reason,"pack_not_registered");
 const fake=await issue({
  token:accountLogin.token,request_id:nonceRequest(5),
  lines:[{barcode:"V111-SET",qty:1,price_minor:1}]
 });
 assert.equal((await call(fake)).reason,"invalid_pack_line");
 // V97 does NOT support the pack price structure. A signed attempt
 // through its older sale route MUST be denied without financial writes.
 const prohibited=await issue({
  token:accountLogin.token,request_id:nonceRequest(6),lines
 });
 const {rows:[v97Denied]}=await gatePool.query(
  "SELECT * FROM zhirox_local.checkout_proven_fefo_v97($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)",
  [prohibited.store_id,prohibited.actor_id,prohibited.request_id,
   JSON.stringify(lines),JSON.stringify(prohibited.proof)]);
 assert.equal(v97Denied.approved,false);
 assert.equal(v97Denied.reason,"checkout_rejected");
 assert.deepEqual(await snapshot(),before,
   "quoting packs or rejecting V97 pack misuse must not change money, stock or LOTs");
 console.log("V111 PASS: signed pack prices, aggregate FEFO, authorization, tampering, rejected V97 pack checkout, zero sale mutations");
} finally {
 if(originalVersion!==undefined){
  await admin.query("UPDATE zhirox_local.local_users SET session_version=$3 WHERE store_id=$1 AND id=$2",
   [TEST_MARKET.store,TEST_MARKET.cashier,originalVersion]).catch(()=>{});
 }
 for(const role of ["zhirox_v94_auth","zhirox_v95_gate"])
  await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`).catch(()=>{});
 await Promise.allSettled([admin.end(),authPool.end(),gatePool.end()]);
}
