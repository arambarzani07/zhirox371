import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../purchasing-v23.js';
const {insertOrders,cancelOrder}=globalThis.PurchasingV23;
const order={id:'one',store_id:'shop',po_no:'PO1',product_id:'p',quantity:2,unit_cost_minor:700,total_cost_minor:1400};
function client(result){const calls=[];const q={};for(const name of ['from','insert','update','eq','select','maybeSingle'])q[name]=(...args)=>{calls.push([name,...args]);return q;};q.then=(resolve,reject)=>Promise.resolve(result).then(resolve,reject);return{db:q,calls};}
test('purchase batch propagates server errors and network failures',async()=>{
 const {db}=client({error:{message:'denied'}});await assert.rejects(insertOrders(db,'shop',[order]),e=>e.message==='denied');
 const broken={from(){throw Error('offline');}};await assert.rejects(insertOrders(broken,'shop',[order]),/offline/);
 await assert.rejects(insertOrders(null,'shop',[order]));
});
test('one insert confirms the complete batch and does not send client timestamps',async()=>{
 const {db,calls}=client({data:[{id:'one'},{id:'two'}]});
 await insertOrders(db,'shop',[order,{...order,id:'two'}]);
 const writes=calls.filter(x=>x[0]==='insert');assert.equal(writes.length,1);assert.equal(writes[0][1].length,2);assert.equal('created_at' in writes[0][1][0],false);
});
test('partial, duplicated or missing acknowledgement is never success',async()=>{
 for(const data of [null,[],[{id:'one'}],[{id:'one'},{id:'one'}],[{id:'one'},{id:'other'}]]){
  const {db}=client({data});await assert.rejects(insertOrders(db,'shop',[order,{...order,id:'two'}]));
 }
});
test('wrong tenant, duplicate IDs, invalid totals and guessed fractional costs cannot write',async()=>{
 for(const bad of [{...order,store_id:'other'},{...order,total_cost_minor:900},{...order,unit_cost_minor:1.5},{...order,quantity:0}]){
  const {db,calls}=client({data:[]});await assert.rejects(insertOrders(db,'shop',[bad]));assert.equal(calls.length,0);
 }
});
test('cancellation requires a confirmed pending row in the current shop',async()=>{
 const {db,calls}=client({data:{id:'one'}});await cancelOrder(db,'shop','one');
 assert.deepEqual(calls.filter(x=>x[0]==='eq'),[['eq','store_id','shop'],['eq','id','one'],['eq','status','pending']]);
 for(const result of [{data:null},{data:{id:'other'}},{error:{message:'denied'}}])await assert.rejects(cancelOrder(client(result).db,'shop','one'));
});
test('PO and receiving forms never infer 80 percent of retail price or accept blank as zero',()=>{
 const js=readFileSync(new URL('../operations.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/retailPrice\*0\.8/);
 assert.equal((js.match(/if\(!rawCost\|\|!Number\.isSafeInteger\(unitCost\)/g)||[]).length,2);
 assert.match(js,/await window\.PurchasingV23\.insertOrders\(db,store.id,drafts\)/);
 assert.match(js,/await window\.PurchasingV23\.cancelOrder\(db,store.id,po.id\)/);
});
