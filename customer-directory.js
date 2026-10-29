/* Scoped customer pages and explicit customer lookup for directory actions. */
(() => {
 'use strict';
 const size=50,columns='id,store_id,name,phone,address,credit_limit_minor,balance_minor,due_date,note,active,created_at,updated_at',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function normalize(row,store){
  if(!row?.id||row.store_id!==store||row.active!==true||typeof row.name!=='string'||!row.name.trim())throw Error('زانیاریی کڕیار پشتڕاست نەکراوەتەوە');
  const integer=window.RetailCustomerAccounts.integer,balance=integer(row.balance_minor),limit=integer(row.credit_limit_minor);if(limit<0)throw Error('سنووری قەرز نادروستە');
  return {...row,balance_minor:balance,credit_limit_minor:limit};
 }
 function criteria({query='',field='name',status='all'}={}){
  const text=String(query).trim();
  if(!['name','phone','address','note'].includes(field)||!['all','debtors','clear'].includes(status)||text.length>120||text.includes('*'))throw Error('گەڕان یان پاڵاوتنی کڕیار نادروستە');
  return Object.freeze({field,status,pattern:text?'%'+text.replace(/[\\%_]/g,'\\$&')+'%':null});
 }
 async function read({db,store,filters=criteria(),offset=0,debtMode=null}){
  if(!db||!store||!filters||!Number.isSafeInteger(offset)||offset<0||offset%size)throw Error('داواکاریی لیستی کڕیاران نادروستە');
  let q=db.from('retail_customers').select(columns,{count:'exact'}).eq('store_id',store).eq('active',true);
  if(filters.pattern)q=q.ilike(filters.field,filters.pattern);
  if(filters.status==='debtors')q=q.gt('balance_minor',0);else if(filters.status==='clear')q=q.lte('balance_minor',0);
  if(debtMode){
   if(!['all_debtors','overdue','high_debt'].includes(debtMode.mode)||!/^\d{4}-\d{2}-\d{2}$/.test(debtMode.today))throw Error('پاڵاوتنی قەرز نادروستە');
   q=q.gt('balance_minor',0);if(debtMode.mode==='overdue')q=q.lt('due_date',debtMode.today);if(debtMode.mode==='high_debt')q=q.gte('balance_minor',100000);
   q=q.order('balance_minor',{ascending:false});
  }
  const {data,error,count}=await q.order('name',{ascending:true}).order('id',{ascending:true}).range(offset,offset+size-1);if(error)throw error;
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length!==Math.min(size,Math.max(0,count-offset)))throw Error('لیستی کڕیاران ناتەواوە');
  const rows=data.map(r=>normalize(r,store));if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('کڕیاری دووبارە لە وەڵامدا هەیە');totals(rows);
  return {rows,total:count,offset};
 }
 async function one({db,store,id}){
  if(!db||!store||!uuid.test(id))throw Error('کڕیارە هەڵبژێردراوەکە نادروستە');
  const {data,error}=await db.from('retail_customers').select(columns).eq('store_id',store).eq('id',id).eq('active',true).limit(2);if(error)throw error;
  if(!Array.isArray(data)||data.length!==1||data[0].id!==id)throw Error('کڕیارە هەڵبژێردراوەکە بەردەست نییە');return normalize(data[0],store);
 }
 function totals(rows){
  let debt=0n,balance=0n,debtors=0,over=0;
  for(const row of rows){const n=window.RetailCustomerAccounts.integer(row.balance_minor),limit=window.RetailCustomerAccounts.integer(row.credit_limit_minor);balance+=BigInt(n);if(n>0){debtors++;debt+=BigInt(n);}if(limit>0&&n>limit)over++;}
  return {debt:window.RetailCustomerAccounts.integer(String(debt)),balance:window.RetailCustomerAccounts.integer(String(balance)),debtors,over};
 }
 window.RetailCustomerDirectory=Object.freeze({size,criteria,read,one,totals});
})();
