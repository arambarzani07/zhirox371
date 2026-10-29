/* Read-only current-shift movement pages; totals come from retail_shift_summary. */
(() => {
 'use strict';
 const size=50;
 function criteria({query='',field='note',kind='all',now=new Date()}={}){
  let text=String(query).trim();
  if(!['note','amount_minor'].includes(field)||!['all','cash_in','cash_out'].includes(kind)||text.length>160)throw Error('گەڕانەکە نادروستە');
  if(field==='amount_minor'&&text){
   text=text.replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c<='٩'?1632:1776)));
   if(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text))||Number(text)<1||Number(text)>9999999999999)throw Error('بڕی تەواوی پارە بە دینار بنووسە');
   text=String(Number(text));
  }
  if(field==='note'&&text.includes('*'))throw Error('تێبینی بە بێ نیشانەی * بنووسە');
  return Object.freeze({query:text,field,kind,pattern:text?'%'+text.replace(/[\\%_]/g,'\\$&')+'%':null,until:now.toISOString()});
 }
 async function read({db,store,session,filters,offset=0}){
  if(!db||!store||!session||!filters||!Number.isSafeInteger(offset)||offset<0||offset%size)throw Error('داواکاریی جووڵە نادروستە');
  let q=db.from('retail_cash_movements').select('id,store_id,session_id,kind,amount_minor,note,created_at',{count:'exact'}).eq('store_id',store).eq('session_id',session).lte('created_at',filters.until);
  if(filters.kind!=='all')q=q.eq('kind',filters.kind);
  if(filters.query)q=filters.field==='note'?q.ilike('note',filters.pattern):q.eq('amount_minor',filters.query);
  const {data,error,count}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+size-1);
  if(error)throw error;
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length>size||data.some(r=>!r?.id||r.store_id!==store||r.session_id!==session||!['cash_in','cash_out'].includes(r.kind)))throw Error('وەڵامی جووڵەکانی شێفت ناتەواوە');
  return {rows:data,total:count};
 }
 window.RetailPaymentsHistory=Object.freeze({size,criteria,read});
})();
