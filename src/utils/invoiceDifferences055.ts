import type {Product} from '../types';
import type {PurchaseLine047,PurchaseUnit047} from './purchaseRequest047';

/** 055 reads tab-local 047/048/049 DEMO drafts; none is a certified PO,
 * verified supplier invoice, actual receipt or posted accounting event.
 * Monetary comparisons are proposals, not balance mutations.
 */
export interface InvoiceReview055 {
 signature:string;supplierId:string;invoice:string;
 prices:Record<string,string>;reason:string;
}
export interface InvoiceDiff055 {
 state:'incomplete'|'invalid'|'matched'|'mismatch';
 ordered:number;
 received:number|null;
 orderedPrice:number|null;invoicePrice:number|null;
 quantityDifference:number|null;
 amountDifferenceIqd:number|null;
}
export const reviewSignature055=(lines:readonly PurchaseLine047[]):string=>JSON.stringify(
 lines.map(l=>[l.key,l.productId,l.supplierId,l.unit,l.quantity,l.barcode])
  .sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
);
export const price055=(raw:unknown):number|null=>{
 if(typeof raw!=='string'||!/^\d+$/.test(raw))return null;
 const n=Number(raw);
 return Number.isSafeInteger(n)&&n>0&&n<=1000000000?n:null;
};
export const loadOrderPrices055=(raw:string|null,lines:readonly PurchaseLine047[]):Record<string,string>=>{
 if(!raw||raw.length>100000)return {};
 try{
  const obj:unknown=JSON.parse(raw);
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return {};
  const data=obj as Record<string,unknown>,result:Record<string,string>={};
  for(const line of lines)if(price055(data[line.key])!==null)result[line.key]=data[line.key] as string;
  return result;
 }catch{return {};}
};
const quantity055=(raw:string,unit:PurchaseUnit047):number|null=>{
 const s=raw.trim();
 if(!(unit==='kg'?/^\d+(?:\.\d{1,3})?$/:/^\d+$/).test(s))return null;
 const n=Number(s);
 return Number.isFinite(n)&&n>=0&&n<=1000000?n:null;
};
const factor055=(p:Product|undefined,unit:PurchaseUnit047):number|null=>{
 if(!p)return null;
 if(unit==='kg')return p.base_unit==='kg'?1:null;
 if(unit==='unit')return p.base_unit==='unit'?1:null;
 const n=unit==='carton'?p.carton?.units_per_carton:p.extra_packs?.find(x=>x.kind===unit)?.units_per_pack;
 return typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=1000000?n:null;
};
const safeAmount=(price:number,quantity:number):number|null=>{
 const n=Math.round(price*quantity);
 return Number.isSafeInteger(n)&&n>=0?n:null;
};
export const compareInvoiceLine055=(
 line:PurchaseLine047,product:Product|undefined,receiptQuantityRaw:string,
 orderPriceRaw:unknown,invoicePriceRaw:unknown
):InvoiceDiff055=>{
 const orderedPrice=price055(orderPriceRaw);
 const invoicePrice=price055(invoicePriceRaw);
 const factor=factor055(product,line.unit);
 const received=receiptQuantityRaw.trim()===''?null:quantity055(receiptQuantityRaw,line.unit);
 const quantityDifference=received===null||factor===null?null:
  Math.round((received-line.quantity)*factor*1000)/1000;
 if(receiptQuantityRaw.trim()!==''&&received===null||factor===null||!Number.isSafeInteger(Math.round(line.quantity*factor*1000)))
  return {state:'invalid',ordered:line.quantity,received:null,orderedPrice,invoicePrice,
   quantityDifference:null,amountDifferenceIqd:null};
 const orderedAmount=orderedPrice===null?null:safeAmount(orderedPrice,line.quantity);
 const receiptAmount=invoicePrice===null||received===null?null:safeAmount(invoicePrice,received);
 const amountDifferenceIqd=orderedAmount===null||receiptAmount===null?null:receiptAmount-orderedAmount;
 const mismatch=quantityDifference!==null&&quantityDifference!==0||
  orderedPrice!==null&&invoicePrice!==null&&orderedPrice!==invoicePrice;
 return {state:mismatch?'mismatch':
    quantityDifference!==null&&amountDifferenceIqd!==null?'matched':'incomplete',
   ordered:line.quantity,received,orderedPrice,invoicePrice,quantityDifference,amountDifferenceIqd};
};
export const summarizeInvoiceDifferences055=(rows:readonly InvoiceDiff055[])=>{
 const mismatchCount=rows.length>0&&rows.every(x=>x.state!=='incomplete'&&x.state!=='invalid')
  ?rows.filter(x=>x.state==='mismatch').length:null;
 const monetaryDifference=rows.length>0&&rows.every(x=>x.amountDifferenceIqd!==null&&x.state!=='invalid')
  ?rows.reduce((sum,x)=>sum+(x.amountDifferenceIqd??0),0):null;
 return {mismatchCount,monetaryDifference:
  monetaryDifference!==null&&Number.isSafeInteger(monetaryDifference)?monetaryDifference:null,
  complete:rows.length>0&&rows.every(x=>x.state!=='incomplete'&&x.state!=='invalid')};
};
export const emptyInvoiceReview055=(lines:readonly PurchaseLine047[]):InvoiceReview055=>({
 signature:reviewSignature055(lines),supplierId:'',invoice:'',prices:{},reason:''
});
export const loadInvoiceReview055=(
 raw:string|null,lines:readonly PurchaseLine047[]
):InvoiceReview055=>{
 const empty=emptyInvoiceReview055(lines);
 if(!raw||raw.length>100000)return empty;
 try{
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))return empty;
  const v=value as Record<string,unknown>;
  if(v.signature!==empty.signature||typeof v.supplierId!=='string'
   ||(v.supplierId!==''&&!lines.some(l=>l.supplierId===v.supplierId))
   ||typeof v.invoice!=='string'||v.invoice.length>64
   ||typeof v.reason!=='string'||v.reason.length>120
   ||!v.prices||typeof v.prices!=='object'||Array.isArray(v.prices))return empty;
  const prices:Record<string,string>={};
  for(const [key,p] of Object.entries(v.prices as Record<string,unknown>)){
   if(!lines.some(l=>l.key===key)||p!==''&&price055(p)===null)return empty;
   prices[key]=p as string;
  }
  return {...empty,supplierId:v.supplierId,invoice:v.invoice,reason:v.reason,prices};
 }catch{return empty;}
};
/** No application-side 'approve', 'post stock', 'pay' or 'resolve' permission. */
export const canPostInvoiceReview055=(_actor?:string):false=>false;
