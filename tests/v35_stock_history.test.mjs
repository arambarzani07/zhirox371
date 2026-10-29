import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const window={};for(const f of ['receipt-history.js','stock-movement-reads.js','tests/browser/qa_supabase_fixture.js'])runInNewContext(readFileSync(f,'utf8'),{window,Date,URL,Map,Set,localStorage:{getItem:()=>null}});const api=window.RetailStockMovementReads,q=window.__retailQA,db=window.supabase.createClient();
const kg={...q.products[0],id:'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',base_unit:'kg',name:'Product beyond catalog'};q.products.push(kg);
const before=new Date('2026-10-28T20:59:00Z'),now=new Date('2026-10-29T10:00:00Z');
for(let i=0;i<263;i++)q.stockEvents.push({id:String(i).padStart(6,'0'),store_id:q.store.id,product_id:i===0?kg.id:q.products[0].id,delta:i%2===0?-0.5:2,reason:i%2===0?'sale':'purchase',created_at:i===0?before.toISOString():new Date(now.getTime()-i*1000).toISOString()});
q.stockEvents.push({...q.stockEvents[0],id:'foreign',store_id:'other'});q.audit.push({id:'audit',store_id:q.store.id,subject_id:q.products[0].id,action:'stock.receive_packs_v17',details:{base_units:999},created_at:now.toISOString()});
test('263 canonical stock events traverse six pages exactly once and ignore matching audits and other stores',async()=>{
 const filters=api.criteria({now}),ids=[];for(let offset=0;offset<263;offset+=50){const r=await api.read({db,store:q.store.id,filters,offset});assert.equal(r.total,263);assert.equal(r.rows.length,offset===250?13:50);ids.push(...r.rows.map(x=>x.id));}
 assert.equal(new Set(ids).size,263);assert.equal(ids.includes('foreign'),false);assert.equal(ids.at(-1),'000000');
});
test('server direction, reason, product and Baghdad date filters cover the entire canonical history',async()=>{
 const read=opts=>api.read({db,store:q.store.id,filters:api.criteria({now,...opts})});
 assert.equal((await read({type:'out'})).total,132);assert.equal((await read({type:'in'})).total,131);assert.equal((await read({type:'purchase'})).total,131);assert.equal((await read({type:'adjustment'})).total,0);
 assert.equal((await read({period:'today'})).total,262);const r=await read({product:kg.id});assert.equal(r.total,1);assert.equal(r.rows[0].product.name,kg.name);assert.equal(api.totals(r.rows,[]).kg.out,0.5);
 for(const opts of [{product:'bad'},{type:'bad'},{period:'bad'}])assert.throws(()=>api.criteria(opts));
});
test('invalid page/product metadata cannot be mistaken for a zero stock movement',async()=>{
 q.stockHistoryError={message:'denied'};await assert.rejects(()=>api.read({db,store:q.store.id,filters:api.criteria({now})}));
 const r=await api.read({db,store:q.store.id,filters:api.criteria({now,product:kg.id})});assert.equal(r.rows[0].delta,-0.5);assert.equal(r.rows[0].product.base_unit,'kg');
});
test('audit notes enrich only an acknowledged event and never add extra movements',async()=>{
 const request='dddddddd-dddd-4ddd-8ddd-000000000001',row=q.stockEvents.find(x=>x.id==='000001');row.request_id=request;
 q.audit.push({id:'note',store_id:q.store.id,subject_id:row.product_id,action:'stock.adjust_v19',details:{request_id:request,note:'confirmed note'},created_at:now.toISOString()});
 const r=await api.read({db,store:q.store.id,filters:api.criteria({now})});assert.equal(r.total,263);assert.equal(r.rows.find(x=>x.id===row.id).note,'confirmed note');
 q.audit.push({id:'wrong-note',store_id:'other',subject_id:row.product_id,action:'stock.adjust_v19',details:{request_id:request,note:'foreign note'}});
 const again=await api.read({db,store:q.store.id,filters:api.criteria({now})});assert.equal(again.rows.find(x=>x.id===row.id).note,'confirmed note');
});

test('registered and retired barcode aliases locate old history outside the product page; unknown codes return empty',async()=>{
 q.barcodes.push({store_id:q.store.id,product_id:kg.id,code:'OLD-KG',active:false});
 const r=await api.read({db,store:q.store.id,filters:api.criteria({now,barcode:'OLD-KG'})});assert.equal(r.total,1);assert.equal(r.rows[0].product.name,kg.name);
 assert.equal((await api.read({db,store:q.store.id,filters:api.criteria({now,barcode:'NOT-REGISTERED'})})).total,0);
 assert.throws(()=>api.criteria({barcode:'bad code'}));
});
