// V112 actual restricted PostgreSQL TEST checkout after V98-V104 fixture.
// Uses synthetic store data only; no physical cash, production writes or printer.
// Requires V111 sample barcodes and V90 nonexpired remaining test water LOTs.
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import pg from "pg";
import {createLocalAuthV3} from "../local-auth-v3.mjs";
import {createV97CheckoutProofIssuer} from "../proven-checkout-v97.mjs";
import {createV112SignedPackCheckoutAdapter} from "../proven-pack-checkout-v112.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";

for(const [key,value] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
}))assert.equal(process.env[key],value,"V112 requires exact isolated runner: "+key);
for(const key of ["PGPASSWORD","ZHIROX_TEST_CASHIER_PASSWORD","ZHIROX_TEST_OWNER_PASSWORD","ZHIROX_LOCAL_SESSION_SECRET"])
 assert.ok(process.env[key],"Missing disposable CI-only test credential");
const db={host:"127.0.0.1",port:5432,database:"zhirox_v80_disposable",
 connectionTimeoutMillis:5000,statement_timeout:25000};
const authPassword=randomBytes(32).toString("hex");
const gatePassword=randomBytes(32).toString("hex");
const admin=new pg.Pool({...db,user:"v80test",password:process.env.PGPASSWORD,max:3});
const authPool=new pg.Pool({...db,user:"zhirox_v94_auth",password:authPassword,max:3});
const gatePool=new pg.Pool({...db,user:"zhirox_v95_gate",password:gatePassword,max:5});
const id=n=>"11200000-0000-4000-8000-00000000000"+n;
const basket=[{barcode:"V111-BUNDLE",qty:1},{barcode:"V111-SET",qty:1}];
const set=[{barcode:"V111-SET",qty:1}];
const summary=async()=>{
 const {rows:[s]}=await admin.query(`
 SELECT (SELECT count(*)::integer FROM zhirox_local.sales WHERE store_id=$1) AS sales,
 (SELECT count(*)::integer FROM zhirox_local.event_outbox WHERE store_id=$1) AS events,
 (SELECT count(*)::integer FROM zhirox_local.sale_lines WHERE store_id=$1) AS lines,
 (SELECT count(*)::integer FROM zhirox_local.stock_ledger WHERE store_id=$1) AS ledger,
 (SELECT count(*)::integer FROM zhirox_local.lot_sale_allocations_v90 WHERE store_id=$1) AS allocations,
 (SELECT count(*)::integer FROM zhirox_local.sale_returns_v84 WHERE store_id=$1) AS returns,
 (SELECT coalesce(sum(total_minor),0)::bigint FROM zhirox_local.sales WHERE store_id=$1) AS gross,
 (SELECT stock_base_units::bigint FROM zhirox_local.products WHERE store_id=$1 AND id=$2) AS stock,
 (SELECT coalesce(sum(tracked_remaining),0)::bigint FROM zhirox_local.lot_inventory_v90
     WHERE store_id=$1 AND product_id=$2) AS lots
 `,[TEST_MARKET.store,TEST_MARKET.product1]);
 return s;
};
const denied=async(sql,args=[],errorCode="42501")=>{
 try{await gatePool.query(sql,args);assert.fail("Privileged SQL unexpectedly granted: "+sql);}
 catch(error){assert.equal(error.code,errorCode,sql);}
};
const call=async(doc,overrides={})=>{
 const {rows}=await gatePool.query(
  "SELECT * FROM zhirox_local.checkout_proven_pack_fefo_v112($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)",
  [doc.store_id,overrides.actor||doc.actor_id,overrides.request||doc.request_id,
   JSON.stringify(overrides.lines||doc.lines),JSON.stringify(overrides.proof||doc.proof)]
 );
 assert.equal(rows.length,1);return rows[0];
};
let originalVersion;
let originalSetPrice;
try{
 const before=await summary();
 assert.equal(before.sales,20,"V112 must run AFTER V101 private-NIC + V104 watcher");
 assert.equal(before.events,20);
 assert.equal(Number(before.stock),12,"V112 expected 12 remaining synthetic water units");
 assert.equal(Number(before.lots),12);
 const {rows:[key]}=await admin.query(
  "SELECT encode(secret_key,'hex') AS secret FROM zhirox_local.v96_proof_keys WHERE store_id=$1",
  [TEST_MARKET.store]);
 assert.match(key.secret,/^[0-9a-f]{64}$/);
 const {rows:[account]}=await admin.query(
  "SELECT session_version FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier]);
 originalVersion=account.session_version;
 const {rows:[productPrice]}=await admin.query(
  "SELECT sale_price_minor::bigint AS value FROM zhirox_local.barcodes WHERE store_id=$1 AND code='V111-SET'",
  [TEST_MARKET.store]);
 originalSetPrice=Number(productPrice.value);
 assert.equal(originalSetPrice,2800);
 for(const [role,password] of [["zhirox_v94_auth",authPassword],["zhirox_v95_gate",gatePassword]])
  await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`);
 await denied("SELECT * FROM zhirox_local.v112_pack_checkouts");
 await denied("SELECT * FROM zhirox_local.v96_proof_keys");
 await denied("SELECT * FROM zhirox_local.sales");
 await denied("UPDATE zhirox_local.products SET stock_base_units=900 WHERE store_id=$1",
  [TEST_MARKET.store]);
 await denied("SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
  [TEST_MARKET.store,TEST_MARKET.cashier,id(1),JSON.stringify([{product_id:TEST_MARKET.product1,qty:1}])]);
 const auth=createLocalAuthV3({pool:authPool,
  secret:process.env.ZHIROX_LOCAL_SESSION_SECRET});
 const signedIn=await auth.login({store_id:TEST_MARKET.store,
  username:TEST_MARKET.cashierUsername,
  password:process.env.ZHIROX_TEST_CASHIER_PASSWORD});
 assert.equal(signedIn.role,"cashier");
 const signedOwner=await auth.login({store_id:TEST_MARKET.store,
  username:TEST_MARKET.ownerUsername,
  password:process.env.ZHIROX_TEST_OWNER_PASSWORD});
 assert.equal(signedOwner.role,"owner");
 const issue=createV97CheckoutProofIssuer({
  authPool,sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,
  proofKeyHex:key.secret
 });
 const checkout=createV112SignedPackCheckoutAdapter({
  authPool,gatePool,sessionSecret:process.env.ZHIROX_LOCAL_SESSION_SECRET,
  proofKeyHex:key.secret
 });
 const prepared=await checkout.prepare({
  token:signedIn.token,request_id:id(1),lines:basket
 });
 assert.equal(prepared.eligible,true);
 assert.equal(prepared.checkout_authorized,false);
 assert.equal(Number(prepared.total_minor),5500);
 assert.deepEqual(prepared.prepared_lines,[
  {barcode:"V111-BUNDLE",qty:1,expected_price_minor:2700,expected_units_per_pack:6},
  {barcode:"V111-SET",qty:1,expected_price_minor:2800,expected_units_per_pack:3}
 ]);
 assert.deepEqual(await summary(),before,"Preparation must never mutate money or stock");
 // Session, actor, payload, SKU mode and price are covered by HMAC.
 const proof=await issue({token:signedIn.token,request_id:id(1),
  lines:prepared.prepared_lines});
 assert.equal((await call(proof,{actor:TEST_MARKET.owner})).reason,"invalid_signature");
 assert.equal((await call(proof,{request:id(2)})).reason,"invalid_signature");
 assert.equal((await call(proof,{lines:[
  {...prepared.prepared_lines[0],expected_price_minor:1},prepared.prepared_lines[1]
 ]})).reason,"invalid_signature");
 assert.equal((await call(proof,{lines:[
  {...prepared.prepared_lines[0],expected_units_per_pack:2},prepared.prepared_lines[1]
 ]})).reason,"invalid_signature");
 assert.equal((await call(proof,{proof:{...proof.proof,mac:"0".repeat(64)}})).reason,"invalid_signature");
 assert.equal((await call(proof,{proof:{...proof.proof,exp:1700000000}})).reason,"expired_or_long_lived_proof");
 assert.deepEqual(await summary(),before,"HMAC tampering unexpectedly created a sale");
 // Signed but STALE server price fails atomically, even with free stock.
 const stale=await issue({token:signedIn.token,request_id:id(3),
  lines:prepared.prepared_lines});
 await admin.query("UPDATE zhirox_local.barcodes SET sale_price_minor=2900 WHERE store_id=$1 AND code='V111-SET'",
  [TEST_MARKET.store]);
 const refusedPrice=await call(stale);
 assert.equal(refusedPrice.approved,false);
 assert.equal(refusedPrice.reason,"pack_checkout_rejected");
 assert.deepEqual(await summary(),before,"Changed pack price must never charge stale quote");
 await admin.query("UPDATE zhirox_local.barcodes SET sale_price_minor=$2 WHERE store_id=$1 AND code='V111-SET'",
  [TEST_MARKET.store,originalSetPrice]);
 // Revoke authenticated actor after proof was issued; old proof must fail.
 const revokable=await issue({token:signedIn.token,request_id:id(4),
  lines:prepared.prepared_lines});
 await admin.query("UPDATE zhirox_local.local_users SET session_version=session_version+1 WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier]);
 assert.equal((await call(revokable)).reason,"actor_revoked_or_unauthorized");
 await admin.query("UPDATE zhirox_local.local_users SET session_version=$3 WHERE store_id=$1 AND id=$2",
  [TEST_MARKET.store,TEST_MARKET.cashier,originalVersion]);
 assert.equal((await checkout({token:signedIn.token,request_id:id(5),prepared_lines:[
  {...prepared.prepared_lines[0],qty:0}
 ]})).reason,"invalid_prepared_pack_intent");
 // Two DIFFERENT authenticated principals race to sell the same 9 eligible
 // water base units. Two sales would require 18, so exactly one may commit.
 // The global quantity 12 includes 2 expired units that FEFO excludes.
 const ownerPrepared=await checkout.prepare({
  token:signedOwner.token,request_id:id(6),lines:basket
 });
 assert.equal(ownerPrepared.eligible,true);
 const [cashierAttempt,ownerAttempt]=await Promise.all([
  checkout({token:signedIn.token,request_id:id(1),
   prepared_lines:prepared.prepared_lines}),
  checkout({token:signedOwner.token,request_id:id(6),
   prepared_lines:ownerPrepared.prepared_lines})
 ]);
 const pair=[cashierAttempt,ownerAttempt];
 assert.equal(pair.filter(x=>x.approved).length,1,
  "Exactly one of two signed cashier/owner competing checkouts may commit");
 assert.equal(pair.filter(x=>!x.approved).length,1,
  "Second competing checkout must NOT oversell nonexpired FEFO lots");
 assert.equal(pair.find(x=>!x.approved).reason,"pack_checkout_rejected");
 const cashierWon=cashierAttempt.approved===true;
 const sold=pair.find(x=>x.approved);
 const soldToken=cashierWon?signedIn.token:signedOwner.token;
 const soldRequest=cashierWon?id(1):id(6);
 const soldPrepared=cashierWon?prepared.prepared_lines:ownerPrepared.prepared_lines;
 assert.equal(sold.approved,true);
 assert.equal(sold.replayed,false);
 assert.equal(sold.reason,"pack_sale_committed");
 assert.equal(Number(sold.total_minor),5500);
 assert.equal(sold.scope,"disposable_test_only");
 assert.equal(sold.payment_settled,false);
 assert.equal(sold.refund_authorized,false);
 const afterSale=await summary();
 assert.equal(afterSale.sales,before.sales+1);
 assert.equal(afterSale.events,before.events+1);
 assert.equal(afterSale.lines,before.lines+2);
 assert.equal(afterSale.ledger,before.ledger+1);
 assert.equal(afterSale.allocations,before.allocations+2);
 assert.equal(Number(afterSale.gross),Number(before.gross)+5500);
 assert.equal(Number(afterSale.stock),3);
 assert.equal(Number(afterSale.lots),3);
 const {rows:linesSnapshot}=await admin.query(
  "SELECT line_no,barcode_snapshot,sale_mode_snapshot,scan_quantity,pack_size_snapshot,quantity_base_units,unit_price_minor,line_total_minor,name_snapshot FROM zhirox_local.sale_lines WHERE store_id=$1 AND sale_id=$2 ORDER BY line_no",
  [TEST_MARKET.store,sold.sale_id]);
 assert.deepEqual(linesSnapshot.map(x=>[
  x.barcode_snapshot,x.sale_mode_snapshot,x.scan_quantity,x.pack_size_snapshot,
  Number(x.quantity_base_units),Number(x.unit_price_minor),Number(x.line_total_minor)
 ]),[
  ["V111-BUNDLE","bundle",1,6,6,2700,2700],
  ["V111-SET","set",1,3,3,2800,2800]
 ]);
 assert.ok(linesSnapshot.every(x=>typeof x.name_snapshot==="string"&&x.name_snapshot.length>3));
 const {rows:[alloc]}=await admin.query(
  "SELECT count(*)::integer AS allocations,sum(quantity_base_units)::bigint AS qty FROM zhirox_local.lot_sale_allocations_v90 WHERE store_id=$1 AND sale_id=$2",
  [TEST_MARKET.store,sold.sale_id]);
 assert.equal(alloc.allocations,2);
 assert.equal(Number(alloc.qty),9);
 // Same durable prepared lines and UUID recover the original receipt after
 // stock depletion; retry may NOT reprice or re-apply stock and outbox.
 const retry=await checkout({token:soldToken,
  request_id:soldRequest,prepared_lines:soldPrepared});
 assert.equal(retry.approved,true);
 assert.equal(retry.replayed,true);
 assert.equal(retry.reason,"pack_idempotent_replay");
 assert.equal(retry.sale_id,sold.sale_id);
 assert.equal(String(retry.receipt_no),String(sold.receipt_no));
 assert.deepEqual(await summary(),afterSale);
 // The initial cashier proof was not spent in the tamper checks. If cashier
 // won, it can replay the identical receipt; if owner won, cashier's lost
 // attempt remains denied. Either way the same nonce cannot be used twice.
 assert.equal((await call(proof)).reason,
  cashierWon?"pack_idempotent_replay":"pack_checkout_rejected");
 assert.equal((await call(proof)).reason,"replayed_proof");
 assert.deepEqual(await summary(),afterSale);
 const conflicting=await issue({token:soldToken,request_id:soldRequest,
  lines:[{barcode:"V111-BUNDLE",qty:1,expected_price_minor:2700,
   expected_units_per_pack:6}]});
 assert.equal((await call(conflicting)).reason,"pack_checkout_rejected");
 assert.deepEqual(await summary(),afterSale);
 // Previously unsafe V84 "base units * price per pack" returns must be blocked.
 try{
  await admin.query(
   "SELECT * FROM zhirox_local.record_sale_return_v84($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid,$6::bigint,$7::boolean,$8::text)",
   [TEST_MARKET.store,TEST_MARKET.owner,sold.sale_id,1,id(9),1,true,
    "V112 intentionally denied original pack return"]);
  assert.fail("legacy pack refund was mistakenly permitted");
 }catch(error){
  assert.ok(["P8808","P1125"].includes(error.code),
   "Legacy route guard or pack-specific guard must refuse incorrect monetary value");
 }
 // The V88 LOT gate may reject BEFORE reaching the pack-specific trigger.
 // With the TEST-only allowed V90 return context, confirm the V112 financial
 // correctness trigger itself still refuses per-base-unit multiplication.
 const returnClient=await admin.connect();
 try{
  await returnClient.query("BEGIN");
  await returnClient.query("SELECT set_config('zhirox.v88_fefo_route','test_v90_return_authorized',true)");
  try{
   await returnClient.query(
    "SELECT * FROM zhirox_local.record_sale_return_v84($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::uuid,$6::bigint,$7::boolean,$8::text)",
    [TEST_MARKET.store,TEST_MARKET.owner,sold.sale_id,1,id(9),1,true,
     "V112 intentionally denied pack refund in approved test LOT context"]);
   assert.fail("pack-specific guard did not refuse wrong money");
  }catch(error){assert.equal(error.code,"P1125","pack-specific refund guard must fail closed");}
 }finally{
  await returnClient.query("ROLLBACK").catch(()=>{});
  returnClient.release();
 }
 assert.deepEqual(await summary(),afterSale,"Refused refund must not restock or pay");
 // Exhausted *eligible* LOTs are more restrictive than aggregate stock:
 // global stock still includes 2 expired units and only 1 nonexpired unit.
 const {rows:[eligibleLots]}=await admin.query(
  "SELECT coalesce(sum(tracked_remaining),0)::bigint AS available FROM zhirox_local.lot_inventory_v90 WHERE store_id=$1 AND product_id=$2 AND expires_on>=current_date AND tracked_remaining>0",
  [TEST_MARKET.store,TEST_MARKET.product1]);
 assert.equal(Number(eligibleLots.available),1);
 const finalSetIntents=await Promise.all([7,8].map(n=>
  issue({token:signedIn.token,request_id:id(n),
   lines:[{barcode:"V111-SET",qty:1,expected_price_minor:2800,
    expected_units_per_pack:3}]})));
 const refused=await Promise.all(finalSetIntents.map(doc=>call(doc)));
 assert.ok(refused.every(x=>!x.approved&&x.reason==="pack_checkout_rejected"),
  "Both concurrent requests must fail when remaining LOTs are expired or insufficient");
 const after=await summary();
 assert.deepEqual(after,afterSale,"Failed concurrent requests must preserve sale, ledger, receipt, stock and outbox");
 const {rows:[audit]}=await admin.query(
  "SELECT count(*) FILTER(WHERE reason='pack_sale_committed')::integer AS committed, count(*) FILTER(WHERE reason='pack_idempotent_replay')::integer AS retries, count(*) FILTER(WHERE reason='pack_checkout_rejected')::integer AS rejected FROM zhirox_local.v97_checkout_audit WHERE store_id=$1",
  [TEST_MARKET.store]);
 assert.ok(audit.committed>=1);
 assert.ok(audit.retries>=1);
 assert.ok(audit.rejected>=2);
 // Rejected quote after all stock exhausted must not reserve money or units.
 const soldOut=await checkout.prepare({
  token:signedIn.token,request_id:id(8),lines:set
 });
 assert.equal(soldOut.eligible,false);
 assert.equal(soldOut.reason,"insufficient_nonexpired_lot_stock");
 assert.deepEqual(await summary(),after);
 console.log("V112 PASS: distinct cashier/owner LOT race (one winner), signed independent package prices, exact snapshots, durable receipt replay, expired-stock denial and legacy refund protection; synthetic DB only");
}finally{
 if(originalSetPrice!==undefined)
  await admin.query("UPDATE zhirox_local.barcodes SET sale_price_minor=$2 WHERE store_id=$1 AND code='V111-SET'",
   [TEST_MARKET.store,originalSetPrice]).catch(()=>{});
 if(originalVersion!==undefined)
  await admin.query("UPDATE zhirox_local.local_users SET session_version=$3 WHERE store_id=$1 AND id=$2",
   [TEST_MARKET.store,TEST_MARKET.cashier,originalVersion]).catch(()=>{});
 for(const role of ["zhirox_v94_auth","zhirox_v95_gate"])
  await admin.query(`ALTER ROLE ${role} NOLOGIN PASSWORD NULL`).catch(()=>{});
 await Promise.allSettled([admin.end(),authPool.end(),gatePool.end()]);
}
