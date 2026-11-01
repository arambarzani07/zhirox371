// V104: read-only catalog parity between an approved CSV and disposable
// PostgreSQL. Never connects to the original store or applies price updates.
import {createHash} from "node:crypto";
import {TEST_MARKET} from "./test-market-v80.mjs";
const DB_NAMES=new Set(["zhirox_v80_disposable","zhirox_test_market"]);
const MAX_ROWS=100000,MAX_SAMPLE=30,MAX_AGE=24*60*60*1000;
const norm=s=>String(s??"").trim().normalize("NFKC");
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
function vettedSource(catalog,now){
 if(!catalog?.status||catalog.status.write_enabled!==false||
    catalog.status.checkout_enabled!==false||
    catalog.status.stock_verified!==false||
    typeof catalog.auditRows!=="function"||
    !/^[a-f0-9]{64}$/i.test(catalog.status.source_sha256||""))
   throw Error("v104_unverified_operator_catalog");
 const t=Date.parse(catalog.status.source_modified_at||"");
 if(!Number.isFinite(t)||t>now+300000||now-t>MAX_AGE)
   throw Error("v104_stale_catalog_refused");
 const rows=catalog.auditRows();
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_ROWS)
   throw Error("v104_invalid_catalog_row_count");
 return rows;
}
export function compareCatalogPriceV104({csvRows,pgRows,sourceSha256}={}){
 if(!Array.isArray(csvRows)||!Array.isArray(pgRows)||
    !csvRows.length||csvRows.length>MAX_ROWS||pgRows.length>MAX_ROWS||
    !/^[0-9a-f]{64}$/i.test(sourceSha256||""))
   throw Error("v104_bad_reconciliation_input");
 const csv=new Map(),pg=new Map();
 let duplicateCSV=0,duplicatePG=0;
 for(const row of csvRows){
  if(typeof row?.barcode!=="string"||
     !/^[0-9A-Za-z._-]{3,40}$/.test(row.barcode)||
     !Number.isSafeInteger(row.price_minor)||row.price_minor<0||
     !norm(row.name))throw Error("v104_bad_csv_row");
  const val={name:norm(row.name),price:row.price_minor};
  if(csv.has(row.barcode)){
   duplicateCSV++;
   const previous=csv.get(row.barcode);
   if(previous?.name!==val.name||previous?.price!==val.price)
    csv.set(row.barcode,null);
  }else csv.set(row.barcode,val);
 }
 for(const row of pgRows){
  const price=Number(row?.price_minor);
  if(typeof row?.barcode!=="string"||
     !/^[0-9A-Za-z._-]{3,40}$/.test(row.barcode)||
     !Number.isSafeInteger(price)||price<0||!norm(row.name))
   throw Error("v104_bad_database_row");
  const val={name:norm(row.name),price};
  if(pg.has(row.barcode)){
   duplicatePG++;pg.set(row.barcode,null);
  }else pg.set(row.barcode,val);
 }
 const counts={csv_records:csvRows.length,db_barcode_records:pgRows.length,
  duplicate_csv_rows:duplicateCSV,duplicate_db_barcodes:duplicatePG,
  agreed:0,price_mismatch:0,name_mismatch:0,
  missing_in_database:0,missing_in_csv:0,ambiguous_csv:0,ambiguous_database:0};
 const samples=[];
 for(const barcode of [...new Set([...csv.keys(),...pg.keys()])].sort()){
  const c=csv.get(barcode),p=pg.get(barcode);
  const reason=c===undefined?"missing_in_csv":p===undefined?"missing_in_database":
    c===null?"ambiguous_csv":p===null?"ambiguous_database":
    c.price!==p.price?"price_mismatch":c.name!==p.name?"name_mismatch":null;
  if(!reason){counts.agreed++;continue;}
  counts[reason]++;
  if(samples.length<MAX_SAMPLE)samples.push({
   barcode,reason,csv_sale_price:c?.price??null,
   postgres_test_sale_price:p?.price??null
  });
 }
 const consistent=Object.entries(counts).every(([key,n])=>
  ["csv_records","db_barcode_records","agreed"].includes(key)||n===0);
 return Object.freeze({
  ok:true,ready_for_catalog_import:false,no_writes:true,
  source:"VERIFIED_OPERATOR_CSV_VS_DISPOSABLE_POSTGRESQL",
  stock_compared:false,wholesale_compared:false,
  csv_sha256:sourceSha256,summary:{...counts,consistent},
  samples:Object.freeze(samples),
  audit_sha256:hash({sourceSha256,counts,samples})
 });
}
export async function reconcileTestMarketV104({
 pool,catalog,dbHost,consent,now=()=>Date.now()
}={}){
 if(consent!=="YES_ISOLATED_V104_READ_ONLY_PARITY"||
  !["127.0.0.1","localhost","::1"].includes(dbHost)||
  !pool?.connect||typeof now!=="function")
  throw Error("v104_explicit_local_test_only_consent_required");
 const csvRows=vettedSource(catalog,now());
 const client=await pool.connect();
 let begun=false;
 try{
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  begun=true;
  const db=await client.query(
   "SELECT current_database() AS name, current_setting('transaction_read_only') AS readonly");
  if(!DB_NAMES.has(db.rows?.[0]?.name)||db.rows[0].readonly!=="on")
   throw Error("v104_unapproved_database_or_write_transaction");
  const stores=await client.query("SELECT id,name FROM zhirox_local.stores LIMIT 2");
  if(stores.rows.length!==1||
   stores.rows[0].id!==TEST_MARKET.store||
   stores.rows[0].name!==TEST_MARKET.name)
   throw Error("v104_refuse_unknown_or_multiple_market_stores");
  const sql="SELECT b.code AS barcode,p.name,p.price_minor::text AS price_minor "+
   "FROM zhirox_local.barcodes AS b JOIN zhirox_local.products AS p "+
   "ON p.store_id=b.store_id AND p.id=b.product_id "+
   "WHERE b.store_id=$1::uuid AND b.active AND p.active "+
   "ORDER BY b.code,p.id LIMIT 100001";
  const result=await client.query(sql,[TEST_MARKET.store]);
  if(result.rows.length>MAX_ROWS)throw Error("v104_too_many_database_barcodes");
  const comparison=compareCatalogPriceV104({
   csvRows,pgRows:result.rows,sourceSha256:catalog.status.source_sha256
  });
  await client.query("ROLLBACK");begun=false;
  return comparison;
 }finally{
  if(begun)await client.query("ROLLBACK").catch(()=>{});
  client.release();
 }
}
