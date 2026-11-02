// V108: fail-closed, ALL-OR-NOTHING structural validation before any React
// DEMO backup import. This is NOT an authenticated/atomic PostgreSQL restore.
import type {Product,Customer,Supplier,Shift,Receipt,Expense,StockMovement,AuditLogEntry} from "../types";
import type {DemoReturnV107} from "./demoRefundGuardV107";

export type DemoBackupSnapshotV108={
 products:Product[];customers:Customer[];suppliers:Supplier[];
 shift:Shift;receipts:Receipt[];expenses:Expense[];
 stockMovements:StockMovement[];auditLogs:AuditLogEntry[];
 demoRefunds:DemoReturnV107[];
};
type Result={ok:true,snapshot:DemoBackupSnapshotV108}|{ok:false,error:string};
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=4096;
const nonneg=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const finiteNonneg=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const seq=(v:unknown,limit:number,valid:(row:Record<string,unknown>)=>boolean)=>{
 if(!Array.isArray(v)||v.length>limit)return false;
 const keys=new Set<string>();
 for(const row of v){
  if(!record(row)||!str(row.id)||keys.has(row.id)||!valid(row))return false;
  keys.add(row.id);
 }
 return true;
};
export function parseDemoBackupV108(raw:string):Result{
 if(typeof raw!=="string"||raw.length===0||raw.length>32*1024*1024)
  return {ok:false,error:"قەبارەی فایلی Backup نادروستە"};
 let data:unknown;
 try{data=JSON.parse(raw);}catch{return {ok:false,error:"JSON ـی Backup تێکچووە"};}
 if(!record(data)||![1,2].includes(Number(data.backup_version))||
  !record(data.snapshot)||!record(data.store)||
  data.store.name!=="سوپەرمارکێتی کانی چنار"||
  (data.backup_version===2&&data.source!=="ZHIROX371_BROWSER_DEMO"))
  return {ok:false,error:"فایلەکە Backup ـی پشتڕاستکراوی Demo نییە"};
 const s=data.snapshot;
 const products=seq(s.products,75000,p=>
  str(p.name)&&str(p.unit_barcode)&&nonneg(p.unit_sale_price_iqd)&&
  finiteNonneg(p.stock)&&finiteNonneg(p.min_stock??0)&&
  Array.isArray(p.unit_alias_barcodes));
 const customers=seq(s.customers,100000,c=>
  str(c.name)&&typeof c.phone==="string"&&finiteNonneg(c.balanceDebt));
 const suppliers=seq(s.suppliers,30000,p=>
  str(p.name)&&typeof p.phone==="string"&&finiteNonneg(p.balanceDebt));
 const receipts=seq(s.receipts,250000,r=>
  str(r.receiptNumber)&&r.receiptNumber.startsWith("DEMO-RCP-")&&
  str(r.cashierName)&&
  (r.paymentMethod==="cash"||r.paymentMethod==="debt")&&
  nonneg(r.total)&&nonneg(r.subtotal)&&nonneg(r.discount)&&
  Array.isArray(r.items)&&r.items.length<=200&&r.items.every(i=>
   record(i)&&str(i.productId)&&str(i.name)&&nonneg(i.price)&&
   typeof i.qty==="number"&&Number.isFinite(i.qty)&&i.qty>0&&
   finiteNonneg(i.total)));
 const expenses=seq(s.expenses,100000,e=>
  str(e.title)&&nonneg(e.amount)&&str(e.category));
 const movements=seq(s.stockMovements,250000,m=>
  str(m.productId)&&str(m.type)&&finiteNonneg(m.previousStock)&&
  finiteNonneg(m.newStock)&&typeof m.quantityDelta==="number"&&
  Number.isFinite(m.quantityDelta));
 const audits=seq(s.auditLogs,100000,a=>
  str(a.action)&&str(a.user)&&str(a.timestamp));
 const refunds=s.demoRefunds===undefined?[]:s.demoRefunds;
 const validRefunds=seq(refunds,100000,r=>
  str(r.receiptNo)&&str(r.productId)&&
  typeof r.qty==="number"&&Number.isFinite(r.qty)&&r.qty>0&&
  nonneg(r.refundAmount)&&r.refundAmount>0);
 const shift=s.shift;
 if(!products||!customers||!suppliers||!receipts||!expenses||
  !movements||!audits||!validRefunds||!record(shift)||
  !str(shift.id)||!str(shift.cashierName)||
  !["open","closed"].includes(String(shift.status))||
  !nonneg(shift.openingFloat)||!nonneg(shift.cashSales)||
  !nonneg(shift.debtSales)||!nonneg(shift.expenses)||
  !nonneg(shift.expectedCash)||
  !nonneg(shift.cashReturns??0))
  return {ok:false,error:"داتای Backup ناقصە یان ژمارەکان نادروستن؛ هیچ داتایەک نەگۆڕدرا"};
 // Reject multiple identities or duplicate receipt numbers, including in V1.
 const receiptNumbers=(s.receipts as Receipt[]).map(r=>r.receiptNumber);
 const barcodes=(s.products as Product[]).map(p=>p.unit_barcode);
 if(new Set(receiptNumbers).size!==receiptNumbers.length||
  new Set(barcodes).size!==barcodes.length)
  return {ok:false,error:"پسووڵە یان بارکۆدی دووبارە لە Backup دۆزرایەوە"};
 return {ok:true,snapshot:{
  products:s.products as Product[],customers:s.customers as Customer[],
  suppliers:s.suppliers as Supplier[],shift:shift as Shift,
  receipts:s.receipts as Receipt[],expenses:s.expenses as Expense[],
  stockMovements:s.stockMovements as StockMovement[],
  auditLogs:s.auditLogs as AuditLogEntry[],demoRefunds:refunds as DemoReturnV107[]
 }};
}
