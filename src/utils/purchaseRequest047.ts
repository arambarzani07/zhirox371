import type { Product, Supplier } from '../types';

/** Canva 047 is a local purchasing REQUISITION DRAFT, never a purchase order
 * or inventory transaction. All catalog references are revalidated. */
export type PurchaseUnit047='unit'|'carton'|'bundle'|'set'|'kg';
export interface PurchaseUnitOption047 {
  value:PurchaseUnit047; label:string;barcode:string;
}
export interface PurchaseLine047 {
  key:string; productId:string;productName:string;barcode:string;
  supplierId:string;supplierName:string;unit:PurchaseUnit047;quantity:number;
}
export type PurchaseLineResult047 =
 | {ok:true;line:PurchaseLine047}
 | {ok:false;error:string};
const labels:Record<PurchaseUnit047,string>={
  unit:'دانە',carton:'کارتۆن',bundle:'دەستە',set:'سێت',kg:'کیلۆ'
};
export const getPurchaseUnits047=(p:Product|null):PurchaseUnitOption047[]=>{
  if(!p)return [];
  const items:PurchaseUnitOption047[]=[{
    value:p.base_unit==='kg'?'kg':'unit',
    label:p.base_unit==='kg'?'کیلۆ':'دانە',barcode:p.unit_barcode
  }];
  if(p.carton)items.push({value:'carton',label:'کارتۆن',barcode:p.carton.barcode});
  for(const pack of p.extra_packs||[]){
    if(pack.kind==='bundle'||pack.kind==='set')
      items.push({value:pack.kind,label:labels[pack.kind],barcode:pack.barcode});
  }
  return items;
};
export const findPurchaseProducts047=(products:readonly Product[],text:string):Product[]=>{
  const q=text.trim().toLocaleLowerCase();
  if(!q)return [];
  return products.filter(p=>[
    p.name,p.id,p.unit_barcode,...(p.unit_alias_barcodes||[]),
    ...(p.carton?[p.carton.barcode,...p.carton.alias_barcodes]:[]),
    ...(p.extra_packs||[]).flatMap(x=>[x.barcode,...x.alias_barcodes])
  ].some(v=>v.toLocaleLowerCase().includes(q))).slice(0,8);
};
export const purchaseUnitByScan047=(p:Product,scan:string):PurchaseUnit047|null=>{
  const q=scan.trim();
  const hit=getPurchaseUnits047(p).find(u=>{
    if(u.barcode===q)return true;
    if(u.value==='unit'||u.value==='kg')return p.unit_alias_barcodes?.includes(q);
    if(u.value==='carton')return p.carton?.alias_barcodes?.includes(q);
    return p.extra_packs?.find(x=>x.kind===u.value)?.alias_barcodes?.includes(q);
  });
  return hit?.value||null;
};
const validAmount=(input:string,unit:PurchaseUnit047):number|null=>{
  const s=input.trim();
  const pattern=unit==='kg'?/^\d+(?:\.\d{1,3})?$/u:/^\d+$/u;
  if(!pattern.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n)&&n>0&&n<=1000000? n:null;
};
export const preparePurchaseLine047=(
  products:readonly Product[],suppliers:readonly Supplier[],
  productId:string,unit:PurchaseUnit047,rawQuantity:string,supplierId:string
):PurchaseLineResult047=>{
  const product=products.find(p=>p.id===productId);
  if(!product)return {ok:false,error:'کاڵای هەڵبژێردراو نەدۆزرایەوە'};
  const option=getPurchaseUnits047(product).find(x=>x.value===unit);
  if(!option||!option.barcode.trim())
    return {ok:false,error:'ئەم جۆرە یەکەیە بۆ کاڵاکە بەردەست نییە'};
  const supplier=suppliers.find(s=>s.id===supplierId);
  if(!supplier)return {ok:false,error:'دابینکەرێکی تۆمارکراوی Demo هەڵبژێرە'};
  const quantity=validAmount(rawQuantity,unit);
  if(quantity===null)return {
    ok:false,error:unit==='kg'?
      'بڕی کیلۆ دەبێت گەورەتر لە سفر و تا سێ خانەی دەیی بێت':
      'بڕی داواکراو دەبێت ژمارەی تەواو و گەورەتر لە سفر بێت'
  };
  return {ok:true,line:{
    key:product.id+'::'+unit+'::'+supplier.id,
    productId:product.id,productName:product.name,barcode:option.barcode,
    supplierId:supplier.id,supplierName:supplier.name,unit,quantity
  }};
};
export const addPurchaseDraftLine047=(
 rows:readonly PurchaseLine047[],next:PurchaseLine047
):{ok:true;lines:PurchaseLine047[]}|{ok:false;error:string}=>{
  const existing=rows.find(r=>r.key===next.key);
  if(!existing&&rows.length>=100)return {ok:false,error:'ڕەشنووسەکە زۆرترین 100 ڕیز وەردەگرێت'};
  if(!existing)return {ok:true,lines:[...rows,next]};
  const total=Math.round((existing.quantity+next.quantity)*1000)/1000;
  if(total>1000000||!Number.isFinite(total))
    return {ok:false,error:'کۆی بڕی داواکراو لە سنووری ڕەشنووس زیاترە'};
  return {ok:true,lines:rows.map(r=>r.key===next.key?{...r,quantity:total}:r)};
};
export const summarizePurchaseDraft047=(rows:readonly PurchaseLine047[])=>{
  const byUnit:Partial<Record<PurchaseUnit047,number>>={};
  for(const row of rows)
    byUnit[row.unit]=Math.round(((byUnit[row.unit]||0)+row.quantity)*1000)/1000;
  return {
    itemCount:new Set(rows.map(row=>row.productId)).size,
    quantityText: (Object.keys(labels) as PurchaseUnit047[])
      .filter(mode=>byUnit[mode]!==undefined)
      .map(mode=>labels[mode]+': '+(byUnit[mode]||0).toLocaleString('en-US',{maximumFractionDigits:3}))
      .join('، ')||'0'
  };
};
export const readPurchaseDraft047=(
 raw:string|null, products:readonly Product[],suppliers:readonly Supplier[]
):PurchaseLine047[]=>{
 if(!raw||raw.length>100000)return [];
 try{
  const parsed:unknown=JSON.parse(raw);
  if(!Array.isArray(parsed)||parsed.length>100)return [];
  let result:PurchaseLine047[]=[];
  for(const item of parsed){
    if(!item||typeof item!=='object')return [];
    const o=item as Record<string,unknown>;
    if(typeof o.productId!=='string'||typeof o.supplierId!=='string'
      ||typeof o.unit!=='string'||typeof o.quantity!=='number')return [];
    if(!['unit','carton','bundle','set','kg'].includes(o.unit))return [];
    const prepared=preparePurchaseLine047(products,suppliers,o.productId,
      o.unit as PurchaseUnit047,String(o.quantity),o.supplierId);
    if(!prepared.ok)return [];
    const merged=addPurchaseDraftLine047(result,prepared.line);
    if(!merged.ok)return [];
    result=merged.lines;
  }
  return result;
 }catch{return [];}
};
