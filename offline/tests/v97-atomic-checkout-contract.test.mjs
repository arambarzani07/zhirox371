import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("offline/migrations/042_v97_proven_atomic_checkout.sql","utf8");
const issuer=readFileSync("offline/proven-checkout-v97.mjs","utf8");
const integration=readFileSync("offline/tests/v97_atomic_checkout_real_pg.mjs","utf8");
const workflow=readFileSync(".github/workflows/v81-test-market-pc.yml","utf8");

test("V97 signed actor proof ties token, version, request and exact canonical cart",()=>{
 for(const s of [
  'createHmac("sha256"',
  'await auth.authorize(token,["owner","manager","cashier"])',
  'assertV94AuthPrivilegeBoundary(authPool)',
  'SELECT $1::jsonb::text AS canonical',
  "actor.store_id,actor.user_id,actor.sv,request_id,canonical,exp,nonce",
  "randomBytes(16)",
  "checkout_proven_fefo_v97",
  "createV97TestCheckoutAdapter"
 ])assert.ok(issuer.includes(s),s);
 assert.doesNotMatch(issuer,/UPDATE zhirox_local.products|INSERT INTO zhirox_local.sales/);
});
test("V97 fixed-store SQL requires actual restricted actor role and audits each atomic checkout",()=>{
 for(const s of [
  "current_database()<>'zhirox_v80_disposable'",
  "CREATE TABLE zhirox_local.v97_checkout_audit",
  "SECURITY DEFINER",
  "session_user<>'zhirox_v95_gate'",
  "p_store IS DISTINCT FROM '88000000-0000-4000-8000-000000000080'",
  "session_version<>v_sv",
  "FOR SHARE",
  "public.hmac(convert_to(v_msg,'UTF8'),v_key,'sha256')",
  "ON CONFLICT(store_id,nonce) DO NOTHING",
  "checkout_unified_fefo_v90",
  "EXCEPTION WHEN OTHERS THEN",
  "'idempotent_replay'",
  "REVOKE EXECUTE ON FUNCTION",
  "preflight_checkout_bound_v96",
  "GRANT EXECUTE ON FUNCTION",
 ])assert.ok(sql.includes(s),s);
 assert.doesNotMatch(sql,/GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON (?:TABLE )?zhirox_local\.(?:products|sales|event_outbox)/i);
});
test("V97 real PG financial concurrency test runs after V96 then archives isolated database",()=>{
 for(const s of [
  "actor_revoked_or_unauthorized",
  "checkout_rejected",
  "replayed_proof",
  "idempotent_replay",
  "sale_committed",
  "Promise.all(pRace.map",
  "await adapter({token:",
  "assert.equal(after.sales,8)",
  "assert.equal(after.events,8)",
  "assert.equal(Number(after.stock),0)",
  "assert.equal(Number(after.lots),0)",
  "assert.deepEqual(await summary(),after",
  "ALTER ROLE ${role} NOLOGIN PASSWORD NULL"
 ])assert.ok(integration.includes(s),s);
 const before=workflow.indexOf("node offline/tests/v96_real_pg_bound_actor_proof.mjs");
 const migration=workflow.indexOf("offline/migrations/042_v97_proven_atomic_checkout.sql",before);
 const acceptance=workflow.indexOf("node offline/tests/v97_atomic_checkout_real_pg.mjs",migration);
 const dump=workflow.indexOf("pg_dump -Fc --schema=zhirox_local",acceptance);
 assert.ok(before>0&&migration>before&&acceptance>migration&&dump>acceptance);
});
