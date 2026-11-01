import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("offline/migrations/041_v96_bound_actor_hmac_preflight.sql","utf8");
const signer=readFileSync("offline/actor-proof-issuer-v96.mjs","utf8");
const integration=readFileSync("offline/tests/v96_real_pg_bound_actor_proof.mjs","utf8");
const workflow=readFileSync(".github/workflows/v81-test-market-pc.yml","utf8");

test("V96 cryptographic signer is gated by a live verified restricted account",()=>{
 for(const s of [
  'createHmac("sha256"', "createLocalAuthV3",
  "await auth.authorize(token", "assertV94AuthPrivilegeBoundary",
  'SELECT $1::jsonb::text AS canonical', "randomBytes(16)",
  'actor.store_id,actor.user_id,request_id,canonical,exp,nonce'
 ])assert.ok(signer.includes(s),s);
 assert.doesNotMatch(signer,/checkout_unified_fefo_v90|UPDATE zhirox_local.products|INSERT INTO zhirox_local.sales/);
});
test("V96 DB exclusively exposes bound proof preflight, never cashier write rights",()=>{
 for(const s of [
  "current_database()<>'zhirox_v80_disposable'",
  "CREATE EXTENSION IF NOT EXISTS pgcrypto",
  "CREATE TABLE zhirox_local.v96_proof_keys",
  "CREATE TABLE zhirox_local.v96_used_nonces",
  "CREATE TABLE zhirox_local.v96_proof_audit",
  "session_user<>'zhirox_v95_gate'",
  "public.hmac(convert_to(v_message,'UTF8'),v_key,'sha256')",
  "ON CONFLICT(store_id,nonce) DO NOTHING",
  "REVOKE EXECUTE ON FUNCTION zhirox_local.preflight_checkout_v95",
  "GRANT EXECUTE ON FUNCTION zhirox_local.preflight_checkout_bound_v96",
 ])assert.ok(sql.includes(s),s);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO zhirox_local.sales|UPDATE zhirox_local.products|DELETE FROM zhirox_local.sales)\b/i);
});
test("V96 adversarial PostgreSQL security checks run after V95 and before test archive",()=>{
 for(const s of [
  '"replayed_proof"','"invalid_signature"','"expired_or_long_lived_proof"',
  'SELECT * FROM zhirox_local.v96_proof_keys',
  'SELECT * FROM zhirox_local.preflight_checkout_v95',
  "auth.login(", "assert.deepEqual(await state(),before",
  "ALTER ROLE ${role} NOLOGIN PASSWORD NULL"
 ])assert.ok(integration.includes(s),s);
 const v95=workflow.indexOf("node offline/tests/v95_real_pg_preflight_gate.mjs");
 const migration=workflow.indexOf("offline/migrations/041_v96_bound_actor_hmac_preflight.sql",v95);
 const real=workflow.indexOf("node offline/tests/v96_real_pg_bound_actor_proof.mjs",migration);
 const dump=workflow.indexOf("pg_dump -Fc --schema=zhirox_local",real);
 assert.ok(v95>0 && migration>v95 && real>migration && dump>real);
});
