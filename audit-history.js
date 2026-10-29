/* Read-only, RLS-scoped audit browsing. Private event details are not selected. */
(() => {
 'use strict';
 const size=50,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function criteria({query='',field='action',period='all',now=new Date()}={}){
  const text=String(query).trim();
  if(!['action','actor_id','subject_id'].includes(field)||text.length>80)throw Error('گەڕانەکە نادروستە');
  if(text&&field!=='action'&&!uuid.test(text))throw Error('ناسنامەی UUID ـی تەواو بنووسە');
  if(field==='action'&&text.includes('*'))throw Error('کردار بە بێ نیشانەی * بنووسە');
  const time=window.RetailReceiptHistory.criteria({period,now});
  return Object.freeze({field,query:field==='action'?text:text.toLowerCase(),pattern:text?'%'+text.replace(/[\\%_]/g,'\\$&')+'%':null,since:time.since,until:time.until});
 }
 async function read({db,store,filters,offset=0}){
  if(!db||!store||!filters||!Number.isSafeInteger(offset)||offset<0||offset%size)throw Error('داواکاریی تۆمار نادروستە');
  let q=db.from('retail_audit_events').select('id,store_id,action,actor_id,subject_id,created_at',{count:'exact'}).eq('store_id',store).lte('created_at',filters.until);
  if(filters.query)q=filters.field==='action'?q.ilike('action',filters.pattern):q.eq(filters.field,filters.query);
  if(filters.since)q=q.gte('created_at',filters.since);
  const {data,error,count}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+size-1);
  if(error)throw error;
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length>size||data.some(r=>!r?.id||r.store_id!==store||typeof r.action!=='string'))throw Error('وەڵامی تۆماری گۆڕانکارییەکان ناتەواوە');
  return {rows:data,total:count,offset};
 }
 function csv(rows){
  const cell=value=>{
   let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;
   return '"'+s.replace(/"/g,'""')+'"';
  };
  const headers=['ناسنامەی تۆمار','ناسنامەی فرۆشگا','کات (UTC)','کردار','ناسنامەی بەکارهێنەر','ناسنامەی بابەت'];
  return '\uFEFF'+[headers,...rows.map(r=>[r.id,r.store_id,r.created_at,r.action,r.actor_id,r.subject_id])].map(r=>r.map(cell).join(',')).join('\r\n');
 }
 window.RetailAuditHistory=Object.freeze({size,criteria,read,csv});
})();
