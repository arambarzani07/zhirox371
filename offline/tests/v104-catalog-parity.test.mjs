import test from "node:test";
import assert from "node:assert/strict";
import {compareCatalogPriceV104,reconcileTestMarketV104} from "../catalog-parity-v104.mjs";
import {parseMarketCSVV102} from "../market-catalog-v102.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";

const sha="a".repeat(64);
const a={barcode:"TESTV80-ITEM-001",name:"نموونە — ئاوی تاقیکردنەوە",price_minor:2500};
const b={barcode:"TESTV80-ITEM-002",name:"نموونە — شەکری تاقیکردنەوە",price_minor:3000};
const compare=(csvRows,pgRows=[a,b])=>compareCatalogPriceV104({csvRows,pgRows,sourceSha256:sha});

test("V104 validates matching barcodes and integer selling prices",()=>{
 const good=compare([a,b]);
 assert.equal(good.summary.consistent,true);
 assert.equal(good.summary.agreed,2);
 assert.equal(good.no_writes,true);
 assert.equal(good.ready_for_catalog_import,false);
 assert.equal(good.stock_compared,false);
 const price=compare([{...a,price_minor:2900},b]);
 assert.equal(price.summary.price_mismatch,1);
 assert.equal(price.summary.consistent,false);
 assert.equal(price.samples[0].csv_sale_price,2900);
 assert.equal(price.samples[0].postgres_test_sale_price,2500);
 assert.equal(compare([{...a,name:"ناوی نوێ"},b]).summary.name_mismatch,1);
 assert.equal(compare([a]).summary.missing_in_csv,1);
 assert.equal(compare([... [a,b],{barcode:"6260053183974",name:"کاڵا",price_minor:1000}]).summary.missing_in_database,1);
 assert.equal(compare([a,{...a,price_minor:2100},b]).summary.ambiguous_csv,1);
 assert.equal(compare([a,b],[a,{...a,price_minor:2200},b]).summary.ambiguous_database,1);
 assert.equal(compare([a,a,b]).summary.duplicate_csv_rows,1);
});
test("V104 rejects unsafe prices and requires approval for isolated test",async()=>{
 assert.throws(()=>compare([{...a,price_minor:12.5}]),/bad_csv_row/);
 assert.throws(()=>compare([a],[{...a,price_minor:"NaN"}]),/bad_database_row/);
 await assert.rejects(()=>reconcileTestMarketV104({dbHost:"127.0.0.1"}),/consent/);
 await assert.rejects(()=>reconcileTestMarketV104({
  dbHost:"192.168.1.8",consent:"YES_ISOLATED_V104_READ_ONLY_PARITY",
  pool:{connect(){}}
 }),/consent/);
});
test("V104 requires the exact one known testing store and a read-only snapshot",async()=>{
 const catalog=parseMarketCSVV102(
  "ItemNameID,ItemName,ItemCode,SalePrice\n1,"+a.name+","+a.barcode+",2500\n",
  {modifiedAt:new Date().toISOString()});
 function fake(dbname,stores){
  const calls=[];
  const pool={async connect(){return {
   async query(sql,params){
    calls.push({sql,params});
    if(sql.startsWith("SELECT current_database"))return {rows:[{name:dbname,readonly:"on"}]};
    if(sql.startsWith("SELECT id,name"))return {rows:stores};
    if(sql.startsWith("SELECT b.code"))return {rows:[a]};
    return {rows:[]};
   },release(){calls.push({sql:"release"})}
  }}};
  return {pool,calls};
 }
 const store={id:TEST_MARKET.store,name:TEST_MARKET.name};
 const args={catalog,dbHost:"127.0.0.1",consent:"YES_ISOLATED_V104_READ_ONLY_PARITY"};
 const wrong=fake("unauthorized_db",[store]);
 await assert.rejects(()=>reconcileTestMarketV104({...args,pool:wrong.pool}),/unapproved_database/);
 assert.equal(wrong.calls[0].sql,"BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
 assert.equal(wrong.calls.at(-2).sql,"ROLLBACK");
 const extra=fake("zhirox_v80_disposable",[store,{id:"extra",name:"extra"}]);
 await assert.rejects(()=>reconcileTestMarketV104({...args,pool:extra.pool}),/multiple_market/);
 const good=fake("zhirox_v80_disposable",[store]);
 const result=await reconcileTestMarketV104({...args,pool:good.pool});
 assert.equal(result.summary.consistent,true);
 assert.deepEqual(good.calls.find(x=>x.sql.startsWith("SELECT b.code")).params,[TEST_MARKET.store]);
 assert.equal(good.calls.at(-2).sql,"ROLLBACK");
 assert.equal(good.calls.at(-1).sql,"release");
 const stale=parseMarketCSVV102(
  "ItemNameID,ItemName,ItemCode,SalePrice\n1,"+a.name+","+a.barcode+",2500\n",
  {modifiedAt:"2025-01-01T00:00:00Z"});
 await assert.rejects(()=>reconcileTestMarketV104({...args,pool:good.pool,catalog:stale}),/stale_catalog/);
});
