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
