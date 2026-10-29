import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const window={};for(const file of ['receipt-history.js','audit-history.js'])runInNewContext(readFileSync(file,'utf8'),{window,Date});const api=window.RetailAuditHistory;
test('audit search uses literal patterns and validates UUID columns before any request',()=>{
 assert.equal(api.criteria({query:'stock_receive%'}).pattern,'%stock\\_receive\\%%');
 const id='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';assert.equal(api.criteria({query:id,field:'actor_id'}).query,id.toLowerCase());
 for(const args of [{query:'*'},{query:'not-a-uuid',field:'actor_id'},{field:'details'},{query:'a'.repeat(81)}])assert.throws(()=>api.criteria(args));
 assert.equal(api.criteria({period:'today',now:new Date('2026-10-28T22:30:00Z')}).since,'2026-10-28T21:00:00.000Z');
});
function mock(reply){const calls=[],q={};for(const method of ['select','eq','lte','gte','ilike','order','range'])q[method]=(...args)=>{calls.push([method,...args]);return q;};q.then=(yes,no)=>Promise.resolve(reply).then(yes,no);return {calls,db:{from:table=>{calls.push(['from',table]);return q;}}};}
test('audit queries scope reads/counts to the store, never select private details and page on server',async()=>{
 const f=mock({data:[{id:'row',store_id:'store',action:'stock_receive'}],count:123});
 const r=await api.read({db:f.db,store:'store',filters:api.criteria({query:'stock_receive'}),offset:100});assert.equal(r.total,123);
 assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]==='store_id'&&c[2]==='store'));
 assert.equal(f.calls.find(c=>c[0]==='select')[2].count,'exact');assert.doesNotMatch(f.calls.find(c=>c[0]==='select')[1],/details/);
 assert.deepEqual(f.calls.find(c=>c[0]==='range'),['range',100,149]);assert.deepEqual(f.calls.filter(c=>c[0]==='order').map(c=>c[1]),['created_at','id']);
 const actor=mock({data:[],count:0});await api.read({db:actor.db,store:'store',filters:api.criteria({field:'actor_id',query:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})});assert.ok(actor.calls.some(c=>c[0]==='eq'&&c[1]==='actor_id'));assert.equal(actor.calls.some(c=>c[0]==='ilike'),false);
});
test('audit errors and malformed/cross-store replies never become usable records',async()=>{
 for(const reply of [{data:[],count:null},{error:Error('denied')},{data:[{id:'row',store_id:'other',action:'a'}],count:1},{data:[{id:'row',store_id:'store'}],count:1}])await assert.rejects(()=>api.read({db:mock(reply).db,store:'store',filters:api.criteria()}));
});
test('audit CSV preserves identifiers and quoted text while neutralizing spreadsheet formulas',()=>{
 const rows=['=1+1',' +SUM(A1:A2)','-2','@x','\t=1','safe,"quoted"\ntext'].map((action,i)=>({id:'0000-'+i,store_id:'store',created_at:'2026-10-29T00:00:00Z',action,actor_id:'actor',subject_id:null}));
 const csv=api.csv(rows);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/"0000-0"/);assert.match(csv,/"'=1\+1"/);assert.match(csv,/"' \+SUM/);assert.match(csv,/"'\t=1"/);assert.match(csv,/"safe,""quoted""\ntext"/);assert.doesNotMatch(csv,/details/);
});
