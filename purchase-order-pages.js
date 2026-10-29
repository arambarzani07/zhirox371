/* Scoped order pages and exact action lookups; mutations stay in PurchasingV23. */
(() => {
 'use strict';
 const size=50,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const columns='id,store_id,po_no,supplier_id,supplier_name,product_id,product_name,quantity,unit_cost_minor,total_cost_minor,expected_date,status,note,actor_id,created_at,updated_at';
 const normalize=(row,store)=>window.RetailSupplierAccounts.normalizeOrder(row,store);
 function criteria({query='',field='po_no',status='all',supplier='all'}={}){
  const text=String(query).trim();
  if(text.length>120||text.includes('*')||!['po_no','supplier_name','product_name','note'].includes(field)||!['all','pending','ordered','received','cancelled'].includes(status)||(supplier!=='all'&&!uuid.test(supplier)))throw Error('گەڕان یان پاڵاوتنی داواکاری نادروستە');
  return Object.freeze({field,status,supplier,pattern:text?'%'+text.replace(/[\\%_]/g,'\\$&')+'%':null});
 }
 function totals(rows){return {count:rows.length,pending:rows.filter(o=>o.status==='pending').length,received:rows.filter(o=>o.status==='received').length,pendingCost:window.RetailSupplierAccounts.sum(rows.filter(o=>o.status==='pending'),'total_cost_minor')};}
 async function read({db,store,filters=criteria(),offset=0}){
  if(!db||!store||!Number.isSafeInteger(offset)||offset<0||offset%size)throw Error('داواکاریی پەڕە نادروستە');
  let q=db.from('retail_purchase_orders').select(columns,{count:'exact'}).eq('store_id',store);
  if(filters.pattern)q=q.ilike(filters.field,filters.pattern);if(filters.status!=='all')q=q.eq('status',filters.status);if(filters.supplier!=='all')q=q.eq('supplier_id',filters.supplier);
  const {data,error,count}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+size-1);if(error)throw error;
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length!==Math.min(size,Math.max(0,count-offset)))throw Error('لیستی داواکارییەکان ناتەواوە');
  const rows=data.map(r=>normalize(r,store));if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('داواکاریی دووبارە لە وەڵامدا هەیە');totals(rows);return {rows,total:count,offset};
 }
 async function one({db,store,id}){
  if(!db||!store||!uuid.test(id))throw Error('ناسنامەی داواکاری نادروستە');
  const {data,error}=await db.from('retail_purchase_orders').select(columns).eq('store_id',store).eq('id',id).limit(2);if(error)throw error;
  if(!Array.isArray(data)||data.length!==1||data[0].id!==id)throw Error('داواکاریی هەڵبژێردراو بەردەست نییە');return normalize(data[0],store);
 }
 window.RetailPurchaseOrderPages=Object.freeze({size,criteria,totals,read,one});
})();
