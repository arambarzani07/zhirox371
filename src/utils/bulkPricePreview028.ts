import type { Product } from '../types';

/** Pure preview only. There is deliberately no write path or approval claim. */
export type BulkPriceType028 = 'unit' | 'carton' | 'wholesale';
export type BulkAdjustment028 = 'percent' | 'amount';
export interface BulkPriceRequest028 {
  category: string;
  priceType: BulkPriceType028;
  adjustmentType: BulkAdjustment028;
  adjustment: string;
}
export interface BulkPriceRow028 {
  id: string;
  productName: string;
  barcode: string;
  label: string;
  previousIqd: number;
  proposedIqd: number;
  status: 'preview_only';
}
export interface BulkPricePreview028 {
  selectedCount: number;
  rows: BulkPriceRow028[];
  skipped: number;
  error: string | null;
}
const failed=(message:string):BulkPricePreview028=>({
  selectedCount:0,rows:[],skipped:0,error:message
});
export function previewBulkPrices028(
  products:readonly Product[], request:BulkPriceRequest028
):BulkPricePreview028 {
  const category=request.category.trim();
  if(!category || !products.some(p=>(p.category||'گشتی')===category)) {
    return failed('پێش پێشبینین پۆلبەندییەکی بەردەست هەڵبژێرە');
  }
  // The local product model has no authoritative wholesale-price field.
  if(request.priceType==='wholesale') {
    return failed('نرخی بەکۆمەڵ لە داتای تاقیکردنەوەدا بوونی پشتڕاستکراوی نییە');
  }
  const raw=request.adjustment.trim();
  const n=Number(raw);
  if(!raw || !Number.isFinite(n) || n===0 || !/^[+-]?\d+(?:\.\d{1,2})?$/.test(raw)) {
    return failed('ڕێژە یان بڕێکی ژمارەیی دروست و ناسفر بنووسە');
  }
  if(request.adjustmentType==='percent' && (n<=-100 || n>1000)) {
    return failed('ڕێژە دەبێت گەورەتر لە -100 و کەمتر یان یەکسان بە 1000 بێت');
  }
  if(request.adjustmentType==='amount' && (!Number.isSafeInteger(n) || Math.abs(n)>100000000)) {
    return failed('بڕی گۆڕانکاری دەبێت ژمارەی تەواوی سنووردار بێت');
  }
  const chosen=products.filter(p=>(p.category||'گشتی')===category);
  const rows:BulkPriceRow028[]=[];
  let skipped=0;
  for(const p of chosen) {
    if(request.priceType==='carton'&&!p.carton) {skipped++;continue;}
    const original=request.priceType==='carton'?p.carton!.sale_price_iqd:p.unit_sale_price_iqd;
    if(!Number.isSafeInteger(original)||original<=0) {skipped++;continue;}
    const proposed=request.adjustmentType==='percent'
      ?Math.round(original*(1+n/100)):original+n;
    if(!Number.isSafeInteger(proposed)||proposed<=0||proposed===original) {skipped++;continue;}
    rows.push({
      id:p.id,productName:p.name,barcode:request.priceType==='carton'?p.carton!.barcode:p.unit_barcode,
      label:request.priceType==='carton'?'کارتۆن':p.base_unit==='kg'?'کیلۆ':'دانە',
      previousIqd:original,proposedIqd:proposed,status:'preview_only'
    });
  }
  return {selectedCount:chosen.length,rows,skipped,error:null};
}
