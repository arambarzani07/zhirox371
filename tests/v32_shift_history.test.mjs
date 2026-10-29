import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const window={};for(const f of ['receipt-history.js','shift-history.js'])runInNewContext(readFileSync(f,'utf8'),{window,Date});const api=window.RetailShiftHistory;
const row={id:'shift',store_id:'shop',cashier_id:'actor',status:'open'};
function mock(reply){const calls=[],q={};for(const method of ['select','eq','lte','gte','order','range','limit'])q[method]=(...args)=>{calls.push([method,...args]);return q;};q.then=(yes,no)=>Promise.resolve(reply).then(yes,no);return {calls,db:{from:table=>{calls.push(['from',table]);return q;}}};}
test('active shift lookup is independent of bounded closed history and scoped to cashier/store',async()=>{
 const f=mock({data:[row]});assert.equal((await api.current({db:f.db,store:'shop',actor:'actor'})).id,'shift');
 for(const [k,v] of [['status','open'],['store_id','shop'],['cashier_id','actor']])assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]===k&&c[2]===v));assert.deepEqual(f.calls.find(c=>c[0]==='limit'),['limit',2]);
 assert.equal(await api.current({db:mock({data:[]}).db,store:'shop',actor:'actor'}),null);
});
test('duplicate, foreign and denied current shifts never become verified state',async()=>{
 for(const reply of [{data:[row,row]},{data:[{...row,cashier_id:'other'}]},{data:[{...row,status:'closed'}]},{data:null},{error:Error('denied')}])await assert.rejects(()=>api.current({db:mock(reply).db,store:'shop',actor:'actor'}));
});
test('shift history filters on server and pages all own-cashier rows with exact counts',async()=>{
 const f=mock({data:[row],count:123});const filters=api.criteria({status:'open',period:'today',now:new Date('2026-10-29T00:00:00Z')});assert.equal(filters.since,'2026-10-28T21:00:00.000Z');
 const r=await api.read({db:f.db,store:'shop',actor:'actor',filters,offset:100});assert.equal(r.total,123);assert.deepEqual(f.calls.find(c=>c[0]==='range'),['range',100,149]);assert.equal(f.calls.find(c=>c[0]==='select')[2].count,'exact');assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]==='cashier_id'&&c[2]==='actor'));assert.ok(f.calls.some(c=>c[0]==='gte'&&c[1]==='opened_at'));assert.deepEqual(f.calls.filter(c=>c[0]==='order').map(c=>c[1]),['opened_at','id']);
});
test('history rejects malformed counts, cross-store rows, unknown filters and invalid offsets',async()=>{
 assert.throws(()=>api.criteria({status:'wrong'}));for(const reply of [{data:[],count:null},{data:[{...row,store_id:'other'}],count:1}])await assert.rejects(()=>api.read({db:mock(reply).db,store:'shop',actor:'actor',filters:api.criteria()}));await assert.rejects(()=>api.read({db:mock({data:[],count:0}).db,store:'shop',actor:'actor',filters:api.criteria(),offset:1}));
});
test('verified balances require complete safe integer amounts and permit net negative movements',()=>{
 assert.equal(api.summary({opening:100,sales:50,movements:-20,expected:130,profit:null}).expected,130);
 assert.throws(()=>api.summary({session_id:'shift',status:'closed',opening:1,sales:0,movements:0,expected:1},'shift'));
 for(const s of [null,{}, {opening:100,sales:50,movements:0,expected:null},{opening:100,sales:50,movements:0,expected:1.5},{opening:100,sales:50,movements:0,expected:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>api.summary(s));
});
