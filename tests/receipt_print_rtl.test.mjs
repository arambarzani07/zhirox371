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

async function receiptFixture({item,items=item?[item]:[],total,cash=total,paper="80"}){
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
     limit(){return Promise.resolve({data:items,error:null});},
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

test("kg table has exactly six headers and a precise 0.245 kg line",async()=>{
 const item={
   product_id:"p",product_name_snapshot:"تەماتە",
   quantity:0.245,unit_price_minor:1250,package_type:null,
   units_per_package:null,base_units:0.245,base_unit_snapshot:"kg"
 };
 const {get,document}=await receiptFixture({item,total:306});
 assert.equal(get("sheet").hidden,false);
 assert.equal(get("print").disabled,false);
 assert.equal(get("store-name").textContent,"سوپەرمارکێتی کانی چنار");
 assert.match(get("store-address").textContent,/ناونیشان:/);
 assert.equal(get("store-phone-val").textContent,"0750 000 0000");
 assert.equal(get("total").textContent,"306 IQD");
 assert.match(get("receipt-date").textContent,/27\/10\/2026/);
 assert.equal(document.documentElement.attrs["data-paper"],"80");
 assert.match(page,/<th scope="col">ژمارە<\/th><th scope="col">ناوی کاڵا<\/th><th scope="col">یەکە<\/th><th scope="col">نرخ<\/th><th scope="col">بڕ<\/th><th scope="col">کۆ<\/th>/);
 const rows=get("receipt-lines").children;
 assert.equal(rows.length,1);
 assert.equal(rows[0].tag,"tr");
 const cells=rows[0].children;
 assert.equal(cells.length,6);
 assert.deepEqual(cells.map(cell=>cell.textContent),["1","تەماتە","kg","1,250","0.245","306"]);
 assert.equal(cells[4].attrs.dir,"ltr");
 assert.equal(cells[5].attrs.dir,"ltr");
});

test("carton row retains pack-unit detail inside the unit column",async()=>{
 const item={
   product_id:"p",product_name_snapshot:"ئاوی کانزا",
   quantity:2,unit_price_minor:11000,package_type:"carton",
   units_per_package:12,base_units:24,base_unit_snapshot:"unit"
 };
 const {get,document}=await receiptFixture({item,total:22000,cash:25000,paper:"58"});
 const cells=get("receipt-lines").children[0].children;
 assert.equal(cells.length,6);
 assert.deepEqual(cells.map(cell=>cell.textContent),["1","ئاوی کانزا","کارتۆن","11,000","2","22,000"]);
 assert.equal(cells[2].children[0].textContent,"12 دانە");
 assert.equal(get("change").textContent,"3,000 IQD");
 assert.equal(document.documentElement.attrs["data-paper"],"58");
});

test("multiple items receive sequential row numbers and sum is unchanged",async()=>{
 const items=[
   {product_name_snapshot:"تەماتە",quantity:0.245,unit_price_minor:1250,
      base_unit_snapshot:"kg",package_type:null},
   {product_name_snapshot:"ئاوی کانزا",quantity:2,unit_price_minor:11000,
      base_unit_snapshot:"unit",package_type:"carton",units_per_package:12,base_units:24},
   {product_name_snapshot:"سێو",quantity:3,unit_price_minor:500,
      base_unit_snapshot:"unit",package_type:"unit"}
 ];
 const {get}=await receiptFixture({items,total:23806,cash:24000,paper:"80"});
 assert.equal(get("sheet").hidden,false);
 assert.deepEqual(get("receipt-lines").children.map(row=>row.children[0].textContent),["1","2","3"]);
 assert.equal(get("receipt-lines").children[2].children[2].textContent,"دانە");
 assert.equal(get("total").textContent,"23,806 IQD");
 assert.equal(get("change").textContent,"194 IQD");
});

test("six columns fit thermal paper with RTL item names and LTR numbers",()=>{
 assert.match(page,/--receipt-paper:58mm/);
 assert.match(page,/html\[data-paper="80"\]/);
 assert.match(page,/<colgroup><col style="width:8%"><col style="width:27%"><col style="width:12%"><col style="width:18%"><col style="width:15%"><col style="width:20%"><\/colgroup>/);
 assert.match(page,/table-layout:fixed;border-collapse:collapse;direction:rtl/);
 assert.match(page,/\.market-banner,\.receipt-page \.toolbar,\.receipt-page \.status\{display:none!important\}/);
 assert.match(page,/direction:ltr;unicode-bidi:isolate/);
 assert.match(page,/width:var\(--receipt-paper\)!important/);
 assert.match(page,/<h1 id="store-name"><\/h1>/);
});
test("all six receipt columns and each product row have visible solid grid lines",()=>{
 assert.match(page,/\.receipt-page \.receipt-items\{[^}]*border:1px solid #333/);
 assert.match(page,/\.receipt-page \.receipt-items th,\.receipt-page \.receipt-items td\{[^}]*border:1px solid #333/);
 assert.match(page,/@media print\{\.receipt-page \.receipt-items,\.receipt-page \.receipt-items th,\.receipt-page \.receipt-items td\{border-color:#000!important\}\}/);
 assert.doesNotMatch(page,/\.receipt-items th,\.receipt-page \.receipt-items td\{[^}]*border-bottom:1px dotted/);
 assert.match(page,/<tbody id="receipt-lines"><\/tbody>/);
});
