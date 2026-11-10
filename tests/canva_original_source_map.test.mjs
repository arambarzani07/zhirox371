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
