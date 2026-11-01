import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isPrivateV101IPv4,createV101PrivateNICPolicy} from "../private-nic-v101.mjs";
const file=p=>readFileSync(p,"utf8");

test("V101 RFC1918 IP classifier excludes loopback, public, link-local, zero and multicast",()=>{
 for(const ip of ["10.1.2.3","172.16.0.2","172.31.255.254","192.168.3.33"])
  assert.equal(isPrivateV101IPv4(ip),true,ip);
 for(const ip of ["127.0.0.1","0.0.0.0","1.2.3.4","172.15.3.1",
  "172.32.0.1","192.167.1.1","8.8.8.8","169.254.1.2","224.0.0.1",
  "::ffff:10.1.2.3","10.0.0.999","localhost"])
  assert.equal(isPrivateV101IPv4(ip),false,ip);
});
test("V101 require actual local interface and TLS peer plus exact Host, source allowlist",()=>{
 const interfaces={eth0:[{family:"IPv4",internal:false,address:"192.168.7.12"}]};
 assert.throws(()=>createV101PrivateNICPolicy({
  bindAddress:"192.168.7.13",allowedPeers:["192.168.7.12"],interfaces
 }),/exact_private_NIC/);
 assert.throws(()=>createV101PrivateNICPolicy({
  bindAddress:"192.168.7.12",allowedPeers:["8.8.8.8"],interfaces
 }),/exact_private_NIC/);
 const check=createV101PrivateNICPolicy({
  bindAddress:"192.168.7.12",allowedPeers:["192.168.7.21"],interfaces
 });
 const req={socket:{encrypted:true,authorized:true,
  localAddress:"192.168.7.12",localPort:3318,
  remoteAddress:"192.168.7.21"},
  headers:{host:"192.168.7.12:3318"}};
 assert.equal(check(req),true);
 assert.equal(check({...req,headers:{host:"attacker.com:3318"}}),false);
 assert.equal(check({...req,socket:{...req.socket,remoteAddress:"192.168.7.30"}}),false);
 assert.equal(check({...req,socket:{...req.socket,authorized:false}}),false);
 assert.equal(check({...req,socket:{...req.socket,encrypted:false}}),false);
 assert.equal(check({...req,socket:{...req.socket,localAddress:"0.0.0.0"}}),false);
});
test("V101 protected route cannot reuse earlier V98,V99,V100 unrestricted loopback code paths",()=>{
 const v98=file("offline/local-checkout-http-v98.mjs");
 const v99=file("offline/local-dual-device-v99.mjs");
 const v100=file("offline/mtls-gateway-v100.mjs");
 const client=file("offline/mtls-client-v100.mjs");
 const base=file("offline/device-client-v99.mjs");
 const gateway=file("offline/private-lan-gateway-v101.mjs");
 for(const [source,fragment] of [
  [v98,'routePrefix==="/api/local/v101/"'],
  [v98,'typeof networkPolicy==="function"'],
  [v98,'networkPolicy?!networkPolicy(req)'],
  [v99,"routePrefix,deviceGuard,networkPolicy"],
  [v100,'routePrefix,networkPolicy'],
  [client,'routePrefix==="/api/local/v101/"'],
  [base,'routePrefix==="/api/local/v101/"'],
  [gateway,'ZHIROX_V101_PRIVATE_NIC'],
  [gateway,'YES_DISPOSABLE_PRIVATE_NIC_LAB'],
  [gateway,'server.listen(3318,bindAddress,resolve)']
 ])assert.ok(source.includes(fragment),fragment);
 assert.doesNotMatch(gateway,/server\.listen\([^\n]*"0\.0\.0\.0"/);
});
test("V101 genuine nonloopback PostgreSQL/TLS tests run after V100 and before isolated backup",()=>{
 const integration=file("offline/tests/v101_private_nic_real_pg.mjs");
 const wf=file(".github/workflows/v81-test-market-pc.yml");
 for(const x of [
  'assert.equal(before.sales,17)',
  'assert.equal(after.sales,20)',
  'assert.equal(after.events,20)',
  'server.address().address,nic',
  'await close(server)',
  'unknown_commit_retry_same_request',
  'dropNext=true',
  'idempotent_replay',
  'enabled=false,revoked_at=clock_timestamp()',
  'assert.equal(blocked.status,403)',
  'NOLOGIN PASSWORD NULL'
 ])assert.ok(integration.includes(x),x);
 const old=wf.indexOf("node offline/tests/v100_mtls_revocation_real_pg.mjs");
 const next=wf.indexOf("node offline/tests/v101_private_nic_real_pg.mjs",old);
 const snapshot=wf.indexOf("pg_dump -Fc --schema=zhirox_local",next);
 assert.ok(old>0&&next>old&&snapshot>next);
});
