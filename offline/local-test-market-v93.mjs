// V93 separate PostgreSQL identities for login and READ-only test-market HTTP.
// ISOLATED localhost lab only; not a trusted production cashier/write gateway.
// V81 remains unchanged. NO financial HTTP POST, delete, refund or settlement.
import http from "node:http";
import {fileURLToPath} from "node:url";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {TEST_MARKET} from "./test-market-v80.mjs";

const ROUTES=new Set(["login","stock","lots","receipts"]);
const READ_ROLE="zhirox_v93_api_reader";
const TEST_DB="zhirox_v80_disposable";
const reply=(res,status,body)=>{
 res.writeHead(status,{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, private",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
  "X-Frame-Options":"DENY",
  "Content-Security-Policy":"default-src 'none'",
 });
 res.end(JSON.stringify(body));
};
async function bodyJson(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))return null;
 let bytes=0,parts=[];
 try{
  for await(const chunk of req){
   bytes+=chunk.length;
   if(bytes>4096)return null;
   parts.push(chunk);
  }
  const body=JSON.parse(Buffer.concat(parts).toString("utf8"));
  return body && typeof body==="object" && !Array.isArray(body)?body:null;
 }catch{return null}
}
async function validateAuthDatabase(authPool,expectedAuthRole="v80test"){
 const result=await authPool.query(`
 SELECT current_database() AS db,current_user AS actor,
 (SELECT count(*) FROM zhirox_local.stores) AS stores,
 (SELECT name FROM zhirox_local.stores WHERE id=$1::uuid) AS market
 `,[TEST_MARKET.store]);
 const row=result.rows?.[0];
 if(row?.db!==TEST_DB || row?.actor!==expectedAuthRole || Number(row?.stores)!==1 ||
    row.market!==TEST_MARKET.name)throw Error("V93_isolated_auth_database_required");
}
async function validateReadDatabase(readPool){
 const {rows}=await readPool.query(`
 SELECT current_database() AS db,current_user AS actor,
 has_table_privilege(current_user,'zhirox_local.products','SELECT') AS base_read,
 has_table_privilege(current_user,'zhirox_local.products','UPDATE') AS base_update,
 has_table_privilege(current_user,'zhirox_local.sales','INSERT') AS base_sale_insert,
 has_table_privilege(current_user,'zhirox_local.v92_stock_readonly','SELECT') AS can_view
 `);
 const x=rows?.[0];
 if(x?.db!==TEST_DB || x?.actor!==READ_ROLE || x.base_read!==false ||
    x.base_update!==false || x.base_sale_insert!==false || x.can_view!==true)
   throw Error("V93_restricted_reader_postgres_role_required");
}
export function createV93TestMarketHandler({authPool,readPool,secret,clock,
 expectedAuthRole="v80test",routePrefix="/api/local/v93/"}){
 if(typeof authPool?.query!=="function" || typeof authPool?.connect!=="function"||
    typeof readPool?.query!=="function" || !secret || Buffer.byteLength(secret)<32)
   throw Error("V93_separate_database_pools_and_secret_required");
 if(authPool===readPool)throw Error("V93_auth_and_reader_must_be_separate_pools");
 if(!((expectedAuthRole==="v80test" && routePrefix==="/api/local/v93/") ||
      (expectedAuthRole==="zhirox_v94_auth" && routePrefix==="/api/local/v94/")))
  throw Error("V94_auth_route_role_pair_required");
 const auth=createLocalAuthV3({pool:authPool,secret,clock});
 return async (req,res)=>{
  let url;
  try{url=new URL(req.url||"/","http://127.0.0.1");}
  catch{return reply(res,400,{error:"invalid_url"})}
  if(!url.pathname.startsWith(routePrefix))
   return reply(res,404,{error:"not_found"});
  const route=url.pathname.slice(routePrefix.length);
  if(!ROUTES.has(route))return reply(res,404,{error:"not_found"});
  if(req.method!==(route==="login"?"POST":"GET"))
   return reply(res,405,{error:"method_not_allowed"});
  if(url.search)return reply(res,400,{error:"unexpected_query"});
  try{
   // Fail closed before any login/data read if a test store is replaced.
   await validateAuthDatabase(authPool,expectedAuthRole);
   if(route==="login"){
    const data=await bodyJson(req);
    if(!data || typeof data.username!=="string" || typeof data.password!=="string" ||
      ![TEST_MARKET.ownerUsername,TEST_MARKET.cashierUsername].includes(data.username) ||
      data.password.length<1 || Buffer.byteLength(data.password)>1024 ||
      Object.keys(data).some(key=>!["username","password"].includes(key)))
     return reply(res,400,{error:"invalid_login"});
    const session=await auth.login({store_id:TEST_MARKET.store,
      username:data.username,password:data.password});
    if(!session)return reply(res,401,{error:"invalid_credentials"});
    return reply(res,200,{ok:true,token:session.token,role:session.role,
      expires_in_seconds:session.expires_in_seconds,scope:"ISOLATED_TEST_ONLY"});
   }
   const bearer=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
   const principal=bearer?await auth.authorize(bearer[1],["owner","manager","cashier"]):null;
   if(!principal || principal.store_id!==TEST_MARKET.store)
    return reply(res,401,{error:"invalid_session"});
   if(route!=="stock" && !["owner","manager"].includes(principal.role))
    return reply(res,403,{error:"manager_required"});
   // All business data comes ONLY from separately authenticated V93 viewer
   // reading V92 SECURITY BARRIER views, not from the owner auth pool.
   await validateReadDatabase(readPool);
   const sql=route==="stock"
    ? "SELECT product_id,product_name,price_minor,stock_base_units,tracked_lot_units FROM zhirox_local.v92_stock_readonly ORDER BY product_id LIMIT 100"
    :route==="lots"
    ? "SELECT product_id,lot_origin,lot_code,expires_on,starting_qty,tracked_remaining FROM zhirox_local.v92_lots_readonly ORDER BY product_id,expires_on,lot_code LIMIT 100"
    : "SELECT receipt_no,total_minor,created_at FROM zhirox_local.v92_receipts_readonly ORDER BY receipt_no DESC LIMIT 100";
   const result=await readPool.query(sql);
   return reply(res,200,{
    ok:true,scope:"ISOLATED_TEST_ONLY",status:"read_only",
    source:"restricted_postgresql_v93",role:principal.role,
    ...(route==="stock"?{stock:result.rows}:route==="lots"?{lots:result.rows}:{receipts:result.rows})
   });
  }catch{return reply(res,503,{error:"isolated_test_database_unavailable"})}
 };
}
function parseLocalUrl(raw,username){
 if(!raw)throw Error("V93_database_url_required");
 const url=new URL(raw);
 if(!["postgres:","postgresql:"].includes(url.protocol)||
    !["localhost","127.0.0.1","[::1]"].includes(url.hostname)||
    url.pathname!=="/"+TEST_DB || url.username!==username || !url.password)
   throw Error("V93_local_database_identity_or_host_mismatch");
 return raw;
}
export async function startV93ReadOnlyServer(){
 if(process.env.ZHIROX_V93_READONLY_API!=="YES_ISOLATED_V93_DUAL_POOL")
  throw Error("V93_explicit_test_flag_required");
 const authUrl=parseLocalUrl(process.env.ZHIROX_V93_AUTH_DB_URL,"v80test");
 const readUrl=parseLocalUrl(process.env.ZHIROX_V93_READER_DB_URL,READ_ROLE);
 const secret=process.env.ZHIROX_LOCAL_SESSION_SECRET;
 if(!secret || Buffer.byteLength(secret)<32)throw Error("V93_secret_required");
 const {Pool}=await import("pg");
 const authPool=new Pool({connectionString:authUrl,max:2,connectionTimeoutMillis:4000});
 const readPool=new Pool({connectionString:readUrl,max:4,connectionTimeoutMillis:4000});
 try{
  await validateAuthDatabase(authPool);
  await validateReadDatabase(readPool);
  const server=http.createServer(createV93TestMarketHandler({authPool,readPool,secret}));
  server.on("close",()=>{void Promise.all([authPool.end(),readPool.end()]);});
  await new Promise((resolve,reject)=>{
   server.once("error",reject);
   server.listen(3312,"127.0.0.1",resolve);
  });
  return server;
 }catch(error){
  await Promise.allSettled([authPool.end(),readPool.end()]);
  throw error;
 }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV93ReadOnlyServer().catch(error=>{
  console.error("isolated_V93_readonly_unavailable:",error.message);
  process.exitCode=1;
 });
}
