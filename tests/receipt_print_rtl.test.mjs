import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const script=readFileSync(resolve(root,"receipt-print.js"),"utf8");
const page=readFileSync(resolve(root,"receipt-print.html"),"utf8");
const saleId="b7d2328a-36ee-4ecb-ad8e-d16e77577a22";

class Element {
  constructor(tag="div") {
    this.tag=tag; this.textContent=""; this.hidden=true; this.disabled=true;
    this.children=[];this.attrs={};this.style={setProperty(){}};
    this.value="";
  }
  append(...children){this.children.push(...children);}
  setAttribute(key,value){this.attrs[key]=String(value);}
  addEventListener(event,listener){this[event]=listener;}
}

async function receiptFixture({item,total,cash=total,paper="80"}){
 const nodes=new Map();
 const get=id=>{
   if(!nodes.has(id))nodes.set(id,new Element());
   return nodes.get(id);
 };
 const document={
   getElementById:get,
   createElement:tag=>new Element(tag),
   documentElement:new Element("html")
 };
 function tableQuery(table){
   return {
     select(){return this;},
     eq(){return this;},
     limit(){return Promise.resolve({data:[item],error:null});},
     single(){
       const data=table==="retail_sales"?{
         id:saleId,store_id:"store",receipt_no:1,total_minor:total,
         cash_received_minor:cash,change_due_minor:cash-total,status:"posted",
         request_payload:{discount:0},created_at:"2026-10-27T10:35:25.000Z"
       }:{name:"سوپەرمارکێتی کانی چنار"};
       return Promise.resolve({data,error:null});
     }
   };
 }
 const db={auth:{getUser:async()=>({data:{user:{id:"cashier"}},error:null})},from:tableQuery};
 const window={
   RETAIL_CONFIG:{supabaseUrl:"https://example.supabase.co",publishableKey:"sample"},
   supabase:{createClient(){return db;}},
   location:{search:"?sale="+saleId+"&paper="+paper,assign(){}},
   print(){}
 };
 const ctx={window,document,location:{search:"?sale="+saleId+"&paper="+paper},
   URLSearchParams,Date,Number,console};
 vm.runInNewContext(script,ctx,{filename:"receipt-print.js"});
 await new Promise(resolve=>setTimeout(resolve,20));
 return {get,document};
}

test("kg receipt uses one clean calculation and 306 IQD rounded total",async()=>{
 const item={
   product_id:"p",product_name_snapshot:"تەماتە",
   quantity:0.245,unit_price_minor:1250,package_type:null,
   units_per_package:null,base_units:0.245,base_unit_snapshot:"kg"
 };
 const {get,document}=await receiptFixture({item,total:306});
 assert.equal(get("sheet").hidden,false);
 assert.equal(get("print").disabled,false);
 assert.equal(get("store-name").textContent,"سوپەرمارکێتی کانی چنار");
 assert.equal(get("total").textContent,"306 IQD");
 assert.match(get("receipt-date").textContent,/27\/10\/2026/);
 assert.equal(document.documentElement.attrs["data-paper"],"80");
 const lines=get("receipt-lines").children;
 assert.equal(lines.length,1);
 assert.equal(lines[0].children.length,2,"no duplicate kg description");
 assert.equal(lines[0].children[0].textContent,"تەماتە");
 const detail=lines[0].children[1].children;
 assert.equal(detail[0].textContent,"0.245 kg × 1,250 IQD/kg");
 assert.equal(detail[0].attrs.dir,"ltr");
 assert.equal(detail[1].textContent,"306 IQD");
 assert.equal(detail[1].attrs.dir,"ltr");
});
test("carton receipts preserve pack labels and monetary total",async()=>{
 const item={
   product_id:"p",product_name_snapshot:"ئاوی کانزا",
   quantity:2,unit_price_minor:11000,package_type:"carton",
   units_per_package:12,base_units:24,base_unit_snapshot:"unit"
 };
 const {get,document}=await receiptFixture({item,total:22000,cash:25000,paper:"58"});
 const children=get("receipt-lines").children[0].children;
 assert.equal(children.length,3);
 assert.equal(children[1].textContent,"2 کارتۆن × 12 دانە");
 assert.equal(children[2].children[0].textContent,"2 × 11,000 IQD");
 assert.equal(get("change").textContent,"3,000 IQD");
 assert.equal(document.documentElement.attrs["data-paper"],"58");
});
test("print stylesheet is paper-width limited and hides site banner",()=>{
 assert.match(page,/--receipt-paper:58mm/);
 assert.match(page,/html\[data-paper="80"\]/);
 assert.match(page,/\.market-banner,\.receipt-page \.toolbar,\.receipt-page \.status\{display:none!important\}/);
 assert.match(page,/direction:ltr;unicode-bidi:isolate/);
 assert.match(page,/width:var\(--receipt-paper\)!important/);
 assert.match(page,/<h1 id="store-name"><\/h1>/);
});