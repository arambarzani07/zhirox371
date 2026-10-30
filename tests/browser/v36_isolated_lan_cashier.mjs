import assert from "node:assert/strict";
import {chromium} from "playwright";
const store="10000000-0000-0000-0000-000000000036";
const item="20000000-0000-0000-0000-000000000036";
const sale="40000000-0000-0000-0000-000000000036";
const barcode="6260053183974";
let committed=0,queued=0;
const errors=[];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
page.on("pageerror",e=>errors.push(e.message));
await page.route("**/api/local/**",async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname;
 const respond=(status,data)=>route.fulfill({status,contentType:"application/json",
  body:JSON.stringify(data)});
 if(path==="/api/local/v3/login")return respond(200,{
  ok:true,token:"v36-ci-session",role:"cashier",expires_in_seconds:900});
 assert.equal(req.headers().authorization,"Bearer v36-ci-session");
 if(path==="/api/local/v31/recover")return respond(200,{ok:true,intent:null});
 if(path==="/api/local/v32/receipts")return respond(200,{ok:true,receipts:
  committed?[{sale_id:sale,receipt_no:"12",total_minor:"2250",
  created_at:"2026-10-30T10:00:00Z"}]:[]});
 if(path==="/api/local/v26/scan")return respond(200,{ok:true,product:{
  id:item,name:"کاڵای تاقیکردنەوە",barcode,price_minor:"2250",unit_price_minor:"2250",
  stock_base_units:"9",base_unit:"unit",sale_mode:"unit",weight_grams:null,
  quantity_base_units:1
 }});
 if(path==="/api/local/v31/prepare")return respond(200,{
  ok:true,intent:{...req.postDataJSON(),state:"prepared",sale_id:null,receipt_no:null,total_minor:null}
 });
 if(path==="/api/local/v31/commit"){
  committed++;
  return respond(200,{ok:true,receipt:{sale_id:sale,receipt_no:"12",total_minor:"2250",replayed:false}});
 }
 if(path==="/api/local/v34/print-preview"){
  assert.equal(url.searchParams.get("sale_id"),sale);
  return route.fulfill({status:200,contentType:"text/html",body:
   '<!doctype html><html lang="ckb" dir="rtl"><body>پسووڵەی تاقیکردنەوە</body></html>'});
 }
 if(path==="/api/local/v35/print-jobs"){
  const data=req.postDataJSON();
  assert.equal(data.sale_id,sale);
  assert.equal(data.width_mm,80);
  assert.match(data.job_id,/^[0-9a-f-]{36}$/i);
  queued++;
  return respond(202,{ok:true,job:{job_id:data.job_id,sale_id:sale,width_mm:80,state:"queued"},
   hardware_printed:false});
 }
 throw Error("Unexpected V36 pilot request: "+path);
});
try{
 await page.goto("http://127.0.0.1:3040/",{waitUntil:"networkidle"});
 await page.getByRole("heading",{name:"کاشێر و فرۆشتن — PostgreSQL"}).waitFor();
 assert.equal(await page.locator("[data-local-v36-pilot=true]").count(),1);
 assert.equal(await page.locator("#finish-sale").count(),0);
 assert.equal(await page.getByRole("heading",{name:"بەشە سەرەکییەکان"}).count(),0);
 assert.equal(await page.locator("text=DEMO-RCP-").count(),0);
 await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).fill(store);
 await page.getByPlaceholder("ناوی بەکارهێنەر").fill("cashier-v36");
 await page.getByPlaceholder("وشەی نهێنی ناوخۆیی").fill("some-test-secret");
 await page.getByRole("button",{name:"چوونەژوورەوەی تاقیکردنەوە"}).click();
 const field=page.getByPlaceholder("بارکۆدی دانە، کارتۆن یان تەرازوو بسکانە");
 await field.waitFor();await field.fill(barcode);
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByRole("button",{name:"تاقیکردنەوەی فرۆشتنی Atomic"}).click();
 await page.getByText(/پسووڵەی PostgreSQL ـی تاقیکردنەوە: #12/).waitFor();
 await page.getByRole("button",{name:"پێشبینینی پسووڵە"}).click();
 await page.waitForTimeout(450);
 console.log("V36 preview diagnostic",JSON.stringify({
  frames:await page.locator("iframe").count(),
  status:(await page.getByRole("status").allTextContents()).slice(-5),
  errors
 }));
 await page.getByTitle("پێشبینینی پارێزراوی پسووڵە").waitFor({timeout:5000});
 await page.getByRole("button",{name:"تۆمارکردنی داواکاری چاپی تاقیکردنەوە"}).click();
 await page.getByText(/هیچ پرینتەرێک چاپی نەکردووە/).waitFor();
 assert.equal(committed,1);
 assert.equal(queued,1);
 assert.deepEqual(errors,[]);
 console.log("V36 PASS: isolated cashier only, server sale, verified receipt, queued NOT printed");
}finally{await browser.close();}
