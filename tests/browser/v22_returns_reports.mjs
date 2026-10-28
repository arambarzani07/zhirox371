import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{chromium}from'playwright';
const fixture=readFileSync('tests/browser/qa_supabase_fixture.js','utf8')+readFileSync('tests/browser/qa_v22_fixture.js','utf8');
const seed=`(()=>{const q=window.__retailQA,now=new Date().toISOString();q.sessions.push({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',store_id:q.store.id,cashier_id:q.account.id,opening_cash_minor:10000,opened_at:now,status:'open'});q.sales.push({id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',store_id:q.store.id,receipt_no:1,total_minor:2900,discount_minor:100,status:'posted',cash_received_minor:2900,change_due_minor:0,created_at:now,refunded:false});q.saleItems.push({id:'ffffffff-ffff-4fff-8fff-ffffffffffff',store_id:q.store.id,sale_id:q.sales[0].id,product_id:q.products[0].id,quantity:3,unit_price_minor:1000,product_name_snapshot:q.products[0].name,package_type:'unit',package_barcode:q.barcodes[0].code,units_per_package:1,base_units:3,base_unit_snapshot:'unit',net_minor:2900});})();`;
const origin=process.env.PC_PREVIEW_ORIGIN||'http://127.0.0.1:8765',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1190,height:850}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'/* isolated UI fixture */'}));await page.addInitScript({content:fixture+seed});
try{
 await page.goto(origin+'/operations.html?view=returns');await page.locator('#returns-panel').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#return-item-product')?.options.length===1);
 assert.equal(await page.locator('#return-item-product').inputValue(),'ffffffff-ffff-4fff-8fff-ffffffffffff');
 await page.locator('#return-item-qty').fill('1');assert.equal(await page.locator('#return-item-refund').inputValue(),'967');
 assert.equal(await page.locator('#return-item-refund').getAttribute('readonly'),'');
 await page.locator('#return-item-note').fill('UI QA return');
 await page.locator('#returns-item-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#returns-msg')?.textContent.includes('967'));
 const calls=await page.evaluate(()=>window.__retailQA.called.filter(x=>x.name==='retail_return_item_v22'));
 assert.equal(calls.length,1);assert.equal(calls[0].args.p_line,'ffffffff-ffff-4fff-8fff-ffffffffffff');assert.equal('p_refund' in calls[0].args,false);
 assert.equal(await page.evaluate(()=>window.__retailQA.called.some(x=>['retail_receive_packs_v17','retail_cash_movement'].includes(x.name))),false);
 await page.locator('[data-tab=reports]').click();await page.waitForFunction(()=>document.querySelector('#rep-sales-kpi-net')?.textContent==='897,100 IQD');
 assert.match(await page.locator('#rep-sales-main-table').innerText(),/121/);
 await page.locator('#rep-sales-main-table .pager button').last().click();await page.waitForFunction(()=>document.querySelector('#rep-sales-main-table')?.textContent.includes('پەڕەی دووەم'));
 assert.equal(await page.locator('#rep-sales-kpi-net').innerText(),'897,100 IQD','global totals must not be recomputed from the current page');
 await page.evaluate(()=>window.__retailQA.v22Error={code:'NETWORK',message:'Report unavailable'});await page.locator('#rep-sales-refresh').click();
 await page.waitForFunction(()=>document.querySelector('#rep-sales-msg')?.textContent.includes('Report unavailable'));
 assert.equal(await page.locator('#rep-sales-main-table table').count(),0);assert.equal(await page.locator('#rep-sales-kpi-net').innerText(),'—');
 assert.deepEqual(errors,[]);console.log('PASS V22: receipt-line IDs, readonly discounted refund, atomic UI call, server report totals/paging and fail-closed report errors');
}finally{await browser.close();}
