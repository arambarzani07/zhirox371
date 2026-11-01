// V104 acceptance against the real disposable PG16 test store, never prod.
// The CSV is created from synthetic PG test rows in the CI temp filesystem.
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import pg from "pg";
import {TEST_MARKET} from "../test-market-v80.mjs";
import {openMarketCSVV102} from "../market-catalog-v102.mjs";
import {reconcileTestMarketV104} from "../catalog-parity-v104.mjs";

for(const [key,value] of Object.entries({
 PGHOST:"127.0.0.1",PGDATABASE:"zhirox_v80_disposable",
 PGUSER:"v80test",ZHIROX_V81_TEST_MARKET:"YES_LOCAL_TEST_READ_ONLY"
 }))assert.equal(process.env[key],value,"disposable CI guard: "+key);
assert.ok(process.env.PGPASSWORD);
const pool=new pg.Pool({
 host:"127.0.0.1",database:"zhirox_v80_disposable",
 user:"v80test",password:process.env.PGPASSWORD,
 port:5432,max:2,connectionTimeoutMillis:5000
});
const dir=await mkdtemp(join(tmpdir(),"zhirox-v104-private-csv-"));
const csvPath=join(dir,"private-synthetic-catalog.csv");
const approval="YES_ISOLATED_V104_READ_ONLY_PARITY";
const toCSV=rows=>{
 const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
 return "ItemNameID,ItemCode,ItemName,SalePrice\n"+
   rows.map((r,i)=>[String(i+1),quote(r.barcode),quote(r.name),
     String(r.price_minor)].join(",")).join("\n")+"\n";
};
const change=async rows=>openMarketCSVV102(
 await writeFile(csvPath,toCSV(rows)).then(()=>csvPath));
async function state(){
 const {rows:[s]}=await pool.query(
  "SELECT "+
  "(SELECT count(*) FROM zhirox_local.sales WHERE store_id=$1::uuid) AS sales,"+
  "(SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=$1::uuid) AS outbox,"+
  "(SELECT count(*) FROM zhirox_local.barcodes WHERE store_id=$1::uuid) AS barcode_rows,"+
  "(SELECT coalesce(sum(stock_base_units),0) FROM zhirox_local.products WHERE store_id=$1::uuid) AS stocks,"+
  "(SELECT coalesce(sum(price_minor),0) FROM zhirox_local.products WHERE store_id=$1::uuid) AS prices",
  [TEST_MARKET.store]);
 return s;
}
try{
 const before=await state();
 const {rows}=await pool.query(
  "SELECT b.code AS barcode,p.name,p.price_minor::text AS price_minor "+
  "FROM zhirox_local.barcodes b JOIN zhirox_local.products p "+
  "ON b.store_id=p.store_id AND b.product_id=p.id "+
  "WHERE b.store_id=$1::uuid AND b.active AND p.active ORDER BY b.code,p.id",
  [TEST_MARKET.store]);
 assert.ok(rows.length>=2,"V80 known sample barcodes must exist");
 assert.ok(rows.some(x=>x.barcode==="TESTV80-ITEM-001"));
 assert.ok(rows.some(x=>x.barcode==="TESTV80-ITEM-002"));
 const params={pool,dbHost:"127.0.0.1",consent:approval};
 let catalog=await change(rows);
 let result=await reconcileTestMarketV104({...params,catalog});
 assert.equal(result.summary.consistent,true);
 assert.equal(result.summary.agreed,rows.length);
 assert.equal(result.summary.price_mismatch,0);
 assert.equal(result.summary.missing_in_csv,0);
 assert.equal(result.ready_for_catalog_import,false);
 assert.equal(result.stock_compared,false);
 assert.equal(result.wholesale_compared,false);
 assert.equal(result.no_writes,true);
 const positive=result;
 const changed=rows.map((r,i)=>i===0?
  {...r,price_minor:String(Number(r.price_minor)+900)}:r);
 catalog=await change(changed);
 result=await reconcileTestMarketV104({...params,catalog});
 assert.equal(result.summary.price_mismatch,1);
 assert.equal(result.summary.consistent,false);
 assert.equal(result.samples.find(x=>x.reason==="price_mismatch").barcode,rows[0].barcode);
 catalog=await change(rows.slice(1));
 result=await reconcileTestMarketV104({...params,catalog});
 assert.equal(result.summary.missing_in_csv,1);
 catalog=await change(rows.concat([
  {barcode:"NO-PG-V104-PRICE-EXTRA",name:"کاڵای زیادەی نموونە",price_minor:"3500"}
 ]));
 result=await reconcileTestMarketV104({...params,catalog});
 assert.equal(result.summary.missing_in_database,1);
 catalog=await change(rows.concat([
  {barcode:rows[0].barcode,name:rows[0].name,
   price_minor:String(Number(rows[0].price_minor)+20)}
 ]));
 result=await reconcileTestMarketV104({...params,catalog});
 assert.equal(result.summary.ambiguous_csv,1);
 await writeFile(csvPath,"ItemNameID,ItemCode,ItemName,SalePrice\n1,broken,نامەعلووم,NOT_A_PRICE\n");
 await assert.rejects(()=>openMarketCSVV102(csvPath),/no_valid_items/);
 const after=await state();
 assert.deepEqual(after,before,"V104 must never change receipt/outbox/stock/price/barcode SQL state");
 await mkdir("artifacts/v104",{recursive:true});
 await writeFile("artifacts/v104/ZHIROX-V104-DISPOSABLE-PRICE-PARITY.json",
  JSON.stringify({source:"DISPOSABLE_CI_POSTGRESQL_SYNTHETIC_ONLY",
   no_writes:true,stock_compared:false,
   passed_clean_fixture:positive.summary.consistent,
   matched_sample_barcodes:positive.summary.agreed,
   checked_mismatch_categories:["price_mismatch","missing_in_csv",
    "missing_in_database","ambiguous_csv"],
   audit_sha256:positive.audit_sha256,
   production_market_checked:false,official_pos_ready:false},null,2));
 console.log("V104 PASS: actual disposable PostgreSQL catalog read-only parity; mismatch and ambiguity detection; sale/outbox/stock/price unchanged.");
}finally{
 await pool.end().catch(()=>{});
 await rm(dir,{recursive:true,force:true});
}
