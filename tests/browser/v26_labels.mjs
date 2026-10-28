import {readFileSync}from'node:fs';import assert from'node:assert/strict';import{chromium}from'playwright';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1190,height:900}}),origin=process.env.PC_PREVIEW_ORIGIN||'http://127.0.0.1:8765';
await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));await page.addInitScript({content:readFileSync('tests/browser/qa_supabase_fixture.js','utf8')+';window.__printCalls=0;window.print=()=>window.__printCalls++;'});
try{
 await page.goto(origin+'/workspace.html?view=prices&section=labels&batch=1');await page.locator('#prices-results [data-print-label]').first().click();await page.locator('#barcode-label-box').waitFor({state:'visible'});
 assert.ok(await page.locator('#label-barcode-svg').getAttribute('viewBox'),'SVG must scale its actual bars rather than clipping them');
 await page.locator('#label-queue-btn').click();await page.locator('#batch-label-list input').fill('3');await page.locator('#batch-prepare').click();await page.waitForFunction(()=>document.querySelectorAll('#batch-label-preview article').length===3);
 await page.evaluate(()=>window.__retailQA.products[0].price_minor=1750);
 await page.locator('#batch-print').click();await page.waitForFunction(()=>document.querySelector('#batch-message').textContent.includes('گۆڕدراوە'));
 assert.equal(await page.evaluate(()=>window.__printCalls),0);assert.equal(await page.locator('#batch-print').isDisabled(),true);
 await page.locator('#batch-prepare').click();await page.waitForFunction(()=>!document.querySelector('#batch-print').disabled);await page.locator('#batch-print').click();await page.waitForFunction(()=>window.__printCalls===1);
 assert.equal(await page.locator('#label-print-root article').count(),3);assert.match(await page.locator('#label-print-root').innerText(),/1,750/);
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('.viewport').isVisible(),false);assert.equal(await page.locator('#label-print-root').isVisible(),true);
 assert.deepEqual(await page.locator('#label-print-root article').first().evaluate(el=>[Math.round(el.getBoundingClientRect().width),Math.round(el.getBoundingClientRect().height)]),[189,113]);
 await page.emulateMedia({media:'screen'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));await page.locator('#logout').click();await page.locator('#auth-panel').waitFor({state:'visible'});assert.equal(await page.locator('#batch-label-list input').count(),0,'logout must remove another session’s queued data');
 console.log('PASS V26: batch copies, server refresh, stale-price blocking, standard barcode SVG and 50x30mm print-only output');
}finally{await browser.close();}
