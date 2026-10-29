import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const window={};runInNewContext(readFileSync('receipt-history.js','utf8'),{window,Date});
const api=window.RetailReceiptHistory;
test('receipt search preserves bigint precision, supports padded/local digits and rejects malformed inputs',()=>{
 assert.equal(api.criteria({query:'#۰۰۰١٢٣'}).receipt,'123');
 assert.equal(api.criteria({query:'9223372036854775807'}).receipt,'9223372036854775807');
 for(const query of ['0','-1','1.2','1e3','9223372036854775808','1,2','abc'])assert.throws(()=>api.criteria({query}));
});
test('receipt periods use Baghdad midnight and an explicit upper cutoff',()=>{
 const now=new Date('2026-10-28T22:30:00Z');
 assert.equal(api.criteria({now,period:'today'}).since,'2026-10-28T21:00:00.000Z');
 assert.equal(api.criteria({now,period:'7d'}).since,'2026-10-21T22:30:00.000Z');
 assert.equal(api.criteria({now}).until,now.toISOString());
});
function fixture(reply){const calls=[];const query={};for(const key of ['select','eq','lte','gte','order','range'])query[key]=(...args)=>{calls.push([key,...args]);return query;};query.then=(yes,no)=>Promise.resolve(reply).then(yes,no);return {db:{from:table=>{calls.push(['from',table]);return query;}},calls};}
test('receipt paging applies store/status/search/date on server with deterministic order and exact count',async()=>{
 const f=fixture({data:[{id:'a',store_id:'store',status:'posted'}],count:123,error:null});
 const result=await api.read({db:f.db,store:'store',filters:api.criteria({query:'0001',status:'refunded',period:'today'}),offset:100});
 assert.equal(result.total,123);assert.equal(result.rows.length,1);
 assert.ok(f.calls.some(x=>x[0]==='eq'&&x[1]==='store_id'&&x[2]==='store'));
 assert.ok(f.calls.some(x=>x[0]==='eq'&&x[1]==='receipt_no'&&x[2]==='1'));
 assert.ok(f.calls.some(x=>x[0]==='eq'&&x[1]==='refunded'&&x[2]===true));
 assert.deepEqual(f.calls.filter(x=>x[0]==='order').map(x=>x[1]),['created_at','id']);
 assert.deepEqual(f.calls.find(x=>x[0]==='range'),['range',100,149]);
 assert.equal(f.calls.find(x=>x[0]==='select')[2].count,'exact');
});
test('receipt read errors, missing counts and cross-store rows fail closed without fallback',async()=>{
 for(const reply of [{data:[],count:null},{data:[{id:'a',store_id:'other',status:'posted'}],count:1},{error:Error('denied')},{data:[],count:-1}]){
  const f=fixture(reply);await assert.rejects(()=>api.read({db:f.db,store:'store',filters:api.criteria()}));
 }
});
