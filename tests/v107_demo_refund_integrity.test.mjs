import test from "node:test";
import assert from "node:assert/strict";
import {validateDemoRefundV107} from "../src/utils/demoRefundGuardV107.ts";

const receipt={
 id:"rcp1",receiptNumber:"DEMO-RCP-1001",createdAt:new Date().toISOString(),
 cashierName:"test",customerId:null,customerName:"buyer",
 items:[{productId:"prod-4",name:"چای",barcode:"8690000000001",
  mode:"carton",price:102000,qty:1,units:24,total:102000}],
 subtotal:102000,discount:0,discountPercent:0,tax:0,total:102000,
 paidAmount:102000,changeAmount:0,paymentMethod:"cash"
};
const shift={id:"shift",cashierName:"test",openedAt:new Date().toISOString(),
 closedAt:null,openingFloat:100000,cashSales:200000,debtSales:0,
 cashReturns:0,expenses:0,expectedCash:300000,actualCash:null,discrepancy:null,status:"open"};
const prior={id:"retA",receiptNo:"DEMO-RCP-1001",productId:"prod-4",productName:"چای",
 qty:1,mode:"carton",refundAmount:102000,refundMethod:"cash",
 restocked:true,reason:"test",createdAt:new Date().toISOString()};
const req={receipt,productId:"prod-4",qty:1,mode:"carton",refundAmount:102000,
 refundMethod:"cash",customerId:null,customers:[],currentShift:shift,priorReturns:[]};
test("V107 approves exactly one clean DEMO carton refund and verifies unit conversion",()=>{
 const r=validateDemoRefundV107(req);
 assert.equal(r.ok,true);
 assert.equal(r.units,24);
 assert.equal(r.productName,"چای");
});
test("V107 refuses repeat refund, missing/foreign product, unknown receipt, excessive quantity and amount",()=>{
 assert.equal(validateDemoRefundV107({...req,priorReturns:[prior]}).ok,false);
 assert.equal(validateDemoRefundV107({...req,receipt:undefined}).ok,false);
 assert.equal(validateDemoRefundV107({...req,receipt:{...receipt,receiptNumber:"LIVE-REAL-1"}}).ok,false);
 assert.equal(validateDemoRefundV107({...req,productId:"prod-X"}).ok,false);
 assert.equal(validateDemoRefundV107({...req,qty:2,refundAmount:204000}).ok,false);
 assert.equal(validateDemoRefundV107({...req,refundAmount:999999}).ok,false);
 assert.equal(validateDemoRefundV107({...req,qty:0}).ok,false);
 assert.equal(validateDemoRefundV107({...req,qty:NaN}).ok,false);
 assert.equal(validateDemoRefundV107({...req,qty:0.123456}).ok,false);
 assert.equal(validateDemoRefundV107({...req,mode:"unit"}).ok,false);
 assert.equal(validateDemoRefundV107({...req,priorReturns:[{...prior,mode:undefined}]}).ok,false,
  "old DEMO ledger without mode must still block repeated refund");
});
test("V107 protects discounted receipts, drawer shift, tender and tampered prior ledger",()=>{
 assert.equal(validateDemoRefundV107({...req,receipt:{...receipt,discount:2500,total:99500}}).ok,false);
 assert.equal(validateDemoRefundV107({...req,currentShift:{...shift,status:"closed"}}).ok,false);
 assert.equal(validateDemoRefundV107({...req,currentShift:{...shift,expectedCash:50000}}).ok,false);
 assert.equal(validateDemoRefundV107({...req,refundMethod:"debt"}).ok,false);
 assert.equal(validateDemoRefundV107({...req,priorReturns:[{...prior,qty:-1}]}).ok,false);
});
test("V107 debt refunds require original receipt customer, balance and exact tender",()=>{
 const customer={id:"cust",name:"کڕیار",phone:"",balanceDebt:200000};
 const debtReceipt={...receipt,paymentMethod:"debt",customerId:"cust"};
 const base={...req,receipt:debtReceipt,refundMethod:"debt",customerId:"cust",customers:[customer]};
 assert.equal(validateDemoRefundV107(base).ok,true);
 assert.equal(validateDemoRefundV107({...base,customerId:"other"}).ok,false);
 assert.equal(validateDemoRefundV107({...base,customers:[{...customer,balanceDebt:90000}]}).ok,false);
 assert.equal(validateDemoRefundV107({...base,receipt:{...debtReceipt,customerId:null}}).ok,false);
});
