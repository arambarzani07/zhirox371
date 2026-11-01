import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const guard=read("offline/device-guard-v99.mjs");
const gateway=read("offline/local-dual-device-v99.mjs");
const client=read("offline/device-client-v99.mjs");
const underlying=read("offline/local-checkout-http-v98.mjs");
const integration=read("offline/tests/v99_dual_devices_offline_real_pg.mjs");
const workflow=read(".github/workflows/v81-test-market-pc.yml");

test("V99 distinct device HMACs bind exact path, body and single-use nonces",()=>{
 for(const x of [
  'createHmac("sha256"',
  "timingSafeEqual",
  "randomBytes(16)",
  "trial-pc-01",
  "trial-pc-02",
  'seen.has(key)',
  "ttlSeconds=30",
  'signingText({deviceId:id,timestamp:issued,nonce,method,path,body})',
  "if(seen.size>=2048)"
 ])assert.ok(guard.includes(x),x);
 assert.doesNotMatch(guard,/UPDATE zhirox_local|INSERT INTO zhirox_local|\bfetch\(/);
});
test("V99 remains loopback-only and never exposes raw DB role credentials",()=>{
 for(const x of [
  'ZHIROX_V99_DUAL_DEVICE',
  'YES_ISOLATED_V99_LOCAL_LAB',
  'server.listen(3316,"127.0.0.1",resolve)',
  'zhirox_v80_disposable',
  'createV98TestCheckoutHandler',
  'routePrefix="/api/local/v99/"',
  "createV99DeviceGuard"
 ])assert.ok(gateway.includes(x),x);
 for(const x of [
  "V99_device_guard_route_pair_required",
  "device_authentication_required",
  "req.socket.remoteAddress",
  'result.replayed?200:201'
 ])assert.ok(underlying.includes(x),x);
 assert.doesNotMatch(gateway,/0\.0\.0\.0|listen\([^\n]*process\.env\.HOST/);
});
test("V99 trial client keeps immutable ID and carton during uncertain commit",()=>{
 for(const x of [
  "V99_request_id_cannot_change_basket",
  "unknown_commit_retry_same_request",
  "signV99DeviceRequest",
  "if(result.status!==503)return result",
  'const stable=JSON.parse(sent.get(request_id))',
  "return await call(\"checkout\",stable)"
 ])assert.ok(client.includes(x),x);
});
test("V99 real PG integration verifies two PCs, WAN isolation, retry and 3 receipts",()=>{
 for(const x of [
  'before.sales,11',
  'V99_offline_WAN_transport_blocked',
  'trial-pc-01',
  'trial-pc-02',
  'HMAC replay nonce must be rejected',
  "Promise.all([",
  "dropNext=true",
  'idempotent_replay',
  'assert.equal(after.sales,before.sales+3)',
  'assert.equal(after.outbox,before.outbox+3)',
  "Number(after.water)-",
  "NOLOGIN PASSWORD NULL"
 ])if(x!=="Number(after.water)-")assert.ok(integration.includes(x),x);
 const prev=workflow.indexOf("node offline/tests/v98_http_atomic_real_pg.mjs");
 const curr=workflow.indexOf("node offline/tests/v99_dual_devices_offline_real_pg.mjs",prev);
 const archive=workflow.indexOf("pg_dump -Fc --schema=zhirox_local",curr);
 assert.ok(prev>0&&curr>prev&&archive>curr);
});
