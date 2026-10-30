import assert from "node:assert/strict";
import {chromium} from "playwright";
const store="10000000-0000-0000-0000-000000000037";
const product="20000000-0000-0000-0000-000000000037";
const sale="30000000-0000-0000-0000-000000000037";
const barcode="6260053183974";
let shift=null,commits=0,closed=0,posted=0,refunded=0;
const movements=[];
const errors=[];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
page.on("pageerror",e=>errors.push(e.message));
await page.route("**/api/local/**",async route=>{
 const req=route.request(),url=new URL(req.url()),p=url.pathname;
 const ok=(status,obj)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(obj)});
 if(p==="/api/local/v3/login"){
  const x=req.postDataJSON();
  return ok(200,{ok:true,token:x.username==="manager-v39"?"v39-manager-token":"v38-ci-token",
   role:x.username==="manager-v39"?"manager":"cashier",expires_in_seconds:900});
 }
 assert.equal(req.headers().authorization,"Bearer v38-ci-token");
 if(p==="/api/local/v31/recover")return ok(200,{ok:true,intent:null});
 if(p==="/api/local/v32/receipts")return ok(200,{ok:true,receipts:[]});
 if(p==="/api/local/v37/shift"&&req.method()==="GET")
  return ok(200,{ok:true,shift:shift?.state==="open"?shift:null});
 if(p==="/api/local/v37/shift/open"){
  const x=req.postDataJSON();assert.equal(x.opening_minor,10000);
  shift={shift_id:x.shift_id,opening_minor:"10000",state:"open"};
  return ok(200,{ok:true,shift});
 }
 if(p==="/api/local/v38/summary"){
  return ok(200,{ok:true,summary:{shift_id:shift.shift_id,state:shift.state,
   opening_minor:"10000",cash_sales_minor:String(commits*2500),
   cash_in_minor:String(movements.filter(m=>m.kind==="cash_in").reduce((a,m)=>a+m.amount_minor,0)),
   cash_out_minor:"0",
   expense_minor:String(movements.filter(m=>m.kind==="expense").reduce((a,m)=>a+m.amount_minor,0)),
   expected_minor:String(10000+commits*2500-refunded+movements.reduce((a,m)=>a+(m.kind==="cash_in"?m.amount_minor:-m.amount_minor),0))}});
 }
 if(p==="/api/local/v38/movements")return ok(200,{ok:true,movements:movements.slice().reverse(),limit:100});
 if(p==="/api/local/v38/movement"){
  const m=req.postDataJSON();
  assert.deepEqual(Object.keys(m).sort(),["amount_minor","entry_id","kind","reason","shift_id"]);
  assert.equal(m.shift_id,shift?.shift_id);
  if(!movements.some(x=>x.entry_id===m.entry_id))movements.push(m);
  posted++;
  return ok(200,{ok:true,movement:m});
 }
 if(p==="/api/local/v40/refundable-lines"){
  assert.equal(url.searchParams.get("sale_id"),sale);
  return ok(200,{ok:true,lines:[{sale_id:sale,line_no:1,name_snapshot:"کاڵای V37",
   line_total_minor:"2500",quantity_base_units:"3",returned_base_units:"0",refunded_minor:"0",fully_refunded:false}]});
 }
 if(p==="/api/local/v40/partial-refund"){
  assert.equal(req.headers()["x-zhirox-manager-token"],"v39-manager-token");
  const x=req.postDataJSON();
  assert.equal(x.line_no,1);assert.equal(x.sale_id,sale);assert.equal(x.restock,false);
  assert.equal(x.quantity_base_units,1);
  assert.equal(x.shift_id,shift.shift_id);refunded+=833;
  return ok(200,{ok:true,refund:{refund_id:x.refund_id,line_no:1,
    refund_minor:"833",quantity_base_units:1,sale_id:sale,restock:false,replayed:false}});
 }
 if(p==="/api/local/v26/scan")return ok(200,{ok:true,product:{
  id:product,name:"کاڵای V37",barcode,price_minor:"2500",unit_price_minor:"2500",
  stock_base_units:"5",base_unit:"unit",sale_mode:"carton",quantity_base_units:3,weight_grams:null
 }});
 if(p==="/api/local/v31/prepare")return ok(200,{ok:true,intent:{
  ...req.postDataJSON(),state:"prepared",sale_id:null,receipt_no:null,total_minor:null
 }});
 if(p==="/api/local/v31/commit"){
  if(shift?.state!=="open")throw Error("sale without open shift");
  commits++;
  return ok(200,{ok:true,receipt:{sale_id:sale,receipt_no:"37",total_minor:"2500",replayed:false}});
 }
 if(p==="/api/local/v37/shift/close"){
  const x=req.postDataJSON();assert.equal(x.shift_id,shift?.shift_id);
  assert.equal(x.counted_minor,11167);
  closed++;shift={...shift,state:"closed",cash_sales_minor:"2500",
   cash_in_minor:"500",cash_out_minor:"0",expense_minor:"1000",expected_minor:"11167",counted_minor:"11167",variance_minor:"0"};
  return ok(200,{ok:true,shift});
 }
 throw Error("Unexpected local API: "+p);
});
try{
 await page.goto("http://127.0.0.1:3045/",{waitUntil:"networkidle"});
 assert.equal(await page.locator("[data-local-v36-pilot=true]").count(),1);
 assert.equal(await page.getByRole("heading",{name:"بەشە سەرەکییەکان"}).count(),0);
 await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).fill(store);
 await page.getByPlaceholder("ناوی بەکارهێنەر").fill("cashier-v37");
 await page.getByPlaceholder("وشەی نهێنی ناوخۆیی").fill("v37-test-only");
 await page.getByRole("button",{name:"چوونەژوورەوەی تاقیکردنەوە"}).click();
 const submit=page.getByRole("button",{name:"تاقیکردنەوەی فرۆشتنی Atomic"});
 await page.getByRole("button",{name:"کردنەوەی شێفت"}).waitFor();
 assert.equal(await submit.isDisabled(),true);
 await page.getByLabel("پارەی سەرەتای سندووق").fill("10000");
 await page.getByRole("button",{name:"کردنەوەی شێفت"}).click();
 await page.getByText(/شێفت کراوە — فرۆشتنی نەختینە/).waitFor();
 const scan=page.getByPlaceholder("بارکۆدی دانە، کارتۆن یان تەرازوو بسکانە");
 await scan.fill(barcode);
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByText("کاڵای V37").waitFor();
 await submit.click();
 await page.getByText(/پسووڵەی PostgreSQL ـی تاقیکردنەوە: #37/).waitFor();

 await page.getByLabel("جۆری جووڵەی پارە").selectOption("expense");
 await page.getByLabel("بڕی جووڵەی پارە").fill("1000");
 await page.getByLabel("هۆکاری جووڵەی پارە").fill("کڕینی کاغەز");
 await page.getByRole("button",{name:"تۆمارکردنی جووڵەی پارە"}).click();
 await page.getByText(/تۆمارکرا — بڕی پارە/).waitFor();
 await page.getByLabel("جۆری جووڵەی پارە").selectOption("cash_in");
 await page.getByLabel("بڕی جووڵەی پارە").fill("500");
 await page.getByLabel("هۆکاری جووڵەی پارە").fill("زیادکردنی سندووق");
 await page.getByRole("button",{name:"تۆمارکردنی جووڵەی پارە"}).click();
 await page.getByText(/پارەی چاوەڕوانکراو: 12,000 IQD/).waitFor();


 await page.getByLabel("ناسنامەی پسووڵە بۆ بەشی گەڕاندنەوە").fill(sale);
 await page.getByRole("button",{name:"پشکنینی بڕی ماوەی پسووڵە"}).click();
 await page.getByLabel("ڕیزی بەشی گەڕاندنەوە").selectOption("1");
 await page.getByLabel("بڕی بەشی گەڕاندنەوە").fill("1");
 await page.getByLabel("هۆکاری بەشی گەڕاندنەوە").fill("یەک دانەی باش نییە");
 await page.getByLabel("بەڕێوەبەری بەشی گەڕاندنەوە").fill("manager-v39");
 await page.getByLabel("وشەی نهێنی بەشی گەڕاندنەوە").fill("approval-test-password");
 await page.getByRole("button",{name:"پەسەندکردنی بەشی گەڕاندنەوە"}).click();
 await page.getByText(/گەڕاندنەوەی بەشی کاڵا لە PostgreSQL پشتڕاست کرا/).waitFor();
 await page.getByLabel("پارەی ژمێردراو").fill("11167");
 await page.getByRole("button",{name:"داخستنی شێفت و پشتڕاستکردنەوەی سندووق"}).click();
 await page.getByText(/هیچ شێفتێک نەکراوەتەوە — فرۆشتن ڕاگیراوە/).waitFor();
 assert.equal(await submit.isDisabled(),true);
 assert.equal(commits,1);assert.equal(closed,1);assert.equal(movements.length,2);assert.equal(posted,2);assert.equal(refunded,833);
 await page.getByText(/ڕاپۆرتی کۆتایی شێفتی داخراو/).waitFor();
 assert.deepEqual(errors,[]);
 console.log("V40 PASS: no checkout before shift, one PostgreSQL sale, close and checkout gated again");
}finally{await browser.close();}
