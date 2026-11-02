import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCsvRows} from "../src/utils/retailHelpers.ts";
import {demoCostCoverageV109,demoInventoryCostCoverageV109} from "../src/utils/demoCostCoverageV109.ts";
const product={id:"p1",name:"ئاوی کانی چنار",unit_barcode:"6260053183974",
 unit_purchase_price_iqd:600,unit_sale_price_iqd:1000,stock:10,
 carton:{purchase_price_iqd:9000,units_per_carton:12}};
const receipt=(mode="unit")=>[{items:[{productId:"p1",name:"ئاوی کانی چنار",
 mode,qty:2,units:mode==="carton"?12:1,price:mode==="carton"?12000:1000,
 total:mode==="carton"?24000:2000}]}];
test("V109 no invented money for missing CSV selling price or invalid rows",()=>{
 assert.deepEqual(parseCsvRows("name,barcode,price\nئاوی کانی چنار,6260053183974,1250\n"),[
  {name:"ئاوی کانی چنار",barcode:"6260053183974",price:1250}
 ]);
 assert.deepEqual(parseCsvRows('name,barcode,price\n"ئاوی, کانی چنار",6260053183974,"1,250"\n'),[
  {name:"ئاوی, کانی چنار",barcode:"6260053183974",price:1250}
 ]);
 assert.deepEqual(parseCsvRows("ئاوی کانی چنار,6260053183974\n"),[]);
 assert.deepEqual(parseCsvRows("ئاوی کانی چنار,6260053183974,not-a-price\n"),[]);
 assert.deepEqual(parseCsvRows("ئاوی کانی چنار,6260053183974,-100\n"),[]);
 assert.deepEqual(parseCsvRows("ئاوی کانی چنار,6260053183974,0\n"),[]);
});
test("V109 uses only defined unit and carton acquisition costs, never guesses from selling price",()=>{
 const unit=demoCostCoverageV109([product],receipt());
 assert.equal(unit.complete,true);
 assert.equal(unit.knownCost,1200);
 const carton=demoCostCoverageV109([product],receipt("carton"));
 assert.equal(carton.complete,true);
 assert.equal(carton.knownCost,18000);
 const noCost={...product,unit_purchase_price_iqd:0};
 assert.equal(demoCostCoverageV109([noCost],receipt()).complete,false);
 assert.equal(demoCostCoverageV109([noCost],receipt()).unknownLines,1);
 const noCarton={...product,carton:{...product.carton,purchase_price_iqd:0}};
 assert.equal(demoCostCoverageV109([noCarton],receipt("carton")).complete,false);
 assert.equal(demoCostCoverageV109([product],[{items:[{...receipt()[0].items[0],isScale:true}]}]).complete,false);
 assert.equal(demoInventoryCostCoverageV109([noCost]).complete,false);
 assert.equal(demoInventoryCostCoverageV109([product]).knownCost,6000);
 assert.equal(demoInventoryCostCoverageV109([{...noCost,stock:0}]).complete,true,
  "zero physically held inventory needs no cost valuation");
});
test("V109 import path has no default 50 stock, 80%-cost, 1000-IQD missing price or hidden partial-batch success",()=>{
 const productUI=readFileSync("src/components/ProductCatalogView.tsx","utf8");
 const parser=readFileSync("src/utils/retailHelpers.ts","utf8");
 const reports=readFileSync("src/components/ReportsAnalyticsView.tsx","utf8");
 const operations=readFileSync("src/components/OperationalSubmodulesView.tsx","utf8");
 const block=productUI.slice(productUI.indexOf("const handleImportSubmit ="),productUI.indexOf("const handleStartQuickPrice"));
 assert.match(block,/unit_purchase_price_iqd: 0/);
 assert.match(block,/stock: 0/);
 assert.match(block,/parsed\.length!==dataRows\.length/);
 assert.match(block,/new Set\(barcodes\)\.size!==barcodes\.length/);
 assert.doesNotMatch(block,/item\.price\s*\*\s*0\.8|stock:\s*50/);
 assert.doesNotMatch(parser,/:\s*1000|\\|\|\s*1000/);
 assert.doesNotMatch(reports,/it\.price\s*\*\s*0\.75/);
 assert.doesNotMatch(operations,/item\.price\s*\*\s*0\.8|prod\.unit_purchase_price_iqd\s*\|\|\s*1000/);
 assert.match(reports,/نادیار/);
 assert.match(operations,/نرخی کڕین نادیارە/);
});
