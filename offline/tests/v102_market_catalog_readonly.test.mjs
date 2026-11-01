import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,symlink,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {readFileSync} from "node:fs";
import {once} from "node:events";
import {parseMarketCSVV102,openMarketCSVV102} from "../market-catalog-v102.mjs";
import {createV102CatalogServer,startV102CatalogLocalOnly} from "../market-catalog-http-v102.mjs";

const sample=[
 'ItemNameID,ItemName,ItemCode,SalePrice,WholeSalePrice',
 '1,"ئاو, کانی چنار",6260053183974,1000,500',
 '2,"پەنیر ""ئەسڵی""",8698686920297,2500,2000',
 '3,کاڵای کۆن,1112223334445,1000,900',
 '4,کاڵای نوێ,1112223334445,2000,1900',
 '1,"ئاو, کانی چنار",6260053183974,1000,500',
 '6,ئەمە بێ نرخە,1234567891011,NOT_A_PRICE,0',
 '7,"وشەیەکی\nدوو هێڵی",1234567891012,3000,2800'
].join("\r\n")+"\r\n";

test("V102 authentic SQL export headers, multiline UTF8, quoted commas, English numeric barcodes",()=>{
 const cat=parseMarketCSVV102(sample,{modifiedAt:"2026-11-01T09:00:00.000Z"});
 assert.equal(cat.status.scanned_rows,7);
 assert.equal(cat.status.valid_rows,6);
 assert.equal(cat.status.invalid_rows,1);
 assert.equal(cat.status.ambiguous_barcodes,1);
 assert.equal(cat.scan("6260053183974").item.name,"ئاو, کانی چنار");
 assert.equal(cat.scan("1112223334445").error,"ambiguous_barcode_refused");
 assert.equal(cat.scan("8698686920297").item.name,'پەنیر "ئەسڵی"');
 assert.equal(cat.scan("1234567891012").item.price_minor,3000);
 assert.equal(cat.search("ئاو")[0].price_minor,1000);
 assert.equal(cat.search("کۆن").length,0,"conflicting price cannot leak to lookup");
 assert.equal(JSON.stringify(cat.scan("8698686920297")).includes("WholeSalePrice"),false);
 assert.equal(cat.status.checkout_enabled,false);
 assert.equal(cat.status.stock_verified,false);
 assert.equal(cat.status.source_modified_at,"2026-11-01T09:00:00.000Z");
});
test("V102 supports legacy extracted 15-column read-only product CSV without guessing stock",()=>{
 const csv=[
 'index,ItemNameID,ItemCode,WholeItemCode,Item Name,SalePrice (IQD),WholesaleQty,WholesalePrice (IQD),SQL Row Byte Offset,StatusA,StatusB,ItemCode Standard,WholeItemCode Standard,VarEnd1,VarEnd2,VarEnd3',
 '0,4848,6253503460534,,\u0626\u0627\u0648,1000.0,24,0.0,663136,0x30,0x00,EAN-13,,91,91,120'
 ].join("\n");
 const x=parseMarketCSVV102(csv);
 assert.equal(x.scan("6253503460534").item.price_minor,1000);
 assert.doesNotMatch(JSON.stringify(x.scan("6253503460534")),/WholesaleQty|WholesalePrice|SQL Row/);
});
test("V102 never silently guesses missing, fractional or ambiguous prices or missing header",()=>{
 for(const value of ["-1","12.5","NaN","1e6","1,000","",String(Number.MAX_SAFE_INTEGER+1)]){
  const csv="ItemNameID,ItemName,ItemCode,SalePrice\n1,کاڵا,1234567891234,"+JSON.stringify(value);
  assert.throws(()=>parseMarketCSVV102(csv),/v102_no_valid_items|v102_invalid_csv/);
 }
 assert.throws(()=>parseMarketCSVV102("ItemName,ItemCode,SalePrice\nx,123,12"),/required_column/);
 assert.throws(()=>parseMarketCSVV102("ItemNameID,ItemName,ItemCode,SalePrice\n1,\"bad,1234,1200"),/unterminated_csv/);
 assert.throws(()=>parseMarketCSVV102("ItemNameID,ItemName,ItemCode,SalePrice\n1,abc,1234567,1200\n".repeat(100001)),/too_many_rows|size_limit/);
});
test("V102 opens only explicit absolute, regular non-symlink read-only CSV",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v102-test-"));
 const csv=join(dir,"market.csv"),link=join(dir,"alias.csv");
 try{
  await writeFile(csv,sample);
  await symlink(csv,link);
  const reader=await openMarketCSVV102(csv);
  assert.equal(reader.scan("6260053183974").ok,true);
  await assert.rejects(()=>openMarketCSVV102("market.csv"),/absolute/);
  await assert.rejects(()=>openMarketCSVV102(link),/ELOOP|symlink|unapproved/);
  await assert.rejects(()=>startV102CatalogLocalOnly({csvPath:csv,token:"x".repeat(40),consent:"YES_OPERATOR_READONLY_CSV"}),/opt_in_required/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("V102 real HTTP loopback GET-only and bearer token, no CORS/finance endpoints",async()=>{
 const catalog=parseMarketCSVV102(sample,{modifiedAt:"2026-10-30T00:00:00Z"});
 const token="V102_TEST_ONLY_".repeat(4);
 const server=createV102CatalogServer({catalog,token,now:()=>Date.parse("2026-11-01T10:00:00Z")});
 server.listen(3320,"127.0.0.1");
 await once(server,"listening");
 const origin="http://127.0.0.1:3320",headers={Authorization:"Bearer "+token};
 try{
  let r=await fetch(origin+"/api/local/v102/status");
  assert.equal(r.status,401);
  r=await fetch(origin+"/api/local/v102/status",{headers});
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.checkout_enabled,false);
  assert.equal(body.stale,true);
  assert.equal(body.valid_rows,6);
  assert.equal(r.headers.get("access-control-allow-origin"),null);
  r=await fetch(origin+"/api/local/v102/scan?code=6260053183974",{headers});
  assert.equal(r.status,200);
  assert.equal((await r.json()).item.price_minor,1000);
  r=await fetch(origin+"/api/local/v102/scan?code=1112223334445",{headers});
  assert.equal(r.status,409);
  r=await fetch(origin+"/api/local/v102/products?q=%D8%A6%D8%A7%D9%88",{headers});
  assert.equal(r.status,200);
  r=await fetch(origin+"/api/local/v102/sales",{headers});
  assert.equal(r.status,404);
  for(const method of ["POST","PUT","PATCH","DELETE"]){
   r=await fetch(origin+"/api/local/v102/status",{method,headers});
   assert.equal(r.status,405);
  }
  r=await fetch(origin+"/api/local/v102/status",{
   headers:{...headers,Origin:"https://zhirox.com"}});
  assert.equal(r.status,403);
  r=await fetch(origin+"/api/local/v102/status",{headers:{...headers,Host:"attacker.local"}});
  assert.equal(r.status,403);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
test("V102 React reader DEV-only; locked public Home and cashier cannot read market CSV",()=>{
 const main=readFileSync("src/main.tsx","utf8");
 const vite=readFileSync("vite.config.ts","utf8");
 const page=readFileSync("src/components/MarketCatalogReadOnlyV102.tsx","utf8");
 assert.match(main,/import\.meta\.env\.DEV&&import\.meta\.env\.VITE_ENABLE_LOCAL_PILOT==="true"&&/);
 assert.match(main,/VITE_V102_READONLY_CATALOG==="true"/);
 assert.match(vite,/readOnlyCatalog=pilot&&env\.VITE_V102_READONLY_CATALOG==='true'&&mode!=='production'/);
 assert.match(vite,/http:\/\/127\.0\.0\.1:3320/);
 assert.match(page,/method:"GET",credentials:"omit",cache:"no-store"/);
 assert.match(page,/فرۆشتن، گۆڕینی نرخ و کۆگا ناچالاکن/);
 assert.doesNotMatch(page,/localStorage|sessionStorage|service_role|checkout\(|completeCheckout|setProducts\(/);
 assert.doesNotMatch(main,/import.*MarketCatalogReadOnlyV102.*from/,"must dynamically mount only opted-in DEV");
});
