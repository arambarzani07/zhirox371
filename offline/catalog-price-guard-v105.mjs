// V105: Fail-closed CSV-to-PostgreSQL catalog price & barcode parity guard.
// Verifies that every product/barcode in a local checkout basket matches the
// active V103/V104 SHA-256 verified operator CSV snapshot before checkout can proceed.
// Never exposes WholeSalePrice, never guesses stock, and never mutates PostgreSQL.

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function verifyV105CatalogPriceParity({watch,pool,storeId,lines}){
 if(!watch||typeof watch.refresh!=="function"||typeof watch.snapshot!=="function")
  throw Error("V105_requires_v103_atomic_catalog_watch");
 if(!pool||typeof pool.query!=="function")
  throw Error("V105_requires_postgres_pool");
 if(!UUID_RE.test(String(storeId||"")))
  return {ok:false,status:400,error:"invalid_store_id"};
 if(!Array.isArray(lines)||lines.length<1||lines.length>50)
  return {ok:false,status:400,error:"invalid_lines"};

 for(const line of lines){
  if(!line||typeof line!=="object"||Array.isArray(line)||
     !UUID_RE.test(String(line.product_id||""))||
     !Number.isSafeInteger(line.qty)||line.qty<1||line.qty>1000)
   return {ok:false,status:400,error:"invalid_line_item"};
 }

 const snap=await watch.snapshot();
 if(!snap.ok||!snap.catalog){
  return {
   ok:false,
   status:503,
   error:"catalog_source_unavailable",
   reason:snap.error||"stale_or_unverified_csv"
  };
 }
 const csvSha256=snap.catalog.status.source_sha256;

 const verified=[];
 let expectedTotalMinor=0;

 for(const line of lines){
  const {rows}=await pool.query(`
   SELECT p.id AS product_id,p.name,p.price_minor,p.active,
          b.code AS barcode,b.quantity_base_units
   FROM zhirox_local.products p
   LEFT JOIN LATERAL (
    SELECT code,quantity_base_units
    FROM zhirox_local.barcodes
    WHERE store_id=p.store_id AND product_id=p.id AND active=true
    ORDER BY quantity_base_units ASC,code ASC
    LIMIT 1
   ) b ON true
   WHERE p.store_id=$1::uuid AND p.id=$2::uuid
   LIMIT 1`,[storeId,line.product_id]);

  const row=rows?.[0];
  if(!row||!row.active||!row.barcode){
   return {
    ok:false,
    status:404,
    error:"db_product_or_barcode_missing",
    product_id:line.product_id
   };
  }

  const scan=snap.catalog.scan(String(row.barcode));
  if(scan.error==="ambiguous_barcode_refused"){
   return {
    ok:false,
    status:409,
    error:"catalog_barcode_ambiguous",
    product_id:line.product_id,
    barcode:String(row.barcode),
    reason:scan.error
   };
  }
  if(!scan.ok||!scan.item){
   return {
    ok:false,
    status:404,
    error:"catalog_barcode_missing",
    product_id:line.product_id,
    barcode:String(row.barcode)
   };
  }

  const dbPriceMinor=Number(row.price_minor);
  const csvPriceMinor=Number(scan.item.price_minor);
  if(!Number.isSafeInteger(dbPriceMinor)||!Number.isSafeInteger(csvPriceMinor)||dbPriceMinor!==csvPriceMinor){
   return {
    ok:false,
    status:409,
    error:"catalog_price_drift_detected",
    product_id:line.product_id,
    barcode:String(row.barcode),
    db_price_minor:dbPriceMinor,
    csv_price_minor:csvPriceMinor,
    generation:snap.generation,
    csv_sha256:csvSha256
   };
  }

  const lineTotalMinor=csvPriceMinor*line.qty;
  expectedTotalMinor+=lineTotalMinor;
  verified.push({
   product_id:line.product_id,
   barcode:String(row.barcode),
   name:scan.item.name,
   qty:line.qty,
   unit_price_minor:csvPriceMinor,
   line_total_minor:lineTotalMinor
  });
 }

 return {
  ok:true,
  status:200,
  generation:snap.generation,
  csv_sha256:csvSha256,
  expected_total_minor:expectedTotalMinor,
  verified_lines:verified
 };
}
