import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../operations.js',import.meta.url),'utf8');
function runtime(){
 const saved=new Map(),calls=[],messages=[];let next=0;
 const context={store:{id:'store'},user:{id:'user'},crypto:{randomUUID:()=>`request-${++next}`},
 sessionStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
 db:{rpc:async(name,args)=>{calls.push({name,args});return context.response;}},
 response:{data:null,error:{code:'NETWORK',message:'connection lost'}},saved,calls,messages,
 customersList:[{id:'customer',name:'C',balance_minor:1000}],supplierLedgerList:[],customerLedgerList:[],
 suppliersList:[{id:'supplier',name:'S',balance_minor:1000}],
 msg:(id,message)=>messages.push(message),safe:e=>e.message,saveLocalCustomers:()=>{},saveLocalCustomerLedger:()=>{},
 populateCustomerSelectors:()=>{},saveLocalSuppliers:()=>{},saveLocalSupplierLedger:()=>{},populateSupplierSelectors:()=>{}};
 vm.createContext(context);
 for(const [start,end] of [['async function financialRpc(','function isValidEan13('],['async function recordCustomerLedgerEntry(','async function refreshCustomersSection('],['async function recordSupplierLedgerEntry(','async function refreshSuppliersSection(']]){
  vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),context);
 }
 return context;
}
test('ambiguous financial retries persist the same UUID and reject changed payload',async()=>{
 const c=runtime();const args={p_store:'store',amount:500};
 await assert.rejects(()=>c.financialRpc('ledger','rpc',args));
 await assert.rejects(()=>c.financialRpc('ledger','rpc',args));
 assert.equal(c.calls[0].args.p_request,c.calls[1].args.p_request);
 await assert.rejects(()=>c.financialRpc('ledger','rpc',{...args,amount:600}));assert.equal(c.calls.length,2);
 c.response={data:{entry_id:'entry'},error:null};await c.financialRpc('ledger','rpc',args);
 assert.equal(c.saved.size,0);assert.equal(c.calls[2].args.p_request,c.calls[0].args.p_request);
});
test('permission failure cannot write customer balances or pretend a local ledger succeeded',async()=>{
 const c=runtime();c.response={data:null,error:{code:'42501',message:'denied'}};
 const result=await c.recordCustomerLedgerEntry({customerId:'customer',entryType:'payment_received',amount:500,targetMsgId:'message'});
 assert.equal(result,null);assert.equal(c.customersList[0].balance_minor,1000);assert.equal(c.customerLedgerList.length,0);
 assert.deepEqual(c.messages,['denied']);assert.equal(c.saved.size,0);
});
test('supplier RPC failure cannot create local financial evidence',async()=>{
 const c=runtime();const result=await c.recordSupplierLedgerEntry({supplierId:'supplier',entryType:'payment_sent',amount:500,targetMsgId:'message'});
 assert.equal(result,null);assert.equal(c.suppliersList[0].balance_minor,1000);assert.equal(c.supplierLedgerList.length,0);
 assert.equal(c.calls[0].name,'retail_record_supplier_ledger_v21');
});
