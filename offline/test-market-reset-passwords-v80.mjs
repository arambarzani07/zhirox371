// V80 restore helper for the test-only account; updates passwords only.
// Not executed automatically by setup or CI and NEVER touches production.
import {hashLocalPassword} from "./local-password.mjs";
import {TEST_MARKET,assertTestMarketTarget} from "./test-market-v80.mjs";

export async function resetTestMarketPasswords({pool,host,ownerPassword,cashierPassword,confirmation}){
 if(confirmation!=="YES_RESET_TEST_PASSWORDS")throw Error("explicit_test_password_reset_required");
 for(const value of [ownerPassword,cashierPassword]){
  if(typeof value!=="string"||value.length<12||Buffer.byteLength(value)>1024)
   throw Error("strong_password_required");
 }
 const client=await pool.connect();
 let transaction=false;
 try{
  const db=await client.query("SELECT current_database() AS dbname");
  const stores=await client.query("SELECT id,name FROM zhirox_local.stores");
  // Use separate guard: this already has exactly the one known test store.
  if(!["zhirox_test_market","zhirox_v80_disposable"].includes(db.rows[0].dbname)||
     !["127.0.0.1","localhost","::1"].includes(host)||
     stores.rows.length!==1 || stores.rows[0].id!==TEST_MARKET.store||
     stores.rows[0].name!==TEST_MARKET.name)
   throw Error("refuse_unverified_test_store");
  const hashOwner=await hashLocalPassword(ownerPassword);
  const hashCashier=await hashLocalPassword(cashierPassword);
  await client.query("BEGIN");transaction=true;
  const a=await client.query(
   "UPDATE zhirox_local.local_users SET password_hash=$1,session_version=session_version+1,failed_attempts=0,locked_until=NULL WHERE store_id=$2 AND id=$3 AND role='owner' RETURNING id",
   [hashOwner,TEST_MARKET.store,TEST_MARKET.owner]);
  const b=await client.query(
   "UPDATE zhirox_local.local_users SET password_hash=$1,session_version=session_version+1,failed_attempts=0,locked_until=NULL WHERE store_id=$2 AND id=$3 AND role='cashier' RETURNING id",
   [hashCashier,TEST_MARKET.store,TEST_MARKET.cashier]);
  if(a.rowCount!==1||b.rowCount!==1)throw Error("test_accounts_not_found");
  await client.query("COMMIT");transaction=false;
  return {ok:true,owner:TEST_MARKET.ownerUsername,cashier:TEST_MARKET.cashierUsername,
   store:TEST_MARKET.name,passwords:"reset_and_not_logged",other_data:"unchanged"};
 }catch(e){if(transaction)await client.query("ROLLBACK").catch(()=>{});throw e;}
 finally{client.release();}
}
export async function run(){
 if(process.env.ZHIROX_V80_RESET_TEST_PASSWORDS!=="YES_RESET_TEST_PASSWORDS")
  throw Error("explicit_test_password_reset_required");
 const raw=process.env.ZHIROX_LOCAL_DB_URL; if(!raw)throw Error("test_db_url_required");
 const url=new URL(raw);
 if(!["postgres:","postgresql:"].includes(url.protocol)||
    !["127.0.0.1","localhost","[::1]"].includes(url.hostname))
  throw Error("test_db_must_be_local_only");
 const {Pool}=await import("pg");const pool=new Pool({connectionString:raw,max:1});
 try{
  const r=await resetTestMarketPasswords({pool,host:url.hostname,
   ownerPassword:process.env.ZHIROX_TEST_OWNER_PASSWORD,
   cashierPassword:process.env.ZHIROX_TEST_CASHIER_PASSWORD,
   confirmation:process.env.ZHIROX_V80_RESET_TEST_PASSWORDS});
  console.log(JSON.stringify(r));
 }finally{await pool.end();}
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 run().catch(e=>{console.error("test_password_reset_failed:",e.message);process.exitCode=1;});
}
