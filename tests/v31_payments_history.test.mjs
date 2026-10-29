import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const window={};runInNewContext(readFileSync('payments-history.js','utf8'),{window,Date});const api=window.RetailPaymentsHistory;
function mock(reply){const calls=[],q={};for(const method of ['select','eq','lte','ilike','order','range'])q[method]=(...args)=>{calls.push([method,...args]);return q;};q.then=(yes,no)=>Promise.resolve(reply).then(yes,no);return {calls,db:{from:table=>{calls.push(['from',table]);return q;}}};}
test('cash search accepts localized exact IQD and treats wildcard characters literally',()=>{
 assert.equal(api.criteria({field:'amount_minor',query:'۰۰١٥٠٠'}).query,'1500');assert.equal(api.criteria({query:'fee_10%'}).pattern,'%fee\\_10\\%%');
 for(const arg of [{field:'bad'},{kind:'bad'},{query:'*'},{query:'x'.repeat(161)},...[0,-1,1.2,'1,500','9007199254740992'].map(query=>({field:'amount_minor',query}))])assert.throws(()=>api.criteria(arg));
});
test('cash pages use exact server counts, store/session scope, stable ordering and server filters',async()=>{
 const f=mock({data:[{id:'one',store_id:'shop',session_id:'shift',kind:'cash_in'}],count:251});const r=await api.read({db:f.db,store:'shop',session:'shift',filters:api.criteria({kind:'cash_in',field:'amount_minor',query:'1500'}),offset:200});assert.equal(r.total,251);
 for(const [key,val] of [['store_id','shop'],['session_id','shift'],['kind','cash_in'],['amount_minor','1500']])assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]===key&&c[2]===val));
 assert.deepEqual(f.calls.find(c=>c[0]==='range'),['range',200,249]);assert.deepEqual(f.calls.filter(c=>c[0]==='order').map(c=>c[1]),['created_at','id']);assert.equal(f.calls.find(c=>c[0]==='select')[2].count,'exact');
});
test('cash errors, unknown counts and other stores or shifts fail closed',async()=>{
 for(const reply of [{error:Error('denied')},{data:[],count:null},{data:[{id:'one',store_id:'elsewhere',session_id:'shift',kind:'cash_in'}],count:1},{data:[{id:'one',store_id:'shop',session_id:'other',kind:'cash_in'}],count:1}])await assert.rejects(()=>api.read({db:mock(reply).db,store:'shop',session:'shift',filters:api.criteria()}));
});
