"use strict";
(()=>{
 const allowed=new Set(['retail_offers','retail_discount_rules','retail_coupons','retail_campaigns']);
 async function mutate(db,store,table,kind,payload,id){
  if(!db||!store||!allowed.has(table))throw new Error('پەیوەندی یان بەشی داواکراو نادروستە');
  let q=db.from(table);
  if(kind==='upsert'){if(payload?.store_id!==store||payload?.id!==id)throw new Error('ناسنامەی تۆمار نادروستە');q=q.upsert(payload);}
  else if(kind==='update')q=q.update(payload).eq('store_id',store).eq('id',id);
  else if(kind==='delete')q=q.delete().eq('store_id',store).eq('id',id);
  else throw new Error('کردار نادروستە');
  const {data,error}=await q.select('id').maybeSingle();if(error)throw error;
  if(data?.id!==id)throw new Error('سێرڤەر گۆڕانکارییەکەی پشتڕاست نەکردەوە؛ لیستەکە نوێ بکەرەوە');
  return data;
 }
 globalThis.RetailConfirmedRecords=Object.freeze({mutate});
})();
