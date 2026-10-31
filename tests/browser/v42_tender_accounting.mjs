import assert from "node:assert/strict";
import {chromium} from "playwright";
const store="10000000-0000-0000-0000-000000000041";
const item="20000000-0000-0000-0000-000000000041";
const barcode="6260053183974";
let prepared=null,plan=null,commits=0,cancelled=0;
const errors=[];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
page.on("pageerror",e=>errors.push(e.message));
await page.route("**/api/local/**",async route=>{
 const request=route.request(),url=new URL(request.url()),p=url.pathname;
 const reply=(status,value)=>route.fulfill({status,contentType:"application/json",
  body:JSON.stringify(value)});
 if(p==="/api/local/v3/login")return reply(200,{
  ok:true,token:"v41-ci-session",role:"cashier",expires_in_seconds:900});
 assert.equal(request.headers().authorization,"Bearer v41-ci-session");
 if(p==="/api/local/v31/recover")return reply(200,{ok:true,intent:null});
 if(p==="/api/local/v32/receipts")return reply(200,{ok:true,receipts:[]});
 if(p==="/api/local/v37/shift"&&request.method()==="GET")
  return reply(200,{ok:true,shift:null});
 if(p==="/api/local/v37/shift/open"){
  const x=request.postDataJSON();assert.equal(x.opening_minor,10000);
  return reply(200,{ok:true,shift:{shift_id:x.shift_id,state:"open",opening_minor:"10000"}});
 }
 if(p==="/api/local/v38/summary")
  return reply(200,{ok:true,summary:{state:"open",opening_minor:"10000",
   cash_sales_minor:"0",cash_in_minor:"0",cash_out_minor:"0",
   expense_minor:"0",expected_minor:"10000"}});
 if(p==="/api/local/v38/movements")return reply(200,{ok:true,movements:[],limit:100});
 if(p==="/api/local/v26/scan")return reply(200,{ok:true,product:{
  id:item,name:"کاڵای V41",barcode,price_minor:"2500",unit_price_minor:"2500",
  stock_base_units:"6",base_unit:"unit",sale_mode:"unit",
  quantity_base_units:1,weight_grams:null}});
 if(p==="/api/local/v31/prepare"){
  const x=request.postDataJSON();
  prepared={...x,state:"prepared",sale_id:null,receipt_no:null,total_minor:null};
  return reply(200,{ok:true,intent:prepared});
 }
 if(p==="/api/local/v41/tender-status"){
  assert.equal(url.searchParams.get("request_id"),prepared?.request_id);
  return reply(200,{ok:true,plan:plan?{...plan,intent_state:"prepared"}:null,
   external_settlement_supported:false});
 }
 if(p==="/api/local/v41/tender-plan"){
  const x=request.postDataJSON();
  assert.equal(x.request_id,prepared?.request_id);
  assert.equal(x.cash_minor,1000);
  assert.equal(x.external_minor,1500);
  assert.equal(x.external_method,"card");
  plan={...x,state:"external_unverified"};
  return reply(200,{ok:true,plan,checkout_allowed:false,
   external_settlement_supported:false});
 }
 if(p==="/api/local/v31/commit"){
  commits++;throw Error("V41 must NEVER commit an unverified mixed tender");
 }
 if(p==="/api/local/v31/cancel"){
  cancelled++;
  assert.equal(request.postDataJSON().request_id,prepared?.request_id);
  return reply(200,{ok:true,state:"cancelled"});
 }
 if(p==="/api/local/v42/merchant-readiness")
  return reply(200,{ok:true,external_provider_integrated:false,
    official_mixed_tender_enabled:false,release_ready:false,
    blockers:["provider_credentials_and_verified_settlement_missing"]});
 if(p==="/api/local/v42/tender-report")
  return reply(200,{ok:true,external_provider_integrated:false,
    official_mixed_tender_enabled:false,
    report:{gross_sales_minor:"0",cash_sales_minor:"0",
      bank_sales_minor:"0",cash_refunds_minor:"0",
      expected_drawer_minor:"10000"}});
 throw Error("Unexpected request "+p);
});
try{
 await page.goto("http://127.0.0.1:3046/",{waitUntil:"networkidle"});
 assert.equal(await page.locator("[data-local-v36-pilot=true]").count(),1);
 await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).fill(store);
 await page.getByPlaceholder("ناوی بەکارهێنەر").fill("cashier-v41");
 await page.getByPlaceholder("وشەی نهێنی ناوخۆیی").fill("only-disposable-test");
 await page.getByRole("button",{name:"چوونەژوورەوەی تاقیکردنەوە"}).click();
 await page.getByRole("button",{name:"کردنەوەی شێفت"}).waitFor();
 await page.getByLabel("پارەی سەرەتای سندووق").fill("10000");
 await page.getByRole("button",{name:"کردنەوەی شێفت"}).click();
 await page.getByText(/شێفت کراوە — فرۆشتنی نەختینە/).waitFor();
 await page.getByPlaceholder("بارکۆد").fill(barcode);
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByText("کاڵای V41").waitFor();
 await page.getByRole("button",{name:/ئامادەکردنی پلانی نەختینە/}).click();
 await page.getByLabel("نەختینەی پلانی تێکەڵ").waitFor();
 await page.getByLabel("نەختینەی پلانی تێکەڵ").fill("1000");
 await page.getByLabel("جۆری بانکیی پلان").selectOption("card");
 await page.getByRole("button",{name:"تۆمارکردنی پلان بەبێ فرۆشتن"}).click();
 await page.getByText(/بانک پشتڕاست نەکراوە؛ داواکاری تەنها پلانە/).waitFor();
 assert.equal(await page.getByRole("button",{name:"دووبارە ناردنی هەمان داواکاری"}).isDisabled(),true);
 assert.equal(commits,0);
 assert.equal(cancelled,0);
 await page.getByRole("button",{name:"هەڵوەشاندنەوەی پلانی چاوەڕوان"}).click();
 await page.getByText(/داواکاری هەڵوەشێندرایەوە؛ هیچ فرۆشتنێک تۆمار نەکرا/).waitFor();
 assert.equal(cancelled,1);
 assert.equal(commits,0);
 assert.equal(await page.getByRole("heading",{name:"بەشە سەرەکییەکان"}).count(),0);
 assert.deepEqual(errors,[]);
 console.log("V42 PASS: mixed quote prepared + blocked, zero committed sale, safe cancel; Demo never mounted");
}finally{await browser.close();}
