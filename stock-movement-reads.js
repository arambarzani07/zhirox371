/* Paginated canonical stock history. Browser-local records are never evidence of stock. */
(() => {
 'use strict';
 const size=50,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const reasons={purchase:['purchase','opening','stock.receive_packs_v17','stock.receive_mixed_v171','stock.receive_kg_v19'],sale:['sale'],sale_return:['sale_return'],adjustment:['inventory_count','damage_out','expired_writeoff','manual_adjustment','stock.adjust_v19']};
 function criteria({product='',barcode='',type='all',period='all',now=new Date()}={}){
  const id=String(product).trim().toLowerCase(),code=String(barcode).trim();
  if(code.length>60||/[\s,،;]/.test(code))throw Error('بارکۆدی تۆمارکراوی دروست بنووسە');
  if(id&&code)throw Error('تەنها یەک کاڵا دیاری بکە');
  if(id&&!uuid.test(id))throw Error('ناسنامەی UUID ـی تەواوی کاڵا بنووسە');
  if(!['all','in','out',...Object.keys(reasons)].includes(type))throw Error('جۆری جووڵە نادروستە');
  const time=window.RetailReceiptHistory.criteria({period,now});
  return Object.freeze({product:id,barcode:code,type,since:time.since,until:time.until});
 }
 function quantity(value){
  if(!['number','string'].includes(typeof value)||String(value).trim()===''||!/^[-+]?\d+(?:\.\d{1,3})?$/.test(String(value)))throw Error('بڕی جووڵە نادروستە');
  const n=Number(value);if(!Number.isFinite(n)||!Number.isSafeInteger(Math.round(n*1000)))throw Error('بڕی جووڵە لە سنوور دەرچووە');return n;
 }
 async function read({db,store,filters=criteria(),offset=0}){
  if(!db||!store||!filters||!Number.isSafeInteger(offset)||offset<0||offset%size)throw Error('داواکاریی مێژووی کۆگا نادروستە');
  let product=filters.product;
  if(filters.barcode){
   const found=await db.from('retail_barcodes').select('product_id,store_id').eq('store_id',store).eq('code',filters.barcode).limit(2);
   if(found.error)throw found.error;
   if(!Array.isArray(found.data)||found.data.length>1||found.data.some(b=>b.store_id!==store||!uuid.test(b.product_id)))throw Error('کاڵای بارکۆدەکە پشتڕاست نەکراوەتەوە');
   if(!found.data.length)return {rows:[],total:0,offset};
   product=found.data[0].product_id;
  }
  let q=db.from('retail_stock_events').select('id,store_id,product_id,delta,reason,actor_id,sale_id,request_id,created_at,product:retail_products(id,store_id,name,base_unit)',{count:'exact'}).eq('store_id',store).lte('created_at',filters.until);
  if(filters.since)q=q.gte('created_at',filters.since);
  if(product)q=q.eq('product_id',product);
  if(filters.type==='in')q=q.gt('delta',0);
  else if(filters.type==='out')q=q.lt('delta',0);
  else if(reasons[filters.type])q=q.in('reason',reasons[filters.type]);
  const {data,error,count}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+size-1);
  if(error)throw error;
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length!==Math.min(size,Math.max(0,count-offset)))throw Error('تۆماری کۆگا پشتڕاست نەکراوەتەوە');
  const ids=new Set();
  const rows=data.map(e=>{
   if(!e?.id||ids.has(e.id)||e.store_id!==store||!e.product_id||typeof e.reason!=='string'||!Number.isFinite(Date.parse(e.created_at)))throw Error('تۆماری کۆگا نادروستە');
   ids.add(e.id);
   if(!Object.hasOwn(e,'product')||(e.product!==null&&(!e.product||e.product.id!==e.product_id||e.product.store_id!==store||typeof e.product.name!=='string'||!['unit','kg'].includes(e.product.base_unit))))throw Error('زانیاریی کاڵای جووڵە پشتڕاست نەکراوەتەوە');
   return {...e,delta:quantity(e.delta)};
  });
  // Audit notes enrich only the confirmed page; they never become extra movements.
  const requests=[...new Set(rows.map(r=>r.request_id).filter(Boolean))];
  if(requests.length){
   try{
    const notes=await db.from('retail_audit_events').select('subject_id,details').eq('store_id',store).eq('action','stock.adjust_v19').in('details->>request_id',requests).limit(size);
    if(!notes.error&&Array.isArray(notes.data))for(const row of rows){
     const matches=notes.data.filter(a=>a.subject_id===row.product_id&&a.details?.request_id===row.request_id);
     if(matches.length===1&&typeof matches[0].details.note==='string')row.note=matches[0].details.note.slice(0,200);
    }
   }catch(_error){/* Optional RLS-scoped notes never replace canonical quantities. */}
  }
  return {rows,total:count,offset};
 }
 function totals(rows,products){
  const result={unit:{in:0,out:0},kg:{in:0,out:0},unknown:0};
  for(const row of rows){const p=row.product===undefined?products.find(x=>x.id===row.product_id):row.product;if(!p){result.unknown++;continue;}
   const key=p.base_unit==='kg'?'kg':'unit',n=Math.round(quantity(row.delta)*1000),kind=n>=0?'in':'out';
   result[key][kind]+=Math.abs(n);if(!Number.isSafeInteger(result[key][kind]))throw Error('کۆی بڕ لە سنوور دەرچووە');
  }
  for(const key of ['unit','kg']){result[key].in/=1000;result[key].out/=1000;result[key].net=Number((result[key].in-result[key].out).toFixed(3));}
  return result;
 }
 window.RetailStockMovementReads=Object.freeze({size,criteria,read,quantity,totals});
})();
