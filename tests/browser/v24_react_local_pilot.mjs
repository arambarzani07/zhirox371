import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1320,height:850}});
const page=await context.newPage();
const errors=[],requests=[];
const store="10000000-0000-0000-0000-000000000001";
const prod="30000000-0000-0000-0000-000000000003";
const sale="40000000-0000-0000-0000-000000000004";
page.on("pageerror",e=>errors.push(e.message));
let attempts=0,serverPending=null;
await page.route("**/api/local/**",async route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname;
 if(path==="/api/local/v3/login"){
   const body=request.postDataJSON();
   assert.equal(request.method(),"POST");
   assert.equal(body.store_id,store);
   assert.equal(body.username,"cashier");
   assert.equal(body.password,"test-password-for-isolated-pilot");
   return route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify({ok:true,token:"session-test-token",role:"cashier",expires_in_seconds:900})});
 }
 assert.equal(request.headers().authorization,"Bearer session-test-token");
 if(path==="/api/local/v26/scan"){
   assert.equal(request.method(),"GET");
   const code=url.searchParams.get("code");
   if(code==="2700001004806"||code==="2700001002451"){
     const grams=code==="2700001004806"?480:245;
     const amount=Math.floor(grams*11000/1000+0.5);
     return route.fulfill({status:200,contentType:"application/json",
       body:JSON.stringify({ok:true,product:{
         id:"30000000-0000-0000-0000-000000000027",
         name:"تەماتە",barcode:code,base_unit:"gram",sale_mode:"scale",
         quantity_base_units:grams,weight_grams:grams,
         price_minor:String(amount),unit_price_minor:"11000",stock_base_units:"2000"
       }})});
   }
   if(code==="6260053183998")
     return route.fulfill({status:200,contentType:"application/json",
       body:JSON.stringify({ok:true,product:{
         id:prod,name:"ئاوی کانی چنار",barcode:code,
         base_unit:"unit",sale_mode:"carton",quantity_base_units:12,weight_grams:null,
         price_minor:"5500",unit_price_minor:"5500",stock_base_units:"30"
       }})});
   assert.equal(code,"6260053183974");
   return route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify({ok:true,product:{
       id:prod,name:"ئاوی کانی چنار",barcode:code,
       base_unit:"unit",sale_mode:"unit",quantity_base_units:1,weight_grams:null,
       price_minor:"2500",unit_price_minor:"2500",stock_base_units:"30"
     }})});
 }
 if(path==="/api/local/v31/recover"){
   return route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify({ok:true,intent:serverPending})});
 }
 if(path==="/api/local/v31/prepare"){
   const body=request.postDataJSON();
   if(serverPending&&serverPending.request_id!==body.request_id)
     throw Error("Unfinished server checkout was overwritten");
   serverPending={...body,state:"prepared",sale_id:null,receipt_no:null,total_minor:null};
   return route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify({ok:true,intent:serverPending})});
 }
 if(path==="/api/local/v31/cancel"){
   const body=request.postDataJSON();
   assert.equal(body.request_id,serverPending?.request_id);
   serverPending=null;
   return route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify({ok:true,state:"cancelled"})});
 }
 if(path==="/api/local/v31/commit"){
   assert.equal(request.method(),"POST");attempts++;
   const body=request.postDataJSON();
   assert.equal(body.request_id,serverPending?.request_id);
   requests.push({...serverPending});
   if(attempts<4){
     assert.deepEqual(serverPending.lines,[{barcode:"6260053183974",qty:1}]);
     assert.equal(serverPending.expected_total_minor,2500);
   }else{
     assert.deepEqual(serverPending.lines,[
       {barcode:"6260053183998",qty:1},
       {barcode:"2700001004806",qty:1},
       {barcode:"2700001002451",qty:1}
     ]);
     assert.equal(serverPending.expected_total_minor,13475);
   }
   assert.ok(!("store_id" in body)&&!("cashier_id" in body));
   assert.match(body.request_id,/^[a-f0-9-]{36}$/i);
   if(attempts===3)return route.fulfill({status:409,contentType:"application/json",body:'{"error":"price_changed"}'});
   if(attempts===1)return route.fulfill({status:503,contentType:"application/json",
       body:'{"error":"local_database_unavailable"}'});
   serverPending=null;
   return route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify({ok:true,receipt:{sale_id:sale,receipt_no:attempts===4?2:1,
       total_minor:attempts===4?"13475":"2500",replayed:attempts!==4}})});
 }
 throw Error("Unexpected local API "+path);
});
try {
 await page.goto("http://127.0.0.1:3000/",{waitUntil:"networkidle"});
 await page.getByRole("button",{name:/کاشێر \(F1\)/}).click();
 await page.getByRole("button",{name:/کردنەوەی V31/}).click();
 assert.match(await page.getByText(/تەنها تاقیکردنەوە لەسەر هەمان PC/).innerText(),/Production/);
 await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).fill(store);
 await page.getByPlaceholder("ناوی بەکارهێنەر").fill("cashier");
 await page.getByPlaceholder("وشەی نهێنی ناوخۆیی").fill("test-password-for-isolated-pilot");
 await page.getByRole("button",{name:"چوونەژوورەوەی تاقیکردنەوە"}).click();
 await page.getByPlaceholder("بارکۆدی دانە، کارتۆن یان تەرازوو بسکانە").fill("6260053183974");
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByText("2,500 IQD").first().waitFor({state:"visible"});
 await page.getByRole("button",{name:"تاقیکردنەوەی فرۆشتنی Atomic"}).click();
 await page.getByText(/ئەنجامی فرۆشتن دڵنیا نییە/).waitFor();
 assert.equal(attempts,1);
 const sessionKey="zhirox-v24-local-pending:"+store;
 const persisted=await page.evaluate(k=>sessionStorage.getItem(k),sessionKey);
 assert.equal(JSON.parse(persisted).request_id,requests[0].request_id);
 assert.match(await page.getByText(/سەبەتە قوفڵ کراوە/).innerText(),/قوفڵ/);
 // Simulate a browser crash/reload after an uncertain HTTP response. Server
 // journal still owns the same UUID and cashier can recover it after re-login.
 await page.reload({waitUntil:"networkidle"});
 await page.getByRole("button",{name:/کاشێر \(F1\)/}).click();
 await page.getByRole("button",{name:/کردنەوەی V31/}).click();
 await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).fill(store);
 await page.getByPlaceholder("ناوی بەکارهێنەر").fill("cashier");
 await page.getByPlaceholder("وشەی نهێنی ناوخۆیی").fill("test-password-for-isolated-pilot");
 await page.getByRole("button",{name:"چوونەژوورەوەی تاقیکردنەوە"}).click();
 await page.getByRole("button",{name:"دووبارە ناردنی هەمان داواکاری"}).waitFor();
 assert.equal(serverPending?.request_id,requests[0].request_id);
 await page.getByRole("button",{name:"دووبارە ناردنی هەمان داواکاری"}).click();
 await page.getByText(/پسووڵەی PostgreSQL ـی تاقیکردنەوە/).waitFor();
 assert.equal(attempts,2);
 assert.equal(requests[0].request_id,requests[1].request_id);
 assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),sessionKey),null);
 // Server rejects the next checkout because its authoritative price changed.
 await page.getByPlaceholder("بارکۆدی دانە، کارتۆن یان تەرازوو بسکانە").fill("6260053183974");
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByRole("button",{name:"تاقیکردنەوەی فرۆشتنی Atomic"}).click();
 await page.getByText(/نرخی کاڵا لە سێرڤەر گۆڕاوە/).waitFor();
 assert.equal(attempts,3);
 assert.notEqual(requests[2].request_id,requests[1].request_id);
 assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),sessionKey),null);
 // Two distinct weighed labels + one independently priced carton.
 const barcode=page.getByPlaceholder("بارکۆدی دانە، کارتۆن یان تەرازوو بسکانە");
 for(const code of ["6260053183998","2700001004806","2700001002451"]){
   await barcode.fill(code);
   await page.getByRole("button",{name:"سکان",exact:true}).click();
 }
 await page.getByText(/13,475 IQD/).first().waitFor();
 assert.equal(await page.getByText(/0\.480/).count()>0,true);
 await barcode.fill("2700001004806");
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByText(/لیبڵەی کێشدارە پێشتر/).waitFor();
 await page.getByRole("button",{name:"تاقیکردنەوەی فرۆشتنی Atomic"}).click();
 await page.getByText(/پسووڵەی PostgreSQL ـی تاقیکردنەوە/).waitFor();
 assert.equal(attempts,4);
 assert.equal(await page.getByRole("button",{name:/پسووڵەکانی ئەمڕۆ \(0\)/}).count(),1,
   "isolated local checkout must not mutate React DEMO receipt list");
 assert.deepEqual(errors,[]);
 console.log("PASS V24: same-origin test login, server barcode, retry same UUID, no local demo receipt pollution");
}finally{await browser.close();}
