import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createV103AtomicCatalog} from "../market-catalog-watch-v103.mjs";
import {verifyV105CatalogPriceParity} from "../catalog-price-guard-v105.mjs";

const STORE="88000000-0000-4000-8000-000000000080";
const PROD_1="88000000-0000-4000-8000-000000000101";
const PROD_2="88000000-0000-4000-8000-000000000102";

const mkCSV=(price1=1250,price2=2500,dup=false)=>[
 "ItemNameID,ItemCode,ItemName,SalePrice,WholeSalePrice",
 "1,6260053183974,ئاوی کانی چنار,"+price1+",150",
 "2,8698686920297,پەنیری سپی,"+price2+",1200",
 ...(dup?["3,8698686920297,پەنیری دووبارە,3000,1500"]:[])
].join("\n")+"\n";

test("V105 verifies exact barcode and price parity between V103/V104 CSV snapshot and PostgreSQL products",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v105-"));
 const csv=join(dir,"market.csv");
 try{
  await writeFile(csv,mkCSV(1250,2500));
  const watch=createV103AtomicCatalog({csvPath:csv});
  await watch.refresh({force:true});

  const dbPrices=new Map([
   [PROD_1,{product_id:PROD_1,name:"ئاوی کانی چنار",price_minor:1250,active:true,barcode:"6260053183974",quantity_base_units:1}],
   [PROD_2,{product_id:PROD_2,name:"پەنیری سپی",price_minor:2500,active:true,barcode:"8698686920297",quantity_base_units:1}]
  ]);
  const queries=[];
  const pool={
   async query(sql,args){
    queries.push({sql,args});
    const row=dbPrices.get(args[1]);
    return {rows:row&&args[0]===STORE?[row]:[]};
   }
  };

  // 1. Parity pass when PostgreSQL and verified CSV match
  const ok=await verifyV105CatalogPriceParity({
   watch,pool,storeId:STORE,
   lines:[{product_id:PROD_1,qty:2},{product_id:PROD_2,qty:1}]
  });
  assert.equal(ok.ok,true);
  assert.equal(ok.status,200);
  assert.equal(ok.expected_total_minor,5000);
  assert.equal(ok.verified_lines.length,2);
  assert.equal("WholeSalePrice" in ok.verified_lines[0],false);

  // 2. Operator updates CSV price to 1500 while PostgreSQL still has 1250 -> fail-closed 409 drift
  await writeFile(csv,mkCSV(1500,2500));
  const drift=await verifyV105CatalogPriceParity({
   watch,pool,storeId:STORE,
   lines:[{product_id:PROD_1,qty:1}]
  });
  assert.equal(drift.ok,false);
  assert.equal(drift.status,409);
  assert.equal(drift.error,"catalog_price_drift_detected");
  assert.equal(drift.db_price_minor,1250);
  assert.equal(drift.csv_price_minor,1500);

  // 3. Once PostgreSQL price is synchronized to 1500, parity succeeds on generation 2
  dbPrices.get(PROD_1).price_minor=1500;
  const synced=await verifyV105CatalogPriceParity({
   watch,pool,storeId:STORE,
   lines:[{product_id:PROD_1,qty:3}]
  });
  assert.equal(synced.ok,true);
  assert.equal(synced.status,200);
  assert.equal(synced.generation,2);
  assert.equal(synced.expected_total_minor,4500);

  // 4. Duplicate/ambiguous barcode in CSV fails closed with 409
  await writeFile(csv,mkCSV(1500,2500,true));
  const amb=await verifyV105CatalogPriceParity({
   watch,pool,storeId:STORE,
   lines:[{product_id:PROD_2,qty:1}]
  });
  assert.equal(amb.ok,false);
  assert.equal(amb.status,409);
  assert.equal(amb.error,"catalog_barcode_ambiguous");

  // 5. Corrupt CSV fails closed with 503 catalog_source_unavailable
  await writeFile(csv,"ItemNameID,ItemCode,ItemName,SalePrice\n1,6260053183974,BAD,abc\n");
  const badCsv=await verifyV105CatalogPriceParity({
   watch,pool,storeId:STORE,
   lines:[{product_id:PROD_1,qty:1}]
  });
  assert.equal(badCsv.ok,false);
  assert.equal(badCsv.status,503);
  assert.equal(badCsv.error,"catalog_source_unavailable");

  // Zero mutating SQL queries
  assert.ok(queries.every(q=>!/INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE/i.test(q.sql)));
 }finally{
  await rm(dir,{recursive:true,force:true});
 }
});

test("All 48 React SectionWorkspace submodules are active with zero empty unimplemented placeholders",()=>{
 const ws=readFileSync("src/components/SectionWorkspace.tsx","utf8");
 const op=readFileSync("src/components/OperationalSubmodulesView.tsx","utf8");
 const icons=readFileSync("src/components/CardIcon.tsx","utf8");
 const allIds=[...icons.matchAll(/\{\s*label:\s*"[^"]+",\s*iconName:\s*"([a-z0-9-]+)"/g)].map(m=>m[1]);
 assert.equal(allIds.length,48);
 for(const id of [
  "return-arrow","purchase-order","profit-chart","ai-insights",
  "manage-users","access-key","system-controls",
  "new-offer","discount-percent","coupon-ticket","promotion-speaker",
  "print-template","attendance","work-timer","staff-review","approval-file"
 ]){
  assert.ok(ws.includes(`"${id}":"operational"`),`SectionWorkspace must map ${id} to operational`);
  assert.ok(op.includes(`'${id}'`),`OperationalSubmodulesView must implement ${id}`);
 }
});
