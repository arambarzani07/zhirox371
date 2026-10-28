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
   document.documentElement.setAttribute("data-paper",size);
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
 // Columns in fixed RTL order: number | item | unit | price | quantity | total.
 // Money is in IQD, as stated in the receipt's totals; kg quantity retains 3 decimals.
 function renderLine(root,index,name,qty,price,packType,unitsPerPack,baseUnit) {
   const row=el("tr","");
   const isKg=baseUnit==="kg";
   const isCarton=!isKg&&packType==="carton";
   const unit=isKg?"kg":isCarton?"کارتۆن":"دانە";
   const values=[
     String(index),
     name,
     unit,
     fmtQuantity(price),
     isKg?qty.toFixed(3):fmtQuantity(qty),
     fmtQuantity(Math.round(qty*price))
   ];
   for(let i=0;i<values.length;i++){
     const cell=el("td",values[i],i===5?"figure line-sum":([0,3,4].includes(i)?"figure":""));
     if([0,3,4,5].includes(i))cell.setAttribute("dir","ltr");
     if(i===2&&isCarton&&Number.isSafeInteger(unitsPerPack)&&unitsPerPack>=2){
       cell.append(el("small",fmtQuantity(unitsPerPack)+" دانە","pack-hint"));
     }
     row.append(cell);
   }
   root.append(row);
 }
 let activeDbClient=null;
 let activeStoreIdGlobal=null;
 async function initialize() {
   if(!uuid.test(saleId||"")){msg("ناسنامەی پسووڵە نادروستە");return;}
   if(!window.supabase||!cfg?.supabaseUrl||!cfg?.publishableKey){
     msg("پەیوەندی Supabase ئامادە نییە");return;
   }
   const db=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{
     auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
   });
   activeDbClient=db;
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
   let activeStoreId=head.store_id;
   activeStoreIdGlobal=activeStoreId;
   let customAddress="هەولێر — کانی چنار";
   let customPhone="0750 000 0000";
   let customFooter="سوپاس بۆ کڕینەکەتان";
   try{
     const ls=window.localStorage;
     if(ls){
       const rawSet=ls.getItem("retail_store_settings_v19_"+activeStoreId);
       if(rawSet){
         const parsed=JSON.parse(rawSet);
         if(parsed?.storeName)$("store-name").textContent=parsed.storeName;
         if(parsed?.storeAddress)customAddress=String(parsed.storeAddress).trim();
         if(parsed?.storePhone)customPhone=String(parsed.storePhone).trim();
         if(parsed?.receiptFooter)customFooter=String(parsed.receiptFooter).trim();
       }
       const directAddr=ls.getItem("retail_store_address");
       const directPhone=ls.getItem("retail_store_phone");
       const directFooter=ls.getItem("retail_receipt_footer");
       if(directAddr&&directAddr.trim())customAddress=directAddr.trim();
       if(directPhone&&directPhone.trim())customPhone=directPhone.trim();
       if(directFooter&&directFooter.trim())customFooter=directFooter.trim();
     }
   }catch(_e){}
   try{
     const sQuery=db.from("retail_store_settings").select("settings_json").eq("store_id",activeStoreId);
     const sRes=typeof sQuery.maybeSingle==="function"?await sQuery.maybeSingle():await sQuery.single();
     const sj=sRes?.data?.settings_json;
     if(sj&&typeof sj==="object"){
       if(sj.storeName&&String(sj.storeName).trim())$("store-name").textContent=String(sj.storeName).trim();
       if(sj.storeAddress&&String(sj.storeAddress).trim())customAddress=String(sj.storeAddress).trim();
       if(sj.storePhone&&String(sj.storePhone).trim())customPhone=String(sj.storePhone).trim();
       if(sj.receiptFooter&&String(sj.receiptFooter).trim())customFooter=String(sj.receiptFooter).trim();
     }
   }catch(_e){}
   function applyContactToSheet(addrVal,phoneVal,footerVal){
     const cleanAddr=String(addrVal||"").trim()||"هەولێر — کانی چنار";
     const cleanPhone=String(phoneVal||"").trim()||"0750 000 0000";
     $("store-address").textContent="ناونیشان: "+cleanAddr;
     if($("store-phone-val")){
       $("store-phone-val").textContent=cleanPhone;
     }else{
       $("store-phone").textContent="ژمارەی تەلەفۆن: "+cleanPhone;
     }
     if(footerVal&&$("receipt-footer")){
       $("receipt-footer").textContent=String(footerVal).trim();
     }
   }
   applyContactToSheet(customAddress,customPhone,customFooter);
   if($("toolbar-address"))$("toolbar-address").value=customAddress;
   if($("toolbar-phone"))$("toolbar-phone").value=customPhone;
   $("receipt-number").textContent="#"+String(head.receipt_no).padStart(6,"0");
   $("receipt-date").textContent=new Date(head.created_at)
     .toLocaleString("en-GB",{timeZone:"Asia/Baghdad",hour12:false});
   const list=$("receipt-lines");
   items.forEach((item,index)=>{
     renderLine(list,index+1,item.product_name_snapshot,Number(item.quantity),Number(item.unit_price_minor),
       item.package_type,Number(item.units_per_package),item.base_unit_snapshot||"unit");
   });
   $("total").textContent=fmt(total);
   $("paid").textContent=fmt(paid);
   $("change").textContent=fmt(change);
   $("sheet").hidden=false;
   $("print").disabled=false;
   msg("");
   if(params.get("auto")==="1"||params.get("print")==="1"){
     setTimeout(()=>{window.print();},350);
   }
 }
 async function syncToolbarContact(saveToStorage){
   const addr=String($("toolbar-address")?.value||"").trim()||"هەولێر — کانی چنار";
   const phone=String($("toolbar-phone")?.value||"").trim()||"0750 000 0000";
   $("store-address").textContent="ناونیشان: "+addr;
   if($("store-phone-val")){
     $("store-phone-val").textContent=phone;
   }else{
     $("store-phone").textContent="ژمارەی تەلەفۆن: "+phone;
   }
   if(saveToStorage){
     try{
       const ls=window.localStorage;
       let mergedSettings={storeAddress:addr,storePhone:phone};
       if(ls){
         ls.setItem("retail_store_address",addr);
         ls.setItem("retail_store_phone",phone);
         for(let i=0;i<ls.length;i++){
           const k=ls.key(i);
           if(k&&k.startsWith("retail_store_settings_v19_")){
             const cur=JSON.parse(ls.getItem(k)||"{}");
             cur.storeAddress=addr;
             cur.storePhone=phone;
             mergedSettings=cur;
             ls.setItem(k,JSON.stringify(cur));
           }
         }
         if(activeStoreIdGlobal){
           const storeKey="retail_store_settings_v19_"+activeStoreIdGlobal;
           const cur=JSON.parse(ls.getItem(storeKey)||"{}");
           cur.storeAddress=addr;
           cur.storePhone=phone;
           mergedSettings=cur;
           ls.setItem(storeKey,JSON.stringify(cur));
         }
       }
       if(activeDbClient&&activeStoreIdGlobal){
         await activeDbClient.from("retail_store_settings").upsert({
           store_id:activeStoreIdGlobal,
           settings_json:mergedSettings,
           updated_at:new Date().toISOString()
         });
       }
       msg("ناونیشان و ژمارەی تەلەفۆن لەسەر پسووڵە پاشەکەوت کرا ✓");
     }catch(_e){}
   }
 }
 paper(params.get("paper"));
 $("paper").addEventListener("change",event=>paper(event.target.value));
 $("toolbar-address")?.addEventListener("input",()=>syncToolbarContact(false));
 $("toolbar-phone")?.addEventListener("input",()=>syncToolbarContact(false));
 $("save-contact")?.addEventListener("click",()=>syncToolbarContact(true));
 $("print").addEventListener("click",()=>{
   if(!$("print").disabled&& !$("sheet").hidden)window.print();
 });
 $("back").addEventListener("click",()=>{
   window.location.assign("./operations.html?view=receipts");
 });
 void initialize().catch(()=>msg("کێشەیەک لە پەیوەندی سێرڤەر ڕوویدا"));
})();
