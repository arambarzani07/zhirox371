// V67 supermarket twin WAN reconnect. REAL outbox sender and V28 receiver,
// separate REAL disposable PostgreSQL receiver DB, loopback transport ONLY.
// No public cloud, on-site Windows equipment, Supabase, payment settlement.
import assert from "node:assert/strict";
import {Pool} from "pg";
import {createServer} from "node:http";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {syncOutboxOnce} from "../outbox-sync-worker-v27.mjs";
import {createCloudReceiverV28,parseV28Stores,hashOwnerToken} from "../cloud-receiver-v28.mjs";
import {createEventEnvelope,signEvent} from "../sync-wire-v27.mjs";

const store="10000000-0000-0000-0000-000000000059";
const SOURCE="zhirox_v59_ci_test",RECEIVER="zhirox_v67_receiver_ci_test";
const secret="v67-synthetic-only-market-hmac-test-secret-".repeat(2);
const ownerToken="v67-synthetic-owner-token-never-for-production-".repeat(2);
const path=resolve(process.env.ZHIROX_V67_EVIDENCE_DIR||"market-lab-evidence");
if(process.env.ZHIROX_V67_ISOLATED_SYNC_TEST!=="true"||
 process.env.ZHIROX_V65_MARKET_DIGITAL_TWIN!=="true"||
 process.env.PGHOST!=="127.0.0.1"||
 process.env.PGDATABASE!==SOURCE||
 process.env.PGUSER!=="localtest"||!process.env.PGPASSWORD||
 process.env.ZHIROX_V67_RECEIVER_DB!==RECEIVER||
 process.env.ZHIROX_RELEASE_MODE==="official")
 throw Error("V67 refuses real market/production/remote destinations");

const config={host:"127.0.0.1",port:5432,user:"localtest",
 password:process.env.PGPASSWORD,max:4,connectionTimeoutMillis:5000};
const local=new Pool({...config,database:SOURCE});
const remote=new Pool({...config,database:RECEIVER});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const count=async(pool,query)=>Number((await pool.query(query,[store])).rows[0].n);
let server;
let refusedPort;
async function receive(port){
 server=createServer(createCloudReceiverV28({
  pool:remote,stores:parseV28Stores([
   {store_id:store,sync_secret:secret,owner_token_hash:hashOwnerToken(ownerToken)}
  ])
 }));
 await new Promise((res,rej)=>{server.once("error",rej);server.listen(port,"127.0.0.1",res);});
}
async function postEvent(target,event){
 const raw=JSON.stringify(event),timestamp=String(Date.now());
 return await fetch(target,{method:"POST",headers:{
  "Content-Type":"application/json","X-ZHIROX-Timestamp":timestamp,
  "X-ZHIROX-Signature":signEvent(raw,secret,timestamp)
 },body:raw,redirect:"error"});
}
try{
 assert.equal(await count(local,
  "SELECT count(*)::integer AS n FROM zhirox_local.sales WHERE store_id=$1"),3);
 assert.equal(await count(local,
  "SELECT count(*)::integer AS n FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL"),3);
 assert.equal(await count(local,
  "SELECT count(*)::integer AS n FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1"),3);
 assert.equal(await count(remote,
  "SELECT count(*)::integer AS n FROM zhirox_cloud_v28.received_sales WHERE store_id=$1"),0);
 // Reserve an ephemeral listener address, then close to simulate failure of
 // receiver while still allowing real loopback TCP attempts to fail.
 const dummy=createServer();
 await new Promise((res,rej)=>{dummy.once("error",rej);dummy.listen(0,"127.0.0.1",res);});
 refusedPort=dummy.address().port;
 await new Promise(res=>dummy.close(res));
 const target="http://127.0.0.1:"+refusedPort+"/v27/events";
 const offline=await syncOutboxOnce({pool:local,storeId:store,
  receiverUrl:target,secret,testMode:true,maxBatch:10});
 assert.equal(offline.claimed,3);
 assert.equal(offline.acked,0);
 assert.equal(offline.retried,3);
 assert.equal(offline.lostLease,0);
 assert.equal(await count(local,
  "SELECT count(*)::integer AS n FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL"),3);
 assert.equal(await count(remote,
  "SELECT count(*)::integer AS n FROM zhirox_cloud_v28.received_sales WHERE store_id=$1"),0,
  "no cloud receiver means NOTHING uploaded or acknowledged");
 const failed=(await local.query(
  "SELECT attempt_count,last_delivery_error FROM zhirox_local.event_outbox WHERE store_id=$1 ORDER BY event_id",[store])).rows;
 assert.ok(failed.every(x=>x.attempt_count===1&&x.last_delivery_error),
  "every failed delivery must record a retry, not falsely mark sent");

 // NOW bring a real, separate V28 cloud-style receiver service ONLINE.
 await receive(refusedPort);
 await wait(2300); // The existing production-like V27 backoff is 2 seconds.
 const online=await syncOutboxOnce({pool:local,storeId:store,
  receiverUrl:target,secret,testMode:true,maxBatch:10});
 assert.equal(online.claimed,3);
 assert.equal(online.acked,3);
 assert.equal(online.retried,0);
 assert.equal(online.lostLease,0);
 assert.equal(await count(local,
  "SELECT count(*)::integer AS n FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL"),0);
 assert.equal(await count(remote,
  "SELECT count(*)::integer AS n FROM zhirox_cloud_v28.received_sales WHERE store_id=$1"),3);
 const parity=(await local.query(
  "SELECT event_id::text FROM zhirox_local.event_outbox WHERE store_id=$1 ORDER BY event_id",[store])).rows.map(x=>x.event_id);
 const remoteIds=(await remote.query(
  "SELECT event_id::text FROM zhirox_cloud_v28.received_sales WHERE store_id=$1 ORDER BY event_id",[store])).rows.map(x=>x.event_id);
 assert.deepEqual(remoteIds,parity,"received event UUIDs equal original outbox IDs");
 const summary=await fetch("http://127.0.0.1:"+refusedPort+"/v28/owner/summary?store_id="+store,{
  headers:{"Authorization":"Bearer "+ownerToken}
 });
 assert.equal(summary.status,200);
 const body=await summary.json();
 assert.equal(Number(body.sales_count),3);
 assert.equal(Number(body.total_minor),14680);
 assert.equal(body.possible_missing_receipts,0);
 assert.equal(body.unavailable_categories.length,6,
  "V28 has sales only, not full six owner alerts");
 const again=await syncOutboxOnce({pool:local,storeId:store,
  receiverUrl:target,secret,testMode:true,maxBatch:10});
 assert.equal(again.claimed,0,"already acknowledged events never resend from local queue");

 // Test receiver idempotency against genuine duplicate signed envelope.
 const original=(await local.query(
  "SELECT store_id,event_id,aggregate_id,event_type,payload,created_at FROM zhirox_local.event_outbox WHERE store_id=$1 ORDER BY event_id LIMIT 1",[store])).rows[0];
 const originalEvent=createEventEnvelope(original);
 const duplicate=await postEvent(target,originalEvent);
 assert.equal(duplicate.status,200);
 assert.equal((await duplicate.json()).duplicate,true);
 assert.equal(await count(remote,
  "SELECT count(*)::integer AS n FROM zhirox_cloud_v28.received_sales WHERE store_id=$1"),3);
 const tampered=structuredClone(originalEvent);
 tampered.payload.total_minor=Number(tampered.payload.total_minor)+1;
 const conflict=await postEvent(target,tampered);
 assert.equal(conflict.status,409,"same event ID with different financial amount is rejected");
 assert.equal(await count(remote,
  "SELECT count(*)::integer AS n FROM zhirox_cloud_v28.received_sales WHERE store_id=$1"),3);
 assert.equal(await count(local,
  "SELECT count(*)::integer AS n FROM zhirox_local.sales WHERE store_id=$1"),3);
 assert.equal(await count(local,
  "SELECT count(*)::integer AS n FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1"),3);
 assert.equal(await count(local,
  "SELECT count(*)::integer AS n FROM zhirox_local.print_requests_v35 WHERE store_id=$1 AND state='queued'"),3);
 const all=(await local.query(
  "SELECT attempt_count,delivered_at,last_delivery_error FROM zhirox_local.event_outbox WHERE store_id=$1",[store])).rows;
 assert.ok(all.every(x=>x.attempt_count===2&&x.delivered_at&&x.last_delivery_error===null));
 const report={
  project:"ZHIROX V67 same market Digital Twin",
  category:"simulation of internet-down and recovery, ACTUAL V27 sender + ACTUAL V28 receiver",
  external_wan_tested:false,
  local_tcp_receiver_port:refusedPort,
  source_db:SOURCE,receiver_db:RECEIVER,
  during_disconnection:offline,
  after_recovery:online,
  pending_before:3,pending_after:0,
  receiver_accepted_sales:3,receiver_total_iqd:"14680",
  exact_original_event_ids_match:true,
  no_duplicate_on_replay:true,conflicting_signed_financial_id_rejected:true,
  local_sales_preserved:3,immutable_receipts_preserved:3,
  print_jobs_still_queued:3,
  owner_supported_alert_categories:["sale.completed"],
  owner_remaining_categories_not_tested:[
   "price.change","stock.low","sale.refund","shift.open","shift.close","security.alert"
  ],
  no_real_supabase:true,no_real_cloud_deployment:true,no_physical_printer:true,
  release:"NO_GO",
  note:"Real PostgreSQL and loopback TCP tests only. No real ISP WAN, transport TLS, Supabase API or physical PC."
 };
 await mkdir(path,{recursive:true});
 await writeFile(join(path,"v67-wan-disconnect-reconnect-sync-report.json"),
   JSON.stringify(report,null,2)+"\n","utf8");
 console.log("V67 PASS: "+JSON.stringify({offline,online,remaining:0,
   remote_sales:3,remote_total_iqd:"14680",real_receiver:true,release:"NO_GO"}));
}finally{
 if(server)await new Promise(r=>server.close(r));
 await remote.end();await local.end();
}
