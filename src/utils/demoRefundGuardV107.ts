// V107 browser DEMO ONLY. No financial authorization or database transaction.
// This guard is not a substitute for PostgreSQL's atomic refund function.
import type {Receipt,Shift,Customer,SaleUnitMode} from "../types";

export interface DemoReturnV107 {
 id:string;receiptNo:string;productId:string;productName:string;
 qty:number;mode?:SaleUnitMode;refundAmount:number;refundMethod?:"cash"|"debt";
 restocked:boolean;reason:string;createdAt:string;
}
type Request={
 receipt:Receipt|undefined;productId:string;qty:number;mode:SaleUnitMode;
 refundAmount:number;refundMethod:"cash"|"debt";customerId?:string|null;
 customers:Customer[];currentShift:Shift;priorReturns:DemoReturnV107[];
};
type Verdict={ok:true;productName:string;units:number}|{ok:false;message:string};
const fail=(message:string):Verdict=>({ok:false,message});
const max3=(n:number)=>Number.isFinite(n)&&n>0&&Number.isInteger(Math.round(n*1000))&&Math.abs(n*1000-Math.round(n*1000))<1e-7;
export function validateDemoRefundV107(input:Request):Verdict{
 const {receipt,productId,qty,mode,refundAmount,refundMethod,customerId,customers,currentShift,priorReturns}=input;
 if(!receipt||!receipt.receiptNumber.startsWith("DEMO-RCP-"))
  return fail("پسووڵەی ڕاستەقینەی Demo نەدۆزرایەوە");
 if(!Array.isArray(receipt.items)||!Array.isArray(priorReturns)||!Array.isArray(customers))
  return fail("داتای گەڕاندنەوە ناتەواوە");
 if(!max3(qty)||!Number.isSafeInteger(refundAmount)||refundAmount<=0)
  return fail("بڕی کاڵا یان پارەی گەڕاوە نادروستە");
 if(!["unit","carton","bundle","set"].includes(mode))return fail("یەکەی گەڕاندنەوە نادروستە");
 const sold=receipt.items.filter(x=>x.productId===productId&&x.mode===mode);
 if(sold.length===0)return fail("ئەم کاڵایە لەم پسووڵەیەدا نەفرۆشراوە");
 const unit=sold[0].price;
 if(!Number.isSafeInteger(unit)||unit<=0||sold.some(l=>l.price!==unit||!max3(l.qty)))
  return fail("نرخی ئەم کاڵایە پێویستی بە پشکنینی دەستی هەیە");
 // Global discounts, tax and mixed-price lines must not be over-refunded.
 if(receipt.discount!==0||receipt.tax!==0)
  return fail("گەڕاندنەوەی پسووڵەی داشکێندراو پێویستی بە پشکنینی تایبەت هەیە");
 const soldQty=sold.reduce((n,x)=>n+x.qty,0);
 let returnedQty=0,returnedAmount=0;
 for(const previous of priorReturns){
  if(!previous||typeof previous.receiptNo!=="string"||
    typeof previous.productId!=="string"||!max3(previous.qty)||
    !Number.isSafeInteger(previous.refundAmount)||previous.refundAmount<=0)
   return fail("مێژووی گەڕاندنەوە تێکچووە؛ هیچ پارەیەک مەگەڕێنەوە");
  if(previous.receiptNo===receipt.receiptNumber){
   returnedAmount+=previous.refundAmount;
   // Older DEMO entries lack package mode: conservatively count these too.
   if(previous.productId===productId&&(!previous.mode||previous.mode===mode))
    returnedQty+=previous.qty;
  }
 }
 if(returnedQty+qty>soldQty+1e-7)
  return fail("بڕی گەڕاندنەوە زیاترە لە بڕی ماوەی پسووڵە");
 const expected=Math.round(unit*qty);
 if(expected!==refundAmount||!Number.isSafeInteger(expected)||
   returnedAmount+refundAmount>receipt.total)
  return fail("بڕی پارەی گەڕاوە لەگەڵ پسووڵە ناگونجێت");
 if(refundMethod!==receipt.paymentMethod)
  return fail("شێوازی گەڕاندنەوە لەگەڵ پارەدانی پسووڵە ناگونجێت");
 if(refundMethod==="cash"){
  if(currentShift.status!=="open"||currentShift.expectedCash<refundAmount)
   return fail("سندووقی شێفت ناکرێت بۆ ئەم گەڕاندنەوەیە بەکاربهێنرێت");
 }else{
  const customer=customers.find(c=>c.id===receipt.customerId);
  if(!receipt.customerId||customerId!==receipt.customerId||!customer||
   !Number.isSafeInteger(customer.balanceDebt)||customer.balanceDebt<refundAmount)
   return fail("قەرزی کڕیاری پسووڵە پشتڕاست نەکراوەتەوە");
 }
 const units=sold[0].units;
  if(!Number.isFinite(units)||units<=0||sold.some(l=>l.units!==units))
    return fail("بڕی بنەڕەتیی کاڵا لە پسووڵەدا ناگونجێت");
 return {ok:true,productName:sold[0].name,units};
}
