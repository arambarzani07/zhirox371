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
 suppliersReady:true,supplierIdentityEpoch:0,suppliersScope:{ledgerTotal:0},purchaseOrdersList:[],renderSupplierReadScope:()=>{},customersReady:true,customerIdentityEpoch:0,customersScope:{ledgerTotal:0},renderCustomerReadScope:()=>{},
 customersList:[{id:'customer',name:'C',balance_minor:1000}],supplierLedgerList:[],customerLedgerList:[],
 suppliersList:[{id:'supplier',name:'S',balance_minor:1000}],
 msg:(id,message)=>messages.push(message),safe:e=>e.message,saveLocalCustomers:()=>{},saveLocalCustomerLedger:()=>{},
 populateCustomerSelectors:()=>{},saveLocalSuppliers:()=>{},saveLocalSupplierLedger:()=>{},populateSupplierSelectors:()=>{}};
 context.window={};vm.createContext(context);
 vm.runInContext(readFileSync(new URL('../customer-accounts.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../supplier-accounts.js',import.meta.url),'utf8'),context);
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

test('acknowledged account changes use confirmed deltas and do not duplicate returned entry IDs',async()=>{
 const c=runtime();c.response={data:{entry_id:'entry',balance_after_minor:1800,delta_minor:800},error:null};
 const args={customerId:'customer',entryType:'debt_sale',amount:1000,saleId:'sale'};
 const row=await c.recordCustomerLedgerEntry(args);assert.equal(row.delta_minor,800);assert.equal(c.customersList[0].balance_minor,1800);
 await c.recordCustomerLedgerEntry(args);assert.equal(c.customerLedgerList.length,1);assert.equal(c.customersScope.ledgerTotal,1);
});
test('an old-identity write acknowledgment cannot restore ledger data after logout',async()=>{
 const c=runtime();let complete;c.db.rpc=()=>new Promise(resolve=>{complete=resolve;});
 const pending=c.recordCustomerLedgerEntry({customerId:'customer',entryType:'payment_received',amount:500});
 c.customerIdentityEpoch++;c.customersList=[];c.customerLedgerList=[];
 complete({data:{entry_id:'entry',balance_after_minor:500,delta_minor:-500},error:null});assert.equal(await pending,null);assert.equal(c.customerLedgerList.length,0);assert.equal(c.customersList.length,0);
});

test('supplier acknowledgements are validated, deduplicated and cannot restore a logged-out account',async()=>{
 const c=runtime();c.response={data:{entry_id:'supplier-entry',balance_after_minor:500},error:null};const args={supplierId:'supplier',entryType:'payment_sent',amount:500};
 await c.recordSupplierLedgerEntry(args);await c.recordSupplierLedgerEntry(args);assert.equal(c.supplierLedgerList.length,1);assert.equal(c.suppliersScope.ledgerTotal,1);assert.equal(c.suppliersList[0].balance_minor,500);
 let complete;c.db.rpc=()=>new Promise(resolve=>complete=resolve);const pending=c.recordSupplierLedgerEntry(args);c.supplierIdentityEpoch++;c.suppliersList=[];c.supplierLedgerList=[];complete({data:{entry_id:'obsolete',balance_after_minor:0},error:null});assert.equal(await pending,null);assert.equal(c.supplierLedgerList.length,0);
 const bad=runtime();bad.response={data:{entry_id:'bad',balance_after_minor:null},error:null};assert.equal(await bad.recordSupplierLedgerEntry(args),null);assert.equal(bad.suppliersList[0].balance_minor,1000);assert.equal(bad.supplierLedgerList.length,0);
});
