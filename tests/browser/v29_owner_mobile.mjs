import assert from "node:assert/strict";
import {createServer} from "node:http";
import {chromium} from "playwright";
import {createCloudReceiverV29} from "../../offline/cloud-receiver-v29.mjs";
import {parseV28Stores,hashOwnerToken} from "../../offline/cloud-receiver-v28.mjs";

const store="10000000-0000-0000-0000-000000000029";
const secret="v29-browser-test-private-token-".repeat(3);
const stores=parseV28Stores([{
 store_id:store,sync_secret:"v29-browser-HMAC-key-".repeat(3),
 owner_token_hash:hashOwnerToken(secret)
}]);
const pool={query:async(sql,args)=>{
 assert.equal(args[0],store);
 if(sql.includes("count(*)::bigint AS sales_count"))
  return {rows:[{sales_count:"2",total_minor:"14500",
    last_receipt_no:"2",last_received_at:"2026-10-30T04:30:00Z"}]};
 if(sql.startsWith("SELECT sale_id,receipt_no,total_minor,occurred_at,received_at"))
  return {rows:[{
   sale_id:"20000000-0000-0000-0000-000000000029",
   receipt_no:"2",total_minor:"12000",
   occurred_at:"2026-10-30T04:00:00Z",received_at:"2026-10-30T04:30:00Z"
  },{
   sale_id:"20000000-0000-0000-0000-000000000028",
   receipt_no:"1",total_minor:"2500",
   occurred_at:"2026-10-30T03:50:00Z",received_at:"2026-10-30T04:20:00Z"
  }]};
 throw Error("unexpected owner SQL "+sql.slice(0,60));
}};
const server=createServer(createCloudReceiverV29({pool,stores}));
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},
  deviceScaleFactor:3,isMobile:true,hasTouch:true});
const page=await context.newPage();
const errors=[];
page.on("pageerror",e=>errors.push(e.message));
try{
 await page.goto(origin+"/v29/owner",{waitUntil:"networkidle"});
 assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
 assert.equal(await page.locator("meta[name=viewport]").count(),1);
 await page.locator("#store").fill(store);
 await page.locator("#token").fill("wrong-"+secret);
 await page.getByRole("button",{name:"بینینی زانیارییەکان"}).click();
 await page.getByText(/بەکارهێنەر مۆڵەتی بینینی ئەم فرۆشگایەی نییە/).waitFor();
 assert.equal(await page.locator("#dashboard").isVisible(),false);
 await page.getByRole("button",{name:"دەرچوون"}).count(); // no page-visible logout yet
 // Reopen login after unsuccessful auth with a fresh correct token.
 await page.reload({waitUntil:"networkidle"});
 await page.locator("#store").fill(store);
 await page.locator("#token").fill(secret);
 await page.getByRole("button",{name:"بینینی زانیارییەکان"}).click();
 await page.locator("#dashboard").waitFor({state:"visible"});
 assert.equal(await page.locator("#sales").innerText(),"2");
 assert.equal(await page.locator("#total").innerText(),"14,500");
 assert.equal(await page.locator("#receipt").innerText(),"2");
 assert.equal(await page.locator("#rows tr").count(),2);
 assert.match(await page.locator("#warning").innerText(),/فرۆشتنە گەیشتووەکانی کلاود/);
 assert.match(await page.locator(".categories").innerText(),/هێشتا ناچالاکە/);
 assert.equal(await page.locator("#token").inputValue(),"");
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 assert.equal(await page.evaluate(()=>location.search),"");
 const overflows=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 assert.equal(overflows,false,"no horizontal overflow at iPhone width");
 await page.getByRole("button",{name:"دەرچوون"}).click();
 assert.equal(await page.locator("#dashboard").isVisible(),false);
 assert.equal(await page.locator("#login").isVisible(),true);
 assert.deepEqual(errors,[]);
 console.log("PASS V29: real 390px RTL owner UI, failed auth, summary, recent receipts, inactive alerts and logout");
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
