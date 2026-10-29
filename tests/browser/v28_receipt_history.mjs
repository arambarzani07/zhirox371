import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const fixture=readFileSync('tests/browser/qa_supabase_fixture.js','utf8')+readFileSync('tests/browser/qa_v22_fixture.js','utf8');
const seed=`(()=>{const q=window.__retailQA;for(let i=1;i<=123;i++)q.sales.push({id:'eeeeeeee-eeee-4eee-8eee-'+String(i).padStart(12,'0'),store_id:q.store.id,receipt_no:i,total_minor:1000,discount_minor:0,cash_received_minor:1000,change_due_minor:0,status:'posted',refunded:i===1,returned_minor_total:i===1?1000:0,created_at:new Date(Date.now()-(124-i)*1000).toISOString()});q.sales.push({...q.sales[0],id:'foreign',store_id:'other-store',receipt_no:9999});})();`;
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1190,height:850}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'/* UI QA only */'}));await page.addInitScript({content:fixture+seed});
try{
 await page.goto((process.env.PC_PREVIEW_ORIGIN||'http://127.0.0.1:8765')+'/operations.html?view=receipts');
 await page.waitForFunction(()=>document.querySelector('#receipts-page-info')?.textContent==='1–50 / 123');
 assert.equal(await page.locator('#receipts-list tbody tr').count(),50);
 assert.match(await page.locator('#receipts-list').innerText(),/#000123/);
 await page.locator('#receipts-next').click();await page.waitForFunction(()=>document.querySelector('#receipts-page-info')?.textContent==='51–100 / 123');
 await page.locator('#receipts-next').click();await page.waitForFunction(()=>document.querySelector('#receipts-page-info')?.textContent==='101–123 / 123');
 assert.equal(await page.locator('#receipts-list tbody tr').count(),23);assert.equal(await page.locator('#receipts-next').isDisabled(),true);
 assert.equal(await page.locator('#receipts-metric-count').innerText(),'23');assert.match(await page.locator('#receipts-summary').innerText(),/ئەم پەڕەیە/);
 await page.locator('#receipts-search').fill('000001');await page.waitForFunction(()=>document.querySelector('#receipts-page-info')?.textContent==='1–1 / 1');
 assert.match(await page.locator('#receipts-list').innerText(),/#000001/);assert.doesNotMatch(await page.locator('#receipts-list').innerText(),/#009999/);
 await page.locator('#receipts-search').fill('invalid');await page.waitForFunction(()=>document.querySelector('#receipts-msg')?.classList.contains('error'));
 assert.equal(await page.locator('#receipts-list table').count(),0);assert.equal(await page.locator('#receipt-detail').isVisible(),false);
 await page.locator('#receipts-search').fill('');await page.locator('#receipts-status-filter').selectOption('refunded');
 await page.waitForFunction(()=>document.querySelector('#receipts-page-info')?.textContent==='1–1 / 1');assert.match(await page.locator('#receipts-list').innerText(),/#000001/);
 await page.evaluate(()=>{window.__retailQA.receiptReadError={code:'42501',message:'denied'};});await page.locator('#receipts-refresh').click();
 await page.waitForFunction(()=>document.querySelector('#receipts-msg')?.classList.contains('error'));assert.equal(await page.locator('#receipts-list table').count(),0);
 await page.locator('#receipts-refresh').click();await page.waitForFunction(()=>document.querySelector('#receipts-page-info')?.textContent==='1–1 / 1');
 await page.locator('#logout').click();await page.locator('#login-panel').waitFor({state:'visible'});assert.equal(await page.locator('#receipts-list table').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS V28: all server receipt pages, exact old receipt lookup, scoped totals, filters, failed reads and logout cleanup');
}finally{await browser.close();}
