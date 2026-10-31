// V70 reproducible evidence — post-hoc read-only SQL plus five Docker-client
// receipt/latency samples. No physical Windows, no POS printer, no real WAN.
import assert from "node:assert/strict";
import {Pool} from "pg";
import {readFile,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
const store="10000000-0000-0000-0000-000000000059";
const evidence=resolve("market-lab-evidence");
if(process.env.ZHIROX_V70_SOAK_ENABLED!=="true"||
 process.env.ZHIROX_V69_ISOLATED_BRIDGE!=="true"||
 process.env.PGHOST!=="127.0.0.1"||
 process.env.PGUSER!=="localtest"||
 process.env.PGDATABASE!=="zhirox_v59_ci_test"||
 !process.env.PGPASSWORD||process.env.ZHIROX_RELEASE_MODE==="official")
 throw Error("V70 refuses non-disposable actual market data");
const db=new Pool({host:"127.0.0.1",port:5432,
 user:"localtest",password:process.env.PGPASSWORD,
 database:"zhirox_v59_ci_test",connectionTimeoutMillis:6000});
const read=async name=>JSON.parse(await readFile(join(evidence,name),"utf8"));
const count=async(sql,...args)=>Number((await db.query(sql,[store,...args])).rows[0].n);
const quantile=(values,p)=>values[Math.min(values.length-1,Math.ceil(p*values.length)-1)];
try{
 const samples=[];
 for(let station=1;station<=5;station++){
  const login=await read("v70-pc"+station+"-login.json");
  const close=await read("v70-pc"+station+"-shift-close.json");
  assert.equal(login.authenticated,true);
  assert.equal(login.shift_open,true);
  assert.equal(close.shift_closed,true);
  assert.equal(close.variance_iqd,0);
  assert.equal(close.total_iqd,15000);
  for(let round=1;round<=20;round++){
   const row=await read("v70-pc"+station+"-round"+round+".json");
   assert.equal(row.station,station);
   assert.equal(row.round,round);
   assert.ok(row.latency_ms>=0&&Number.isFinite(row.latency_ms));
   if(station===3&&round===10){
    assert.equal(row.resumed,true,"prepared V70 sale must resume after real NIC reattach");
    assert.equal(row.replay,true);
   }else{
    assert.equal(row.committed,true);
    assert.equal(row.replay,true);
    assert.equal(row.print_queued,true);
   }
   samples.push({station,round,latency_ms:row.latency_ms});
  }
 }
 assert.equal(samples.length,100,"100 actual 5-PC HTTPS committed sale measurements");
 const sorted=samples.map(x=>x.latency_ms).sort((a,b)=>a-b);
 const p50=quantile(sorted,.5),p95=quantile(sorted,.95),p99=quantile(sorted,.99);
 assert.ok(p95<6000,"95th percentile below application request timeouts");
 const disconnected=await read("v70-outage-pc3.json");
 assert.equal(disconnected.network_cable_virtual_detached,true);
 const hold=await read("v70-hold-pc3.json");
 assert.equal(hold.intent_durable,true);
 const other=await read("v70-others-online-during-disconnect.json");
 assert.equal(other.health,true);
 const elapsed=Number((await readFile(join(evidence,"v70-elapsed-seconds.txt"),"utf8")).trim());
 assert.ok(Number.isSafeInteger(elapsed)&&elapsed>0);
 const sql=(await db.query(
  "SELECT (SELECT count(*)::int FROM zhirox_local.sales WHERE store_id=$1) AS sales, (SELECT coalesce(sum(total_minor),0)::bigint FROM zhirox_local.sales WHERE store_id=$1) AS total_iqd, (SELECT count(*)::int FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1) AS receipts, (SELECT count(*)::int FROM zhirox_local.print_requests_v35 WHERE store_id=$1 AND state='queued') AS queued_prints, (SELECT count(*)::int FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL) AS pending_events, (SELECT count(*)::int FROM zhirox_local.cash_shifts_v37 WHERE store_id=$1 AND state='open') AS open_shifts",[store]
 )).rows[0];
 assert.deepEqual(sql,{sales:111,total_iqd:"111480",receipts:111,
  queued_prints:111,pending_events:108,open_shifts:0});
 const stock=(await db.query(
  "SELECT stock_base_units::text AS remaining FROM zhirox_local.products WHERE store_id=$1 AND id='30000000-0000-0000-0000-000000000070'",[store]
 )).rows[0];
 assert.equal(stock.remaining,"50");
 const after=(await db.query(
  "SELECT count(*)::int AS n FROM zhirox_local.sales WHERE store_id=$1 AND request_id::text LIKE '50000000-0000-0000-0000-000700%'",[store]
 )).rows[0].n;
 assert.equal(after,100,"must have 100 distinct sale request UUIDs, no duplicates");
 const v70Sums=(await db.query(
  "SELECT count(*)::int AS n,coalesce(sum(total_minor),0)::bigint AS amount FROM zhirox_local.sales WHERE store_id=$1 AND request_id::text LIKE '50000000-0000-0000-0000-000700%'",[store]
 )).rows[0];
 assert.equal(v70Sums.n,100);assert.equal(v70Sums.amount,"75000");
 const matches=await count(
  "SELECT count(*)::int AS n FROM zhirox_local.checkout_intents_v31 WHERE store_id=$1 AND request_id::text LIKE '50000000-0000-0000-0000-000700%' AND state='committed'");
 assert.equal(matches,100);
 const delta=(await db.query(
  "SELECT coalesce(sum(delta_base_units),0)::bigint AS delta FROM zhirox_local.stock_ledger WHERE store_id=$1 AND product_id='30000000-0000-0000-0000-000000000070'",[store]
 )).rows[0].delta;
 assert.equal(delta,"-100");
 const lineSum=(await db.query(
  "SELECT coalesce(sum(sl.line_total_minor),0)::bigint AS amount FROM zhirox_local.sale_lines sl JOIN zhirox_local.sales s ON s.store_id=sl.store_id AND s.id=sl.sale_id WHERE sl.store_id=$1 AND sl.product_id='30000000-0000-0000-0000-000000000070'",[store]
 )).rows[0].amount;
 assert.equal(lineSum,"75000","immutable line math remains consistent");
 const remote=new Pool({host:"127.0.0.1",database:"zhirox_v67_receiver_ci_test",
  user:"localtest",password:process.env.PGPASSWORD});
 try{
  assert.equal(Number((await remote.query(
    "SELECT count(*)::int AS n FROM zhirox_cloud_v28.received_sales WHERE store_id=$1",[store]
   )).rows[0].n),3,"cloud not required or contacted by cashier");
 }finally{await remote.end();}
 const digest=createHash("sha256").update(JSON.stringify(samples)).digest("hex");
 const report={
  version:"V70",name:"Five real Linux network namespaces, 100 successful Postgres HTTPS checkouts",
  run_type:"20 discrete checkout rounds across five simulated Windows-like terminals",
  target_system:"isolated Docker LAN, same real PostgreSQL 16 as V65-V69",
  authenticated_cashiers:5,rounds_per_cashier:20,committed_new_sales:100,
  live_protocol:"real Docker bridge TCP + verified HTTPS + real PostgreSQL transactions",
  client_side_delay_ms_by_station:[0,35,70,105,140],
  actual_wire_netem_configured:false,
  bridge_failure:{station:3,round:10,
   real_docker_network_disconnect:true,other_clients_stayed_online:true,
   prepared_request_durably_recovered:true,receipt_replay_idempotent:true},
  performance:{elapsed_seconds:elapsed,throughput_sales_per_sec:Math.round(10000/elapsed)/100,
   sample_count:100,p50_ms:p50,p95_ms:p95,p99_ms:p99,
   max_ms:sorted[sorted.length-1],client_observation_hash_sha256:digest},
  financial:{sales:sql.sales,total_iqd:sql.total_iqd,
   receipts:sql.receipts,queued_prints:sql.queued_prints,
   outbox_pending:sql.pending_events,open_shifts:sql.open_shifts,
   new_sale_total_iqd:"75000",sku_remaining:stock.remaining,
   new_stock_ledger_delta:delta},
  go_live:"NO_GO",
  caveats:["20-round bounded workload, NOT overnight soak or 24-hour benchmark",
   "no real LAN wire/router/Wi-Fi jitter injection; delays are client-side",
   "container Linux clients, not real Windows hardware","no physical printer/scanner",
   "backend test client pool and SQL environment are not deployed to physical market"]
 };
 await writeFile(join(evidence,"v70-five-docker-cashiers-100-sale-load-report.json"),
  JSON.stringify(report,null,2)+"\n","utf8");
 console.log("V70 PASS "+JSON.stringify(report));
}finally{await db.end();}
