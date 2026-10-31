// V80: explicitly provision the disposable/persistent TEST-MARKET database.
// Real transactional PostgreSQL rows, strictly separate from the real store.
// Never call from a deployed cashier or production runtime.
// This script NEVER deletes an account, store, or data.
import {hashLocalPassword} from "./local-password.mjs";

export const TEST_MARKET={
 name:"مارکێتی تاقیکردنەوە",
 store:"88000000-0000-4000-8000-000000000080",
 owner:"88000000-0000-4000-8000-000000000081",
 cashier:"88000000-0000-4000-8000-000000000082",
 ownerUsername:"test-market-owner",
 cashierUsername:"test-market-cashier",
 product1:"88000000-0000-4000-8000-000000000091",
 product2:"88000000-0000-4000-8000-000000000092",
 customer:"88000000-0000-4000-8000-0000000000a1",
 saleRequest1:"88000000-0000-4000-8000-0000000000b1",
 saleRequest2:"88000000-0000-4000-8000-0000000000b2",
 debtRequest:"88000000-0000-4000-8000-0000000000c1",
 repaymentRequest:"88000000-0000-4000-8000-0000000000c2"
};

export function assertTestMarketTarget({dbName,host,storeCount,consent}){
 if(consent!=="YES_CREATE_TEST_MARKET" ||
    !["zhirox_v80_disposable","zhirox_test_market"].includes(dbName) ||
    !["127.0.0.1","localhost","::1"].includes(host) ||
    storeCount!==0)
   throw Error("refuse_nonempty_or_nonisolated_test_database");
}
export async function provisionTestMarket({pool,dbHost,passwordOwner,passwordCashier,consent}){
 if(!pool||typeof pool.connect!=="function")throw Error("postgres_pool_required");
 for(const pw of [passwordOwner,passwordCashier]){
  if(typeof pw!=="string"||pw.length<12||Buffer.byteLength(pw)>1024)
   throw Error("require_strong_one_time_account_passwords");
 }
 const client=await pool.connect();
 let inTransaction=false;
 try{
  const identity=await client.query("SELECT current_database() AS dbname");
  const count=await client.query("SELECT count(*)::integer AS n FROM zhirox_local.stores");
  assertTestMarketTarget({dbName:identity.rows[0].dbname,host:dbHost,
    storeCount:count.rows[0].n,consent});
  const ownerHash=await hashLocalPassword(passwordOwner);
  const cashierHash=await hashLocalPassword(passwordCashier);
  await client.query("BEGIN");
  inTransaction=true;
  const m=TEST_MARKET;
  await client.query("INSERT INTO zhirox_local.stores(id,name) VALUES($1,$2)",
    [m.store,m.name]);
  await client.query(
    "INSERT INTO zhirox_local.local_users(store_id,id,username,password_hash,role) VALUES($1,$2,$3,$4,$5),($1,$6,$7,$8,$9)",
    [m.store,m.owner,m.ownerUsername,ownerHash,"owner",m.cashier,m.cashierUsername,cashierHash,"cashier"]
  );
  await client.query(
    "INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units) VALUES($1,$2,$3,$4,$5),($1,$6,$7,$8,$9)",
    [m.store,m.product1,"نموونە — ئاوی تاقیکردنەوە",2500,24,
     m.product2,"نموونە — شەکری تاقیکردنەوە",3000,18]
  );
  await client.query(
    "INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units) VALUES($1,$2,$3,1),($1,$4,$5,1)",
    [m.store,"TESTV80-ITEM-001",m.product1,"TESTV80-ITEM-002",m.product2]
  );
  // Real checkout function commits sale, lines, stock deduction, receipt and outbox atomically.
  const sale1=await client.query(
    "SELECT * FROM zhirox_local.checkout_cash_v1($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
    [m.store,m.cashier,m.saleRequest1,JSON.stringify([
      {product_id:m.product1,qty:2},{product_id:m.product2,qty:1}])]
  );
  const sale2=await client.query(
    "SELECT * FROM zhirox_local.checkout_cash_v1($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
    [m.store,m.cashier,m.saleRequest2,JSON.stringify([{product_id:m.product2,qty:1}])]
  );
  if(Number(sale1.rows[0]?.total_minor)!==8000||Number(sale2.rows[0]?.total_minor)!==3000)
   throw Error("test_sale_total_mismatch");
  await client.query("SELECT zhirox_local.register_customer_v79($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text)",
   [m.store,m.owner,m.customer,"کڕیاری نموونەی تاقیکردنەوە",null]);
  const debt=await client.query(
    "SELECT zhirox_local.record_customer_debt_v79($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::text) AS balance",
    [m.store,m.owner,m.customer,m.debtRequest,"opening_debt",15000,"TEST ONLY opening accounting debt"]
  );
  const repayment=await client.query(
    "SELECT zhirox_local.record_customer_debt_v79($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::text) AS balance",
    [m.store,m.owner,m.customer,m.repaymentRequest,"repayment",5000,"TEST ONLY accounting repayment, no cash"]
  );
  if(Number(debt.rows[0].balance)!==15000||Number(repayment.rows[0].balance)!==10000)
   throw Error("test_ledger_balance_mismatch");
  await client.query("COMMIT");
  inTransaction=false;
  return {ok:true,db_mode:"isolated-postgresql",store_name:m.name,store_id:m.store,
    owner_username:m.ownerUsername,cashier_username:m.cashierUsername,
    sales_recorded:2,total_sales_minor:11000,customer_count:1,
    debt_balance_minor:10000,passwords:"never_logged",
    payment_status:"accounting_record_only_NOT_money_received",data_retained:true};
 }catch(e){
  if(inTransaction)await client.query("ROLLBACK").catch(()=>{});
  throw e;
 }finally{client.release();}
}

export async function runProvisionCli(){
 if(process.env.ZHIROX_V80_CREATE_MARKET!=="YES_CREATE_TEST_MARKET")
  throw Error("explicit_test_market_creation_authorization_required");
 const url=process.env.ZHIROX_LOCAL_DB_URL;
 if(!url)throw Error("isolated_test_postgresql_url_required");
 const parsed=new URL(url);
 if(parsed.protocol!=="postgres:"&&parsed.protocol!=="postgresql:")
  throw Error("postgresql_required");
 if(!["127.0.0.1","localhost","[::1]"].includes(parsed.hostname))
  throw Error("test_db_must_be_local_loopback");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:3000});
 try{
  const result=await provisionTestMarket({pool,dbHost:parsed.hostname,
   passwordOwner:process.env.ZHIROX_TEST_OWNER_PASSWORD,
   passwordCashier:process.env.ZHIROX_TEST_CASHIER_PASSWORD,
   consent:process.env.ZHIROX_V80_CREATE_MARKET});
  console.log(JSON.stringify(result));
 }finally{await pool.end();}
}
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href){
 runProvisionCli().catch(e=>{console.error("test_market_provision_failed:",e.message);process.exitCode=1;});
}
