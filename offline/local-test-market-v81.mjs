import http from "node:http";
import {fileURLToPath} from "node:url";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {TEST_MARKET} from "./test-market-v80.mjs";

// V81 isolated, read-only test-market dashboard. No sale/refund/debt POST APIs.
// All identity comes from a verified session and an independently checked DB.
// This intentionally does NOT share a gateway with any live Kani Chnar store.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(res,status,obj)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY"});
 res.end(JSON.stringify(obj));
};
const validDbName=new Set(["zhirox_v80_disposable","zhirox_test_market"]);
const routeNames=new Set(["overview","products","sales","customers"]);
async function checkTestStore(pool){
 const db=await pool.query("SELECT current_database() AS dbname");
 if(!validDbName.has(db.rows?.[0]?.dbname))throw Error("isolated_test_database_required");
 const stores=await pool.query("SELECT id,name FROM zhirox_local.stores");
 if(stores.rows?.length!==1 || stores.rows[0].id!==TEST_MARKET.store ||
    stores.rows[0].name!==TEST_MARKET.name)
   throw Error("only_the_one_approved_test_store_is_allowed");
}
async function readJson(req,maxBytes=4096){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"]||""))
  return null;
 let bytes=0;const chunks=[];
 for await(const b of req){
  bytes+=b.length;if(bytes>maxBytes)return null;
  chunks.push(b);
 }
 try{
  const obj=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return obj&&typeof obj==="object"&&!Array.isArray(obj)?obj:null;
 }catch{return null}
}
export function createTestMarketHandlerV81({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("postgres_pool_required");
 const auth=createLocalAuthV3({pool,secret,clock});
 return async(req,res)=>{
  let url;try{url=new URL(req.url||"/","http://127.0.0.1");}
  catch{return json(res,400,{error:"invalid_url"})}
  if(!url.pathname.startsWith("/api/local/v81/"))
   return json(res,404,{error:"not_found"});
  const route=url.pathname.slice("/api/local/v81/".length);
  const ledger=route.match(/^customers\/([0-9a-f-]+)\/ledger$/i);
  const login=route==="login";
  const overview=routeNames.has(route);
  if(!login&&!overview&&!ledger)return json(res,404,{error:"not_found"});
  if(req.method!==(login?"POST":"GET"))return json(res,405,{error:"method_not_allowed"});
  if(url.search)return json(res,400,{error:"unexpected_query"});
  if(ledger&&!UUID.test(ledger[1]))return json(res,400,{error:"invalid_customer"});
  // No DB result, secret or credentials must be sent to the client if this fails.
  try{await checkTestStore(pool)}
  catch{return json(res,503,{error:"test_market_not_available"})}
  if(login){
   const body=await readJson(req);
   if(!body||typeof body.username!=="string"||typeof body.password!=="string"||
      ![TEST_MARKET.ownerUsername,TEST_MARKET.cashierUsername].includes(body.username)||
      body.password.length<1 || body.password.length>1024||
      Object.keys(body).some(k=>!["username","password"].includes(k)))
    return json(res,400,{error:"invalid_login"});
   try{
    const session=await auth.login({store_id:TEST_MARKET.store,username:body.username,
      password:body.password});
    if(!session)return json(res,401,{error:"invalid_credentials"});
    return json(res,200,{ok:true,token:session.token,role:session.role,
      store_name:TEST_MARKET.name,expires_in_seconds:session.expires_in_seconds});
   }catch{return json(res,503,{error:"test_market_not_available"})}
  }
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const principal=match?await auth.authorize(match[1],["owner","manager","cashier"]).catch(()=>null):null;
  if(!principal||principal.store_id!==TEST_MARKET.store)
   return json(res,401,{error:"invalid_session"});
  if((route==="customers"||ledger)&&!["owner","manager"].includes(principal.role))
   return json(res,403,{error:"manager_required"});
  try{
   const store=principal.store_id;
   if(route==="overview"){
    const [sale,goods,debts]=await Promise.all([
     pool.query("SELECT count(*)::integer AS sale_count,coalesce(sum(total_minor),0)::bigint AS sale_total FROM zhirox_local.sales WHERE store_id=$1::uuid"+(principal.role==="cashier"?" AND cashier_id=$2::uuid":""),principal.role==="cashier"?[store,principal.user_id]:[store]),
     pool.query("SELECT count(*)::integer AS product_count,coalesce(sum(stock_base_units),0)::bigint AS stock_total FROM zhirox_local.products WHERE store_id=$1::uuid",[store]),
     principal.role==="cashier"?Promise.resolve(null):pool.query("SELECT count(*)::integer AS customer_count,coalesce(sum(balance_minor),0)::bigint AS debt_total FROM zhirox_local.customer_debt_balances_v79 WHERE store_id=$1::uuid",[store])
    ]);
    return json(res,200,{ok:true,store_name:TEST_MARKET.name,scope:"ISOLATED_TEST_ONLY",
     sales:sale.rows[0],stock:goods.rows[0],...(debts?{customers:debts.rows[0]}:{})});
   }
   if(route==="products"){
    const result=await pool.query(
     "SELECT p.id,p.name,p.price_minor,p.stock_base_units,b.code AS barcode FROM zhirox_local.products p LEFT JOIN LATERAL (SELECT code FROM zhirox_local.barcodes WHERE store_id=p.store_id AND product_id=p.id AND active ORDER BY code LIMIT 1) b ON true WHERE p.store_id=$1::uuid AND p.active ORDER BY p.name,p.id LIMIT 100",
     [store]);
    return json(res,200,{ok:true,products:result.rows});
   }
   if(route==="sales"){
    const result=await pool.query(
     "SELECT receipt_no,total_minor,created_at FROM zhirox_local.sales WHERE store_id=$1::uuid"+(principal.role==="cashier"?" AND cashier_id=$2::uuid":"")+" ORDER BY receipt_no DESC LIMIT 100",
     principal.role==="cashier"?[store,principal.user_id]:[store]);
    return json(res,200,{ok:true,sales:result.rows});
   }
   if(route==="customers"){
    const result=await pool.query(
     "SELECT customer_id,display_name,balance_minor,is_active FROM zhirox_local.customer_debt_balances_v79 WHERE store_id=$1::uuid ORDER BY display_name,customer_id LIMIT 100",
     [store]);
    return json(res,200,{ok:true,customers:result.rows});
   }
   if(ledger){
    const result=await pool.query(
     "SELECT entry_id,entry_type,amount_minor,reference,created_at FROM zhirox_local.customer_debt_ledger_v79 WHERE store_id=$1::uuid AND customer_id=$2::uuid ORDER BY created_at DESC,entry_id DESC LIMIT 100",
     [store,ledger[1]]);
    return json(res,200,{ok:true,entries:result.rows});
   }
  }catch{return json(res,503,{error:"local_database_unavailable"})}
 };
}
export async function startTestMarketV81(){
 if(process.env.ZHIROX_V81_TEST_MARKET!=="YES_LOCAL_TEST_READ_ONLY")
  throw Error("V81_test_market_explicit_opt_in_required");
 const url=process.env.ZHIROX_LOCAL_DB_URL;
 const secret=process.env.ZHIROX_LOCAL_SESSION_SECRET;
 if(!url||!secret||Buffer.byteLength(secret)<32)throw Error("test_DB_or_secret_required");
 const parsed=new URL(url);
 if(!["postgres:","postgresql:"].includes(parsed.protocol)||
    !["127.0.0.1","localhost","[::1]"].includes(parsed.hostname)||
    !validDbName.has(parsed.pathname.slice(1)))
   throw Error("non_isolated_database_refused");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:url,max:5,connectionTimeoutMillis:2500});
 try{await checkTestStore(pool)}catch(e){await pool.end();throw e}
 const server=http.createServer(createTestMarketHandlerV81({pool,secret}));
 server.listen(3311,"127.0.0.1");
 server.on("close",()=>pool.end());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startTestMarketV81().catch(e=>{console.error("test_market_readonly_unavailable:",e.message);process.exitCode=1;});
}
