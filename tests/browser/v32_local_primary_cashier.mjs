import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";

const store="10000000-0000-0000-0000-000000000032";
const product="20000000-0000-0000-0000-000000000032";
const saleId="30000000-0000-0000-0000-000000000032";
const barcode="6260053183974";
const pendingKey="zhirox-v24-local-pending:"+store;
let failedScan=true,commits=0,prepares=0,receiptCount=0,prepared=null;
const requests=[],errors=[];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
page.on("pageerror",e=>errors.push(e.message));
await page.route("**/api/local/**",async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname;
 const json=(status,body)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
 if(path==="/api/local/v3/login"){
  assert.equal(req.postDataJSON().store_id,store);
  return json(200,{ok:true,token:"v32-test-session",role:"cashier",expires_in_seconds:900});
 }
 assert.equal(req.headers().authorization,"Bearer v32-test-session");
 if(path==="/api/local/v31/recover")return json(200,{ok:true,intent:null});
 if(path==="/api/local/v32/intent"){
  assert.equal(url.searchParams.get("request_id"),prepared?.request_id);
  return json(200,{ok:true,intent:prepared?{
   ...prepared,state:"committed",sale_id:saleId,receipt_no:"7",total_minor:"2500"
  }:null});
 }
 if(path==="/api/local/v32/receipts"){
  assert.equal(url.searchParams.get("limit"),"20");
  return json(200,{ok:true,receipts:receiptCount?[{
   sale_id:saleId,receipt_no:"7",total_minor:"2500",
   created_at:"2026-10-30T08:00:00Z"
  }]:[]});
 }
 if(path==="/api/local/v26/scan"){
  assert.equal(url.searchParams.get("code"),barcode);
  if(failedScan){failedScan=false;return json(503,{error:"local_database_unavailable"});}
  return json(200,{ok:true,product:{
   id:product,name:"ئاوی کانی چنار",barcode,base_unit:"unit",sale_mode:"unit",
   quantity_base_units:1,weight_grams:null,price_minor:"2500",
   unit_price_minor:"2500",stock_base_units:"30"
  }});
 }
 if(path==="/api/local/v31/prepare"){
  const data=req.postDataJSON();
  prepares++;requests.push(data);
  assert.equal(data.expected_total_minor,2500);
  assert.deepEqual(data.lines,[{barcode,qty:1}]);
  prepared={...data};
  return json(200,{ok:true,intent:{...data,state:"prepared",
   sale_id:null,receipt_no:null,total_minor:null}});
 }
 if(path==="/api/local/v31/commit"){
  const data=req.postDataJSON();
  assert.equal(data.request_id,prepared?.request_id);
  commits++;receiptCount=1;
  return json(200,{ok:true,receipt:{
   sale_id:saleId,receipt_no:"7",total_minor:"2500",replayed:false}});
 }
 throw Error("Unexpected local V32 API "+path);
});
const login=async()=>{
 await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).fill(store);
 await page.getByPlaceholder("ناوی بەکارهێنەر").fill("cashier");
 await page.getByPlaceholder("وشەی نهێنی ناوخۆیی").fill("v32-test-password");
 await page.getByRole("button",{name:"چوونەژوورەوەی تاقیکردنەوە"}).click();
 await page.getByPlaceholder("بارکۆدی دانە، کارتۆن یان تەرازوو بسکانە").waitFor();
};
try{
 await page.goto("http://127.0.0.1:3001/",{waitUntil:"networkidle"});
 await page.locator(".module").first().click();
 await page.locator(".drawer .sub").first().click();
 await page.getByRole("heading",{name:"کاشێر و فرۆشتن — PostgreSQL"}).waitFor();
 assert.equal(await page.locator(".pos-clean__trial").count(),1,"local PG trial marker remains visible");
 assert.equal(await page.locator("header.pos-local-appbar").count(),1,"no Demo shift/finance header on local cashier");
 assert.equal(await page.locator(".pos-clean__login").count(),1,"compact cashier sign-in");
 assert.equal(await page.locator(".pos-clean__notes[open]").count(),0,"technical notes are collapsed");
 await mkdir("artifacts/cashier-v1",{recursive:true});
 await page.screenshot({path:"artifacts/cashier-v1/01-sign-in.png",fullPage:false});
 assert.equal(await page.locator("#finish-sale").count(),0);
 assert.equal(await page.getByRole("button",{name:/کردنەوەی V31/}).count(),0,
  "V32 must render its own primary local page, not demo plus a collapsible panel");
 assert.equal(await page.locator("text=تاقیکردنەوە — داتای ئەم کاشێرە لە وێبگەڕ").count(),0);
 await login();
 assert.equal(await page.locator(".pos-clean__login").count(),0,"login panel closes after local auth");
 assert.equal(await page.locator(".pos-clean__workspace").count(),1,"cashier grid is active");
 assert.equal(await page.locator(".pos-clean__basket thead th").count(),6,"table has Sorani 6-column basket");
 assert.equal(await page.locator(".pos-clean__side").count(),1,"total and checkout panel exists");
 const geometry=await page.evaluate(()=>{
   const basket=document.querySelector(".pos-clean__transaction").getBoundingClientRect();
   const total=document.querySelector(".pos-clean__side").getBoundingClientRect();
   return basket.width>400 && total.width>200 && total.right<=basket.left+4;
 });
 assert.equal(geometry,true,"PC cashier total is beside the basket without overlap");
 await page.screenshot({path:"artifacts/cashier-v1/02-empty-basket.png",fullPage:false});
 const input=page.getByPlaceholder("بارکۆدی دانە، کارتۆن یان تەرازوو بسکانە");
 await input.fill(barcode);
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByText("local_api_503").waitFor();
 assert.equal(await page.locator("#finish-sale").count(),0);
 assert.equal(await page.getByRole("button",{name:"تاقیکردنەوەی فرۆشتنی Atomic"}).isDisabled(),true);
 await input.fill(barcode);
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByText(/2,500 IQD/).first().waitFor();
 await page.screenshot({path:"artifacts/cashier-v1/03-verified-scan.png",fullPage:false});
 await page.getByRole("button",{name:"تاقیکردنەوەی فرۆشتنی Atomic"}).click();
 await page.getByText(/پسووڵەی PostgreSQL ـی تاقیکردنەوە: #7/).waitFor();
 await page.getByRole("region",{name:"مێژووی پسووڵەی ناوخۆیی"}).getByText("2,500 IQD").waitFor();
 assert.equal(prepares,1);
 assert.equal(commits,1);
 assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),pendingKey),null);
 assert.equal(await page.locator("#finish-sale").count(),0);
 // Browser retained a stale hint for a committed server intent. It must show
 // the ORIGINAL receipt, not prepare/commit a second sale.
 await page.evaluate(([key,p])=>sessionStorage.setItem(key,JSON.stringify(p)),
  [pendingKey,prepared]);
 await page.reload({waitUntil:"networkidle"});
 await page.locator(".module").first().click();
 await page.locator(".drawer .sub").first().click();
 await login();
 await page.getByText(/پسووڵەی PostgreSQL ـی تاقیکردنەوە: #7/).waitFor();
 assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),pendingKey),null);
 assert.equal(prepares,1);assert.equal(commits,1);
 assert.equal(await page.locator("#finish-sale").count(),0);
 assert.deepEqual(errors,[]);
 console.log("PASS V32: standalone PostgreSQL cashier, outage fail closed, server receipt, stale committed hint and no Demo writes");
}finally{await browser.close();}
