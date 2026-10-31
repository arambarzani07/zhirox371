// V94 localhost-only test API: authentication has no financial table grants.
// Both PostgreSQL credentials are ephemeral CI-only. No production use.
import http from "node:http";
import {fileURLToPath} from "node:url";
import {createV93TestMarketHandler} from "./local-test-market-v93.mjs";
import {TEST_MARKET} from "./test-market-v80.mjs";
const DB="zhirox_v80_disposable";
const AUTH_ROLE="zhirox_v94_auth";
const READ_ROLE="zhirox_v93_api_reader";

export async function assertV94AuthPrivilegeBoundary(pool){
 const {rows}=await pool.query(`
 SELECT current_database() AS db,current_user AS actor,
  (SELECT count(*) FROM zhirox_local.stores) AS store_count,
  (SELECT name FROM zhirox_local.stores WHERE id=$1::uuid) AS store_name,
  has_table_privilege(current_user,'zhirox_local.products','SELECT') AS product_read,
  has_table_privilege(current_user,'zhirox_local.products','UPDATE') AS stock_write,
  has_table_privilege(current_user,'zhirox_local.sales','INSERT') AS sale_write,
  has_table_privilege(current_user,'zhirox_local.local_users','UPDATE') AS all_users_write,
  has_column_privilege(current_user,'zhirox_local.local_users','password_hash','SELECT') AS verifier_read,
  has_column_privilege(current_user,'zhirox_local.local_users','password_hash','UPDATE') AS password_write,
  has_column_privilege(current_user,'zhirox_local.local_users','failed_attempts','UPDATE') AS failures_write,
  has_column_privilege(current_user,'zhirox_local.local_users','locked_until','UPDATE') AS lock_write
 `,[TEST_MARKET.store]);
 const x=rows?.[0];
 if(x?.db!==DB || x.actor!==AUTH_ROLE || Number(x.store_count)!==1 ||
  x.store_name!==TEST_MARKET.name || x.product_read!==false ||
  x.stock_write!==false || x.sale_write!==false || x.all_users_write!==false ||
  x.verifier_read!==true || x.password_write!==false ||
  x.failures_write!==true || x.lock_write!==true)
   throw Error("V94_auth_privilege_boundary_refused");
 return true;
}
function urlForRole(raw,role){
 if(typeof raw!=="string"||!raw)throw Error("V94_missing_db_url");
 const url=new URL(raw);
 if(!["postgres:","postgresql:"].includes(url.protocol) ||
    !["127.0.0.1","localhost","[::1]"].includes(url.hostname) ||
    url.pathname!=="/"+DB || decodeURIComponent(url.username)!==role ||
    !url.password || url.search || url.hash)
   throw Error("V94_nonisolated_or_wrong_db_identity");
 return raw;
}
export async function startV94ReadOnlyServer(){
 if(process.env.ZHIROX_V94_READONLY_API!=="YES_ISOLATED_V94_AUTH_ROLE")
  throw Error("V94_explicit_test_only_flag_required");
 const authUrl=urlForRole(process.env.ZHIROX_V94_AUTH_DB_URL,AUTH_ROLE);
 const readUrl=urlForRole(process.env.ZHIROX_V94_READER_DB_URL,READ_ROLE);
 const secret=process.env.ZHIROX_LOCAL_SESSION_SECRET;
 if(!secret||Buffer.byteLength(secret)<32)throw Error("V94_session_secret_required");
 const {Pool}=await import("pg");
 const authPool=new Pool({connectionString:authUrl,max:2,connectionTimeoutMillis:4000});
 const readPool=new Pool({connectionString:readUrl,max:3,connectionTimeoutMillis:4000});
 try{
  await assertV94AuthPrivilegeBoundary(authPool);
  const {rows}=await readPool.query(`
    SELECT current_database() AS db,current_user AS actor,
     has_table_privilege(current_user,'zhirox_local.products','SELECT') AS base_read,
     has_table_privilege(current_user,'zhirox_local.v92_stock_readonly','SELECT') AS view_read
  `);
  if(rows?.[0]?.db!==DB||rows[0].actor!==READ_ROLE||
      rows[0].base_read!==false||rows[0].view_read!==true)
   throw Error("V94_read_pool_not_restricted");
  const server=http.createServer(createV93TestMarketHandler({
   authPool,readPool,secret,
   expectedAuthRole:AUTH_ROLE,routePrefix:"/api/local/v94/"
  }));
  server.on("close",()=>{void Promise.allSettled([authPool.end(),readPool.end()]);});
  await new Promise((resolve,reject)=>{
   server.once("error",reject);server.listen(3313,"127.0.0.1",resolve);
  });
  return server;
 }catch(error){await Promise.allSettled([authPool.end(),readPool.end()]);throw error;}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV94ReadOnlyServer().catch(e=>{console.error("V94_test_api_unavailable:",e.message);process.exitCode=1;});
}
