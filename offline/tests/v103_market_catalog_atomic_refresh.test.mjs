import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm,utimes,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {once} from "node:events";
import http from "node:http";
import {readFileSync} from "node:fs";
import {createV103AtomicCatalog,V103_INTERVAL_MS} from "../market-catalog-watch-v103.mjs";
import {createV103CatalogServer,startV103CatalogLocalOnly} from "../market-catalog-http-v103.mjs";

const mkCSV=(price,name="ئاوی کانی چنار")=>[
 "ItemNameID,ItemCode,ItemName,SalePrice,WholeSalePrice",
 "1,6260053183974,"+name+","+price+",150",
 "2,8698686920297,پەنیر,2500,1200"
].join("\n")+"\n";
const hash=buf=>createHash("sha256").update(buf).digest("hex");
const bearer="V103_TEST_TOKEN_".repeat(4);
const path="/api/local/v103/";

test("V103 real operator CSV modifies only source BY OPERATOR: request reload is atomic, prices never remain stale",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v103-csv-")),csv=join(dir,"market.csv");
 await writeFile(csv,mkCSV(1000));
 const watch=createV103AtomicCatalog({csvPath:csv});
 await watch.refresh({force:true});
 const server=createV103CatalogServer({watch,token:bearer});
 server.listen(3321,"127.0.0.1");await once(server,"listening");
 const url="http://127.0.0.1:3321",headers={Authorization:"Bearer "+bearer};
 const get=async(route,opts)=>fetch(url+path+route,{headers,...opts});
 try{
  let res=await get("status");assert.equal(res.status,200);
  let status=await res.json();
  assert.equal(status.valid_rows,2);
  assert.equal(status.checkout_enabled,false);
  assert.equal(status.stock_verified,false);
  assert.equal(status.generation,1);
  assert.equal(status.snapshot_available,true);
  assert.doesNotMatch(JSON.stringify(status),/WholeSalePrice|market\.csv|150|1200/);
  res=await get("scan?code=6260053183974");assert.equal(res.status,200);
  assert.equal((await res.json()).item.price_minor,1000);
  const firstHash=hash(await readFile(csv));
  // No user/admin action in this server writes the CSV.
  res=await get("products?q=%D8%A6%D8%A7%D9%88");
  assert.equal(res.status,200);
  assert.equal((await res.json()).count,1);
  assert.equal(hash(await readFile(csv)),firstHash);
  // The OPERATOR replaces source file. The next request sees fresh pricing.
  await writeFile(csv,mkCSV(1750,"ئاوی نوێی کانی چنار"));
  res=await get("scan?code=6260053183974");assert.equal(res.status,200);
  let scan=await res.json();
  assert.equal(scan.item.price_minor,1750);
  assert.equal(scan.item.name,"ئاوی نوێی کانی چنار");
  assert.equal(scan.generation,2);
  // File is partially written / invalid. Fail closed; NEVER serve old 1750.
  await writeFile(csv,"ItemNameID,ItemCode,ItemName,SalePrice\n1,bad,1234567891234,UNVERIFIED\n");
  for(const route of ["scan?code=6260053183974","products?q=%D8%A6%D8%A7%D9%88","status"]){
   res=await get(route);
   assert.equal(res.status,503,route);
   assert.equal((await res.json()).snapshot_available,false);
  }
  // Recover only after a complete newly parsed CSV arrives.
  await writeFile(csv,mkCSV(1900));
  res=await get("scan?code=6260053183974");
  assert.equal(res.status,200);
  assert.equal((await res.json()).item.price_minor,1900);
  // File mtime more than 24h old: no sale price can be asserted as current.
  const past=new Date(Date.now()-48*3600000);
  await utimes(csv,past,past);
  res=await get("scan?code=6260053183974");
  assert.equal(res.status,503);
  assert.equal((await res.json()).error,"snapshot_unavailable_or_stale");
  await utimes(csv,new Date(),new Date());
  res=await get("scan?code=6260053183974");
  assert.equal(res.status,200);
  assert.equal((await res.json()).item.price_minor,1900);
  // Source switched to a symlink: refuse even the last approved price.
  const valid=join(dir,"valid.csv");
  await writeFile(valid,mkCSV(2500));
  await rm(csv);
  await symlink(valid,csv);
  res=await get("scan?code=6260053183974");
  assert.equal(res.status,503);
  assert.equal((await res.json()).snapshot_available,false);
 }finally{
  watch.stopPolling();
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  await rm(dir,{recursive:true,force:true});
 }
});
test("V103 never exposes prices without valid bearer/loopback/Origin/Host; rejects every write verb",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v103-guard-")),csv=join(dir,"market.csv");
 await writeFile(csv,mkCSV(1300));
 const watch=createV103AtomicCatalog({csvPath:csv});
 await watch.refresh({force:true});
 const server=createV103CatalogServer({watch,token:bearer});
 server.listen(3321,"127.0.0.1");await once(server,"listening");
 const base="http://127.0.0.1:3321"+path;
 try{
  let r=await fetch(base+"status");assert.equal(r.status,401);
  r=await fetch(base+"scan?code=6260053183974",{headers:{Authorization:"Bearer WRONG"}});assert.equal(r.status,401);
  const headers={Authorization:"Bearer "+bearer};
  for(const method of ["POST","PUT","PATCH","DELETE","OPTIONS"]){
   r=await fetch(base+"scan?code=6260053183974",{method,headers});assert.equal(r.status,405,method);
  }
  r=await fetch(base+"status",{headers:{...headers,Origin:"https://zhirox.com"}});
  assert.equal(r.status,403);
  r=await fetch(base+"status",{headers:{...headers,Origin:"http://127.0.0.1:3000"}});
  assert.equal(r.status,200);
  r=await fetch(base+"scan?code=6260053183974&weird=1",{headers});assert.equal(r.status,400);
  r=await fetch(base+"scan?code=6260053183974&code=other",{headers});assert.equal(r.status,400);
  r=await fetch(base+"checkout",{headers});assert.equal(r.status,404);
  r=await fetch(base+"products?q=%D9%BE%D9%86%DB%8C%D8%B1&limit=200",{headers});assert.equal(r.status,400);
  const forged=await new Promise((resolve,reject)=>{
   const req=http.request(base+"status",{headers:{...headers,Host:"zhirox.com"}},
    res=>{res.resume();res.on("end",()=>resolve(res.statusCode));});
   req.on("error",reject);req.end();
  });
  assert.equal(forged,403);
 }finally{
  watch.stopPolling();
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  await rm(dir,{recursive:true,force:true});
 }
});
test("V103 fixed 5-minute hash renewal, concurrent refresh coalescing and no optional production toggle",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v103-atomic-")),csv=join(dir,"catalog.csv");
 await writeFile(csv,mkCSV(1000));
 let called=0;
 const {openMarketCSVV102}=await import("../market-catalog-v102.mjs");
 const watch=createV103AtomicCatalog({csvPath:csv,loader:async path=>{
  called++;await new Promise(resolve=>setTimeout(resolve,15));
  return openMarketCSVV102(path);
 }});
 try{
  await Promise.all(Array.from({length:10},()=>watch.refresh({force:true})));
  assert.equal(called,1);
  let state=await watch.snapshot();assert.equal(state.ok,true);
  watch.startPolling();watch.startPolling();watch.stopPolling();watch.stopPolling();
  assert.equal(V103_INTERVAL_MS,300000);
  assert.throws(()=>createV103AtomicCatalog({csvPath:csv,refreshIntervalMs:1000}),/fixed_refresh/);
  await assert.rejects(()=>startV103CatalogLocalOnly({csvPath:csv,token:bearer,
   consent:"YES_OPERATOR_READONLY_CSV_REFRESH"}),/opt_in_required/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("V103 UI mounts only in DEV and reads verified private API, not public GitHub Pages or cashier",()=>{
 const main=readFileSync("src/main.tsx","utf8");
 const vite=readFileSync("vite.config.ts","utf8");
 const ui=readFileSync("src/components/MarketCatalogReadOnlyV102.tsx","utf8");
 const host=readFileSync("offline/market-catalog-http-v103.mjs","utf8");
 assert.match(main,/import\.meta\.env\.DEV&&import\.meta\.env\.VITE_ENABLE_LOCAL_PILOT==="true"/);
 assert.match(main,/VITE_V103_READONLY_CATALOG==="true"/);
 assert.match(vite,/refreshCatalog=pilot&&env\.VITE_V103_READONLY_CATALOG==='true'&&mode!=='production'/);
 assert.match(vite,/http:\/\/127\.0\.0\.1:3321/);
 assert.match(ui,/catalogApiBase=import\.meta\.env\.VITE_V103_READONLY_CATALOG/);
 assert.match(ui,/frۆشتن|فرۆشتن، گۆڕینی نرخ و کۆگا ناچالاکن/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|service_role|checkout\(|completeCheckout|setProducts\(/);
 assert.match(host,/server\.listen\(PORT,HOST,resolve\)/);
 assert.match(host,/V103_OPERATOR_READONLY_CSV_REFRESH/);
 assert.doesNotMatch(host,/app\.listen\(0\.0\.0\.0|supabase|postgres|UPDATE products/);
});
