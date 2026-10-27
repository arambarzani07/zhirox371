"use strict";
(() => {
 const $ = id => document.getElementById(id);
 const cfg = window.RETAIL_CONFIG;
 const params = new URLSearchParams(window.location.search);
 const saleId = params.get("sale");
 const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const fmt = n => Number(n).toLocaleString("en-US") + " IQD";
 function msg(value) { $("message").textContent = value || ""; }
 function paper(value) {
   const size = value === "80" ? "80" : "58";
   document.documentElement.style.setProperty("--receipt-paper", size + "mm");
   document.documentElement.style.setProperty("--receipt-content",size === "80" ? "70mm" : "48mm");
   $("paper").value = size;
 }
 function el(name,text,cls) {
   const node = document.createElement(name);
   node.textContent = String(text);
   if(cls) node.className = cls;
   return node;
 }
 const fmtQuantity = n => Number(n).toLocaleString("en-US",{maximumFractionDigits:3});
 function renderLine(root,name,qty,price,packType,unitsPerPack,baseUnits,baseUnit) {
   const outer=el("section","","line");
   outer.append(el("div",name,"line-name"));
   // Units on old receipts are historical snapshots, not the current product settings.
   if(packType==="carton"&&baseUnit!=="kg"&&Number.isSafeInteger(unitsPerPack)&&unitsPerPack>=2){
     outer.append(el("div",fmtQuantity(qty)+" کارتۆن × "+fmtQuantity(unitsPerPack)+" دانە","line-note"));
   }
   const details=el("div","","line-details");
   let calculation;
   if(baseUnit==="kg"){
     calculation=qty.toFixed(3)+" kg × "+fmtQuantity(price)+" IQD/kg";
   }else if(packType==="carton"){
     calculation=fmtQuantity(qty)+" × "+fmtQuantity(price)+" IQD";
   }else {
     calculation=fmtQuantity(qty)+" × "+fmtQuantity(price)+" IQD";
   }
   const math=el("span",calculation,"line-calculation");
   math.setAttribute("dir","ltr");
   const amount=el("strong",fmt(Math.round(qty*price)),"line-total money");
   amount.setAttribute("dir","ltr");
   details.append(math,amount);
   outer.append(details);
   root.append(outer);
 }
 async function initialize() {
   if(!uuid.test(saleId||"")){msg("ناسنامەی پسووڵە نادروستە");return;}
   if(!window.supabase||!cfg?.supabaseUrl||!cfg?.publishableKey){
     msg("پەیوەندی Supabase ئامادە نییە");return;
   }
   const db=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{
     auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
   });
   const auth=await db.auth.getUser();
   if(auth.error||!auth.data?.user){msg("بۆ بینین و چاپی پسووڵە پێویستە بچیتە ژوورەوە");return;}
   const sale=await db.from("retail_sales")
     .select("id,store_id,receipt_no,total_minor,cash_received_minor,change_due_minor,created_at,status,request_payload")
     .eq("id",saleId).eq("status","posted").single();
   if(sale.error||!sale.data){msg("پسووڵەکە نەدۆزرایەوە یان دەسەڵاتت نییە");return;}
   const head=sale.data;
   if(head.receipt_no==null){msg("پسووڵەی بێ ژمارە چاپ ناکرێت");return;}
   let [store,lines]=await Promise.all([
     db.from("retail_stores").select("name").eq("id",head.store_id).single(),
     db.from("retail_sale_items")
       .select("product_id,quantity,unit_price_minor,product_name_snapshot,package_type,package_barcode,units_per_package,base_units,base_unit_snapshot")
       .eq("store_id",head.store_id).eq("sale_id",head.id).limit(200)
   ]);
   // Historic receipts and older hosted databases lack V16 pack fields.
   if(["42703","PGRST204","PGRST205"].includes(lines.error?.code))
     lines=await db.from("retail_sale_items")
       .select("product_id,quantity,unit_price_minor,product_name_snapshot,base_unit_snapshot")
       .eq("store_id",head.store_id).eq("sale_id",head.id).limit(200);
   if(store.error||lines.error||!store.data){msg("وردەکاریی پسووڵە نەتوانرا بخوێندرێتەوە");return;}
   const items=lines.data||[];
   if(items.length===0||items.length>=200){msg("ڕیزەکانی پسووڵە ناتەواون؛ چاپ ڕێگەپێنەدراوە");return;}
   const total=Number(head.total_minor),paid=Number(head.cash_received_minor),change=Number(head.change_due_minor);
   let computed=0;
   for(const item of items){
     const quantity=Number(item.quantity),price=Number(item.unit_price_minor);
     if(!(item.base_unit_snapshot==="kg" ? Number.isFinite(quantity)&&quantity>=0.001&&quantity<=99999.999&&Math.abs(quantity*1000-Math.round(quantity*1000))<0.000001 : Number.isSafeInteger(quantity)&&quantity>0)||!Number.isSafeInteger(price)||price<0||!item.product_name_snapshot
       || (item.package_type==="carton" &&
          (!Number.isSafeInteger(Number(item.units_per_package))||Number(item.units_per_package)<2||
           Number(item.base_units)!==quantity*Number(item.units_per_package)))){
       msg("زانیارییەکانی پسووڵە ناتەواون؛ چاپ ڕێگەپێنەدراوە");return;
     }
     computed+=Math.round(quantity*price);
     if(!Number.isSafeInteger(computed)){msg("ژمارەی نرخەکان لە سنوور دەرچوون");return;}
   }
   const discount=Number(head.request_payload?.discount||0);
   if(!Number.isSafeInteger(discount)||discount<0||discount>computed){msg("داشکاندنی پسووڵە نادروستە");return;}
   if(computed-discount!==total||!Number.isSafeInteger(total)||!Number.isSafeInteger(paid)||!Number.isSafeInteger(change)
      || paid-total!==change){msg("کۆی پسووڵە و وردەکارییەکان یەک ناگرنەوە؛ چاپ ڕێگەپێنەدراوە");return;}
   $("store-name").textContent=store.data.name;
   $("receipt-number").textContent="#"+String(head.receipt_no).padStart(6,"0");
   $("receipt-date").textContent=new Date(head.created_at)
     .toLocaleString("en-GB",{timeZone:"Asia/Baghdad",hour12:false});
   const list=$("receipt-lines");
   for(const item of items){
     renderLine(list,item.product_name_snapshot,Number(item.quantity),Number(item.unit_price_minor),
       item.package_type,Number(item.units_per_package),item.base_units,item.base_unit_snapshot||"unit");
   }
   $("total").textContent=fmt(total);
   $("paid").textContent=fmt(paid);
   $("change").textContent=fmt(change);
   $("sheet").hidden=false;
   $("print").disabled=false;
   msg("");
 }
 paper(params.get("paper"));
 $("paper").addEventListener("change",event=>paper(event.target.value));
 $("print").addEventListener("click",()=>{
   if(!$("print").disabled&& !$("sheet").hidden)window.print();
 });
 $("back").addEventListener("click",()=>{
   window.location.assign("./operations.html?view=receipts");
 });
 void initialize().catch(()=>msg("کێشەیەک لە پەیوەندی سێرڤەر ڕوویدا"));
})();
