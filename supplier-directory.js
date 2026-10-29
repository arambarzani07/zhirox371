/* Scoped supplier pages and exact supplier action lookup. */
(() => {
 'use strict';
 const size=50,columns='id,store_id,name,company,phone,address,category,balance_minor,note,active,created_at,updated_at',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const normalize=(row,store)=>window.RetailSupplierAccounts.normalize(row,store);
 function criteria({query='',field='name',status='all'}={}){
  const text=String(query).trim();
  if(!['name','company','phone','category','address','note'].includes(field)||!['all','creditors','clear'].includes(status)||text.length>120||text.includes('*'))throw Error('گەڕان یان پاڵاوتنی دابینکەر نادروستە');
  return Object.freeze({field,status,pattern:text?'%'+text.replace(/[\\%_]/g,'\\$&')+'%':null});
 }
 async function read({db,store,filters=criteria(),offset=0}){
  if(!db||!store||!filters||!Number.isSafeInteger(offset)||offset<0||offset%size)throw Error('داواکاریی لیستی دابینکەران نادروستە');
  let q=db.from('retail_suppliers').select(columns,{count:'exact'}).eq('store_id',store).eq('active',true);
  if(filters.pattern)q=q.ilike(filters.field,filters.pattern);
  if(filters.status==='creditors')q=q.gt('balance_minor',0);else if(filters.status==='clear')q=q.lte('balance_minor',0);
  const {data,error,count}=await q.order('name',{ascending:true}).order('id',{ascending:true}).range(offset,offset+size-1);if(error)throw error;
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length!==Math.min(size,Math.max(0,count-offset)))throw Error('لیستی دابینکەران ناتەواوە');
  const rows=data.map(r=>normalize(r,store));if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('دابینکەری دووبارە لە وەڵامدا هەیە');totals(rows);
  return {rows,total:count,offset};
 }
 async function one({db,store,id}){
  if(!db||!store||!uuid.test(id))throw Error('دابینکەرە هەڵبژێردراوەکە نادروستە');
  const {data,error}=await db.from('retail_suppliers').select(columns).eq('store_id',store).eq('id',id).eq('active',true).limit(2);if(error)throw error;
  if(!Array.isArray(data)||data.length!==1||data[0].id!==id)throw Error('دابینکەرە هەڵبژێردراوەکە بەردەست نییە');return normalize(data[0],store);
 }
 function totals(rows){const amounts=window.RetailSupplierAccounts.totals(rows,[],[]);return {payable:amounts.payable,balance:amounts.balance,creditors:rows.filter(s=>s.balance_minor>0).length,prepaid:rows.filter(s=>s.balance_minor<0).length};}
 window.RetailSupplierDirectory=Object.freeze({size,criteria,read,one,totals});
})();
