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
