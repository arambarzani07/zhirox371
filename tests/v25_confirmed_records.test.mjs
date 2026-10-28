import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../confirmed-records.js';
const mutate=globalThis.RetailConfirmedRecords.mutate;
function mock(result){const calls=[];const q={};for(const method of ['from','upsert','update','delete','eq','select'])q[method]=(...args)=>{calls.push([method,...args]);return q;};q.maybeSingle=async()=>result;return {q,calls};}
test('confirmed promotion mutation rejects server errors and missing acknowledgments',async()=>{
 for(const response of [{error:new Error('denied'),data:null},{error:null,data:null},{error:null,data:{id:'wrong'}}]){
  const {q}=mock(response);await assert.rejects(()=>mutate(q,'store','retail_offers','delete',null,'record'));
 }
});
test('confirmed promotion changes are tenant scoped and validate upsert identity',async()=>{
 const {q,calls}=mock({data:{id:'record'},error:null});
 await mutate(q,'store','retail_offers','update',{active:false},'record');
 assert.deepEqual(calls.filter(x=>x[0]==='eq'),[['eq','store_id','store'],['eq','id','record']]);
 await assert.rejects(()=>mutate(q,'store','retail_offers','upsert',{id:'record',store_id:'other'},'record'));
 await assert.rejects(()=>mutate(q,'store','retail_finance_entries','delete',null,'record'));
});

test('production config keeps the actual SDK and never provisions a local owner or sync queue',async()=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');
 const sdk={createClient(){return 'real'}};let writes=0;
 const window={supabase:sdk,localStorage:{setItem(){writes++}},navigator:{onLine:true}};
 runInNewContext(readFileSync('config.js','utf8'),{window});
 assert.equal(window.supabase,sdk);assert.equal(window.RETAIL_CONFIG.offlineFirst,false);assert.equal(window.RetailOfflineSync,undefined);assert.equal(writes,0);
});

test('every root page has unique HTML IDs after concurrent feature integration',async()=>{
 const {readdirSync,readFileSync}=await import('node:fs');
 for(const file of readdirSync('.').filter(f=>f.endsWith('.html')&&f!=='preview.html')){
  const html=readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  const ids=[...html.matchAll(/<[a-z][^>]*\bid="([^"]+)"/gi)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'duplicate IDs in '+file);
 }
});
