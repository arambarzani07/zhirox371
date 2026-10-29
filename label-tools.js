"use strict";
(()=>{
 function code(value){if(typeof value!=='string'||!value.length||value.length>48||!/^[\x20-\x7e]+$/.test(value))throw new Error('بارکۆدی تۆمارکراوی دروست پێویستە');return value;}
 function item(value){code(value.code);if(!value.name||!Number.isSafeInteger(value.priceMinor)||value.priceMinor<0)throw new Error('ناو یان نرخی لیبڵ نادروستە');return {...value};}
 function quantity(value){const n=Number(value);if(!Number.isInteger(n)||n<1||n>50)throw new Error('ژمارەی کۆپی دەبێت لە ١ تا ٥٠ بێت');return n;}
 function plan(rows){if(!rows.length)throw new Error('ڕیزی چاپ بەتاڵە');let count=0;const result=rows.map(r=>{const v=item(r),copies=quantity(r.copies);count+=copies;return {...v,copies};});if(count>200)throw new Error('لە هەر جارێکدا زۆرترین ٢٠٠ لیبڵ چاپ بکە');return result;}
 async function confirm(db,store,rows){const result=[];for(const row of plan(rows)){const {data,error}=await db.rpc('retail_resolve_barcode_v18',{p_store:store,p_code:row.code});if(error)throw error;if(!data?.found||data.code!==row.code)throw new Error('بارکۆد نەدۆزرایەوە یان ناچالاکە: '+row.code);result.push(item({...row,name:data.product_name,priceMinor:data.price_minor,unitLabel:data.is_scale?'پاکێجی کێشکراو':data.unit_type==='carton'?'کارتۆن':data.base_unit==='kg'?'کیلۆگرام':'دانە'}));}return result;}
 function svg(value){code(value);const node=document.createElementNS('http://www.w3.org/2000/svg','svg');window.JsBarcode(node,value,{format:'CODE128',width:2,height:42,displayValue:false,margin:20,background:'#fff',lineColor:'#000'});const width=Number(node.getAttribute('width')),height=Number(node.getAttribute('height'));if(width/2>230)throw new Error('ئەم بارکۆدە بۆ لیبڵی ٥٠ ملیمەتری زۆر درێژە');node.setAttribute('viewBox',`0 0 ${width} ${height}`);node.setAttribute('role','img');node.setAttribute('aria-label',value);return node;}
 globalThis.RetailLabelTools=Object.freeze({code,item,quantity,plan,confirm,svg});
})();
