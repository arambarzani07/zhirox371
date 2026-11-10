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
  assert.match(source,/alias_barcodes: \[\.\.\.pack.alias_barcodes/);
  assert.match(source,/alias_barcodes: \[\.\.\.p.carton.alias_barcodes/);
  assert.match(style,/\.canva-barcode-024 \.canva-barcode-layout/);
});
