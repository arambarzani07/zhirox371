// V106: validation only for browser DEMO returns. This is not a fiscal refund API.
// All checks are applied before changing stock, cash or customer balances.
import type {Receipt,Product,Customer,Shift} from '../types';

export interface DemoRefundEntry {
  id:string;
  receiptNo:string;
  productId:string;
  productName:string;
  mode:'unit'|'carton';
  qty:number;
  refundAmount:number;
  restocked:boolean;
  reason:string;
  createdAt:string;
}
export interface DemoRefundRequest {
  receiptNo:string;
  productId:string;
  qty:number;
  mode?:'unit'|'carton';
  refundAmount:number;
  restock:boolean;
  refundMethod:'cash'|'debt';
  customerId?:string|null;
}
export type DemoRefundDecision = {ok:true;mode:'unit'|'carton';baseUnitsDelta:number} | {ok:false;message:string};
const reject=(message:string):DemoRefundDecision=>({ok:false,message});

export function validateDemoRefund({receipt,product,request,priorReturns,shift,customer}:{
  receipt:Receipt|undefined;
  product:Product|undefined;
  request:DemoRefundRequest;
  priorReturns:readonly DemoRefundEntry[];
  shift:Shift;
  customer:Customer|undefined;
}):DemoRefundDecision{
  if(!receipt||receipt.receiptNumber!==request.receiptNo||
     !receipt.receiptNumber.startsWith('DEMO-RCP-'))
    return reject('پسووڵەی تاقیکردنەوەی ڕەسەن نەدۆزرایەوە');
  if(!product||product.id!==request.productId)
    return reject('کاڵای دیاریکراو نەدۆزرایەوە');
  if(!Number.isSafeInteger(request.qty)||request.qty<1||
     !Number.isSafeInteger(request.refundAmount)||request.refundAmount<1||
     request.restock!==true&&request.restock!==false)
    return reject('بڕی گەڕاندنەوە نادروستە');
  if(shift.status!=='open')return reject('شێفتی کاشێر داخراوە');
  if(!Number.isSafeInteger(receipt.subtotal)||!Number.isSafeInteger(receipt.total)||
     receipt.discount!==0||receipt.subtotal!==receipt.total)
    return reject('گەڕاندنەوەی پسووڵەی داشکاندراو پێویستی بە حسابکردنی ڕاستەقینە هەیە');
  const lines=receipt.items.filter(x=>x.productId===request.productId);
  if(lines.length===0)return reject('ئەم کاڵایە لە پسووڵەکەدا نییە');
  const mode=request.mode||'unit';
  if(lines.some(x=>x.mode!==mode||x.isScale||
     !Number.isSafeInteger(x.qty)||x.qty<1||
     !Number.isSafeInteger(x.price)||x.price<1||
     !Number.isFinite(x.units)||x.units<=0||
     x.price!==lines[0].price||x.units!==lines[0].units))
    return reject('یەکە، نرخ یان کێشی کاڵای فرۆشراو ناگونجێت');
  const soldQty=lines.reduce((s,x)=>s+x.qty,0);
  if(!Number.isSafeInteger(soldQty))return reject('بڕی فرۆشتنی پسووڵەکە نادروستە');
  const returnedQty=priorReturns.filter(x=>x.receiptNo===request.receiptNo&&
     x.productId===request.productId&&x.mode===mode)
     .reduce((s,x)=>s+x.qty,0);
  if(!Number.isSafeInteger(returnedQty)||returnedQty+request.qty>soldQty)
    return reject('بڕی گەڕاندنەوە لە بڕی ماوەی پسووڵەکە زیاترە');
  if(lines[0].price*request.qty!==request.refundAmount)
    return reject('بڕی پارەی گەڕێندراوە لە نرخی پسووڵەکە جیاوازە');
  const baseUnitsDelta=lines[0].units*request.qty;
  if(!Number.isFinite(baseUnitsDelta)||baseUnitsDelta<=0||
     Math.round(baseUnitsDelta*1000)/1000!==baseUnitsDelta)
    return reject('بڕی یەکەی کۆگا نادروستە');
  if(receipt.paymentMethod!==request.refundMethod)
    return reject('شێوازی پارەدان لەگەڵ پسووڵەی سەرەکی ناگونجێت');
  if(request.refundMethod==='cash'){
    if(!Number.isSafeInteger(shift.expectedCash)||shift.expectedCash<request.refundAmount)
      return reject('پارەی پێویست لە سندووقی شێفتدا نییە');
  }else{
    if(!receipt.customerId||request.customerId!==receipt.customerId||
       !customer||customer.id!==receipt.customerId||
       !Number.isSafeInteger(customer.balanceDebt)||customer.balanceDebt<request.refundAmount)
      return reject('حسابی قەرزدار یان قەرزی ماوە ناگونجێت');
  }
  return {ok:true,mode,baseUnitsDelta};
}
