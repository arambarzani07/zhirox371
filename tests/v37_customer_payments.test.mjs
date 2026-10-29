import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const window={};for(const f of ['receipt-history.js','customer-accounts.js','customer-history.js','tests/browser/qa_supabase_fixture.js'])runInNewContext(readFileSync(f,'utf8'),{window,Date,URL,Map,Set,localStorage:{getItem:()=>null}});
const api=window.RetailCustomerHistory,q=window.__retailQA,db=window.supabase.createClient(),now=new Date('2026-10-29T13:00:00Z');
const customer={id:'cccccccc-cccc-4ccc-8ccc-000000000037',store_id:q.store.id,name:'Archived payer',phone:'0750-OLD',active:false};q.customers.push(customer);
for(let i=0;i<623;i++)q.customerLedger.push({id:'p-'+String(i).padStart(6,'0'),store_id:q.store.id,customer_id:customer.id,entry_type:'payment_received',amount_minor:1000,delta_minor:-1000,balance_after_minor:1000,payment_method:i===0?null:i%2?'cash_drawer':'ledger_only',note:'note '+i,created_at:new Date(now.getTime()-(i+1)*1000).toISOString()});
q.customerLedger.push({...q.customerLedger[0],id:'foreign',store_id:'other'},{...q.customerLedger[0],id:'not-a-payment',entry_type:'debt_add',delta_minor:1000});
test('all payment pages are read before bounded caches, without debt entries or other stores',async()=>{
 const filters=api.criteria({now,kind:'payments'}),ids=[];for(let offset=0;offset<623;offset+=50){const page=await api.read({db,store:q.store.id,filters,offset});assert.equal(page.total,623);assert.equal(page.rows.length,offset===600?23:50);assert.equal(page.rows[0].customer.name,customer.name);ids.push(...page.rows.map(r=>r.id));}
 assert.equal(new Set(ids).size,623);assert.equal(ids.includes('foreign'),false);assert.equal(ids.includes('not-a-payment'),false);
});
test('cash and ledger-only filters run on server, including archived payer lookup by exact phone',async()=>{
 const read=opts=>api.read({db,store:q.store.id,filters:api.criteria({now,kind:'payments',...opts})});assert.equal((await read({method:'cash_drawer'})).total,311);assert.equal((await read({method:'ledger_only'})).total,311);assert.equal((await read({phone:customer.phone})).total,623);assert.equal((await read({phone:'missing'})).total,0);assert.throws(()=>api.criteria({method:'bad'}));
});
test('payment totals never treat ledger discounts or unknown methods as drawer cash',()=>{
 const sums=api.paymentTotals(q.customerLedger.slice(0,3));assert.equal(sums.total,3000);assert.equal(sums.cash,1000);assert.equal(sums.ledger,1000);assert.equal(sums.unknown,1000);assert.equal(sums.unknownCount,1);
 assert.throws(()=>api.paymentTotals([{...q.customerLedger[0],delta_minor:1}]));assert.throws(()=>api.paymentTotals([{...q.customerLedger[0],entry_type:'debt_add'}]));assert.throws(()=>api.paymentTotals([{...q.customerLedger[0],amount_minor:Number.MAX_SAFE_INTEGER},{...q.customerLedger[0],amount_minor:1}]));
});
const source=readFileSync('operations.js','utf8');
function ui(read){
 const nodes=new Map(),ctx={window:{RetailCustomerHistory:{criteria:api.criteria,read,paymentTotals:api.paymentTotals}},db:{},store:{id:'shop'},user:{id:'actor'},customersReady:true,customerPayToken:0,customerPayReady:true,customerPayLoading:false,customerPayRows:[{}],customerPayOffset:0,customerPayTotal:1,customerPayFilters:null,customerPayTimer:null,clearTimeout(){},$:id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,replaceChildren(){this.cleared=true;}});return nodes.get(id);},renderCustomerPaymentsView(){},syncCustomerPaymentsPager(){},msg(){},safe:String};
 for(const id of ['cpay-customer-filter','cpay-method-filter','cpay-date-filter'])ctx.$(id).value='all';const body=source.slice(source.indexOf('async function refreshCustomerPaymentsPage('),source.indexOf('function invalidateCustomerPayments('));runInNewContext(body+';this.refresh=refreshCustomerPaymentsPage;',ctx);return ctx;
}
test('obsolete filter and logout replies cannot restore old payments or printable vouchers',async()=>{
 const replies=[],ctx=ui(()=>new Promise(r=>replies.push(r))),entry={...q.customerLedger[0]};const a=ctx.refresh(),b=ctx.refresh();assert.equal(ctx.customerPayReady,false);assert.equal(ctx.$('cpay-voucher-box').hidden,true);
 replies[1]({rows:[{...entry,id:'new'}],total:1});await b;replies[0]({rows:[{...entry,id:'old'}],total:1});await a;assert.equal(ctx.customerPayRows[0].id,'new');
 const c=ctx.refresh();ctx.customerPayToken++;ctx.user=null;replies[2]({rows:[entry],total:1});await c;assert.equal(ctx.customerPayReady,false);assert.equal(ctx.customerPayRows.length,0);
});
test('payment read failure clears totals and an emptied final page recovers with frozen criteria',async()=>{
 const calls=[],ctx=ui(async args=>{calls.push(args);return args.offset===600?{rows:[],total:501}:{rows:[q.customerLedger[0]],total:501};});ctx.customerPayOffset=600;ctx.customerPayFilters=api.criteria({kind:'payments'});await ctx.refresh(false);assert.equal(ctx.customerPayOffset,500);assert.equal(calls.length,2);assert.equal(calls[0].filters,calls[1].filters);
 const failed=ui(async()=>{throw Error('denied');});await failed.refresh();assert.equal(failed.customerPayReady,false);assert.equal(failed.customerPayRows.length,0);assert.equal(failed.customerPayTotal,0);assert.equal(failed.customerPayLoading,false);
});
test('payment voucher uses the verified page, full entry identity and historical balance; ledger-only is never labeled cash',()=>{
 const node=()=>({textContent:'',style:{},children:[],hidden:true,append(...xs){this.children.push(...xs);},replaceChildren(){this.children=[];},addEventListener(){}}),box=node();
 const entry={...q.customerLedger[2],id:'full-unique-entry-id-123',customer,balance_after_minor:321};const ctx={customersReady:true,customerPayReady:true,customerPayRows:[entry],customerLedgerList:[{...entry,id:'stale',balance_after_minor:99999}],$:()=>box,document:{createElement:node},money:n=>String(n),window:{print(){}}};
 runInNewContext(source.slice(source.indexOf('function customerPaymentMethodLabel('),source.indexOf('function renderCustomerPaymentsView('))+source.slice(source.indexOf('function renderCustomerPaymentVoucher('),source.indexOf('function localSuppliersKey('))+';this.voucher=renderCustomerPaymentVoucher;',ctx);
 ctx.voucher('stale');assert.equal(box.hidden,true);ctx.voucher(entry.id);assert.equal(box.hidden,false);const text=n=>n.textContent+' '+n.children.map(text).join(' '),content=text(box);assert.match(content,/full-unique-entry-id-123/);assert.match(content,/321/);assert.match(content,/داشکاندنی حیساب/);assert.doesNotMatch(content,/نەقد|99999/);
});
test('opening a customer payment waits for fresh account selectors before selecting the requested payer',async()=>{
 let resolve,refreshed=false;const select={value:'old',options:[]},amount={value:'old',focus(){this.focused=true;}},ctx={store:{id:'shop'},user:{id:'actor'},customersList:[],selectCustomerSub(){},loadCustomersAndLedger:()=>new Promise(r=>resolve=r),$:id=>id==='cpay-customer'?select:amount,msg(){},refreshCustomerPaymentsPage:async()=>{refreshed=true;}};
 runInNewContext(source.slice(source.indexOf('async function openCustomerPaymentForm('),source.indexOf('function filterCustomerPaymentRows('))+';this.open=openCustomerPaymentForm;',ctx);
 const pending=ctx.open('wanted');assert.equal(select.value,'old');ctx.customersList=[{id:'wanted',balance_minor:750}];select.options=[{value:'other'},{value:'wanted'}];resolve(true);await pending;assert.equal(select.value,'wanted');assert.equal(amount.value,'750');assert.equal(refreshed,true);
});
