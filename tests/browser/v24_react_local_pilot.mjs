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
let attempts=0;
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
 if(path==="/api/local/v4/barcode"){
   assert.equal(request.method(),"GET");
   assert.equal(url.searchParams.get("code"),"6260053183974");
   return route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify({ok:true,product:{
       id:prod,name:"ئاوی کانی چنار",barcode:"6260053183974",
       price_minor:"2500",stock_base_units:"10"
     }})});
 }
 if(path==="/api/local/v25/checkout"){
   assert.equal(request.method(),"POST");attempts++;
   const body=request.postDataJSON();requests.push(body);
   assert.deepEqual(body.lines,[{product_id:prod,qty:1}]);
   assert.equal(body.expected_total_minor,2500);
   assert.ok(!("store_id" in body)&&!("cashier_id" in body));
   assert.match(body.request_id,/^[a-f0-9-]{36}$/i);
   if(attempts===3)return route.fulfill({status:409,contentType:"application/json",body:'{"error":"price_changed"}'});
   if(attempts===1)return route.fulfill({status:503,contentType:"application/json",
       body:'{"error":"local_database_unavailable"}'});
   return route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify({ok:true,receipt:{sale_id:sale,receipt_no:1,total_minor:"2500",replayed:true}})});
 }
 throw Error("Unexpected local API "+path);
});
try {
 await page.goto("http://127.0.0.1:3000/",{waitUntil:"networkidle"});
 await page.getByRole("button",{name:/کاشێر \(F1\)/}).click();
 await page.getByRole("button",{name:/کردنەوەی V24/}).click();
 assert.match(await page.getByText(/تەنها تاقیکردنەوە لەسەر هەمان PC/).innerText(),/Production/);
 await page.getByRole("textbox",{name:"UUID ـی فرۆشگا"}).fill(store);
 await page.getByPlaceholder("ناوی بەکارهێنەر").fill("cashier");
 await page.getByPlaceholder("وشەی نهێنی ناوخۆیی").fill("test-password-for-isolated-pilot");
 await page.getByRole("button",{name:"چوونەژوورەوەی تاقیکردنەوە"}).click();
 await page.getByPlaceholder("بارکۆدی دانە بسکانە").fill("6260053183974");
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByText("2,500 IQD").first().waitFor({state:"visible"});
 await page.getByRole("button",{name:"تاقیکردنەوەی فرۆشتنی Atomic"}).click();
 await page.getByText(/ئەنجامی فرۆشتن دڵنیا نییە/).waitFor();
 assert.equal(attempts,1);
 const sessionKey="zhirox-v24-local-pending:"+store;
 const persisted=await page.evaluate(k=>sessionStorage.getItem(k),sessionKey);
 assert.equal(JSON.parse(persisted).request_id,requests[0].request_id);
 assert.match(await page.getByText(/سەبەتە قوفڵ کراوە/).innerText(),/قوفڵ/);
 await page.getByRole("button",{name:"دووبارە ناردنی هەمان داواکاری"}).click();
 await page.getByText(/پسووڵەی PostgreSQL ـی تاقیکردنەوە/).waitFor();
 assert.equal(attempts,2);
 assert.equal(requests[0].request_id,requests[1].request_id);
 assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),sessionKey),null);
 // Server rejects the next checkout because its authoritative price changed.
 await page.getByPlaceholder("بارکۆدی دانە بسکانە").fill("6260053183974");
 await page.getByRole("button",{name:"سکان",exact:true}).click();
 await page.getByRole("button",{name:"تاقیکردنەوەی فرۆشتنی Atomic"}).click();
 await page.getByText(/نرخی کاڵا لە سێرڤەر گۆڕاوە/).waitFor();
 assert.equal(attempts,3);
 assert.notEqual(requests[2].request_id,requests[1].request_id);
 assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),sessionKey),null);
 assert.equal(await page.getByRole("button",{name:/پسووڵەکانی ئەمڕۆ \(0\)/}).count(),1,
   "isolated local checkout must not mutate React DEMO receipt list");
 assert.deepEqual(errors,[]);
 console.log("PASS V24: same-origin test login, server barcode, retry same UUID, no local demo receipt pollution");
}finally{await browser.close();}
