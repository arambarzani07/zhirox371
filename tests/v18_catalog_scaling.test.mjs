import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {performance} from "node:perf_hooks";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");

test("V18 SQL contract defines indexed server-side barcode resolution and 50-item catalog/barcode pagination without cost exposure",()=>{
  const sql=read("tests/v18/local_catalog_scaling_v18.sql");
  const doc=read("docs/V18_CATALOG_SCALING.md");
  assert.match(sql,/CREATE INDEX IF NOT EXISTS retail_barcodes_store_active_code_pattern_idx/);
  assert.match(sql,/text_pattern_ops/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.retail_resolve_barcode_v18/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.retail_catalog_page_v18/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.retail_barcode_page_v18/);
  assert.match(sql,/retail_internal\.has_role\(p_store, array\['manager','cashier'\]\)/);
  assert.match(sql,/least\(greatest\(coalesce\(p_limit, 50\), 1\), 100\)/);
  assert.match(sql,/'has_longer_prefix', v_has_longer/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.retail_resolve_barcode_v18\(uuid, text\) FROM PUBLIC, anon/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.retail_catalog_page_v18\(uuid, text, integer, integer, text\) FROM PUBLIC, anon/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.retail_barcode_page_v18\(uuid, text, integer, integer\) FROM PUBLIC, anon/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION retail_internal\.is_valid_ean13/);
  assert.match(sql,/v_clean ~ '\^27\[0-9\]\{11\}\$'/);
  assert.doesNotMatch(sql,/WHEN substring\(v_clean FROM 1 FOR 2\) IN \('25','26'\)/);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.retail_return_sale_v19/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.retail_return_sale_v19\(uuid, uuid, uuid, uuid\) FROM PUBLIC, anon/);
  // Purchase cost columns must never be selected or returned by V18 read RPCs
  const strippedComments=sql.replace(/--.*$/gm,"");
  assert.doesNotMatch(strippedComments,/purchase_price_minor/);
  assert.doesNotMatch(strippedComments,/purchase_price_iqd/);
  assert.match(doc,/50,000/);
  assert.match(doc,/150,000/);
  assert.match(doc,/2700001004806/);
  assert.match(doc,/TRUNCATE/);
});

test("V18 workspace and operations integrate server pagination, price/barcode inspection tabs, hybrid scanner lookup, and V19 supermarket operations while preserving locked Home",()=>{
  const wsHtml=read("workspace.html");
  const wsJs=read("workspace.js");
  const opsHtml=read("operations.html");
  const opsJs=read("operations.js");
  const ci=read(".github/workflows/pc-foundation.yml");

  for(const tab of ["new","list","prices","barcodes"]){
    assert.match(wsHtml,new RegExp(`data-tab="${tab}"`));
  }
  for(const id of [
    "prices-panel","prices-search","prices-results","prices-pagination",
    "barcodes-panel","barcode-inspect-form","barcode-inspect-input","barcodes-search","barcodes-results","barcodes-pagination",
    "list-pagination","list-prev","list-next","list-page-info",
    "go-ops-cash","go-ops-stock","go-ops-receipts","go-ops-shift",
    "barcode-label-box","label-card","label-barcode-svg","label-size","label-print-btn"
  ]){
    assert.match(wsHtml,new RegExp(`id="${id}"`));
  }
  assert.match(wsHtml,/class="catalog-pack-grid"/);
  assert.match(wsJs,/const PAGE_SIZE = 50/);
  assert.match(wsJs,/retail_catalog_page_v18/);
  assert.match(wsJs,/retail_barcode_page_v18/);
  assert.match(wsJs,/retail_resolve_barcode_v18/);
  assert.match(wsJs,/catalog-stock-btn/);
  assert.match(wsJs,/catalog-label-btn/);
  assert.match(wsJs,/openLabelPreview/);

  for(const id of [
    "stock-search","stock-filter","stock-refresh","stock-pagination","stock-prev","stock-next","stock-page-info",
    "parked-bar","hold-cart","quick-cash-row","discount",
    "go-workspace-list","go-workspace-new","go-workspace-prices","go-workspace-barcodes"
  ]){
    assert.match(opsHtml,new RegExp(`id="${id}"`));
  }
  assert.match(opsJs,/const PAGE_SIZE=50/);
  assert.match(opsJs,/retail_resolve_barcode_v18/);
  assert.match(opsJs,/retail_catalog_page_v18/);
  assert.match(opsJs,/retail_return_sale_v19/);
  assert.match(opsJs,/isValidEan13/);
  assert.match(opsJs,/parseScaleBarcode/);
  assert.match(opsJs,/prefixCache/);
  assert.match(opsJs,/toggleHoldCart/);
  assert.match(opsJs,/data-pick-stock|pickStock/);

  assert.match(ci,/tests\/v18\/local_catalog_scaling_v18\.sql/);
  assert.match(ci,/tests\/browser\/v18_catalog_scaling\.mjs/);
});

test("V18 scale benchmark & verified real scale barcode 2700001004806 (تەماتە, 1,250 IQD/kg, 0.480 kg = 600 IQD): 50,000 products, 150,000 barcodes, fractional stock deduction, and receipt refund",async()=>{
  const window={};
  new Function("window",read("tests/browser/qa_supabase_fixture.js"))(window);
  const qa=window.__retailQA;
  const client=window.supabase.createClient();
  const storeId=qa.store.id;

  // Configure seed product as verified supermarket scale product: تەماتە (PLU 00001, 1,250 IQD/kg, 5.000 kg stock)
  qa.products[0].name="تەماتە";
  qa.products[0].plu="00001";
  qa.products[0].price_minor=1250;
  qa.stock[0].quantity=5;

  const tSeedStart=performance.now();
  // Seed 50,000 products and 150,000 barcodes (3 barcodes per product:
  // for even products: primary unit + unit alias + primary carton;
  // for odd products: primary unit + primary carton + carton alias)
  for(let i=1;i<=50000;i++){
    const id="18000000-0000-4000-8000-"+String(i).padStart(12,"0");
    const pad=String(i).padStart(6,"0");
    const unitPrimary="6261"+pad+"01";
    const cartonPrimary="6262"+pad+"02";
    const extraCode=i%2===0?"6263"+pad+"03":"6264"+pad+"04";
    const unitPrice=500+(i%20)*250;
    const cartonPrice=unitPrice*10;

    qa.products.push({
      id,store_id:storeId,
      name:`کاڵای قەبارە گەورە ${i}`,
      sku:`SKU-${pad}`,
      plu:String(100000+i),
      price_minor:unitPrice,
      currency:"IQD",
      active:true,
      catalog_version:1
    });
    qa.advancedCatalogs.push({
      id,name:`کاڵای قەبارە گەورە ${i}`,
      sku:`SKU-${pad}`,plu:String(100000+i),
      sale_mode:"both",
      unit_barcode:unitPrimary,
      unit_alias_barcodes:i%2===0?[extraCode]:[],
      unit_sale_price_iqd:unitPrice,
      unit_purchase_price_iqd:unitPrice-100,
      carton:{
        name:`کارتۆنی ${i}`,
        barcode:cartonPrimary,
        alias_barcodes:i%2===1?[extraCode]:[],
        units_per_carton:12,
        purchase_price_minor:cartonPrice-1000,
        purchase_price_iqd:cartonPrice-1000,
        sale_price_iqd:cartonPrice
      }
    });
    qa.barcodes.push(
      {store_id:storeId,product_id:id,code:unitPrimary,unit_type:"unit",units_per_scan:1,active:true},
      {store_id:storeId,product_id:id,code:cartonPrimary,unit_type:"carton",units_per_scan:12,active:true},
      {store_id:storeId,product_id:id,code:extraCode,unit_type:i%2===0?"unit":"carton",units_per_scan:i%2===0?1:12,active:true}
    );
    qa.stock.push({store_id:storeId,product_id:id,quantity:i===50000?0:i===49999?3:120});
  }
  // Add one short prefix barcode, one retired barcode, and one ordinary unit barcode starting with 27
  // to verify prefix, inactive, and ordinary-barcode precedence rules at 150k scale
  const lastId="18000000-0000-4000-8000-000000050000";
  qa.barcodes.push(
    {store_id:storeId,product_id:lastId,code:"6261050000",unit_type:"unit",units_per_scan:1,active:true},
    {store_id:storeId,product_id:lastId,code:"2799999000018",unit_type:"unit",units_per_scan:1,active:true},
    {store_id:storeId,product_id:lastId,code:"6269999999999",unit_type:"carton",units_per_scan:12,active:false}
  );
  qa.indexVersion=(qa.indexVersion||0)+1;
  const seedMs=performance.now()-tSeedStart;

  assert.ok(qa.products.length>=50001,"Must hold at least 50,000 products");
  assert.ok(qa.barcodes.length>=150001,"Must hold at least 150,000 barcodes");

  // Warm index and measure first catalog page (offset 0, limit 50)
  const tPage1Start=performance.now();
  const page1=await client.rpc("retail_catalog_page_v18",{p_store:storeId,p_search:"",p_offset:0,p_limit:50});
  const page1Ms=performance.now()-tPage1Start;
  assert.equal(page1.error,null);
  assert.equal(page1.data.items.length,50,"Browser must only receive 50 products per page");
  assert.equal(page1.data.total_count,50001);
  assert.ok(page1.data.items.every(x=>!Object.hasOwn(x,"purchase_price_minor")&&!Object.hasOwn(x,"unit_purchase_price_iqd")));

  // Low-stock and out-of-stock filter verification
  const outStockPage=await client.rpc("retail_catalog_page_v18",{p_store:storeId,p_search:"",p_offset:0,p_limit:50,p_stock_filter:"out"});
  assert.equal(outStockPage.error,null);
  assert.equal(outStockPage.data.total_count,1);
  assert.equal(outStockPage.data.items[0].id,lastId);

  const lowStockPage=await client.rpc("retail_catalog_page_v18",{p_store:storeId,p_search:"",p_offset:0,p_limit:50,p_stock_filter:"low"});
  assert.equal(lowStockPage.error,null);
  assert.equal(lowStockPage.data.total_count,3);

  // Measure deep pagination (page 1000 -> offset 49,950)
  const tDeepPageStart=performance.now();
  const deepPage=await client.rpc("retail_catalog_page_v18",{p_store:storeId,p_search:"",p_offset:49950,p_limit:50});
  const deepPageMs=performance.now()-tDeepPageStart;
  assert.equal(deepPage.error,null);
  assert.equal(deepPage.data.items.length,50);
  assert.equal(deepPage.data.items[49].name,"کاڵای قەبارە گەورە 49999");

  // Measure barcode directory pagination across 150,000+ active barcodes
  const tBarcodePageStart=performance.now();
  const barcodePage=await client.rpc("retail_barcode_page_v18",{p_store:storeId,p_search:"",p_offset:149950,p_limit:50});
  const barcodePageMs=performance.now()-tBarcodePageStart;
  assert.equal(barcodePage.error,null);
  assert.equal(barcodePage.data.items.length,50);
  assert.equal(barcodePage.data.total_count,150003);

  // Measure exact barcode lookups across all 4 barcode types + prefix + retired + verified real scale barcode 2700001004806
  const tResolveStart=performance.now();
  const uPrimary=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"626105000001"});
  const uAlias=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"626305000003"});
  const cPrimary=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"626205000002"});
  const cAlias=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"626404999904"});
  const prefixCode=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"6261050000"});
  const retiredCode=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"6269999999999"});
  const scaleCode=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"2700001004806"});
  const singleResolveAvgMs=(performance.now()-tResolveStart)/7;

  assert.equal(uPrimary.data.found,true);
  assert.equal(uPrimary.data.unit_type,"unit");
  assert.equal(uPrimary.data.units_per_scan,1);
  assert.equal(uPrimary.data.has_longer_prefix,false);

  assert.equal(uAlias.data.found,true);
  assert.equal(uAlias.data.unit_type,"unit");
  assert.equal(uAlias.data.product_id,uPrimary.data.product_id);

  assert.equal(cPrimary.data.found,true);
  assert.equal(cPrimary.data.unit_type,"carton");
  assert.equal(cPrimary.data.units_per_scan,12);
  assert.equal(cPrimary.data.price_minor,uPrimary.data.price_minor*10);

  assert.equal(cAlias.data.found,true);
  assert.equal(cAlias.data.unit_type,"carton");
  assert.equal(cAlias.data.units_per_scan,12);

  assert.equal(prefixCode.data.found,true);
  assert.equal(prefixCode.data.has_longer_prefix,true,"Prefix of 626105000001 must flag has_longer_prefix=true");

  assert.equal(retiredCode.data.found,false,"Retired barcode must never resolve");

  // Verified real supermarket scale barcode 2700001004806:
  // Prefix 27 | PLU 00001 (تەماتە) | Weight 00480 (480g = 0.480 kg) | Checksum 6 | Price 1,250 IQD/kg | Total 600 IQD
  assert.equal(scaleCode.data.found,true,"Verified real scale barcode 2700001004806 must resolve PLU 00001 (تەماتە)");
  assert.equal(scaleCode.data.product_name,"تەماتە");
  assert.equal(scaleCode.data.plu,"00001");
  assert.equal(scaleCode.data.is_scale,true);
  assert.equal(scaleCode.data.scale_grams,480);
  assert.equal(scaleCode.data.scale_weight_kg,0.48);
  assert.equal(scaleCode.data.scale_label,"0.480 کگم");
  assert.equal(scaleCode.data.unit_price_minor,1250);
  assert.equal(scaleCode.data.price_minor,600,"0.480 kg of 1,250 IQD/kg تەماتە must equal 600 IQD");

  // Reject invalid EAN-13 check digit, zero weight, unknown PLU, and unverified scale prefixes (21, 25)
  const badCheck=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"2700001004805"});
  assert.equal(badCheck.data.found,false,"Invalid EAN-13 check digit must be rejected");
  const zeroWeight=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"2700001000004"});
  assert.equal(zeroWeight.data.found,false,"Zero-weight scale barcode must be rejected");
  const unknownPlu=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"2799998004808"});
  assert.equal(unknownPlu.data.found,false,"Unknown PLU must be rejected");
  const unverifiedPrefix21=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"2100001004804"});
  assert.equal(unverifiedPrefix21.data.found,false,"Unverified scale prefix 21 must not be assumed as scale barcode");
  const unverifiedPrefix25=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"2500001006009"});
  assert.equal(unverifiedPrefix25.data.found,false,"Unverified scale prefix 25 must not be assumed as scale barcode");

  // Ordinary barcode starting with 27 registered in retail_barcodes must resolve as ordinary unit, NOT scale
  const ordinary27=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"2799999000018"});
  assert.equal(ordinary27.data.found,true);
  assert.equal(ordinary27.data.is_scale,false,"Registered ordinary barcode starting with 27 must not be confused with scale label");
  assert.equal(ordinary27.data.product_id,lastId);

  // Verify checkout of verified scale barcode 2700001004806, fractional stock deduction (5.000 -> 4.520 kg), and receipt return
  const shiftRes=await client.rpc("retail_shift_open",{p_store:storeId,p_opening:50000});
  assert.equal(shiftRes.error,null);

  // Forged client price for 2700001004806 must be rejected by server-authoritative price check
  const forgedScaleSale=await client.rpc("retail_checkout_packs_v16",{
    p_store:storeId,
    p_request:"19000000-0000-4000-8000-000000000099",
    p_items:[{barcode:"2700001004806",quantity:1,expected_price_minor:500,expected_units:1}],
    p_cash_received:1000
  });
  assert.equal(forgedScaleSale.error?.code,"22023","Tampered scale price must be rejected by server");

  const saleRes=await client.rpc("retail_checkout_packs_v16",{
    p_store:storeId,
    p_request:"19000000-0000-4000-8000-000000000001",
    p_items:[
      {barcode:"2700001004806",quantity:1,expected_price_minor:600,expected_units:1},
      {barcode:"4006381333931",quantity:1,expected_price_minor:1250,expected_units:1}
    ],
    p_cash_received:1600,
    p_discount:250
  });
  assert.equal(saleRes.error,null);
  assert.equal(qa.stock[0].quantity,3.52,"5.000 kg minus 0.480 kg scale bag and 1.000 kg unit must equal 3.520 kg");

  const retRes=await client.rpc("retail_return_sale_v19",{
    p_store:storeId,
    p_sale:saleRes.data,
    p_session:shiftRes.data,
    p_request:"19000000-0000-4000-8000-000000000002"
  });
  assert.equal(retRes.error,null);
  assert.equal(retRes.data.refunded_minor,1600);
  assert.equal(retRes.data.restored_units,1.48);
  assert.equal(qa.stock[0].quantity,5,"Returning sale must restore exact 1.480 kg back to 5.000 kg");

  const dupRet=await client.rpc("retail_return_sale_v19",{
    p_store:storeId,
    p_sale:saleRes.data,
    p_session:shiftRes.data,
    p_request:"19000000-0000-4000-8000-000000000003"
  });
  assert.equal(dupRet.error?.code,"22023");

  // 200 concurrent barcode lookups across the 150,000-barcode catalog
  const tConcurrentStart=performance.now();
  const queries=Array.from({length:200},(_,idx)=>{
    const itemNum=1+((idx*249)%50000);
    const pad=String(itemNum).padStart(6,"0");
    const code=idx%4===0?`6261${pad}01`:idx%4===1?`6262${pad}02`:itemNum%2===0?`6263${pad}03`:`6264${pad}04`;
    return client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:code});
  });
  const concurrentResults=await Promise.all(queries);
  const concurrentTotalMs=performance.now()-tConcurrentStart;
  assert.equal(concurrentResults.length,200);
  assert.ok(concurrentResults.every(r=>!r.error&&r.data?.found===true));

  console.log(`V18/V19 BENCHMARK [50,001 products / 150,004 barcodes]: seed=${seedMs.toFixed(1)}ms | page1=${page1Ms.toFixed(2)}ms | deepPage1000=${deepPageMs.toFixed(2)}ms | barcodePage3000=${barcodePageMs.toFixed(2)}ms | avgLookup=${singleResolveAvgMs.toFixed(3)}ms | 200xConcurrent=${concurrentTotalMs.toFixed(2)}ms`);
});
