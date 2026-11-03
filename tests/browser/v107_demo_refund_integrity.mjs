import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},locale:"en-US"});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
const read=()=>page.evaluate(()=>{
 const key="kanichnar_retail_pos_v18";
 const parse=(suffix,otherwise=null)=>JSON.parse(localStorage.getItem(key+suffix)||JSON.stringify(otherwise));
 return {
  refunds:parse("_refunds",[]),
  shift:parse("_shift"),
  products:parse("_products",[])
 };
});
const openRefunds=async()=>{
 await page.locator(".system-primary-nav button[data-module-id='0']").click();
 await page.locator(".system-subnav button[data-sub-icon='return-arrow']").click();
 const section=page.locator("section.section-workspace[data-section-id='return-arrow']");
 await section.waitFor();
 const form=section.locator("form.ws-form-grid").first();
 await form.locator("select").nth(0).selectOption("DEMO-RCP-1001");
 return form;
};
try{
 await page.goto("http://127.0.0.1:3000/",{waitUntil:"networkidle"});
 let form=await openRefunds();
 const base=await read();
 assert.ok(base.shift&&base.products.length>0);
 const item=base.products.find(x=>x.id==="prod-4");
 assert.ok(item,"original DEMO receipt product must exist");
 // The refund selector now exposes ONLY exact original receipt lines, not
 // arbitrary catalog products. Wrong-product refund is impossible in the UI.
 const available=await form.locator("select").nth(1).locator("option").evaluateAll(
  options=>options.map(o=>({value:o.value,text:o.textContent})));
 assert.deepEqual(available.map(o=>o.value),["0"]);
 assert.match(available[0].text,/کارتۆن/);
 assert.deepEqual((await read()).refunds,base.refunds);
 // Original receipt contains one carton: refund it exactly once.
 await form.locator("select").nth(1).selectOption("0");
 await form.getByRole("button",{name:"تۆمارکردنی گەڕاندنەوە"}).click();
 await page.getByText(/بە سەرکەوتوویی تۆمارکرا/).first().waitFor();
 const one=await read();
 assert.equal(one.refunds.length,base.refunds.length+1);
 assert.equal(one.refunds[0].receiptNo,"DEMO-RCP-1001");
 assert.equal(one.refunds[0].refundAmount,102000);
 assert.equal(one.refunds[0].mode,"carton");
 assert.equal(one.shift.expectedCash,base.shift.expectedCash-102000);
 assert.equal(one.products.find(x=>x.id==="prod-4").stock,item.stock+24);
 // Same-tab double tap must be refused without a second cash/stock change.
 await form.getByRole("button",{name:"تۆمارکردنی گەڕاندنەوە"}).click();
 assert.deepEqual(await read(),one,"duplicate return must not mutate DEMO receipt/cash/stock ledger");
 // Reloaded tab must still refuse replay due to durable DEMO-only return record.
 await page.reload({waitUntil:"networkidle"});
 form=await openRefunds();
 await form.locator("select").nth(1).selectOption("0");
 await form.getByRole("button",{name:"تۆمارکردنی گەڕاندنەوە"}).click();
 assert.deepEqual(await read(),one,"reloaded app must still reject repeated refund");
 assert.deepEqual(errors,[]);
 console.log("PASS V107: genuine original DEMO receipt, wrong-product denial, one carton returned once, no repeated cash/stock across reload");
}finally{await browser.close();}
