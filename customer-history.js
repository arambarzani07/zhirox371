/* Read-only customer ledger pages. Bounded account caches never define history scope. */
(() => {
 'use strict';
 const size=50,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function criteria({customer='all',phone='',kind='all',method='all',period='all',now=new Date()}={}){
  const id=String(customer),number=String(phone).trim();
  if(id!=='all'&&!uuid.test(id))throw Error('کڕیارەکە نادروستە');
  if(number.length>40||/[\r\n\t]/.test(number))throw Error('ژمارەی مۆبایل نادروستە');
  if(number&&id!=='all')throw Error('تەنها یەک ڕێگای هەڵبژاردنی کڕیار بەکاربهێنە');
  if(!['all','purchases','payments'].includes(kind))throw Error('جۆری مامەڵە نادروستە');
  if(!['all','cash_drawer','ledger_only'].includes(method))throw Error('شێوازی پارەدان نادروستە');
  const time=window.RetailReceiptHistory.criteria({period,now});
  return Object.freeze({customer:id.toLowerCase(),phone:number,kind,method,since:time.since,until:time.until});
 }
 async function read({db,store,filters,offset=0}){
  if(!db||!store||!filters||!Number.isSafeInteger(offset)||offset<0||offset%size)throw Error('داواکاریی مێژووی حیساب نادروستە');
  let customer=filters.customer;
  if(filters.phone){
   const found=await db.from('retail_customers').select('id,store_id').eq('store_id',store).eq('phone',filters.phone).limit(2);
   if(found.error)throw found.error;
   if(!Array.isArray(found.data)||found.data.some(c=>c.store_id!==store||!uuid.test(c.id)))throw Error('زانیاریی کڕیار پشتڕاست نەکراوەتەوە');
   if(found.data.length>1)throw Error('ئەم ژمارەیە بۆ زیاتر لە یەک کڕیار تۆمارکراوە؛ کڕیارەکە لە لیست هەڵبژێرە');
   if(!found.data.length)return {rows:[],total:0,offset};
   customer=found.data[0].id;
  }
  let q=db.from('retail_customer_ledger').select('id,store_id,customer_id,entry_type,amount_minor,delta_minor,balance_after_minor,sale_id,receipt_no,due_date,payment_method,note,actor_id,request_id,created_at,customer:retail_customers(id,store_id,name,phone)',{count:'exact'}).eq('store_id',store).lte('created_at',filters.until);
  if(customer!=='all')q=q.eq('customer_id',customer);
  if(filters.kind==='payments')q=q.eq('entry_type','payment_received');
  if(filters.kind==='purchases')q=q.neq('entry_type','payment_received');
  if(filters.method&&filters.method!=='all')q=q.eq('payment_method',filters.method);
  if(filters.since)q=q.gte('created_at',filters.since);
  const {data,error,count}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+size-1);
  if(error)throw error;
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length!==Math.min(size,Math.max(0,count-offset)))throw Error('مێژووی حیساب ناتەواوە');
  const ids=new Set(),integer=window.RetailCustomerAccounts.integer;
  const rows=data.map(r=>{
   if(!r?.id||ids.has(r.id)||r.store_id!==store||!r.customer_id||typeof r.entry_type!=='string'||!Number.isFinite(Date.parse(r.created_at)))throw Error('تۆماری حیساب نادروستە');
   ids.add(r.id);
   if(!Object.hasOwn(r,'customer')||(r.customer!==null&&(!r.customer||r.customer.id!==r.customer_id||r.customer.store_id!==store||typeof r.customer.name!=='string'||!r.customer.name.trim())))throw Error('کڕیاری مامەڵە پشتڕاست نەکراوەتەوە');
   return {...r,amount_minor:integer(r.amount_minor),delta_minor:integer(r.delta_minor),balance_after_minor:integer(r.balance_after_minor)};
  });
  window.RetailCustomerAccounts.totals(rows);
  return {rows,total:count,offset};
 }
 function paymentTotals(rows){
  const integer=window.RetailCustomerAccounts.integer;
  let total=0n,cash=0n,ledger=0n,unknown=0n,unknownCount=0;
  for(const r of rows){
   const amount=BigInt(integer(r.amount_minor)),delta=integer(r.delta_minor);
   if(r.entry_type!=='payment_received'||amount<=0n||delta>0)throw Error('تۆماری پارەدان نادروستە');
   total+=amount;if(r.payment_method==='cash_drawer')cash+=amount;else if(r.payment_method==='ledger_only')ledger+=amount;else{unknown+=amount;unknownCount++;}
  }
  return {...Object.fromEntries(Object.entries({total,cash,ledger,unknown}).map(([key,value])=>[key,integer(String(value))])),unknownCount};
 }
 window.RetailCustomerHistory=Object.freeze({size,criteria,read,paymentTotals});
})();
