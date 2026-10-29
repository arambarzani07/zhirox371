import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const window={};for(const f of ['customer-accounts.js','customer-directory.js','tests/browser/qa_supabase_fixture.js'])runInNewContext(readFileSync(f,'utf8'),{window,Date,URL,Map,Set,localStorage:{getItem:()=>null}});
const api=window.RetailCustomerDirectory,q=window.__retailQA,db=window.supabase.createClient();
for(let i=0;i<623;i++)q.customers.push({id:'cccccccc-0038-4038-8038-'+String(i).padStart(12,'0'),store_id:q.store.id,name:String(i).padStart(4,'0')+' Customer',phone:'0750'+String(i).padStart(7,'0'),address:'Address',note:i===622?'=1+1 %_literal':'other',active:true,balance_minor:i===622?1500:i%2?1000:0,credit_limit_minor:1000});
q.customers.push({...q.customers[0],id:'foreign',store_id:'other'},{...q.customers[0],id:'inactive',active:false});
test('directory pages traverse all 623 active store customers without depending on the bounded cache',async()=>{
 const ids=[];for(let offset=0;offset<623;offset+=50){const page=await api.read({db,store:q.store.id,offset});assert.equal(page.total,623);assert.equal(page.rows.length,offset===600?23:50);ids.push(...page.rows.map(c=>c.id));}assert.equal(new Set(ids).size,623);assert.equal(ids.at(-1),q.customers[622].id);
});
test('server search and debt filters find customers beyond row 500 and escape wildcard characters literally',async()=>{
 const read=opts=>api.read({db,store:q.store.id,filters:api.criteria(opts)});
 assert.equal((await read({query:'0622',field:'name'})).rows[0].id,q.customers[622].id);assert.equal((await read({query:'%_literal',field:'note'})).total,1);assert.equal((await read({query:q.customers[622].phone,field:'phone'})).total,1);assert.equal((await read({status:'debtors'})).total,312);assert.equal((await read({status:'clear'})).total,311);
 for(const opts of [{field:'balance_minor'},{query:'*'},{status:'over_limit'},{query:'x'.repeat(121)}])assert.throws(()=>api.criteria(opts));
});
test('one-customer action lookups are active/store/id scoped and never substitute the first customer',async()=>{
 const c=await api.one({db,store:q.store.id,id:q.customers[622].id});assert.equal(c.balance_minor,1500);await assert.rejects(()=>api.one({db,store:'other',id:c.id}));await assert.rejects(()=>api.one({db,store:q.store.id,id:'bad'}));
 const totals=api.totals([c,q.customers[1],q.customers[0]]);assert.equal(totals.debt,2500);assert.equal(totals.over,1);assert.equal(totals.debtors,2);
 assert.throws(()=>api.totals([{balance_minor:Number.MAX_SAFE_INTEGER,credit_limit_minor:0},{balance_minor:1,credit_limit_minor:0}]));
});
const source=readFileSync('operations.js','utf8');
function ui(read){
 const nodes=new Map(),ctx={window:{RetailCustomerDirectory:{criteria:api.criteria,read}},db:{},store:{id:'shop'},user:{id:'actor'},customersReady:true,directoryToken:0,directoryReady:true,directoryLoading:false,directoryRows:[{}],directoryOffset:0,directoryTotal:1,directoryFilters:null,directoryTimer:null,clearTimeout(){},$:id=>{if(!nodes.has(id))nodes.set(id,{value:''});return nodes.get(id);},renderCustomersDirectory(){},syncCustomerDirectoryPager(){},msg(){},safe:String};ctx.$('cust-search-field').value='name';ctx.$('cust-status-filter').value='all';runInNewContext(source.slice(source.indexOf('async function refreshCustomerDirectory('),source.indexOf('function invalidateCustomerDirectory('))+';this.refresh=refreshCustomerDirectory;',ctx);return ctx;
}
test('old directory replies cannot overwrite new searches or logged-out state',async()=>{
 const replies=[],ctx=ui(()=>new Promise(r=>replies.push(r)));const a=ctx.refresh(),b=ctx.refresh();assert.equal(ctx.directoryReady,false);assert.equal(ctx.directoryRows.length,0);replies[1]({rows:[{id:'new'}],total:1});await b;replies[0]({rows:[{id:'old'}],total:1});await a;assert.equal(ctx.directoryRows[0].id,'new');const c=ctx.refresh();ctx.directoryToken++;ctx.user=null;replies[2]({rows:[{id:'logout'}],total:1});await c;assert.equal(ctx.directoryReady,false);assert.equal(ctx.directoryRows.length,0);
});
test('shrinking final pages recover and denied reads clear directory totals',async()=>{
 const calls=[],ctx=ui(async args=>{calls.push(args);return args.offset===600?{rows:[],total:501}:{rows:[{id:'last'}],total:501};});ctx.directoryOffset=600;ctx.directoryFilters=api.criteria();await ctx.refresh(false);assert.equal(ctx.directoryOffset,500);assert.equal(calls.length,2);assert.equal(calls[0].filters,calls[1].filters);const failed=ui(async()=>{throw Error('denied');});await failed.refresh();assert.equal(failed.directoryRows.length,0);assert.equal(failed.directoryTotal,0);assert.equal(failed.directoryReady,false);
});
test('action snapshot pins the explicitly selected out-of-cache customer and rejects an obsolete hydration',async()=>{
 let complete;const target=q.customers[622],base=q.customers[0],ctx={window:{RetailCustomerAccounts:{read:async()=>({customers:[base],ledger:[],customerTotal:623,ledgerTotal:0})},RetailCustomerDirectory:{totals:api.totals,one:()=>new Promise(r=>complete=r)}},store:{id:q.store.id},user:{id:'actor'},db:{},customersReadToken:0,customersReady:false,customersList:[],customerLedgerList:[],customersScope:null, $:()=>({value:'',options:[]}),populateCustomerSelectors(){},clearCustomerViews(){},msg(){},renderCustomerReadScope(){},saveLocalCustomers(){},saveLocalCustomerLedger(){},syncCustomerReads(){},safe:String};runInNewContext(source.slice(source.indexOf('async function loadCustomersAndLedger('),source.indexOf('function populateCustomerSelectors('))+';this.load=loadCustomersAndLedger;',ctx);
 const pending=ctx.load(target.id);await new Promise(resolve=>setImmediate(resolve));complete(target);assert.equal(await pending,true);assert.equal(ctx.customersList.find(c=>c.id===target.id).id,target.id);
 const old=ctx.load(target.id);await new Promise(resolve=>setImmediate(resolve));ctx.customersReadToken++;ctx.user=null;complete(target);assert.equal(await old,false);assert.equal(ctx.customersReady,false);
});
test('directory validation rejects malformed counts, duplicate rows, unsafe balances and foreign identities',async()=>{
 function fake(reply){const x={};for(const m of ['select','eq','order','range','limit'])x[m]=()=>x;x.then=(yes,no)=>Promise.resolve(reply).then(yes,no);return {from:()=>x};}
 const row=q.customers[0];for(const reply of [{data:[row],count:null},{data:[row,row],count:2},{data:[{...row,store_id:'other'}],count:1},{data:[{...row,balance_minor:null}],count:1},{data:[{...row,credit_limit_minor:-1}],count:1},{data:[{...row,balance_minor:'9007199254740992'}],count:1}])await assert.rejects(()=>api.read({db:fake(reply),store:q.store.id}));
 await assert.rejects(()=>api.one({db:fake({data:[row,row]}),store:q.store.id,id:row.id}));
});
