// V91: REAL simultaneous PostgreSQL connections. ISOLATED disposable CI market ONLY.
// No HTTP write route, production deployment, cash payout or physical stock certification.
// Requires the completed V90 test fixture (051) and PostgreSQL 16 on loopback.
import assert from "node:assert/strict";
import pg from "pg";

const EXPECTED = {
  PGHOST: "127.0.0.1",
  PGDATABASE: "zhirox_v80_disposable",
  PGUSER: "v80test",
  ZHIROX_V81_TEST_MARKET: "YES_LOCAL_TEST_READ_ONLY",
};
for (const [name, value] of Object.entries(EXPECTED)) {
  assert.equal(process.env[name], value, `V91 must run in isolated CI (${name})`);
}
assert.ok(process.env.PGPASSWORD, "Missing disposable CI database password");

const STORE = "88000000-0000-4000-8000-000000000080";
const OWNER = "88000000-0000-4000-8000-000000000081";
const CASHIER = "88000000-0000-4000-8000-000000000082";
const SUGAR = "88000000-0000-4000-8000-000000000092";
const REQUEST_RETRY = "91000000-0000-4000-8000-000000000001";
const REQUEST_RACE_A = "91000000-0000-4000-8000-000000000002";
const REQUEST_RACE_B = "91000000-0000-4000-8000-000000000003";
const REQUEST_RETURN = "91000000-0000-4000-8000-000000000004";
const REASON = "V91 test accounting face value only; no physical refund or cash payment";

const pool = new pg.Pool({
  host: "127.0.0.1",
  port: 5432,
  user: "v80test",
  password: process.env.PGPASSWORD,
  database: "zhirox_v80_disposable",
  max: 5,
  connectionTimeoutMillis: 5000,
  statement_timeout: 20000,
  application_name: "zhirox_v91_test_only_lot_concurrency",
});
const payload = qty => JSON.stringify([{product_id: SUGAR, qty}]);
const checkout = (request, qty, actor = CASHIER) =>
  pool.query(
    "SELECT * FROM zhirox_local.checkout_unified_fefo_v90($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
    [STORE, actor, request, payload(qty)]
  ).then(({rows}) => rows[0]);
const returnLot = saleId =>
  pool.query(
    "SELECT * FROM zhirox_local.return_unified_lot_v90($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::integer,$6::uuid,$7::bigint,$8::boolean,$9::text)",
    [STORE, OWNER, saleId, 1, 1, REQUEST_RETURN, 1, true, REASON]
  ).then(({rows}) => rows[0]);

async function state() {
  const {rows} = await pool.query(`
    SELECT
      (SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1) AS sales,
      (SELECT count(DISTINCT receipt_no) FROM zhirox_local.sales WHERE store_id=$1) AS distinct_receipts,
      (SELECT COALESCE(sum(total_minor),0) FROM zhirox_local.sales WHERE store_id=$1) AS gross,
      (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1) AS events,
      (SELECT stock_base_units FROM zhirox_local.products WHERE store_id=$1 AND id=$2) AS stock,
      (SELECT COALESCE(sum(tracked_remaining),0) FROM zhirox_local.lot_inventory_v90 WHERE store_id=$1 AND product_id=$2) AS tracked,
      (SELECT count(*) FROM zhirox_local.lot_checkouts_v90 WHERE store_id=$1) AS lot_sales,
      (SELECT count(*) FROM zhirox_local.lot_returns_v90 WHERE store_id=$1) AS lot_returns,
      (SELECT COALESCE(sum(amount_minor),0) FROM zhirox_local.sale_returns_v84 WHERE store_id=$1) AS face_value
  `, [STORE,SUGAR]);
  return Object.fromEntries(Object.entries(rows[0]).map(([key,value])=>[key,Number(value)]));
}
function equalState(actual, expected, label) {
  assert.deepEqual(actual,expected,`V91 ${label}: unexpected committed sale/stock/outbox/return state`);
}

try {
  const {rows: context} = await pool.query(`
    SELECT current_database() AS db, current_user AS db_user,
      (SELECT count(*) FROM zhirox_local.stores) AS stores,
      (SELECT name FROM zhirox_local.stores WHERE id=$1) AS store_name,
      (SELECT count(*) FROM zhirox_local.lot_cutovers_v90 WHERE store_id=$1) AS cutovers,
      (SELECT count(*) FROM zhirox_local.local_users WHERE store_id=$1 AND id IN ($2,$3) AND enabled AND role IN ('owner','cashier')) AS actors
  `, [STORE, OWNER, CASHIER]);
  assert.equal(context[0].db,"zhirox_v80_disposable");
  assert.equal(context[0].db_user,"v80test");
  assert.equal(Number(context[0].stores),1);
  assert.equal(context[0].store_name,"مارکێتی تاقیکردنەوە");
  assert.equal(Number(context[0].cutovers),1);
  assert.equal(Number(context[0].actors),2);
  equalState(await state(), {
    sales:5, distinct_receipts:5, gross:89000, events:5,
    stock:3, tracked:3, lot_sales:1, lot_returns:1, face_value:11000,
  },"V90 fixture starting state");

  // Different connections race the SAME UUID: exactly one inserts and one replays.
  const retries=await Promise.all([
    checkout(REQUEST_RETRY,1),
    checkout(REQUEST_RETRY,1),
  ]);
  assert.deepEqual(retries.map(x=>x.replayed).sort(),[false,true]);
  assert.equal(retries[0].sale_id,retries[1].sale_id);
  assert.equal(Number(retries[0].receipt_no),6);
  assert.equal(Number(retries[0].total_minor),3000);
  equalState(await state(), {
    sales:6, distinct_receipts:6, gross:92000, events:6,
    stock:2, tracked:2, lot_sales:2, lot_returns:1, face_value:11000,
  },"same-UUID double submission");

  // Two distinct cashier sales compete for the last TWO saleable units.
  // Store-level row locking must permit exactly ONE and atomically reject one.
  const race=await Promise.allSettled([
    checkout(REQUEST_RACE_A,2,CASHIER),
    checkout(REQUEST_RACE_B,2,OWNER),
  ]);
  const winners=race.filter(x=>x.status==="fulfilled");
  const losers=race.filter(x=>x.status==="rejected");
  assert.equal(winners.length,1,"Concurrent cashiers both sold the last stock or both failed");
  assert.equal(losers.length,1);
  assert.equal(losers[0].reason.code,"23514","Expected stock ceiling refusal");
  const winner=winners[0].value;
  assert.equal(winner.replayed,false);
  assert.equal(Number(winner.receipt_no),7);
  assert.equal(Number(winner.total_minor),6000);
  const {rows: attributed}=await pool.query(`
    SELECT a.quantity_base_units,a.opening_id,a.receipt_id,n.lot_code
      FROM zhirox_local.lot_sale_allocations_v90 a
      JOIN zhirox_local.lot_receipt_lines_v89 n
        ON n.store_id=a.store_id AND n.receipt_id=a.receipt_id
        AND n.line_no=a.receipt_line_no
     WHERE a.store_id=$1 AND a.sale_id=$2
  `,[STORE,winner.sale_id]);
  assert.equal(attributed.length,1);
  assert.equal(Number(attributed[0].quantity_base_units),2);
  assert.equal(attributed[0].opening_id,null);
  assert.equal(attributed[0].lot_code,"SUGAR-NEW-89");
  equalState(await state(), {
    sales:7, distinct_receipts:7, gross:98000, events:7,
    stock:0, tracked:0, lot_sales:3, lot_returns:1, face_value:11000,
  },"competing cashiers and source LOT allocation");

  // The losing checkout cannot have left a ghost receipt, sale or event.
  const loserId=race[0].status==="rejected" ? REQUEST_RACE_A : REQUEST_RACE_B;
  const {rows: ghosts}=await pool.query(
    "SELECT id FROM zhirox_local.sales WHERE store_id=$1 AND request_id=$2",
    [STORE,loserId]
  );
  assert.equal(ghosts.length,0);
  await assert.rejects(checkout(REQUEST_RETRY,2), {code:"P9003"});
  await assert.rejects(checkout(loserId,2), {code:"23514"});

  // Two manager requests with SAME return UUID: 1 accounting entry and 1 restock.
  const returned=await Promise.all([returnLot(winner.sale_id),returnLot(winner.sale_id)]);
  assert.deepEqual(returned.map(x=>x.replayed).sort(),[false,true]);
  assert.equal(returned[0].return_id,returned[1].return_id);
  assert.equal(Number(returned[0].face_value_minor),3000);
  equalState(await state(), {
    sales:7, distinct_receipts:7, gross:98000, events:7,
    stock:1, tracked:1, lot_sales:3, lot_returns:2, face_value:14000,
  },"duplicate return request");

  const {rows: journal}=await pool.query(
    "SELECT status,amount_minor,restocked FROM zhirox_local.sale_returns_v84 WHERE store_id=$1 AND request_id=$2",
    [STORE,REQUEST_RETURN]
  );
  assert.equal(journal.length,1);
  assert.equal(journal[0].status,"accounting_only");
  assert.equal(Number(journal[0].amount_minor),3000);
  assert.equal(journal[0].restocked,true);
  console.log("V91 PASS: independent PostgreSQL connections serialize duplicate sale, finite LOT stock, receipt/outbox, and accounting-only return.");
} finally {
  await pool.end();
}
