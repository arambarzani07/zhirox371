/* Verified bounded customer/account reads. Financial mutations remain server RPCs. */
(() => {
 'use strict';
 const limit=500;
 function integer(value){
  if(typeof value!=='number'&&!(typeof value==='string'&&/^-?\d+$/.test(value)))throw Error('بڕی پارە پشتڕاست نەکراوەتەوە');
  const n=Number(value);if(!Number.isSafeInteger(n))throw Error('بڕی پارە لە سنووری دروست دەرچووە');return n;
 }
 function totals(rows){
  let added=0n,reduced=0n,paid=0n,cashPurchases=0n;
  for(const r of rows){
   const delta=BigInt(integer(r.delta_minor)),amount=BigInt(integer(r.amount_minor));if(amount<=0n)throw Error('بڕی مامەڵە نادروستە');
   if(delta>0n)added+=delta;else reduced-=delta;
   if(r.entry_type==='payment_received')paid+=amount;
   if(r.entry_type==='paid_purchase')cashPurchases+=amount;
  }
  return Object.fromEntries(Object.entries({added,reduced,paid,cashPurchases}).map(([k,v])=>[k,integer(String(v))]));
 }
 async function read({db,store}){
  if(!db||!store)throw Error('پەیوەندیی حیسابەکان بەردەست نییە');
  const [c,l]=await Promise.all([
   db.from('retail_customers').select('id,store_id,name,phone,address,credit_limit_minor,balance_minor,due_date,note,active,created_at,updated_at',{count:'exact'}).eq('store_id',store).eq('active',true).order('name',{ascending:true}).order('id',{ascending:true}).limit(limit),
   db.from('retail_customer_ledger').select('id,store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,sale_id,receipt_no,due_date,payment_method,note,actor_id,request_id,created_at',{count:'exact'}).eq('store_id',store).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit)
  ]);
  for(const r of [c,l]){if(r.error)throw r.error;if(!Array.isArray(r.data)||!Number.isSafeInteger(r.count)||r.count<r.data.length||r.data.length>limit||r.data.some(x=>!x?.id||x.store_id!==store))throw Error('داتای حیسابەکان ناتەواوە');}
  const customers=c.data.map(r=>{if(typeof r.name!=='string'||!r.name.trim()||r.active!==true)throw Error('زانیاریی کڕیار ناتەواوە');return {...r,balance_minor:integer(r.balance_minor),credit_limit_minor:integer(r.credit_limit_minor)};});
  const ledger=l.data.map(r=>{if(!r.customer_id||typeof r.entry_type!=='string')throw Error('تۆماری حیساب ناتەواوە');return {...r,amount_minor:integer(r.amount_minor),delta_minor:integer(r.delta_minor),balance_after_minor:integer(r.balance_after_minor)};});
  totals(ledger);integer(String(customers.filter(c=>c.balance_minor>0).reduce((sum,c)=>sum+BigInt(c.balance_minor),0n)));integer(String(customers.reduce((sum,c)=>sum+BigInt(c.balance_minor),0n)));
  return {customers,ledger,customerTotal:c.count,ledgerTotal:l.count};
 }
 window.RetailCustomerAccounts=Object.freeze({limit,integer,totals,read});
})();
