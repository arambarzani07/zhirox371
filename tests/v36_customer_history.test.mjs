import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const window={};for(const f of ['receipt-history.js','customer-accounts.js','customer-history.js','tests/browser/qa_supabase_fixture.js'])runInNewContext(readFileSync(f,'utf8'),{window,Date,URL,Map,Set,localStorage:{getItem:()=>null}});
const api=window.RetailCustomerHistory,q=window.__retailQA,db=window.supabase.createClient(),now=new Date('2026-10-29T10:00:00Z');
const customer={id:'cccccccc-cccc-4ccc-8ccc-000000000001',store_id:q.store.id,name:'Old customer',phone:'0750-ARCHIVE',active:false};q.customers.push(customer);
for(let i=0;i<623;i++)q.customerLedger.push({id:String(i).padStart(6,'0'),store_id:q.store.id,customer_id:customer.id,entry_type:i%2?'payment_received':'debt_add',amount_minor:1000,delta_minor:i%2?-400:1000,balance_after_minor:3000,note:'note '+i,created_at:new Date(now.getTime()-(i+1)*1000).toISOString()});
q.customerLedger.push({...q.customerLedger[0],id:'foreign',store_id:'other'});
test('623 customer ledger rows page beyond the bounded cache with stable counts and embedded customer identity',async()=>{
 const filters=api.criteria({now}),ids=[];for(let offset=0;offset<623;offset+=50){const page=await api.read({db,store:q.store.id,filters,offset});assert.equal(page.total,623);assert.equal(page.rows.length,offset===600?23:50);assert.equal(page.rows[0].customer.name,'Old customer');ids.push(...page.rows.map(r=>r.id));}
 assert.equal(ids.length,623);assert.equal(new Set(ids).size,623);assert.equal(ids.at(-1),'000622');assert.equal(ids.includes('foreign'),false);
});
test('server customer, phone, entry type and Baghdad date filters run before pagination',async()=>{
 const read=opts=>api.read({db,store:q.store.id,filters:api.criteria({now,...opts})});
 assert.equal((await read({customer:customer.id,kind:'payments'})).total,311);assert.equal((await read({kind:'purchases'})).total,312);
 assert.equal((await read({phone:customer.phone})).total,623);assert.equal((await read({phone:'missing'})).total,0);
 assert.equal(api.criteria({now:new Date('2026-10-28T22:00:00Z'),period:'today'}).since,'2026-10-28T21:00:00.000Z');
 for(const opts of [{customer:'bad'},{kind:'bad'},{period:'bad'},{customer:customer.id,phone:customer.phone}])assert.throws(()=>api.criteria(opts));
});
test('ambiguous phone, read denial and malformed money do not become verified history',async()=>{
 q.customers.push({...customer,id:'cccccccc-cccc-4ccc-8ccc-000000000002'});await assert.rejects(()=>api.read({db,store:q.store.id,filters:api.criteria({now,phone:customer.phone})}));q.customers.pop();
 q.customerHistoryError={message:'denied'};await assert.rejects(()=>api.read({db,store:q.store.id,filters:api.criteria({now})}));
 const old=q.customerLedger[0].delta_minor;q.customerLedger[0].delta_minor=null;await assert.rejects(()=>api.read({db,store:q.store.id,filters:api.criteria({now})}));q.customerLedger[0].delta_minor=old;
});
function ui(read){
 const source=readFileSync('operations.js','utf8'),body=source.slice(source.indexOf('async function refreshCustomerHistory('),source.indexOf('function invalidateCustomerHistory(')),nodes=new Map();
 const ctx={window:{RetailCustomerHistory:{criteria:api.criteria,read}},db:{},store:{id:'shop'},user:{id:'actor'},customersReady:true,historyToken:0,historyReady:true,historyLoading:false,historyRows:[{}],historyOffset:0,historyTotal:1,historyFilters:null,historyTimer:null,clearTimeout(){},$:id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,replaceChildren(){this.cleared=true;}});return nodes.get(id);},renderCustomerHistoryView(){},syncCustomerHistoryPager(){},msg(){},safe:String};
 for(const id of ['hist-customer-filter','hist-type-filter','hist-date-filter'])ctx.$(id).value='all';runInNewContext(body+';this.refresh=refreshCustomerHistory;',ctx);return ctx;
}
test('history refresh clears printable content and ignores obsolete filter/logout responses',async()=>{
 const replies=[],ctx=ui(()=>new Promise(resolve=>replies.push(resolve)));const a=ctx.refresh(),b=ctx.refresh();assert.equal(ctx.historyReady,false);assert.equal(ctx.historyRows.length,0);assert.equal(ctx.$('customer-statement-box').hidden,true);
 replies[1]({rows:[{id:'new'}],total:1});await b;replies[0]({rows:[{id:'old'}],total:1});await a;assert.equal(ctx.historyRows[0].id,'new');
 const c=ctx.refresh();ctx.historyToken++;ctx.user=null;replies[2]({rows:[{id:'logout'}],total:1});await c;assert.equal(ctx.historyRows.length,0);assert.equal(ctx.historyReady,false);
});
test('empty final history page recovers and failed reads clear totals without changing write caches',async()=>{
 const calls=[],ctx=ui(async args=>{calls.push(args);return args.offset===600?{rows:[],total:501}:{rows:[{id:'last'}],total:501};});ctx.historyOffset=600;ctx.historyFilters=api.criteria();await ctx.refresh(false);assert.equal(ctx.historyOffset,500);assert.equal(calls.length,2);assert.equal(calls[0].filters,calls[1].filters);
 const failed=ui(async()=>{throw Error('denied');});await failed.refresh();assert.equal(failed.historyReady,false);assert.equal(failed.historyTotal,0);assert.equal(failed.historyRows.length,0);assert.equal(failed.historyLoading,false);
});
test('cross-store embedded customers, duplicate ledger IDs, missing totals and unsafe money are rejected',async()=>{
 function fake(reply){const query={};for(const k of ['select','eq','lte','order','range'])query[k]=()=>query;query.then=(yes,no)=>Promise.resolve(reply).then(yes,no);return {from:()=>query};}
 const row={...q.customerLedger[0],customer};
 for(const reply of [{data:[row],count:null},{data:[row,row],count:2},{data:[{...row,store_id:'other'}],count:1},{data:[{...row,customer:{...customer,store_id:'other'}}],count:1},{data:[{...row,amount_minor:'9007199254740992'}],count:1},{data:[{...row,balance_after_minor:null}],count:1}])await assert.rejects(()=>api.read({db:fake(reply),store:q.store.id,filters:api.criteria({now})}));
});
