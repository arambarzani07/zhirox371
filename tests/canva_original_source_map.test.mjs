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
