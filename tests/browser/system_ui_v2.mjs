import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.PC_PREVIEW_ORIGIN || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, locale: 'en-US' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const home = page.locator('[data-canva-screen="001"]');
const cards = home.locator('[data-canva-card]');
const drawer = home.locator('#locked-home-subcards');

async function checkLayout(width, height) {
  await page.setViewportSize({ width, height });
  const banner = await page.locator('.zhirox-canva-masthead').boundingBox();
  const app = await page.locator('#app').boundingBox();
  assert.ok(banner && app);
  assert.ok(Math.abs(banner.y + banner.height - app.y) < 3, 'workspace follows the store masthead');
  assert.ok(Math.abs(app.width - width) < 3 && Math.abs(app.y + app.height - height) < 3, 'native PC workspace');
  assert.equal(await page.locator('.system-double-strip,.system-primary-nav,.system-subnav').count(), 0);
}

try {
  await page.goto(origin);
  await home.waitFor();
  assert.equal(await home.getAttribute('dir'), 'rtl');
  assert.equal(await cards.count(), 12);
  for (const [width, height] of [[1920, 1080], [1366, 768]]) {
    await checkLayout(width, height);
    const positions = await cards.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      return [box.x, box.y, box.bottom];
    }));
    assert.ok(positions.every((position, index) => index % 4 === 0 || position[0] < positions[index - 1][0]));
    assert.ok(positions[0][1] < positions[4][1] && positions[4][1] < positions[8][1]);
    assert.ok(positions[11][2] <= height, 'all cards fit the desktop');
  }
  const visited = new Set();
  for (let index = 0; index < 12; index++) {
    for (let subIndex = 0; subIndex < 4; subIndex++) {
      await cards.nth(index).click();
      const subcards = drawer.locator('[data-section-target]');
      assert.equal(await subcards.count(), 4);
      const target = await subcards.nth(subIndex).getAttribute('data-section-target');
      await subcards.nth(subIndex).click();
      const screen = page.locator(`section.section-workspace[data-section-id="${target}"]`);
      await screen.waitFor();
      assert.ok(!visited.has(target), target);
      visited.add(target);
      assert.equal(await home.count(), 0);
      assert.equal(await page.locator('.system-double-strip,.system-primary-nav,.system-subnav').count(), 0);
      await page.keyboard.press('Escape');
      await home.waitFor();
    }
  }
  assert.equal(visited.size, 48);
  await cards.nth(0).click();
  await drawer.locator('[data-section-target="barcode-scan"]').click();
  const barcode = page.getByTestId('pos-barcode-input');
  await barcode.fill('2000000000018');
  await barcode.press('Enter');
  await page.locator('#cart-list tbody tr').getByText('ئاوی کانی چنار 500ml').waitFor();
  await page.locator('[data-canva-ticket="02"]').click();
  await page.getByRole('button', { name: /پسووڵە ڕاگیراوەکان/ }).click();
  const held = page.locator('[data-canva-screen="005"]');
  assert.equal(await held.locator('.canva-held-tickets__grid button').count(), 5);
  await held.getByRole('button', { name: 'چوون بۆ کاشێر' }).click();
  assert.equal(await page.locator('[data-canva-ticket="01"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#cart-list tbody tr').getByText('ئاوی کانی چنار 500ml').waitFor();
  await page.locator('.canva-pos-back-home').click();
  await home.waitFor();
  await cards.nth(0).click();
  await drawer.locator('[data-section-target="receipt"]').click();
  const receipts = page.locator('[data-canva-screen="003"]');
  await receipts.getByRole('searchbox').fill('DEMO-RCP-1001');
  await receipts.getByRole('button', { name: 'DEMO-RCP-1001', exact: true }).click();
  assert.ok(await receipts.locator('aside').getByText('DEMO-RCP-1001').isVisible());
  await receipts.getByRole('button', { name: 'پێشبینینی چاپ' }).click();
  const printPreview = page.locator('[data-canva-screen="010"]');
  await printPreview.waitFor();
  const paper = printPreview.locator('#thermal-receipt-ticket');
  assert.equal(await paper.locator('thead th').count(), 6);
  await printPreview.getByRole('radio', { name: '58 mm' }).check();
  assert.equal(await paper.evaluate(node => node.style.getPropertyValue('--zhirox-receipt-width')), '58mm');
  await page.emulateMedia({ media: 'print' });
  assert.ok(await paper.isVisible());
  assert.equal(await printPreview.getByRole('button', { name: 'دووبارە چاپ' }).isVisible(), false);
  assert.equal(await page.locator('.viewport').isVisible(), false);
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape');
  await receipts.getByRole('button', { name: 'گەڕاندنەوە', exact: true }).click();
  assert.equal(await page.locator('[data-canva-screen="004"] form select').first().inputValue(), 'DEMO-RCP-1001');
  assert.deepEqual(errors, []);
  console.log('PASS: Canva Home 12 cards and 48 destinations, native PC dimensions, no legacy navigation');
} finally {
  await browser.close();
}
