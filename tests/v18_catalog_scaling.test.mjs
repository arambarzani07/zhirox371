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
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.retail_catalog_page_v18\(uuid, text, integer, integer\) FROM PUBLIC, anon/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.retail_barcode_page_v18\(uuid, text, integer, integer\) FROM PUBLIC, anon/);
  // Purchase cost columns must never be selected or returned by V18 read RPCs
  const strippedComments=sql.replace(/--.*$/gm,"");
  assert.doesNotMatch(strippedComments,/purchase_price_minor/);
  assert.doesNotMatch(strippedComments,/purchase_price_iqd/);
  assert.match(doc,/50,000/);
  assert.match(doc,/150,000/);
  assert.match(doc,/TRUNCATE/);
});

test("V18 workspace and operations integrate server pagination, price/barcode inspection tabs, and hybrid scanner lookup while preserving locked Home",()=>{
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
    "list-pagination","list-prev","list-next","list-page-info"
  ]){
    assert.match(wsHtml,new RegExp(`id="${id}"`));
  }
  assert.match(wsJs,/const PAGE_SIZE = 50/);
  assert.match(wsJs,/retail_catalog_page_v18/);
  assert.match(wsJs,/retail_barcode_page_v18/);
  assert.match(wsJs,/retail_resolve_barcode_v18/);

  for(const id of ["stock-search","stock-refresh","stock-pagination","stock-prev","stock-next","stock-page-info"]){
    assert.match(opsHtml,new RegExp(`id="${id}"`));
  }
  assert.match(opsJs,/const PAGE_SIZE=50/);
  assert.match(opsJs,/retail_resolve_barcode_v18/);
  assert.match(opsJs,/retail_catalog_page_v18/);
  assert.match(opsJs,/prefixCache/);

  assert.match(ci,/tests\/v18\/local_catalog_scaling_v18\.sql/);
  assert.match(ci,/tests\/browser\/v18_catalog_scaling\.mjs/);
});

test("V18 scale benchmark: 50,000 products and 150,000 barcodes pagination, exact unit/carton/alias resolution, prefix guard, and 200 concurrent lookups",async()=>{
  const window={};
  new Function("window",read("tests/browser/qa_supabase_fixture.js"))(window);
  const qa=window.__retailQA;
  const client=window.supabase.createClient();
  const storeId=qa.store.id;

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
        purchase_price_iqd:cartonPrice-1000,
        sale_price_iqd:cartonPrice
      }
    });
    qa.barcodes.push(
      {store_id:storeId,product_id:id,code:unitPrimary,unit_type:"unit",units_per_scan:1,active:true},
      {store_id:storeId,product_id:id,code:cartonPrimary,unit_type:"carton",units_per_scan:12,active:true},
      {store_id:storeId,product_id:id,code:extraCode,unit_type:i%2===0?"unit":"carton",units_per_scan:i%2===0?1:12,active:true}
    );
    qa.stock.push({store_id:storeId,product_id:id,quantity:120});
  }
  // Add one short prefix barcode and one retired barcode to verify prefix & inactive rules at 150k scale
  const lastId="18000000-0000-4000-8000-000000050000";
  qa.barcodes.push(
    {store_id:storeId,product_id:lastId,code:"6261050000",unit_type:"unit",units_per_scan:1,active:true},
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
  assert.equal(barcodePage.data.total_count,150002);

  // Measure exact barcode lookups across all 4 barcode types + prefix + retired
  const tResolveStart=performance.now();
  const uPrimary=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"626105000001"});
  const uAlias=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"626305000003"});
  const cPrimary=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"626205000002"});
  const cAlias=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"626404999904"});
  const prefixCode=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"6261050000"});
  const retiredCode=await client.rpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:"6269999999999"});
  const singleResolveAvgMs=(performance.now()-tResolveStart)/6;

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

  console.log(`V18 BENCHMARK [50,001 products / 150,003 barcodes]: seed=${seedMs.toFixed(1)}ms | page1=${page1Ms.toFixed(2)}ms | deepPage1000=${deepPageMs.toFixed(2)}ms | barcodePage3000=${barcodePageMs.toFixed(2)}ms | avgLookup=${singleResolveAvgMs.toFixed(3)}ms | 200xConcurrent=${concurrentTotalMs.toFixed(2)}ms`);
});
