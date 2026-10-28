import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{chromium}from'playwright';
const fixture=readFileSync('tests/browser/qa_supabase_fixture.js','utf8')+readFileSync('tests/browser/qa_v22_fixture.js','utf8');
const origin=process.env.PC_PREVIEW_ORIGIN||'http://127.0.0.1:8765';const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1190,height:850}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'/* isolated fixture */'}));await page.addInitScript({content:fixture});
try{
 for(let m=0;m<12;m++)for(let s=0;s<4;s++){
  await page.goto(origin+'/index.html');await page.locator(`[data-module="${m}"]`).click();
  await page.locator(`[data-sub="${s}"]`).click();await page.waitForURL(url=>!url.pathname.endsWith('/index.html'));
  await page.locator('.system-nav').waitFor({state:'visible'});
  assert.equal(await page.locator('.system-nav > [data-system-group]').count(),12,`main navigation ${m}/${s}`);
  assert.ok(await page.locator('main h1').innerText());
  if(page.url().includes('modules.html'))assert.match(await page.locator('#module-detail').innerText(),/هێشتا جێبەجێ نەکراوە/);
 }
 console.log('PASS V24: all 12 Home cards and 48 destinations reach the shared PC shell, including explicit unfinished modules');
 await page.goto(origin+'/operations.html?view=cash');await page.locator('#cash-panel').waitFor({state:'visible'});
 await page.locator('[data-tab=receipts]').click();assert.equal(await page.locator('.system-nav .system-current').getAttribute('data-system-group'),'cash');
 await page.locator('[data-tab=stock]').click();assert.equal(await page.locator('.system-cash-subtabs').isVisible(),false);
 await page.goto(origin+'/workspace.html?view=list');await page.locator('#list-panel').waitFor({state:'visible'});await page.locator('#import-btn').click();
 await page.locator('#import-text').fill('name,barcode,price,stock_quantity\nMilk,00123,1500,10000000');await page.locator('#import-submit').click();
 assert.match(await page.locator('#import-status').innerText(),/هاوردەی بڕی کۆگا/);
 assert.equal(await page.evaluate(()=>window.__retailQA.called.filter(x=>x.name==='retail_create_product').length),0);
 await page.locator('#import-text').fill('name,barcode,price\nMilk,00123,1500');await page.locator('#import-submit').click();
 await page.waitForFunction(()=>window.__retailQA.called.some(x=>x.name==='retail_create_product'));
 const calls=await page.evaluate(()=>window.__retailQA.called.filter(x=>x.name==='retail_create_product'));assert.equal(calls.length,1);assert.equal(calls[0].args.p_barcode,'00123');assert.equal(calls[0].args.p_name,'Milk');
 assert.deepEqual(errors,[]);console.log('PASS V24: shared nav selection and header-aware CSV preflight; no header product or silent stock loss');
}finally{await browser.close()}
