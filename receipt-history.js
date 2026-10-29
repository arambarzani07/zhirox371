/* Read-only receipt history. Independent from bounded reporting/return caches. */
(() => {
 'use strict';
 const size=50;
 const columns='id,store_id,receipt_no,total_minor,discount_minor,cash_received_minor,change_due_minor,cashier_id,status,refunded,returned_minor_total,created_at';
 function criteria({query='',status='all',period='all',now=new Date()}={}){
  const raw=String(query).trim().replace(/^#/,'').replace(/[٠-٩۰-۹]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
  if(raw&&(!/^\d{1,19}$/.test(raw)||BigInt(raw)<1n||BigInt(raw)>9223372036854775807n))throw Error('ژمارەیەکی دروستی پسووڵە بنووسە');
  if(!['all','active','refunded'].includes(status)||!['all','today','7d','30d'].includes(period))throw Error('پاڵاوتنەکە نادروستە');
  const date=new Date(now);if(!Number.isFinite(date.getTime()))throw Error('کاتی پشکنین نادروستە');
  const until=date.toISOString();let since=null;
  if(period==='today'){
   // Baghdad is UTC+03; do not use the cashier device's timezone for store days.
   const day=new Date(date.getTime()+3*3600000).toISOString().slice(0,10);
   since=new Date(day+'T00:00:00+03:00').toISOString();
  }else if(period!=='all')since=new Date(date.getTime()-(period==='7d'?7:30)*86400000).toISOString();
  return Object.freeze({receipt:raw?BigInt(raw).toString():null,status,since,until});
 }
 async function read({db,store,filters,offset=0}){
  if(!db||!store||!filters||!Number.isSafeInteger(offset)||offset<0||offset%size)throw Error('داواکاریی پسووڵە نادروستە');
  let q=db.from('retail_sales').select(columns,{count:'exact'}).eq('store_id',store).eq('status','posted').lte('created_at',filters.until);
  if(filters.receipt)q=q.eq('receipt_no',filters.receipt);
  if(filters.status!=='all')q=q.eq('refunded',filters.status==='refunded');
  if(filters.since)q=q.gte('created_at',filters.since);
  const {data,error,count}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+size-1);
  if(error)throw error;
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length>size||data.some(r=>!r?.id||r.store_id!==store||r.status!=='posted'))throw Error('وەڵامی لیستی پسووڵەکان ناتەواوە');
  return {rows:data,total:count,offset};
 }
 window.RetailReceiptHistory=Object.freeze({size,criteria,read});
})();
