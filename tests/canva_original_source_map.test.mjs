import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const layout = JSON.parse(read('design/canva-original-screen-map.json'));

test('ZHIROX Canva source directory includes all 148 original distinct designs in exact sequence', () => {
  assert.equal(layout.project, 'ZHIROX371');
  assert.equal(layout.canvas.width, 1920);
  assert.equal(layout.canvas.height, 1080);
  assert.equal(layout.screens.length, 148);
  const ids = new Set(layout.screens.map(s => s.id));
  assert.equal(ids.size, 148);
  layout.screens.forEach((s, i) => {
    assert.equal(s.number, i + 1);
    assert.match(s.id, /^D[A-Za-z0-9_-]{10}$/);
    assert.equal(s.canva, 'https://www.canva.com/design/' + s.id);
    assert.equal(s.filename, String(i + 1).padStart(3, '0') + '.png');
  });
  assert.equal(layout.screens[0].id, 'DAHaaMmlLck');
  assert.equal(layout.screens[1].id, 'DAHaaO0eWBM');
  assert.equal(layout.screens[147].id, 'DAHacgVEaDA');
});

test('Original design reference stays isolated from real and demo checkout', () => {
  const main = read('src/main.tsx');
  const preview = read('src/components/CanvaOriginalReview.tsx');
  assert.match(main, /URLSearchParams\(window\.location\.search\)\.has\('canva-source'\)/);
  assert.match(preview, /data-canva-original-review="true"/);
  assert.match(preview, /NOT a local source clone/);
  assert.doesNotMatch(preview, /completeCheckout|commitDurableLocal|window\.print\(/);
});

test('Canva 022 continues within existing product form and live summary', () => {
  const source = read('src/components/ProductCatalogView.tsx');
  const style = read('src/components/canvaOfficialV1.css');
  assert.ok(source.includes("data-canva-screen={editingId ? '023' : '022'}"));
  assert.ok(source.includes('data-canva-inline-summary="true"'));
  assert.ok(source.includes('پوختەی تۆمارکردن'));
  assert.ok(source.includes('زانیاریی بنەڕەتی کاڵا'));
  assert.ok(source.includes('پاشەکەوتکردنی کاڵا'));
  assert.ok(source.includes("onClick={() => { resetForm(); setActiveTab('list'); }}"));
  assert.ok(style.includes('.canva-catalog-new-layout'));
  assert.ok(style.includes('.canva-catalog-new-summary'));
});

test('Canva 023 original geometry and bounded edit controls are preserved', () => {
  const geometry = JSON.parse(read('design/canva-original-screen-023-geometry.json'));
  const source = read('src/components/ProductCatalogView.tsx');
  const style = read('src/components/canvaOfficialV1.css');
  assert.equal(geometry.design_id, layout.screens[22].id);
  assert.equal(geometry.element_count, 30);
  assert.deepEqual(geometry.canvas,{width:1920,height:1080});
  assert.equal(new Set(geometry.elements.map(e=>e.id)).size, 30);
  const title = geometry.elements.find(e=>e.text==='دەستکاریکردنی کاڵا و نرخ');
  const permission = geometry.elements.find(e=>e.text==='دەسەڵات و پشتڕاستکردنەوە');
  assert.equal(title.x,1014);
  assert.equal(permission.x,62.400000000000006);
  assert.match(source,/data-canva-inline-permission="true"/);
  assert.match(source,/id="canva-edit-023-search"/);
  assert.match(source,/disabled title="پشتڕاستکردنەوەی دەسەڵاتی گۆڕانکاری/);
  assert.match(source,/onSubmit=\{handleSaveProduct\}/);
  assert.match(style,/canva-catalog-edit-023/);
});

test('Canva 024 uses verified 1920x1080 original text geometry and selectable in-screen barcode modes',()=>{
  const geometry=JSON.parse(read('design/canva-original-screen-024-geometry.json'));
  const source=read('src/components/ProductCatalogView.tsx');
  const style=read('src/components/canvaOfficialV1.css');
  assert.equal(geometry.design_id,layout.screens[23].id);
  assert.equal(geometry.element_count,40);
  assert.equal(geometry.canvas.width,1920);
  assert.equal(geometry.canvas.height,1080);
  assert.equal(new Set(geometry.elements.map(x=>x.id)).size,40);
  assert.match(source,/data-canva-screen="024"/);
  assert.match(source,/className="canva-barcode-layout"/);
  assert.match(source,/بارکۆدەکانی هەر جۆرە یەکەیەک/);
  assert.match(source,/بارکۆدی دووبارە تۆمار ناکرێت/);
  for(const key of ["unit","carton","bundle","set","kg"]){
    assert.ok(source.includes("['"+key+"',"),"Missing selectable mode "+key);
  }
  assert.match(source,/handleSaveBarcodeAlias\(barcodeCatalogProduct, barcodeCatalogMode\)/);
  assert.match(source,/findBarcodeOwner\(clean, null\)/);
  assert.match(source,/alias_barcodes: \[\.\.\.x.alias_barcodes/);
  assert.match(source,/alias_barcodes: \[\.\.\.p.carton.alias_barcodes/);
  assert.match(style,/\.canva-barcode-024 \.canva-barcode-layout/);
});

test('Canva 024 regression runs in real Chromium; barcode whitespace and repeats are rejected',()=>{
  const source=read('src/components/ProductCatalogView.tsx');
  const browser=read('tests/browser/v23_react_preview.mjs');
  assert.ok(source.includes(String.raw`/[\s,،;]/u.test(clean)`));
  assert.match(browser,/data-canva-screen="024"/);
  assert.match(browser,/\.canva-barcode-mode-tabs button/);
  assert.match(browser,/canva-barcode-new-alias/);
  assert.match(browser,/Repeated carton alias must be rejected/);
});

test('Canva 025 source bounds and read-only price history never fabricate approval or prior prices', () => {
  const geometry = JSON.parse(read('design/canva-original-screen-025-geometry.json'));
  const source = read('src/components/CanvaPriceHistory025.tsx');
  const state = read('src/context/AppContext.tsx');
  const catalog = read('src/components/ProductCatalogView.tsx');
  const style = read('src/components/canvaOfficialV1.css');
  assert.equal(geometry.design_id, layout.screens[24].id);
  assert.equal(geometry.element_count, 56);
  assert.deepEqual(geometry.canvas, {width:1920,height:1080});
  assert.equal(new Set(geometry.elements.map(e => e.id)).size, 56);
  assert.match(source,/data-canva-screen="025"/);
  assert.match(source,/تۆماری گۆڕانکارییەکان/);
  assert.match(source,/هیچ گۆڕانکارییەک بۆ ئەم هەڵبژاردنە نییە/);
  assert.match(source,/recorded_demo/);
  assert.match(source,/summaryValues = \{ pending: '—', approved: '—', rejected: '—' \}/);
  assert.match(state,/priceChanges: PriceChangeAudit025\[\]/);
  assert.match(state,/track\('carton', 'sale'/);
  assert.match(state,/track\(oldPack.kind, 'sale'/);
  assert.match(catalog,/activeTab === 'history'/);
  assert.match(style,/canva-price-history-025 \.canva-history-layout/);
});

test('Canva 025 Chromium regression exercises actual before/after and rejects fake approvals', () => {
  const browser = read('tests/browser/v23_react_preview.mjs');
  assert.match(browser, /data-canva-screen="025"/);
  assert.match(browser, /originalSale025\+7/);
  assert.match(browser, /Unverified managerial approval count must not be fabricated/);
  assert.match(browser, /پشکنینی وردەکاری/);
});

test('Canva 026 authentic source and read-only scan integration preserve exact identities', () => {
  const geometry=JSON.parse(read('design/canva-original-screen-026-geometry.json'));
  const source=read('src/components/CanvaBarcodeAudit026.tsx');
  const catalog=read('src/components/ProductCatalogView.tsx');
  const helper=read('src/utils/barcodeAudit026.ts');
  const css=read('src/components/canvaOfficialV1.css');
  assert.equal(geometry.design_id,layout.screens[25].id);
  assert.equal(geometry.element_count,40);
  assert.deepEqual(geometry.canvas,{width:1920,height:1080});
  assert.equal(new Set(geometry.elements.map(x=>x.id)).size,40);
  assert.match(source,/data-canva-screen="026"/);
  assert.match(source,/پشکنینی بارکۆدی دووبارە/);
  assert.match(source,/onSubmit=\{e => \{ e.preventDefault\(\); check\(\); \}\}/);
  assert.match(source,/onBackToBarcodes/);
  assert.match(catalog,/activeTab === 'duplicates'/);
  assert.match(catalog,/canva-barcode-duplicate-open/);
  assert.match(helper,/enumerateActiveBarcodes026/);
  assert.match(helper,/entry.code === code/);
  assert.match(css,/canva-duplicate-026 \.canva-duplicate-layout/);
  const browser=read('tests/browser/v23_react_preview.mjs');
  assert.ok(browser.includes('const duplicateScreen=page.locator'));
  assert.ok(browser.includes('یەک خاوەند'));
  assert.ok(browser.includes('گەڕانەوە بۆ بارکۆدەکان'));
});
test('Canva 026 exact local ownership scan detects duplicate across unit, carton and pack without mutating data',async()=>{
  const {inspectDuplicateBarcode026}=await import('../src/utils/barcodeAudit026.ts');
  const product={id:'test-a',name:'پشکنینی کاڵا',base_unit:'unit',unit_barcode:'000001',
    unit_alias_barcodes:['000002'],carton:{barcode:'000003',alias_barcodes:['000004'],units_per_carton:24},
    extra_packs:[{kind:'bundle',barcode:'000005',alias_barcodes:['000006']},
      {kind:'set',barcode:'000007',alias_barcodes:['000008']}]};
  const other={id:'test-b',name:'کاڵای دووەم',base_unit:'kg',unit_barcode:'000009',
    unit_alias_barcodes:['000004'],carton:null,extra_packs:[]};
  const input=[product,other];
  const snapshot=JSON.stringify(input);
  const valid=inspectDuplicateBarcode026(input,'000001');
  assert.equal(valid.status,'unique');assert.equal(valid.matches[0].mode,'unit');
  const carton=inspectDuplicateBarcode026(input,'000003');
  assert.equal(carton.status,'unique');assert.equal(carton.matches[0].mode,'carton');
  const duplicated=inspectDuplicateBarcode026(input,'000004');
  assert.equal(duplicated.status,'duplicate');assert.equal(duplicated.matches.length,2);
  assert.deepEqual(duplicated.matches.map(x=>x.mode),['carton','kg']);
  assert.equal(inspectDuplicateBarcode026(input,'000006').matches[0].mode,'bundle');
  assert.equal(inspectDuplicateBarcode026(input,'000008').matches[0].mode,'set');
  assert.equal(inspectDuplicateBarcode026(input,'000009').matches[0].mode,'kg');
  assert.equal(inspectDuplicateBarcode026(input,'099999').status,'unused');
  assert.equal(inspectDuplicateBarcode026(input,'  ').status,'empty');
  assert.equal(inspectDuplicateBarcode026(input,'000 009').status,'invalid');
  assert.equal(inspectDuplicateBarcode026([{
    ...product,carton:{...product.carton,barcode:'000001'}
  }],'000001').status,'duplicate');
  assert.equal(JSON.stringify(input),snapshot,'read-only audit never alters products');
});

test('Canva 027 original price screen geometry and read-only five-mode React routing',()=>{
  const geometry=JSON.parse(read('design/canva-original-screen-027-geometry.json'));
  const screen=read('src/components/CanvaUnitPrices027.tsx');
  const utility=read('src/utils/unitPrices027.ts');
  const catalog=read('src/components/ProductCatalogView.tsx');
  const style=read('src/components/canvaOfficialV1.css');
  assert.equal(geometry.design_id,layout.screens[26].id);
  assert.equal(geometry.element_count,48);
  assert.deepEqual(geometry.canvas,{width:1920,height:1080});
  assert.equal(new Set(geometry.elements.map(e=>e.id)).size,48);
  assert.match(screen,/data-canva-screen="027"/);
  assert.match(screen,/خشتەی نرخەکانی یەکەکان/);
  assert.match(screen,/disabled[\s\S]*?داواکردنی گۆڕینی نرخ/);
  assert.doesNotMatch(screen,/updateProduct\(|addProduct\(|deleteProduct\(/);
  assert.match(utility,/mode==='kg'/);
  assert.match(catalog,/activeTab === 'unit-prices'/);
  assert.match(style,/canva-unit-prices-027 \.canva-unit-price-layout/);
});
test('Canva 027 renders actual prices by unit and never invents unconfigured costs or modes',async()=>{
  const {unitPriceRows027,resolveUnitByBarcode027,matchesUnitPriceQuery027}=await import('../src/utils/unitPrices027.ts');
  const p={id:'product-027',name:'نموونەی کاڵا',base_unit:'unit',unit_barcode:'111',
    unit_alias_barcodes:['112'],unit_purchase_price_iqd:250,unit_sale_price_iqd:400,
    carton:{barcode:'211',alias_barcodes:['212'],units_per_carton:24,purchase_price_iqd:5000,sale_price_iqd:7000},
    extra_packs:[{kind:'bundle',barcode:'311',alias_barcodes:['312'],units_per_pack:6,purchase_price_iqd:null,sale_price_iqd:2100},
      {kind:'set',barcode:'411',alias_barcodes:[],units_per_pack:2,purchase_price_iqd:0,sale_price_iqd:800}]};
  const before=JSON.stringify(p);const rows=unitPriceRows027(p);
  assert.deepEqual(rows.map(r=>r.mode),['unit','carton','bundle','set','kg']);
  assert.deepEqual(rows.map(r=>r.configured),[true,true,true,true,false]);
  assert.equal(rows[0].sellIqd,400);assert.equal(rows[0].buyIqd,250);
  assert.equal(rows[1].units,24);assert.equal(rows[1].sellIqd,7000);
  assert.equal(rows[2].units,6);assert.equal(rows[2].buyIqd,null);
  assert.equal(rows[3].buyIqd,null);
  assert.equal(rows[4].sellIqd,null);
  assert.equal(resolveUnitByBarcode027(p,'212'),'carton');
  assert.equal(resolveUnitByBarcode027(p,'312'),'bundle');
  assert.equal(resolveUnitByBarcode027(p,'112'),'unit');
  assert.equal(resolveUnitByBarcode027(p,'999'),null);
  assert.equal(matchesUnitPriceQuery027(p,'312'),true);
  const kg=unitPriceRows027({...p,base_unit:'kg',carton:null,extra_packs:[]});
  assert.equal(kg[0].configured,false);assert.equal(kg[4].configured,true);
  assert.equal(kg[4].sellIqd,400);assert.equal(kg[4].units,1);
  assert.equal(JSON.stringify(p),before,'Price view never alters source product');
});

test('Canva 027 Chromium baseline pricing must precede any price mutation',()=>{
  const browser=read('tests/browser/v23_react_preview.mjs');
  assert.ok(browser.indexOf('// Canva 027:')>0);
  assert.ok(browser.indexOf('// Canva 027:')<browser.indexOf('// Canva 025:'));
  assert.match(browser,/data-canva-screen="027"/);
  assert.match(browser,/data-unit-price-mode="carton"/);
  assert.match(browser,/Do not invent historical price-change date/);
});

test('Canva 028 authentic geometry and bulk price preview have no write path', () => {
  const geometry=JSON.parse(read('design/canva-original-screen-028-geometry.json'));
  const screen=read('src/components/CanvaBulkPrice028.tsx');
  const helper=read('src/utils/bulkPricePreview028.ts');
  const catalog=read('src/components/ProductCatalogView.tsx');
  const style=read('src/components/canvaOfficialV1.css');
  assert.equal(geometry.design_id,layout.screens[27].id);
  assert.equal(geometry.element_count,44);
  assert.deepEqual(geometry.canvas,{width:1920,height:1080});
  assert.equal(new Set(geometry.elements.map(x=>x.id)).size,44);
  assert.match(screen,/data-canva-screen="028"/);
  assert.match(screen,/پێشبینینی گۆڕینی نرخ بەکۆمەڵ/);
  assert.match(screen,/پێش پەسەندکردن هیچ نرخێکی ڕاستەقینە ناگۆڕدرێت/);
  assert.doesNotMatch(screen,/updateProduct\(|addProduct\(|deleteProduct\(/);
  assert.match(helper,/priceType==='wholesale'/);
  assert.match(helper,/Number.isSafeInteger\(proposed\)/);
  assert.match(catalog,/activeTab === 'bulk-prices'/);
  assert.match(style,/canva-bulk-price-028 \.canva-bulk-price-layout/);
});
test('Canva 028 preview calculates only real selected product values and remains immutable',async()=>{
  const {previewBulkPrices028}=await import('../src/utils/bulkPricePreview028.ts');
  const products=[
    {id:'a',name:'ئاوی نموونە',category:'خواردنەوەکان',base_unit:'unit',
      unit_barcode:'123',unit_sale_price_iqd:250,carton:{barcode:'124',sale_price_iqd:5000}},
    {id:'b',name:'ئاوی دووەم',category:'خواردنەوەکان',base_unit:'unit',
      unit_barcode:'223',unit_sale_price_iqd:130,carton:null},
    {id:'c',name:'شەکر',category:'خۆراک',base_unit:'unit',
      unit_barcode:'323',unit_sale_price_iqd:1000,carton:null}
  ];
  const before=JSON.stringify(products);
  const req={category:'خواردنەوەکان',priceType:'unit',adjustmentType:'percent',adjustment:'10'};
  const pct=previewBulkPrices028(products,req);
  assert.equal(pct.error,null);assert.equal(pct.selectedCount,2);
  assert.deepEqual(pct.rows.map(r=>r.proposedIqd),[275,143]);
  assert.equal(pct.rows[0].previousIqd,250);
  assert.equal(previewBulkPrices028(products,{...req,priceType:'carton'}).rows[0].proposedIqd,5500);
  assert.equal(previewBulkPrices028(products,{...req,priceType:'carton'}).skipped,1);
  assert.equal(previewBulkPrices028(products,{...req,adjustmentType:'amount',adjustment:'-100'}).rows[0].proposedIqd,150);
  assert.equal(previewBulkPrices028(products,{...req,category:'ناپەیوەند'}).rows.length,0);
  assert.equal(previewBulkPrices028(products,{...req,priceType:'wholesale'}).rows.length,0);
  assert.ok(previewBulkPrices028(products,{...req,adjustment:'-100'}).error);
  assert.ok(previewBulkPrices028(products,{...req,adjustment:'1e3'}).error);
  assert.equal(JSON.stringify(products),before,'Preview must never write data');
});

test('Canva 029 original authority matrix source geometry and fail-closed UI',()=>{
  const geometry=JSON.parse(read('design/canva-original-screen-029-geometry.json'));
  const component=read('src/components/CanvaPermissions029.tsx');
  const policy=read('src/utils/permissionPolicy029.ts');
  const catalog=read('src/components/ProductCatalogView.tsx');
  const css=read('src/components/canvaOfficialV1.css');
  assert.equal(geometry.design_id,layout.screens[28].id);
  assert.equal(geometry.element_count,35);
  assert.deepEqual(geometry.canvas,{width:1920,height:1080});
  assert.equal(new Set(geometry.elements.map(x=>x.id)).size,35);
  assert.match(component,/data-canva-screen="029"/);
  assert.match(component,/پشتڕاست نەکراوە/);
  assert.match(component,/نەنێردراوە/);
  assert.match(component,/disabled=\{!permissions.canSubmitRequest\}/);
  assert.doesNotMatch(component,/updateProduct\(|addProduct\(|approveRequest\(|setCurrentRole\(/);
  assert.match(policy,/sessionVerifiedByServer/);
  assert.match(policy,/canApproveChanges: false/);
  assert.match(catalog,/activeTab === 'permissions'/);
  assert.match(css,/canva-permissions-029 \.canva-permission-layout/);
});
test('Canva 029 template roles never authorize writes, even if caller passes spoofed manager',async()=>{
  const {permissionPolicyRows029,authorizationStatus029}=await import('../src/utils/permissionPolicy029.ts');
  assert.equal(permissionPolicyRows029.length,5);
  assert.equal(permissionPolicyRows029[0].cashier,'بینین');
  assert.equal(permissionPolicyRows029[1].cashier,'داواکاری');
  assert.equal(permissionPolicyRows029[1].manager,'دەستکاری');
  assert.equal(permissionPolicyRows029[3].cashier,'نەخێر');
  assert.equal(permissionPolicyRows029[3].manager,'پەسەندکردن');
  assert.equal(permissionPolicyRows029[4].target,'duplicates');
  assert.deepEqual(authorizationStatus029(),{
    isVerified:false,canEditPrices:false,canCreateProduct:false,canApproveChanges:false,canSubmitRequest:false
  });
  assert.equal(authorizationStatus029({role:'manager',sessionVerifiedByServer:true,actorId:'forged'}).canApproveChanges,false);
  assert.equal(authorizationStatus029({role:'cashier',sessionVerifiedByServer:false,actorId:'fake'}).canSubmitRequest,false);
});

test('Canva 030 original source geometry and fail-closed untrusted approval UI',()=>{
  const g=JSON.parse(read('design/canva-original-screen-030-geometry.json'));
  const screen=read('src/components/CanvaReviewApproval030.tsx');
  const helper=read('src/utils/reviewApproval030.ts');
  const catalog=read('src/components/ProductCatalogView.tsx');
  const role=read('src/components/CanvaPermissions029.tsx');
  const style=read('src/components/canvaOfficialV1.css');
  assert.equal(g.design_id,layout.screens[29].id);
  assert.equal(g.element_count,50);
  assert.deepEqual(g.canvas,{width:1920,height:1080});
  assert.equal(new Set(g.elements.map(x=>x.id)).size,50);
  assert.match(screen,/data-canva-screen="030"/);
  assert.match(screen,/پەسەندکردنی دووبارەی هەمان داواکاری ڕێگەی پێ نادرێت/);
  assert.match(screen,/disabled=\{!isAuthorized\}/);
  assert.doesNotMatch(screen,/updateProduct\(|approveRequest\(|rejectRequest\(|addProduct\(/);
  assert.match(helper,/if\(filter==='pending'\) return \[\]/);
  assert.match(helper,/canFinalizeReview030 = .*false => false/);
  assert.match(catalog,/activeTab === 'review'/);
  assert.match(role,/onReview/);
  assert.match(style,/canva-review-030 \.canva-review-layout/);
});
test('Canva 030 displays only actual DEMO audit entries and never forges pending requests',async()=>{
  const {recordedPriceAudit030,reviewEntries030,canFinalizeReview030}=await import('../src/utils/reviewApproval030.ts');
  const original=[
    {id:'a',timestamp:'2026-11-11T09:15:00.000Z',user:'Demo',
      action:'گۆڕینی نرخ',details:'Demo 250 > 275',
      priceChange:{productId:'p1',productName:'ئاوی نموونە',barcode:'123',unit:'unit',priceType:'sale',previousIqd:250,nextIqd:275,status:'recorded_demo'}},
    {id:'b',timestamp:'2026-11-11T09:16:00.000Z',user:'Demo',
      action:'تۆماری گشتی',details:'بەڵگەی ناتەواو'}
  ];
  const before=JSON.stringify(original);
  assert.equal(recordedPriceAudit030(original).length,1);
  assert.equal(reviewEntries030(original,'pending','').length,0);
  assert.equal(reviewEntries030(original,'all','ئاوی نموونە').length,1);
  assert.equal(reviewEntries030(original,'all','123').length,1);
  assert.equal(reviewEntries030(original,'all','not-found').length,0);
  assert.equal(reviewEntries030(original,'recorded_demo','').length,1);
  assert.equal(canFinalizeReview030('manager','a'),false);
  assert.equal(canFinalizeReview030('cashier','a'),false);
  assert.equal(JSON.stringify(original),before,'Inspection is read-only');
});

test('Canva 031 authentic source 42 boxes, five unit modes, and existing DEMO navigation',()=>{
 const g=JSON.parse(read('design/canva-original-screen-031-geometry.json'));
 const screen=read('src/components/CanvaExtraBarcodes031.tsx');
 const utility=read('src/utils/extraBarcodes031.ts');
 const catalog=read('src/components/ProductCatalogView.tsx');
 const style=read('src/components/canvaOfficialV1.css');
 assert.equal(g.design_id,layout.screens[30].id);
 assert.equal(g.element_count,42);
 assert.deepEqual(g.canvas,{width:1920,height:1080});
 assert.equal(new Set(g.elements.map(x=>x.id)).size,42);
 assert.match(screen,/data-canva-screen="031"/);
 assert.match(screen,/بارکۆدە زیادەکانی هەر یەکە/);
 assert.match(screen,/پشکنینی دووبارەبوونەوە/);
 assert.match(screen,/onSubmit=\{e=>\{e.preventDefault\(\);save\(\);\}\}/);
 assert.match(utility,/codeTaken031\(products,code\)/);
 assert.match(utility,/aliases.length>=30/);
 assert.match(catalog,/activeTab === 'extra-barcodes'/);
 assert.match(style,/canva-extra-barcodes-031 \.canva-extra-layout/);
});
test('Canva 031 validates alias ownership for every selling mode, with no input mutation',async()=>{
 const {isConfigured031,listBarcodes031,prepareExtraAlias031}=await import('../src/utils/extraBarcodes031.ts');
 const p={id:'a',name:'ئاوی نموونە',base_unit:'unit',unit_barcode:'111',
  unit_alias_barcodes:['112'],carton:{barcode:'211',alias_barcodes:['212'],units_per_carton:24},
  extra_packs:[{kind:'bundle',barcode:'311',alias_barcodes:['312']},
    {kind:'set',barcode:'411',alias_barcodes:[]}]};
 const kg={id:'b',name:'کیلۆ',base_unit:'kg',unit_barcode:'511',unit_alias_barcodes:['512'],carton:null,extra_packs:[]};
 const items=[p,kg];const snapshot=JSON.stringify(items);
 assert.equal(isConfigured031(p,'unit'),true);
 assert.equal(isConfigured031(p,'kg'),false);
 assert.equal(isConfigured031(kg,'kg'),true);
 assert.equal(listBarcodes031(p,'carton')[1].code,'212');
 assert.equal(prepareExtraAlias031(items,'a','carton','212').ok,false);
 assert.equal(prepareExtraAlias031(items,'a','carton','512').ok,false);
 assert.equal(prepareExtraAlias031(items,'a','kg','613').ok,false);
 assert.equal(prepareExtraAlias031(items,'a','unit','space code').ok,false);
 assert.equal(prepareExtraAlias031(items,'a','set','613').ok,true);
 const add=prepareExtraAlias031(items,'a','bundle',' 613 ');
 assert.equal(add.ok,true);assert.deepEqual(add.updates.extra_packs[0].alias_barcodes,['312','613']);
 const cap={...p,unit_alias_barcodes:Array.from({length:30},(_,i)=>'77'+String(i).padStart(2,'0'))};
 assert.equal(prepareExtraAlias031([cap],'a','unit','77777').ok,false);
 const good=prepareExtraAlias031(items,'b','kg','613');
 assert.equal(good.ok,true);assert.deepEqual(good.updates.unit_alias_barcodes,['512','613']);
 assert.equal(JSON.stringify(items),snapshot,'Pure validation cannot modify DEMO source input');
});

test('Canva 032 authentic geometry and actual read-only unit ratio route',()=>{
 const g=JSON.parse(read('design/canva-original-screen-032-geometry.json'));
 const screen=read('src/components/CanvaUnitRatios032.tsx');
 const util=read('src/utils/unitRatios032.ts');
 const catalog=read('src/components/ProductCatalogView.tsx');
 const css=read('src/components/canvaOfficialV1.css');
 assert.equal(g.design_id,layout.screens[31].id);
 assert.equal(g.element_count,50);
 assert.deepEqual(g.canvas,{width:1920,height:1080});
 assert.equal(new Set(g.elements.map(x=>x.id)).size,50);
 assert.match(screen,/data-canva-screen="032"/);
 assert.match(screen,/یەکەی سەرەکی بۆ کاڵای ژمێردراو/);
 assert.match(screen,/داواکردنی پاشەکەوتکردن/);
 assert.doesNotMatch(screen,/updateProduct\(|addProduct\(|deleteProduct\(/);
 assert.match(util,/unitRatioRows032/);
 assert.match(util,/base_unit==='kg'/);
 assert.match(catalog,/activeTab === 'unit-ratios'/);
 assert.match(css,/canva-unit-ratios-032 \.canva-ratio-layout/);
});
test('Canva 032 factors derive from real units, preserve kg independence and reject corrupt quantities',async()=>{
 const {unitRatioRows032,inspectUnitRatios032}=await import('../src/utils/unitRatios032.ts');
 const counted={id:'a',base_unit:'unit',carton:{units_per_carton:24},
   extra_packs:[{kind:'bundle',units_per_pack:6},{kind:'set',units_per_pack:2}]};
 const before=JSON.stringify(counted);
 const rows=unitRatioRows032(counted);
 assert.deepEqual(rows.map(r=>r.mode),['unit','carton','bundle','set','kg']);
 assert.deepEqual(rows.map(r=>r.factor),[1,24,6,2,null]);
 assert.equal(rows[0].baseUnit,'دانە');
 assert.equal(rows[1].baseQuantity,24);
 assert.equal(rows[4].baseUnit,'کیلۆ');
 assert.equal(rows[4].status,'سەربەخۆ');
 assert.equal(inspectUnitRatios032(counted).verifiedCount,4);
 assert.deepEqual(inspectUnitRatios032(counted).issues,[]);
 const noPacks={...counted,carton:null,extra_packs:[]};
 assert.equal(unitRatioRows032(noPacks)[1].factor,null);
 assert.equal(unitRatioRows032(noPacks)[1].status,'دیاری نەکراوە');
 assert.deepEqual(inspectUnitRatios032(null).issues,['سەرەتا کاڵا هەڵبژێرە']);
 const weighted={...counted,base_unit:'kg',carton:null,extra_packs:[]};
 assert.equal(unitRatioRows032(weighted)[0].factor,null);
 assert.equal(unitRatioRows032(weighted)[4].factor,1);
 assert.equal(unitRatioRows032(weighted)[4].status,'چالاک');
 const bad={...counted,carton:{units_per_carton:0},
   extra_packs:[{kind:'bundle',units_per_pack:1.5},{kind:'set',units_per_pack:-2}]};
 assert.equal(unitRatioRows032(bad)[1].status,'پشکنین پێویستە');
 assert.equal(inspectUnitRatios032(bad).issues.length,3);
 assert.equal(JSON.stringify(counted),before,'Ratio inspection must never mutate data');
});

test('Canva 033 original geometry and five-mode profit UI do not mutate catalogue',()=>{
 const g=JSON.parse(read('design/canva-original-screen-033-geometry.json'));
 const screen=read('src/components/CanvaProfitAudit033.tsx');
 const util=read('src/utils/profitAudit033.ts');
 const catalog=read('src/components/ProductCatalogView.tsx');
 const style=read('src/components/canvaOfficialV1.css');
 assert.equal(g.design_id,layout.screens[32].id);
 assert.equal(g.element_count,54);
 assert.deepEqual(g.canvas,{width:1920,height:1080});
 assert.equal(new Set(g.elements.map(x=>x.id)).size,54);
 assert.match(screen,/data-canva-screen="033"/);
 assert.match(screen,/شیکاریی نرخی کڕین و فرۆشتن/);
 assert.match(screen,/داواکردنی گۆڕینی نرخ/);
 assert.doesNotMatch(screen,/updateProduct\(|addProduct\(|deleteProduct\(/);
 assert.match(util,/grossIqd\/sellIqd/);
 assert.match(catalog,/activeTab === 'profit-audit'/);
 assert.match(style,/canva-profit-audit-033 \.canva-profit-layout/);
});
test('Canva 033 gross profit uses actual independent costs and never fabricates absent buy price',async()=>{
 const {productProfitRows033,isTrustedProfit033}=await import('../src/utils/profitAudit033.ts');
 const product={id:'water',base_unit:'unit',unit_purchase_price_iqd:175,
   unit_sale_price_iqd:250,carton:{purchase_price_iqd:3800,sale_price_iqd:5000},
   extra_packs:[{kind:'bundle',purchase_price_iqd:null,sale_price_iqd:1200},
     {kind:'set',purchase_price_iqd:1000,sale_price_iqd:900}]};
 const before=JSON.stringify(product);
 const rows=productProfitRows033(product);
 assert.deepEqual(rows.map(r=>r.mode),['unit','carton','bundle','set','kg']);
 assert.deepEqual(rows.map(r=>r.status),['profit','profit','missing_cost','loss','not_configured']);
 assert.equal(rows[0].grossIqd,75);
 assert.equal(rows[0].marginPercent,30);
 assert.equal(rows[1].grossIqd,1200);
 assert.equal(rows[1].marginPercent,24);
 assert.equal(rows[2].grossIqd,null);
 assert.equal(rows[2].marginPercent,null);
 assert.equal(rows[3].grossIqd,-100);
 assert.equal(rows[3].marginPercent,-11.1);
 assert.equal(rows[4].sellIqd,null);
 assert.equal(isTrustedProfit033(rows[0]),true);
 assert.equal(isTrustedProfit033(rows[2]),false);
 assert.equal(productProfitRows033(null).filter(r=>r.grossIqd!==null).length,0);
 const weighted={...product,base_unit:'kg',carton:null,extra_packs:[]};
 assert.equal(productProfitRows033(weighted)[0].configured,false);
 assert.equal(productProfitRows033(weighted)[4].grossIqd,75);
 const noCost={...product,unit_purchase_price_iqd:0,carton:null,extra_packs:[]};
 assert.equal(productProfitRows033(noCost)[0].marginPercent,null);
 const badSale={...product,unit_sale_price_iqd:-1};
 assert.equal(productProfitRows033(badSale)[0].status,'invalid_price');
 assert.equal(JSON.stringify(product),before,'Audit never changes original product');
});

test('Canva 034 source geometry and safe CSV preview navigation have no write path',()=>{
 const g=JSON.parse(read('design/canva-original-screen-034-geometry.json'));
 const screen=read('src/components/CanvaImportPreview034.tsx');
 const util=read('src/utils/importPreview034.ts');
 const catalog=read('src/components/ProductCatalogView.tsx');
 const style=read('src/components/canvaOfficialV1.css');
 assert.equal(g.design_id,layout.screens[33].id);
 assert.equal(g.element_count,44);
 assert.deepEqual(g.canvas,{width:1920,height:1080});
 assert.equal(new Set(g.elements.map(x=>x.id)).size,44);
 assert.match(screen,/data-canva-screen="034"/);
 assert.match(screen,/فایلی کاڵاکان/);
 assert.match(screen,/تا پشکنین و پەسەندکردن تەواو نەبێت/);
 assert.match(screen,/canva-import-file-trigger/);
 assert.doesNotMatch(screen,/updateProduct\(|addProduct\(|deleteProduct\(/);
 assert.match(util,/existingCodes.has\(c.barcode\)/);
 assert.match(catalog,/activeTab === 'import-preview'/);
 assert.match(catalog,/setActiveTab\('import-preview'\)/);
 assert.match(style,/canva-import-preview-034 \.canva-import-layout/);
});
test('Canva 034 CSV file preview handles rows, duplicate aliases, missing units and bad prices, without writes',async()=>{
 const {previewCsvProducts034}=await import('../src/utils/importPreview034.ts');
 const products=[{id:'a',name:'ئاوی نموونە',base_unit:'unit',unit_barcode:'2000000000018',
  unit_alias_barcodes:['010101'],carton:{barcode:'2000000000025',alias_barcodes:['2025']},
  extra_packs:[{kind:'bundle',barcode:'9922',alias_barcodes:['9923']}]}];
 const before=JSON.stringify(products);
 const csv=[
  'name,barcode,price,unit',
  'ئاوی نوێ,00001234,250,دانە',
  'کاڵای دووبارە,00005678,500,دانە',
  'کاڵای دووبارە,00005678,500,دانە',
  'پەیوەست بە کارتۆن,2000000000025,300,دانە',
  'پەیوەست بە هاوتا,010101,700,دانە',
  'بێ نرخ,00001111,0,دانە',
  'بێ یەکە,00002222,450,کارتۆن',
  'ناوی نوێ,00009999,1200,کیلۆ'
 ].join('\n');
 const report=previewCsvProducts034(csv,products);
 assert.equal(report.total,8);
 assert.equal(report.ready,2);
 assert.equal(report.errors,6);
 assert.deepEqual(report.rows.map(r=>r.status),[
  'ready','error','error','error','error','error','error','ready'
 ]);
 assert.equal(report.rows[0].barcode,'00001234');
 assert.equal(report.rows[0].priceIqd,250);
 assert.equal(report.rows[0].line,2);
 assert.match(report.rows[3].issues.join(','),/کەتەلۆگ/);
 assert.match(report.rows[4].issues.join(','),/کەتەلۆگ/);
 assert.equal(report.rows[5].priceIqd,null);
 assert.equal(report.rows[6].unit,'کارتۆن');
 assert.equal(previewCsvProducts034('نوێ,00003333,250',products).ready,0);
 assert.match(previewCsvProducts034('"هەڵە,00005555,200,دانە',products).warnings[0],/نادروست/);
 const safe=previewCsvProducts034('"ناوی کاڵا","بارکۆد","نرخی فرۆشتن","یەکە"\n"ئاوی, تایبەت",00007777,800,دانە',products);
 assert.equal(safe.ready,1);
 assert.equal(safe.rows[0].name,'ئاوی, تایبەت');
 assert.equal(JSON.stringify(products),before,'No write or mutation during preview');
});

test('Canva 034 rejects missing unit headers and preserves zero-prefixed CSV codes',async()=>{
 const {previewCsvProducts034}=await import('../src/utils/importPreview034.ts');
 const data=[];
 const missing=previewCsvProducts034('name,barcode,price\nئاوی نوێ,0000012,450',data);
 assert.equal(missing.ready,0);
 assert.match(missing.warnings.join(','),/یەکە/);
 const withBom=previewCsvProducts034('\uFEFFname,barcode,price,unit\nئاوی نوێ,0000012,450,unit',data);
 assert.equal(withBom.ready,1);
 assert.equal(withBom.rows[0].barcode,'0000012');
 assert.equal(withBom.rows[0].priceIqd,450);
 const unsafe=previewCsvProducts034('name,barcode,price,unit\nنوێ,0000012,1e5,دانە\nنوێی دووەم,0000044,500,کارتۆن',data);
 assert.equal(unsafe.ready,0);
 assert.equal(unsafe.errors,2);
});

test('Canva 035 original text geometry and fail-closed lifecycle screen',()=>{
 const g=JSON.parse(read('design/canva-original-screen-035-geometry.json'));
 const view=read('src/components/CanvaLifecycle035.tsx');
 const rules=read('src/utils/lifecyclePreview035.ts');
 const catalog=read('src/components/ProductCatalogView.tsx');
 const style=read('src/components/canvaOfficialV1.css');
 assert.equal(g.design_id,layout.screens[34].id);
 assert.equal(g.element_count,44);
 assert.deepEqual(g.canvas,{width:1920,height:1080});
 assert.equal(new Set(g.elements.map(x=>x.id)).size,44);
 assert.match(view,/data-canva-screen="035"/);
 assert.match(view,/ناچالاککردن واتە وەستاندنی فرۆشتن/);
 assert.match(view,/بارکۆدی لابراو بە ناچالاکی دەپارێزرێت/);
 assert.match(view,/disabled=\{!summary.canSubmitRequest\}/);
 assert.match(view,/disabled=\{!summary.canRestore\}/);
 assert.doesNotMatch(view,/updateProduct\(|deleteProduct\(|addProduct\(|approveRequest\(/);
 assert.match(rules,/verifiedActiveCodes:null/);
 assert.match(catalog,/activeTab === 'lifecycle'/);
 assert.match(style,/canva-lifecycle-035 \.canva-lifecycle-layout/);
});
test('Canva 035 lists genuine registered barcodes without fabricating active or retired state',async()=>{
 const {productBarcodeRows035,lifecycleSummary035}=await import('../src/utils/lifecyclePreview035.ts');
 const product={id:'a',name:'ئاوی تاقیکردنەوە',base_unit:'unit',unit_barcode:'111',unit_alias_barcodes:['112'],
  carton:{barcode:'211',alias_barcodes:['212']},
  extra_packs:[{kind:'bundle',barcode:'311',alias_barcodes:['312']},
    {kind:'set',barcode:'411',alias_barcodes:[]}]};
 const kg={id:'b',name:'تەماتە',base_unit:'kg',unit_barcode:'511',unit_alias_barcodes:['512'],
  carton:null,extra_packs:[]};
 const before=JSON.stringify([product,kg]);
 const rows=productBarcodeRows035(product);
 assert.deepEqual(rows.map(x=>x.barcode),['111','112','211','212','311','312','411']);
 assert.deepEqual(rows.map(x=>x.label),['دانە','دانە','کارتۆن','کارتۆن','دەستە','دەستە','سێت']);
 assert.deepEqual(rows.map(x=>x.primary),[true,false,true,false,true,false,true]);
 assert.equal(rows.every(x=>x.status==='unverified'),true);
 assert.equal(productBarcodeRows035(kg)[0].mode,'kg');
 assert.equal(productBarcodeRows035(null).length,0);
 assert.deepEqual(lifecycleSummary035(product),{
  status:'unverified',verifiedActiveCodes:null,registeredCodes:7,
  canDeactivate:false,canRestore:false,canSubmitRequest:false
 });
 assert.equal(lifecycleSummary035(null).status,'no_selection');
 assert.equal(JSON.stringify([product,kg]),before,'Read-only lifecycle must not mutate products');
});

test('Canva 045 original stock approval source geometry and fail-closed React routing',()=>{
 const g=JSON.parse(read('design/canva-original-screen-045-geometry.json'));
 const source=read('src/components/CanvaStockApprovals045.tsx');
 const rule=read('src/utils/stockApproval045.ts');
 const stock=read('src/components/InventoryStockView.tsx');
 const reconcile=read('src/components/CanvaStockReconcile043.tsx');
 const style=read('src/components/canvaStockOverview036.css');
 assert.equal(g.design_id,layout.screens[44].id);
 assert.deepEqual(g.canvas,{width:1920,height:1080});
 assert.equal(g.element_count,52);
 assert.equal(new Set(g.elements.map(e=>e.id)).size,52);
 assert.match(source,/number="045"/);
 assert.match(source,/پەسەندکردنی کردارەکانی کۆگا/);
 assert.match(source,/ناسنامەی داواکاری، کاڵا یان کارمەند/);
 assert.match(source,/disabled=\{!authorized\|\|!selected\}/);
 assert.match(source,/سەرچاوەی داواکارییە پەسەندکراوەکانی کۆگا هێشتا پەیوەست نییە/);
 assert.match(rule,/connected: false, records: \[\]/);
 assert.match(rule,/canDecideStockApproval045/);
 assert.doesNotMatch(source,/adjustStock\(|updateProduct\(|deleteProduct\(|approveRequest\(/);
 assert.match(stock,/activeTab === 'approvals'/);
 assert.match(reconcile,/navigateTo\('stock', 'approvals', 'stock-stack'\)/);
 assert.match(style,/data-canva-screen="045"/);
});
test('Canva 045 never invents manager approvals or pending requests from a local stock count draft',async()=>{
 const {disconnectedStockApprovalFeed045,filterStockApproval045,canDecideStockApproval045}
  =await import('../src/utils/stockApproval045.ts');
 const feed=disconnectedStockApprovalFeed045();
 assert.equal(feed.connected,false);
 assert.deepEqual(feed.records,[]);
 for(const status of ['pending','approved','rejected']){
  assert.deepEqual(filterStockApproval045(feed,'ئاوی کانی چنار',status),[]);
 }
 const fake={connected:true,records:[
  {id:'req-1',subject:'ئاوی کانی چنار',action:'ڕاستکردنەوە',
   requestedBy:'کارمەند',requestedAt:'2026-11-11',reason:'ژماردن',status:'pending'},
  {id:'req-2',subject:'ڕۆن',action:'وەرگرتن',
   requestedBy:'بەڕێوەبەر',requestedAt:'2026-11-10',reason:'کڕین',status:'approved'}
 ]};
 assert.deepEqual(filterStockApproval045(fake,'ئاوی', 'pending').map(x=>x.id),['req-1']);
 assert.equal(filterStockApproval045(fake,'ڕۆن','pending').length,0);
 assert.equal(filterStockApproval045(fake,'ڕۆن','approved').length,1);
 assert.equal(filterStockApproval045(fake,'','rejected').length,0);
 assert.equal(canDecideStockApproval045('manager','req-1'),false);
 assert.equal(canDecideStockApproval045('cashier','req-1'),false);
});

test('Canva 046 original 48 text boxes and safe supplier directory integration',()=>{
 const g=JSON.parse(read('design/canva-original-screen-046-geometry.json'));
 const view=read('src/components/CanvaSuppliers046.tsx');
 const util=read('src/utils/supplierDirectory046.ts');
 assert.equal(g.design_id,layout.screens[45].id);
 assert.deepEqual(g.canvas,{width:1920,height:1080});
 assert.equal(g.element_count,48);
 assert.equal(new Set(g.elements.map(x=>x.id)).size,48);
 assert.match(view,/data-canva-screen="046"/);
 assert.match(view,/کاشێر: تەنها بینین/);
 assert.match(view,/disabled=\{!canWriteSupplier046\(\)\}/);
 assert.match(util,/filter!=='all'\)return \[\]/);
 assert.doesNotMatch(view,/addSupplier\(|recordSupplierPayment\(|updateSupplier\(/);
 assert.match(read('src/App.tsx'),/currentView === 'suppliers' && <CanvaSuppliers046/);
 assert.match(read('src/components/SectionWorkspace.tsx'),/sectionId==="supplier-building"/);
 assert.match(read('src/components/canvaSuppliers046.css'),/canva-supplier-layout/);
});
test('Canva 046 uses real DEMO supplier values and no invented active flags',async()=>{
 const {supplierRows046,canWriteSupplier046,trustedSupplierDebt046}=await import('../src/utils/supplierDirectory046.ts');
 const data=[
  {id:'sup-1',name:'کۆمپانیای ئەلبورز',phone:'0750 888 9900',address:'هەولێر',balanceDebt:450000},
  {id:'sup-2',name:'شیرەمەنی چیا',phone:'0770 111 2233',address:'هەولێر',balanceDebt:0}
 ];
 const before=JSON.stringify(data);
 assert.deepEqual(supplierRows046(data,'','all').map(x=>x.status),['unverified','unverified']);
 assert.equal(supplierRows046(data,'sup-2','all')[0].debt,0);
 assert.equal(supplierRows046(data,'0770 111','all').length,1);
 assert.equal(supplierRows046(data,'ئەلبورز','all')[0].debt,450000);
 assert.deepEqual(supplierRows046(data,'','active'),[]);
 assert.deepEqual(supplierRows046(data,'','inactive'),[]);
 assert.equal(canWriteSupplier046('manager'),false);
 assert.equal(trustedSupplierDebt046(-5),null);
 assert.equal(JSON.stringify(data),before);
});

test('Canva 047 authentic source geometry and home purchase request route',()=>{
 const g=JSON.parse(read('design/canva-original-screen-047-geometry.json'));
 const view=read('src/components/CanvaPurchaseRequest047.tsx');
 const rules=read('src/utils/purchaseRequest047.ts');
 const section=read('src/components/SectionWorkspace.tsx');
 const css=read('src/components/canvaPurchaseRequest047.css');
 assert.equal(g.design_id,layout.screens[46].id);
 assert.equal(g.element_count,45);
 assert.deepEqual(g.canvas,{width:1920,height:1080});
 assert.equal(new Set(g.elements.map(x=>x.id)).size,45);
 assert.match(view,/data-canva-screen="047"/);
 assert.match(view,/data-demo-only="true"/);
 assert.match(view,/کاڵاکانی پێویست بۆ کڕین/);
 assert.match(view,/بڕی داواکراو نابێت کەمتر لە سفر بێت/);
 assert.match(view,/ناردن بۆ پەسەندکردن/);
 assert.match(view,/sessionStorage\.setItem/);
 assert.match(view,/canva-purchase-line-supplier/);
 assert.match(view,/className="canva-purchase-submit" disabled/);
 assert.doesNotMatch(view,/receiveStock\(|addAuditLog\(|setStoreState\(|recordSupplierPayment\(/);
 assert.match(section,/sectionId==="purchase-order"/);
 assert.match(rules,/purchaseUnitByScan047/);
 assert.match(css,/canva-purchase-layout/);
});
test('Canva 047 safe draft rejects zero, bad formats, unknown suppliers and stale product IDs',async()=>{
 const {getPurchaseUnits047,preparePurchaseLine047,addPurchaseDraftLine047,
  summarizePurchaseDraft047,readPurchaseDraft047,purchaseUnitByScan047,findPurchaseProducts047}
  =await import('../src/utils/purchaseRequest047.ts');
 const product={id:'prod-1',name:'ئاوی کانی چنار 500ml',base_unit:'unit',
   unit_barcode:'111',unit_alias_barcodes:['112'],carton:{barcode:'211',alias_barcodes:['212']},
   extra_packs:[{kind:'bundle',barcode:'311',alias_barcodes:['312']}]};
 const weighted={id:'prod-2',name:'تەماتە',base_unit:'kg',unit_barcode:'511',unit_alias_barcodes:[],carton:null,extra_packs:[]};
 const products=[product,weighted],suppliers=[{id:'sup-1',name:'دابینکەر',phone:'0770',balanceDebt:0}];
 const original=JSON.stringify({products,suppliers});
 assert.deepEqual(getPurchaseUnits047(product).map(x=>x.value),['unit','carton','bundle']);
 assert.deepEqual(getPurchaseUnits047(weighted).map(x=>x.value),['kg']);
 assert.equal(purchaseUnitByScan047(product,'212'),'carton');
 assert.equal(purchaseUnitByScan047(product,'112'),'unit');
 assert.equal(findPurchaseProducts047(products,'311')[0].id,'prod-1');
 for(const qty of ['0','-1','1.5','1000001','Infinity','1e6']){
   assert.equal(preparePurchaseLine047(products,suppliers,'prod-1','carton',qty,'sup-1').ok,false);
 }
 assert.equal(preparePurchaseLine047(products,suppliers,'prod-1','carton','2','missing').ok,false);
 assert.equal(preparePurchaseLine047(products,suppliers,'deleted','unit','1','sup-1').ok,false);
 assert.equal(preparePurchaseLine047(products,suppliers,'prod-2','unit','1','sup-1').ok,false);
 assert.equal(preparePurchaseLine047(products,suppliers,'prod-2','kg','0.7555','sup-1').ok,false);
 const one=preparePurchaseLine047(products,suppliers,'prod-1','carton','2','sup-1');
 assert.equal(one.ok,true);
 const merged=addPurchaseDraftLine047([one.line],one.line);
 assert.equal(merged.ok,true);
 assert.equal(merged.lines.length,1);
 assert.equal(merged.lines[0].quantity,4);
 assert.equal(summarizePurchaseDraft047(merged.lines).quantityText,'کارتۆن: 4');
 assert.equal(summarizePurchaseDraft047(merged.lines).itemCount,1,'Product count uses unique product IDs');
 const kg=preparePurchaseLine047(products,suppliers,'prod-2','kg','0.75','sup-1');
 assert.equal(kg.ok,true);
 const all=addPurchaseDraftLine047(merged.lines,kg.line);
 assert.equal(all.ok,true);
 assert.equal(all.lines.length,2);
 assert.equal(summarizePurchaseDraft047(all.lines).itemCount,2);
 assert.match(summarizePurchaseDraft047(all.lines).quantityText,/کیلۆ: 0.75/);
 assert.equal(readPurchaseDraft047(JSON.stringify(all.lines),products,suppliers).length,2);
 assert.deepEqual(readPurchaseDraft047(JSON.stringify(all.lines),products,[]),[]);
 assert.deepEqual(readPurchaseDraft047(JSON.stringify([{...one.line,productId:'missing'}]),products,suppliers),[]);
 assert.deepEqual(readPurchaseDraft047('not json',products,suppliers),[]);
 assert.equal(JSON.stringify({products,suppliers}),original,'Draft must never mutate source data');
});

test('Canva 049 authentic text geometry, route and fail-closed receiving preview',()=>{
 const g=JSON.parse(read('design/canva-original-screen-049-geometry.json'));
 const ui=read('src/components/CanvaPurchaseReceiving049.tsx');
 const logic=read('src/utils/receivingPreview049.ts');
 const section=read('src/components/SectionWorkspace.tsx');
 const order=read('src/components/CanvaPurchaseOrder048.tsx');
 assert.equal(g.design_id,layout.screens[48].id);
 assert.deepEqual(g.canvas,{width:1920,height:1080});
 assert.equal(g.element_count,45);
 assert.equal(new Set(g.elements.map(x=>x.id)).size,45);
 assert.match(ui,/number="049"/);
 assert.match(ui,/وەرگرتنی کڕین لە دابینکەر/);
 assert.match(ui,/ناسنامەی فەرمانی کڕین/);
 assert.match(ui,/پشتڕاستکردنەوەی وەرگرتن/);
 assert.match(ui,/className="stock-036-primary" disabled/);
 assert.match(ui,/sessionStorage\.setItem/);
 assert.match(section,/state\.subtab==="receiving-preview"/);
 assert.match(order,/پێداچوونەوەی وەرگرتن — ڕەشنووس/);
 assert.match(read('src/components/canvaReceiving049.css'),/data-canva-screen="049"/);
 assert.doesNotMatch(ui,/receiveStock\(|recordSupplierPayment\(|updateProduct\(|addAuditLog\(/);
 assert.match(logic,/receivingFactor049/);
});
test('Canva 049 converts base units, checks under/over receipts and rejects stale drafts',async()=>{
 const {receivingFactor049,receivingDifference049,receivingQuantity049,
  checkedReceivingRows049,receivingSourceSignature049,loadReceivingDraft049}
  =await import('../src/utils/receivingPreview049.ts');
 const p={id:'a',name:'ئاوی کانی چنار',base_unit:'unit',unit_barcode:'a1',
  unit_alias_barcodes:[],carton:{units_per_carton:24,barcode:'a24'},
  extra_packs:[{kind:'bundle',units_per_pack:12,barcode:'a12'}]};
 const kg={id:'b',name:'تەماتە',base_unit:'kg',unit_barcode:'b1',
   unit_alias_barcodes:[],carton:null,extra_packs:[]};
 const first={key:'a::carton::sup-1',productId:'a',supplierId:'sup-1',supplierName:'دابینکەر',
  productName:p.name,barcode:'a24',unit:'carton',quantity:2};
 const second={key:'b::kg::sup-1',productId:'b',supplierId:'sup-1',supplierName:'دابینکەر',
  productName:kg.name,barcode:'b1',unit:'kg',quantity:1.5};
 const ls=[first,second],ps=[p,kg],snapshot=JSON.stringify({ls,ps});
 assert.equal(receivingFactor049(p,'carton'),24);
 assert.equal(receivingFactor049(p,'bundle'),12);
 assert.equal(receivingFactor049(kg,'kg'),1);
 assert.equal(receivingFactor049(kg,'carton'),null);
 assert.equal(receivingQuantity049('1.5','carton'),null);
 assert.equal(receivingQuantity049('-1','kg'),null);
 assert.equal(receivingQuantity049('0','carton'),0);
 assert.equal(receivingQuantity049('0.1255','kg'),null);
 assert.equal(receivingDifference049(first,p,'1').orderedBase,48);
 assert.equal(receivingDifference049(first,p,'1').receivedBase,24);
 assert.equal(receivingDifference049(first,p,'1').missingBase,24);
 assert.equal(receivingDifference049(first,p,'3').missingBase,-24);
 assert.equal(receivingDifference049(first,p,'2').state,'equal');
 assert.equal(receivingDifference049(first,p,'1.5').state,'invalid');
 assert.equal(receivingDifference049(second,kg,'1.25').missingBase,0.25);
 assert.equal(receivingDifference049(second,kg,'').state,'unchecked');
 assert.equal(checkedReceivingRows049(ls,ps,{[first.key]:{quantity:'1',expiry:''}}).checked,1);
 assert.equal(checkedReceivingRows049(ls,ps,{[first.key]:{quantity:'1.5',expiry:''}}).invalid,true);
 const saved={sourceSignature:receivingSourceSignature049(ls),supplierId:'sup-1',invoice:'DEMO-1',
  rows:{[first.key]:{quantity:'1',expiry:'2027-06-01'}}};
 assert.equal(loadReceivingDraft049(JSON.stringify(saved),ls,ps).rows[first.key].quantity,'1');
 assert.deepEqual(loadReceivingDraft049(JSON.stringify(saved),[first],ps).rows,{});
 assert.deepEqual(loadReceivingDraft049(JSON.stringify({...saved,
  rows:{[first.key]:{quantity:'1.2',expiry:'2027-06-01'}}}),ls,ps).rows,{});
 assert.equal(JSON.stringify({ls,ps}),snapshot);
});

test('Canva 054 authentic 47 purchase approval text boxes and read-only linked route',()=>{
 const source=JSON.parse(read('design/canva-original-screen-054-geometry.json'));
 const screen=read('src/components/CanvaPurchaseApprovals054.tsx');
 const guard=read('src/utils/purchaseApprovals054.ts');
 const router=read('src/components/SectionWorkspace.tsx');
 const order=read('src/components/CanvaPurchaseOrder048.tsx');
 const css=read('src/components/canvaPurchaseApprovals054.css');
 assert.equal(source.design_id,layout.screens[53].id);
 assert.equal(source.element_count,47);
 assert.deepEqual(source.canvas,{width:1920,height:1080});
 assert.equal(new Set(source.elements.map(x=>x.id)).size,47);
 assert.match(screen,/number="054"/);
 assert.match(screen,/پەسەندکردنی داواکارییەکانی کڕین/);
 assert.match(screen,/ناسنامە، دابینکەر یان جۆری داواکاری/);
 assert.match(screen,/ڕەتکردنەوە بە هۆکار/);
 assert.match(screen,/disabled=\{!selected\|\|!canDecide\}/);
 assert.match(guard,/authenticated:false,connected:false,requests:\[\]/);
 assert.doesNotMatch(screen,/addProduct\(|updateProduct\(|receiveStock\(|approveRequest\(|recordSupplierPayment\(/);
 assert.match(router,/state\.subtab==="purchase-approvals"/);
 assert.match(order,/navigateTo\('suppliers','purchase-approvals','purchase-order'\)/);
 assert.match(css,/data-canva-screen="054"/);
});
test('Canva 054 does not call local purchase draft a real pending request and fails closed',async()=>{
 const {disconnectedPurchaseApproval054,visiblePurchaseApprovals054,
   pendingPurchaseApprovals054,canDecidePurchaseApproval054}
   =await import('../src/utils/purchaseApprovals054.ts');
 const feed=disconnectedPurchaseApproval054();
 assert.equal(feed.authenticated,false);
 assert.equal(feed.connected,false);
 assert.deepEqual(feed.requests,[]);
 assert.equal(pendingPurchaseApprovals054(feed),null);
 for(const status of ['pending','approved','rejected'])
  assert.deepEqual(visiblePurchaseApprovals054(feed,'water',status),[]);
 assert.equal(canDecidePurchaseApproval054('manager','purchase-1'),false);
 assert.equal(canDecidePurchaseApproval054('owner','purchase-1'),false);
 const sample={id:'req-01',supplier:'کۆمپانیای ئەلبورز',
   requestType:'کڕین',requester:'کارمەند',requestedAt:'2026-11-12',
   amountIqd:25000,previousAmountIqd:23000,proposedAmountIqd:25000,
   status:'pending',reason:null};
 const unsourced={authenticated:false,connected:true,requests:[sample]};
 const unplugged={authenticated:true,connected:false,requests:[sample]};
 assert.deepEqual(visiblePurchaseApprovals054(unsourced,'pending',''),[]);
 assert.deepEqual(visiblePurchaseApprovals054(unplugged,'pending',''),[]);
 const trusted={authenticated:true,connected:true,requests:[
   sample,{...sample,id:'req-02',requestType:'گەڕاندنەوە',status:'rejected'}
 ]};
 assert.equal(pendingPurchaseApprovals054(trusted),1);
 assert.deepEqual(visiblePurchaseApprovals054(trusted,'pending','ئەلبورز').map(x=>x.id),['req-01']);
 assert.deepEqual(visiblePurchaseApprovals054(trusted,'rejected','گەڕاندنەوە').map(x=>x.id),['req-02']);
 assert.equal(visiblePurchaseApprovals054(trusted,'approved','').length,0);
 assert.equal(canDecidePurchaseApproval054('manager','req-01'),false);
});

test('Canva 055 original supplier invoice difference geometry and fail-closed navigation',()=>{
 const geometry=JSON.parse(read('design/canva-original-screen-055-geometry.json'));
 const screen=read('src/components/CanvaInvoiceDifferences055.tsx');
 const policy=read('src/utils/invoiceDifferences055.ts');
 const route=read('src/components/SectionWorkspace.tsx');
 const receipt=read('src/components/CanvaSupplierRecords.tsx');
 const receiving=read('src/components/CanvaPurchaseReceiving049.tsx');
 const css=read('src/components/canvaInvoiceDifferences055.css');
 assert.equal(geometry.design_id,layout.screens[54].id);
 assert.deepEqual(geometry.canvas,{width:1920,height:1080});
 assert.equal(geometry.element_count,48);
 assert.equal(new Set(geometry.elements.map(x=>x.id)).size,48);
 assert.match(screen,/number="055"/);
 assert.match(screen,/جیاوازیی پسووڵەی کڕین/);
 assert.match(screen,/ژمارەی فەرمانی کڕین — پشتڕاست نەکراوە/);
 assert.match(screen,/ڕیزی ناهاوتا/);
 assert.match(screen,/disabled=\{!canPostInvoiceReview055\(\)\}/);
 assert.match(screen,/sessionStorage\.setItem\(reviewKey/);
 assert.match(policy,/canPostInvoiceReview055/);
 assert.doesNotMatch(screen,/receiveStock\(|recordSupplierPayment\(|adjustStock\(|updateProduct\(|submitPurchaseOrder\(/);
 assert.match(route,/state\.subtab==="invoice-differences"/);
 assert.match(receipt,/navigateTo\('suppliers', 'invoice-differences', 'purchase-order'\)/);
 assert.match(receiving,/navigateTo\('suppliers','invoice-differences','purchase-order'\)/);
 assert.match(css,/data-canva-screen="055"/);
});
test('Canva 055 compares only complete validated DEMO price and quantity data',async()=>{
 const {price055,loadOrderPrices055,compareInvoiceLine055,summarizeInvoiceDifferences055,
  emptyInvoiceReview055,loadInvoiceReview055,reviewSignature055,canPostInvoiceReview055}
  =await import('../src/utils/invoiceDifferences055.ts');
 const p={id:'p',name:'ئاوی کانی چنار',base_unit:'unit',unit_barcode:'a1',
  carton:{units_per_carton:24,barcode:'a24'},extra_packs:[]};
 const k={id:'kg',name:'تەماتە',base_unit:'kg',unit_barcode:'k1',extra_packs:[]};
 const line={key:'p::carton::sup-1',productId:'p',productName:p.name,
  supplierId:'sup-1',supplierName:'دابینکەر',unit:'carton',barcode:'a24',quantity:2};
 const kg={key:'kg::kg::sup-1',productId:'kg',productName:k.name,
  supplierId:'sup-1',supplierName:'دابینکەر',unit:'kg',barcode:'k1',quantity:1.5};
 const before=JSON.stringify({p,k,line,kg});
 assert.equal(price055('2500'),2500);
 assert.equal(price055('0'),null);
 assert.equal(price055('1.20'),null);
 assert.equal(price055('1e6'),null);
 assert.equal(price055('999999999999999'),null);
 assert.equal(price055('-1'),null);
 assert.deepEqual(loadOrderPrices055(JSON.stringify({[line.key]:'2500',deleted:'4500'}),[line]),{[line.key]:'2500'});
 assert.deepEqual(loadOrderPrices055('not json',[line]),{});
 const blank=compareInvoiceLine055(line,p,'','2500','');
 assert.equal(blank.state,'incomplete');
 assert.equal(blank.amountDifferenceIqd,null,'Unknown price must not be silently zero');
 assert.equal(summarizeInvoiceDifferences055([blank]).monetaryDifference,null);
 assert.equal(summarizeInvoiceDifferences055([blank]).mismatchCount,null);
 const fewer=compareInvoiceLine055(line,p,'1','2500','3000');
 assert.equal(fewer.state,'mismatch');
 assert.equal(fewer.quantityDifference,-24,'Carton factor 24 converts to base units');
 assert.equal(fewer.amountDifferenceIqd,-2000,'Invoice draft less full order draft');
 assert.equal(summarizeInvoiceDifferences055([fewer]).mismatchCount,1);
 assert.equal(summarizeInvoiceDifferences055([fewer]).monetaryDifference,-2000);
 const equal=compareInvoiceLine055(line,p,'2','2500','2500');
 assert.equal(equal.state,'matched');
 assert.equal(equal.amountDifferenceIqd,0);
 assert.equal(summarizeInvoiceDifferences055([equal]).mismatchCount,0);
 assert.equal(compareInvoiceLine055(line,p,'1.5','2500','3000').state,'invalid');
 const weighted=compareInvoiceLine055(kg,k,'1.25','1000','1100');
 assert.equal(weighted.quantityDifference,-0.25);
 assert.equal(weighted.amountDifferenceIqd,-125);
 assert.equal(compareInvoiceLine055(kg,k,'1.2555','1000','1100').state,'invalid');
 const partial=compareInvoiceLine055(kg,k,'1.25',undefined,'1100');
 assert.equal(partial.state,'mismatch');
 assert.equal(partial.amountDifferenceIqd,null);
 assert.equal(summarizeInvoiceDifferences055([fewer,partial]).monetaryDifference,null);
 assert.equal(summarizeInvoiceDifferences055([fewer,partial]).mismatchCount,2,
  'Both quantities differ even though the second price is still unknown');
 const saved={...emptyInvoiceReview055([line]),supplierId:'sup-1',invoice:'DEMO-12',
  prices:{[line.key]:'3000'},reason:'short'};
 assert.equal(loadInvoiceReview055(JSON.stringify(saved),[line]).reason,'short');
 assert.deepEqual(loadInvoiceReview055(JSON.stringify(saved),[kg]).prices,{});
 assert.deepEqual(loadInvoiceReview055(JSON.stringify({...saved,prices:{[line.key]:'-200'}}),[line]).prices,{});
 assert.notEqual(reviewSignature055([line]),reviewSignature055([kg]));
 assert.equal(canPostInvoiceReview055('manager'),false);
 assert.equal(JSON.stringify({p,k,line,kg}),before,'Never alter source catalog or supplier records');
});

test('Canva 059 original customer debt screen and safe route preserve actual balances',()=>{
 const geometry=JSON.parse(read('design/canva-original-screen-059-geometry.json'));
 const screen=read('src/components/CanvaCustomerDebt059.tsx');
 const rules=read('src/utils/customerDebtDraft059.ts');
 const workspace=read('src/components/CanvaCustomerWorkspace.tsx');
 const css=read('src/components/canvaCustomerDebt059.css');
 assert.equal(geometry.design_id,layout.screens[58].id);
 assert.deepEqual(geometry.canvas,{width:1920,height:1080});
 assert.equal(geometry.element_count,29);
 assert.equal(new Set(geometry.elements.map(x=>x.id)).size,29);
 assert.match(screen,/number="059"/);
 assert.match(screen,/زیادکردنی قەرز بۆ کڕیار/);
 assert.match(screen,/پاشەکەوتکردنی ڕەشنووس/);
 assert.match(screen,/disabled=\{!canSubmitCustomerDebt059\(\)\}/);
 assert.match(screen,/sessionStorage\.setItem\(storageKey/);
 assert.match(screen,/data-demo-only="true"/);
 assert.match(workspace,/'059': \['debt-add', 'debt-book'\]/);
 assert.match(workspace,/mode === 'debt-add' \? '059'/);
 assert.match(workspace,/case '059': return <CanvaCustomerDebt059/);
 assert.match(css,/data-canva-screen="059"/);
 assert.match(rules,/canSubmitCustomerDebt059/);
 assert.doesNotMatch(screen,/setCustomers\(|recordDebtRepayment\(|addCustomer\(|completeCheckout\(|addAuditLog\(/);
});
test('Canva 059 validates positive IQD, stale snapshots, credit limits and stable non-posted draft', async()=>{
 const {parseCustomerDebtAmount059,checkCustomerDebt059,readCustomerDebtDraft059,
  canSubmitCustomerDebt059}=await import('../src/utils/customerDebtDraft059.ts');
 const customer={id:'cust-1',name:'کڕیار',phone:'0750',balanceDebt:45000,creditLimit:46000,createdAt:'2026-10-01'};
 const snapshot=JSON.stringify(customer);
 assert.equal(parseCustomerDebtAmount059('2500'),2500);
 for(const invalid of ['','0','-1','1.5','1e3','00010','9999999999999','1000000001','١٠٠٠']){
  assert.equal(parseCustomerDebtAmount059(invalid),null,invalid);
 }
 const verified=checkCustomerDebt059(customer,'2500','RCP-059','تێبینی');
 assert.equal(verified.valid,true);
 assert.equal(verified.currentBalanceIqd,45000);
 assert.equal(verified.previewBalanceIqd,47500);
 assert.equal(verified.exceedsKnownLimit,true);
 assert.equal(checkCustomerDebt059(customer,'2500','','').valid,false);
 assert.equal(checkCustomerDebt059(undefined,'2500','INV-12','').valid,false);
 const noLimit=checkCustomerDebt059({...customer,creditLimit:undefined},'2500','INV-12','');
 assert.equal(noLimit.valid,true);
 assert.equal(noLimit.limitKnown,false);
 assert.equal(noLimit.exceedsKnownLimit,false);
 const invalidBalance=checkCustomerDebt059({...customer,balanceDebt:NaN},'2500','INV-12','');
 assert.equal(invalidBalance.valid,false);
 const draft={draftId:'DRAFT-550e8400-e29b-41d4-a716-446655440000',customerId:'cust-1',
  balanceAtSaveIqd:45000,amountIqd:2500,reference:'RCP-059',note:'تێبینی',
  savedAt:'2026-11-12T10:00:00.000Z',status:'local-demo-draft'};
 assert.deepEqual(readCustomerDebtDraft059(JSON.stringify(draft),[customer]),draft);
 assert.equal(readCustomerDebtDraft059(JSON.stringify(draft),[{...customer,balanceDebt:44000}]),null);
 assert.equal(readCustomerDebtDraft059(JSON.stringify({...draft,amountIqd:0}),[customer]),null);
 assert.equal(readCustomerDebtDraft059(JSON.stringify({...draft,draftId:'rcp-1'}),[customer]),null);
 assert.equal(readCustomerDebtDraft059('not json',[customer]),null);
 assert.equal(canSubmitCustomerDebt059('manager'),false);
 assert.equal(canSubmitCustomerDebt059('owner'),false);
 assert.equal(JSON.stringify(customer),snapshot,'Local preview must not mutate actual customer debt');
});
