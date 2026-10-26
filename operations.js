"use strict";
(() => {
const $=id=>document.getElementById(id);
const config=window.RETAIL_CONFIG;
const params=new URLSearchParams(location.search);
const view=params.get("view");
const initialStockProduct=params.get("product")||"";
const initialStockQuery=params.get("q")||"";
const PAGE_SIZE=50;
let db=null,user=null,store=null,role=null,products=[],barcodes=[],balances=new Map(),members=[],cart=[],requestId=null,tab="cash",busy=false,pendingCheckout=null,shiftSession=null,pendingCashMovement=null,stockAttempt=null,returnAttempt=null;
let stockOffset=0,stockTotal=0,stockPageIds=[],parkedCarts=[],didApplyInitialStock=false;
const prefixCache=new Map();
const money=n=>Number(n).toLocaleString("en-US")+" IQD";
const safe=e=>(e?.code==="42501"?"دەسەڵاتی ئەم کردارەت نییە":
 /no open cash shift|shift not open/i.test(e?.message||"")?"شێفتی کاشێر نەکراوەتەوە":
 /insufficient cash in drawer/i.test(e?.message||"")?"پارەی سندووق بەش ناکات":
 /barcode price\/pack changed|inactive/i.test(e?.message||"")?"نرخ یان بارکۆدی کاڵا گۆڕدراوە":
 /function .*not found/i.test(e?.message||"")||["PGRST202","42883"].includes(e?.code)?"فرۆشتنی کارتۆن لە سێرڤەر چالاک نییە":
 /insufficient stock/i.test(e?.message||"")?"بڕی کۆگا بەش ناکات":
 /cash amount is below/i.test(e?.message||"")?"پارەی وەرگیراو کەمترە لە کۆی فرۆشتن":
 /invalid checkout/i.test(e?.message||"")?"زانیاری فرۆشتن هەڵەیە":
 /request reused|different actor or payload/i.test(e?.message||"")?"ناسنامەی ئەم فرۆشتنە بە مامەڵەیەکی تر بەکارهاتووە":
 /duplicate/i.test(e?.message||"")?"ئەم کردارە دووبارەیە":
 /Failed to fetch|NetworkError/i.test(e?.message||"")?"پەیوەندیی سێرڤەر/ئینتەرنێت بپشکنە":
 (e?.message||"کردارەکە سەرکەوتوو نەبوو"));
function msg(id,value="",kind=""){const x=$(id);if(!x)return;x.textContent=value;x.className="msg"+(kind?" "+kind:"");}
function lock(v){busy=!!v;document.querySelectorAll("#operations-panel button").forEach(x=>{x.disabled=busy;});syncPending();syncStockPager();}
function pendingKey(){return store&&user?"retail_pending_checkout_"+store.id+"_"+user.id:null}
function parkedKey(){return store&&user?"retail_parked_carts_"+store.id+"_"+user.id:null}
function returnKey(){return store&&user?"retail_pending_return_"+store.id+"_"+user.id:null}
function persistPending(){const key=pendingKey();if(!key)return;try{if(pendingCheckout)sessionStorage.setItem(key,JSON.stringify(pendingCheckout));else sessionStorage.removeItem(key);}catch(e){msg("system-msg","پاراستنی هەوڵی فرۆشتن لە بیرگەی وێبگەڕدا سەرکەوتوو نەبوو","error")}}
function persistParked(){const key=parkedKey();if(!key)return;try{if(parkedCarts.length)sessionStorage.setItem(key,JSON.stringify(parkedCarts));else sessionStorage.removeItem(key);}catch(e){}}
function loadParked(){const key=parkedKey();if(!key)return;try{const raw=JSON.parse(sessionStorage.getItem(key)||"[]");parkedCarts=Array.isArray(raw)?raw:[];}catch(e){parkedCarts=[];}renderParkedBar();}
function persistReturnAttempt(){const key=returnKey();if(!key)return;try{if(returnAttempt)sessionStorage.setItem(key,JSON.stringify(returnAttempt));else sessionStorage.removeItem(key);}catch(e){}}
function loadReturnAttempt(){const key=returnKey();if(!key)return;try{const raw=JSON.parse(sessionStorage.getItem(key)||"null");returnAttempt=raw&&raw.id&&raw.saleId&&raw.sessionId?raw:null;}catch(e){returnAttempt=null;}}
function isValidEan13(code){
 const clean=String(code||"").trim();
 if(!/^\d{13}$/.test(clean))return false;
 let sum=0;
 for(let i=0;i<12;i++){
   const d=clean.charCodeAt(i)-48;
   sum+=(i%2===0)?d:d*3;
 }
 const check=(10-(sum%10))%10;
 return check===(clean.charCodeAt(12)-48);
}
function parseScaleBarcode(code){
 const clean=String(code||"").trim();
 if(!/^27\d{11}$/.test(clean)||!isValidEan13(clean))return null;
 const pluRaw=clean.slice(2,7);
 const pluNum=String(Number(pluRaw));
 const grams=Number(clean.slice(7,12));
 if(pluRaw==="00000"||!Number.isSafeInteger(grams)||grams<=0)return null;
 const weightKg=Number((grams/1000).toFixed(3));
 return {code:clean,prefix:27,pluRaw,pluNum,grams,weightKg,scaleLabel:weightKg.toFixed(3)+" کگم"};
}
function cartSubtotal(){return cart.reduce((sum,item)=>sum+Number(item.price)*Number(item.qty),0);}
function cartDiscount(){
 const raw=Number($("discount")?.value||0);
 return Number.isSafeInteger(raw)&&raw>0?raw:0;
}
function cartNetTotal(){return Math.max(0,cartSubtotal()-cartDiscount());}
function renderParkedBar(){
 const bar=$("parked-bar"),holdBtn=$("hold-cart");
 if(holdBtn){
   holdBtn.textContent=cart.length===0&&parkedCarts.length>0?"گەڕاندنەوە ("+parkedCarts.length+") (F4)":"ڕاگرتن (F4)";
 }
 if(!bar)return;
 bar.replaceChildren();
 if(!parkedCarts.length){bar.hidden=true;return;}
 bar.hidden=false;
 const slotsWrap=document.createElement("div");
 slotsWrap.style.display="flex";slotsWrap.style.gap="6px";slotsWrap.style.flexWrap="wrap";slotsWrap.style.alignItems="center";
 parkedCarts.forEach((slot,idx)=>{
   const sum=(slot.items||[]).reduce((s,i)=>s+Number(i.price)*Number(i.qty),0)-Math.max(0,Number(slot.discount||0));
   const slotBtn=document.createElement("button");
   slotBtn.type="button";slotBtn.className="quick-cash-btn";
   slotBtn.dataset.resumeSlot=String(idx);
   slotBtn.textContent="سەبەتەی #"+(idx+1)+" ("+(slot.items||[]).length+" کاڵا — "+money(Math.max(0,sum))+")";
   slotsWrap.append(slotBtn);
 });
 const actions=document.createElement("div");actions.style.display="flex";actions.style.gap="6px";
 const resumeBtn=document.createElement("button");
 resumeBtn.type="button";resumeBtn.className="quick-cash-btn";resumeBtn.dataset.resumeParked="1";resumeBtn.textContent="گەڕاندنەوە (F4)";
 const dropBtn=document.createElement("button");
 dropBtn.type="button";dropBtn.className="quick-cash-btn";dropBtn.dataset.discardParked="1";dropBtn.textContent="سڕینەوە";
 actions.append(resumeBtn,dropBtn);
 bar.append(slotsWrap,actions);
}
function resumeParkedAt(index){
 if(busy||pendingCheckout||index<0||index>=parkedCarts.length)return;
 const chosen=parkedCarts.splice(index,1)[0];
 if(cart.length>0){
   parkedCarts.push({at:Date.now(),cash:String($("cash").value||""),discount:String($("discount")?.value||"0"),items:cart.map(x=>({...x}))});
 }
 persistParked();
 cart=(chosen.items||[]).map(x=>({...x,available:balances.get(x.id)??x.available??0}));
 $("cash").value=chosen.cash||"";
 if($("discount"))$("discount").value=chosen.discount||"0";
 requestId=null;
 msg("checkout-msg","");msg("scan-msg","پسووڵەی ڕاگیراو گەڕێندرایەوە","success");
 renderCart();renderParkedBar();syncPending();focusScanner();
}
function toggleHoldCart(){
 if(busy||pendingCheckout)return;
 if(cart.length>0){
   parkedCarts.push({at:Date.now(),cash:String($("cash").value||""),discount:String($("discount")?.value||"0"),items:cart.map(x=>({...x}))});
   if(parkedCarts.length>10)parkedCarts.shift();
   persistParked();
   cart=[];requestId=null;$("cash").value="";if($("discount"))$("discount").value="0";
   msg("checkout-msg","");msg("scan-msg","پسووڵەکە بە کاتی ڕاگیرا","success");
   renderCart();renderParkedBar();syncPending();focusScanner();
   return;
 }
 if(parkedCarts.length>0){
   resumeParkedAt(parkedCarts.length-1);
 }
}
function syncPending(){const pending=!!pendingCheckout;for(const id of ["barcode","cash","discount"]){if($(id))$(id).disabled=pending||busy;}$("clear-cart").disabled=pending||busy;if($("hold-cart"))$("hold-cart").disabled=pending||busy||(cart.length===0&&parkedCarts.length===0);$("finish-sale").disabled=pending||busy||!shiftSession;$("retry-checkout").hidden=!pending;$("retry-checkout").disabled=busy;document.querySelectorAll("#quick-cash-row button,#parked-bar button").forEach(b=>{b.disabled=pending||busy;});}
function syncStockPager(){
 const box=$("stock-pagination");
 if(!box)return;
 if(stockTotal<=0){box.hidden=true;return;}
 box.hidden=stockTotal<=PAGE_SIZE&&stockOffset===0;
 const count=stockPageIds.length;
 const start=stockOffset+1;
 const end=Math.min(stockOffset+count,stockTotal);
 $("stock-page-info").textContent=start.toLocaleString("en-US")+"–"+end.toLocaleString("en-US")+" / "+stockTotal.toLocaleString("en-US");
 $("stock-prev").disabled=busy||stockOffset<=0;
 $("stock-next").disabled=busy||stockOffset+PAGE_SIZE>=stockTotal;
}
function upsertHotProduct(prod,barcodeList,stockQty){
 if(!prod||!prod.id)return;
 const pIdx=products.findIndex(x=>x.id===prod.id);
 const existing=pIdx>=0?products[pIdx]:null;
 const normalized={
   id:prod.id,
   name:prod.name,
   sku:prod.sku??existing?.sku??null,
   plu:prod.plu??existing?.plu??null,
   price_minor:Number(prod.price_minor??0),
   currency:prod.currency||"IQD",
   active:prod.active!==false
 };
 if(pIdx>=0)products[pIdx]=normalized;
 else products.push(normalized);
 if(stockQty!==undefined&&stockQty!==null)balances.set(prod.id,Number(stockQty));
 if(Array.isArray(barcodeList)){
   for(const b of barcodeList){
     if(!b||!b.code||b.active===false)continue;
     const bIdx=barcodes.findIndex(x=>x.code===b.code);
     const isScale=Boolean(b.is_scale||Number(b.scale_grams)>0);
     const scaleGrams=isScale?Number(b.scale_grams):null;
     const scaleWeightKg=isScale?Number((scaleGrams/1000).toFixed(3)):null;
     const entry={
       product_id:prod.id,
       code:b.code,
       unit_type:b.unit_type||"unit",
       units_per_scan:Number(b.units_per_scan||1),
       price_minor:b.price_minor!=null?Number(b.price_minor):normalized.price_minor,
       is_scale:isScale,
       scale_grams:scaleGrams,
       scale_weight_kg:scaleWeightKg,
       scale_label:b.scale_label||(isScale?scaleWeightKg.toFixed(3)+" کگم":null),
       active:true
     };
     if(bIdx>=0)barcodes[bIdx]=entry;
     else barcodes.push(entry);
   }
 }
}
async function resolveBarcodeServer(code){
 const clean=String(code||"").trim();
 if(!db||!store||!clean)return null;
 const res=await db.rpc("retail_resolve_barcode_v18",{p_store:store.id,p_code:clean});
 if(!res.error&&res.data){
   prefixCache.set(clean,!!res.data.has_longer_prefix);
   if(!res.data.found)return null;
   const d=res.data;
   const isScale=Boolean(d.is_scale||Number(d.scale_grams)>0);
   const sibs=Array.isArray(d.product_barcodes)&&d.product_barcodes.length?d.product_barcodes.map(sb=>({
     ...sb,
     is_scale:sb.code===clean?isScale:Boolean(sb.is_scale),
     scale_grams:sb.code===clean?(d.scale_grams??sb.scale_grams??null):(sb.scale_grams??null),
     scale_weight_kg:sb.code===clean?(d.scale_weight_kg??sb.scale_weight_kg??null):(sb.scale_weight_kg??null),
     scale_label:sb.code===clean?(d.scale_label||sb.scale_label||null):sb.scale_label||null
   })):[{
     code:d.code,product_id:d.product_id,unit_type:d.unit_type,units_per_scan:d.units_per_scan,
     price_minor:d.price_minor,is_scale:isScale,scale_grams:d.scale_grams??null,
     scale_weight_kg:d.scale_weight_kg??null,scale_label:d.scale_label||null
   }];
   if(!sibs.some(sb=>sb.code===clean)){
     sibs.push({
       code:clean,product_id:d.product_id,unit_type:d.unit_type||"unit",units_per_scan:Number(d.units_per_scan||1),
       price_minor:d.price_minor,is_scale:isScale,scale_grams:d.scale_grams??null,
       scale_weight_kg:d.scale_weight_kg??null,scale_label:d.scale_label||null
     });
   }
   upsertHotProduct({
     id:d.product_id,name:d.product_name,sku:d.sku,plu:d.plu,price_minor:d.unit_price_minor??d.price_minor,currency:d.currency||"IQD",active:true
   },sibs,d.stock_quantity);
   return barcodes.find(x=>x.code===clean&&x.active!==false)||null;
 }
 if(["PGRST202","42883"].includes(res.error?.code)){
   const hasLonger=barcodes.some(x=>x.active!==false&&x.code.length>clean.length&&x.code.startsWith(clean));
   prefixCache.set(clean,hasLonger);
   const exact=barcodes.find(x=>x.code===clean&&x.active!==false);
   if(exact)return exact;
   const scale=parseScaleBarcode(clean);
   if(scale){
     const matches=products.filter(p=>{
       if(p.active===false||p.currency!=="IQD"||!(Number(p.price_minor)>0))return false;
       const rawPlu=String(p.plu||"").trim();
       return rawPlu&&(rawPlu===scale.pluRaw||(/^\d{1,5}$/.test(rawPlu)&&rawPlu.padStart(5,"0")===scale.pluRaw));
     });
     if(matches.length===1){
       const sp=matches[0];
       const scalePrice=Math.round((Number(sp.price_minor)*scale.grams)/1000);
       if(scalePrice>0){
         upsertHotProduct(sp,[{
           code:clean,product_id:sp.id,unit_type:"unit",units_per_scan:1,price_minor:scalePrice,
           is_scale:true,scale_grams:scale.grams,scale_weight_kg:scale.weightKg,scale_label:scale.scaleLabel
         }],balances.get(sp.id));
         prefixCache.set(clean,false);
         return barcodes.find(x=>x.code===clean&&x.active!==false)||null;
       }
     }
   }
   return null;
 }
 return null;
}
function restorePending(){const key=pendingKey();if(!key)return;try{const val=JSON.parse(sessionStorage.getItem(key)||"null");if(!val||!val.id||!Array.isArray(val.items)||!Number.isSafeInteger(val.cash))return;pendingCheckout=val;requestId=val.id;cart=val.items.map(x=>{const b=val.v16?barcodes.find(b=>b.code===x.barcode):barcodes.find(b=>b.product_id===x.product_id&&b.unit_type==="unit");
 const p=products.find(p=>p.id===(b?.product_id||x.product_id));
 const isScale=Boolean(b?.is_scale&&Number(b?.scale_grams)>0);
 return p&&b?{id:p.id,name:p.name,barcode:b.code,mode:b.unit_type,isScale,scaleGrams:isScale?Number(b.scale_grams):null,scaleLabel:b.scale_label||null,
   price:Number(x.expected_price_minor??b.price_minor??p.price_minor),
   units:isScale?Number((Number(b.scale_grams)/1000).toFixed(3)):Number(x.expected_units??b.units_per_scan),available:balances.get(p.id)||0,qty:x.quantity}:null}).filter(Boolean);$("cash").value=val.cash;if($("discount"))$("discount").value=String(val.discount||0);msg("checkout-msg","ئەنجامی فرۆشتن دیار نییە؛ هەمان داواکاری پشکنەوە.","error");renderCart();syncPending();}catch(e){msg("system-msg","هەوڵی پارێزراوی پێشوو نەتوانرا بخوێندرێتەوە","error")}}
function unlockPending(){pendingCheckout=null;requestId=null;persistPending();syncPending();}
function canManage(){return role==="owner"||role==="manager";}
function viewPanel(name){
 $("login-panel").hidden=name!=="login";
 $("operations-panel").hidden=name!=="operations";
 $("logout").hidden=name!=="operations";
 $("who").textContent=user?user.email||"":"";
}
function selectTab(next){
 if(next!=="cash")clearTimeout(scanIdleTimer);
 if(next==="staff"&&role!=="owner")next="cash";
 if((next==="stock"||next==="audit")&&!canManage())next="cash";
 tab=next;
 for(const x of ["cash","stock","staff","audit","receipts","shift"])$(x+"-panel").hidden=x!==next;
 document.querySelectorAll("[data-tab]").forEach(x=>{
   x.classList.toggle("active",x.dataset.tab===next);
   x.hidden=(x.dataset.tab==="staff"&&role!=="owner") ||
      (["stock","audit"].includes(x.dataset.tab)&&!canManage());
 });
 if(next==="cash"){renderCart();renderParkedBar();syncPending();focusScanner();}
 if(next==="stock")renderStock();
 if(next==="staff")void refreshStaff();
 if(next==="audit")void refreshAudit();
 if(next==="receipts")void refreshReceipts();
 if(next==="shift")void refreshShift();
}
function renderTable(target,headers,data){
 const x=$(target);x.replaceChildren();
 if(!data.length){const blank=document.createElement("div");blank.className="blank";blank.textContent="هیچ تۆمارێک نییە";x.append(blank);return}
 const table=document.createElement("table");const head=document.createElement("thead"),hr=document.createElement("tr");
 headers.forEach(label=>{const th=document.createElement("th");th.textContent=label;hr.append(th)});
 head.append(hr);table.append(head);
 const body=document.createElement("tbody");
 for(const row of data){const tr=document.createElement("tr");row.forEach(cell=>{
    const td=document.createElement("td");td.textContent=String(cell);tr.append(td);
 });body.append(tr)}
 table.append(body);x.append(table);
}
async function loadInventory(){
 const searchVal=$("stock-search")?$("stock-search").value.trim():"";
 const stockFilterVal=$("stock-filter")?$("stock-filter").value:"all";
 const rpcArgs={p_store:store.id,p_search:searchVal,p_offset:stockOffset,p_limit:PAGE_SIZE};
 if(stockFilterVal&&stockFilterVal!=="all")rpcArgs.p_stock_filter=stockFilterVal;
 const v18=await db.rpc("retail_catalog_page_v18",rpcArgs);
 if(!v18.error&&v18.data&&Array.isArray(v18.data.items)){
   stockTotal=Number(v18.data.total_count??v18.data.items.length);
   stockPageIds=[];
   if(stockTotal<=PAGE_SIZE&&!searchVal&&stockFilterVal==="all"&&stockOffset===0){
     barcodes=[];
     prefixCache.clear();
   }
   for(const item of v18.data.items){
     if(item.active===false)continue;
     stockPageIds.push(item.id);
     upsertHotProduct(item,item.barcode_details||[],item.stock_quantity);
   }
   if(stockTotal<=PAGE_SIZE&&!searchVal&&stockFilterVal==="all"&&stockOffset===0){
     for(const b of barcodes){
       prefixCache.set(b.code,barcodes.some(x=>x.active!==false&&x.code.length>b.code.length&&x.code.startsWith(b.code)));
     }
   }
   for(const line of cart){
     let resolved=barcodes.find(x=>x.code===line.barcode&&x.active!==false);
     if(!resolved)resolved=await resolveBarcodeServer(line.barcode);
     if(resolved){
       const isScale=Boolean(resolved.is_scale&&Number(resolved.scale_grams)>0);
       line.price=Number(resolved.price_minor);
       line.units=isScale?Number((Number(resolved.scale_grams)/1000).toFixed(3)):Number(resolved.units_per_scan);
       line.available=balances.get(line.id)||0;
     }
   }
   if(tab==="stock")renderStock();else if(tab==="cash")renderCart();
   return;
 }
 if(!["PGRST202","42883"].includes(v18.error?.code))throw v18.error;
 const pres=await db.from("retail_products")
   .select("id,name,price_minor,currency,active")
   .eq("store_id",store.id).eq("active",true)
   .order("name").limit(400);
 if(pres.error)throw pres.error;
 let packCatalog=await db.rpc("retail_scan_catalog_v16",{p_store:store.id});
 let bres;
 if(!packCatalog.error){
   bres={data:packCatalog.data,error:null};
 }else if(["PGRST202","42883"].includes(packCatalog.error.code)){
   // Hosted instances without V16 keep prior unit-only checkout unchanged.
   bres=await db.from("retail_barcodes")
     .select("product_id,code,unit_type,units_per_scan,active")
     .eq("store_id",store.id).limit(2000);
   if(["42703","PGRST204","PGRST205"].includes(bres.error?.code))
     bres=await db.from("retail_barcodes")
       .select("product_id,code,unit_type,units_per_scan")
       .eq("store_id",store.id).limit(2000);
 }else throw packCatalog.error;
 if(bres.error)throw bres.error;
 const sres=await db.from("retail_stock_balances")
   .select("product_id,quantity").eq("store_id",store.id).limit(2000);
 if(sres.error)throw sres.error;
 products=pres.data||[];barcodes=(bres.data||[]).filter(b=>b.active!==false);
 balances=new Map((sres.data||[]).map(x=>[x.product_id,Number(x.quantity)]));
 const q=searchVal.toLocaleLowerCase();
 const filtered=products.filter(p=>{
   const qty=Number(balances.get(p.id)||0);
   if(stockFilterVal==="low"&&qty>5)return false;
   if(stockFilterVal==="out"&&qty>0)return false;
   if(!q)return true;
   return (p.name+" "+barcodes.filter(b=>b.product_id===p.id).map(b=>b.code).join(" ")).toLocaleLowerCase().includes(q);
 });
 stockTotal=filtered.length;
 stockPageIds=filtered.slice(stockOffset,stockOffset+PAGE_SIZE).map(p=>p.id);
 cart=cart.map(x=>{const p=products.find(p=>p.id===x.id);
   const scan=barcodes.find(b=>b.code===x.barcode);
   if(!p||!scan||scan.unit_type!==x.mode)return null;
   return {...x,name:p.name,price:Number(scan.price_minor??p.price_minor),
     units:Number(scan.units_per_scan),available:balances.get(x.id)||0};
 }).filter(Boolean);
 if(tab==="stock")renderStock();else if(tab==="cash")renderCart();
}
function updateStockUnits(){
 const product=$("stock-product").value,mode=$("stock-mode").value;
 const unitType=mode==="both"?"unit":mode;
 const barcode=$("stock-barcode"),old=barcode.value;
 barcode.replaceChildren();
 for(const b of barcodes.filter(b=>b.product_id===product&&b.unit_type===unitType&&
   (unitType==="unit"?Number(b.units_per_scan)===1:Number(b.units_per_scan)>=2))){
   const option=document.createElement("option");option.value=b.code;option.textContent=b.code;
   barcode.append(option);
 }
 if([...barcode.options].some(o=>o.value===old))barcode.value=old;
 const hasUnit=barcodes.some(b=>b.product_id===product&&b.unit_type==="unit"&&Number(b.units_per_scan)===1);
 const hasCarton=barcodes.some(b=>b.product_id===product&&b.unit_type==="carton"&&Number(b.units_per_scan)>=2);
 const modes=$("stock-mode");
 for(const option of modes.options)
   option.disabled=option.value==="unit"?!hasUnit:option.value==="carton"?!hasCarton:!(hasUnit&&hasCarton);
 if(barcode.options.length===0&&(hasUnit||hasCarton)){
   modes.value=hasUnit?"unit":"carton";updateStockUnits();return;
 }
 const mixed=$("stock-both-fields");mixed.hidden=mode!=="both";
 const carton=$("stock-mixed-carton"),previous=carton.value;carton.replaceChildren();
 for(const b of barcodes.filter(b=>b.product_id===product&&b.unit_type==="carton"&&Number(b.units_per_scan)>=2)){
   const option=document.createElement("option");option.value=b.code;option.textContent=b.code;carton.append(option);
 }
 if([...carton.options].some(x=>x.value===previous))carton.value=previous;
 $("stock-mixed-qty").required=mode==="both";
 updateStockBaseTotal();
}
function updateStockBaseTotal(){
 const product=$("stock-product").value,mode=$("stock-mode").value;
 const unit=barcodes.find(b=>b.product_id===product&&b.code===$("stock-barcode").value);
 const qty=Number($("stock-quantity").value);
 let amount=qty*Number(unit?.units_per_scan||0);
 let valid=Number.isSafeInteger(qty)&&qty>=1&&qty<=1000000&&Number.isSafeInteger(amount)&&amount>0;
 if(mode==="both"){
   const pack=barcodes.find(b=>b.product_id===product&&b.code===$("stock-mixed-carton").value&&b.unit_type==="carton");
   const count=Number($("stock-mixed-qty").value);
   const cartonBase=count*Number(pack?.units_per_scan||0);
   valid=valid&&unit?.unit_type==="unit"&&Number(unit.units_per_scan)===1&&
     Number.isSafeInteger(count)&&count>=1&&Number.isSafeInteger(cartonBase)&&cartonBase>0;
   amount+=cartonBase;
 }
 $("stock-base-total").value=valid&&Number.isSafeInteger(amount)&&amount<=1000000?String(amount):"";
}
function renderStock(){
 const pageProducts=stockPageIds.length?stockPageIds.map(id=>products.find(p=>p.id===id)).filter(Boolean):products.slice(0,PAGE_SIZE);
 const selector=$("stock-product"),old=selector.value;selector.replaceChildren();
 for(const p of pageProducts){const opt=document.createElement("option");opt.value=p.id;opt.textContent=p.name;selector.append(opt)}
 if(!didApplyInitialStock&&initialStockProduct&&pageProducts.some(p=>p.id===initialStockProduct)){
   selector.value=initialStockProduct;
   didApplyInitialStock=true;
 }else if(pageProducts.some(p=>p.id===old)){
   selector.value=old;
 }
 updateStockUnits();
 const x=$("stock-list");x.replaceChildren();
 if(!pageProducts.length){
   const blank=document.createElement("div");blank.className="blank";blank.textContent="هیچ تۆمارێک نییە";x.append(blank);
 }else{
   const table=document.createElement("table");
   table.innerHTML="<thead><tr><th>کاڵا</th><th>بڕی کۆگا</th><th>کردار</th></tr></thead><tbody></tbody>";
   for(const p of pageProducts){
     const units=Number(balances.get(p.id)||0);
     const pack=barcodes.find(b=>b.product_id===p.id&&b.unit_type==="carton");
     const perPack=Number(pack?.units_per_scan||0);
     const whole=perPack>=2?Math.floor(units/perPack):0;
     const loose=perPack>=2?Number((units-whole*perPack).toFixed(3)):0;
     const statusBadge=units<=0?" (تەواوبوو)":units<=5?" (کەمبووە)":"";
     const display=(perPack>=2?
       units.toLocaleString("en-US")+" دانە ("+whole.toLocaleString("en-US")+
       " کارتۆن + "+loose.toLocaleString("en-US")+" دانە)":
       units.toLocaleString("en-US")+" دانە")+statusBadge;
     const tr=document.createElement("tr");
     const tdName=document.createElement("td");tdName.textContent=p.name;
     const tdStock=document.createElement("td");tdStock.textContent=display;
     const tdAction=document.createElement("td");
     const pickBtn=document.createElement("button");
     pickBtn.type="button";pickBtn.className="stock-pick-btn";pickBtn.dataset.pickStock=p.id;pickBtn.textContent="هاتن";
     tdAction.append(pickBtn);
     if(role==="owner"){
       const editLink=document.createElement("a");
       editLink.className="stock-edit-link";
       editLink.href="./workspace.html?view=new&edit="+encodeURIComponent(p.id);
       editLink.textContent="دەستکاری";
       tdAction.append(editLink);
     }
     tr.append(tdName,tdStock,tdAction);
     table.tBodies[0].append(tr);
   }
   x.append(table);
 }
 syncStockPager();
}
function cartChanged(){if(pendingCheckout){syncPending();return}requestId=null;msg("checkout-msg","");renderCart();renderParkedBar();syncPending();}
function stockUsed(productId,excludeIndex=-1){return Number(cart.reduce((n,line,i)=>n+(i===excludeIndex||line.id!==productId?0:line.qty*line.units),0).toFixed(3))}
function saleLabel(line){return line.name+(line.scaleLabel?" ("+line.scaleLabel+")":line.mode==="carton"?" (کارتۆن)":" (دانە)")}
function renderCart(){
 const total=cartNetTotal();
 $("total").textContent=money(total);
 const paid=Number($("cash").value||0);
 $("change").textContent=money(Math.max(0,paid-total));
 const list=$("cart-list");list.replaceChildren();
 if(!cart.length){const div=document.createElement("div");div.className="blank";div.textContent="سەبەتە بەتاڵە";list.append(div);return}
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کاڵا</th><th>نرخ</th><th>بڕ</th><th>کۆ</th></tr></thead><tbody id=\"cart-body\"></tbody>";
 cart.forEach((it,i)=>{
  const row=document.createElement("tr");
  for(const x of [saleLabel(it),money(it.price),"",money(it.qty*it.price)]){const td=document.createElement("td");td.textContent=x;row.append(td)}
  const cell=row.children[2],wrap=document.createElement("span");wrap.className="qty";
  const minus=document.createElement("button");minus.type="button";minus.dataset.line=i;minus.dataset.delta="-1";minus.textContent="−";
  const plus=document.createElement("button");plus.type="button";plus.dataset.line=i;plus.dataset.delta="1";plus.textContent="+";
  const count=document.createElement("span");count.textContent=String(it.qty);
  wrap.append(minus,count,plus);cell.append(wrap);table.tBodies[0].append(row);
 });list.append(table);
}
async function refreshStaff(){
 if(role!=="owner")return;
 const {data,error}=await db.from("retail_memberships").select("user_id,role,active,created_at")
 .eq("store_id",store.id).order("created_at",{ascending:false}).limit(100);
 if(error){msg("staff-msg",safe(error),"error");return}
 members=data||[];
 renderTable("staff-list",["ناسنامە","ڕۆڵ","دۆخ"],members.map(x=>[x.user_id,x.role==="manager"?"بەڕێوەبەر":"کاشێر",x.active?"چالاک":"ناچالاک"]));
}
async function refreshAudit(){
 if(!canManage())return;
 const {data,error}=await db.from("retail_audit_events").select("action,actor_id,subject_id,created_at")
 .eq("store_id",store.id).order("created_at",{ascending:false}).limit(100);
 if(error){msg("system-msg",safe(error),"error");return}
 renderTable("audit-list",["کات","کردار","بەکارهێنەر"],(data||[]).map(x=>[
 new Date(x.created_at).toLocaleString("en-GB"),x.action,x.actor_id
 ]));
}
function printLink(saleId,paper,label){
 const a=document.createElement("a");
 a.className="receipt-action";
 a.href="./receipt-print.html?sale="+encodeURIComponent(String(saleId))+"&paper="+paper;
 a.target="_blank";a.rel="noopener noreferrer";
 a.textContent=label;
 return a;
}
async function returnSale(saleId){
 if(!db||!store||busy||!shiftSession){
   msg("receipts-msg","بۆ گەڕاندنەوەی پسووڵە سەرەتا شێفتی کاشێر بکەرەوە","error");
   return;
 }
 if(!returnAttempt)loadReturnAttempt();
 if(returnAttempt?.uncertain&&(returnAttempt.saleId!==saleId||returnAttempt.sessionId!==shiftSession.id)){
   msg("receipts-msg","ئەنجامی گەڕاندنەوەی پێشوو دیار نییە؛ سەرەتا هەمان پسووڵە دووبارە بکەرەوە","error");
   return;
 }
 if(!returnAttempt||returnAttempt.saleId!==saleId||returnAttempt.sessionId!==shiftSession.id){
   returnAttempt={id:crypto.randomUUID(),saleId,sessionId:shiftSession.id,uncertain:false};
   persistReturnAttempt();
 }
 lock(true);msg("receipts-msg","");
 try{
   const {data,error}=await db.rpc("retail_return_sale_v19",{
     p_store:store.id,p_sale:returnAttempt.saleId,p_session:returnAttempt.sessionId,p_request:returnAttempt.id
   });
   if(error)throw error;
   returnAttempt=null;persistReturnAttempt();
   await loadInventory();
   await refreshShift();
   await refreshReceipts();
   await showReceipt(saleId);
   msg("receipts-msg","پسووڵەی #"+String(data?.receipt_no||"").padStart(6,"0")+" گەڕێندرایەوە و بڕی کاڵاکان گەڕایەوە بۆ کۆگا","success");
 }catch(err){
   if(["22023","42501","22P02","23505","23514","PGRST202","42883"].includes(err?.code)){
     returnAttempt=null;persistReturnAttempt();
     msg("receipts-msg",safe(err),"error");
   }else{
     returnAttempt.uncertain=true;persistReturnAttempt();
     msg("receipts-msg",safe(err)+" — ئەنجامی گەڕاندنەوە دیار نییە؛ هەمان داواکاری دووبارە بکەرەوە","error");
   }
 }finally{
   lock(false);
 }
}
async function refreshReceipts(){
 if(!db||!store)return;
 msg("receipts-msg","");
 let {data,error}=await db.from("retail_sales")
 .select("id,receipt_no,total_minor,discount_minor,cash_received_minor,change_due_minor,cashier_id,status,refunded,created_at")
 .eq("store_id",store.id).eq("status","posted")
 .order("created_at",{ascending:false}).limit(100);
 if(["42703","PGRST204","PGRST205"].includes(error?.code)){
   ({data,error}=await db.from("retail_sales")
   .select("id,receipt_no,total_minor,cash_received_minor,change_due_minor,cashier_id,status,created_at")
   .eq("store_id",store.id).eq("status","posted")
   .order("created_at",{ascending:false}).limit(100));
 }
 if(error){msg("receipts-msg",safe(error),"error");return}
 const root=$("receipts-list");root.replaceChildren();
 const rows=data||[];
 if(!rows.length){const empty=document.createElement("div");empty.className="blank";empty.textContent="هیچ پسووڵەیەک نییە";root.append(empty);return}
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ژمارەی پسووڵە</th><th>کات</th><th>کۆی گشتی</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const sale of rows){
  const tr=document.createElement("tr");
  const numLabel="#"+String(sale.receipt_no??"").padStart(6,"0")+(sale.refunded?" (گەڕاوە)":"");
  const vals=[numLabel,new Date(sale.created_at).toLocaleString("en-GB"),money(sale.total_minor)];
  for(const val of vals){const td=document.createElement("td");td.textContent=val;tr.append(td)}
  const td=document.createElement("td"),button=document.createElement("button");
  button.className="receipt-action";button.textContent="وردەکاری";button.dataset.receipt=sale.id;
  td.append(button,printLink(sale.id,"58","58mm"),printLink(sale.id,"80","80mm"));
  if(!sale.refunded){
    const retBtn=document.createElement("button");
    retBtn.type="button";retBtn.className="return-btn";retBtn.dataset.returnSale=sale.id;retBtn.textContent="گەڕاندنەوە";
    td.append(retBtn);
  }
  tr.append(td);table.tBodies[0].append(tr);
 }root.append(table);
 if(rows.length===100)msg("receipts-msg","تەنها 100 پسووڵەی دواهەم.");
 if(rows[0]){
   await showReceipt(rows[0].id);
 }
}
async function showReceipt(saleId){
 if(!db||!store)return;
 let [head,items]=await Promise.all([
   db.from("retail_sales").select("id,receipt_no,total_minor,discount_minor,cash_received_minor,change_due_minor,created_at,cashier_id,refunded")
     .eq("store_id",store.id).eq("id",saleId).eq("status","posted").single(),
   db.from("retail_sale_items").select("product_id,quantity,unit_price_minor,product_name_snapshot,package_type,package_barcode,units_per_package,base_units")
     .eq("store_id",store.id).eq("sale_id",saleId).limit(200)
 ]);
 if(["42703","PGRST204","PGRST205"].includes(head.error?.code))
   head=await db.from("retail_sales").select("id,receipt_no,total_minor,cash_received_minor,change_due_minor,created_at,cashier_id")
     .eq("store_id",store.id).eq("id",saleId).eq("status","posted").single();
 if(["42703","PGRST204","PGRST205"].includes(items.error?.code))
   items=await db.from("retail_sale_items").select("product_id,quantity,unit_price_minor,product_name_snapshot")
     .eq("store_id",store.id).eq("sale_id",saleId).limit(200);
 if(head.error||items.error){msg("receipts-msg",safe(head.error||items.error),"error");return}
 const sale=head.data;
 const box=$("receipt-detail");box.replaceChildren();box.hidden=false;
 const heading=document.createElement("h3");
 heading.textContent="پسووڵەی #"+String(sale.receipt_no).padStart(6,"0")+(sale.refunded?" — ئەم پسوولەیە گەڕێندراوەتەوە":"");
 box.append(heading);
 const info=document.createElement("div");info.className="receipt-metrics";
 const metricParts=[
   ["کۆی گشتی",money(sale.total_minor)],
   ["پارەی وەرگیراو",money(sale.cash_received_minor)],
   ["پارەی گەڕاوە",money(sale.change_due_minor)]
 ];
 if(Number(sale.discount_minor)>0){
   metricParts.splice(1,0,["داشکاندن",money(sale.discount_minor)]);
 }
 for(const part of metricParts){
   const span=document.createElement("span"),bold=document.createElement("strong");
   span.textContent=part[0]+": ";bold.textContent=part[1];span.append(bold);info.append(span);
 }box.append(info);
 const t=document.createElement("div");box.append(t);
 const printActions=document.createElement("div");printActions.className="receipt-print-actions";
 printActions.append(printLink(saleId,"58","چاپی 58mm"),printLink(saleId,"80","چاپی 80mm"));
 if(!sale.refunded){
   const retBtn=document.createElement("button");
   retBtn.type="button";retBtn.className="return-btn";retBtn.dataset.returnSale=saleId;retBtn.textContent="گەڕاندنەوەی پسووڵە";
   retBtn.addEventListener("click",()=>{if(!busy)void returnSale(saleId);});
   printActions.append(retBtn);
 }
 box.append(printActions);
 const table=document.createElement("table");table.innerHTML="<thead><tr><th>کاڵا</th><th>بڕ</th><th>نرخ</th><th>کۆ</th></tr></thead><tbody></tbody>";
 for(const line of items.data||[]){
   const tr=document.createElement("tr"),p=products.find(x=>x.id===line.product_id);
   const unitInfo=line.package_type==="carton"&&Number(line.units_per_package)>=2?
     " — "+String(line.quantity)+" کارتۆن × "+String(line.units_per_package)+" دانە":
     line.package_type==="unit"?" — "+String(line.quantity)+" دانە":"";
   for(const v of [(line.product_name_snapshot||p?.name||line.product_id)+unitInfo,
      String(line.quantity),money(line.unit_price_minor),money(Number(line.quantity)*Number(line.unit_price_minor))]){
     const td=document.createElement("td");td.textContent=v;tr.append(td);
   }table.tBodies[0].append(tr);
 }t.append(table);
}
$("receipts-refresh").addEventListener("click",()=>{if(!busy)void refreshReceipts();});
$("receipts-list").addEventListener("click",e=>{
 const ret=e.target.closest("[data-return-sale]");
 if(ret&&!busy){void returnSale(ret.dataset.returnSale);return;}
 const button=e.target.closest("[data-receipt]");
 if(button&&!busy)void showReceipt(button.dataset.receipt);
});

function cashMoveKey(){return store&&user?"retail_cash_movement_"+store.id+"_"+user.id:null}
function saveCashMove(){
 const key=cashMoveKey();if(!key)return;
 try{if(pendingCashMovement)sessionStorage.setItem(key,JSON.stringify(pendingCashMovement));else sessionStorage.removeItem(key)}
 catch(e){msg("shift-msg","پاراستنی داواکاری لە وێبگەڕ سەرکەوتوو نەبوو","error")}
}
function redrawShift(summary){
 const has=!!shiftSession;
 $("shift-open-form").hidden=has;
 $("shift-active-forms").hidden=!has;
 $("shift-current").hidden=!has;
 if(summary){
  $("shift-opening").textContent=money(summary.opening);
  $("shift-sales").textContent=money(summary.sales);
  $("shift-moves").textContent=money(summary.movements);
  $("shift-expected").textContent=money(summary.expected);
 }
 $("movement-retry").hidden=!pendingCashMovement;
 $("movement-retry").disabled=busy;
 syncPending();
}
async function refreshShift(){
 if(!db||!store||!user)return;
 const {data,error}=await db.from("retail_cash_sessions")
  .select("id,status,opening_cash_minor,opened_at,expected_cash_minor,counted_cash_minor,variance_minor")
  .eq("store_id",store.id).eq("cashier_id",user.id)
  .order("opened_at",{ascending:false}).limit(30);
 if(error){msg("shift-msg",safe(error),"error");return}
 const rows=data||[];
 shiftSession=rows.find(x=>x.status==="open")||null;
 if(shiftSession){
  const summary=await db.rpc("retail_shift_summary",{p_store:store.id,p_session:shiftSession.id});
  if(summary.error){msg("shift-msg",safe(summary.error),"error");return}
  redrawShift(summary.data);
 }else redrawShift(null);
 renderTable("shift-history",["کات","دۆخ","پارەی سەرەتا","جیاوازی"],rows.map(x=>[
   new Date(x.opened_at).toLocaleString("en-GB"),
   x.status==="open"?"کراوە":"داخراوە",
   money(x.opening_cash_minor),x.variance_minor==null?"—":money(x.variance_minor)
 ]));
 if(shiftSession){try{
   const saved=JSON.parse(sessionStorage.getItem(cashMoveKey())||"null");
   pendingCashMovement=saved&&saved.sessionId===shiftSession.id?saved:null;
 }catch(e){pendingCashMovement=null;}
 }else pendingCashMovement=null;
 $("movement-retry").hidden=!pendingCashMovement;
 if(!shiftSession&&!pendingCheckout)msg("checkout-msg","بۆ فرۆشتن سەرەتا شێفت بکەرەوە");
 syncPending();
}
function renderShiftClose(summary){
 const x=$("shift-report");x.replaceChildren();x.hidden=false;
 const h=document.createElement("h3");h.textContent="پوختەی کۆتایی شێفت";x.append(h);
 const dl=document.createElement("dl");
 for(const [title,value] of [
  ["پارەی سەرەتا",summary.opening],["کۆی فرۆشتن",summary.sales],
  ["جووڵەی پارە",summary.movements],["پارەی چاوەڕوانکراو",summary.expected],
  ["پارەی ژمێردراو",summary.counted],["جیاوازی",summary.variance]
 ]){const d=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");
 dt.textContent=title;dd.textContent=money(value);d.append(dt,dd);dl.append(d)}
 x.append(dl);
}
async function commitCashMovement(){
 if(!db||busy||!pendingCashMovement)return;
 lock(true);msg("shift-msg");
 try{
  const v=pendingCashMovement;
  const {error}=await db.rpc("retail_cash_movement",{
    p_store:store.id,p_session:v.sessionId,p_request:v.id,
    p_kind:v.kind,p_amount:v.amount,p_note:v.note
  });
  if(error)throw error;
  pendingCashMovement=null;saveCashMove();
  $("shift-movement-form").reset();
  msg("shift-msg","جووڵەی پارە تۆمارکرا","success");
  await refreshShift();
 }catch(e){
  if(["22023","42501","23505"].includes(e?.code)){
    pendingCashMovement=null;saveCashMove();
    msg("shift-msg",safe(e),"error");
  }else msg("shift-msg",safe(e)+" — پشکنینەوە بە هەمان داواکاری","error");
 }finally{lock(false);$("movement-retry").hidden=!pendingCashMovement}
}
async function enter(){
 const {data,error}=await db.from("retail_stores").select("id,name,owner_user_id,currency")
 .order("created_at",{ascending:true}).limit(1).maybeSingle();
 if(error)throw error;
 if(!data){viewPanel("login");msg("login-msg","سەرەتا فرۆشگا دروست بکە.","error");return}
 store=data;
 if(data.currency!=="IQD"){viewPanel("login");msg("login-msg","ئەم وەشانە تەنها فرۆشتنی IQD پشتگیری دەکات","error");return}
 if(data.owner_user_id===user.id){role="owner"}else{
   const r=await db.from("retail_memberships").select("role,active")
     .eq("store_id",store.id).eq("user_id",user.id).maybeSingle();
   if(r.error||!r.data?.active)throw r.error||new Error("بەکارهێنەری چالاک نیت");
   role=r.data.role;
 }
 viewPanel("operations");
 if(initialStockQuery&&$("stock-search")&&!didApplyInitialStock){
   $("stock-search").value=initialStockQuery;
 }
 await loadInventory();
 await refreshShift();
 loadParked();
 loadReturnAttempt();
 restorePending();
 selectTab(["cash","stock","staff","audit","receipts","shift"].includes(view)?view:"shift");
 if(view==="stock"&&initialStockProduct&&$("stock-quantity")){
   $("stock-quantity").focus();
 }
 syncPending();
}
async function init(){
 if(!window.supabase||!config?.supabaseUrl||!config?.publishableKey){
   viewPanel("login");msg("login-msg","پەیوەندی Supabase بەردەست نییە","error");return;
 }
 db=window.supabase.createClient(config.supabaseUrl,config.publishableKey,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
 });
 const result=await db.auth.getUser();
 if(result.error||!result.data?.user){viewPanel("login");return}
 user=result.data.user;
 try{await enter()}catch(e){viewPanel("login");msg("login-msg",safe(e),"error")}
}
$("login-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!db)return;const btn=e.submitter||e.target.querySelector("button");btn.disabled=true;msg("login-msg");
 try{
   const f=new FormData(e.target),result=await db.auth.signInWithPassword({
     email:String(f.get("email")||"").trim(),password:String(f.get("password")||"")
   });
   if(result.error)throw result.error;
   user=result.data.user;await enter();
 }catch(err){msg("login-msg",safe(err),"error")}
 finally{btn.disabled=false;}
});
$("logout").onclick=async()=>{
 if(db)await db.auth.signOut();
 user=null;store=null;role=null;products=[];barcodes=[];prefixCache.clear();cart=[];parkedCarts=[];requestId=null;pendingCheckout=null;shiftSession=null;pendingCashMovement=null;stockAttempt=null;returnAttempt=null;viewPanel("login");
 msg("login-msg");
};
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{if(!busy)selectTab(b.dataset.tab)}));
// A single field accepts unit primary, unit aliases, carton primary and
// carton aliases; barcode metadata determines its pack automatically.
// HID scanners ending with Enter submit at once. No-Enter scanners submit
// only when a FULL, non-prefix catalog barcode has settled for 160ms.
let scanIdleTimer=null;
// Keep keyboard-wedge scanners pointed at the ONE visible barcode field.
// Never steal focus from amount entry or other editable forms.
function focusScanner(){
 const input=$("barcode");
 if(tab==="cash"&&!busy&&!pendingCheckout&&!input.disabled&&
    !document.hidden&&!$("cash-panel").hidden)input.focus();
}
document.addEventListener("keydown",e=>{
 if(e.key==="F2"&&tab==="cash"&&!busy&&!pendingCheckout){
   e.preventDefault();focusScanner();$("barcode").select();
 }
 if(e.key==="F2"&&tab==="stock"&&!busy){
   e.preventDefault();$("stock-search")?.focus();
 }
 if(e.key==="F4"&&tab==="cash"&&!busy&&!pendingCheckout){
   e.preventDefault();toggleHoldCart();
 }
 if(e.key==="F8"&&tab==="cash"&&!busy&&!pendingCheckout&&cart.length&&shiftSession){
   e.preventDefault();
   const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
   if(!Number($("cash").value)) $("cash").value=String(total);
   $("checkout-form").requestSubmit();
 }
 if(e.key==="F9"&&!busy){
   e.preventDefault();selectTab("receipts");
 }
 if(e.key==="Escape"&&tab==="cash"&&document.activeElement===$("barcode")){
   clearTimeout(scanIdleTimer);scanIdleTimer=null;
   $("barcode").value="";msg("scan-msg","");
 }
});
$("barcode").addEventListener("input",()=>{
 clearTimeout(scanIdleTimer);
 const code=$("barcode").value.trim();
 if(tab!=="cash"||busy||pendingCheckout||!code)return;
 scanIdleTimer=setTimeout(async()=>{
   if(tab!=="cash"||busy||pendingCheckout||$("barcode").value.trim()!==code)return;
   let b=barcodes.find(x=>x.code===code&&x.active!==false);
   let hasLonger=barcodes.some(x=>x.active!==false&&x.code.length>code.length&&x.code.startsWith(code));
   if(!b||!prefixCache.has(code)){
     const resolved=await resolveBarcodeServer(code);
     if(tab!=="cash"||busy||pendingCheckout||$("barcode").value.trim()!==code)return;
     if(resolved)b=resolved;
   }
   if(prefixCache.has(code))hasLonger=hasLonger||!!prefixCache.get(code);
   // A valid short barcode could be the start of a longer barcode.
   // Wait for explicit Enter rather than silently selling the wrong item.
   if(!b||hasLonger)return;
   $("scan-form").requestSubmit();
 },160);
});
$("scan-form").addEventListener("submit",async e=>{
 e.preventDefault();clearTimeout(scanIdleTimer);scanIdleTimer=null;
 if(pendingCheckout||busy){msg("scan-msg","فرۆشتنی پێشوو هێشتا یەکلا نەبووە.","error");return}
 const form=e.currentTarget;
 const code=String(new FormData(form).get("barcode")||"").trim();
 let b=barcodes.find(x=>x.code===code&&x.active!==false);
 if(!b&&code){
   b=await resolveBarcodeServer(code);
 }
 if(!b){form.reset();msg("scan-msg","بارکۆدەکە نەدۆزرایەوە","error");focusScanner();return}
 if(!["unit","carton"].includes(b.unit_type)||
    (b.unit_type==="unit"&&!b.is_scale&&Number(b.units_per_scan)!==1)||
    (b.unit_type==="unit"&&b.is_scale&&!(Number(b.scale_grams)>0))||
    (b.unit_type==="carton"&&!Number.isSafeInteger(Number(b.price_minor)))){
   msg("scan-msg","شێوازی فرۆشتن پشتگیری ناکرێت","error");return;
 }
 const p=products.find(x=>x.id===b.product_id);
 if(!p||p.currency!=="IQD"){msg("scan-msg","کاڵا بۆ فرۆشتن بەردەست نییە","error");return}
 const isScale=Boolean(b.is_scale&&Number(b.scale_grams)>0);
 const mode=b.unit_type,units=isScale?Number((Number(b.scale_grams)/1000).toFixed(3)):Number(b.units_per_scan),price=Number(b.price_minor??p.price_minor);
 if(!Number.isSafeInteger(price)||price<0||(isScale?!(units>0&&units<=99.999):(!Number.isSafeInteger(units)||units<1))){
   msg("scan-msg","نرخ یان یەکەی کاڵا نادروستە","error");return;
 }
 const stock=balances.get(p.id)||0;
 if(stockUsed(p.id)+units>stock){msg("scan-msg","بڕی کۆگا بەش ناکات","error");return}
  const current=cart.find(x=>x.id===p.id&&x.mode===mode&&(isScale?x.barcode===b.code:!x.isScale));
  if(current)current.qty++;
  else cart.push({id:p.id,name:p.name,barcode:b.code,mode,isScale,scaleGrams:isScale?Number(b.scale_grams):null,scaleLabel:b.scale_label||null,price,units,available:stock,qty:1});
  form.reset();msg("scan-msg");cartChanged();focusScanner();
});
$("cart-list").addEventListener("click",e=>{
 const btn=e.target.closest("[data-line]");if(!btn||busy||pendingCheckout)return;
 const i=Number(btn.dataset.line),line=cart[i];if(!line)return;
 const qty=line.qty+Number(btn.dataset.delta);
 if(Number((stockUsed(line.id,i)+Math.max(0,qty)*line.units).toFixed(3))>line.available){msg("scan-msg","بڕی کۆگا بەش ناکات","error");return}
 if(qty<=0)cart.splice(i,1);else line.qty=qty;
 cartChanged();focusScanner();
});
$("cash").addEventListener("input",()=>{if(pendingCheckout)return;if(cart.length)cartChanged();else renderCart()});
if($("discount")){
 $("discount").addEventListener("input",()=>{if(pendingCheckout)return;if(cart.length)cartChanged();else renderCart()});
}
if($("quick-cash-row")){
 $("quick-cash-row").addEventListener("click",e=>{
   const btn=e.target.closest("[data-tender]");
   if(!btn||busy||pendingCheckout)return;
   const total=cartNetTotal();
   const mode=btn.dataset.tender;
   if(mode==="exact"){
     $("cash").value=total>0?String(total):"";
   }else{
     const add=Number(mode||0);
     const cur=Number($("cash").value||0);
     $("cash").value=String((Number.isSafeInteger(cur)&&cur>0?cur:0)+add);
   }
   renderCart();focusScanner();
 });
}
if($("hold-cart")){
 $("hold-cart").addEventListener("click",()=>{toggleHoldCart();});
}
if($("parked-bar")){
 $("parked-bar").addEventListener("click",e=>{
   if(busy||pendingCheckout)return;
   const slotBtn=e.target.closest("[data-resume-slot]");
   if(slotBtn){
     resumeParkedAt(Number(slotBtn.dataset.resumeSlot));
     return;
   }
   if(e.target.closest("[data-resume-parked]")){
     resumeParkedAt(parkedCarts.length-1);
   }else if(e.target.closest("[data-discard-parked]")){
     parkedCarts.pop();persistParked();renderParkedBar();syncPending();focusScanner();
   }
 });
}
$("stock-list").addEventListener("click",e=>{
 const btn=e.target.closest("[data-pick-stock]");
 if(!btn||busy)return;
 const id=btn.dataset.pickStock;
 const sel=$("stock-product");
 if(sel&&[...sel.options].some(o=>o.value===id)){
   sel.value=id;
   updateStockUnits();
   $("stock-quantity")?.focus();
 }
});
$("clear-cart").onclick=()=>{if(pendingCheckout||busy)return;cart=[];requestId=null;$("cash").value="";if($("discount"))$("discount").value="0";msg("checkout-msg");renderCart();renderParkedBar();syncPending();focusScanner()};
async function commitCheckout(){
 if(!db||!store||busy||!pendingCheckout)return;
 lock(true);msg("checkout-msg");
 try{
   const rpcArgs={
     p_store:store.id,p_request:pendingCheckout.id,
     p_items:pendingCheckout.items,p_cash_received:pendingCheckout.cash
   };
   if(Number(pendingCheckout.discount)>0)rpcArgs.p_discount=Number(pendingCheckout.discount);
   const {data,error}=await db.rpc(pendingCheckout.v16?
      "retail_checkout_packs_v16":"retail_checkout_cash",rpcArgs);
   if(error)throw error;
   const saleId=data;
   unlockPending();cart=[];$("cash").value="";if($("discount"))$("discount").value="0";
   renderCart();msg("checkout-msg","فرۆشتن تۆمارکرا — "+saleId,"success");
   try{
     await refreshShift();
     const {data:receipt,error:receiptError}=await db.from("retail_sales")
       .select("receipt_no,total_minor,change_due_minor")
       .eq("store_id",store.id).eq("id",saleId).single();
     if(!receiptError&&receipt?.receipt_no){
       msg("checkout-msg","پسووڵەی ژمارە "+String(receipt.receipt_no).padStart(6,"0")+" تۆمارکرا","success");
       $("checkout-msg").append(printLink(saleId,"58","چاپی 58mm"),printLink(saleId,"80","چاپی 80mm"));
     }
     await loadInventory();
   }catch(inventoryError){msg("system-msg","فرۆشتن تۆمارکرا؛ نوێکردنەوەی کۆگا سەرکەوتوو نەبوو","error")}
 }catch(err){
   // Keep ambiguous requests frozen for retry with the identical request UUID and payload.
   if(["22023","42501","22P02","23514","PGRST202","42883"].includes(err?.code)){
     unlockPending();
     msg("checkout-msg",safe(err),"error");
   }else{
     syncPending();
     msg("checkout-msg",safe(err)+" — هەمان داواکاری دووبارە پشکنەوە","error");
   }
 }finally{lock(false);focusScanner()}
}
$("checkout-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!db||!store||busy||!cart.length||pendingCheckout)return;
 const subtotal=cartSubtotal(),discount=cartDiscount(),total=cartNetTotal(),cash=Number($("cash").value);
 if(discount>subtotal){
   msg("checkout-msg","داشکاندن نابێت لە کۆی گشتی زیاتر بێت","error");return;
 }
 if(!Number.isSafeInteger(cash)||cash<total||cash>9999999999999){
   msg("checkout-msg","پارەی وەرگیراو نادروستە","error");return;
 }
 requestId=crypto.randomUUID();
 const packs=cart.some(x=>x.mode==="carton"||Boolean(x.scaleLabel)||Boolean(x.isScale))||discount>0;
 pendingCheckout={id:requestId,
   v16:packs,
   discount,
   items:packs?cart.map(x=>({barcode:x.barcode,quantity:x.qty,
       expected_price_minor:x.price,expected_units:x.isScale?1:x.units})):
      cart.map(x=>({product_id:x.id,quantity:x.qty})),cash};
 persistPending();syncPending();
 await commitCheckout();
});
$("retry-checkout").addEventListener("click",()=>{if(pendingCheckout&&!busy)void commitCheckout();});
$("stock-product").addEventListener("change",updateStockUnits);
$("stock-mode").addEventListener("change",updateStockUnits);
$("stock-barcode").addEventListener("change",updateStockBaseTotal);
$("stock-quantity").addEventListener("input",updateStockBaseTotal);
$("stock-mixed-carton").addEventListener("change",updateStockBaseTotal);
$("stock-mixed-qty").addEventListener("input",updateStockBaseTotal);
if($("stock-search")){
 $("stock-search").addEventListener("input",()=>{
   stockOffset=0;
   void loadInventory();
 });
}
if($("stock-filter")){
 $("stock-filter").addEventListener("change",()=>{
   stockOffset=0;
   void loadInventory();
 });
}
if($("stock-refresh")){
 $("stock-refresh").addEventListener("click",()=>{if(!busy)void loadInventory();});
}
if($("stock-prev")){
 $("stock-prev").addEventListener("click",()=>{
   if(!busy&&stockOffset>=PAGE_SIZE){stockOffset-=PAGE_SIZE;void loadInventory();}
 });
}
if($("stock-next")){
 $("stock-next").addEventListener("click",()=>{
   if(!busy&&stockOffset+PAGE_SIZE<stockTotal){stockOffset+=PAGE_SIZE;void loadInventory();}
 });
}
$("stock-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!canManage()||busy||!store)return;
 const f=new FormData(e.target),reason=String(f.get("reason")||"");
 const product=String(f.get("product")||""),code=String(f.get("barcode")||""),
   mode=String(f.get("mode")||""),qty=Number(f.get("quantity"));
 const first=barcodes.find(b=>b.product_id===product&&b.code===code&&
   b.unit_type===(mode==="both"?"unit":mode));
 const units=Number(first?.units_per_scan);
 const mix=barcodes.find(b=>b.product_id===product&&b.code===String(f.get("mixed_carton")||"")&&b.unit_type==="carton");
 const mixedQty=Number(f.get("mixed_qty"));
 const mixed=mode==="both";
 const total=qty*units+(mixed?mixedQty*Number(mix?.units_per_scan||0):0);
 if(!first||!Number.isSafeInteger(qty)||qty<1||qty>1000000||
   !Number.isSafeInteger(units)||units<1||mode==="unit"&&units!==1||
   mode==="carton"&&units<2||mixed&&(
      !mix||!Number.isSafeInteger(mixedQty)||mixedQty<1||mixedQty>1000000||
      first.unit_type!=="unit"||units!==1||Number(mix.units_per_scan)<2
   )||!Number.isSafeInteger(total)||total<1||total>1000000||
   !["unit","carton","both"].includes(mode)||!["opening","purchase"].includes(reason)){
   msg("stock-msg","بڕ یان بارکۆدی کۆگا نادروستە","error");return;
 }
 const args=mixed?
   {p_store:store.id,p_lines:[
      {barcode:first.code,packages:qty,expected_units:1},
      {barcode:mix.code,packages:mixedQty,expected_units:Number(mix.units_per_scan)}
    ],p_reason:reason}:
   {p_store:store.id,p_barcode:code,p_packages:qty,p_expected_units:units,p_reason:reason};
 const fingerprint=JSON.stringify({rpc:mixed?"mixed":"single",...args});
 if(stockAttempt?.uncertain&&stockAttempt.fingerprint!==fingerprint){
   msg("stock-msg","ئەنجامی وەرگرتنی پێشوو دیار نییە؛ هەمان داواکاری دووبارە بکەرەوە","error");return;
 }
 if(!stockAttempt||stockAttempt.fingerprint!==fingerprint)
   stockAttempt={fingerprint,id:crypto.randomUUID(),uncertain:false};
 lock(true);msg("stock-msg");
 try{
   const {error}=await db.rpc(mixed?"retail_receive_mixed_v171":"retail_receive_packs_v17",
     {...args,p_request:stockAttempt.id});
   if(error)throw error;
   stockAttempt=null;e.target.reset();
   try{await loadInventory();msg("stock-msg","بڕی کۆگا تۆمارکرا","success");}
   catch(refreshError){msg("stock-msg","بڕی کۆگا تۆمارکرا؛ لیستەکە نوێ نەکرایەوە","success");}
 }catch(err){
   // Never fall back to non-idempotent legacy receive_stock.
   // A network timeout may follow a successful COMMIT; retry with the SAME UUID.
   if(/Failed to fetch|NetworkError|timeout/i.test(err?.message||"")){
     stockAttempt.uncertain=true;
     msg("stock-msg","ئەنجامی وەرگرتن دیار نییە؛ هەمان کردار دووبارە بکەرەوە","error");
   }else if(["PGRST202","42883"].includes(err?.code)){
     stockAttempt=null;
     msg("stock-msg","وەرگرتنی دانە و کارتۆن لە سێرڤەر چالاک نییە","error");
   }else{stockAttempt=null;msg("stock-msg",safe(err),"error");}
 }finally{lock(false)}
});
$("staff-form").addEventListener("submit",async e=>{
 e.preventDefault();if(role!=="owner"||busy||!store)return;
 const f=new FormData(e.target),id=String(f.get("user")||"").trim();
 if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)){
   msg("staff-msg","ناسنامەی کارمەند نادروستە","error");return
 }
 lock(true);msg("staff-msg");
 try{
   const {error}=await db.rpc("retail_assign_staff",{
     p_store:store.id,p_user:id,p_role:String(f.get("role")),p_active:String(f.get("active"))==="true"
   });if(error)throw error;
   await refreshStaff();msg("staff-msg","مۆڵەتی کارمەند نوێکرایەوە","success");
 }catch(err){msg("staff-msg",safe(err),"error")}
 finally{lock(false)}
});

$("shift-refresh").addEventListener("click",()=>{if(!busy)void refreshShift()});
$("shift-open-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!db||!store||busy||shiftSession)return;
 const opening=Number(new FormData(e.target).get("opening"));
 if(!Number.isSafeInteger(opening)||opening<0||opening>9999999999999){msg("shift-msg","بڕی سەرەتایی نادروستە","error");return}
 lock(true);msg("shift-msg");
 try{
  const {error}=await db.rpc("retail_shift_open",{p_store:store.id,p_opening:opening});
  if(error)throw error;
  e.target.reset();$("shift-report").hidden=true;
  msg("shift-msg","شێفت کرایەوە","success");
  await refreshShift();
 }catch(e){msg("shift-msg",safe(e),"error")}finally{lock(false)}
});
$("shift-movement-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!shiftSession||busy||pendingCashMovement)return;
 const f=new FormData(e.target),amount=Number(f.get("amount")),note=String(f.get("note")||"").trim(),kind=String(f.get("kind"));
 if(!Number.isSafeInteger(amount)||amount<=0||amount>9999999999999||!note||note.length>160){
  msg("shift-msg","زانیاری جووڵەی پارە نادروستە","error");return;
 }
 pendingCashMovement={id:crypto.randomUUID(),sessionId:shiftSession.id,kind,amount,note};
 saveCashMove();await commitCashMovement();
});
$("movement-retry").addEventListener("click",()=>{if(!busy)void commitCashMovement()});
$("shift-close-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!db||!shiftSession||busy||pendingCashMovement||pendingCheckout)return;
 const counted=Number(new FormData(e.target).get("counted"));
 if(!Number.isSafeInteger(counted)||counted<0||counted>9999999999999){
   msg("shift-msg","پارەی ژمێردراو نادروستە","error");return;
 }
 lock(true);msg("shift-msg");
 const closingId=shiftSession.id;
 try{
  const {data,error}=await db.rpc("retail_shift_close",{p_store:store.id,p_session:closingId,p_counted:counted});
  if(error)throw error;
  renderShiftClose(data);e.target.reset();
  msg("shift-msg","شێفت داخرا","success");
  await refreshShift();
 }catch(err){msg("shift-msg",safe(err),"error");}
 finally{lock(false)}
});
void init();
})();
