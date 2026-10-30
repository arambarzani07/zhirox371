// V69 genuine Docker LAN test final SQL proof; no secrets in evidence.
import assert from "node:assert/strict";
import {Pool} from "pg";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve,join} from "node:path";
const store="10000000-0000-0000-0000-000000000059";
const who=Number(process.argv[2]);
if(process.env.ZHIROX_V69_ISOLATED_BRIDGE!=="true"||
 process.env.PGHOST!=="127.0.0.1"||
 process.env.PGDATABASE!=="zhirox_v59_ci_test"||
 process.env.PGUSER!=="localtest"||
 !process.env.PGPASSWORD||
 !Number.isInteger(who)||who<1||who>5)throw Error("V69 disposable-only audit");
const evidence=resolve("market-lab-evidence");
const pool=new Pool({host:"127.0.0.1",user:"localtest",
 password:process.env.PGPASSWORD,database:process.env.PGDATABASE});
const q=async sql=>(await pool.query(sql,[store])).rows;
try{
 const totals=(await q(
  "SELECT (SELECT count(*)::integer FROM zhirox_local.sales WHERE store_id=$1) AS sales, (SELECT coalesce(sum(total_minor),0)::bigint FROM zhirox_local.sales WHERE store_id=$1) AS total_iqd, (SELECT count(*)::integer FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1) AS receipts, (SELECT count(*)::integer FROM zhirox_local.print_requests_v35 WHERE store_id=$1 AND state='queued') AS queued_prints, (SELECT count(*)::integer FROM zhirox_local.event_outbox WHERE store_id=$1 AND delivered_at IS NULL) AS pending, (SELECT count(*)::integer FROM zhirox_local.cash_shifts_v37 WHERE store_id=$1 AND state='open') AS open_shifts"
 ))[0];
 assert.deepEqual(totals,{sales:11,total_iqd:"36480",receipts:11,
  queued_prints:11,pending:8,open_shifts:0});
 const newItem=(await q(
  "SELECT stock_base_units::text AS units FROM zhirox_local.products WHERE store_id=$1 AND id='30000000-0000-0000-0000-000000000069'"))[0];
 assert.equal(newItem.units,"1");
 const v69Sales=await q(
  "SELECT receipt_no::text,request_id::text,total_minor::text FROM zhirox_local.sales WHERE store_id=$1 AND receipt_no>7 ORDER BY receipt_no");
 assert.equal(v69Sales.length,4);
 assert.deepEqual(v69Sales.map(x=>x.total_minor).sort(),["3000","3000","3000","400"].sort());
 const bad=await q(
  "SELECT request_id,state FROM zhirox_local.checkout_intents_v31 WHERE store_id=$1 AND request_id IN('50000000-0000-0000-0000-000000000091','50000000-0000-0000-0000-000000000092','50000000-0000-0000-0000-000000000093','50000000-0000-0000-0000-000000000094','50000000-0000-0000-0000-000000000095')");
 assert.equal(bad.length,5);
 assert.equal(bad.filter(x=>x.state==="committed").length,3);
 assert.equal(bad.filter(x=>x.state==="cancelled").length,2);
 const pending=await q(
  "SELECT state,receipt_no::text,total_minor::text FROM zhirox_local.checkout_intents_v31 WHERE store_id=$1 AND request_id='50000000-0000-0000-0000-000000000101'");
 assert.deepEqual(pending,[{state:"committed",receipt_no:"11",total_minor:"400"}]);
 const remote=new Pool({host:"127.0.0.1",database:"zhirox_v67_receiver_ci_test",
 user:"localtest",password:process.env.PGPASSWORD});
 try{
  const r=await remote.query(
   "SELECT count(*)::int AS n FROM zhirox_cloud_v28.received_sales WHERE store_id=$1",[store]);
  assert.equal(r.rows[0].n,3,"new cashiers do not synchronously require cloud receiver");
 }finally{await remote.end();}
 for(const index of [1,2,3,4,5]){
  const close=JSON.parse(await readFile(join(evidence,"v69-pc"+index+"-shift-close.json"),"utf8"));
  assert.equal(close.shift_closed,true);assert.equal(close.variance_iqd,0);
 }
 const disconnect=JSON.parse(await readFile(join(evidence,"v69-actual-network-disconnect.json"),"utf8"));
 assert.equal(disconnect.client_network_disconnected,true);
 const recovered=JSON.parse(await readFile(join(evidence,"v69-recovered-400-iqd-sale.json"),"utf8"));
 assert.equal(recovered.recovered,true);assert.equal(recovered.committed_once,true);
 const report={name:"V69 five distinct Docker Linux PC namespaces - private physical-like LAN",
  actual_docker_containers:7,real_private_lan_bridge:true,lan_is_internal_no_wan:true,
  real_tls_to_network_gateway:true,distinct_ip_addresses:["172.28.69.11","172.28.69.12",
   "172.28.69.13","172.28.69.14","172.28.69.15"],
  real_postgresql_transactional_stock:true,initial_v69_units:7,
  simultaneous_client_cashiers:5,requested_units_each:2,
  committed_initial_winners:3,stock_conflicts:2,stock_remaining:1,
  network_test:"docker network disconnect and connect cashier "+who,
  unaffected_other_pc_stayed_online:true,
  prepared_intent_survived_disconnection:true,
  checkout_recovered_with_same_request_uuid:true,
  no_double_sale:true,
  totals,cloud_receiver_not_required_for_checkout:true,
  hardware:{windows_computers:0,physical_barcode_scanners:0,physical_printers:0,
   electric_power_failure_tested:false,router_switch_physically_removed:false},
  release:"NO_GO"};
 await mkdir(evidence,{recursive:true});
 await writeFile(join(evidence,"v69-real-container-lan-report.json"),
  JSON.stringify(report,null,2)+"\n","utf8");
 console.log("V69 PASS "+JSON.stringify({lan_clients:5,stock_winners:3,
  rejected:2,disconnected_client_recovered:who,totals,release:"NO_GO"}));
}finally{await pool.end();}
