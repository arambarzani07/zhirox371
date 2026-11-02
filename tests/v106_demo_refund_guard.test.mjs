import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateDemoRefund} from "../src/utils/demoRefundGuard.ts";

const receipt={receiptNumber:"DEMO-RCP-20261102-0001",subtotal:5000,
 total:5000,discount:0,paymentMethod:"cash",customerId:null,
 items:[{productId:"p-1",mode:"unit",qty:2,price:2500,units:1,isScale:false}]};
const product={id:"p-1",name:"ئاوی نموونە"};
const shift={status:"open",expectedCash:10000};
const request={receiptNo:receipt.receiptNumber,productId:product.id,qty:1,
 mode:"unit",refundAmount:2500,restock:true,refundMethod:"cash"};
const validate=(changes={})=>validateDemoRefund({
 receipt,product,priorReturns:[],shift,customer:undefined,request,...changes
});
test("V106 allows one correct receipt-based DEMO return and exact original price",()=>{
 const answer=validate();
 assert.deepEqual(answer,{ok:true,mode:"unit",baseUnitsDelta:1});
});
test("V106 rejects forged receipts, unrelated goods, wrong mode and scale ambiguity",()=>{
 assert.equal(validate({receipt:undefined}).ok,false);
 assert.equal(validate({receipt:{...receipt,receiptNumber:"REAL-0001"}}).ok,false);
 assert.equal(validate({request:{...request,receiptNo:"DEMO-RCP-FAKE"}}).ok,false);
 assert.equal(validate({product:{id:"unrelated"}}).ok,false);
 assert.equal(validate({request:{...request,productId:"unrelated"}}).ok,false);
 assert.equal(validate({request:{...request,mode:"carton"}}).ok,false);
 assert.equal(validate({receipt:{...receipt,items:[{...receipt.items[0],isScale:true}]}}).ok,false);
});
test("V106 refuses overreturn, repeated refund across calls and wrong original price",()=>{
 const previous=[{receiptNo:receipt.receiptNumber,productId:"p-1",mode:"unit",qty:1,refundAmount:2500}];
 assert.equal(validate({priorReturns:previous}).ok,true);
 assert.equal(validate({priorReturns:[...previous,previous[0]]}).ok,false);
 assert.equal(validate({request:{...request,qty:3,refundAmount:7500}}).ok,false);
 assert.equal(validate({request:{...request,refundAmount:3500}}).ok,false);
 assert.equal(validate({request:{...request,qty:0,refundAmount:0}}).ok,false);
 assert.equal(validate({request:{...request,qty:1.5,refundAmount:3750}}).ok,false);
 assert.equal(validate({receipt:{...receipt,items:[]}}).ok,false);
});
test("V106 blocks refunds against discount and payment/cash/closed shift mismatches",()=>{
 assert.equal(validate({receipt:{...receipt,total:4500,discount:500}}).ok,false);
 assert.equal(validate({request:{...request,refundMethod:"debt"}}).ok,false);
 assert.equal(validate({shift:{status:"closed",expectedCash:10000}}).ok,false);
 assert.equal(validate({shift:{status:"open",expectedCash:1500}}).ok,false);
 assert.equal(validate({request:{...request,refundAmount:NaN}}).ok,false);
});
test("V106 debt refund must match original debtor and cannot exceed actual debt",()=>{
 const debtor={id:"customer-1",balanceDebt:5500};
 const debtReceipt={...receipt,paymentMethod:"debt",customerId:"customer-1"};
 const debtRequest={...request,refundMethod:"debt",customerId:"customer-1"};
 assert.equal(validate({receipt:debtReceipt,request:debtRequest,customer:debtor}).ok,true);
 assert.equal(validate({receipt:debtReceipt,request:debtRequest,customer:undefined}).ok,false);
 assert.equal(validate({receipt:debtReceipt,request:debtRequest,customer:{...debtor,balanceDebt:500}}).ok,false);
 assert.equal(validate({receipt:debtReceipt,request:{...debtRequest,customerId:"customer-2"},customer:debtor}).ok,false);
});
test("V106 central demo record persists refund quantities; no direct UI bypass",()=>{
 const app=readFileSync("src/context/AppContext.tsx","utf8");
 const view=readFileSync("src/components/OperationalSubmodulesView.tsx","utf8");
 assert.match(app,/validateDemoRefund\(/);
 assert.match(app,/returnJournalRef\.current=\[refund,\.\.\.returnJournalRef\.current\]/);
 assert.match(app,/setReturnJournal\(returnJournalRef\.current\)/);
 assert.match(app,/kanichnar_retail_pos_v18/);
 assert.match(app,/return_journal/);
 assert.match(view,/const totalReturnedIqd = returnJournal\.reduce/);
 assert.doesNotMatch(view,/storeState\.returns/);
});
