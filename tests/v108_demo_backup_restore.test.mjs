import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseDemoBackupV108} from "../src/utils/demoBackupGuardV108.ts";

const backup=()=>({
 backup_version:2,source:"ZHIROX371_BROWSER_DEMO",
 store:{name:"سوپەرمارکێتی کانی چنار"},
 snapshot:{
  products:[{id:"prod1",name:"ئاوی کانی چنار",unit_barcode:"2000000000018",
   unit_sale_price_iqd:1000,stock:10,min_stock:2,unit_alias_barcodes:[]}],
  customers:[{id:"cust1",name:"کڕیار",phone:"0750",balanceDebt:0}],
  suppliers:[{id:"sup1",name:"دابینکەر",phone:"",balanceDebt:0}],
  shift:{id:"shift1",cashierName:"test",status:"open",openingFloat:1000,
   cashSales:0,debtSales:0,expenses:0,expectedCash:1000,cashReturns:0},
  receipts:[{id:"rcp1",receiptNumber:"DEMO-RCP-1001",
   cashierName:"test",paymentMethod:"cash",subtotal:1000,discount:0,total:1000,
   items:[{productId:"prod1",name:"ئاوی کانی چنار",price:1000,qty:1,total:1000}]}],
  expenses:[{id:"expense1",title:"taxi",amount:100,category:"other"}],
  stockMovements:[{id:"movement1",productId:"prod1",type:"sale",
   previousStock:11,newStock:10,quantityDelta:-1}],
  auditLogs:[{id:"audit1",action:"sample",user:"test",timestamp:new Date().toISOString()}],
  demoRefunds:[]
 }
});
const check=b=>parseDemoBackupV108(JSON.stringify(b));
test("V108 accepts complete browser DEMO backups and empty/legacy refunds, never real DB",()=>{
 const a=backup(),r=check(a);
 assert.equal(r.ok,true);
 assert.equal(r.snapshot.receipts[0].receiptNumber,"DEMO-RCP-1001");
 a.snapshot.demoRefunds=[{id:"refund1",receiptNo:"DEMO-RCP-1001",productId:"prod1",
  qty:1,refundAmount:1000}];
 assert.equal(check(a).ok,true);
 delete a.snapshot.demoRefunds;
 a.backup_version=1;delete a.source;
 assert.equal(check(a).ok,true,"legacy V1 complete backup is accepted");
});
test("V108 rejects incomplete or foreign snapshot before any state update",()=>{
 for(const malformed of ["","not-json","{}",'{"snapshot":{}}']){
  assert.equal(parseDemoBackupV108(malformed).ok,false);
 }
 const a=backup();delete a.snapshot.stockMovements;
 assert.equal(check(a).ok,false,"partial restore cannot be accepted");
 const b=backup();b.store.name="مارکێتی ڕاستەقینە";
 assert.equal(check(b).ok,false);
 const c=backup();c.backup_version=2;c.source="some-other-app";
 assert.equal(check(c).ok,false);
 const d=backup();d.snapshot.products=[{id:"p1",name:"wrong",stock:0}];
 assert.equal(check(d).ok,false);
});
test("V108 rejects duplicate product/barcode/receipt ID and invalid money",()=>{
 const a=backup();a.snapshot.products.push({...a.snapshot.products[0],id:"prod2"});
 assert.equal(check(a).ok,false,"duplicate selling barcode");
 const b=backup();b.snapshot.products.push({...b.snapshot.products[0]});
 assert.equal(check(b).ok,false,"duplicate product IDs");
 const c=backup();c.snapshot.receipts.push({...c.snapshot.receipts[0],id:"rcp2"});
 assert.equal(check(c).ok,false,"same fiscal DEMO receipt reused");
 const d=backup();d.snapshot.receipts[0].total=-500;
 assert.equal(check(d).ok,false,"negative receipt total");
 const e=backup();e.snapshot.shift.expectedCash=-1;
 assert.equal(check(e).ok,false,"negative drawer");
 const f=backup();f.snapshot.demoRefunds=[{id:"bad",receiptNo:"DEMO-RCP-1001",
  productId:"prod1",qty:1,refundAmount:-500}];
 assert.equal(check(f).ok,false,"negative return");
 const g=backup();g.snapshot.products[0].stock=NaN;
 assert.equal(check(g).ok,false,"nonfinite stock");
});
test("V108 import code validates the whole backup BEFORE setState, labels download truthfully",()=>{
 const app=readFileSync("src/context/AppContext.tsx","utf8");
 const diag=readFileSync("src/components/DiagnosticsQaView.tsx","utf8");
 const start=app.indexOf("const importBackupJson =");
 const part=app.slice(start,app.indexOf("return (\n    <AppContext.Provider",start));
 assert.ok(part.indexOf("parseDemoBackupV108(jsonString)")>=0);
 assert.ok(part.indexOf("parseDemoBackupV108(jsonString)")<part.indexOf("setProducts(snap.products)"));
 assert.match(app,/source:'ZHIROX371_BROWSER_DEMO'/);
 assert.match(app,/demoRefunds/);
 assert.match(diag,/بە شێوەی خۆکار لە D: پاشەکەوت نەکراوە/);
 assert.match(diag,/window\.confirm/);
});
