import assert from "node:assert/strict";
import {mkdtemp,writeFile,chmod,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {createServer as createHttpsServer} from "node:https";
import {chromium} from "playwright";
import {createV30HttpsGate,loadV30Stores} from "../../offline/secure-owner-v30.mjs";
import {hashOwnerToken} from "../../offline/cloud-receiver-v28.mjs";

const dir=await mkdtemp(join(tmpdir(),"zhirox-v30-browser-"));
const cert=join(dir,"cert.pem"),key=join(dir,"key.pem"),cfg=join(dir,"stores.json");
const store="10000000-0000-0000-0000-000000000030";
const token="v30-mobile-owner-secret-for-tests-".repeat(3);
let server,browser;
try{
 execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
  "-keyout",key,"-out",cert,"-days","1","-subj","/CN=127.0.0.1",
  "-addext","subjectAltName=IP:127.0.0.1"],{stdio:"ignore"});
 await writeFile(cfg,JSON.stringify([{store_id:store,
  sync_secret:"v30-HMAC-test-secret-".repeat(3),owner_token_hash:hashOwnerToken(token)}]),{mode:0o600});
 await chmod(cfg,0o600);
 const pool={query:async(sql,args)=>{
  assert.equal(args[0],store);
  if(sql.includes("count(*)::bigint AS sales_count"))
   return {rows:[{sales_count:"1",total_minor:"13750",
    last_receipt_no:"1",last_received_at:new Date().toISOString()}]};
  if(sql.startsWith("SELECT sale_id,receipt_no,total_minor,occurred_at,received_at"))
   return {rows:[{sale_id:"20000000-0000-0000-0000-000000000030",
    receipt_no:"1",total_minor:"13750",received_at:new Date().toISOString()}]};
  throw Error("unexpected SQL");
 }};
 server=createHttpsServer({key:await readFile(key),cert:await readFile(cert),minVersion:"TLSv1.2"},
  createV30HttpsGate({pool,loadStores:()=>loadV30Stores(cfg)}));
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 browser=await chromium.launch({headless:true});
 // This explicit exception is ONLY for the ephemeral CI self-signed certificate.
 // Production clients MUST validate their real trusted CA certificate normally.
 const context=await browser.newContext({viewport:{width:390,height:844},
  isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 const origin="https://127.0.0.1:"+server.address().port;
 await page.goto(origin+"/v29/owner",{waitUntil:"networkidle"});
 assert.equal(new URL(page.url()).protocol,"https:");
 assert.equal(await page.locator("html").getAttribute("dir"),"rtl");
 await page.locator("#store").fill(store);
 await page.locator("#token").fill(token);
 await page.getByRole("button",{name:"بینینی زانیارییەکان"}).click();
 await page.locator("#dashboard").waitFor({state:"visible"});
 assert.equal(await page.locator("#total").innerText(),"13,750");
 assert.equal(await page.locator("#rows tr").count(),1);
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 // Immediate server-side token rotation invalidates subsequent refresh.
 const next="v30-rotated-owner-secret-for-tests-".repeat(3);
 await writeFile(cfg,JSON.stringify([{store_id:store,
  sync_secret:"v30-HMAC-test-secret-".repeat(3),owner_token_hash:hashOwnerToken(next)}]),{mode:0o600});
 await page.getByRole("button",{name:"نوێکردنەوە"}).click();
 await page.getByText(/بەکارهێنەر مۆڵەتی بینینی ئەم فرۆشگایەی نییە/).waitFor();
 assert.equal(await page.locator("#dashboard").isVisible(),false,
  "never retain stale sales figures after owner credential revocation");
 assert.deepEqual(errors,[]);
 console.log("PASS V30: HTTPS iPhone-width RTL UI, TLS gate, no token storage, immediate server-side revocation");
}finally{
 if(browser)await browser.close();
 if(server)await new Promise(done=>server.close(done));
 await rm(dir,{recursive:true,force:true});
}
