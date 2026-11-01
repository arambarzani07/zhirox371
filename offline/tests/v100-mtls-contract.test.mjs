import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const content=file=>readFileSync(file,"utf8");
const sql=content("offline/migrations/043_v100_mtls_device_registry.sql");
const server=content("offline/mtls-gateway-v100.mjs");
const client=content("offline/mtls-client-v100.mjs");
const integration=content("offline/tests/v100_mtls_revocation_real_pg.mjs");
const v98=content("offline/local-checkout-http-v98.mjs");
const v99=content("offline/local-dual-device-v99.mjs");
const oldClient=content("offline/device-client-v99.mjs");
const workflow=content(".github/workflows/v81-test-market-pc.yml");

test("V100 only enables real TLS 1.3 mutual auth on loopback test gateway",()=>{
 for(const s of [
  "https.createServer", "requestCert:true", "rejectUnauthorized:true",
  'minVersion:"TLSv1.3"', 'maxVersion:"TLSv1.3"',
  'server.listen(3317,"127.0.0.1",resolve)',
  'ZHIROX_V100_MTLS',
  'YES_ISOLATED_V100_MTLS_TEST',
  "req.socket.authorized!==true",
  "getPeerCertificate",
  "tls_fingerprint",
  "v100_trial_devices",
  'routePrefix:"/api/local/v100/"'
 ])assert.ok(server.includes(s),s);
 assert.doesNotMatch(server,/server.listen\([^\n]*"0\.0\.0\.0"/);
 assert.doesNotMatch(server,/rejectUnauthorized:false/);
});
test("V100 connects certificate identity to durable DB-enabled registry, with restricted gate SELECT",()=>{
 for(const s of [
  "current_database()<>'zhirox_v80_disposable'",
  "CREATE TABLE zhirox_local.v100_trial_devices",
  "tls_fingerprint text NOT NULL",
  "enabled boolean NOT NULL DEFAULT true",
  "GRANT SELECT(store_id,device_id,tls_fingerprint,enabled)",
  "TO zhirox_v95_gate",
  "REVOKE ALL ON TABLE zhirox_local.v100_trial_devices FROM PUBLIC",
 ])assert.ok(sql.includes(s),s);
 assert.doesNotMatch(sql,/GRANT UPDATE|GRANT INSERT|GRANT DELETE/);
 assert.ok(v98.includes('routePrefix==="/api/local/v100/"'));
 assert.ok(v99.includes("routePrefix,deviceGuard"));
});
test("V100 cashier uses pinned CA and client cert and preserves immutable request ID for retries",()=>{
 for(const s of [
  "new https.Agent", "ca,cert,key", "rejectUnauthorized:true",
  "V100_private_loopback_https_mtls_required",
  "u.origin!==target.origin",
  'routePrefix:"/api/local/v100/"',
  "createV99TrialClient"
 ])assert.ok(client.includes(s),s);
 assert.ok(oldClient.includes('url.protocol==="https:"'));
 assert.ok(oldClient.includes("routePrefix+route"));
 assert.doesNotMatch(client,/rejectUnauthorized:false|http:\/\//);
});
test("V100 real PostgreSQL mTLS acceptance tests private certs, no cert, revocation, rotation and lost ACK",()=>{
 for(const s of [
  'execFileSync("openssl"', "mkdtempSync", "rmSync(testDir",
  "assert.equal(before.sales,14)",
  "assert.equal(after.sales,17)",
  "assert.equal(after.outbox,17)",
  "await assert.rejects(()=>rawTLS",
  "enabled=false,revoked_at=clock_timestamp()",
  'assert.equal(denied.status,403)',
  "dropNext=true",
  'assert.equal(recovered.body.replayed,true)',
  "tls_fingerprint=$2",
  'assert.equal(oldCertificate.status,403)',
  'assert.equal(rotatedLogin.status,200)',
  "NOLOGIN PASSWORD NULL"
 ])assert.ok(integration.includes(s),s);
 const v99run=workflow.indexOf("node offline/tests/v99_dual_devices_offline_real_pg.mjs");
 const v100mig=workflow.indexOf("offline/migrations/043_v100_mtls_device_registry.sql",v99run);
 const v100run=workflow.indexOf("node offline/tests/v100_mtls_revocation_real_pg.mjs",v100mig);
 const backup=workflow.indexOf("pg_dump -Fc --schema=zhirox_local",v100run);
 assert.ok(v99run>0&&v100mig>v99run&&v100run>v100mig&&backup>v100run);
});
