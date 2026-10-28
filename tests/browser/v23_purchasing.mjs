import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const fixture=readFileSync('tests/browser/qa_supabase_fixture.js','utf8');
const adapter=`(()=>{const create=window.supabase.createClient;window.__poQA={rows:[],fail:true,writes:0,stale:false};window.supabase.createClient=(...args)=>{const c=create(...args),from=c.from;c.from=table=>{if(table!=='retail_purchase_orders')return from(table);const q=window.__poQA,filters=[];let rows=null,patch=null;const b={select(){return b},eq(k,v){filters.push([k,v]);return b},order(){return b},limit(){return b},insert(v){rows=v;return b},update(v){patch=v;return b},result(){if(rows||patch){q.writes++;if(q.fail)return{data:null,error:{message:'PURCHASE_WRITE_DENIED'}};if(rows){q.rows.push(...rows);return{data:rows.map(x=>({id:x.id})),error:null}}if(q.stale)return{data:null,error:null};const found=q.rows.find(x=>filters.every(([k,v])=>x[k]===v));if(found)Object.assign(found,patch);return{data:found?{id:found.id}:null,error:null}}return{data:q.rows.filter(x=>filters.every(([k,v])=>x[k]===v)),error:null}},maybeSingle(){return Promise.resolve(b.result())},then(ok,bad){return Promise.resolve(b.result()).then(ok,bad)}};return b};return c};})();`;
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1190,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'/* test fixture */'}));await page.addInitScript({content:fixture+adapter});
 await page.goto((process.env.PC_PREVIEW_ORIGIN||'http://127.0.0.1:8765')+'/operations.html?view=purchase-orders');await page.locator('#po-form').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#po-product')?.options.length>0);
 assert.equal(await page.locator('#po-unit-cost').inputValue(),'','unknown purchase cost is blank, never 80% of retail');
 await page.locator('#po-unit-cost').fill('700');await page.locator('#po-qty').fill('2');await page.locator('#po-form button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#po-msg')?.textContent.includes('PURCHASE_WRITE_DENIED'));
 assert.equal(await page.locator('[data-po-cancel]').count(),0,'failed insert must not produce a local order');
 await page.evaluate(()=>window.__poQA.fail=false);await page.locator('#po-form button[type=submit]').click();await page.locator('[data-po-cancel]').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>window.__poQA.rows.length),1);
 await page.evaluate(()=>window.__poQA.stale=true);await page.locator('[data-po-cancel]').click();await page.waitForFunction(()=>document.querySelector('#po-msg')?.textContent.includes('داواکاری گۆڕاوە'));
 assert.equal(await page.locator('[data-po-cancel]').count(),1,'stale cancellation cannot change the local pending order');
 await page.evaluate(()=>window.__poQA.stale=false);await page.locator('[data-po-cancel]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-po-cancel]').length===0);
 assert.equal(await page.evaluate(()=>window.__poQA.rows[0].status),'cancelled');assert.deepEqual(errors,[]);
 console.log('PASS V23: no guessed purchase price, rejected insert has no phantom order, cancellation requires a confirmed pending row');
}finally{await browser.close()}
