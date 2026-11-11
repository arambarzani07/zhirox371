import type {Product} from '../types';
import type {PurchaseLine047,PurchaseUnit047} from './purchaseRequest047';

/** Screen 049 is ONLY a tab-local reconciliation draft based on the saved
 * request 047. There is no approved order ID, receiving permission or stock RPC.
 * A source signature checks stale tab data, NOT authentication. */
export interface ReceivingRow049 {quantity:string;expiry:string}
export interface ReceivingDraft049 {
 sourceSignature:string;supplierId:string;invoice:string;
 rows:Record<string,ReceivingRow049>;
}
export interface ReceivingDifference049 {
 orderedBase:number|null;receivedBase:number|null;missingBase:number|null;
 state:'unchecked'|'invalid'|'equal'|'short'|'excess';
}
export const receivingSourceSignature049=(lines:readonly PurchaseLine047[]):string=>
 JSON.stringify(lines.map(l=>[l.key,l.productId,l.supplierId,l.unit,l.quantity,l.barcode])
  .sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
const validPack=(n:unknown):n is number=>
 typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=1000000;
export const receivingFactor049=(product:Product|undefined,unit:PurchaseUnit047):number|null=>{
 if(!product)return null;
 if(unit==='unit')return product.base_unit==='unit'?1:null;
 if(unit==='kg')return product.base_unit==='kg'?1:null;
 if(unit==='carton')return validPack(product.carton?.units_per_carton)?product.carton!.units_per_carton:null;
 const pack=product.extra_packs?.find(p=>p.kind===unit);
 return pack&&validPack(pack.units_per_pack)?pack.units_per_pack:null;
};
export const receivingQuantity049=(raw:string,unit:PurchaseUnit047):number|null=>{
 const text=raw.trim();
 if(!(unit==='kg'?/^\d+(?:\.\d{1,3})?$/:/^\d+$/).test(text))return null;
 const n=Number(text);
 return Number.isFinite(n)&&n>=0&&n<=1000000?n:null;
};
const convertBase=(qty:number,factor:number):number|null=>{
 const scaled=Math.round(qty*factor*1000);
 return Number.isSafeInteger(scaled)&&scaled<=1000000000000?scaled/1000:null;
};
export const receivingDifference049=(
 line:PurchaseLine047,product:Product|undefined,raw:string
):ReceivingDifference049=>{
 const factor=receivingFactor049(product,line.unit);
 const orderedBase=factor===null?null:convertBase(line.quantity,factor);
 if(!raw.trim())return {orderedBase,receivedBase:null,missingBase:null,
  state:orderedBase===null?'invalid':'unchecked'};
 const n=receivingQuantity049(raw,line.unit);
 const receivedBase=factor===null||n===null?null:convertBase(n,factor);
 if(orderedBase===null||receivedBase===null)return {
  orderedBase,receivedBase:null,missingBase:null,state:'invalid'};
 const missingBase=Math.round((orderedBase-receivedBase)*1000)/1000;
 return {orderedBase,receivedBase,missingBase,
  state:missingBase===0?'equal':missingBase>0?'short':'excess'};
};
export const validReceivingExpiry049=(date:string):boolean=>{
 if(date==='')return true;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const t=new Date(date+'T00:00:00.000Z');
 return !Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===date;
};
export const emptyReceivingDraft049=(lines:readonly PurchaseLine047[]):ReceivingDraft049=>({
 sourceSignature:receivingSourceSignature049(lines),supplierId:'',invoice:'',rows:{}
});
export const loadReceivingDraft049=(
 raw:string|null,lines:readonly PurchaseLine047[],products:readonly Product[]
):ReceivingDraft049=>{
 const empty=emptyReceivingDraft049(lines);
 if(!raw||raw.length>100000)return empty;
 try{
  const obj:unknown=JSON.parse(raw);
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return empty;
  const v=obj as Record<string,unknown>;
  if(v.sourceSignature!==empty.sourceSignature||typeof v.invoice!=='string'
     ||v.invoice.length>64||!/^[^\u0000-\u001f\u007f]*$/.test(v.invoice)
     ||typeof v.supplierId!=='string'
     ||!lines.some(line=>line.supplierId===v.supplierId)
     ||!v.rows||typeof v.rows!=='object'||Array.isArray(v.rows))return empty;
  const rows:Record<string,ReceivingRow049>={};
  for(const [key,val] of Object.entries(v.rows as Record<string,unknown>)){
   const line=lines.find(line=>line.key===key);
   if(!line||!val||typeof val!=='object'||Array.isArray(val))return empty;
   const row=val as Record<string,unknown>;
   if(typeof row.quantity!=='string'||typeof row.expiry!=='string'
     ||row.expiry.length>10||!validReceivingExpiry049(row.expiry)
     ||(row.quantity!==''&&
       receivingDifference049(line,products.find(p=>p.id===line.productId),row.quantity).state==='invalid')
   )return empty;
   rows[key]={quantity:row.quantity,expiry:row.expiry};
  }
  return {...empty,supplierId:v.supplierId,invoice:v.invoice,rows};
 }catch{return empty;}
};
export const checkedReceivingRows049=(
 lines:readonly PurchaseLine047[],products:readonly Product[],rows:Record<string,ReceivingRow049>
)=>{
 const d=lines.map(l=>receivingDifference049(l,products.find(p=>p.id===l.productId),rows[l.key]?.quantity||''));
 return {checked:d.filter(v=>v.state==='equal'||v.state==='short'||v.state==='excess').length,
  received:d.filter((v,i)=>v.state!=='invalid'&&v.receivedBase!==null&&v.receivedBase>0).length,
  invalid:d.some(v=>v.state==='invalid')};
};
