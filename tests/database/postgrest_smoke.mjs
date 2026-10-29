// Real Auth/JWT/PostgREST smoke checks, ONLY against the disposable local CI stack.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createClient} from '@supabase/supabase-js';
const local=JSON.parse(execFileSync('supabase',['status','-o','json'],{encoding:'utf8'}));
const url=local.API_URL||local.api_url,anon=local.ANON_KEY||local.anon_key,service=local.SERVICE_ROLE_KEY||local.service_role_key;
assert.match(url||'',/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/);
assert.ok(anon&&service);assert.ok(!process.env.SUPABASE_ACCESS_TOKEN,'Never run on hosted Supabase');
const make=(key=anon)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const admin=make(service);
const ok=(result,label)=>{assert.equal(result.error,null,label+': '+result.error?.message);return result.data;};
async function login(){
 const client=make(),email='v21-'+randomUUID()+'@qa.invalid',password='Qa_V21_'+randomUUID()+'_Only!';
 const auth=ok(await client.auth.signUp({email,password}),'local signup');
 if(!auth.session)ok(await admin.auth.admin.updateUserById(auth.user.id,{email_confirm:true}),'local confirmation');
 const signed=ok(await client.auth.signInWithPassword({email,password}),'local login');
 return {id:auth.user.id,client:createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+signed.session.access_token}}})};
}
const owner=await login(),outsider=await login(),db=owner.client;
const store=randomUUID();ok(await db.from('retail_stores').insert({id:store,owner_user_id:owner.id,name:'V21 local QA',currency:'IQD'}),'create local store');
const product=ok(await db.rpc('retail_create_product',{p_store_id:store,p_name:'API test item',p_barcode:'V21-UNIT',p_price_minor:1000}),'owner product RPC');
ok(await db.rpc('retail_receive_packs_v17',{p_store:store,p_request:randomUUID(),p_barcode:'V21-UNIT',p_packages:5,p_expected_units:1,p_reason:'opening'}),'stock receipt RPC');
ok(await db.rpc('retail_shift_open',{p_store:store,p_opening:5000}),'open shift');
const party=ok(await db.rpc('retail_save_party_v21',{p_store:store,p_request:randomUUID(),p_kind:'customer',p_party:{name:'API customer',credit_limit:5000,opening_balance:0}}),'create customer atomically');
const args={p_store:store,p_request:randomUUID(),p_items:[{barcode:'V21-UNIT',quantity:1,expected_price_minor:1000,expected_units:1}],p_cash_received:1000,p_discount:0,p_customer:party.id,p_paid:200};
const sale=ok(await db.rpc('retail_checkout_customer_v21',args),'credit checkout through PostgREST');
assert.equal(ok(await db.rpc('retail_checkout_customer_v21',args),'same credit retry'),sale);
const customer=ok(await db.from('retail_customers').select('balance_minor').eq('id',party.id).single(),'read customer');assert.equal(customer.balance_minor,800);
const stock=ok(await db.from('retail_stock_balances').select('quantity').eq('product_id',product).single(),'read stock');assert.equal(Number(stock.quantity),4);
assert.ok((await outsider.client.rpc('retail_resolve_barcode_v18',{p_store:store,p_code:'V21-UNIT'})).error,'other tenant must be denied');
assert.ok((await make().rpc('retail_resolve_barcode_v18',{p_store:store,p_code:'V21-UNIT'})).error,'anonymous caller must be denied');
assert.ok((await db.from('retail_products').select('purchase_price_minor')).error,'cost column must stay protected');
const payment={p_store:store,p_customer:party.id,p_entry_type:'payment_received',p_amount:200,p_note:'API QA',p_payment_method:'cash_drawer',p_request:randomUUID()};
ok(await db.rpc('retail_record_customer_ledger_v19',payment),'atomic debt payment');ok(await db.rpc('retail_record_customer_ledger_v19',payment),'payment replay');
assert.equal(ok(await db.from('retail_customers').select('balance_minor').eq('id',party.id).single(),'balance after payment').balance_minor,600);
console.log('PASS: actual production upgrade through real local Auth/JWT/PostgREST: product, stock, customer, atomic credit/payment, replay, tenant isolation and cost permissions');
const state=ok(await db.rpc('retail_return_state_v22',{p_store:store,p_sale:sale}),'real return state');assert.equal(state.items.length,1);
const session=ok(await db.from('retail_cash_sessions').select('id').eq('store_id',store).eq('status','open').single(),'read shift');
const refund=ok(await db.rpc('retail_return_item_v22',{p_store:store,p_sale:sale,p_line:state.items[0].id,p_quantity:1,p_session:session.id,p_request:randomUUID(),p_note:'Local API QA'}),'linked credit return');
assert.equal(refund.debt_reduced_minor,600);assert.equal(refund.cash_refunded_minor,400);
assert.equal(ok(await db.from('retail_customers').select('balance_minor').eq('id',party.id).single(),'after credit return').balance_minor,0);
const report=ok(await db.rpc('retail_report_v22',{p_store:store,p_kind:'sales'}),'real report RPC');assert.equal(Number(report.summary.net_minor),0);assert.equal(Number(report.summary.refund_minor),1000);
console.log('PASS: V22 real PostgREST linked credit return, exact cash/debt split and complete report RPC');

const workflowId=randomUUID(),workflowRequest=randomUUID();const workflowArgs={p_store:store,p_request:workflowRequest,p_id:workflowId,p_topic:'attendance',p_version:0,p_action:'save',p_data:{name:'Real JWT staff record',date:'2026-10-28',status:'present'}};
const workflow=ok(await db.rpc('retail_workflow_write_v27',workflowArgs),'workflow through real JWT');assert.equal(workflow.record.id,workflowId);assert.equal(workflow.record.version,1);assert.equal(ok(await db.rpc('retail_workflow_write_v27',workflowArgs),'workflow replay').record.version,1);
assert.equal(ok(await db.rpc('retail_workflow_list_v27',{p_store:store,p_topic:'attendance'}),'workflow list').rows[0].id,workflowId);
assert.ok((await db.from('retail_workflow_records').update({status:'archived'}).eq('id',workflowId)).error,'direct workflow writes must be denied');
console.log('PASS: V27 real authenticated workflow RPC, durable replay, server read and denied direct write');

const receiptWindow={};runInNewContext(readFileSync('receipt-history.js','utf8'),{window:receiptWindow,Date});
const receiptApi=receiptWindow.RetailReceiptHistory;
const posted=ok(await db.from('retail_sales').select('receipt_no').eq('id',sale).single(),'receipt search identity');
const receiptFilters=receiptApi.criteria({query:String(posted.receipt_no),status:'refunded'});
const receiptPage=await receiptApi.read({db,store,filters:receiptFilters});assert.equal(receiptPage.total,1);assert.equal(receiptPage.rows[0].id,sale);
const hiddenReceipts=await receiptApi.read({db:outsider.client,store,filters:receiptFilters});assert.equal(hiddenReceipts.total,0);assert.equal(hiddenReceipts.rows.length,0);
console.log('PASS: V28 actual receipt history helper through JWT/PostgREST exact count, server lookup/refund filter and tenant RLS');

runInNewContext(readFileSync('audit-history.js','utf8'),{window:receiptWindow,Date});const auditApi=receiptWindow.RetailAuditHistory;
const auditPage=await auditApi.read({db,store,filters:auditApi.criteria({query:'stock.receive_packs_v17'})});assert.equal(auditPage.total,1);assert.equal(auditPage.rows[0].action,'stock.receive_packs_v17');assert.equal('details' in auditPage.rows[0],false);
const actorAudit=await auditApi.read({db,store,filters:auditApi.criteria({field:'actor_id',query:owner.id})});assert.ok(actorAudit.total>0);
const hiddenAudit=await auditApi.read({db:outsider.client,store,filters:auditApi.criteria()});assert.equal(hiddenAudit.total,0);assert.equal(hiddenAudit.rows.length,0);
console.log('PASS V30: actual audit helper through JWT/PostgREST, literal underscore search, actor filter and tenant RLS');

runInNewContext(readFileSync('payments-history.js','utf8'),{window:receiptWindow,Date});const paymentApi=receiptWindow.RetailPaymentsHistory;
ok(await db.rpc('retail_cash_movement',{p_store:store,p_session:session.id,p_request:randomUUID(),p_kind:'cash_in',p_amount:173,p_note:'v31_literal%_fee'}),'cash history seed');
const paymentFilters=paymentApi.criteria({query:'v31_literal%_fee',kind:'cash_in'});
const paymentPage=await paymentApi.read({db,store,session:session.id,filters:paymentFilters});assert.equal(paymentPage.total,1);assert.equal(Number(paymentPage.rows[0].amount_minor),173);
const amountPage=await paymentApi.read({db,store,session:session.id,filters:paymentApi.criteria({field:'amount_minor',query:'173'})});assert.equal(amountPage.total,1);
const hiddenPayments=await paymentApi.read({db:outsider.client,store,session:session.id,filters:paymentFilters});assert.equal(hiddenPayments.total,0);
console.log('PASS V31: actual cash helper through JWT/PostgREST, literal pattern, exact amount, shift scope and tenant RLS');

runInNewContext(readFileSync('shift-history.js','utf8'),{window:receiptWindow,Date});const shiftApi=receiptWindow.RetailShiftHistory;
const activeShift=await shiftApi.current({db,store,actor:owner.id});assert.equal(activeShift.id,session.id);
assert.equal(shiftApi.summary(ok(await db.rpc('retail_shift_summary',{p_store:store,p_session:session.id}),'verified summary'),session.id).session_id,session.id);
const shiftPage=await shiftApi.read({db,store,actor:owner.id,filters:shiftApi.criteria({status:'open'})});assert.equal(shiftPage.total,1);assert.equal(shiftPage.rows[0].id,session.id);
assert.equal(await shiftApi.current({db:outsider.client,store,actor:owner.id}),null);
assert.equal((await shiftApi.read({db:outsider.client,store,actor:owner.id,filters:shiftApi.criteria()})).total,0);
console.log('PASS V32: actual active shift, verified summary, paginated own-cashier history and tenant RLS through local JWT/PostgREST');

runInNewContext(readFileSync('customer-accounts.js','utf8'),{window:receiptWindow,Date});const customerApi=receiptWindow.RetailCustomerAccounts;
const customerSnapshot=await customerApi.read({db,store});assert.equal(customerSnapshot.customerTotal,1);assert.equal(customerSnapshot.customers[0].balance_minor,0);
const customerTotals=customerApi.totals(customerSnapshot.ledger);assert.equal(customerTotals.added,800);assert.equal(customerTotals.reduced,800);assert.ok(customerSnapshot.ledger.some(r=>r.entry_type==='sale_return'&&r.delta_minor===-600));
const hiddenCustomers=await customerApi.read({db:outsider.client,store});assert.equal(hiddenCustomers.customerTotal,0);assert.equal(hiddenCustomers.ledgerTotal,0);
console.log('PASS V33: actual bounded customer reads/counts, signed credit/return/payment deltas, current balance and tenant RLS through local JWT/PostgREST');

runInNewContext(readFileSync('stock-movement-reads.js','utf8'),{window:receiptWindow,Date});const stockHistoryApi=receiptWindow.RetailStockMovementReads;
const stockFilters=stockHistoryApi.criteria({product});
const beforeHistory=await stockHistoryApi.read({db,store,filters:stockFilters});assert.ok(beforeHistory.total>=3);assert.equal(beforeHistory.rows[0].product.id,product);assert.equal(beforeHistory.rows[0].product.base_unit,'unit');assert.equal('purchase_price_minor' in beforeHistory.rows[0].product,false);
const seeded=Array.from({length:263},(_,i)=>({id:randomUUID(),store_id:store,product_id:product,delta:i%2?-1:2,reason:i%2?'sale':'purchase',created_at:new Date(Date.now()-86400000-i*1000).toISOString()}));
ok(await admin.from('retail_stock_events').insert(seeded),'seed disposable V35 stock pages');
const stockAll=stockHistoryApi.criteria({product}),stockIds=[];let stockTotal;
for(let offset=0;offset<beforeHistory.total+263;offset+=50){const page=await stockHistoryApi.read({db,store,filters:stockAll,offset});stockTotal=page.total;stockIds.push(...page.rows.map(r=>r.id));}
assert.equal(stockTotal,beforeHistory.total+263);assert.equal(stockIds.length,stockTotal);assert.equal(new Set(stockIds).size,stockTotal);
assert.equal((await stockHistoryApi.read({db,store,filters:stockHistoryApi.criteria({product,type:'out'})})).total,132);
assert.equal((await stockHistoryApi.read({db:outsider.client,store,filters:stockAll})).total,0);
console.log('PASS V35: actual PostgREST product embedding, 263+ canonical history rows across pages, exact counts, direction filter, no cost fields and tenant RLS');

runInNewContext(readFileSync('customer-history.js','utf8'),{window:receiptWindow,Date});const historyApi=receiptWindow.RetailCustomerHistory;
ok(await admin.from('retail_customers').update({phone:'07509990000'}).eq('id',party.id).eq('store_id',store),'set disposable historical phone');
const ledgerBefore=await historyApi.read({db,store,filters:historyApi.criteria({customer:party.id})});assert.equal(ledgerBefore.total,customerSnapshot.ledgerTotal);assert.equal(ledgerBefore.rows[0].customer.id,party.id);
const oldLedger=Array.from({length:623},(_,i)=>({id:randomUUID(),store_id:store,customer_id:party.id,entry_type:'paid_purchase',amount_minor:1000,delta_minor:0,balance_after_minor:0,note:'V36 disposable historical purchase',actor_id:owner.id,created_at:new Date(Date.now()-86400000-i*1000).toISOString()}));
ok(await admin.from('retail_customer_ledger').insert(oldLedger),'seed disposable V36 ledger pages');
const historicalFilters=historyApi.criteria({phone:'07509990000'}),ledgerIds=[];for(let offset=0;offset<ledgerBefore.total+623;offset+=50){const page=await historyApi.read({db,store,filters:historicalFilters,offset});assert.equal(page.total,ledgerBefore.total+623);ledgerIds.push(...page.rows.map(r=>r.id));}
assert.equal(ledgerIds.length,ledgerBefore.total+623);assert.equal(new Set(ledgerIds).size,ledgerIds.length);
assert.equal((await historyApi.read({db,store,filters:historyApi.criteria({phone:'07509990000',kind:'payments'})})).total,1);
assert.equal((await historyApi.read({db:outsider.client,store,filters:historyApi.criteria()})).total,0);
console.log('PASS V36: actual PostgREST ledger/customer embedding, 623+ rows, exact phone and payment filters, safe money and tenant RLS');

const paymentBefore=await historyApi.read({db,store,filters:historyApi.criteria({kind:'payments'})});assert.equal(paymentBefore.total,1);
const archivedPayments=Array.from({length:523},(_,i)=>({id:randomUUID(),store_id:store,customer_id:party.id,entry_type:'payment_received',amount_minor:1000,delta_minor:-1000,balance_after_minor:1000,payment_method:i===0?null:i%2?'cash_drawer':'ledger_only',note:'V37 disposable payment',actor_id:owner.id,created_at:new Date(Date.now()-172800000-i*1000).toISOString()}));
ok(await admin.from('retail_customer_ledger').insert(archivedPayments),'seed disposable V37 payments');
const paymentHistoryFilters=historyApi.criteria({phone:'07509990000',kind:'payments'}),payerIds=[];
for(let offset=0;offset<524;offset+=50){const page=await historyApi.read({db,store,filters:paymentHistoryFilters,offset});assert.equal(page.total,524);historyApi.paymentTotals(page.rows);payerIds.push(...page.rows.map(r=>r.id));}
assert.equal(new Set(payerIds).size,524);assert.equal((await historyApi.read({db,store,filters:historyApi.criteria({kind:'payments',method:'cash_drawer'})})).total,262);assert.equal((await historyApi.read({db,store,filters:historyApi.criteria({kind:'payments',method:'ledger_only'})})).total,261);
assert.equal((await historyApi.read({db:outsider.client,store,filters:paymentHistoryFilters})).total,0);
console.log('PASS V37: actual PostgREST payment paging beyond 500, method filtering, exact phone, embedded identity and tenant RLS');

runInNewContext(readFileSync('customer-directory.js','utf8'),{window:receiptWindow,Date});const directoryApi=receiptWindow.RetailCustomerDirectory;
const directoryBefore=await directoryApi.read({db,store});
const customerSeeds=Array.from({length:623},(_,i)=>({id:randomUUID(),store_id:store,name:String(i).padStart(4,'0')+' V38 Customer',phone:'V38-'+i,active:true,balance_minor:i%2?1000:0,credit_limit_minor:5000,note:i===622?'V38 literal%_match':'other'}));
ok(await admin.from('retail_customers').insert(customerSeeds),'seed disposable V38 directory');
const customerIds=[];for(let offset=0;offset<directoryBefore.total+623;offset+=50){const page=await directoryApi.read({db,store,offset});assert.equal(page.total,directoryBefore.total+623);customerIds.push(...page.rows.map(c=>c.id));}assert.equal(new Set(customerIds).size,directoryBefore.total+623);
const matchedCustomer=await directoryApi.read({db,store,filters:directoryApi.criteria({field:'note',query:'V38 literal%_match'})});assert.equal(matchedCustomer.total,1);assert.equal(matchedCustomer.rows[0].id,customerSeeds[622].id);
assert.equal((await directoryApi.one({db,store,id:customerSeeds[622].id})).id,customerSeeds[622].id);assert.equal((await directoryApi.read({db:outsider.client,store})).total,0);await assert.rejects(()=>directoryApi.one({db:outsider.client,store,id:customerSeeds[622].id}));
console.log('PASS V38: actual PostgREST customer paging beyond 500, escaped literal search, selected customer lookup and tenant RLS');

const debtSeeds=Array.from({length:623},(_,i)=>({id:randomUUID(),store_id:store,name:String(i).padStart(4,'0')+' V39 Debtor',phone:'V39-'+i,active:true,balance_minor:1000+i*1000,credit_limit_minor:500000,due_date:i%3===0?'2026-10-28':i%3===1?'2026-10-29':null}));
ok(await admin.from('retail_customers').insert(debtSeeds),'seed disposable V39 debtors');
const debtFilters=directoryApi.criteria({query:'V39 Debtor'}),debtMode={mode:'all_debtors',today:'2026-10-29'},debtIds=[];
for(let offset=0;offset<623;offset+=50){const page=await directoryApi.read({db,store,offset,filters:debtFilters,debtMode});assert.equal(page.total,623);debtIds.push(...page.rows.map(c=>c.id));}
assert.equal(new Set(debtIds).size,623);assert.equal(debtIds[0],debtSeeds[622].id);assert.equal(debtIds.at(-1),debtSeeds[0].id);
assert.equal((await directoryApi.read({db,store,filters:debtFilters,debtMode:{...debtMode,mode:'overdue'}})).total,208);
const highDebtLast=await directoryApi.read({db,store,filters:debtFilters,offset:500,debtMode:{...debtMode,mode:'high_debt'}});assert.equal(highDebtLast.total,524);assert.equal(highDebtLast.rows.at(-1).balance_minor,100000);
assert.equal((await directoryApi.read({db:outsider.client,store,filters:debtFilters,debtMode})).total,0);
console.log('PASS V39: actual PostgREST 623 debtors, numeric ordering, date boundary, high-debt threshold and tenant RLS');

runInNewContext(readFileSync('supplier-accounts.js','utf8'),{window:receiptWindow,Date});const supplierApi=receiptWindow.RetailSupplierAccounts;
const supplierSeeds=Array.from({length:523},(_,i)=>({id:randomUUID(),store_id:store,name:String(i).padStart(4,'0')+' V41 Supplier',active:true,balance_minor:1000}));
ok(await admin.from('retail_suppliers').insert(supplierSeeds),'seed disposable V41 suppliers');
ok(await admin.from('retail_purchase_orders').insert(supplierSeeds.map((s,i)=>({id:randomUUID(),store_id:store,supplier_id:s.id,po_no:'V41-'+i,product_id:product,product_name:'V41 product',quantity:1.5,unit_cost_minor:1000,total_cost_minor:1500,status:'pending'}))),'seed disposable V41 orders');
ok(await admin.from('retail_supplier_ledger').insert(supplierSeeds.map(s=>({id:randomUUID(),store_id:store,supplier_id:s.id,entry_type:'purchase_credit',amount_minor:1500,delta_minor:1500,balance_after_minor:1500}))),'seed disposable V41 supplier ledger');
const suppliersSnapshot=await supplierApi.read({db,store});assert.equal(suppliersSnapshot.supplierTotal,523);assert.equal(suppliersSnapshot.orderTotal,523);assert.equal(suppliersSnapshot.ledgerTotal,523);assert.equal(suppliersSnapshot.suppliers.length,500);assert.equal(supplierApi.totals(suppliersSnapshot.suppliers,suppliersSnapshot.orders,suppliersSnapshot.ledger).payable,500000);
const hiddenSuppliers=await supplierApi.read({db:outsider.client,store});assert.equal(hiddenSuppliers.supplierTotal,0);assert.equal(hiddenSuppliers.orderTotal,0);assert.equal(hiddenSuppliers.ledgerTotal,0);
console.log('PASS V41: actual Auth/PostgREST supplier snapshots, exact bounded counts, money normalization and tenant RLS');

runInNewContext(readFileSync('supplier-directory.js','utf8'),{window:receiptWindow,Date});const supplierDirectoryApi=receiptWindow.RetailSupplierDirectory;
const supplierDirectorySeeds=Array.from({length:623},(_,i)=>({id:randomUUID(),store_id:store,name:String(i).padStart(4,'0')+' V42 Supplier',company:'V42 company',phone:'V42-'+i,category:'V42 category',active:true,balance_minor:i%2?1000:0,note:i===622?'V42 literal%_match':'other'}));
ok(await admin.from('retail_suppliers').insert(supplierDirectorySeeds),'seed disposable V42 supplier directory');
const supplierDirectoryFilters=supplierDirectoryApi.criteria({query:'V42 Supplier'}),supplierDirectoryIds=[];
for(let offset=0;offset<623;offset+=50){const page=await supplierDirectoryApi.read({db,store,offset,filters:supplierDirectoryFilters});assert.equal(page.total,623);supplierDirectoryIds.push(...page.rows.map(s=>s.id));}assert.equal(new Set(supplierDirectoryIds).size,623);
const supplierLiteral=await supplierDirectoryApi.read({db,store,filters:supplierDirectoryApi.criteria({field:'note',query:'V42 literal%_match'})});assert.equal(supplierLiteral.total,1);assert.equal(supplierLiteral.rows[0].id,supplierDirectorySeeds[622].id);
const explicitSupplier=await supplierDirectoryApi.one({db,store,id:supplierDirectorySeeds[622].id});assert.equal(explicitSupplier.company,'V42 company');assert.equal(explicitSupplier.category,'V42 category');assert.equal((await supplierDirectoryApi.read({db:outsider.client,store,filters:supplierDirectoryFilters})).total,0);await assert.rejects(()=>supplierDirectoryApi.one({db:outsider.client,store,id:supplierDirectorySeeds[622].id}));
console.log('PASS V42: actual PostgREST supplier pages beyond 500, literal search, complete profile columns, exact lookup and tenant RLS');

runInNewContext(readFileSync('purchase-order-pages.js','utf8'),{window:receiptWindow,Date});const purchasePageApi=receiptWindow.RetailPurchaseOrderPages;
const pagedOrderSeeds=Array.from({length:623},(_,i)=>({id:randomUUID(),store_id:store,po_no:'V43-'+String(i).padStart(4,'0'),supplier_id:supplierDirectorySeeds[i].id,supplier_name:'V43 supplier snapshot',product_id:product,product_name:'V43 product snapshot',quantity:1.5,unit_cost_minor:1000,total_cost_minor:1500,status:['pending','ordered','received','cancelled'][i%4],note:i===622?'V43 literal%_match':'other',created_at:new Date(1760000000000-i*1000).toISOString()}));
ok(await admin.from('retail_purchase_orders').insert(pagedOrderSeeds),'seed disposable V43 order pages');
const orderPageFilters=purchasePageApi.criteria({query:'V43 product snapshot',field:'product_name'}),pagedOrderIds=[];
for(let offset=0;offset<623;offset+=50){const page=await purchasePageApi.read({db,store,filters:orderPageFilters,offset});assert.equal(page.total,623);pagedOrderIds.push(...page.rows.map(o=>o.id));}assert.equal(new Set(pagedOrderIds).size,623);assert.equal(pagedOrderIds.at(-1),pagedOrderSeeds[622].id);
assert.equal((await purchasePageApi.read({db,store,filters:purchasePageApi.criteria({query:'V43 literal%_match',field:'note'})})).total,1);assert.equal((await purchasePageApi.read({db,store,filters:purchasePageApi.criteria({query:'V43 product snapshot',field:'product_name',status:'ordered'})})).total,156);
assert.equal((await purchasePageApi.one({db,store,id:pagedOrderSeeds[600].id})).quantity,1.5);assert.equal((await purchasePageApi.read({db:outsider.client,store,filters:orderPageFilters})).total,0);await assert.rejects(()=>purchasePageApi.one({db:outsider.client,store,id:pagedOrderSeeds[600].id}));
console.log('PASS V43: actual PostgREST 623 order pages, recorded-name search, exact action lookup, numeric quantities and tenant RLS');
