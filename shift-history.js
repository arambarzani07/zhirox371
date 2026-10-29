/* Read-only own-cashier shift state and history. No financial writes. */
(() => {
 'use strict';
 const size=50,columns='id,store_id,cashier_id,status,opening_cash_minor,opened_at,expected_cash_minor,counted_cash_minor,variance_minor';
 const valid=(r,store,actor)=>r?.id&&r.store_id===store&&r.cashier_id===actor&&['open','closed'].includes(r.status);
 function criteria({status='all',period='all',now=new Date()}={}){
  if(!['all','open','closed'].includes(status))throw Error('دۆخی شێفت نادروستە');
  const time=window.RetailReceiptHistory.criteria({period,now});
  return Object.freeze({status,since:time.since,until:time.until});
 }
 async function current({db,store,actor}){
  if(!db||!store||!actor)throw Error('داواکاریی شێفت نادروستە');
  const {data,error}=await db.from('retail_cash_sessions').select(columns).eq('store_id',store).eq('cashier_id',actor).eq('status','open').order('opened_at',{ascending:false}).order('id',{ascending:false}).limit(2);
  if(error)throw error;
  if(!Array.isArray(data)||data.length>1||data.some(r=>!valid(r,store,actor)||r.status!=='open'))throw Error('دۆخی شێفت پشتڕاست نەکرایەوە');
  return data[0]||null;
 }
 async function read({db,store,actor,filters,offset=0}){
  if(!db||!store||!actor||!filters||!Number.isSafeInteger(offset)||offset<0||offset%size)throw Error('داواکاریی مێژووی شێفت نادروستە');
  let q=db.from('retail_cash_sessions').select(columns,{count:'exact'}).eq('store_id',store).eq('cashier_id',actor).lte('opened_at',filters.until);
  if(filters.status!=='all')q=q.eq('status',filters.status);
  if(filters.since)q=q.gte('opened_at',filters.since);
  const {data,error,count}=await q.order('opened_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+size-1);
  if(error)throw error;
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length>size||data.some(r=>!valid(r,store,actor)))throw Error('مێژووی شێفت ناتەواوە');
  return {rows:data,total:count};
 }
 function summary(value,session=null){
  if(session&&(value?.session_id!==session||value.status!=='open'))throw Error('شێفتەکە گۆڕاوە؛ نوێکردنەوە بکە');
  if(!value||['opening','sales','movements','expected'].some(k=>!Number.isSafeInteger(value[k]))||value.profit!=null&&!Number.isSafeInteger(value.profit))throw Error('باڵانسی شێفت پشتڕاست نەکرایەوە');
  return value;
 }
 window.RetailShiftHistory=Object.freeze({size,criteria,current,read,summary});
})();
