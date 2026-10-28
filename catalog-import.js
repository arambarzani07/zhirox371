"use strict";
(()=>{
 function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false,closed=false;const s=String(text).replace(/^\uFEFF/,'');
  const push=()=>{row.push(cell.trim());cell='';closed=false;};
  for(let i=0;i<s.length;i++){
   const c=s[i];
   if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
   if(c==='"'&&!cell&&!closed){quoted=true;continue;}
   if(c===','||c===';'||c==='\t'){push();continue;}
   if(c==='\r'||c==='\n'){push();if(row.some(Boolean))rows.push(row);row=[];if(c==='\r'&&s[i+1]==='\n')i++;continue;}
   if(closed&&!/\s/.test(c))throw new Error('فۆرماتی CSV نادروستە؛ دوای داخستنی دەق فاصلە پێویستە');
   if(!closed)cell+=c;
  }
  if(quoted)throw new Error('نیشانەی دەقی CSV داخراو نییە');
  push();if(row.some(Boolean))rows.push(row);return rows;
 }
 const normalize=s=>String(s).trim().toLowerCase().replace(/[ _-]/g,'');
 const keys={name:['name','itemname','ناویکاڵا'],barcode:['barcode','itemcode','unitbarcode','بارکۆد','بارکۆدیدانە'],price:['price','saleprice','unitsalepriceiqd','نرخ','نرخیفرۆشتن']};
 function prepare(text){
  const rows=parseCsv(text);if(!rows.length)throw new Error('هیچ داتایەک نییە');
  const first=rows[0].map(normalize),index={};for(const [k,v] of Object.entries(keys))index[k]=first.findIndex(x=>v.includes(x));
  const header=Object.values(index).every(x=>x>=0);
  const looksHeader=Object.values(index).some(x=>x>=0)||first.some(x=>['sku','salemode','stockquantity','itemnameid'].includes(x));
  if(looksHeader&&!header)throw new Error('سەردێڕەکان ناتەواون؛ name، barcode و price پێویستن');
  if(!header){index.name=0;index.barcode=1;index.price=2;}
  const fields=header?first:[],items=[],seen=new Map();let duplicates=0;const errors=[];
  const reject=(line,msg)=>{if(errors.length<8)errors.push('ڕیزی '+line+': '+msg);};
  for(let i=header?1:0;i<rows.length;i++){
   const row=rows[i],line=i+1;
   if((header&&row.length!==first.length)||(!header&&row.length!==3)){reject(line,'ستوونەکان لەگەڵ فۆرمات یەک ناگرن');continue;}
   const get=key=>{const p=fields.indexOf(key);return p<0?'':row[p]||'';};
   const stock=get('stockquantity')||get('initialstock');
   if((stock!==''&&(!Number.isFinite(Number(stock))||Number(stock)!==0))||(get('salemode')&&get('salemode')!=='unit')||['cartonname','cartonbarcode','unitspercarton','cartonpurchaseprice','cartonprice','cartonpurchasepriceiqd','cartonsalepriceiqd','extrabarcodes','unitaliasbarcodes','extracartonbarcodes','cartonaliasbarcodes','unitpurchasepriceiqd','purchaseprice'].some(k=>get(k)!=='')){
    reject(line,'هاوردەی بڕی کۆگا، تێچوو، فرەبارکۆد یان کارتۆن پشتگیری نەکراوە؛ ئەو خانانە نابێت ون بن');continue;
   }
   if(get('baseunit')&&get('baseunit')!=='unit'){reject(line,'هاوردەی کیلۆگرام لەم فۆرماتەدا پشتگیری نەکراوە');continue;}
   if(get('sku')||get('plu')){reject(line,'بۆ پاراستنی SKU و PLU فۆڕمی کاڵای نوێ بەکاربهێنە');continue;}
   const name=row[index.name],barcode=row[index.barcode],rawPrice=row[index.price],price=Number(rawPrice);
   if(!name||name.length>160||/[\r\n\u0000-\u001f]/.test(name)){reject(line,'ناوی کاڵا نادروستە');continue;}
   if(!barcode||barcode.length>60||/[\s,;،]/.test(barcode)){reject(line,'بارکۆد نادروستە');continue;}
   if(!rawPrice||!/^\d+$/.test(rawPrice)||!Number.isSafeInteger(price)||price<0||price>999999999){reject(line,'نرخ دەبێت ژمارەی تەواوی IQD بێت؛ نرخ خڕ ناکرێتەوە');continue;}
   if(seen.has(barcode)){
    const prev=seen.get(barcode);if(prev.name!==name||prev.price!==price)reject(line,'بارکۆد بە ناو یان نرخی جیاواز دووبارە بووەتەوە');else duplicates++;
    continue;
   }
   const item={name,barcode,price,line};seen.set(barcode,item);items.push(item);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  if(!items.length)throw new Error('هیچ کاڵایەکی گونجاو نییە');
  return {items,duplicates,header};
 }
 globalThis.RetailCatalogImport=Object.freeze({parseCsv,prepare});
})();
