"use strict";
(() => {
const $=id=>document.getElementById(id);
const config=window.RETAIL_CONFIG;
const params=new URLSearchParams(location.search);
const view=params.get("view");
const initialStockSub=params.get("sub")||(view==="low-stock"?"low":view==="expiry"?"expiry":view==="movements"?"movements":"status");
const initialCustSub=params.get("sub")||(view==="customer-debts"?"debts":view==="customer-history"?"history":view==="customer-payments"?"payments":"directory");
const initialSupSub=params.get("sub")||(view==="purchase-orders"?"orders":view==="receiving"?"receiving":view==="supplier-accounts"?"accounts":view==="suppliers-dir"?"suppliers":"orders");
const initialFinSub=params.get("sub")||(view==="treasury"?"treasury":view==="revenue"?"revenue":view==="expenses"?"expenses":view==="cashflow"?"cashflow":"treasury");
const initialRepSub=params.get("sub")||(view==="sales-report"?"sales":view==="profit-report"?"profit":view==="inventory-report"?"inventory":view==="smart-insights"?"insights":"sales");
const initialSetSub=params.get("sub")||(view==="permissions"?"permissions":view==="devices"?"devices":view==="system"?"system":"users");
const initialOffSub=params.get("sub")||(view==="discounts"?"discounts":view==="coupons"?"coupons":view==="campaigns"?"campaigns":"new");
const initialShiftSub=params.get("sub")||(view==="attendance"?"attendance":view==="workhours"?"workhours":view==="evaluation"?"evaluation":"shifts");
const initialLabelsSub=params.get("sub")||(view==="label-price"?"price":view==="label-barcode"?"barcode":view==="label-batch"?"batch":view==="label-template"?"template":"price");
const initialAuditSub=params.get("sub")||(view==="alerts"?"alerts":view==="approvals"?"approvals":view==="qa"?"qa":"changes");
const initialStockProduct=params.get("product")||"";
const initialStockQuery=params.get("q")||"";
const PAGE_SIZE=50;
const RECEIPTS_PAGE_SIZE=50;
let db=null,user=null,store=null,role=null,products=[],barcodes=[],balances=new Map(),members=[],cart=[],requestId=null,tab="cash",busy=false,pendingCheckout=null,shiftSession=null,pendingCashMovement=null,stockAttempt=null,returnAttempt=null;
let stockOffset=0,stockTotal=0,stockPageIds=[],parkedCarts=[],didApplyInitialStock=false;
let stockSub=["status","low","expiry","movements"].includes(initialStockSub)?initialStockSub:"status";
let custSub=["directory","debts","history","payments"].includes(initialCustSub)?initialCustSub:"directory";
let supSub=["orders","suppliers","receiving","accounts"].includes(initialSupSub)?initialSupSub:"orders";
let finSub=["treasury","revenue","expenses","cashflow"].includes(initialFinSub)?initialFinSub:"treasury";
let repSub=["sales","profit","inventory","insights"].includes(initialRepSub)?initialRepSub:"sales";
let setSub=["users","permissions","devices","system"].includes(initialSetSub)?initialSetSub:"users";
let offSub=["new","discounts","coupons","campaigns"].includes(initialOffSub)?initialOffSub:"new";
let shiftSub=["shifts","attendance","workhours","evaluation"].includes(initialShiftSub)?initialShiftSub:"shifts";
let labelsSub=["price","barcode","batch","template"].includes(initialLabelsSub)?initialLabelsSub:"price";
let auditSub=["alerts","approvals","changes","qa"].includes(initialAuditSub)?initialAuditSub:"changes";
let stockExpiries=[],stockMovementsLedger=[],lowStockItemsCache=[];
let movementsReady=false,movementsReadToken=0,movementsLoading=false,movementsOffset=0,movementsTotal=0,movementsFilters=null,movementsTimer=null;
const customerPickers=[];
let customersList=[],customerLedgerList=[],customersReady=false,customersReadToken=0,customersScope=null,customerIdentityEpoch=0;
let historyRows=[],historyOffset=0,historyTotal=0,historyFilters=null,historyToken=0,historyReady=false,historyLoading=false,historyTimer=null;
let customerPayRows=[],customerPayOffset=0,customerPayTotal=0,customerPayFilters=null,customerPayToken=0,customerPayReady=false,customerPayLoading=false,customerPayTimer=null;
let debtRows=[],debtOffset=0,debtTotal=0,debtFilters=null,debtToken=0,debtReady=false,debtLoading=false,debtTimer=null;
let directoryRows=[],directoryOffset=0,directoryTotal=0,directoryFilters=null,directoryToken=0,directoryReady=false,directoryLoading=false,directoryTimer=null;
let poRows=[],poOffset=0,poTotal=0,poFilters=null,poToken=0,poReady=false,poLoading=false,poTimer=null;
let supDirectoryRows=[],supDirectoryOffset=0,supDirectoryTotal=0,supDirectoryFilters=null,supDirectoryToken=0,supDirectoryReady=false,supDirectoryLoading=false,supDirectoryTimer=null;
let suppliersReady=false,suppliersReadToken=0,suppliersScope=null,supplierIdentityEpoch=0;
let suppliersList=[],purchaseOrdersList=[],supplierLedgerList=[];
let financeEntriesList=[],shiftSessionsHistory=[],financeState=null;
let allSaleItems=[],productCostsMap=new Map();
let staffProfilesMap=new Map(),storeSettings={},lastServerPingMs=null;
let offersList=[],discountRulesList=[],couponsList=[],campaignsList=[],activePosPromo=null;
let shiftVerified=false,shiftEpoch=0,shiftRows=[],shiftOffset=0,shiftTotal=0,shiftFilters=null,shiftHistoryToken=0,shiftHistoryLoading=false;
let paymentRows=[],paymentOffset=0,paymentTotal=0,paymentFilters=null,paymentSession=null,paymentToken=0,paymentLoading=false,paymentVerified=false,paymentTimer=null;
let auditPageRows=[],auditPageOffset=0,auditPageTotal=0,auditPageFilters=null,auditListToken=0,auditLoading=false,auditQueryTimer=null;
let returnPageRows=[],returnPageOffset=0,returnPageTotal=0,returnPageFilters=null,returnListToken=0,returnLookupToken=0,returnLoading=false;
let receiptPageRows=[],receiptPageTotal=0,receiptListEpoch=0,receiptDetailEpoch=0,receiptFilters=null,receiptLoading=false;
let allReceipts=[],receiptsOffset=0,selectedReturnSaleId=null,selectedReturnLineId=null,returnReceiptLines=[],returnDetailToken=0,allMovements=[],shiftSummaryData=null,lastCompletedSale=null,itemReturnAttempt=null;
let attendanceList=[],workHoursList=[],evaluationsList=[],batchLabelsQueue=[],customAlertsList=[],approvalRequestsList=[],auditEventsCache=[];
const prefixCache=new Map();
const money=n=>n===null||n===undefined||!Number.isFinite(Number(n))?"—":Number(n).toLocaleString("en-US")+" IQD";
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
function lock(v){busy=!!v;document.querySelectorAll("#operations-panel button").forEach(x=>{x.disabled=busy;});syncPending();syncStockPager();syncReceiptPager();syncReturnPager();syncAuditPager();syncPaymentsPager();syncShiftPager();syncCustomerReads();syncSupplierReads();syncMovementPager();}
function pendingKey(){return store&&user?"retail_pending_checkout_"+store.id+"_"+user.id:null}
function parkedKey(){return store&&user?"retail_parked_carts_"+store.id+"_"+user.id:null}
function returnKey(){return store&&user?"retail_pending_return_"+store.id+"_"+user.id:null}
function persistPending(){const key=pendingKey();if(!key)return;try{if(pendingCheckout)sessionStorage.setItem(key,JSON.stringify(pendingCheckout));else sessionStorage.removeItem(key);}catch(e){msg("system-msg","پاراستنی هەوڵی فرۆشتن لە بیرگەی وێبگەڕدا سەرکەوتوو نەبوو","error")}}
function persistParked(){const key=parkedKey();if(!key)return;try{if(parkedCarts.length)sessionStorage.setItem(key,JSON.stringify(parkedCarts));else sessionStorage.removeItem(key);}catch(e){}}
function loadParked(){const key=parkedKey();if(!key)return;try{const raw=JSON.parse(sessionStorage.getItem(key)||"[]");parkedCarts=Array.isArray(raw)?raw:[];}catch(e){parkedCarts=[];}renderParkedBar();}
function persistReturnAttempt(){const key=returnKey();if(!key)return;try{if(returnAttempt)sessionStorage.setItem(key,JSON.stringify(returnAttempt));else sessionStorage.removeItem(key);}catch(e){}}
function loadReturnAttempt(){const key=returnKey();if(!key)return;try{const raw=JSON.parse(sessionStorage.getItem(key)||"null");returnAttempt=raw&&raw.id&&raw.saleId&&raw.sessionId?raw:null;}catch(e){returnAttempt=null;}}
async function financialRpc(action,rpc,args){
 const key="retail_financial_attempt_"+store.id+"_"+user.id+"_"+action;
 const fingerprint=JSON.stringify({rpc,...args});
 let attempt;
 try{attempt=JSON.parse(sessionStorage.getItem(key)||"null");}catch(_e){}
 if(attempt&&attempt.fingerprint!==fingerprint)throw new Error("ئەنجامی مامەڵەی پێشوو دیار نییە؛ هەمان زانیاری دووبارە بنێرە");
 if(!attempt){
  attempt={id:crypto.randomUUID(),fingerprint};
  sessionStorage.setItem(key,JSON.stringify(attempt));
 }
 const result=await db.rpc(rpc,{...args,p_request:attempt.id});
 if(result.error){
  if(["22023","42501","22P02","23514","PGRST202","42883"].includes(result.error.code))sessionStorage.removeItem(key);
  throw result.error;
 }
 if(!result.data)throw new Error("سێرڤەر پشتڕاستکردنەوەی مامەڵەکەی نەگەڕاندەوە");
 sessionStorage.removeItem(key);
 return {...result.data,request_id:attempt.id};
}
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
let audioCtx=null;
let scanSoundEnabled=localStorage.getItem("retail_scan_sound")!=="0";
function playScanBeep(isSuccess=true){
 if(!scanSoundEnabled)return;
 try{
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)return;
  if(!audioCtx)audioCtx=new AudioContextClass();
  if(audioCtx.state==="suspended")void audioCtx.resume();
  const osc=audioCtx.createOscillator();
  const gain=audioCtx.createGain();
  osc.connect(gain);gain.connect(audioCtx.destination);
  const now=audioCtx.currentTime;
  if(isSuccess){
   osc.type="sine";osc.frequency.setValueAtTime(880,now);
   gain.gain.setValueAtTime(0.12,now);gain.gain.exponentialRampToValueAtTime(0.001,now+0.08);
   osc.start(now);osc.stop(now+0.085);
  }else{
   osc.type="triangle";osc.frequency.setValueAtTime(320,now);osc.frequency.setValueAtTime(220,now+0.08);
   gain.gain.setValueAtTime(0.15,now);gain.gain.exponentialRampToValueAtTime(0.001,now+0.18);
   osc.start(now);osc.stop(now+0.19);
  }
 }catch(_e){}
}
function syncSoundToggleBtn(){
 const btn=$("scan-sound-toggle");
 if(!btn)return;
 btn.textContent=scanSoundEnabled?"🔊 دەنگ":"🔇 بێدەنگ";
 btn.title=scanSoundEnabled?"دەنگ چالاکە (کلیک بکە بۆ بێدەنگکردن)":"بێدەنگە (کلیک بکە بۆ پێکردن)";
}
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
function syncPending(){const pending=!!pendingCheckout,selecting=customerSelectionPending("checkout-customer");for(const id of ["barcode","cash","discount","checkout-customer"]){if($(id))$(id).disabled=pending||busy||(id==="checkout-customer"&&selecting);}$("clear-cart").disabled=pending||busy;if($("hold-cart"))$("hold-cart").disabled=pending||busy||(cart.length===0&&parkedCarts.length===0);$("finish-sale").disabled=pending||busy||!shiftSession||selecting;if($("checkout-to-debt"))$("checkout-to-debt").disabled=pending||busy||!shiftSession||cart.length===0||selecting;$("retry-checkout").hidden=!pending;$("retry-checkout").disabled=busy;document.querySelectorAll("#quick-cash-row button,#quick-discount-row button,#parked-bar button").forEach(b=>{b.disabled=pending||busy;});}
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
   base_unit:prod.base_unit||existing?.base_unit||"unit",
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
async function resolveBarcodeServer(code,{strict=false}={}){
  const clean=String(code||"").trim();
  if(!db||!store||!clean)return null;
  try{
    const res=await db.rpc("retail_resolve_barcode_v18",{p_store:store.id,p_code:clean});
    if(res.error&&strict)throw res.error;
    if(!res.error&&res.data){
      prefixCache.set(clean,!!res.data.has_longer_prefix);
      if(res.data.found){
        const d=res.data;
        const isScale=Boolean(d.is_scale||Number(d.scale_grams)>0);
        if(isScale && d.base_unit!=="kg")return null;
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
          id:d.product_id,name:d.product_name,sku:d.sku,plu:d.plu,base_unit:d.base_unit||"unit",price_minor:d.unit_price_minor??d.price_minor,currency:d.currency||"IQD",active:true
        },sibs,d.stock_quantity);
        return barcodes.find(x=>x.code===clean&&x.active!==false)||null;
      }
    }
  }catch(err){if(strict)throw err;}
  // V20 scanning and checkout must never trust a stale/offline local catalog.
  if(strict)return null;
  const hasLonger=barcodes.some(x=>x.active!==false&&x.code.length>clean.length&&x.code.startsWith(clean));
  prefixCache.set(clean,hasLonger);
  const exact=barcodes.find(x=>x.code===clean&&x.active!==false);
  if(exact)return exact;

  const scale=parseScaleBarcode(clean);
  if(scale){
    const pluFull="27"+scale.pluRaw;
    let sp=products.find(p=>{
      if(p.active===false||p.currency!=="IQD"||!(Number(p.price_minor)>0))return false;
      const rawPlu=String(p.plu||"").trim();
      const rawSku=String(p.sku||"").trim();
      if(rawPlu&&(rawPlu===scale.pluRaw||rawPlu===scale.pluNum||rawPlu===pluFull||(/^\d{1,5}$/.test(rawPlu)&&rawPlu.padStart(5,"0")===scale.pluRaw)))return true;
      if(rawSku&&(rawSku===scale.pluRaw||rawSku===scale.pluNum||rawSku===pluFull))return true;
      const pBarcodes=barcodes.filter(b=>b.product_id===p.id&&b.active!==false);
      if(pBarcodes.some(b=>b.code===pluFull||b.code===scale.pluRaw||b.code===scale.pluNum))return true;
      return false;
    });

    if(!sp&&db){
      try{
        const bRes=await db.from("retail_barcodes").select("product_id,code")
          .eq("store_id",store.id).in("code",[pluFull,scale.pluRaw,scale.pluNum]).eq("active",true).limit(1);
        let foundProdId=bRes?.data?.[0]?.product_id;
        if(!foundProdId){
          const pRes=await db.from("retail_products").select("id")
            .eq("store_id",store.id).in("plu",[pluFull,scale.pluRaw,scale.pluNum]).eq("active",true).limit(1);
          foundProdId=pRes?.data?.[0]?.id;
        }
        if(foundProdId){
          const prodFetch=await db.from("retail_products")
            .select("id,name,price_minor,currency,active,sku,plu,base_unit")
            .eq("store_id",store.id).eq("id",foundProdId).single();
          if(prodFetch?.data&&prodFetch.data.active!==false&&Number(prodFetch.data.price_minor)>0){
            sp=prodFetch.data;
            const stockFetch=await db.from("retail_stock_balances")
              .select("quantity").eq("store_id",store.id).eq("product_id",foundProdId).maybeSingle();
            balances.set(foundProdId,Number(stockFetch?.data?.quantity||0));
          }
        }
      }catch(_err){}
    }

    if(sp?.base_unit==="kg"){
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
function restorePending(){const key=pendingKey();if(!key)return;try{const val=JSON.parse(sessionStorage.getItem(key)||"null");if(!val||!val.id||!Array.isArray(val.items)||!Number.isSafeInteger(val.cash))return;pendingCheckout=val;requestId=val.id;cart=val.items.map(x=>{const b=val.v16?barcodes.find(b=>b.code===x.barcode):barcodes.find(b=>b.product_id===x.product_id&&b.unit_type==="unit");
 const p=products.find(p=>p.id===(b?.product_id||x.product_id));
 const isScale=Boolean(b?.is_scale&&Number(b?.scale_grams)>0);
 return p&&b?{id:p.id,name:p.name,barcode:b.code,mode:b.unit_type,isScale,scaleGrams:isScale?Number(b.scale_grams):null,scaleLabel:b.scale_label||null,
   price:Number(x.expected_price_minor??b.price_minor??p.price_minor),
   units:isScale?Number((Number(b.scale_grams)/1000).toFixed(3)):Number(x.expected_units??b.units_per_scan),available:balances.get(p.id)||0,qty:x.quantity}:null}).filter(Boolean);$("cash").value=val.cash;if($("discount"))$("discount").value=String(val.discount||0);msg("checkout-msg","ئەنجامی فرۆشتن دیار نییە؛ هەمان داواکاری پشکنەوە.","error");renderCart();syncPending();}catch(e){msg("system-msg","هەوڵی پارێزراوی پێشوو نەتوانرا بخوێندرێتەوە","error")}}
function unlockPending(){pendingCheckout=null;requestId=null;persistPending();syncPending();}
function canManage(){return role==="owner"||role==="manager";}
function renderQuickLoginStaffList(){
 if(window.RETAIL_DEMO_MODE!==true)return;
 const root=$("quick-login-staff-list");
 if(!root)return;
 root.replaceChildren();
 const profiles=[{user_id:"00000000-0000-4000-8000-000000000001",name:"خاوەنکار (Owner)",role:"owner",pin:"1234"}];
 try{
   const sp=JSON.parse(localStorage.getItem("retail_staff_profiles_v18")||"{}");
   for(const [uid,p] of Object.entries(sp)){
     if(uid!=="00000000-0000-4000-8000-000000000001"&&p.active!==false){
       profiles.push({user_id:uid,name:p.full_name||"کاشێر",role:p.role||"cashier",pin:p.pin_code});
     }
   }
 }catch(_e){}
 profiles.forEach(p=>{
   const btn=document.createElement("button");
   btn.type="button";btn.className="secondary";
   btn.style.height="34px";btn.style.padding="0 10px";btn.style.fontSize="12px";btn.style.fontWeight="850";
   btn.style.borderColor=p.role==="owner"?"#fde68a":p.role==="manager"?"#bfdbfe":"#bbf7d0";
   btn.style.background=p.role==="owner"?"#fffbeb":p.role==="manager"?"#eff6ff":"#f0fdf4";
   btn.style.color=p.role==="owner"?"#92400e":p.role==="manager"?"#1e40af":"#166534";
   btn.textContent=(p.role==="owner"?"👑 ":"🧑‍💼 ")+p.name+" ("+(p.role==="owner"?"خاوەنکار":p.role==="manager"?"بەڕێوەبەر":"کاشێر")+")";
   btn.addEventListener("click",async()=>{
     if($("login-form")){
       const emInput=$("login-form").querySelector("[name='email']");
       if(emInput)emInput.value=p.user_id;
       const pwInput=$("login-form").querySelector("[name='password']");
       if(pwInput)pwInput.value=p.pin||"1234";
       $("login-form").requestSubmit();
     }
   });
   root.append(btn);
 });
}
async function switchActiveUser(uid){
 if(window.RETAIL_DEMO_MODE!==true){msg("staff-msg","گۆڕینی ناسنامە پێویستی بە چوونەژوورەوەی ڕاستەقینە هەیە","error");return;}
 if(!db||busy)return;
 lock(true);msg("staff-msg","");
 try{
   if(typeof db.auth?.signInWithPassword==="function"){
     await db.auth.signInWithPassword({email: uid});
   }
   const res=await db.auth.getUser();
   if(res.data?.user)user=res.data.user;
   await enter();
   const prof=staffProfilesMap?.get(uid);
   const rTxt=role==="owner"?"خاوەنکار":role==="manager"?"بەڕێوەبەر":"کاشێر";
   msg("staff-msg","سیستەم گۆڕدرا بۆ: "+(prof?.full_name||uid)+" ("+rTxt+")","success");
 }catch(err){
   msg("staff-msg","هەڵە لە گۆڕینی بەکارهێنەر: "+safe(err),"error");
 }finally{
   lock(false);
 }
}
function viewPanel(name){
 $("login-panel").hidden=name!=="login";
 $("operations-panel").hidden=name!=="operations";
 $("logout").hidden=name!=="operations";
 if($("quick-switch-user"))$("quick-switch-user").hidden=name!=="operations"||window.RETAIL_DEMO_MODE!==true;
 if(role){
   const roleName=role==="owner"?"خاوەنکار":role==="manager"?"بەڕێوەبەر":"کاشێر";
   const prof=staffProfilesMap?.get(user?.id);
   const dName=prof?.full_name||(user?.id===store?.owner_user_id?"خاوەنکار (سەرپەرشتیار)":user?.email?.split("@")[0]||"کارمەند");
   $("who").textContent=`${dName} [${roleName}]`;
   if($("quick-switch-user")){
     $("quick-switch-user").textContent=role==="owner"?"🔄 تاقیکردنەوە وەک کاشێر":"👑 گەڕانەوە بۆ خاوەنکار";
   }
 }else{
   $("who").textContent=user?user.email||"":"";
 }
 if(name==="login")renderQuickLoginStaffList();
}
function selectStockSub(nextSub){
 if(!["status","catalog","low","expiry","movements"].includes(nextSub))nextSub="status";
 stockSub=nextSub;
 for(const s of ["status","catalog","low","expiry","movements"]){
   const el=$("stock-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-stock-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.stockSub===nextSub);
 });
 if(nextSub==="status")renderStock();
 if(nextSub==="catalog")renderOpsCatalogList();
 if(nextSub==="low")void refreshLowStockView();
 if(nextSub==="expiry")void refreshExpiryView();
 if(nextSub==="movements")void refreshStockMovementsView();
}
function selectCustomerSub(nextSub,refresh=true){
 if(!["directory","debts","history","payments"].includes(nextSub))nextSub="directory";
 custSub=nextSub;
 for(const s of ["directory","debts","history","payments"]){
   const el=$("cust-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-cust-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.custSub===nextSub);
 });
 if(refresh)void refreshCustomersSection(nextSub);
}
function selectSupplierSub(nextSub,refresh=true){
 if(!["orders","suppliers","receiving","accounts"].includes(nextSub))nextSub="orders";
 supSub=nextSub;
 for(const s of ["orders","suppliers","receiving","accounts"]){
   const el=$("sup-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-sup-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.supSub===nextSub);
 });
 if(refresh)return refreshSuppliersSection(nextSub);
}
function selectFinanceSub(nextSub){
 if(!["treasury","revenue","expenses","cashflow"].includes(nextSub))nextSub="treasury";
 finSub=nextSub;
 for(const s of ["treasury","revenue","expenses","cashflow"]){
   const el=$("fin-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-fin-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.finSub===nextSub);
 });
 void refreshFinanceSection(nextSub);
}
function selectReportsSub(nextSub){
 if(!["sales","profit","inventory","insights"].includes(nextSub))nextSub="sales";
 repSub=nextSub;
 for(const s of ["sales","profit","inventory","insights"]){
   const el=$("rep-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-rep-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.repSub===nextSub);
 });
 void refreshReportsSection(nextSub);
}
function selectSettingsSub(nextSub){
 if(!["users","permissions","devices","system"].includes(nextSub))nextSub="users";
 setSub=nextSub;
 for(const s of ["users","permissions","devices","system"]){
   const el=$("set-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-set-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.setSub===nextSub);
 });
 void refreshSettingsSection(nextSub);
}
function selectOffersSub(nextSub){
 if(!["new","discounts","coupons","campaigns"].includes(nextSub))nextSub="new";
 offSub=nextSub;
 for(const s of ["new","discounts","coupons","campaigns"]){
   const el=$("off-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-off-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.offSub===nextSub);
 });
 void refreshOffersSection(nextSub);
}
function selectShiftSub(nextSub){
 if(["attendance","workhours","evaluation"].includes(nextSub)){window.location.assign("./staff-workflows.html?topic="+nextSub+"&section=shift");return;}

 if(!["shifts","attendance","workhours","evaluation"].includes(nextSub))nextSub="shifts";
 shiftSub=nextSub;
 for(const s of ["shifts","attendance","workhours","evaluation"]){
   const el=$("shift-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-shift-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.shiftSub===nextSub);
 });
 renderShiftStaffSubsections();
}
function selectLabelsSub(nextSub){
 if(window.RETAIL_DEMO_MODE!==true){window.location.assign(nextSub==="batch"?"./workspace.html?view=prices&section=labels&batch=1":nextSub==="template"?"./diagnostics.html?section=labels":"./workspace.html?section=labels&view="+(nextSub==="barcode"?"barcodes":"prices"));return;}

 if(!["price","barcode","batch","template"].includes(nextSub))nextSub="price";
 labelsSub=nextSub;
 for(const s of ["price","barcode","batch","template"]){
   const el=$("labels-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-labels-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.labelsSub===nextSub);
 });
 renderLabelsWorkspace();
}
function selectAuditSub(nextSub){
 if(["alerts","approvals","qa"].includes(nextSub)){window.location.assign(nextSub==="qa"?"./qa.html":"./staff-workflows.html?topic="+nextSub+"&section=audit");return;}

 if(!["alerts","approvals","changes","qa"].includes(nextSub))nextSub="changes";
 auditSub=nextSub;
 for(const s of ["alerts","approvals","changes","qa"]){
   const el=$("audit-sub-"+s);
   if(el)el.hidden=s!==nextSub;
 }
 document.querySelectorAll("[data-audit-sub]").forEach(btn=>{
   btn.classList.toggle("active",btn.dataset.auditSub===nextSub);
 });
 renderAuditSubsections();
}
function selectTab(next){
 if(next!=="cash")clearTimeout(scanIdleTimer);
 if(next==="staff"&&role!=="owner")next="cash";
 if(["stock","suppliers","finance","reports","audit"].includes(next)&&!canManage())next="cash";
 tab=next;
 if(next!=="shift"){++shiftHistoryToken;shiftHistoryLoading=false;}
 if(next!=="payments"){++paymentToken;paymentLoading=false;paymentVerified=false;clearTimeout(paymentTimer);}
 if(next!=="audit"){++auditListToken;auditLoading=false;clearTimeout(auditQueryTimer);}
 if(next!=="returns"){++returnListToken;++returnLookupToken;++returnDetailToken;returnLoading=false;}
 for(const x of ["cash","stock","customers","suppliers","finance","reports","staff","offers","labels","audit","receipts","shift","payments","returns"]){
   const panel=$(x+"-panel");
   if(panel)panel.hidden=x!==next;
 }
 document.querySelectorAll("[data-tab]").forEach(x=>{
   x.classList.toggle("active",x.dataset.tab===next);
   x.hidden=(x.dataset.tab==="staff"&&role!=="owner") ||
      (["stock","suppliers","finance","reports","audit"].includes(x.dataset.tab)&&!canManage());
 });
 window.RetailSystemShell?.select(next);
 if(next==="cash"){populateCustomerSelectors();renderCart();renderParkedBar();renderLastSaleBar();syncPending();focusScanner();}
 if(next==="stock"){selectStockSub(stockSub);}
 if(next==="customers"){selectCustomerSub(custSub);}
 if(next==="suppliers"){selectSupplierSub(supSub);}
 if(next==="finance"){selectFinanceSub(finSub);}
 if(next==="reports"){selectReportsSub(repSub);}
 if(next==="staff"){selectSettingsSub(setSub);}
 if(next==="offers"){selectOffersSub(offSub);}
 if(next==="labels"){selectLabelsSub(labelsSub);}
 if(next==="audit"){selectAuditSub(auditSub);void refreshAudit();}
 if(next==="receipts")void refreshReceipts();
 if(next==="shift"){selectShiftSub(shiftSub);void refreshShift();}
 if(next==="payments")void refreshPayments();
 if(next==="returns")void refreshReturns();
}
function renderTable(target,headers,data){
 const x=$(target);if(!x)return;x.replaceChildren();
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
       const newUnits=resolved.is_scale?Number((Number(resolved.scale_grams)/1000).toFixed(3)):Number(resolved.units_per_scan);
       // Do not alter the price or quantity of a basket item behind the cashier's back.
       if(Number(resolved.price_minor)!==line.price||newUnits!==line.units)line.outdated=true;
       line.available=balances.get(line.id)||0;
     }else line.outdated=true;
   }
   if(tab==="stock")renderStock();else if(tab==="cash")renderCart();
   return;
 }
 if(!["PGRST202","42883"].includes(v18.error?.code))throw v18.error;
 const pres=await db.from("retail_products")
   .select("id,name,price_minor,currency,active,base_unit,sku,plu")
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
 cart=cart.map(x=>{
   const p=products.find(p=>p.id===x.id);
   const scan=barcodes.find(b=>b.code===x.barcode&&b.active!==false);
   if(!p||!scan||scan.unit_type!==x.mode)return {...x,outdated:true};
   const serverPrice=Number(scan.price_minor??p.price_minor);
   const serverUnits=Number(scan.units_per_scan);
   return {...x,name:p.name,outdated:Boolean(x.outdated||serverPrice!==x.price||serverUnits!==x.units),
     available:balances.get(x.id)||0};
 });
 if(tab==="stock")renderStock();else if(tab==="cash")renderCart();
}
function updateStockUnits(){
 const product=$("stock-product").value;
 const isKg=products.find(p=>p.id===product)?.base_unit==="kg";
 if(isKg)$("stock-mode").value="unit";
 const mode=$("stock-mode").value;
 $("stock-quantity").step=isKg?"0.001":"1";$("stock-quantity").min=isKg?"0.001":"1";
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
 const isKg=products.find(p=>p.id===product)?.base_unit==="kg";
 const unit=barcodes.find(b=>b.product_id===product&&b.code===$("stock-barcode").value);
 const qty=Number($("stock-quantity").value);
 let amount=qty*Number(unit?.units_per_scan||0);
 let valid=isKg?(mode==="unit"&&Number.isFinite(qty)&&qty>=0.001&&qty<=1000000&&Math.abs(qty*1000-Math.round(qty*1000))<0.000001):
   (Number.isSafeInteger(qty)&&qty>=1&&qty<=1000000&&Number.isSafeInteger(amount)&&amount>0);
 if(mode==="both"){
   const pack=barcodes.find(b=>b.product_id===product&&b.code===$("stock-mixed-carton").value&&b.unit_type==="carton");
   const count=Number($("stock-mixed-qty").value);
   const cartonBase=count*Number(pack?.units_per_scan||0);
   valid=valid&&unit?.unit_type==="unit"&&Number(unit.units_per_scan)===1&&
     Number.isSafeInteger(count)&&count>=1&&Number.isSafeInteger(cartonBase)&&cartonBase>0;
   amount+=cartonBase;
 }
 $("stock-base-total").value=valid&&Number.isFinite(amount)&&amount<=1000000?String(Number(amount.toFixed(3))):"";
}
function exportOperationsCsv(filename,headers,rows){
 const esc=v=>{
   let s=String(v??"");
   if(typeof v!=="number"&&(/^[\s]*[=+\-@]/.test(s)||/^[\t\r\n]/.test(s)))s="'"+s;
   return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
 };
 const lines=[headers.map(esc).join(","),...rows.map(r=>r.map(esc).join(","))];
 const csv="\uFEFF"+lines.join("\r\n");
 if(window.__retailPreview&&typeof window.__previewDownload==="function"){window.__previewDownload(filename,csv);return;}
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;a.download=filename;
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function populateStockSelectors(listSource){
 const list=(listSource&&listSource.length?listSource:products).filter(p=>p&&p.active!==false);
 for(const id of ["stock-adjust-product","expiry-product","move-entry-product","po-product","rec-product"]){
   const sel=$(id);
   if(!sel)continue;
   const old=sel.value;
   sel.replaceChildren();
   for(const p of list){
     const opt=document.createElement("option");
     opt.value=p.id;
     const qty=Number(balances.get(p.id)||0);
     const unitLabel=p.base_unit==="kg"?"کگم":"دانە";
     opt.textContent=p.name+" ("+qty.toLocaleString("en-US",{maximumFractionDigits:3})+" "+unitLabel+")";
     sel.append(opt);
   }
   if([...sel.options].some(o=>o.value===old))sel.value=old;
 }
}
function updateStockKpiMetrics(pageProducts){
 const allActive=products.filter(p=>p.active!==false);
 const source=allActive.length?allActive:pageProducts;
 const threshold=Math.max(1,Number($("low-threshold-input")?.value||localStorage.getItem("retail_low_threshold")||5));
 let totalValue=0,lowCount=0,outCount=0;
 for(const p of source){
   const qty=Number(balances.get(p.id)||0);
   const price=Number(p.price_minor||0);
   if(qty>0&&price>0)totalValue+=Math.round(qty*price);
   if(qty<=0)outCount++;
   else if(qty<=threshold)lowCount++;
 }
 if($("stock-kpi-products"))$("stock-kpi-products").textContent=Number(stockTotal||source.length).toLocaleString("en-US");
 if($("stock-kpi-value"))$("stock-kpi-value").textContent=money(totalValue);
 if($("stock-kpi-low"))$("stock-kpi-low").textContent=lowCount.toLocaleString("en-US");
 if($("stock-kpi-out"))$("stock-kpi-out").textContent=outCount.toLocaleString("en-US");
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
 populateStockSelectors(pageProducts);
 updateStockKpiMetrics(pageProducts);
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
     const display=p.base_unit==="kg"?units.toLocaleString("en-US",{minimumFractionDigits:3,maximumFractionDigits:3})+" کیلۆگرام"+statusBadge:(perPack>=2?
       units.toLocaleString("en-US")+" دانە ("+whole.toLocaleString("en-US")+
       " کارتۆن + "+loose.toLocaleString("en-US")+" دانە)":
       units.toLocaleString("en-US")+" دانە")+statusBadge;
     const tr=document.createElement("tr");
     const tdName=document.createElement("td");tdName.textContent=p.name;
     const tdStock=document.createElement("td");tdStock.textContent=display;
     if(units<=0){tdStock.style.color="#dc2626";tdStock.style.fontWeight="bold";}
     else if(units<=5){tdStock.style.color="#d97706";tdStock.style.fontWeight="bold";}
     const tdAction=document.createElement("td");
     const pickBtn=document.createElement("button");
     pickBtn.type="button";pickBtn.className="stock-pick-btn";pickBtn.dataset.pickStock=p.id;pickBtn.textContent="هاتن";
     const adjustBtn=document.createElement("button");
     adjustBtn.type="button";adjustBtn.className="stock-action-btn";adjustBtn.dataset.adjustStock=p.id;adjustBtn.textContent="جەرد";
     const expiryBtn=document.createElement("button");
     expiryBtn.type="button";expiryBtn.className="stock-action-btn";expiryBtn.dataset.expiryStock=p.id;expiryBtn.textContent="بەسەرچوون";
     tdAction.append(pickBtn,adjustBtn,expiryBtn);
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
function localExpiriesKey(){return store?"retail_stock_expiries_"+store.id:null;}
function localMovementsKey(){return store?"retail_local_stock_movements_"+store.id:null;}
function loadLocalExpiries(){
 const k=localExpiriesKey();if(!k)return [];
 try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[];}catch(_e){return [];}
}
function saveLocalExpiries(list){
 const k=localExpiriesKey();if(!k)return;
 try{localStorage.setItem(k,JSON.stringify(list));}catch(_e){}
}
function loadLocalMovements(){
 const k=localMovementsKey();if(!k)return [];
 try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[];}catch(_e){return [];}
}
function appendLocalMovement(entry){
 const k=localMovementsKey();if(!k)return;
 try{
   const cur=loadLocalMovements();
   cur.unshift(entry);
   if(cur.length>300)cur.length=300;
   localStorage.setItem(k,JSON.stringify(cur));
 }catch(_e){}
}
async function performStockAdjustment({productId,mode,qty,reason,note,targetMsgId="stock-msg"}){
 if(!db||!store||!canManage()||busy)return false;
 const p=products.find(x=>x.id===productId);
 if(!p){msg(targetMsgId,"کاڵاکە نەدۆزرایەوە","error");return false;}
 const isKg=p.base_unit==="kg";
 const numQty=Number(qty);
 if(!Number.isFinite(numQty)||numQty<0||numQty>1000000||(!isKg&&!Number.isSafeInteger(numQty))){
   msg(targetMsgId,isKg?"بڕی کیلۆگرام نادروستە":"بڕی دانە دەبێت ژمارەی تەواو بێت","error");
   return false;
 }
 if((mode==="delta_in"||mode==="delta_out")&&numQty<=0){
   msg(targetMsgId,"بڕی گۆڕانکاری دەبێت لە سفر گەورەتر بێت","error");
   return false;
 }
 const oldQty=Number(balances.get(productId)||0);
 if(mode==="delta_out"&&oldQty<numQty){
   msg(targetMsgId,"بڕی کۆگا بەش ناکات بۆ ئەم کەمکردنەوەیە","error");
   return false;
 }
 const reqId=crypto.randomUUID();
 lock(true);msg(targetMsgId,"");
 try{
   const res=await db.rpc("retail_adjust_stock_v19",{
     p_store:store.id,
     p_product:productId,
     p_mode:mode,
     p_quantity:Number(numQty.toFixed(3)),
     p_reason:reason||"inventory_count",
     p_note:note||null,
     p_request:reqId
   });
   if(res.error){
     if(["PGRST202","42883"].includes(res.error.code)){
       const delta=mode==="set_exact"?Number((numQty-oldQty).toFixed(3)):mode==="delta_in"?numQty:-numQty;
       const newQty=Number((oldQty+delta).toFixed(3));
       if(delta>0&&(reason==="purchase"||reason==="opening")){
         const unitBar=barcodes.find(b=>b.product_id===productId&&b.unit_type==="unit"&&b.active!==false);
         if(unitBar){
           if(isKg){
             const rKg=await db.rpc("retail_receive_weight_v19",{p_store:store.id,p_barcode:unitBar.code,p_kg:delta,p_reason:reason,p_request:reqId});
             if(rKg.error)throw rKg.error;
           }else if(Number.isSafeInteger(delta)){
             const rPk=await db.rpc("retail_receive_packs_v17",{p_store:store.id,p_barcode:unitBar.code,p_packages:delta,p_expected_units:1,p_reason:reason,p_request:reqId});
             if(rPk.error)throw rPk.error;
           }
         }
       }
       balances.set(productId,newQty);
       appendLocalMovement({
         id:reqId,product_id:productId,product_name:p.name,delta,reason:reason||"inventory_count",
         note:note||"",created_at:new Date().toISOString(),actor_id:user?.id||""
       });
     }else{
       throw res.error;
     }
   }else{
     const newQty=Number(res.data?.quantity??(mode==="set_exact"?numQty:mode==="delta_in"?oldQty+numQty:oldQty-numQty));
     const delta=Number(res.data?.delta??(newQty-oldQty));
     balances.set(productId,newQty);
     appendLocalMovement({
       id:reqId,product_id:productId,product_name:p.name,delta,reason:reason||"inventory_count",
       note:note||"",created_at:new Date().toISOString(),actor_id:user?.id||""
     });
   }
   await loadInventory();
   msg(targetMsgId,"بڕی کۆگای «"+p.name+"» بە سەرکەوتوویی نوێکرایەوە","success");
   return true;
 }catch(err){
   msg(targetMsgId,safe(err),"error");
   return false;
 }finally{
   lock(false);
 }
}
function renderOpsCatalogList(){
  const root=$("ops-catalog-list");
  if(!root)return;
  root.replaceChildren();
  const query=($("ops-catalog-search")?.value||"").trim().toLowerCase();
  const filter=$("ops-catalog-filter")?.value||"all";
  const filtered=products.filter(p=>{
    if(filter==="unit"&&p.base_unit==="kg")return false;
    if(filter==="kg"&&p.base_unit!=="kg")return false;
    if(!query)return true;
    const bCodes=barcodes.filter(b=>b.product_id===p.id).map(b=>b.code).join(" ");
    return (p.name+" "+(p.sku||"")+" "+(p.plu||"")+" "+bCodes).toLowerCase().includes(query);
  });
  if(!filtered.length){
    const blank=document.createElement("div");blank.className="blank";blank.textContent="هیچ کاڵایەک نەدۆزرایەوە";root.append(blank);return;
  }
  const table=document.createElement("table");table.className="table";
  table.innerHTML="<thead><tr><th>ناوی کاڵا</th><th>بارکۆد</th><th>نرخ</th><th>یەکە</th><th>بڕی کۆگا</th><th>کردارەکان</th></tr></thead><tbody></tbody>";
  for(const p of filtered){
    const tr=document.createElement("tr");
    const stockQty=Number(balances.get(p.id)||0);
    const isKg=p.base_unit==="kg";
    const unitLabel=isKg?"کیلۆگرام":"دانە";
    const prodBarcodes=barcodes.filter(b=>b.product_id===p.id&&b.active!==false).map(b=>b.code);
    const barcodeStr=prodBarcodes.join("، ")||(p.sku||p.plu||"—");
    const tdName=document.createElement("td");tdName.style.fontWeight="800";tdName.textContent=p.name;
    const tdBarcode=document.createElement("td");tdBarcode.dir="ltr";tdBarcode.textContent=barcodeStr;
    const tdPrice=document.createElement("td");tdPrice.style.fontWeight="850";tdPrice.textContent=money(p.price_minor);
    const tdUnit=document.createElement("td");tdUnit.textContent=unitLabel;
    const tdStock=document.createElement("td");
    tdStock.textContent=(isKg?stockQty.toFixed(3):stockQty.toLocaleString("en-US"))+" "+unitLabel;
    tdStock.style.color=stockQty<=0?"#dc2626":stockQty<=5?"#d97706":"#166534";
    tdStock.style.fontWeight="850";
    const tdActions=document.createElement("td");
    const wrap=document.createElement("div");wrap.style.display="flex";wrap.style.gap="6px";wrap.style.alignItems="center";
    const editBtn=document.createElement("button");editBtn.type="button";editBtn.className="stock-action-btn";editBtn.textContent="دەستکاری";
    editBtn.addEventListener("click",()=>{
      if($("ops-catalog-form-box"))$("ops-catalog-form-box").hidden=false;
      $("ops-cat-id").value=p.id;
      $("ops-cat-name").value=p.name;
      $("ops-cat-barcode").value=prodBarcodes[0]||"";
      $("ops-cat-price").value=String(p.price_minor);
      $("ops-cat-unit").value=p.base_unit==="kg"?"kg":"unit";
      $("ops-cat-plu").value=p.plu||"";
      $("ops-catalog-form-title").textContent="دەستکاریکردنی: "+p.name;
      $("ops-cat-name")?.focus();
    });
    const fillBtn=document.createElement("button");fillBtn.type="button";fillBtn.className="stock-action-btn";fillBtn.textContent="+ کۆگا";
    fillBtn.addEventListener("click",()=>{
      selectStockSub("status");
      const sel=$("stock-product");
      if(sel&&[...sel.options].some(o=>o.value===p.id)){
        sel.value=p.id;updateStockUnits();$("stock-quantity")?.focus();
      }
    });
    const labelBtn=document.createElement("button");labelBtn.type="button";labelBtn.className="stock-action-btn";labelBtn.textContent="🏷 لەیبڵ";
    labelBtn.title="چاپی لەیبڵی ڕەفەی کاڵا (40x25mm / 50x30mm)";
    labelBtn.addEventListener("click",()=>{
      openOpsShelfLabel({
        name: p.name,
        code: prodBarcodes[0]||p.sku||p.plu||"000000",
        priceMinor: p.price_minor,
        unitLabel: unitLabel
      });
    });
    wrap.append(editBtn,fillBtn,labelBtn);
    tdActions.append(wrap);
    tr.append(tdName,tdBarcode,tdPrice,tdUnit,tdStock,tdActions);
    table.tBodies[0].append(tr);
  }
  root.append(table);
}
async function saveOpsCatalogProduct(e){
  e?.preventDefault();
  if(!db||!store||busy)return;
  // V21: only atomic, owner-authorized catalog RPCs may mutate products.
  // A raw products.update followed by barcodes.insert can partially save an item.
  if(role!=="owner"){
    msg("ops-cat-msg","تەنها خاوەنی فرۆشگا دەتوانێت کاڵا تۆمار یان دەستکاری بکات","error");return;
  }
  const pId=String($("ops-cat-id")?.value||"").trim();
  const name=String($("ops-cat-name")?.value||"").trim();
  const code=String($("ops-cat-barcode")?.value||"").trim();
  const enteredPrice=String($("ops-cat-price")?.value||"").trim();
  const priceMinor=Number(enteredPrice);
  const baseUnit=$("ops-cat-unit")?.value==="kg"?"kg":"unit";
  const plu=String($("ops-cat-plu")?.value||"").trim()||null;
  if(!name||name.length>160||!code||code.length>60||/[\s,،;]/u.test(code)
    ||!Number.isSafeInteger(priceMinor)||priceMinor<1||priceMinor>999999999
    ||(plu&&plu.length>30)){
    msg("ops-cat-msg","ناوی کاڵا، بارکۆد و نرخی فرۆشتن بە دروستی بنووسە","error");return;
  }
  if(!pId&&baseUnit==="kg"){
    msg("ops-cat-msg","بۆ کاڵای کیلۆیی: لە بەشی کاڵاکان تۆمار بکە و یەکە بە ڕێگای پارێزراوی کۆگا بگۆڕە؛ ئەم فۆرمە گۆڕینی دوو قۆناغی ناپارێزراو ناکات","error");
    return;
  }
  lock(true);msg("ops-cat-msg","");
  try{
    let catalog;
    let result;
    if(pId){
      const snapshot=await db.rpc("retail_product_snapshot_v19",{
        p_store_id:store.id,p_product_id:pId
      });
      if(snapshot.error)throw snapshot.error;
      const original=snapshot.data;
      if(!original||!Number.isSafeInteger(Number(original.version)))
        throw new Error("زانیاری و وەشانی کاڵا نەدۆزرایەوە");
      if(original.base_unit!==baseUnit)
        throw new Error("گۆڕینی یەکە لە فۆرمی کۆگا و بە پشکنینی بڕی کۆگا ئەنجام بدە");
      if(!["unit","both"].includes(original.sale_mode))
        throw new Error("بۆ کاڵای تەنها کارتۆن فۆرمی تەواوی کاڵاکان بەکاربهێنە");
      // Preserve all unit aliases, carton aliases, carton prices and costs.
      // The modal edits only name, primary unit barcode, PLU and unit IQD price.
      catalog={
        name,sku:original.sku??null,plu,
        sale_mode:original.sale_mode,currency:"IQD",
        unit_barcode:code,
        unit_alias_barcodes:original.unit_alias_barcodes||[],
        unit_sale_price_iqd:priceMinor,
        unit_purchase_price_iqd:original.unit_purchase_price_iqd??null,
        carton:original.carton??null
      };
      result=await db.rpc("retail_update_product_v15",{
        p_store_id:store.id,p_product_id:pId,
        p_expected_version:Number(original.version),p_catalog:catalog
      });
    }else{
      catalog={
        name,sku:null,plu,sale_mode:"unit",currency:"IQD",
        unit_barcode:code,unit_alias_barcodes:[],
        unit_sale_price_iqd:priceMinor,
        unit_purchase_price_iqd:null,carton:null
      };
      result=await db.rpc("retail_register_product_v14",{
        p_store_id:store.id,p_catalog:catalog
      });
    }
    if(result.error)throw result.error;
    await loadInventory();
    populateStockSelectors();
    renderOpsCatalogList();
    if($("ops-catalog-form-box"))$("ops-catalog-form-box").hidden=true;
    msg("stock-msg",pId?"کاڵاکە بە شێوەیەکی پارێزراو نوێکرایەوە":"کاڵاکە بە شێوەیەکی پارێزراو تۆمارکرا","success");
  }catch(err){
    msg("ops-cat-msg",err?.code==="40001"?
      "کاڵاکە لەلایەن بەکارهێنەرێکی تر نوێکراوەتەوە؛ دووبارە بیکەرەوە":safe(err),"error");
  }finally{
    lock(false);
  }
}
async function refreshLowStockView(){
 if(!db||!store)return;
 msg("low-stock-msg","");
 try{
   const v18=await db.rpc("retail_catalog_page_v18",{p_store:store.id,p_search:"",p_offset:0,p_limit:100,p_stock_filter:"low"});
   if(!v18.error&&Array.isArray(v18.data?.items)){
     for(const item of v18.data.items){
       if(item.active!==false)upsertHotProduct(item,item.barcode_details||[],item.stock_quantity);
     }
   }
 }catch(_e){}
 renderLowStockView();
}
function renderLowStockView(){
 const root=$("low-stock-list");
 if(!root)return;
 root.replaceChildren();
 const threshold=Math.max(1,Number($("low-threshold-input")?.value||localStorage.getItem("retail_low_threshold")||5));
 const targetLevel=Math.max(threshold+1,Number($("low-target-input")?.value||localStorage.getItem("retail_low_target")||25));
 const levelFilter=String($("low-level-filter")?.value||"all_low");
 const q=String($("low-search")?.value||"").trim().toLocaleLowerCase();
 const allActive=products.filter(p=>p.active!==false);
 const lowAll=allActive.filter(p=>Number(balances.get(p.id)||0)<=threshold);
 const outCount=lowAll.filter(p=>Number(balances.get(p.id)||0)<=0).length;
 const critCount=lowAll.filter(p=>{const v=Number(balances.get(p.id)||0);return v>0&&v<=2;}).length;
 const warnCount=lowAll.filter(p=>{const v=Number(balances.get(p.id)||0);return v>2&&v<=threshold;}).length;
 let reorderValue=0;
 for(const p of lowAll){
   const cur=Math.max(0,Number(balances.get(p.id)||0));
   const needed=Math.max(0,targetLevel-cur);
   reorderValue+=Math.round(needed*Number(p.price_minor||0));
 }
 if($("low-kpi-out"))$("low-kpi-out").textContent=outCount.toLocaleString("en-US");
 if($("low-kpi-critical"))$("low-kpi-critical").textContent=critCount.toLocaleString("en-US");
 if($("low-kpi-warning"))$("low-kpi-warning").textContent=warnCount.toLocaleString("en-US");
 if($("low-kpi-reorder-value"))$("low-kpi-reorder-value").textContent=money(reorderValue);
 const filtered=lowAll.filter(p=>{
   const qty=Number(balances.get(p.id)||0);
   if(levelFilter==="out_only"&&qty>0)return false;
   if(levelFilter==="critical_only"&&qty>2)return false;
   if(!q)return true;
   const codes=barcodes.filter(b=>b.product_id===p.id&&b.active!==false).map(b=>b.code).join(" ");
   return (p.name+" "+(p.sku||"")+" "+(p.plu||"")+" "+codes).toLocaleLowerCase().includes(q);
 }).sort((a,b)=>Number(balances.get(a.id)||0)-Number(balances.get(b.id)||0));
 lowStockItemsCache=filtered;
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ کاڵایەکی کەمبوو یان تەواوبوو لەم پاڵاوتنەدا نییە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کاڵا</th><th>بارکۆد / کۆد</th><th>بڕی ئێستای کۆگا</th><th>پێشنیاری داواکاری</th><th>دۆخی پەلەیی</th><th>پڕکردنەوەی خێرا</th></tr></thead><tbody></tbody>";
 for(const p of filtered){
   const tr=document.createElement("tr");
   const qty=Number(balances.get(p.id)||0);
   const isKg=p.base_unit==="kg";
   const unitLabel=isKg?"کیلۆگرام":"دانە";
   const primaryCode=barcodes.find(b=>b.product_id===p.id&&b.unit_type==="unit"&&b.active!==false)?.code||p.sku||p.plu||"—";
   const suggested=Math.max(1,Number((targetLevel-Math.max(0,qty)).toFixed(isKg?3:0)));
   const tdName=document.createElement("td");tdName.style.fontWeight="800";tdName.textContent=p.name;
   const tdCode=document.createElement("td");tdCode.dir="ltr";tdCode.textContent=primaryCode;
   const tdStock=document.createElement("td");
   tdStock.textContent=(isKg?qty.toFixed(3):qty.toLocaleString("en-US"))+" "+unitLabel;
   tdStock.style.fontWeight="850";
   tdStock.style.color=qty<=0?"#dc2626":"#d97706";
   const tdSuggest=document.createElement("td");
   tdSuggest.textContent="+"+suggested.toLocaleString("en-US")+" "+unitLabel+" ("+money(Math.round(suggested*Number(p.price_minor||0)))+")";
   const tdStatus=document.createElement("td");
   const badge=document.createElement("span");
   badge.className="stock-badge "+(qty<=0?"danger":qty<=2?"warn":"info");
   badge.textContent=qty<=0?"تەواوبوو (0)":qty<=2?"زۆر کەم (فوری)":"کەمبووە";
   tdStatus.append(badge);
   const tdAct=document.createElement("td");
   const wrap=document.createElement("div");
   wrap.style.display="flex";wrap.style.gap="6px";wrap.style.alignItems="center";wrap.style.flexWrap="wrap";
   const qtyIn=document.createElement("input");
   qtyIn.type="number";qtyIn.min=isKg?"0.001":"1";qtyIn.step=isKg?"0.001":"1";
   qtyIn.value=String(suggested);
   qtyIn.style.width="78px";qtyIn.style.height="31px";qtyIn.style.padding="4px 6px";
   qtyIn.style.border="1px solid #cbd7e5";qtyIn.style.borderRadius="7px";qtyIn.style.direction="ltr";qtyIn.style.textAlign="center";
   const quickBtn=document.createElement("button");
   quickBtn.type="button";quickBtn.className="stock-action-btn";
   quickBtn.textContent="+ پڕکردنەوە";
   quickBtn.addEventListener("click",async()=>{
     if(busy)return;
     const addVal=Number(qtyIn.value||0);
     const ok=await performStockAdjustment({
       productId:p.id,mode:"delta_in",qty:addVal,reason:"purchase",
       note:"پڕکردنەوەی خێرا لە لیستی کاڵای کەم",targetMsgId:"low-stock-msg"
     });
     if(ok)renderLowStockView();
   });
   const openFormBtn=document.createElement("button");
   openFormBtn.type="button";openFormBtn.className="stock-action-btn";
   openFormBtn.textContent="فۆرمی هاتن";
   openFormBtn.addEventListener("click",()=>{
     selectStockSub("status");
     const sel=$("stock-product");
     if(sel&&[...sel.options].some(o=>o.value===p.id)){
       sel.value=p.id;updateStockUnits();$("stock-quantity")?.focus();
     }
   });
   wrap.append(qtyIn,quickBtn,openFormBtn);
   tdAct.append(wrap);
   tr.append(tdName,tdCode,tdStock,tdSuggest,tdStatus,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function computeDaysUntilExpiry(dateStr){
 if(!dateStr)return 9999;
 const parts=String(dateStr).split("-").map(Number);
 if(parts.length!==3||parts.some(isNaN))return 9999;
 const exp=new Date(parts[0],parts[1]-1,parts[2]);
 const now=new Date();
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 return Math.round((exp.getTime()-today.getTime())/86400000);
}
async function refreshExpiryView(){
 if(!db||!store)return;
 msg("expiry-msg","");
 populateStockSelectors();
 if($("expiry-date")&&!$("expiry-date").value){
   const d=new Date(Date.now()+30*86400000);
   $("expiry-date").value=d.toISOString().slice(0,10);
 }
 const localList=loadLocalExpiries();
 let remoteList=[];
 try{
   const {data,error}=await db.from("retail_stock_expiries")
     .select("id,product_id,batch_no,quantity,expiry_date,note,status,created_at")
     .eq("store_id",store.id)
     .order("expiry_date",{ascending:true}).limit(300);
   if(!error&&Array.isArray(data))remoteList=data;
 }catch(_e){}
 const mergedMap=new Map();
 for(const item of localList)if(item&&item.id)mergedMap.set(item.id,item);
 for(const item of remoteList)if(item&&item.id)mergedMap.set(item.id,item);
 stockExpiries=[...mergedMap.values()].sort((a,b)=>String(a.expiry_date||"").localeCompare(String(b.expiry_date||"")));
 saveLocalExpiries(stockExpiries);
 renderExpiryView();
}
function renderExpiryView(){
 const root=$("expiry-list");
 if(!root)return;
 root.replaceChildren();
 const activeBatches=stockExpiries.filter(x=>x.status!=="written_off");
 let expiredCount=0,d7Count=0,d30Count=0,safeCount=0;
 for(const b of activeBatches){
   const days=computeDaysUntilExpiry(b.expiry_date);
   if(days<0)expiredCount++;
   else if(days<=7)d7Count++;
   else if(days<=30)d30Count++;
   else safeCount++;
 }
 if($("expiry-kpi-expired"))$("expiry-kpi-expired").textContent=expiredCount.toLocaleString("en-US");
 if($("expiry-kpi-7d"))$("expiry-kpi-7d").textContent=d7Count.toLocaleString("en-US");
 if($("expiry-kpi-30d"))$("expiry-kpi-30d").textContent=d30Count.toLocaleString("en-US");
 if($("expiry-kpi-safe"))$("expiry-kpi-safe").textContent=safeCount.toLocaleString("en-US");
 const statusFilter=String($("expiry-status-filter")?.value||"all");
 const q=String($("expiry-search")?.value||"").trim().toLocaleLowerCase();
 const filtered=stockExpiries.filter(b=>{
   const isWrittenOff=b.status==="written_off";
   if(statusFilter==="written_off"){if(!isWrittenOff)return false;}
   else{
     if(isWrittenOff)return false;
     const days=computeDaysUntilExpiry(b.expiry_date);
     if(statusFilter==="expired"&&days>=0)return false;
     if(statusFilter==="7d"&&(days<0||days>7))return false;
     if(statusFilter==="30d"&&(days<0||days>30))return false;
     if(statusFilter==="safe"&&days<=30)return false;
   }
   if(!q)return true;
   const p=products.find(x=>x.id===b.product_id);
   const text=((p?.name||b.product_name||"")+" "+(b.batch_no||"")+" "+(b.note||"")+" "+(b.expiry_date||"")).toLocaleLowerCase();
   return text.includes(q);
 });
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ وەجبەیەکی بەسەرچوون لەم پاڵاوتنەدا تۆمار نەکراوە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کاڵا</th><th>ژمارەی وەجبە</th><th>بڕی وەجبە</th><th>بەرواری بەسەرچوون</th><th>ماوەی ماوە / دۆخ</th><th>تێبینی</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const b of filtered){
   const tr=document.createElement("tr");
   const p=products.find(x=>x.id===b.product_id);
   const isKg=p?.base_unit==="kg";
   const unitLabel=isKg?"کیلۆگرام":"دانە";
   const days=computeDaysUntilExpiry(b.expiry_date);
   const isWrittenOff=b.status==="written_off";
   let statusText="",badgeClass="ok";
   if(isWrittenOff){
     statusText="تەلەفکراو و لادراوە";badgeClass="info";
   }else if(days<0){
     statusText="بەسەرچووە ("+Math.abs(days)+" ڕۆژ پێش ئێستا)";badgeClass="danger";
   }else if(days===0){
     statusText="ئەمڕۆ بەسەردەچێت!";badgeClass="danger";
   }else if(days<=7){
     statusText=days+" ڕۆژ ماوە (مەترسیدار)";badgeClass="warn";
   }else if(days<=30){
     statusText=days+" ڕۆژ ماوە (نزیکە)";badgeClass="warn";
   }else{
     statusText=days+" ڕۆژ ماوە (سەلامەت)";badgeClass="ok";
   }
   const tdName=document.createElement("td");tdName.style.fontWeight="800";tdName.textContent=p?.name||b.product_name||"—";
   const tdBatch=document.createElement("td");tdBatch.dir="ltr";tdBatch.textContent=b.batch_no||"—";
   const tdQty=document.createElement("td");tdQty.textContent=Number(b.quantity||0).toLocaleString("en-US",{maximumFractionDigits:3})+" "+unitLabel;
   const tdDate=document.createElement("td");tdDate.dir="ltr";tdDate.style.fontWeight="800";tdDate.textContent=b.expiry_date||"—";
   const tdStatus=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+badgeClass;badge.textContent=statusText;
   tdStatus.append(badge);
   const tdNote=document.createElement("td");tdNote.textContent=b.note||"—";
   const tdAct=document.createElement("td");
   if(!isWrittenOff){
     const writeoffBtn=document.createElement("button");
     writeoffBtn.type="button";writeoffBtn.className="return-btn";
     writeoffBtn.dataset.writeoffExpiry=b.id;
     writeoffBtn.textContent="تەلەفکردن لە کۆگا";
     tdAct.append(writeoffBtn);
     const editBtn=document.createElement("button");
     editBtn.type="button";editBtn.className="stock-action-btn";
     editBtn.dataset.editExpiry=b.id;
     editBtn.textContent="دەستکاری";
     tdAct.append(editBtn);
   }
   const delBtn=document.createElement("button");
   delBtn.type="button";delBtn.className="stock-action-btn";
   delBtn.dataset.deleteExpiry=b.id;
   delBtn.textContent="سڕینەوە";
   tdAct.append(delBtn);
   tr.append(tdName,tdBatch,tdQty,tdDate,tdStatus,tdNote,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function movementReasonLabel(reason){
 const r=String(reason||"").toLowerCase();
 if(r==="purchase"||r==="stock.receive_packs_v17"||r==="stock.receive_mixed_v171"||r==="stock.receive_kg_v19")return {label:"هاتنی کاڵا (کڕین)",cls:"ok"};
 if(r==="opening")return {label:"باڵانسی سەرەتای کۆگا",cls:"ok"};
 if(r==="sale")return {label:"فرۆشتنی کاشێر",cls:"info"};
 if(r==="sale_return")return {label:"گەڕاوەی فرۆشتن",cls:"ok"};
 if(r==="damage_out")return {label:"تەلەف / شکاو",cls:"danger"};
 if(r==="expired_writeoff")return {label:"تەلەفی بەسەرچوون",cls:"danger"};
 if(r==="inventory_count"||r==="manual_adjustment"||r==="stock.adjust_v19")return {label:"جەرد و ڕێکخستنی کۆگا",cls:"warn"};
 return {label:reason||"جووڵەی کۆگا",cls:"info"};
}
function syncMovementPager(){
 if($("movements-prev"))$("movements-prev").disabled=busy||movementsLoading||!movementsReady||movementsOffset<=0;
 if($("movements-next"))$("movements-next").disabled=busy||movementsLoading||!movementsReady||movementsOffset+50>=movementsTotal;
 if($("movements-export-csv"))$("movements-export-csv").disabled=busy||!movementsReady||!filterStockMovements(stockMovementsLedger).length;
 if($("movements-page-info"))$("movements-page-info").textContent=movementsReady?(stockMovementsLedger.length?(movementsOffset+1)+"–"+(movementsOffset+stockMovementsLedger.length)+" / "+movementsTotal:"0 / "+movementsTotal):"—";
}
async function refreshStockMovementsView(reset=true){
 if(!db||!store||!user)return;
 clearTimeout(movementsTimer);
 const token=++movementsReadToken,storeId=store.id,actor=user.id;
 const current=()=>token===movementsReadToken&&store?.id===storeId&&user?.id===actor;
 movementsLoading=true;movementsReady=false;stockMovementsLedger=[];movementsTotal=0;renderStockMovementsView();syncMovementPager();
 msg("movements-read-scope","وەرگرتنی مێژووی کۆگا…");msg("movements-msg","");
 populateStockSelectors();
 try{
   if(reset||!movementsFilters){movementsOffset=0;movementsFilters=window.RetailStockMovementReads.criteria({barcode:$("movements-product-code")?.value||'',type:$("movements-type-filter")?.value||'all',period:$("movements-date-filter")?.value||'all'});}
   let page=await window.RetailStockMovementReads.read({db,store:storeId,filters:movementsFilters,offset:movementsOffset});
   if(!current())return;
   if(movementsOffset>0&&!page.rows.length&&page.total<=movementsOffset){
     movementsOffset=page.total?Math.floor((page.total-1)/50)*50:0;
     page=await window.RetailStockMovementReads.read({db,store:storeId,filters:movementsFilters,offset:movementsOffset});if(!current())return;
   }
   stockMovementsLedger=page.rows;movementsTotal=page.total;movementsReady=true;
   msg("movements-read-scope","مێژووی جووڵەی کۆگا — پوختە، گەڕانی دەق و CSV تەنها بۆ ئەم پەڕەیەن");
   renderStockMovementsView();
 }catch(err){
   if(!current())return;
   movementsReady=false;stockMovementsLedger=[];movementsTotal=0;movementsFilters=null;renderStockMovementsView();
   msg("movements-read-scope","مێژووی کۆگا پشتڕاست نەکراوەتەوە؛ نوێکردنەوە بکە","error");msg("movements-msg",safe(err),"error");
 }finally{if(current()){movementsLoading=false;syncMovementPager();}}
}
function invalidateMovementFilters(){
 clearTimeout(movementsTimer);++movementsReadToken;movementsLoading=true;movementsReady=false;stockMovementsLedger=[];movementsTotal=0;movementsFilters=null;renderStockMovementsView();syncMovementPager();
 movementsTimer=setTimeout(()=>{if(!busy)void refreshStockMovementsView();else{movementsLoading=false;syncMovementPager();}},200);
}
function filterStockMovements(rows){
 const q=String($("movements-search")?.value||"").trim().toLocaleLowerCase();
 return (rows||[]).filter(m=>{
   if(!q)return true;
   const p=m.product===undefined?products.find(x=>x.id===m.product_id):m.product;
   const codes=barcodes.filter(b=>b.product_id===m.product_id).map(b=>b.code).join(" ");
   const info=movementReasonLabel(m.reason).label;
   return ((p?.name||m.product_id||"")+" "+codes+" "+info+" "+(m.note||"")).toLocaleLowerCase().includes(q);
 });
}
function renderStockMovementsView(){
 const root=$("movements-list");
 if(!root)return;
 root.replaceChildren();
 const filtered=filterStockMovements(stockMovementsLedger);
 if($("movements-export-csv"))$("movements-export-csv").disabled=busy||!movementsReady||!filtered.length;
 if(!movementsReady){
   for(const id of ["move-kpi-count","move-kpi-in","move-kpi-out","move-kpi-net"])if($(id))$(id).textContent="—";
   return;
 }
 let sums;
 try{sums=window.RetailStockMovementReads.totals(filtered,products);}catch(err){
   movementsReady=false;stockMovementsLedger=[];renderStockMovementsView();msg("movements-read-scope",safe(err),"error");return;
 }
 const amount=key=>["unit","kg"].map(unit=>sums[unit][key].toLocaleString("en-US",{maximumFractionDigits:3})+" "+(unit==="kg"?"کگم":"دانە")).join(" / ")+(sums.unknown?" / نادیار: "+sums.unknown:"");
 if($("move-kpi-count"))$("move-kpi-count").textContent=filtered.length.toLocaleString("en-US");
 for(const [id,key] of [["move-kpi-in","in"],["move-kpi-out","out"],["move-kpi-net","net"]])if($(id))$(id).textContent=amount(key);
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ جووڵەیەکی کۆگا لەم پاڵاوتنەدا نییە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کات و بەروار</th><th>کاڵا</th><th>جۆری جووڵە</th><th>بڕی گۆڕانکاری</th><th>بڕی ئێستای کۆگا (بارکراو)</th><th>تێبینیی پەیوەست</th></tr></thead><tbody></tbody>";
 for(const m of filtered){
   const tr=document.createElement("tr");
   const p=m.product===undefined?products.find(x=>x.id===m.product_id):m.product;
   const isKg=p?.base_unit==="kg";
   const unitLabel=p?(isKg?"کگم":"دانە"):"یەکە نادیارە";
   const delta=Number(m.delta||0);
   const deltaText=(delta>0?"+":"")+delta.toLocaleString("en-US",{maximumFractionDigits:3})+" "+unitLabel;
   const curStock=Number(balances.get(m.product_id)||0);
   const curText=balances.has(m.product_id)?curStock.toLocaleString("en-US",{maximumFractionDigits:3})+" "+unitLabel:"—";
   const meta=movementReasonLabel(m.reason);
   const tdTime=document.createElement("td");tdTime.dir="ltr";tdTime.textContent=m.created_at?new Date(m.created_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}):"—";
   const tdProd=document.createElement("td");tdProd.style.fontWeight="800";tdProd.textContent=p?.name||m.product_id||"—";
   const tdKind=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+meta.cls;badge.textContent=meta.label;
   tdKind.append(badge);
   const tdDelta=document.createElement("td");
   tdDelta.dir="ltr";tdDelta.style.fontWeight="900";
   tdDelta.style.color=delta>0?"#15803d":delta<0?"#dc2626":"#172b45";
   tdDelta.textContent=deltaText;
   const tdCur=document.createElement("td");tdCur.textContent=curText;
   const tdNote=document.createElement("td");tdNote.textContent=m.note||"—";
   tr.append(tdTime,tdProd,tdKind,tdDelta,tdCur,tdNote);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function localCustomersKey(){return store?"retail_customers_v19_"+store.id:null;}
function localCustomerLedgerKey(){return store?"retail_customer_ledger_v19_"+store.id:null;}
function loadLocalCustomers(){
 const k=localCustomersKey();if(!k)return [];
 try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[];}catch(_e){return [];}
}
function saveLocalCustomers(list){
 const k=localCustomersKey();if(!k)return;
 try{localStorage.setItem(k,JSON.stringify(list));}catch(_e){}
}
function loadLocalCustomerLedger(){
 const k=localCustomerLedgerKey();if(!k)return [];
 try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[];}catch(_e){return [];}
}
function saveLocalCustomerLedger(list){
 const k=localCustomerLedgerKey();if(!k)return;
 try{localStorage.setItem(k,JSON.stringify(list));}catch(_e){}
}
function renderCustomerReadScope(){
 if(customersReady&&customersScope)msg("customers-read-scope","کڕیارە بارکراوەکان: "+customersList.length+" / "+customersScope.customerTotal+" — دوایین مامەڵە بارکراوەکان: "+customerLedgerList.length+" / "+customersScope.ledgerTotal);
}
function customerSelectionPending(target){return customerPickers.some(p=>p.target===target&&p.controller.state.selecting);}
function syncCustomerReads(){
 for(const id of ["debt-submit","hist-link-submit","cpay-submit"]){if($(id))$(id).disabled=busy||!customersReady||customerSelectionPending({"debt-submit":"debt-customer","hist-link-submit":"hist-link-customer","cpay-submit":"cpay-customer"}[id]);}
 for(const id of ["checkout-customer","debt-customer","hist-link-customer","cpay-customer","hist-customer-filter","cpay-customer-filter"])if($(id))$(id).disabled=busy||!customersReady||customerSelectionPending(id)||(id==="checkout-customer"&&!!pendingCheckout);
 for(const picker of customerPickers)picker.sync();
 syncCustomerHistoryPager();syncCustomerPaymentsPager();syncCustomerDirectoryPager();syncCustomerDebtPager();
}
function customerReadUnavailable(root){
 if(customersReady)return false;
 $(root)?.replaceChildren();
 const blank=document.createElement("div");blank.className="blank";blank.textContent="زانیاریی حیسابەکان پشتڕاست نەکراوەتەوە؛ نوێکردنەوە بکە";$(root)?.append(blank);
 for(const id of ["cust-kpi-total","cust-kpi-debtors","cust-kpi-total-debt","cust-kpi-over-limit","debt-kpi-total","debt-kpi-count","debt-kpi-overdue","debt-kpi-max","hist-kpi-count","hist-kpi-debit","hist-kpi-credit","hist-kpi-balance","cpay-kpi-total","cpay-kpi-today","cpay-kpi-count","cpay-kpi-remaining"])if($(id))$(id).textContent="—";
 syncCustomerReads();return true;
}
function clearCustomerViews(){
 for(const picker of customerPickers)picker.reset();
 clearCustomerHistoryPage();clearCustomerPaymentsPage();clearCustomerDirectoryPage();clearCustomerDebtPage();
 for(const id of ["customers-list","debts-list","customer-history-list","customer-payments-list"])customerReadUnavailable(id);
 for(const id of ["customer-statement-box","cpay-voucher-box"]){if($(id)){$(id).replaceChildren();$(id).hidden=true;}}
}
async function loadCustomersAndLedger(extraCustomerId=null){
 if(!store||!user||!db)return false;
 const token=++customersReadToken,storeId=store.id,actor=user.id;
 const selected=new Map(["checkout-customer","debt-customer","hist-link-customer","cpay-customer","hist-customer-filter","cpay-customer-filter"].map(id=>[id,$(id)?.value]));
 const current=()=>token===customersReadToken&&store?.id===storeId&&user?.id===actor;
 customersReady=false;customersScope=null;customersList=[];customerLedgerList=[];populateCustomerSelectors();clearCustomerViews();msg("customers-read-scope","وەرگرتنی حیسابەکان…");
 try{
  const result=await window.RetailCustomerAccounts.read({db,store:storeId});if(!current())return false;
  const pinned=[...new Set([extraCustomerId,...selected.values()].filter(id=>id&&id!=="all"&&!result.customers.some(c=>c.id===id)))];
  const added=await Promise.all(pinned.map(id=>window.RetailCustomerDirectory.one({db,store:storeId,id})));if(!current())return false;
  result.customers.push(...added);window.RetailCustomerDirectory.totals(result.customers);
  customersList=result.customers;customerLedgerList=result.ledger;customersScope=result;customersReady=true;
  renderCustomerReadScope();
  saveLocalCustomers(customersList);saveLocalCustomerLedger(customerLedgerList);populateCustomerSelectors();for(const [id,value] of selected){const el=$(id);if(el&&[...el.options].some(o=>o.value===value))el.value=value;}syncCustomerReads();return true;
 }catch(error){if(current()){customersReady=false;customersScope=null;customersList=[];customerLedgerList=[];populateCustomerSelectors();clearCustomerViews();msg("customers-read-scope",safe(error),"error");}return false;}
}
function populateCustomerSelectors(){
 const activeCusts=customersList.filter(c=>c&&c.active!==false);
 const checkoutSel=$("checkout-customer");
 if(checkoutSel){
   const prev=checkoutSel.value;
   checkoutSel.replaceChildren();
   const defOpt=document.createElement("option");
   defOpt.value="";defOpt.textContent="کڕیاری گشتی (نەقدی بێ ناو)";
   checkoutSel.append(defOpt);
   for(const c of activeCusts){
     const opt=document.createElement("option");
     opt.value=c.id;
     const bal=Number(c.balance_minor||0);
     opt.textContent=c.name+(c.phone?" ("+c.phone+")":"")+(bal>0?" — قەرز: "+money(bal):"");
     checkoutSel.append(opt);
   }
   if([...checkoutSel.options].some(o=>o.value===prev))checkoutSel.value=prev;
 }
 for(const id of ["debt-customer","hist-link-customer","cpay-customer"]){
   const sel=$(id);if(!sel)continue;
   const prev=sel.value;
   sel.replaceChildren();
   const list=id==="cpay-customer"?[...activeCusts].sort((a,b)=>Number(b.balance_minor||0)-Number(a.balance_minor||0)):activeCusts;
   for(const c of list){
     const opt=document.createElement("option");
     opt.value=c.id;
     const bal=Number(c.balance_minor||0);
     opt.textContent=c.name+(c.phone?" ("+c.phone+")":"")+" — قەرز: "+money(bal);
     sel.append(opt);
   }
   if([...sel.options].some(o=>o.value===prev))sel.value=prev;
 }
 for(const id of ["hist-customer-filter","cpay-customer-filter"]){
   const sel=$(id);if(!sel)continue;
   const prev=sel.value||"all";
   sel.replaceChildren();
   const allOpt=document.createElement("option");
   allOpt.value="all";allOpt.textContent="هەموو کڕیاران";
   sel.append(allOpt);
   for(const c of activeCusts){
     const opt=document.createElement("option");
     opt.value=c.id;
     opt.textContent=c.name+(Number(c.balance_minor||0)>0?" ("+money(c.balance_minor)+")":"");
     sel.append(opt);
   }
   if([...sel.options].some(o=>o.value===prev))sel.value=prev;
 }
}
function acceptSearchedCustomer(targetId,customer){
 const select=$(targetId);if(!select||customer.store_id!==store?.id||customer.active!==true)throw Error("کڕیارەکە بەردەست نییە");
 const next=customersList.filter(c=>c.id!==customer.id).concat(customer);window.RetailCustomerDirectory.totals(next);
 customersList=next;populateCustomerSelectors();
 if(![...select.options].some(o=>o.value===customer.id))throw Error("هەڵبژاردنی کڕیار سەرکەوتوو نەبوو");
 select.value=customer.id;
 if(targetId==="cpay-customer")$("cpay-amount").value=customer.balance_minor>0?String(customer.balance_minor):"";
 saveLocalCustomers(customersList);renderCustomerReadScope();
}
function mountCustomerPickers(){
 for(const host of document.querySelectorAll("[data-customer-picker]")){
  const target=host.dataset.customerPicker;
  const details=document.createElement("details");details.className="customer-picker";
  const summary=document.createElement("summary");summary.textContent="گەڕان بۆ کڕیار";details.append(summary);
  const form=document.createElement("div");form.className="formrow";
  const queryLabel=document.createElement("label");queryLabel.className="field";queryLabel.textContent="گەڕان لە هەموو کڕیاران";
  const query=document.createElement("input");query.id=target+"-search";query.maxLength=120;query.autocomplete="off";query.placeholder="ناو یان مۆبایل";queryLabel.append(query);
  const fieldLabel=document.createElement("label");fieldLabel.className="field";fieldLabel.textContent="خانەی گەڕان";
  const field=document.createElement("select");field.id=target+"-search-field";
  for(const [value,label] of [["name","ناو"],["phone","مۆبایل"]]){const option=document.createElement("option");option.value=value;option.textContent=label;field.append(option);}fieldLabel.append(field);
  const search=document.createElement("button");search.type="button";search.className="secondary";search.dataset.pickerSearch=target;search.textContent="گەڕان";form.append(queryLabel,fieldLabel,search);
  const status=document.createElement("div");status.className="customer-picker-status";status.setAttribute("role","status");status.id=target+"-search-status";
  const pager=document.createElement("div");pager.className="formrow";
  const prev=document.createElement("button"),next=document.createElement("button"),info=document.createElement("strong");
  for(const button of [prev,next]){button.type="button";button.className="secondary";}prev.textContent="پێشوو";next.textContent="دواتر";prev.dataset.pickerPrev=target;next.dataset.pickerNext=target;info.dir="ltr";info.id=target+"-search-page";pager.append(prev,info,next);
  const results=document.createElement("div");results.className="customer-picker-results";results.id=target+"-search-results";details.append(form,status,pager,results);host.append(details);
  const context=()=>({db,store:store?.id,actor:user?.id,epoch:customerIdentityEpoch,revision:customersReadToken,selection:$(target)?.value,ready:customersReady&&!!db&&!!store&&!!user&&(target!=="checkout-customer"||!pendingCheckout),busy});
  let controller;
  function sync(){const state=controller.state,unavailable=!context().ready||busy;query.disabled=field.disabled=search.disabled=unavailable||state.selecting;prev.disabled=unavailable||state.loading||state.selecting||!state.ready||state.offset<=0;next.disabled=unavailable||state.loading||state.selecting||!state.ready||state.offset+50>=state.total;
   for(const button of results.querySelectorAll("button"))button.disabled=unavailable||state.loading||state.selecting;
  }
  function render(state){
   status.textContent=state.error|| (state.selecting?"پشکنینی کڕیارە هەڵبژێردراوەکە…":state.loading?"گەڕان…":state.selected?"هەڵبژێردرا: "+state.selected:state.ready&&!state.rows.length?"هیچ کڕیارێک نەدۆزرایەوە":"");
   status.classList.toggle("error",!!state.error);info.textContent=state.ready?(state.rows.length?(state.offset+1)+"–"+(state.offset+state.rows.length)+" / "+state.total:"0 / "+state.total):"—";
   results.replaceChildren();
   if(state.ready){const table=document.createElement("table");table.innerHTML="<thead><tr><th>کڕیار</th><th>مۆبایل</th><th>قەرز</th><th>هەڵبژاردن</th></tr></thead><tbody></tbody>";
    for(const customer of state.rows){const tr=document.createElement("tr");for(const text of [customer.name,customer.phone||"—",money(customer.balance_minor)]){const td=document.createElement("td");td.textContent=text;tr.append(td);}const td=document.createElement("td"),button=document.createElement("button");button.type="button";button.className="stock-pick-btn";button.dataset.pickerChoose=customer.id;button.textContent="هەڵبژاردن";button.addEventListener("click",()=>{void controller.pick(customer.id);});td.append(button);tr.append(td);table.tBodies[0].append(tr);}results.append(table);
   }if(controller){sync();syncPending();syncCustomerReads();}
  }
  controller=window.RetailCustomerPicker.create({context,accept:customer=>acceptSearchedCustomer(target,customer),changed:render});
  const run=()=>{void controller.search({query:query.value,field:field.value});};
  search.addEventListener("click",run);query.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();run();}});
  query.addEventListener("input",()=>controller.reset());field.addEventListener("change",()=>controller.reset());
  prev.addEventListener("click",()=>{void controller.search({},controller.state.offset-50);});next.addEventListener("click",()=>{void controller.search({},controller.state.offset+50);});
  $(target)?.addEventListener("change",()=>controller.reset());
  customerPickers.push({target,controller,sync,reset:()=>controller.reset(),clear:()=>{query.value="";field.value="name";details.open=false;controller.reset();}});controller.reset();
 }
}
async function recordCustomerLedgerEntry({customerId,entryType,amount,note="",receiptNo="",dueDate=null,saleId=null,paymentMethod="cash_drawer",targetMsgId=""}){
 if(!store)return null;
 if(!customersReady){if(targetMsgId)msg(targetMsgId,"سەرەتا حیسابەکان نوێ بکەرەوە","error");return null;}
 const cust=customersList.find(c=>c.id===customerId);
 if(!cust){if(targetMsgId)msg(targetMsgId,"کڕیارەکە نەدۆزرایەوە","error");return null;}
 const amt=Math.round(Number(amount||0));
 if(!Number.isSafeInteger(amt)||amt<=0||amt>9999999999999){
   if(targetMsgId)msg(targetMsgId,"بڕی پارە نادروستە","error");
   return null;
 }
 const writeEpoch=customerIdentityEpoch,writeStore=store.id,writeActor=user?.id;
 let reqId=null,confirmedDelta=null;
 const oldBal=Number(cust.balance_minor||0);
 const delta=entryType==="payment_received"?-amt:entryType==="paid_purchase"?0:amt;
 let newBal=Math.max(0,oldBal+delta);
 let entryId=crypto.randomUUID();
 if(!db)throw new Error("پەیوەندیی سێرڤەر بەردەست نییە");
 try{
   const result=await financialRpc("customer-ledger","retail_record_customer_ledger_v19",{
     p_store:store.id,p_customer:customerId,
     p_entry_type:entryType==="debt_sale"&&!saleId?"debt_add":entryType,
     p_amount:amt,p_note:note||null,p_receipt_no:receiptNo||null,p_due_date:dueDate||null,
     p_sale_id:saleId||null,p_payment_method:paymentMethod||"cash_drawer"
   });
   if(customerIdentityEpoch!==writeEpoch||store?.id!==writeStore||user?.id!==writeActor)return null;
   entryId=result.entry_id;newBal=window.RetailCustomerAccounts.integer(result.balance_after_minor);confirmedDelta=window.RetailCustomerAccounts.integer(result.delta_minor);reqId=result.request_id;
 }catch(err){msg(targetMsgId||"system-msg",safe(err),"error");return null;}
 cust.balance_minor=newBal;
 if(dueDate)cust.due_date=dueDate;
 cust.updated_at=new Date().toISOString();
 saveLocalCustomers(customersList);
 const ledgerItem={
   id:entryId,
   store_id:store.id,
   customer_id:customerId,
   customer_name:cust.name,
   entry_type:entryType,
   amount_minor:amt,
   delta_minor:confirmedDelta,
   balance_after_minor:newBal,
   sale_id:saleId||null,
   receipt_no:receiptNo||null,
   due_date:dueDate||null,
   payment_method:paymentMethod||"cash_drawer",
   note:note||"",
   actor_id:user?.id||null,
   request_id:reqId,
   created_at:new Date().toISOString()
 };
 const index=customerLedgerList.findIndex(x=>x.id===entryId);
 if(index>=0)customerLedgerList[index]=ledgerItem;else{customerLedgerList.unshift(ledgerItem);customerLedgerList=customerLedgerList.slice(0,500);if(customersScope)customersScope.ledgerTotal++;}
 renderCustomerReadScope();
 saveLocalCustomerLedger(customerLedgerList);
 populateCustomerSelectors();
 return ledgerItem;
}
async function refreshCustomersSection(sub=custSub){
 if(!await loadCustomersAndLedger())return;
 if(sub==="directory")await refreshCustomerDirectory();
 if(sub==="debts")await refreshCustomerDebts();
 if(sub==="history"){
   if(!allReceipts.length&&db&&store){
     try{await refreshReceipts();}catch(_e){}
   }
   populateHistoryLinkSales();
   await refreshCustomerHistory();
 }
 if(sub==="payments")await refreshCustomerPaymentsPage();
}
function clearCustomerDirectoryPage(){
 clearTimeout(directoryTimer);++directoryToken;directoryRows=[];directoryOffset=0;directoryTotal=0;directoryFilters=null;directoryReady=false;directoryLoading=false;$("customers-list")?.replaceChildren();
 for(const id of ["cust-kpi-total","cust-kpi-debtors","cust-kpi-total-debt","cust-kpi-over-limit"])if($(id))$(id).textContent="—";syncCustomerDirectoryPager();
}
function filterCustomerDirectoryRows(){return directoryRows.filter(c=>!$("cust-over-limit-page")?.checked||(c.credit_limit_minor>0&&c.balance_minor>c.credit_limit_minor));}
function syncCustomerDirectoryPager(){
 if($("cust-prev"))$("cust-prev").disabled=busy||directoryLoading||!directoryReady||directoryOffset<=0;
 if($("cust-next"))$("cust-next").disabled=busy||directoryLoading||!directoryReady||directoryOffset+50>=directoryTotal;
 if($("cust-export-csv"))$("cust-export-csv").disabled=busy||!customersReady||!directoryReady||!filterCustomerDirectoryRows().length;
 if($("cust-page-info"))$("cust-page-info").textContent=directoryReady?(directoryRows.length?(directoryOffset+1)+"–"+(directoryOffset+directoryRows.length)+" / "+directoryTotal:"0 / "+directoryTotal):"—";
}
async function refreshCustomerDirectory(reset=true){
 if(!db||!store||!user||!customersReady)return;
 clearTimeout(directoryTimer);const token=++directoryToken,storeId=store.id,actor=user.id;
 const current=()=>token===directoryToken&&store?.id===storeId&&user?.id===actor&&customersReady;
 directoryReady=false;directoryLoading=true;directoryRows=[];directoryTotal=0;renderCustomersDirectory();syncCustomerDirectoryPager();msg("cust-read-scope","وەرگرتنی لیستی کڕیاران…");
 try{
  if(reset||!directoryFilters){directoryOffset=0;directoryFilters=window.RetailCustomerDirectory.criteria({query:$("cust-search").value,field:$("cust-search-field").value,status:$("cust-status-filter").value});}
  let result=await window.RetailCustomerDirectory.read({db,store:storeId,filters:directoryFilters,offset:directoryOffset});if(!current())return;
  if(directoryOffset>0&&!result.rows.length&&result.total<=directoryOffset){directoryOffset=result.total?Math.floor((result.total-1)/50)*50:0;result=await window.RetailCustomerDirectory.read({db,store:storeId,filters:directoryFilters,offset:directoryOffset});if(!current())return;}
  directoryRows=result.rows;directoryTotal=result.total;directoryReady=true;renderCustomersDirectory();msg("cust-read-scope","گەڕان و دۆخی حیساب لە سێرڤەرەوە — پوختە، تێپەڕینی سنوور و CSV تەنها بۆ ئەم پەڕەیەن");
 }catch(error){if(current()){directoryRows=[];directoryTotal=0;directoryFilters=null;directoryReady=false;renderCustomersDirectory();msg("cust-read-scope",safe(error),"error");}}
 finally{if(token===directoryToken){directoryLoading=false;syncCustomerDirectoryPager();}}
}
function invalidateCustomerDirectory(){clearCustomerDirectoryPage();directoryLoading=true;syncCustomerDirectoryPager();directoryTimer=setTimeout(()=>{if(!busy)void refreshCustomerDirectory();else{directoryLoading=false;syncCustomerDirectoryPager();}},200);}
function renderCustomersDirectory(){
 const root=$("customers-list");if(!root)return;root.replaceChildren();
 if(!customersReady||!directoryReady){for(const id of ["cust-kpi-total","cust-kpi-debtors","cust-kpi-total-debt","cust-kpi-over-limit"])if($(id))$(id).textContent="—";syncCustomerDirectoryPager();return;}
 const filtered=filterCustomerDirectoryRows(),totals=window.RetailCustomerDirectory.totals(filtered);
 $("cust-kpi-total").textContent=String(filtered.length);$("cust-kpi-debtors").textContent=String(totals.debtors);$("cust-kpi-total-debt").textContent=money(totals.debt);$("cust-kpi-over-limit").textContent=String(totals.over);syncCustomerDirectoryPager();
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ کڕیارێک لەم گەڕان یان پاڵاوتنەدا نەدۆزرایەوە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ناوی کڕیار</th><th>مۆبایل</th><th>ناونیشان</th><th>قەرزی ئێستا</th><th>سنووری قەرز</th><th>دۆخی حیساب</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const c of filtered){
   const tr=document.createElement("tr");
   const bal=Number(c.balance_minor||0);
   const lim=Number(c.credit_limit_minor||0);
   const isOver=lim>0&&bal>lim;
   const tdName=document.createElement("td");tdName.style.fontWeight="850";tdName.textContent=c.name;
   const tdPhone=document.createElement("td");tdPhone.dir="ltr";tdPhone.textContent=c.phone||"—";
   const tdAddr=document.createElement("td");tdAddr.textContent=c.address||"—";
   const tdBal=document.createElement("td");tdBal.dir="ltr";tdBal.style.fontWeight="900";
   tdBal.style.color=isOver?"#dc2626":bal>0?"#b45309":"#15803d";
   tdBal.textContent=money(bal);
   const tdLim=document.createElement("td");tdLim.dir="ltr";tdLim.textContent=money(lim);
   const tdStatus=document.createElement("td");
   const badge=document.createElement("span");
   badge.className="stock-badge "+(isOver?"danger":bal>0?"warn":"ok");
   badge.textContent=isOver?"تێپەڕیو لە سنوور":bal>0?"قەرزدار":bal<0?"باڵانسی پێشەکی":"بێ قەرز (پاک)";
   tdStatus.append(badge);
   const tdAct=document.createElement("td");
   const btnDebt=document.createElement("button");
   btnDebt.type="button";btnDebt.className="stock-pick-btn";
   btnDebt.dataset.custAddDebt=c.id;btnDebt.textContent="+ قەرز";
   const btnPay=document.createElement("button");
   btnPay.type="button";btnPay.className="stock-action-btn";
   btnPay.dataset.custPay=c.id;btnPay.textContent="💵 پارەدان";
   const btnHist=document.createElement("button");
   btnHist.type="button";btnHist.className="stock-action-btn";
   btnHist.dataset.custStatement=c.id;btnHist.textContent="📄 مێژووی حیساب";
   const btnEdit=document.createElement("button");
   btnEdit.type="button";btnEdit.className="stock-action-btn";
   btnEdit.dataset.custEdit=c.id;btnEdit.textContent="دەستکاری";
   tdAct.append(btnDebt,btnPay,btnHist,btnEdit);
   tr.append(tdName,tdPhone,tdAddr,tdBal,tdLim,tdStatus,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function customerDebtToday(){
 const parts=new Intl.DateTimeFormat("en",{timeZone:"Asia/Baghdad",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 return ["year","month","day"].map(k=>parts.find(p=>p.type===k).value).join("-");
}
function customerDebtDays(date){return date?Math.round((Date.parse(date+"T00:00:00Z")-Date.parse(customerDebtToday()+"T00:00:00Z"))/86400000):9999;}
function clearCustomerDebtPage(){
 clearTimeout(debtTimer);++debtToken;debtRows=[];debtOffset=0;debtTotal=0;debtFilters=null;debtReady=false;debtLoading=false;$("debts-list")?.replaceChildren();
 for(const id of ["debt-kpi-total","debt-kpi-count","debt-kpi-overdue","debt-kpi-max"])if($(id))$(id).textContent="—";syncCustomerDebtPager();
}
function filterCustomerDebtRows(){return debtRows.filter(c=>!$("debt-over-limit-page")?.checked||(c.credit_limit_minor>0&&c.balance_minor>c.credit_limit_minor));}
function syncCustomerDebtPager(){
 if($("debt-prev"))$("debt-prev").disabled=busy||debtLoading||!debtReady||debtOffset<=0;
 if($("debt-next"))$("debt-next").disabled=busy||debtLoading||!debtReady||debtOffset+50>=debtTotal;
 if($("debt-export-csv"))$("debt-export-csv").disabled=busy||!customersReady||!debtReady||!filterCustomerDebtRows().length;
 if($("debt-page-info"))$("debt-page-info").textContent=debtReady?(debtRows.length?(debtOffset+1)+"–"+(debtOffset+debtRows.length)+" / "+debtTotal:"0 / "+debtTotal):"—";
}
async function refreshCustomerDebts(reset=true){
 if(!db||!store||!user||!customersReady)return;
 clearTimeout(debtTimer);const token=++debtToken,storeId=store.id,actor=user.id;
 const current=()=>token===debtToken&&store?.id===storeId&&user?.id===actor&&customersReady;
 debtReady=false;debtLoading=true;debtRows=[];debtTotal=0;renderCustomerDebtsView();syncCustomerDebtPager();msg("debt-read-scope","وەرگرتنی لیستی قەرزدارەکان…");
 try{
  if(reset||!debtFilters){debtOffset=0;debtFilters={filters:window.RetailCustomerDirectory.criteria({query:$("debt-search").value,field:$("debt-search-field").value,status:"debtors"}),debtMode:{mode:$("debt-filter").value,today:customerDebtToday()}};}
  let result=await window.RetailCustomerDirectory.read({db,store:storeId,...debtFilters,offset:debtOffset});if(!current())return;
  if(debtOffset>0&&!result.rows.length&&result.total<=debtOffset){debtOffset=result.total?Math.floor((result.total-1)/50)*50:0;result=await window.RetailCustomerDirectory.read({db,store:storeId,...debtFilters,offset:debtOffset});if(!current())return;}
  debtRows=result.rows;debtTotal=result.total;debtReady=true;renderCustomerDebtsView();msg("debt-read-scope","گەڕان و پاڵاوتن لە سێرڤەرەوە — پوختە، تێپەڕینی سنوور و CSV تەنها بۆ ئەم پەڕەیەن");
 }catch(error){if(current()){debtRows=[];debtTotal=0;debtFilters=null;debtReady=false;renderCustomerDebtsView();msg("debt-read-scope",safe(error),"error");}}
 finally{if(token===debtToken){debtLoading=false;syncCustomerDebtPager();}}
}
function invalidateCustomerDebts(){clearCustomerDebtPage();debtLoading=true;syncCustomerDebtPager();debtTimer=setTimeout(()=>{if(!busy)void refreshCustomerDebts();else{debtLoading=false;syncCustomerDebtPager();}},200);}
function renderCustomerDebtsView(){
 const root=$("debts-list");if(!root)return;root.replaceChildren();
 if(!customersReady||!debtReady){for(const id of ["debt-kpi-total","debt-kpi-count","debt-kpi-overdue","debt-kpi-max"])if($(id))$(id).textContent="—";syncCustomerDebtPager();return;}
 if($("debt-due-date")&&!$("debt-due-date").value)$("debt-due-date").value=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
 const filtered=filterCustomerDebtRows(),totals=window.RetailCustomerDirectory.totals(filtered);
 $("debt-kpi-total").textContent=money(totals.debt);$("debt-kpi-count").textContent=String(filtered.length);
 $("debt-kpi-overdue").textContent=String(filtered.filter(c=>c.due_date&&customerDebtDays(c.due_date)<0).length);
 $("debt-kpi-max").textContent=money(filtered.reduce((m,c)=>Math.max(m,c.balance_minor),0));syncCustomerDebtPager();
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ قەرزێکی چالاک لەم پاڵاوتنەدا نییە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کڕیار</th><th>مۆبایل</th><th>قەرزی کەڵەکەبوو</th><th>سنووری قەرز</th><th>مۆڵەتی دانەوە</th><th>دۆخی قەرز</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const c of filtered){
   const tr=document.createElement("tr");
   const bal=Number(c.balance_minor||0);
   const lim=Number(c.credit_limit_minor||0);
   const isOver=lim>0&&bal>lim;
   const daysDue=c.due_date?customerDebtDays(c.due_date):null;
   const isOverdue=daysDue!==null&&daysDue<0;
   const tdName=document.createElement("td");tdName.style.fontWeight="850";tdName.textContent=c.name;
   const tdPhone=document.createElement("td");tdPhone.dir="ltr";tdPhone.textContent=c.phone||"—";
   const tdBal=document.createElement("td");tdBal.dir="ltr";tdBal.style.fontWeight="900";tdBal.style.color="#dc2626";tdBal.textContent=money(bal);
   const tdLim=document.createElement("td");tdLim.dir="ltr";tdLim.textContent=money(lim);
   const tdDue=document.createElement("td");tdDue.dir="ltr";
   tdDue.textContent=c.due_date?(c.due_date+(daysDue<0?" ("+Math.abs(daysDue)+" ڕۆژ دواکەوتووە)":daysDue===0?" (ئەمڕۆ)":" ("+daysDue+" ڕۆژ ماوە)")):"—";
   const tdStatus=document.createElement("td");
   const badge=document.createElement("span");
   badge.className="stock-badge "+(isOverdue||isOver?"danger":"warn");
   badge.textContent=isOverdue?"وادەبەسەرچوو":isOver?"سەرووی سنووری قەرز":"قەرزی چالاک";
   tdStatus.append(badge);
   const tdAct=document.createElement("td");
   const payBtn=document.createElement("button");
   payBtn.type="button";payBtn.className="stock-pick-btn";
   payBtn.dataset.debtCollect=c.id;payBtn.textContent="💵 وەرگرتنەوەی قەرز";
   const stmBtn=document.createElement("button");
   stmBtn.type="button";stmBtn.className="stock-action-btn";
   stmBtn.dataset.debtStatement=c.id;stmBtn.textContent="📄 مێژووی حیساب";
   tdAct.append(payBtn,stmBtn);
   tr.append(tdName,tdPhone,tdBal,tdLim,tdDue,tdStatus,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function populateHistoryLinkSales(){
 const sel=$("hist-link-sale");
 if(!sel)return;
 const prev=sel.value;
 sel.replaceChildren();
 const sales=allReceipts.filter(s=>!s.refunded).slice(0,80);
 if(!sales.length){
   const opt=document.createElement("option");
   opt.value="";opt.textContent="هیچ پسووڵەیەکی فرۆشتن بەردەست نییە";
   sel.append(opt);
   return;
 }
 for(const s of sales){
   const opt=document.createElement("option");
   opt.value=s.id;
   const rNo=String(s.receipt_no??"").padStart(6,"0");
   opt.textContent="پسووڵەی #"+rNo+" — "+money(s.total_minor||0)+" ("+new Date(s.created_at).toLocaleDateString("en-GB")+")";
   sel.append(opt);
 }
 if([...sel.options].some(o=>o.value===prev))sel.value=prev;
}
function customerEntryTypeMeta(entryType){
 switch(entryType){
   case "debt_sale":return {label:"فرۆشتن بە قەرز (پسووڵە)",cls:"warn",isDebit:true};
   case "debt_add":return {label:"تۆمارکردنی قەرز",cls:"danger",isDebit:true};
   case "opening_balance":return {label:"قەرزی سەرەتا / پێشوو",cls:"warn",isDebit:true};
   case "sale_return":return {label:"گەڕاندنەوەی پسووڵە",cls:"ok",isDebit:false};
   case "paid_purchase":return {label:"کڕینی نەقدی (دراوە)",cls:"info",isDebit:false};
   case "payment_received":return {label:"پارەدانی کڕیار (دانەوەی قەرز)",cls:"ok",isDebit:false};
   default:return {label:"ڕێکخستنی حیساب",cls:"info",isDebit:true};
 }
}
function clearCustomerHistoryPage(){
 clearTimeout(historyTimer);++historyToken;historyRows=[];historyTotal=0;historyOffset=0;historyFilters=null;historyReady=false;historyLoading=false;
 $("customer-history-list")?.replaceChildren();if($("customer-statement-box")){$("customer-statement-box").replaceChildren();$("customer-statement-box").hidden=true;}
 for(const id of ["hist-kpi-count","hist-kpi-debit","hist-kpi-credit","hist-kpi-balance"])if($(id))$(id).textContent="—";
 syncCustomerHistoryPager();
}
function syncCustomerHistoryPager(){
 const visible=filterCustomerHistoryRows();
 if($("hist-prev"))$("hist-prev").disabled=busy||historyLoading||!historyReady||historyOffset<=0;
 if($("hist-next"))$("hist-next").disabled=busy||historyLoading||!historyReady||historyOffset+50>=historyTotal;
 if($("hist-export-csv"))$("hist-export-csv").disabled=busy||!customersReady||!historyReady||!visible.length;
 if($("hist-print-statement"))$("hist-print-statement").disabled=busy||!customersReady||!historyReady||!visible.length;
 if($("hist-page-info"))$("hist-page-info").textContent=historyReady?(historyRows.length?(historyOffset+1)+"–"+(historyOffset+historyRows.length)+" / "+historyTotal:"0 / "+historyTotal):"—";
}
async function refreshCustomerHistory(reset=true){
 if(!db||!store||!user||!customersReady)return;
 clearTimeout(historyTimer);const token=++historyToken,storeId=store.id,actor=user.id;
 const current=()=>token===historyToken&&store?.id===storeId&&user?.id===actor&&customersReady;
 historyReady=false;historyLoading=true;historyRows=[];historyTotal=0;$("customer-statement-box").replaceChildren();$("customer-statement-box").hidden=true;renderCustomerHistoryView();syncCustomerHistoryPager();msg("hist-read-scope","وەرگرتنی مێژووی حیساب…");
 try{
  if(reset||!historyFilters){historyOffset=0;historyFilters=window.RetailCustomerHistory.criteria({customer:$("hist-customer-filter").value,phone:$("hist-phone").value,kind:$("hist-type-filter").value,period:$("hist-date-filter").value});}
  let result=await window.RetailCustomerHistory.read({db,store:storeId,filters:historyFilters,offset:historyOffset});if(!current())return;
  if(historyOffset>0&&!result.rows.length&&result.total<=historyOffset){historyOffset=result.total?Math.floor((result.total-1)/50)*50:0;result=await window.RetailCustomerHistory.read({db,store:storeId,filters:historyFilters,offset:historyOffset});if(!current())return;}
  historyRows=result.rows;historyTotal=result.total;historyReady=true;renderCustomerHistoryView();msg("hist-read-scope","مێژووی مامەڵەکان — پوختە، گەڕانی دەق و CSV تەنها بۆ ئەم پەڕەیەن");
 }catch(error){if(current()){historyRows=[];historyTotal=0;historyFilters=null;historyReady=false;renderCustomerHistoryView();msg("hist-read-scope",safe(error),"error");}}
 finally{if(token===historyToken){historyLoading=false;syncCustomerHistoryPager();}}
}
function invalidateCustomerHistory(){
 clearCustomerHistoryPage();historyLoading=true;syncCustomerHistoryPager();
 historyTimer=setTimeout(()=>{if(!busy)void refreshCustomerHistory();else{historyLoading=false;syncCustomerHistoryPager();}},200);
}
async function openCustomerHistory(customerId){
 selectCustomerSub("history",false);if(!await loadCustomersAndLedger(customerId))return;
 $("hist-customer-filter").value=customerId;$("hist-phone").value="";$("hist-type-filter").value="all";$("hist-date-filter").value="all";$("hist-search").value="";
 await refreshCustomerHistory();if(historyReady&&historyFilters?.customer===customerId)renderCustomerStatementBox(customerId);
}
function filterCustomerHistoryRows(){
 const q=String($("hist-search")?.value||"").trim().toLocaleLowerCase();
 return historyRows.filter(item=>!q||((item.customer?.name||item.customer_id)+" "+(item.receipt_no||"")+" "+(item.note||"")+" "+customerEntryTypeMeta(item.entry_type).label).toLocaleLowerCase().includes(q));
}
function renderCustomerHistoryView(){
 if(!historyReady||!customersReady){$("customer-history-list")?.replaceChildren();for(const id of ["hist-kpi-count","hist-kpi-debit","hist-kpi-credit","hist-kpi-balance"])if($(id))$(id).textContent="—";syncCustomerHistoryPager();return;}
 const root=$("customer-history-list");
 if(!root)return;
 root.replaceChildren();
 const filtered=filterCustomerHistoryRows();
 const sums=window.RetailCustomerAccounts.totals(filtered),debitSum=sums.added,creditSum=sums.reduced;
 const remBal=debitSum-creditSum;
 if($("hist-kpi-count"))$("hist-kpi-count").textContent=filtered.length.toLocaleString("en-US");
 if($("hist-kpi-debit"))$("hist-kpi-debit").textContent=money(debitSum);
 if($("hist-kpi-credit"))$("hist-kpi-credit").textContent=money(creditSum);
 if($("hist-kpi-balance"))$("hist-kpi-balance").textContent=money(remBal);

 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ تۆمارێکی مێژووی کڕین یان حیساب لەم پاڵاوتنەدا نییە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کات و بەروار</th><th>کڕیار</th><th>جۆری مامەڵە</th><th>ژمارەی پسووڵە</th><th>بڕی مامەڵە</th><th>گۆڕانی قەرز</th><th>قەرزی ماوە دوای مامەڵە</th><th>تێبینی</th></tr></thead><tbody></tbody>";
 for(const item of filtered){
   const tr=document.createElement("tr");
   const c=item.customer;
   const meta=customerEntryTypeMeta(item.entry_type);
   const amt=Number(item.amount_minor||0);
   const isPay=Number(item.delta_minor)<0;
   const isPaidSale=Number(item.delta_minor)===0;
   const tdTime=document.createElement("td");tdTime.dir="ltr";tdTime.textContent=item.created_at?new Date(item.created_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}):"—";
   const tdCust=document.createElement("td");tdCust.style.fontWeight="800";tdCust.textContent=c?.name||item.customer_id||"—";
   const tdKind=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+meta.cls;badge.textContent=meta.label;
   tdKind.append(badge);
   const tdRec=document.createElement("td");tdRec.dir="ltr";
   tdRec.textContent=item.receipt_no?("#"+String(item.receipt_no).replace(/^#/,"")):"—";
   const tdAmt=document.createElement("td");tdAmt.dir="ltr";tdAmt.style.fontWeight="900";
   tdAmt.style.color=isPay?"#15803d":isPaidSale?"#1e40af":"#dc2626";
   tdAmt.textContent=money(amt);
   const tdDelta=document.createElement("td");tdDelta.dir="ltr";tdDelta.textContent=(Number(item.delta_minor)>0?"+":"")+money(item.delta_minor);
   const tdBalAfter=document.createElement("td");tdBalAfter.dir="ltr";tdBalAfter.style.fontWeight="800";
   tdBalAfter.textContent=money(item.balance_after_minor);
   const tdNote=document.createElement("td");tdNote.textContent=item.note||"—";
   tr.append(tdTime,tdCust,tdKind,tdRec,tdAmt,tdDelta,tdBalAfter,tdNote);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function renderCustomerStatementBox(customerIdOverride){
 if(!customersReady||!historyReady)return;
 const box=$("customer-statement-box");if(!box)return;box.replaceChildren();box.hidden=true;
 const rows=filterCustomerHistoryRows(),ids=[...new Set(rows.map(r=>r.customer_id))];
 const custId=customerIdOverride||(historyFilters?.customer!=="all"?historyFilters?.customer:ids.length===1?ids[0]:null);
 const custRows=rows.filter(r=>r.customer_id===custId),cust=custRows.find(r=>r.customer)?.customer;
 if(!cust||!custRows.length){msg("cust-history-msg","کڕیارێک هەڵبژێرە کە مامەڵەی لەم پەڕەیەدا هەبێت","error");return;}
 const sums=window.RetailCustomerAccounts.totals(custRows);
 const title=document.createElement("h3");title.textContent="پوختەی تۆمارە بارکراوەکان — ئەم پەڕەیە: "+cust.name+(cust.phone?" ("+cust.phone+")":"");box.append(title);
 const scope=document.createElement("p");scope.textContent="پەڕەی "+(historyOffset+1)+"–"+(historyOffset+historyRows.length)+" / "+historyTotal+" — ئەمە کشفی حیسابی تەواو نییە";box.append(scope);
 const metrics=document.createElement("div");metrics.className="receipt-metrics";
 for(const [label,value] of [["ژمارەی مامەڵە",custRows.length],["قەرزی زیادکراو",money(sums.added)],["قەرزی کەمکراو",money(sums.reduced)],["پارەی دراو",money(sums.paid)],["کڕینی نەقدی",money(sums.cashPurchases)],["گۆڕانی قەرز لەم پەڕەیە",money(sums.added-sums.reduced)]]){const span=document.createElement("span");span.textContent=label+": "+value;metrics.append(span);}box.append(metrics);
 const print=document.createElement("button");print.type="button";print.className="primary";print.textContent="چاپکردنی پوختە";print.onclick=()=>window.print();
 const close=document.createElement("button");close.type="button";close.className="secondary";close.textContent="داخستن";close.onclick=()=>{box.hidden=true;};box.append(print,close);box.hidden=false;
}
function clearCustomerPaymentsPage(){
 clearTimeout(customerPayTimer);++customerPayToken;customerPayRows=[];customerPayOffset=0;customerPayTotal=0;customerPayFilters=null;customerPayReady=false;customerPayLoading=false;
 $("customer-payments-list")?.replaceChildren();if($("cpay-voucher-box")){$("cpay-voucher-box").replaceChildren();$("cpay-voucher-box").hidden=true;}
 for(const id of ["cpay-kpi-total","cpay-kpi-today","cpay-kpi-count","cpay-kpi-remaining"])if($(id))$(id).textContent="—";
 syncCustomerPaymentsPager();
}
async function openCustomerPaymentForm(customerId){
 const storeId=store?.id,actor=user?.id;selectCustomerSub("payments",false);
 if(!await loadCustomersAndLedger(customerId)||store?.id!==storeId||user?.id!==actor)return;
 const customer=customersList.find(c=>c.id===customerId),select=$("cpay-customer");
 if(!customer||![...select.options].some(o=>o.value===customerId)){select.value="";$("cpay-amount").value="";msg("cust-payments-msg","کڕیارەکە لە لیستی نوێکراوەدا بەردەست نییە","error");await refreshCustomerPaymentsPage();return;}
 select.value=customerId;$("cpay-amount").value=customer.balance_minor>0?String(customer.balance_minor):"";
 await refreshCustomerPaymentsPage();if(store?.id===storeId&&user?.id===actor)$("cpay-amount")?.focus();
}
function filterCustomerPaymentRows(){
 const query=String($("cpay-search")?.value||"").trim().toLocaleLowerCase();
 return customerPayRows.filter(item=>!query||((item.customer?.name||item.customer_id)+" "+(item.note||"")+" "+String(item.amount_minor)).toLocaleLowerCase().includes(query));
}
function syncCustomerPaymentsPager(){
 if($("cpay-prev"))$("cpay-prev").disabled=busy||customerPayLoading||!customerPayReady||customerPayOffset<=0;
 if($("cpay-next"))$("cpay-next").disabled=busy||customerPayLoading||!customerPayReady||customerPayOffset+50>=customerPayTotal;
 if($("cpay-export-csv"))$("cpay-export-csv").disabled=busy||!customersReady||!customerPayReady||!filterCustomerPaymentRows().length;
 if($("cpay-page-info"))$("cpay-page-info").textContent=customerPayReady?(customerPayRows.length?(customerPayOffset+1)+"–"+(customerPayOffset+customerPayRows.length)+" / "+customerPayTotal:"0 / "+customerPayTotal):"—";
}
async function refreshCustomerPaymentsPage(reset=true){
 if(!db||!store||!user||!customersReady)return;
 clearTimeout(customerPayTimer);const token=++customerPayToken,storeId=store.id,actor=user.id;
 const current=()=>token===customerPayToken&&store?.id===storeId&&user?.id===actor&&customersReady;
 customerPayReady=false;customerPayLoading=true;customerPayRows=[];customerPayTotal=0;$("cpay-voucher-box").replaceChildren();$("cpay-voucher-box").hidden=true;renderCustomerPaymentsView();syncCustomerPaymentsPager();msg("cpay-read-scope","وەرگرتنی مێژووی پارەدان…");
 try{
  if(reset||!customerPayFilters){customerPayOffset=0;customerPayFilters=window.RetailCustomerHistory.criteria({customer:$("cpay-customer-filter").value,phone:$("cpay-phone").value,kind:'payments',method:$("cpay-method-filter").value,period:$("cpay-date-filter").value});}
  let result=await window.RetailCustomerHistory.read({db,store:storeId,filters:customerPayFilters,offset:customerPayOffset});if(!current())return;
  if(customerPayOffset>0&&!result.rows.length&&result.total<=customerPayOffset){customerPayOffset=result.total?Math.floor((result.total-1)/50)*50:0;result=await window.RetailCustomerHistory.read({db,store:storeId,filters:customerPayFilters,offset:customerPayOffset});if(!current())return;}
  window.RetailCustomerHistory.paymentTotals(result.rows);
  customerPayRows=result.rows;customerPayTotal=result.total;customerPayReady=true;renderCustomerPaymentsView();
 }catch(error){if(current()){customerPayRows=[];customerPayTotal=0;customerPayFilters=null;customerPayReady=false;renderCustomerPaymentsView();msg("cpay-read-scope",safe(error),"error");}}
 finally{if(token===customerPayToken){customerPayLoading=false;syncCustomerPaymentsPager();}}
}
function invalidateCustomerPayments(){
 clearCustomerPaymentsPage();customerPayLoading=true;syncCustomerPaymentsPager();
 customerPayTimer=setTimeout(()=>{if(!busy)void refreshCustomerPaymentsPage();else{customerPayLoading=false;syncCustomerPaymentsPager();}},200);
}
function customerPaymentMethodLabel(method){return method==='cash_drawer'?"نەقد (سندووقی کاشێر)":method==='ledger_only'?"داشکاندن لە حیساب":"شێوازی نادیار";}
function renderCustomerPaymentsView(){
 const root=$("customer-payments-list");if(!root)return;root.replaceChildren();
 if(!customersReady||!customerPayReady){for(const id of ["cpay-kpi-total","cpay-kpi-today","cpay-kpi-count","cpay-kpi-remaining"])if($(id))$(id).textContent="—";syncCustomerPaymentsPager();return;}
 const filtered=filterCustomerPaymentRows(),sums=window.RetailCustomerHistory.paymentTotals(filtered);
 $("cpay-kpi-total").textContent=money(sums.total);$("cpay-kpi-today").textContent=money(sums.cash);$("cpay-kpi-count").textContent=String(filtered.length);$("cpay-kpi-remaining").textContent=money(sums.ledger);
 msg("cpay-read-scope","پوختە، گەڕانی دەق و CSV تەنها بۆ ئەم پەڕەیەن"+(sums.unknownCount?" — شێوازی نادیار: "+sums.unknownCount+" / "+money(sums.unknown):""));syncCustomerPaymentsPager();
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ پارەدانێکی کڕیار لەم پاڵاوتنەدا نییە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کات و بەروار</th><th>کڕیار</th><th>بڕی پارەی دراو</th><th>قەرزی ماوە دوای پارەدان</th><th>شێواز</th><th>تێبینی</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const item of filtered){
   const tr=document.createElement("tr");
   const c=item.customer;
   const tdTime=document.createElement("td");tdTime.dir="ltr";tdTime.textContent=item.created_at?new Date(item.created_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}):"—";
   const tdCust=document.createElement("td");tdCust.style.fontWeight="850";tdCust.textContent=c?.name||item.customer_id||"—";
   const tdAmt=document.createElement("td");tdAmt.dir="ltr";tdAmt.style.fontWeight="900";tdAmt.style.color="#15803d";tdAmt.textContent=money(item.amount_minor||0);
   const tdRem=document.createElement("td");tdRem.dir="ltr";tdRem.style.fontWeight="800";tdRem.textContent=money(item.balance_after_minor);
   const tdMethod=document.createElement("td");
   const badge=document.createElement("span");
   badge.className="stock-badge "+(item.payment_method==="ledger_only"?"info":item.payment_method==="cash_drawer"?"ok":"warn");
   badge.textContent=customerPaymentMethodLabel(item.payment_method);
   tdMethod.append(badge);
   const tdNote=document.createElement("td");tdNote.textContent=item.note||"—";
   const tdAct=document.createElement("td");
   const vBtn=document.createElement("button");
   vBtn.type="button";vBtn.className="stock-action-btn";
   vBtn.dataset.cpayVoucher=item.id;vBtn.textContent="🖨 وەسڵی پارەدان";
   tdAct.append(vBtn);
   tr.append(tdTime,tdCust,tdAmt,tdRem,tdMethod,tdNote,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function renderCustomerPaymentVoucher(entryId){
 if(!customersReady||!customerPayReady)return;
 const box=$("cpay-voucher-box");
 if(!box)return;
 const item=customerPayRows.find(x=>x.id===entryId);
 if(!item){box.hidden=true;return;}
 const c=item.customer;
 box.replaceChildren();
 box.hidden=false;
 const head=document.createElement("div");
 head.style.display="flex";head.style.justifyContent="space-between";head.style.alignItems="center";head.style.flexWrap="wrap";head.style.gap="8px";
 const h3=document.createElement("h3");h3.style.margin="0";
 h3.textContent=(item.payment_method==="cash_drawer"?"وەسڵی وەرگرتنی پارە":item.payment_method==="ledger_only"?"وەسڵی داشکاندنی حیساب":"وەسڵی پارەدان — شێوازی نادیار")+" — "+(c?.name||item.customer_id);
 const act=document.createElement("div");act.style.display="flex";act.style.gap="8px";
 const pBtn=document.createElement("button");
 pBtn.type="button";pBtn.className="primary";pBtn.style.height="34px";pBtn.textContent="🖨 چاپکردنی وەسڵ";
 pBtn.addEventListener("click",()=>window.print());
 const cBtn=document.createElement("button");
 cBtn.type="button";cBtn.className="secondary";cBtn.style.height="34px";cBtn.textContent="داخستن";
 cBtn.addEventListener("click",()=>{box.hidden=true;});
 act.append(pBtn,cBtn);
 head.append(h3,act);
 box.append(head);
 const metrics=document.createElement("div");metrics.className="receipt-metrics";
 for(const [lbl,val] of [
   ["ژمارەی وەسڵ",String(item.id)],
   ["کات و بەروار",item.created_at?new Date(item.created_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}):"—"],
   ["شێوازی پارەدان",customerPaymentMethodLabel(item.payment_method)],
   ["بڕی پارەدان",money(item.amount_minor)],
   ["قەرزی ماوە دوای پارەدان",money(item.balance_after_minor)],
   ["تێبینی",item.note||"—"]
 ]){
   const sp=document.createElement("span"),st=document.createElement("strong");
   sp.textContent=lbl+": ";st.textContent=val;sp.append(st);metrics.append(sp);
 }
 box.append(metrics);
}
function localSuppliersKey(){return store?"retail_suppliers_v19_"+store.id:null;}
function localPurchaseOrdersKey(){return store?"retail_purchase_orders_v19_"+store.id:null;}
function localSupplierLedgerKey(){return store?"retail_supplier_ledger_v19_"+store.id:null;}
function loadLocalSuppliers(){
 const k=localSuppliersKey();if(!k)return [];
 try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[];}catch(_e){return [];}
}
function saveLocalSuppliers(list){
 const k=localSuppliersKey();if(!k)return;
 try{localStorage.setItem(k,JSON.stringify(list));}catch(_e){}
}
function loadLocalPurchaseOrders(){
 const k=localPurchaseOrdersKey();if(!k)return [];
 try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[];}catch(_e){return [];}
}
function saveLocalPurchaseOrders(list){
 const k=localPurchaseOrdersKey();if(!k)return;
 try{localStorage.setItem(k,JSON.stringify(list));}catch(_e){}
}
function loadLocalSupplierLedger(){
 const k=localSupplierLedgerKey();if(!k)return [];
 try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[];}catch(_e){return [];}
}
function saveLocalSupplierLedger(list){
 const k=localSupplierLedgerKey();if(!k)return;
 try{localStorage.setItem(k,JSON.stringify(list));}catch(_e){}
}
function supplierIdentityGuard(){const id=store?.id,actor=user?.id,epoch=supplierIdentityEpoch;return ()=>store?.id===id&&user?.id===actor&&supplierIdentityEpoch===epoch;}
function renderSupplierReadScope(){
 if(suppliersReady&&suppliersScope)msg("suppliers-read-scope","دابینکەرە بارکراوەکان: "+suppliersList.length+" / "+suppliersScope.supplierTotal+" — داواکارییە بارکراوەکان: "+purchaseOrdersList.length+" / "+suppliersScope.orderTotal+" — مامەڵە بارکراوەکان: "+supplierLedgerList.length+" / "+suppliersScope.ledgerTotal);
}
function syncSupplierReads(){
 for(const selector of ["#supplier-form button[type=submit]","#po-form button[type=submit]","#receiving-form button[type=submit]","#supplier-payment-form button[type=submit]","#po-import-low-stock","#sup-export-csv","#po-export-csv","#rec-export-csv","#sacc-export-csv","#sacc-print-statement","#sacc-quick-row button"])for(const el of document.querySelectorAll(selector))el.disabled=busy||!suppliersReady;
 for(const id of ["po-supplier","rec-supplier","sacc-supplier","po-supplier-filter","rec-supplier-filter","sacc-supplier-filter"])if($(id))$(id).disabled=busy||!suppliersReady;
 syncSupplierDirectoryPager();syncPurchaseOrderPager();
}
function clearSupplierViews(){
 clearPurchaseOrderPage();
 clearSupplierDirectoryPage();
 for(const id of ["suppliers-list","po-list","receiving-list","supplier-accounts-list"])$(id)?.replaceChildren();
 for(const el of document.querySelectorAll("#suppliers-panel .shift-metrics strong"))el.textContent="—";
 for(const id of ["po-print-box","supplier-statement-box"])if($(id)){$(id).replaceChildren();$(id).hidden=true;}
 syncSupplierReads();
}
function supplierReadUnavailable(root){if(suppliersReady)return false;$(root)?.replaceChildren();syncSupplierReads();return true;}
async function loadSuppliersAndPurchasing(){
 if(!db||!store||!user)return false;
 const token=++suppliersReadToken,storeId=store.id,actor=user.id;
 const selected=new Map(["po-supplier","rec-supplier","sacc-supplier","po-supplier-filter","rec-supplier-filter","sacc-supplier-filter"].map(id=>[id,$(id)?.value]));
 const current=()=>token===suppliersReadToken&&store?.id===storeId&&user?.id===actor;
 suppliersReady=false;suppliersScope=null;suppliersList=[];purchaseOrdersList=[];supplierLedgerList=[];populateSupplierSelectors();clearSupplierViews();msg("suppliers-read-scope","وەرگرتنی دابینکەران و کڕین…");
 try{
  const result=await window.RetailSupplierAccounts.read({db,store:storeId});if(!current())return false;
  const pinned=[...new Set([...selected.values()].filter(id=>id&&id!=="all"&&!result.suppliers.some(s=>s.id===id)))];
  const added=await Promise.all(pinned.map(id=>window.RetailSupplierDirectory.one({db,store:storeId,id})));if(!current())return false;
  result.suppliers.push(...added);window.RetailSupplierAccounts.totals(result.suppliers,result.orders,result.ledger);
  suppliersList=result.suppliers;purchaseOrdersList=result.orders;supplierLedgerList=result.ledger;suppliersScope=result;suppliersReady=true;
  saveLocalSuppliers(suppliersList);saveLocalPurchaseOrders(purchaseOrdersList);saveLocalSupplierLedger(supplierLedgerList);populateSupplierSelectors();
  for(const [id,value] of selected){const el=$(id);if(el&&[...el.options].some(o=>o.value===value))el.value=value;}
  renderSupplierReadScope();syncSupplierReads();return true;
 }catch(error){if(current()){suppliersReady=false;suppliersScope=null;suppliersList=[];purchaseOrdersList=[];supplierLedgerList=[];populateSupplierSelectors();clearSupplierViews();msg("suppliers-read-scope",safe(error),"error");}return false;}
}
function syncPoTotalCost(autoUnit=false){
 const prodId=String($("po-product")?.value||"");
 const p=products.find(x=>x.id===prodId);
 const isKg=p?.base_unit==="kg";
 const qtyIn=$("po-qty"),unitIn=$("po-unit-cost"),totIn=$("po-total-cost");
 if(qtyIn){
   qtyIn.step=isKg?"0.001":"1";
   qtyIn.min=isKg?"0.001":"1";
 }
 if(autoUnit&&unitIn&&p){
   const cost=getProductUnitCostInfo(p.id).unitCost;
   unitIn.value=cost===null?"":String(cost);
 }
 const qty=Math.max(0,Number(qtyIn?.value||0));
 const unitCost=Math.max(0,Number(unitIn?.value||0));
 const total=Math.round(qty*unitCost);
 if(totIn)totIn.value=money(total);
}
function syncRecTotalCost(autoUnit=false){
 const prodId=String($("rec-product")?.value||"");
 const p=products.find(x=>x.id===prodId);
 const isKg=p?.base_unit==="kg";
 const qtyIn=$("rec-qty"),unitIn=$("rec-unit-cost"),totIn=$("rec-total-cost");
 if(qtyIn){
   qtyIn.step=isKg?"0.001":"1";
   qtyIn.min=isKg?"0.001":"1";
 }
 if(autoUnit&&unitIn&&p){
   const cost=getProductUnitCostInfo(p.id).unitCost;
   unitIn.value=cost===null?"":String(cost);
 }
 const qty=Math.max(0,Number(qtyIn?.value||0));
 const unitCost=Math.max(0,Number(unitIn?.value||0));
 const total=Math.round(qty*unitCost);
 if(totIn)totIn.value=money(total);
}
function populateSupplierSelectors(){
 const activeSups=suppliersList.filter(s=>s&&s.active!==false);
 for(const [id,allowGeneral,generalLabel] of [
   ["po-supplier",true,"دابینکەری گشتی"],
   ["rec-supplier",true,"دابینکەری گشتی (بێ ناو)"],
   ["sacc-supplier",false,""]
 ]){
   const sel=$(id);if(!sel)continue;
   const prev=sel.value;
   sel.replaceChildren();
   if(allowGeneral){
     const gOpt=document.createElement("option");
     gOpt.value="";gOpt.textContent=generalLabel;
     sel.append(gOpt);
   }
   const list=id==="sacc-supplier"?[...activeSups].sort((a,b)=>Number(b.balance_minor||0)-Number(a.balance_minor||0)):activeSups;
   for(const s of list){
     const opt=document.createElement("option");
     opt.value=s.id;
     const bal=Number(s.balance_minor||0);
     opt.textContent=s.name+(s.company?" ("+s.company+")":"")+(bal>0?" — قەرز: "+money(bal):"");
     sel.append(opt);
   }
   if([...sel.options].some(o=>o.value===prev))sel.value=prev;
 }
 for(const id of ["po-supplier-filter","rec-supplier-filter","sacc-supplier-filter"]){
   const sel=$(id);if(!sel)continue;
   const prev=sel.value||"all";
   sel.replaceChildren();
   const allOpt=document.createElement("option");
   allOpt.value="all";allOpt.textContent="هەموو دابینکەران";
   sel.append(allOpt);
   for(const s of activeSups){
     const opt=document.createElement("option");
     opt.value=s.id;
     opt.textContent=s.name+(Number(s.balance_minor||0)>0?" ("+money(s.balance_minor)+")":"");
     sel.append(opt);
   }
   if([...sel.options].some(o=>o.value===prev))sel.value=prev;
 }
 populateStockSelectors();
 syncPoTotalCost(!Number($("po-unit-cost")?.value));
 syncRecTotalCost(!Number($("rec-unit-cost")?.value));
}
async function recordSupplierLedgerEntry({supplierId="",entryType,amount,invoiceNo="",productId=null,productName="",quantity=null,unitCost=null,paymentMethod="credit",note="",targetMsgId=""}){
 if(!store||!user||!suppliersReady){if(targetMsgId)msg(targetMsgId,"سەرەتا دابینکەران و کڕین نوێ بکەرەوە","error");return null;}
 const writeStore=store.id,writeActor=user.id,writeEpoch=supplierIdentityEpoch;
 const current=()=>store?.id===writeStore&&user?.id===writeActor&&supplierIdentityEpoch===writeEpoch;
 const sup=supplierId?suppliersList.find(s=>s.id===supplierId):null;
 if(supplierId&&!sup){if(targetMsgId)msg(targetMsgId,"دابینکەرەکە نەدۆزرایەوە","error");return null;}
 const amt=Math.round(Number(amount||0));
 if(!Number.isSafeInteger(amt)||amt<0||amt>9999999999999){
   if(targetMsgId)msg(targetMsgId,"بڕی پارەی وەسڵ نادروستە","error");
   return null;
 }
 let reqId=null;
 const oldBal=Number(sup?.balance_minor||0);
 const delta=(entryType==="payment_sent"||entryType==="return_to_supplier")?-amt:entryType==="purchase_cash"?0:amt;
 let newBal=sup?Math.max(0,oldBal+delta):0;
 let entryId=crypto.randomUUID();
 if(!db)throw new Error("پەیوەندیی سێرڤەر بەردەست نییە");
 try{
   const result=await financialRpc("supplier-ledger","retail_record_supplier_ledger_v21",{
     p_store:store.id,p_supplier:supplierId||null,p_entry_type:entryType,p_amount:amt,
     p_note:note||null,p_invoice_no:invoiceNo||null,p_product_id:productId||null,
     p_product_name:productName||null,p_quantity:quantity!==null?Number(quantity):null,
     p_unit_cost:unitCost!==null?Math.round(Number(unitCost)):null,p_payment_method:paymentMethod||"credit"
   });
   if(!current())return null;
   if(!result.entry_id)throw Error("سێرڤەر ناسنامەی مامەڵەکەی نەگەڕاندەوە");
   entryId=result.entry_id;newBal=window.RetailSupplierAccounts.integer(result.balance_after_minor);reqId=result.request_id;
   window.RetailSupplierAccounts.totals(suppliersList.map(s=>s.id===supplierId?{...s,balance_minor:newBal}:s),purchaseOrdersList,supplierLedgerList);
 }catch(err){if(current())msg(targetMsgId||"system-msg",safe(err),"error");return null;}
 if(sup){
   sup.balance_minor=newBal;
   sup.updated_at=new Date().toISOString();
   saveLocalSuppliers(suppliersList);
 }
 const ledgerItem={
   id:entryId,
   store_id:writeStore,
   supplier_id:sup?sup.id:null,
   supplier_name:sup?sup.name:"دابینکەری گشتی",
   entry_type:entryType,
   amount_minor:amt,
   delta_minor:delta,
   balance_after_minor:newBal,
   invoice_no:invoiceNo||null,
   product_id:productId||null,
   product_name:productName||null,
   quantity:quantity!==null?Number(quantity):null,
   unit_cost_minor:unitCost!==null?Math.round(Number(unitCost)):null,
   payment_method:paymentMethod||"credit",
   note:note||"",
   actor_id:writeActor,
   request_id:reqId,
   created_at:new Date().toISOString()
 };
 const index=supplierLedgerList.findIndex(x=>x.id===entryId);
 if(index>=0)supplierLedgerList[index]=ledgerItem;else{supplierLedgerList.unshift(ledgerItem);supplierLedgerList=supplierLedgerList.slice(0,500);if(suppliersScope)suppliersScope.ledgerTotal++;}
 renderSupplierReadScope();
 saveLocalSupplierLedger(supplierLedgerList);
 populateSupplierSelectors();
 return ledgerItem;
}
async function refreshSuppliersSection(sub=supSub){
 if(!await loadSuppliersAndPurchasing())return;
 if(sub==="orders")await refreshPurchaseOrders();
 if(sub==="suppliers")await refreshSupplierDirectory();
 if(sub==="receiving")renderGoodsReceivingView();
 if(sub==="accounts")renderSupplierAccountsView();
}
function clearPurchaseOrderPage(){
 clearTimeout(poTimer);++poToken;poRows=[];poOffset=0;poTotal=0;poFilters=null;poReady=false;poLoading=false;$("po-list")?.replaceChildren();if($("po-print-box")){$("po-print-box").replaceChildren();$("po-print-box").hidden=true;}
 for(const id of ["po-kpi-total","po-kpi-pending","po-kpi-cost","po-kpi-received"])if($(id))$(id).textContent="—";syncPurchaseOrderPager();
}
function filterPurchaseOrderRows(){return poRows;}
function syncPurchaseOrderPager(){
 if($("po-prev"))$("po-prev").disabled=busy||poLoading||!poReady||poOffset<=0;
 if($("po-next"))$("po-next").disabled=busy||poLoading||!poReady||poOffset+50>=poTotal;
 if($("po-export-csv"))$("po-export-csv").disabled=busy||!suppliersReady||!poReady||!filterPurchaseOrderRows().length;
 if($("po-page-info"))$("po-page-info").textContent=poReady?(poRows.length?(poOffset+1)+"–"+(poOffset+poRows.length)+" / "+poTotal:"0 / "+poTotal):"—";
}
async function refreshPurchaseOrders(reset=true){
 if(!db||!store||!user||!suppliersReady)return;
 clearTimeout(poTimer);const token=++poToken,storeId=store.id,actor=user.id;
 const current=()=>token===poToken&&store?.id===storeId&&user?.id===actor&&suppliersReady;
 poReady=false;poLoading=true;poRows=[];poTotal=0;$("po-print-box").replaceChildren();$("po-print-box").hidden=true;renderPurchaseOrdersView();syncPurchaseOrderPager();msg("po-read-scope","وەرگرتنی لیستی داواکارییەکان…");
 try{
  if(reset||!poFilters){poOffset=0;poFilters=window.RetailPurchaseOrderPages.criteria({query:$("po-search").value,field:$("po-search-field").value,status:$("po-status-filter").value,supplier:$("po-supplier-filter").value});}
  let result=await window.RetailPurchaseOrderPages.read({db,store:storeId,filters:poFilters,offset:poOffset});if(!current())return;
  if(poOffset>0&&!result.rows.length&&result.total<=poOffset){poOffset=result.total?Math.floor((result.total-1)/50)*50:0;result=await window.RetailPurchaseOrderPages.read({db,store:storeId,filters:poFilters,offset:poOffset});if(!current())return;}
  poRows=result.rows;poTotal=result.total;poReady=true;renderPurchaseOrdersView();msg("po-read-scope","گەڕان و دۆخی حیساب لە سێرڤەرەوە — پوختە، CSV تەنها بۆ ئەم پەڕەیەن");
 }catch(error){if(current()){poRows=[];poTotal=0;poFilters=null;poReady=false;renderPurchaseOrdersView();msg("po-read-scope",safe(error),"error");}}
 finally{if(token===poToken){poLoading=false;syncPurchaseOrderPager();}}
}
function invalidatePurchaseOrders(){clearPurchaseOrderPage();poLoading=true;syncPurchaseOrderPager();poTimer=setTimeout(()=>{if(!busy)void refreshPurchaseOrders();else{poLoading=false;syncPurchaseOrderPager();}},200);}
function renderPurchaseOrdersView(){
 const root=$("po-list");if(!root)return;root.replaceChildren();
 if(!suppliersReady||!poReady){for(const id of ["po-kpi-total","po-kpi-pending","po-kpi-received","po-kpi-cost"])if($(id))$(id).textContent="—";syncPurchaseOrderPager();return;}
 if($("po-expected-date")&&!$("po-expected-date").value)$("po-expected-date").value=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 const filtered=poRows,totals=window.RetailPurchaseOrderPages.totals(filtered);
 $("po-kpi-total").textContent=String(totals.count);$("po-kpi-pending").textContent=String(totals.pending);$("po-kpi-received").textContent=String(totals.received);$("po-kpi-cost").textContent=money(totals.pendingCost);syncPurchaseOrderPager();
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ داواکارییەک لەم پاڵاوتنەدا نەدۆزرایەوە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ژمارەی داواکاری</th><th>دابینکەر</th><th>کاڵا</th><th>بڕی داواکراو</th><th>نرخی تاک</th><th>کۆی تێچوو</th><th>بەرواری چاوەڕوانکراو</th><th>دۆخ</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const o of filtered){
   const tr=document.createElement("tr");
   const sup=suppliersList.find(s=>s.id===o.supplier_id);
   const prod=products.find(p=>p.id===o.product_id);
   const isKg=prod?.base_unit==="kg";
   const unitLabel=prod?(isKg?"کگم":"دانە"):"یەکە نادیارە";
   const tdNo=document.createElement("td");tdNo.dir="ltr";tdNo.style.fontWeight="800";tdNo.textContent=o.po_no||"—";
   const tdSup=document.createElement("td");tdSup.textContent=o.supplier_name||sup?.name||"دابینکەری گشتی";
   const tdProd=document.createElement("td");tdProd.style.fontWeight="850";tdProd.textContent=o.product_name||prod?.name||"—";
   const tdQty=document.createElement("td");tdQty.textContent=Number(o.quantity||0).toLocaleString("en-US",{maximumFractionDigits:3})+" "+unitLabel;
   const tdUnit=document.createElement("td");tdUnit.dir="ltr";tdUnit.textContent=money(o.unit_cost_minor||0);
   const tdTot=document.createElement("td");tdTot.dir="ltr";tdTot.style.fontWeight="900";tdTot.textContent=money(o.total_cost_minor||0);
   const tdDate=document.createElement("td");tdDate.dir="ltr";tdDate.textContent=o.expected_date||"—";
   const tdStatus=document.createElement("td");
   const badge=document.createElement("span");
   badge.className="stock-badge "+(o.status==="received"?"ok":o.status==="cancelled"?"danger":"warn");
   badge.textContent=o.status==="received"?"وەرگیراو لە کۆگا":o.status==="cancelled"?"هەڵوەشاوە":o.status==="ordered"?"داواکراو":"لە چاوەڕوانیدا";
   tdStatus.append(badge);
   const tdAct=document.createElement("td");
   if(o.status==="pending"){
     const recBtn=document.createElement("button");
     recBtn.type="button";recBtn.className="stock-pick-btn";
     recBtn.dataset.poReceive=o.id;recBtn.textContent="📦 وەرگرتن لە کۆگا";
     const cancelBtn=document.createElement("button");
     cancelBtn.type="button";cancelBtn.className="stock-action-btn";
     cancelBtn.dataset.poCancel=o.id;cancelBtn.textContent="هەڵوەشاندنەوە";
     tdAct.append(recBtn,cancelBtn);
   }
   const printBtn=document.createElement("button");
   printBtn.type="button";printBtn.className="stock-action-btn";
   printBtn.dataset.poPrint=o.id;printBtn.textContent="🖨 چاپ";
   tdAct.append(printBtn);
   tr.append(tdNo,tdSup,tdProd,tdQty,tdUnit,tdTot,tdDate,tdStatus,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function renderPurchaseOrderPrintBox(order){
 if(!suppliersReady)return;
 const box=$("po-print-box");
 if(!box)return;
 const o=order&&order.store_id===store?.id?order:null;
 if(!o){box.hidden=true;return;}
 const sup=suppliersList.find(s=>s.id===o.supplier_id);
 const prod=products.find(p=>p.id===o.product_id);
 box.replaceChildren();
 box.hidden=false;
 const head=document.createElement("div");
 head.style.display="flex";head.style.justifyContent="space-between";head.style.alignItems="center";head.style.flexWrap="wrap";head.style.gap="8px";
 const h3=document.createElement("h3");h3.style.margin="0";
 h3.textContent="فۆرمی داواکاری کڕین — "+(o.po_no||"PO");
 const act=document.createElement("div");act.style.display="flex";act.style.gap="8px";
 const pBtn=document.createElement("button");
 pBtn.type="button";pBtn.className="primary";pBtn.style.height="34px";pBtn.textContent="🖨 چاپکردنی داواکاری";
 pBtn.addEventListener("click",()=>window.print());
 const cBtn=document.createElement("button");
 cBtn.type="button";cBtn.className="secondary";cBtn.style.height="34px";cBtn.textContent="داخستن";
 cBtn.addEventListener("click",()=>{box.hidden=true;});
 act.append(pBtn,cBtn);
 head.append(h3,act);
 box.append(head);
 const metrics=document.createElement("div");metrics.className="receipt-metrics";
 for(const [lbl,val] of [
   ["ژمارەی داواکاری",o.po_no||"—"],
   ["دابینکەر",o.supplier_name||sup?.name||"دابینکەری گشتی"],
   ["کاڵا",o.product_name||prod?.name||"—"],
   ["بڕی داواکراو",Number(o.quantity||0).toLocaleString("en-US",{maximumFractionDigits:3})],
   ["نرخی تێچووی تاک",money(o.unit_cost_minor||0)],
   ["کۆی گشتی تێچوو",money(o.total_cost_minor||0)],
   ["بەرواری چاوەڕوانکراو",o.expected_date||"—"],
   ["تێبینی",o.note||"—"]
 ]){
   const sp=document.createElement("span"),st=document.createElement("strong");
   sp.textContent=lbl+": ";st.textContent=val;sp.append(st);metrics.append(sp);
 }
 box.append(metrics);
}
function clearSupplierDirectoryPage(){
 clearTimeout(supDirectoryTimer);++supDirectoryToken;supDirectoryRows=[];supDirectoryOffset=0;supDirectoryTotal=0;supDirectoryFilters=null;supDirectoryReady=false;supDirectoryLoading=false;$("suppliers-list")?.replaceChildren();
 for(const id of ["sup-kpi-total","sup-kpi-creditors","sup-kpi-total-payable","sup-kpi-prepaid"])if($(id))$(id).textContent="—";syncSupplierDirectoryPager();
}
function filterSupplierDirectoryRows(){return supDirectoryRows;}
function syncSupplierDirectoryPager(){
 if($("sup-prev"))$("sup-prev").disabled=busy||supDirectoryLoading||!supDirectoryReady||supDirectoryOffset<=0;
 if($("sup-next"))$("sup-next").disabled=busy||supDirectoryLoading||!supDirectoryReady||supDirectoryOffset+50>=supDirectoryTotal;
 if($("sup-export-csv"))$("sup-export-csv").disabled=busy||!suppliersReady||!supDirectoryReady||!filterSupplierDirectoryRows().length;
 if($("sup-page-info"))$("sup-page-info").textContent=supDirectoryReady?(supDirectoryRows.length?(supDirectoryOffset+1)+"–"+(supDirectoryOffset+supDirectoryRows.length)+" / "+supDirectoryTotal:"0 / "+supDirectoryTotal):"—";
}
async function refreshSupplierDirectory(reset=true){
 if(!db||!store||!user||!suppliersReady)return;
 clearTimeout(supDirectoryTimer);const token=++supDirectoryToken,storeId=store.id,actor=user.id;
 const current=()=>token===supDirectoryToken&&store?.id===storeId&&user?.id===actor&&suppliersReady;
 supDirectoryReady=false;supDirectoryLoading=true;supDirectoryRows=[];supDirectoryTotal=0;renderSuppliersDirectoryView();syncSupplierDirectoryPager();msg("sup-directory-scope","وەرگرتنی لیستی دابینکەران…");
 try{
  if(reset||!supDirectoryFilters){supDirectoryOffset=0;supDirectoryFilters=window.RetailSupplierDirectory.criteria({query:$("sup-search").value,field:$("sup-search-field").value,status:$("sup-filter").value});}
  let result=await window.RetailSupplierDirectory.read({db,store:storeId,filters:supDirectoryFilters,offset:supDirectoryOffset});if(!current())return;
  if(supDirectoryOffset>0&&!result.rows.length&&result.total<=supDirectoryOffset){supDirectoryOffset=result.total?Math.floor((result.total-1)/50)*50:0;result=await window.RetailSupplierDirectory.read({db,store:storeId,filters:supDirectoryFilters,offset:supDirectoryOffset});if(!current())return;}
  supDirectoryRows=result.rows;supDirectoryTotal=result.total;supDirectoryReady=true;renderSuppliersDirectoryView();msg("sup-directory-scope","گەڕان و دۆخی حیساب لە سێرڤەرەوە — پوختە، CSV تەنها بۆ ئەم پەڕەیەن");
 }catch(error){if(current()){supDirectoryRows=[];supDirectoryTotal=0;supDirectoryFilters=null;supDirectoryReady=false;renderSuppliersDirectoryView();msg("sup-directory-scope",safe(error),"error");}}
 finally{if(token===supDirectoryToken){supDirectoryLoading=false;syncSupplierDirectoryPager();}}
}
function invalidateSupplierDirectory(){clearSupplierDirectoryPage();supDirectoryLoading=true;syncSupplierDirectoryPager();supDirectoryTimer=setTimeout(()=>{if(!busy)void refreshSupplierDirectory();else{supDirectoryLoading=false;syncSupplierDirectoryPager();}},200);}
function renderSuppliersDirectoryView(){
 const root=$("suppliers-list");if(!root)return;root.replaceChildren();
 if(!suppliersReady||!supDirectoryReady){for(const id of ["sup-kpi-total","sup-kpi-creditors","sup-kpi-total-payable","sup-kpi-prepaid"])if($(id))$(id).textContent="—";syncSupplierDirectoryPager();return;}
 const filtered=supDirectoryRows,totals=window.RetailSupplierDirectory.totals(filtered);
 $("sup-kpi-total").textContent=String(filtered.length);$("sup-kpi-creditors").textContent=String(totals.creditors);$("sup-kpi-total-payable").textContent=money(totals.payable);$("sup-kpi-prepaid").textContent=String(totals.prepaid);syncSupplierDirectoryPager();
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ دابینکەرێک لەم گەڕانەدا نەدۆزرایەوە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ناوی دابینکەر / مەندووب</th><th>کۆمپانیا</th><th>مۆبایل</th><th>جۆری کاڵا</th><th>قەرزی ماوە لەسەر فرۆشگا</th><th>دۆخ</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const s of filtered){
   const tr=document.createElement("tr");
   const bal=Number(s.balance_minor||0);
   const tdName=document.createElement("td");tdName.style.fontWeight="850";tdName.textContent=s.name;
   const tdComp=document.createElement("td");tdComp.textContent=s.company||"—";
   const tdPhone=document.createElement("td");tdPhone.dir="ltr";tdPhone.textContent=s.phone||"—";
   const tdCat=document.createElement("td");tdCat.textContent=s.category||"—";
   const tdBal=document.createElement("td");tdBal.dir="ltr";tdBal.style.fontWeight="900";
   tdBal.style.color=bal>0?"#dc2626":"#15803d";
   tdBal.textContent=money(bal);
   const tdStatus=document.createElement("td");
   const badge=document.createElement("span");
   badge.className="stock-badge "+(bal>0?"warn":"ok");
   badge.textContent=bal>0?"قەرزدارین پێی":bal<0?"باڵانسی پێشەکی":"حیساب پاک (0)";
   tdStatus.append(badge);
   const tdAct=document.createElement("td");
   const btnOrder=document.createElement("button");
   btnOrder.type="button";btnOrder.className="stock-pick-btn";
   btnOrder.dataset.supOrder=s.id;btnOrder.textContent="+ داواکاری";
   const btnRec=document.createElement("button");
   btnRec.type="button";btnRec.className="stock-action-btn";
   btnRec.dataset.supReceive=s.id;btnRec.textContent="📦 وەرگرتنی کاڵا";
   const btnPay=document.createElement("button");
   btnPay.type="button";btnPay.className="stock-action-btn";
   btnPay.dataset.supPay=s.id;btnPay.textContent="💳 پارەدان";
   const btnStm=document.createElement("button");
   btnStm.type="button";btnStm.className="stock-action-btn";
   btnStm.dataset.supStatement=s.id;btnStm.textContent="📄 مامەڵە بارکراوەکان";
   const btnEdit=document.createElement("button");
   btnEdit.type="button";btnEdit.className="stock-action-btn";
   btnEdit.dataset.supEdit=s.id;btnEdit.textContent="دەستکاری";
   tdAct.append(btnOrder,btnRec,btnPay,btnStm,btnEdit);
   tr.append(tdName,tdComp,tdPhone,tdCat,tdBal,tdStatus,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function renderGoodsReceivingView(){
 if(supplierReadUnavailable("receiving-list"))return;
 const root=$("receiving-list");
 if(!root)return;
 root.replaceChildren();
 const receipts=supplierLedgerList.filter(x=>x.entry_type==="purchase_credit"||x.entry_type==="purchase_cash");
 const totalCost=receipts.reduce((s,x)=>s+Number(x.amount_minor||0),0);
 const cashCost=receipts.filter(x=>x.entry_type==="purchase_cash").reduce((s,x)=>s+Number(x.amount_minor||0),0);
 const creditCost=receipts.filter(x=>x.entry_type==="purchase_credit").reduce((s,x)=>s+Number(x.amount_minor||0),0);
 if($("rec-kpi-count"))$("rec-kpi-count").textContent=receipts.length.toLocaleString("en-US");
 if($("rec-kpi-total"))$("rec-kpi-total").textContent=money(totalCost);
 if($("rec-kpi-cash"))$("rec-kpi-cash").textContent=money(cashCost);
 if($("rec-kpi-credit"))$("rec-kpi-credit").textContent=money(creditCost);

 const q=String($("rec-search")?.value||"").trim().toLocaleLowerCase();
 const supFilter=String($("rec-supplier-filter")?.value||"all");
 const modeFilter=String($("rec-mode-filter")?.value||"all");
 const filtered=receipts.filter(r=>{
   if(supFilter!=="all"&&String(r.supplier_id||"")!==supFilter)return false;
   if(modeFilter==="credit"&&r.entry_type!=="purchase_credit")return false;
   if(modeFilter==="cash"&&r.entry_type!=="purchase_cash")return false;
   if(!q)return true;
   const sup=suppliersList.find(s=>s.id===r.supplier_id);
   const prod=products.find(p=>p.id===r.product_id);
   return ((r.invoice_no||"")+" "+(sup?.name||r.supplier_name||"")+" "+(prod?.name||r.product_name||"")+" "+(r.note||"")).toLocaleLowerCase().includes(q);
 });

 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ وەسڵێکی وەرگرتنی کاڵا لەم پاڵاوتنەدا تۆمار نەکراوە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کات و بەروار</th><th>ژمارەی وەسڵ</th><th>دابینکەر</th><th>کاڵای وەرگیراو</th><th>بڕی هاتوو</th><th>نرخی تاک</th><th>کۆی وەسڵ</th><th>شێوازی پارەدان</th><th>تێبینی</th></tr></thead><tbody></tbody>";
 for(const r of filtered){
   const tr=document.createElement("tr");
   const sup=suppliersList.find(s=>s.id===r.supplier_id);
   const prod=products.find(p=>p.id===r.product_id);
   const isKg=prod?.base_unit==="kg";
   const unitLabel=isKg?"کگم":"دانە";
   const tdTime=document.createElement("td");tdTime.dir="ltr";tdTime.textContent=r.created_at?new Date(r.created_at).toLocaleString("en-GB"):"—";
   const tdInv=document.createElement("td");tdInv.dir="ltr";tdInv.style.fontWeight="800";tdInv.textContent=r.invoice_no||"—";
   const tdSup=document.createElement("td");tdSup.textContent=sup?.name||r.supplier_name||"دابینکەری گشتی";
   const tdProd=document.createElement("td");tdProd.style.fontWeight="850";tdProd.textContent=prod?.name||r.product_name||"—";
   const tdQty=document.createElement("td");tdQty.textContent=r.quantity!=null?(Number(r.quantity).toLocaleString("en-US",{maximumFractionDigits:3})+" "+unitLabel):"—";
   const tdUnit=document.createElement("td");tdUnit.dir="ltr";tdUnit.textContent=r.unit_cost_minor!=null?money(r.unit_cost_minor):"—";
   const tdTot=document.createElement("td");tdTot.dir="ltr";tdTot.style.fontWeight="900";tdTot.textContent=money(r.amount_minor||0);
   const tdMode=document.createElement("td");
   const badge=document.createElement("span");
   badge.className="stock-badge "+(r.entry_type==="purchase_credit"?"warn":"ok");
   badge.textContent=r.entry_type==="purchase_credit"?"بە قەرز (لەسەر حیساب)":r.payment_method==="cash_drawer"?"نەقد (سندووقی کاشێر)":"نەقد (قاسەی سەرەکی)";
   tdMode.append(badge);
   const tdNote=document.createElement("td");tdNote.textContent=r.note||"—";
   tr.append(tdTime,tdInv,tdSup,tdProd,tdQty,tdUnit,tdTot,tdMode,tdNote);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function supplierEntryTypeMeta(type){
 if(type==="purchase_credit")return {label:"کڕینی کاڵا بە قەرز",cls:"warn"};
 if(type==="purchase_cash")return {label:"کڕینی کاڵا بە نەقد",cls:"info"};
 if(type==="payment_sent")return {label:"پێدانی پارە بە دابینکەر",cls:"ok"};
 if(type==="return_to_supplier")return {label:"گەڕاندنەوەی کاڵا بۆ دابینکەر",cls:"ok"};
 if(type==="opening_balance")return {label:"قەرزی سەرەتایی / دەستی",cls:"danger"};
 return {label:type||"مامەڵە",cls:"info"};
}
function filterSupplierAccountsRows(){
 const supFilter=String($("sacc-supplier-filter")?.value||"all");
 const typeFilter=String($("sacc-type-filter")?.value||"all");
 const dateFilter=String($("sacc-date-filter")?.value||"all");
 const q=String($("sacc-search")?.value||"").trim().toLocaleLowerCase();
 const now=Date.now();
 return supplierLedgerList.filter(item=>{
   if(supFilter!=="all"&&String(item.supplier_id||"")!==supFilter)return false;
   if(typeFilter!=="all"&&item.entry_type!==typeFilter)return false;
   if(dateFilter!=="all"&&item.created_at){
     const ts=new Date(item.created_at).getTime();
     if(Number.isFinite(ts)){
       if(dateFilter==="today"){
         const d=new Date(ts),t=new Date();
         if(d.getFullYear()!==t.getFullYear()||d.getMonth()!==t.getMonth()||d.getDate()!==t.getDate())return false;
       }else if(dateFilter==="7d"&&(now-ts)>7*86400000)return false;
       else if(dateFilter==="30d"&&(now-ts)>30*86400000)return false;
     }
   }
   if(!q)return true;
   const sup=suppliersList.find(s=>s.id===item.supplier_id);
   const meta=supplierEntryTypeMeta(item.entry_type).label;
   return ((sup?.name||item.supplier_name||"")+" "+meta+" "+(item.invoice_no||"")+" "+(item.product_name||"")+" "+(item.note||"")).toLocaleLowerCase().includes(q);
 });
}
function renderSupplierAccountsView(){
 if(supplierReadUnavailable("supplier-accounts-list"))return;
 const root=$("supplier-accounts-list");
 if(!root)return;
 root.replaceChildren();
 const totalPayable=window.RetailSupplierAccounts.totals(suppliersList,[],[]).payable;
 const filtered=filterSupplierAccountsRows();
 let paidSum=0,purchasesSum=0;
 for(const item of filtered){
   const amt=Number(item.amount_minor||0);
   if(item.entry_type==="payment_sent"||item.entry_type==="return_to_supplier")paidSum+=amt;
   if(item.entry_type==="purchase_credit"||item.entry_type==="purchase_cash"||item.entry_type==="opening_balance")purchasesSum+=amt;
 }
 if($("sacc-kpi-payable"))$("sacc-kpi-payable").textContent=money(totalPayable);
 if($("sacc-kpi-paid"))$("sacc-kpi-paid").textContent=money(paidSum);
 if($("sacc-kpi-purchases"))$("sacc-kpi-purchases").textContent=money(purchasesSum);
 if($("sacc-kpi-count"))$("sacc-kpi-count").textContent=filtered.length.toLocaleString("en-US");

 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ جووڵەیەکی حیساباتی دابینکەران لەم پاڵاوتنەدا نییە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کات و بەروار</th><th>دابینکەر</th><th>جۆری مامەڵە</th><th>ژمارەی وەسڵ</th><th>بڕی مامەڵە</th><th>قەرزی ماوە دوای مامەڵە</th><th>تێبینی</th></tr></thead><tbody></tbody>";
 for(const item of filtered){
   const tr=document.createElement("tr");
   const sup=suppliersList.find(s=>s.id===item.supplier_id);
   const meta=supplierEntryTypeMeta(item.entry_type);
   const tdTime=document.createElement("td");tdTime.dir="ltr";tdTime.textContent=item.created_at?new Date(item.created_at).toLocaleString("en-GB"):"—";
   const tdSup=document.createElement("td");tdSup.style.fontWeight="850";tdSup.textContent=sup?.name||item.supplier_name||"دابینکەری گشتی";
   const tdType=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+meta.cls;badge.textContent=meta.label;
   tdType.append(badge);
   const tdInv=document.createElement("td");tdInv.dir="ltr";tdInv.textContent=item.invoice_no||"—";
   const tdAmt=document.createElement("td");tdAmt.dir="ltr";tdAmt.style.fontWeight="900";
   tdAmt.style.color=(item.entry_type==="payment_sent"||item.entry_type==="return_to_supplier")?"#15803d":item.entry_type==="purchase_cash"?"#168db7":"#dc2626";
   tdAmt.textContent=((item.entry_type==="payment_sent"||item.entry_type==="return_to_supplier")?"−":item.entry_type==="purchase_cash"?"":"+")+money(item.amount_minor||0);
   const tdAfter=document.createElement("td");tdAfter.dir="ltr";tdAfter.style.fontWeight="800";
   tdAfter.textContent=money(item.balance_after_minor??sup?.balance_minor??0);
   const tdNote=document.createElement("td");tdNote.textContent=item.note||(item.product_name?item.product_name:"—");
   tr.append(tdTime,tdSup,tdType,tdInv,tdAmt,tdAfter,tdNote);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function renderSupplierStatementBox(supplierIdOverride){
 if(!suppliersReady)return;
 const box=$("supplier-statement-box");
 if(!box)return;
 const chosenId=supplierIdOverride||($("sacc-supplier-filter")?.value!=="all"?$("sacc-supplier-filter")?.value:"")||$("sacc-supplier")?.value||suppliersList[0]?.id||"";
 const sup=suppliersList.find(s=>s.id===chosenId);
 if(!sup){
   box.hidden=true;
   msg("sacc-msg","تکایە سەرەتا دابینکەرێک دیاری بکە بۆ پیشاندانی کەشف حیساب","error");
   return;
 }
 box.replaceChildren();
 box.hidden=false;
 const rows=supplierLedgerList.filter(x=>x.supplier_id===sup.id);
 const totalCredited=rows.filter(x=>x.entry_type==="purchase_credit"||x.entry_type==="opening_balance").reduce((s,x)=>s+Number(x.amount_minor||0),0);
 const totalPaid=rows.filter(x=>x.entry_type==="payment_sent"||x.entry_type==="return_to_supplier").reduce((s,x)=>s+Number(x.amount_minor||0),0);
 const head=document.createElement("div");
 head.style.display="flex";head.style.justifyContent="space-between";head.style.alignItems="center";head.style.flexWrap="wrap";head.style.gap="8px";
 const h3=document.createElement("h3");h3.style.margin="0";
 h3.textContent="مامەڵە بارکراوەکانی دابینکەر: "+sup.name+(sup.company?" ("+sup.company+")":"");
 const actWrap=document.createElement("div");actWrap.style.display="flex";actWrap.style.gap="8px";
 const printBtn=document.createElement("button");
 printBtn.type="button";printBtn.className="primary";printBtn.style.height="34px";
 printBtn.textContent="🖨 چاپکردنی تۆمارە بارکراوەکان";
 printBtn.addEventListener("click",()=>window.print());
 const closeBtn=document.createElement("button");
 closeBtn.type="button";closeBtn.className="secondary";closeBtn.style.height="34px";
 closeBtn.textContent="داخستن";
 closeBtn.addEventListener("click",()=>{box.hidden=true;});
 actWrap.append(printBtn,closeBtn);
 head.append(h3,actWrap);
 box.append(head);

 const metrics=document.createElement("div");metrics.className="receipt-metrics";
 for(const [lbl,val] of [
   ["کۆی کڕینی بە قەرز",money(totalCredited)],
   ["کۆی پارەدانی دراو و گەڕاوە",money(totalPaid)],
   ["قەرزی ماوەی ئێستا لەسەر فرۆشگا",money(sup.balance_minor||0)],
   ["مۆبایل",sup.phone||"—"]
 ]){
   const sp=document.createElement("span"),st=document.createElement("strong");
   sp.textContent=lbl+": ";st.textContent=val;sp.append(st);metrics.append(sp);
 }
 box.append(metrics);
}
function localFinanceKey(){return store?"retail_finance_entries_v19_"+store.id:null;}
function loadLocalFinanceEntries(){
 const k=localFinanceKey();if(!k)return [];
 try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[];}catch(_e){return [];}
}
function saveLocalFinanceEntries(list){
 const k=localFinanceKey();if(!k)return;
 try{localStorage.setItem(k,JSON.stringify(list));}catch(_e){}
}
async function loadFinanceEntries(){
 if(!store||!db||!canManage())return;
 try{
  const [entries,state]=await Promise.all([
   db.from("retail_finance_entries").select("id,entry_kind,category,amount_minor,wallet,payee,reference_no,note,actor_id,request_id,created_at").eq("store_id",store.id).order("created_at",{ascending:false}).limit(500),
   db.rpc("retail_finance_state_v25",{p_store:store.id,p_session:shiftSession?.id||null})
  ]);
  if(entries.error)throw entries.error;if(state.error)throw state.error;
  if(!Array.isArray(entries.data)||!state.data)throw new Error("زانیاری دارایی پشتڕاست نەکرایەوە");
  financeEntriesList=entries.data;financeState=state.data;saveLocalFinanceEntries(financeEntriesList);
  for(const id of ["fin-tr-msg","fin-rev-msg","fin-exp-msg","fin-cf-msg"])msg(id,"");
 }catch(error){financeEntriesList=[];financeState=null;msg("fin-tr-msg",safe(error),"error");msg("fin-rev-msg",safe(error),"error");msg("fin-exp-msg",safe(error),"error");msg("fin-cf-msg",safe(error),"error");}
}
async function recordFinanceEntry({entryKind,category,amount,wallet="safe",payee="",referenceNo="",note=""}){
 if(!db||!store)throw new Error("پەیوەندیی سێرڤەر بەردەست نییە");
 const amt=Number(amount);
 if(!Number.isSafeInteger(amt)||amt<=0||amt>9999999999999)throw new Error("بڕی پارە نادروستە");
 const needsDrawer=entryKind==="drawer_to_safe"||entryKind==="safe_to_drawer"||wallet==="cash_drawer";
 const result=await financialRpc("finance-entry","retail_record_finance_v25",{p_store:store.id,p_session:shiftSession?.id||null,p_entry:{entry_kind:entryKind,category,amount_minor:amt,wallet,payee:payee||null,reference_no:referenceNo||null,note}});
 if(!result.entry?.id||!result.state)throw new Error("وەڵامی دارایی ناتەواوە؛ پێش دووبارە ناردن تۆمارەکان نوێ بکەرەوە");
 financeEntriesList=[result.entry,...financeEntriesList.filter(x=>x.id!==result.entry.id)];financeState=result.state;saveLocalFinanceEntries(financeEntriesList);
 if(needsDrawer){try{await refreshShift();}catch(error){msg("system-msg","مامەڵە تۆمارکرا؛ نوێکردنەوەی شێفت سەرکەوتوو نەبوو: "+safe(error),"error");}}
 return result.entry;
}
function computeSafeBalance(){return financeState?.safe_balance_minor??NaN;}
async function refreshFinanceSection(sub=finSub){
 await loadFinanceEntries();
 if(!allReceipts.length&&db&&store){
   try{await refreshReceipts();}catch(_e){}
 }
 if(!allMovements.length&&db&&store){
   try{
     const mRes=await db.from("retail_cash_movements").select("id,session_id,actor_id,kind,amount_minor,note,created_at")
       .eq("store_id",store.id).order("created_at",{ascending:false}).limit(200);
     if(!mRes.error&&Array.isArray(mRes.data))allMovements=mRes.data;
   }catch(_e){}
 }
 await refreshShift();
 if(sub==="treasury")renderFinanceTreasuryView();
 if(sub==="revenue")renderFinanceRevenueView();
 if(sub==="expenses")renderFinanceExpensesView();
 if(sub==="cashflow")renderFinanceCashflowView();
}
function renderFinanceTreasuryView(){
 const root=$("fin-treasury-list");
 if(!root)return;
 root.replaceChildren();
 const drawerBal=financeState?.drawer_balance_minor??NaN;
 const safeBal=computeSafeBalance();
 const totalCash=drawerBal+safeBal;
 const custReceivables=financeState?.customer_receivables_minor??NaN;
 const supPayables=financeState?.supplier_payables_minor??NaN;
 const netPosition=totalCash+custReceivables-supPayables;

 if($("fin-kpi-drawer"))$("fin-kpi-drawer").textContent=money(drawerBal);
 if($("fin-kpi-safe"))$("fin-kpi-safe").textContent=money(safeBal);
 if($("fin-kpi-total-cash"))$("fin-kpi-total-cash").textContent=money(totalCash);
 if($("fin-kpi-net-position"))$("fin-kpi-net-position").textContent=money(netPosition);

 const q=String($("fin-tr-search")?.value||"").trim().toLocaleLowerCase();
 const filter=String($("fin-tr-filter")?.value||"all");
 const rows=[];

 if(filter!=="shifts"){
   for(const e of financeEntriesList){
     if(!["drawer_to_safe","safe_to_drawer","safe_deposit","safe_withdraw"].includes(e.entry_kind))continue;
     if(filter==="transfers"&&!["drawer_to_safe","safe_to_drawer"].includes(e.entry_kind))continue;
     if(filter==="safe_ops"&&!["safe_deposit","safe_withdraw"].includes(e.entry_kind))continue;
     const meta=e.entry_kind==="drawer_to_safe"?{label:"گواستنەوە: سندووقی کاشێر ← قاسەی سەرەکی",cls:"ok",sign:"+"}:
       e.entry_kind==="safe_to_drawer"?{label:"گواستنەوە: قاسەی سەرەکی ← سندووقی کاشێر",cls:"warn",sign:"−"}:
       e.entry_kind==="safe_deposit"?{label:"دانانی پارە لە قاسەی سەرەکی",cls:"ok",sign:"+"}:
       {label:"ڕاکێشانی پارە لە قاسەی سەرەکی",cls:"danger",sign:"−"};
     rows.push({
       created_at:e.created_at,
       typeLabel:meta.label,
       badgeCls:meta.cls,
       ref:e.reference_no||"—",
       amountText:meta.sign+money(e.amount_minor||0),
       amountColor:meta.sign==="+"?"#15803d":"#dc2626",
       note:e.note||"—"
     });
   }
 }
 if(filter==="all"||filter==="shifts"){
   for(const s of shiftSessionsHistory){
     rows.push({
       created_at:s.opened_at,
       typeLabel:s.status==="open"?"شێفتی کاشێر (کراوەیە)":"شێفتی کاشێر (داخراوە)",
       badgeCls:s.status==="open"?"info":"ok",
       ref:"SHIFT-"+String(s.id||"").slice(0,6).toUpperCase(),
       amountText:money(s.expected_cash_minor??s.opening_cash_minor??0),
       amountColor:"#168db7",
       note:"پارەی سەرەتا: "+money(s.opening_cash_minor||0)+(s.variance_minor!=null?" | جیاوازی: "+money(s.variance_minor):"")
     });
   }
 }
 rows.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
 const filtered=rows.filter(r=>{
   if(!q)return true;
   return (r.typeLabel+" "+r.ref+" "+r.amountText+" "+r.note).toLocaleLowerCase().includes(q);
 });

 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ تۆمارێکی گواستنەوەی قاسە یان شێفت لەم پاڵاوتنەدا نییە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کات و بەروار</th><th>جۆری مامەڵە / شێفت</th><th>ژمارەی مەرجەع</th><th>بڕی پارە</th><th>تێبینی و وردەکاری</th></tr></thead><tbody></tbody>";
 for(const r of filtered){
   const tr=document.createElement("tr");
   const tdTime=document.createElement("td");tdTime.dir="ltr";tdTime.textContent=r.created_at?new Date(r.created_at).toLocaleString("en-GB"):"—";
   const tdType=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+r.badgeCls;badge.textContent=r.typeLabel;
   tdType.append(badge);
   const tdRef=document.createElement("td");tdRef.dir="ltr";tdRef.style.fontWeight="800";tdRef.textContent=r.ref;
   const tdAmt=document.createElement("td");tdAmt.dir="ltr";tdAmt.style.fontWeight="900";tdAmt.style.color=r.amountColor;tdAmt.textContent=r.amountText;
   const tdNote=document.createElement("td");tdNote.textContent=r.note;
   tr.append(tdTime,tdType,tdRef,tdAmt,tdNote);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function buildUnifiedRevenueRows(){
 const list=[];
 for(const s of allReceipts){
   if(s.refunded)continue;
   const rNo="#"+String(s.receipt_no??"").padStart(6,"0");
   list.push({
     id:"sale_"+s.id,
     created_at:s.created_at,
     source:"pos_sale",
     sourceLabel:"فرۆشتنی کاشێر (پسووڵە)",
     badgeCls:"info",
     category:"فرۆشتنی ڕاستەوخۆ",
     ref:rNo,
     walletLabel:"سندووقی کاشێر",
     amount_minor:Number(s.total_minor||0),
     note:"پسووڵەی فرۆشتنی کاشێر "+rNo+(Number(s.discount_minor)>0?" (داشکاندن: "+money(s.discount_minor)+")":"")
   });
 }
 for(const c of customerLedgerList){
   if(c.entry_type!=="payment_received")continue;
   const cust=customersList.find(x=>x.id===c.customer_id);
   list.push({
     id:"cpay_"+c.id,
     created_at:c.created_at,
     source:"customer_payment",
     sourceLabel:"وەرگرتنەوەی قەرزی کڕیار",
     badgeCls:"ok",
     category:cust?.name||c.customer_name||"کڕیار",
     ref:c.receipt_no||("CP-"+String(c.id||"").slice(0,6).toUpperCase()),
     walletLabel:c.payment_method==="ledger_only"?"قاسەی سەرەکی":"سندووقی کاشێر",
     amount_minor:Number(c.amount_minor||0),
     note:c.note||("دانەوەی قەرز لەلایەن "+(cust?.name||c.customer_name||"کڕیار"))
   });
 }
 for(const e of financeEntriesList){
   if(e.entry_kind!=="revenue")continue;
   list.push({
     id:"frev_"+e.id,
     created_at:e.created_at,
     source:"other_revenue",
     sourceLabel:"داهاتی تۆمارکراوی فرۆشگا",
     badgeCls:"warn",
     category:e.category||"داهاتی تر",
     ref:e.reference_no||("REV-"+String(e.id||"").slice(0,6).toUpperCase()),
     walletLabel:e.wallet==="cash_drawer"?"سندووقی کاشێر":"قاسەی سەرەکی",
     amount_minor:Number(e.amount_minor||0),
     note:(e.payee?e.payee+" — ":"")+(e.note||"")
   });
 }
 return list.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
}
function filterRevenueRows(){
 const all=buildUnifiedRevenueRows();
 const srcFilter=String($("fin-rev-source-filter")?.value||"all");
 const dateFilter=String($("fin-rev-date-filter")?.value||"all");
 const q=String($("fin-rev-search")?.value||"").trim().toLocaleLowerCase();
 const now=Date.now();
 return all.filter(r=>{
   if(srcFilter!=="all"&&r.source!==srcFilter)return false;
   if(dateFilter!=="all"&&r.created_at){
     const ts=new Date(r.created_at).getTime();
     if(Number.isFinite(ts)){
       if(dateFilter==="today"){
         const d=new Date(ts),t=new Date();
         if(d.getFullYear()!==t.getFullYear()||d.getMonth()!==t.getMonth()||d.getDate()!==t.getDate())return false;
       }else if(dateFilter==="7d"&&(now-ts)>7*86400000)return false;
       else if(dateFilter==="30d"&&(now-ts)>30*86400000)return false;
     }
   }
   if(!q)return true;
   return (r.sourceLabel+" "+r.category+" "+r.ref+" "+r.note).toLocaleLowerCase().includes(q);
 });
}
function renderFinanceRevenueView(){
 const root=$("fin-revenue-list");
 if(!root)return;
 root.replaceChildren();
 const filtered=filterRevenueRows();
 let salesSum=0,debtSum=0,otherSum=0;
 for(const r of filtered){
   const amt=Number(r.amount_minor||0);
   if(r.source==="pos_sale")salesSum+=amt;
   else if(r.source==="customer_payment")debtSum+=amt;
   else otherSum+=amt;
 }
 const totalRev=salesSum+debtSum+otherSum;
 if($("fin-rev-kpi-total"))$("fin-rev-kpi-total").textContent=money(totalRev);
 if($("fin-rev-kpi-sales"))$("fin-rev-kpi-sales").textContent=money(salesSum);
 if($("fin-rev-kpi-debt-collected"))$("fin-rev-kpi-debt-collected").textContent=money(debtSum);
 if($("fin-rev-kpi-other"))$("fin-rev-kpi-other").textContent=money(otherSum);

 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ داهاتێک لەم پاڵاوتنەدا نەدۆزرایەوە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کات و بەروار</th><th>سەرچاوەی داهات</th><th>بابەت / کڕیار</th><th>ژمارەی پسووڵە / وەسڵ</th><th>سندووق / قاسە</th><th>بڕی داهات</th><th>تێبینی</th></tr></thead><tbody></tbody>";
 for(const r of filtered){
   const tr=document.createElement("tr");
   const tdTime=document.createElement("td");tdTime.dir="ltr";tdTime.textContent=r.created_at?new Date(r.created_at).toLocaleString("en-GB"):"—";
   const tdSrc=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+r.badgeCls;badge.textContent=r.sourceLabel;
   tdSrc.append(badge);
   const tdCat=document.createElement("td");tdCat.style.fontWeight="850";tdCat.textContent=r.category;
   const tdRef=document.createElement("td");tdRef.dir="ltr";tdRef.textContent=r.ref;
   const tdWal=document.createElement("td");tdWal.textContent=r.walletLabel;
   const tdAmt=document.createElement("td");tdAmt.dir="ltr";tdAmt.style.fontWeight="900";tdAmt.style.color="#15803d";tdAmt.textContent="+"+money(r.amount_minor||0);
   const tdNote=document.createElement("td");tdNote.textContent=r.note||"—";
   tr.append(tdTime,tdSrc,tdCat,tdRef,tdWal,tdAmt,tdNote);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function buildUnifiedExpenseRows(){
 const list=[];
 for(const e of financeEntriesList){
   if(e.entry_kind!=="expense")continue;
   list.push({
     id:e.id,
     created_at:e.created_at,
     kind:"operating",
     kindLabel:"خەرجی کارپێکردنی فرۆشگا",
     badgeCls:"danger",
     category:e.category||"خەرجی گشتی",
     payee:e.payee||"—",
     ref:e.reference_no||("EXP-"+String(e.id||"").slice(0,6).toUpperCase()),
     walletLabel:e.wallet==="cash_drawer"?"سندووقی کاشێر":"قاسەی سەرەکی",
     amount_minor:Number(e.amount_minor||0),
     note:e.note||"—"
   });
 }
 for(const s of supplierLedgerList){
   if(s.entry_type!=="payment_sent"&&s.entry_type!=="purchase_cash")continue;
   const sup=suppliersList.find(x=>x.id===s.supplier_id);
   list.push({
     id:"sup_"+s.id,
     created_at:s.created_at,
     kind:"supplier",
     kindLabel:s.entry_type==="payment_sent"?"پارەدان بە دابینکەر":"کڕینی کاڵا بە نەقد",
     badgeCls:"warn",
     category:s.product_name||"حیسابی دابینکەر",
     payee:sup?.name||s.supplier_name||"دابینکەر",
     ref:s.invoice_no||("SUP-"+String(s.id||"").slice(0,6).toUpperCase()),
     walletLabel:s.payment_method==="cash_drawer"?"سندووقی کاشێر":"قاسەی سەرەکی",
     amount_minor:Number(s.amount_minor||0),
     note:s.note||"—"
   });
 }
 for(const m of allMovements||[]){
   if(m.kind!=="cash_out")continue;
   const noteStr=String(m.note||"");
   if(noteStr.startsWith("پێدانی پارە بە دابینکەر")||noteStr.startsWith("کڕینی کاڵا (")||noteStr.startsWith("خەرجی فرۆشگا (")||noteStr.startsWith("گواستنەوە بۆ قاسەی سەرەکی"))continue;
   list.push({
     id:"mov_"+m.id,
     created_at:m.created_at,
     kind:"shift_out",
     kindLabel:"دەرچوونی پارە لە سندووقی کاشێر",
     badgeCls:"info",
     category:"پارەدانی شێفت",
     payee:"سندووقی کاشێر",
     ref:"SH-"+String(m.id||"").slice(0,6).toUpperCase(),
     walletLabel:"سندووقی کاشێر",
     amount_minor:Number(m.amount_minor||0),
     note:noteStr||"—"
   });
 }
 return list.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
}
function filterExpenseRows(){
 const all=buildUnifiedExpenseRows();
 const typeFilter=String($("fin-exp-type-filter")?.value||"all");
 const dateFilter=String($("fin-exp-date-filter")?.value||"all");
 const q=String($("fin-exp-search")?.value||"").trim().toLocaleLowerCase();
 const now=Date.now();
 return all.filter(r=>{
   if(typeFilter!=="all"&&r.kind!==typeFilter)return false;
   if(dateFilter!=="all"&&r.created_at){
     const ts=new Date(r.created_at).getTime();
     if(Number.isFinite(ts)){
       if(dateFilter==="today"){
         const d=new Date(ts),t=new Date();
         if(d.getFullYear()!==t.getFullYear()||d.getMonth()!==t.getMonth()||d.getDate()!==t.getDate())return false;
       }else if(dateFilter==="7d"&&(now-ts)>7*86400000)return false;
       else if(dateFilter==="30d"&&(now-ts)>30*86400000)return false;
     }
   }
   if(!q)return true;
   return (r.kindLabel+" "+r.category+" "+r.payee+" "+r.ref+" "+r.note).toLocaleLowerCase().includes(q);
 });
}
function renderFinanceExpensesView(){
 const root=$("fin-expenses-list");
 if(!root)return;
 root.replaceChildren();
 const filtered=filterExpenseRows();
 let opSum=0,supSum=0;
 for(const r of filtered){
   const amt=Number(r.amount_minor||0);
   if(r.kind==="supplier")supSum+=amt;
   else opSum+=amt;
 }
 const totalExp=opSum+supSum;
 if($("fin-exp-kpi-total"))$("fin-exp-kpi-total").textContent=money(totalExp);
 if($("fin-exp-kpi-operating"))$("fin-exp-kpi-operating").textContent=money(opSum);
 if($("fin-exp-kpi-suppliers"))$("fin-exp-kpi-suppliers").textContent=money(supSum);
 if($("fin-exp-kpi-count"))$("fin-exp-kpi-count").textContent=filtered.length.toLocaleString("en-US");

 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ خەرجییەک لەم پاڵاوتنەدا تۆمار نەکراوە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کات و بەروار</th><th>پۆلێن / بابەت</th><th>وەرگر / لایەن</th><th>ژمارەی وەسڵ</th><th>سەرچاوەی پارە</th><th>بڕی خەرجی</th><th>تێبینی</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const r of filtered){
   const tr=document.createElement("tr");
   const tdTime=document.createElement("td");tdTime.dir="ltr";tdTime.textContent=r.created_at?new Date(r.created_at).toLocaleString("en-GB"):"—";
   const tdCat=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+r.badgeCls;badge.textContent=r.category;
   tdCat.append(badge);
   const tdPayee=document.createElement("td");tdPayee.style.fontWeight="850";tdPayee.textContent=r.payee;
   const tdRef=document.createElement("td");tdRef.dir="ltr";tdRef.textContent=r.ref;
   const tdWal=document.createElement("td");tdWal.textContent=r.walletLabel;
   const tdAmt=document.createElement("td");tdAmt.dir="ltr";tdAmt.style.fontWeight="900";tdAmt.style.color="#dc2626";tdAmt.textContent="−"+money(r.amount_minor||0);
   const tdNote=document.createElement("td");tdNote.textContent=r.note;
   const tdAct=document.createElement("td");
   const vBtn=document.createElement("button");
   vBtn.type="button";vBtn.className="stock-action-btn";
   vBtn.dataset.finExpVoucher=r.id;vBtn.textContent="🖨 وەسڵ";
   tdAct.append(vBtn);
   tr.append(tdTime,tdCat,tdPayee,tdRef,tdWal,tdAmt,tdNote,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function renderFinanceExpenseVoucher(rowId){
 const box=$("fin-exp-voucher-box");
 if(!box)return;
 const item=buildUnifiedExpenseRows().find(x=>x.id===rowId);
 if(!item){box.hidden=true;return;}
 box.replaceChildren();
 box.hidden=false;
 const head=document.createElement("div");
 head.style.display="flex";head.style.justifyContent="space-between";head.style.alignItems="center";head.style.flexWrap="wrap";head.style.gap="8px";
 const h3=document.createElement("h3");h3.style.margin="0";
 h3.textContent="وەسڵی خەرجی / پارەدان — "+item.ref;
 const act=document.createElement("div");act.style.display="flex";act.style.gap="8px";
 const pBtn=document.createElement("button");
 pBtn.type="button";pBtn.className="primary";pBtn.style.height="34px";pBtn.textContent="🖨 چاپکردنی وەسڵ";
 pBtn.addEventListener("click",()=>window.print());
 const cBtn=document.createElement("button");
 cBtn.type="button";cBtn.className="secondary";cBtn.style.height="34px";cBtn.textContent="داخستن";
 cBtn.addEventListener("click",()=>{box.hidden=true;});
 act.append(pBtn,cBtn);
 head.append(h3,act);
 box.append(head);
 const metrics=document.createElement("div");metrics.className="receipt-metrics";
 for(const [lbl,val] of [
   ["ژمارەی وەسڵ",item.ref],
   ["کات و بەروار",item.created_at?new Date(item.created_at).toLocaleString("en-GB"):"—"],
   ["پۆلێن / بابەت",item.category],
   ["وەرگر / لایەن",item.payee],
   ["سەرچاوەی پارە",item.walletLabel],
   ["بڕی پارەی خەرجکراو",money(item.amount_minor||0)],
   ["تێبینی",item.note||"—"]
 ]){
   const sp=document.createElement("span"),st=document.createElement("strong");
   sp.textContent=lbl+": ";st.textContent=val;sp.append(st);metrics.append(sp);
 }
 box.append(metrics);
}
function buildUnifiedCashflowRows(){
 const rows=[];
 for(const r of buildUnifiedRevenueRows()){
   rows.push({
     id:"cf_in_"+r.id,
     created_at:r.created_at,
     dir:"in",
     source:r.source==="pos_sale"?"sales":r.source==="customer_payment"?"customers":"revenues",
     typeLabel:r.sourceLabel,
     badgeCls:"ok",
     party:r.category,
     ref:r.ref,
     walletLabel:r.walletLabel,
     amount_minor:Number(r.amount_minor||0),
     note:r.note
   });
 }
 for(const x of buildUnifiedExpenseRows()){
   rows.push({
     id:"cf_out_"+x.id,
     created_at:x.created_at,
     dir:"out",
     source:x.kind==="supplier"?"suppliers":"expenses",
     typeLabel:x.kindLabel,
     badgeCls:"danger",
     party:x.payee!=="—"?x.payee:x.category,
     ref:x.ref,
     walletLabel:x.walletLabel,
     amount_minor:Number(x.amount_minor||0),
     note:x.note
   });
 }
 for(const e of financeEntriesList){
   if(!["drawer_to_safe","safe_to_drawer","safe_deposit","safe_withdraw"].includes(e.entry_kind))continue;
   const isIn=e.entry_kind==="safe_deposit"||e.entry_kind==="drawer_to_safe";
   rows.push({
     id:"cf_tr_"+e.id,
     created_at:e.created_at,
     dir:isIn?"in":"out",
     source:"treasury",
     typeLabel:e.category||"جووڵەی قاسە",
     badgeCls:"info",
     party:e.payee||"قاسەی سەرەکی",
     ref:e.reference_no||("TR-"+String(e.id||"").slice(0,6).toUpperCase()),
     walletLabel:"قاسەی سەرەکی",
     amount_minor:Number(e.amount_minor||0),
     note:e.note||"—"
   });
 }
 return rows.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
}
function filterCashflowRows(){
 const all=buildUnifiedCashflowRows();
 const dirFilter=String($("fin-cf-dir-filter")?.value||"all");
 const srcFilter=String($("fin-cf-source-filter")?.value||"all");
 const dateFilter=String($("fin-cf-date-filter")?.value||"all");
 const q=String($("fin-cf-search")?.value||"").trim().toLocaleLowerCase();
 const now=Date.now();
 return all.filter(r=>{
   if(dirFilter!=="all"&&r.dir!==dirFilter)return false;
   if(srcFilter!=="all"&&r.source!==srcFilter)return false;
   if(dateFilter!=="all"&&r.created_at){
     const ts=new Date(r.created_at).getTime();
     if(Number.isFinite(ts)){
       if(dateFilter==="today"){
         const d=new Date(ts),t=new Date();
         if(d.getFullYear()!==t.getFullYear()||d.getMonth()!==t.getMonth()||d.getDate()!==t.getDate())return false;
       }else if(dateFilter==="7d"&&(now-ts)>7*86400000)return false;
       else if(dateFilter==="30d"&&(now-ts)>30*86400000)return false;
     }
   }
   if(!q)return true;
   return (r.typeLabel+" "+r.party+" "+r.ref+" "+r.walletLabel+" "+r.note).toLocaleLowerCase().includes(q);
 });
}
function renderFinanceCashflowView(){
 const root=$("fin-cashflow-list");
 if(!root)return;
 root.replaceChildren();
 const filtered=filterCashflowRows();
 let inSum=0,outSum=0;
 for(const r of filtered){
   const amt=Number(r.amount_minor||0);
   if(r.dir==="in")inSum+=amt;
   else outSum+=amt;
 }
 const net=inSum-outSum;
 if($("fin-cf-kpi-in"))$("fin-cf-kpi-in").textContent="+"+money(inSum);
 if($("fin-cf-kpi-out"))$("fin-cf-kpi-out").textContent="−"+money(outSum);
 if($("fin-cf-kpi-net")){
   $("fin-cf-kpi-net").textContent=(net>=0?"+":"−")+money(Math.abs(net));
   $("fin-cf-kpi-net").style.color=net>=0?"#15803d":"#dc2626";
 }
 if($("fin-cf-kpi-count"))$("fin-cf-kpi-count").textContent=filtered.length.toLocaleString("en-US");

 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";
   blank.textContent="هیچ جووڵەیەکی پارە لەم پاڵاوتنەدا نییە";
   root.append(blank);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کات و بەروار</th><th>جۆری جووڵە</th><th>لایەن / بابەت</th><th>ژمارەی مەرجەع</th><th>سندووق / قاسە</th><th>بڕی پارە</th><th>تێبینی</th></tr></thead><tbody></tbody>";
 for(const r of filtered){
   const tr=document.createElement("tr");
   const tdTime=document.createElement("td");tdTime.dir="ltr";tdTime.textContent=r.created_at?new Date(r.created_at).toLocaleString("en-GB"):"—";
   const tdType=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+r.badgeCls;badge.textContent=r.typeLabel;
   tdType.append(badge);
   const tdParty=document.createElement("td");tdParty.style.fontWeight="850";tdParty.textContent=r.party;
   const tdRef=document.createElement("td");tdRef.dir="ltr";tdRef.textContent=r.ref;
   const tdWal=document.createElement("td");tdWal.textContent=r.walletLabel;
   const tdAmt=document.createElement("td");tdAmt.dir="ltr";tdAmt.style.fontWeight="900";
   tdAmt.style.color=r.dir==="in"?"#15803d":"#dc2626";
   tdAmt.textContent=(r.dir==="in"?"+":"−")+money(r.amount_minor||0);
   const tdNote=document.createElement("td");tdNote.textContent=r.note||"—";
   tr.append(tdTime,tdType,tdParty,tdRef,tdWal,tdAmt,tdNote);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function renderFinanceCashflowStatement(){
 const box=$("fin-cf-statement-box");
 if(!box)return;
 const filtered=filterCashflowRows();
 let inSum=0,outSum=0;
 for(const r of filtered){
   if(r.dir==="in")inSum+=Number(r.amount_minor||0);
   else outSum+=Number(r.amount_minor||0);
 }
 const net=inSum-outSum;
 box.replaceChildren();
 box.hidden=false;
 const head=document.createElement("div");
 head.style.display="flex";head.style.justifyContent="space-between";head.style.alignItems="center";head.style.flexWrap="wrap";head.style.gap="8px";
 const h3=document.createElement("h3");h3.style.margin="0";
 h3.textContent="کەشفی گشتی دارایی و جووڵەی پارەی فرۆشگا";
 const act=document.createElement("div");act.style.display="flex";act.style.gap="8px";
 const pBtn=document.createElement("button");
 pBtn.type="button";pBtn.className="primary";pBtn.style.height="34px";pBtn.textContent="🖨 چاپکردنی کەشفی دارایی";
 pBtn.addEventListener("click",()=>window.print());
 const cBtn=document.createElement("button");
 cBtn.type="button";cBtn.className="secondary";cBtn.style.height="34px";cBtn.textContent="داخستن";
 cBtn.addEventListener("click",()=>{box.hidden=true;});
 act.append(pBtn,cBtn);
 head.append(h3,act);
 box.append(head);
 const metrics=document.createElement("div");metrics.className="receipt-metrics";
 for(const [lbl,val] of [
   ["کۆی پارەی هاتوو (Inflow)",money(inSum)],
   ["کۆی پارەی دەرچوو (Outflow)",money(outSum)],
   ["پوختەی جووڵەی پارە (Net)",(net>=0?"+":"−")+money(Math.abs(net))],
   ["باڵانسی قاسەی سەرەکی",money(computeSafeBalance())],
   ["باڵانسی سندووقی کاشێر",money(shiftSummaryData?.expected||0)]
 ]){
   const sp=document.createElement("span"),st=document.createElement("strong");
   sp.textContent=lbl+": ";st.textContent=val;sp.append(st);metrics.append(sp);
 }
 box.append(metrics);
}
function localProductCostsKey(){return store?"retail_product_costs_v19_"+store.id:null;}
function loadLocalProductCosts(){
 const k=localProductCostsKey();if(!k)return {};
 try{const raw=JSON.parse(localStorage.getItem(k)||"{}");return raw&&typeof raw==="object"?raw:{};}catch(_e){return {};}
}
function saveLocalProductCosts(){
 const k=localProductCostsKey();if(!k)return;
 const obj={};
 for(const [pid,val] of productCostsMap.entries())obj[pid]=val;
 try{localStorage.setItem(k,JSON.stringify(obj));}catch(_e){}
}
async function loadReportsData(){
 // Only the optional current-cost editor uses this small cache. Reports use server aggregates.
 if(!store||!db||!canManage())return;
 try{const {data,error}=await db.from("retail_product_costs").select("product_id,unit_cost_minor,note,updated_at").eq("store_id",store.id).limit(100);
 if(!error&&Array.isArray(data)){productCostsMap=new Map(data.map(r=>[r.product_id,{unit_cost_minor:Number(r.unit_cost_minor),note:r.note||""}]));}}catch(error){msg("rep-profit-msg",safe(error),"error");}
}
function getProductUnitCostInfo(productId){
 const saved=productCostsMap.get(productId);
 return saved?{unitCost:saved.unit_cost_minor,source:"تێچووی تۆمارکراو",exact:true,note:saved.note||""}:{unitCost:null,source:"تێچوو تۆمار نەکراوە",exact:false,note:""};
}
function populateReportCostSelect(){
 const sel=$("rep-cost-product");
 if(!sel)return;
 const cur=sel.value;
 sel.replaceChildren();
 const activeProds=products.filter(p=>p.active!==false).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"ckb"));
 for(const p of activeProds){
   const opt=document.createElement("option");
   opt.value=p.id;
   const cInfo=getProductUnitCostInfo(p.id);
   opt.textContent=p.name+" — فرۆشتن: "+money(p.price_minor)+" | تێچوو: "+(cInfo.unitCost===null?"—":money(cInfo.unitCost));
   sel.append(opt);
 }
 if(cur&&[...sel.options].some(o=>o.value===cur))sel.value=cur;
 syncReportCostFormPreview();
}
function syncReportCostFormPreview(fillCostInput=true){
 const pid=String($("rep-cost-product")?.value||"");
 const p=products.find(x=>x.id===pid);
 if(!p)return;
 const retail=Math.max(0,Number(p.price_minor||0));
 const cInfo=getProductUnitCostInfo(pid);
 if($("rep-cost-retail-preview"))$("rep-cost-retail-preview").value=money(retail)+(p.base_unit==="kg"?" / کگم":" / دانە");
 if(fillCostInput&&$("rep-cost-value")){
   $("rep-cost-value").value=cInfo.unitCost===null?"":String(cInfo.unitCost);
   if($("rep-cost-note"))$("rep-cost-note").value=cInfo.note||"";
 }
 const enteredCost=Math.max(0,Math.round(Number($("rep-cost-value")?.value||0)));
 const marginIqd=retail-enteredCost;
 const marginPct=retail>0?Math.round((marginIqd/retail)*100):0;
 const mPreview=$("rep-cost-margin-preview");
 if(mPreview){
   mPreview.value=(marginIqd>=0?"+":"−")+money(Math.abs(marginIqd))+" ("+marginPct+"%)";
   mPreview.style.color=marginIqd>=0?"#15803d":"#dc2626";
   mPreview.style.background=marginIqd>=0?"#f0fdf4":"#fef2f2";
 }
}
function matchReportDateRange(isoStr,filterMode,fromDateStr="",toDateStr=""){
 if(!filterMode||filterMode==="all")return true;
 if(!isoStr)return false;
 const ts=new Date(isoStr).getTime();
 if(!Number.isFinite(ts))return false;
 const d=new Date(ts);
 const now=new Date();
 if(filterMode==="today"){
   return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate();
 }
 if(filterMode==="yesterday"){
   const y=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
   return d.getFullYear()===y.getFullYear()&&d.getMonth()===y.getMonth()&&d.getDate()===y.getDate();
 }
 if(filterMode==="7d")return (Date.now()-ts)<=7*86400000;
 if(filterMode==="30d")return (Date.now()-ts)<=30*86400000;
 if(filterMode==="custom"){
   const dayStr=d.toISOString().slice(0,10);
   if(fromDateStr&&dayStr<fromDateStr)return false;
   if(toDateStr&&dayStr>toDateStr)return false;
   return true;
 }
 return true;
}
async function refreshReportsSection(sub=repSub){
 populateReportCostSelect();
 return window.RetailReportsV22.render(sub);
}
function renderReportsSalesView(){return window.RetailReportsV22.render("sales");}
function renderReportsProfitView(){return window.RetailReportsV22.render("profit");}
function renderReportsInventoryView(){return window.RetailReportsV22.render("inventory");}
function renderReportsInsightsView(){return window.RetailReportsV22.render("insights");}
function renderReportsSalesPrintBox(){return window.RetailReportsV22.print("sales");}
function renderReportsProfitPrintBox(){return window.RetailReportsV22.print("profit");}
function renderReportsInventoryPrintBox(){return window.RetailReportsV22.print("inventory");}
function renderReportsInsightsPrintBox(){return window.RetailReportsV22.print("insights");}
function cartChanged(){if(pendingCheckout){syncPending();return}requestId=null;msg("checkout-msg","");renderCart();renderParkedBar();syncPending();}
function stockUsed(productId,excludeIndex=-1){return Number(cart.reduce((n,line,i)=>n+(i===excludeIndex||line.id!==productId?0:line.qty*line.units),0).toFixed(3))}
let customerDisplayChannel=null;
try{customerDisplayChannel=new BroadcastChannel("retail_pos_customer_display");}catch(_e){}
function syncCustomerDisplay(state,extra={}){
  const total=cartNetTotal();
  const cash=Number($("cash")?.value||0);
  const discount=Number($("discount")?.value||0);
  const diff=cash-total;
  const change=Math.max(0,diff);
  const payload={
    state,
    items:cart.map(it=>({
      name:it.name,
      price:it.price,
      qty:it.qty,
      total:it.qty*it.price,
      unitLabel:it.isScale?"کیلۆگرام":it.mode==="carton"?"کارتۆن":"دانە"
    })),
    total,
    discount,
    cash,
    change,
    ...extra
  };
  try{if(customerDisplayChannel)customerDisplayChannel.postMessage(payload);}catch(_e){}
  try{localStorage.setItem("retail_pos_customer_display_payload",JSON.stringify(payload));}catch(_e){}
}
function saleLabel(line){return line.name+(line.scaleLabel?" ("+line.scaleLabel+")":line.mode==="carton"?" (کارتۆن)":products.find(p=>p.id===line.id)?.base_unit==="kg"?" (کیلۆگرام)":" (دانە)")}
function renderCart(){
 const total=cartNetTotal();
 $("total").textContent=money(total);
 const paid=Number($("cash").value||0);
 const diff=paid-total;
 if(paid>0&&diff<0){
  $("change").textContent=money(Math.abs(diff))+" (کەمە)";
  $("change").style.color="#dc2626";
 }else{
  $("change").textContent=money(Math.max(0,diff));
  $("change").style.color="";
 }
 const list=$("cart-list");list.replaceChildren();
 if(!cart.length){const div=document.createElement("div");div.className="blank";div.textContent="سەبەتە بەتاڵە";list.append(div);try{if(typeof syncCustomerDisplay==="function")syncCustomerDisplay("idle");}catch(_e){}return}
 const table=document.createElement("table");
 table.className="cash-basket-grid";
 table.setAttribute("aria-label","خشتەی سەبەتەی کاشێر");
 const colgroup=document.createElement("colgroup");
 for(const width of ["8%","27%","12%","17%","19%","17%"]){
  const col=document.createElement("col");col.style.width=width;colgroup.append(col);
 }
 table.append(colgroup);
 const thead=document.createElement("thead"),heading=document.createElement("tr");
 for(const label of ["ژمارە","ناوی کاڵا","یەکە","نرخ","بڕ","کۆ"]){
  const th=document.createElement("th");th.scope="col";th.textContent=label;heading.append(th);
 }
 thead.append(heading);table.append(thead);
 const tbody=document.createElement("tbody");tbody.id="cart-body";
 const fmtBasketNum=n=>Number(n).toLocaleString("en-US",{maximumFractionDigits:3});
 cart.forEach((it,i)=>{
  const isKg=Boolean(it.isScale);
  const unit=isKg?"کیلۆگرام":it.mode==="carton"?"کارتۆن":"دانە";
  const kgRate=isKg?(it.unitKgPrice??(it.scaleGrams?Math.round(it.price*1000/it.scaleGrams):it.price)):it.price;
  const values=[String(i+1),it.name,unit,fmtBasketNum(kgRate),"",fmtBasketNum(it.qty*it.price)];
  const row=document.createElement("tr");
  for(let col=0;col<values.length;col++){
   const td=document.createElement("td");td.textContent=values[col];
   if([0,3,5].includes(col))td.className="basket-num";
   if(col===5)td.className="basket-num basket-total";
   if([0,3,5].includes(col))td.dir="ltr";
   row.append(td);
  }
  const cell=row.children[4],wrap=document.createElement("div");wrap.className="basket-quantity";
  const count=document.createElement(isKg?"span":"input");
  count.className=isKg?"basket-qty-value":"basket-qty-input";
  if(isKg)count.textContent=Number(it.units).toFixed(3);
  else{
    count.type="number";count.min="1";count.max="100";count.step="1";
    count.value=String(it.qty);count.dataset.quantityLine=String(i);
    count.disabled=Boolean(busy||pendingCheckout);
    count.setAttribute("aria-label","دەستکاریکردنی بڕی "+it.name);
    count.title="ژمارەی دانە یان کارتۆن بنووسە";
  }
  const actions=document.createElement("div");actions.className="basket-quantity-actions";
  const minus=document.createElement("button");minus.type="button";minus.dataset.line=i;minus.dataset.delta="-1";minus.textContent="−";minus.title="کەمکردنەوە";minus.setAttribute("aria-label","کەمکردنەوەی بڕی "+it.name);
  const plus=document.createElement("button");plus.type="button";plus.dataset.line=i;plus.dataset.delta="1";plus.textContent="+";plus.title="زیادکردن";plus.setAttribute("aria-label","زیادکردنی بڕی "+it.name);
  if(isKg){plus.disabled=true;plus.title="بۆ زیادکردنی پاکەتی کێشدار بارکۆدەکە بسکانە";}
  const remove=document.createElement("button");
  remove.type="button";remove.className="basket-remove";remove.dataset.removeLine=String(i);
  remove.textContent="سڕینەوە";remove.title="سڕینەوەی ئەم ڕیزە";remove.setAttribute("aria-label","سڕینەوەی "+it.name);
  actions.append(minus,plus);
  wrap.append(count,actions,remove);cell.append(wrap);
  if(it.outdated){
    const warn=document.createElement("span");warn.className="basket-stale";
    warn.textContent="نرخ یان بارکۆد گۆڕاوە — بسڕەوە و دووبارە بسکانە";
    row.children[1].append(warn);
  }
  tbody.append(row);
 });
 table.append(tbody);list.append(table);
 try{if(typeof syncCustomerDisplay==="function")syncCustomerDisplay("active");}catch(_e){}
}
function defaultStoreSettings(){
 return {
   storeName:store?.name||"سوپەرمارکێتی کانی چنار",
   storePhone:localStorage.getItem("retail_store_phone")||"0750 000 0000",
   storeAddress:localStorage.getItem("retail_store_address")||"هەولێر — کانی چنار",
   receiptFooter:localStorage.getItem("retail_receipt_footer")||"سوپاس بۆ سەردانتان — کاڵای فرۆشراو تا ٣ ڕۆژ بە پسووڵە دەگەڕێندرێتەوە",
   usdRate:Number(localStorage.getItem("retail_usd_rate")||152000),
   lowThreshold:Number(localStorage.getItem("retail_low_threshold")||5),
   lowTarget:Number(localStorage.getItem("retail_low_target")||25),
   debtDays:Number(localStorage.getItem("retail_debt_days")||30),
   paperWidth:localStorage.getItem("retail_diagnostic_paper_width")||"80",
   autoPrint:localStorage.getItem("retail_auto_print")==="1"?"1":"0",
   printCopies:localStorage.getItem("retail_print_copies")||"1",
   scanDelayMs:Number(localStorage.getItem("retail_scan_delay_ms")||160),
   scaleDefaultGrams:Number(localStorage.getItem("retail_scale_default_grams")||1000),
   permCashierDiscount:localStorage.getItem("retail_perm_cashier_discount")||"allowed",
   permCashierMaxDisc:Number(localStorage.getItem("retail_perm_cashier_max_disc")??25000),
   permCashierCreditSale:localStorage.getItem("retail_perm_cashier_credit")||"allowed",
   permCashierRefund:localStorage.getItem("retail_perm_cashier_refund")||"allowed",
   permCashierCashout:localStorage.getItem("retail_perm_cashier_cashout")||"allowed",
   permManagerStock:localStorage.getItem("retail_perm_manager_stock")||"manager_and_owner",
   permManagerProfit:localStorage.getItem("retail_perm_manager_profit")||"manager_and_owner",
   permManagerSafeExpense:localStorage.getItem("retail_perm_manager_safe_exp")||"manager_and_owner"
 };
}
function localSettingsKey(){return store?"retail_store_settings_v19_"+store.id:null;}
function localStaffProfilesKey(){return store?"retail_staff_profiles_v19_"+store.id:null;}
function saveLocalSettingsAndProfiles(){
 const sk=localSettingsKey();
 if(sk){try{localStorage.setItem(sk,JSON.stringify(storeSettings));}catch(_e){}}
 const pk=localStaffProfilesKey();
 if(pk){
   const obj={};
   for(const [uid,val] of staffProfilesMap.entries()){const {pin_code,...profile}=val;obj[uid]=profile;}
   try{localStorage.setItem(pk,JSON.stringify(obj));}catch(_e){}
 }
}
function applyStoreSettingsToRuntime(){
 const s={...defaultStoreSettings(),...storeSettings};
 storeSettings=s;
 if(s.storeName){
   document.querySelectorAll(".market-banner").forEach(el=>{el.textContent=s.storeName;});
 }
 if($("receipt-cfg-name"))$("receipt-cfg-name").value=s.storeName||store?.name||"سوپەرمارکێتی کانی چنار";
 if($("receipt-cfg-address"))$("receipt-cfg-address").value=s.storeAddress||"هەولێر — کانی چنار";
 if($("receipt-cfg-phone"))$("receipt-cfg-phone").value=s.storePhone||"0750 000 0000";
 if($("receipt-cfg-footer"))$("receipt-cfg-footer").value=s.receiptFooter||"سوپاس بۆ کڕینەکەتان";
 if($("usd-rate")&&Number(s.usdRate)>0)$("usd-rate").value=String(s.usdRate);
 if($("low-threshold-input")&&Number(s.lowThreshold)>0)$("low-threshold-input").value=String(s.lowThreshold);
 if($("low-target-input")&&Number(s.lowTarget)>0)$("low-target-input").value=String(s.lowTarget);
 if($("cash-scale-grams")&&Number(s.scaleDefaultGrams)>0)$("cash-scale-grams").value=String(s.scaleDefaultGrams);
 localStorage.setItem("retail_low_threshold",String(s.lowThreshold||5));
 localStorage.setItem("retail_low_target",String(s.lowTarget||25));
 localStorage.setItem("retail_diagnostic_paper_width",String(s.paperWidth||"80"));
}
async function loadSettingsAndStaffProfiles(){
 if(!store)return;
 storeSettings=defaultStoreSettings();
 const sk=localSettingsKey();
 if(sk){
   try{
     const parsed=JSON.parse(localStorage.getItem(sk)||"{}");
     if(parsed&&typeof parsed==="object")storeSettings={...storeSettings,...parsed};
   }catch(_e){}
 }
 staffProfilesMap=new Map();
 const pk=localStaffProfilesKey();
 if(pk){
   try{
     const parsed=JSON.parse(localStorage.getItem(pk)||"{}");
     if(parsed&&typeof parsed==="object"){
       for(const [uid,val] of Object.entries(parsed)){const {pin_code,...profile}=val;staffProfilesMap.set(uid,profile);}
     }
   }catch(_e){}
 }
 if(db){
   try{
     const sRes=await db.from("retail_store_settings").select("settings_json").eq("store_id",store.id).maybeSingle();
     if(!sRes.error&&sRes.data?.settings_json&&typeof sRes.data.settings_json==="object"){
       storeSettings={...storeSettings,...sRes.data.settings_json};
     }
   }catch(_e){}
   try{
     const pRes=await db.from("retail_staff_profiles").select("store_id,user_id,full_name,job_title,phone,email,role,active,note,actor_id,updated_at").eq("store_id",store.id).limit(200);
     if(!pRes.error&&Array.isArray(pRes.data)){
       for(const r of pRes.data)staffProfilesMap.set(r.user_id,r);
     }
   }catch(_e){}
 }
 saveLocalSettingsAndProfiles();
 applyStoreSettingsToRuntime();
}
async function persistStoreSettingsToServer(patch){
 const next={...defaultStoreSettings(),...storeSettings,...patch};
 const {error}=await db.from("retail_store_settings").upsert({store_id:store.id,settings_json:next,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"store_id"});
 if(error)throw error;
 storeSettings=next;saveLocalSettingsAndProfiles();applyStoreSettingsToRuntime();
}
async function refreshSettingsSection(sub=setSub){
 await loadSettingsAndStaffProfiles();
 if(sub==="users")await refreshStaff();
 if(sub==="permissions")renderSettingsPermissionsView();
 if(sub==="devices")renderSettingsDevicesView();
 if(sub==="system")renderSettingsSystemView();
}
async function refreshStaff(){
 if(role!=="owner")return;
 const {data,error}=await db.from("retail_memberships").select("user_id,role,active,created_at")
 .eq("store_id",store.id).order("created_at",{ascending:false}).limit(100);
 if(error){msg("staff-msg",safe(error),"error");return}
 members=data||[];
 renderStaffUsersDirectory();
}
function buildUnifiedStaffRows(){
 const rows=[];
 const ownerId=store?.owner_user_id||user?.id||"";
 const ownerProf=staffProfilesMap.get(ownerId)||{};
 if(ownerId){
   rows.push({
     user_id:ownerId,
     full_name:ownerProf.full_name||(user?.id===ownerId?(user.email?.split("@")[0]||"خاوەنکاری فرۆشگا"):"خاوەنکاری فرۆشگا"),
     job_title:ownerProf.job_title||"خاوەنکار و بەڕێوەبەری گشتی",
     phone:ownerProf.phone||"—",
     email:ownerProf.email||(user?.id===ownerId?user.email||"":"—"),
     role:"owner",
     active:true,
     pin_code:ownerProf.pin_code||"—",
     note:ownerProf.note||"دەسەڵاتی تەواوی سیستەم",
     created_at:store?.created_at||new Date().toISOString()
   });
 }
 for(const m of members){
   if(m.user_id===ownerId)continue;
   const prof=staffProfilesMap.get(m.user_id)||{};
   rows.push({
     user_id:m.user_id,
     full_name:prof.full_name||("کارمەند #"+String(m.user_id).slice(0,8)),
     job_title:prof.job_title||(m.role==="manager"?"بەڕێوەبەری فرۆشگا":"کاشێر"),
     phone:prof.phone||"—",
     email:prof.email||"—",
     role:m.role||"cashier",
     active:m.active!==false,
     pin_code:prof.pin_code||"—",
     note:prof.note||"",
     created_at:m.created_at
   });
 }
 for(const [uid,prof] of staffProfilesMap.entries()){
   if(!rows.some(r=>r.user_id===uid)){
     rows.push({
       user_id:uid,
       full_name:prof.full_name||("کارمەند #"+String(uid).slice(0,8)),
       job_title:prof.job_title||"کاشێر",
       phone:prof.phone||"—",
       email:prof.email||"—",
       role:prof.role||"cashier",
       active:prof.active!==false,
       pin_code:prof.pin_code||"—",
       note:prof.note||"",
       created_at:prof.updated_at||new Date().toISOString()
     });
   }
 }
 return rows;
}
function renderStaffUsersDirectory(){
 const allRows=buildUnifiedStaffRows();
 const q=String($("staff-search")?.value||"").trim().toLowerCase();
 const roleFilter=String($("staff-role-filter")?.value||"all");

 const managersCnt=allRows.filter(r=>r.active&&(r.role==="owner"||r.role==="manager")).length;
 const cashiersCnt=allRows.filter(r=>r.active&&r.role==="cashier").length;
 if($("set-users-kpi-total"))$("set-users-kpi-total").textContent=allRows.length+" بەکارهێنەر";
 if($("set-users-kpi-managers"))$("set-users-kpi-managers").textContent=managersCnt+" کەس";
 if($("set-users-kpi-cashiers"))$("set-users-kpi-cashiers").textContent=cashiersCnt+" کاشێر";
 if($("set-users-kpi-current"))$("set-users-kpi-current").textContent=(user?.email||"چالاک")+" ("+(role==="owner"?"خاوەنکار":role==="manager"?"بەڕێوەبەر":"کاشێر")+")";

 const filtered=allRows.filter(r=>{
   if(roleFilter!=="all"&&r.role!==roleFilter)return false;
   if(!q)return true;
   return (
     String(r.full_name||"").toLowerCase().includes(q)||
     String(r.job_title||"").toLowerCase().includes(q)||
     String(r.phone||"").toLowerCase().includes(q)||
     String(r.email||"").toLowerCase().includes(q)||
     String(r.user_id||"").toLowerCase().includes(q)
   );
 });

 const root=$("staff-list");
 if(!root)return;
 root.replaceChildren();
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";blank.textContent="هیچ کارمەندێک نەدۆزرایەوە";
   root.append(blank);
   return;
 }

 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ناوی کارمەند</th><th>پیشە / بەش</th><th>مۆبایل و ئیمەیڵ</th><th>ناسنامە (UUID)</th><th>ڕۆڵ</th><th>دۆخ</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const r of filtered){
   const tr=document.createElement("tr");
   const tdName=document.createElement("td");tdName.style.fontWeight="850";
   tdName.textContent=r.full_name+(r.note?" ("+r.note+")":"");
   const tdJob=document.createElement("td");tdJob.textContent=r.job_title||"—";
   const tdContact=document.createElement("td");tdContact.dir="ltr";tdContact.style.fontSize="12px";
   tdContact.textContent=(r.phone&&r.phone!=="—"?r.phone:"")+((r.phone&&r.phone!=="—"&&r.email&&r.email!=="—")?" | ":"")+(r.email&&r.email!=="—"?r.email:"—");
   const tdId=document.createElement("td");tdId.dir="ltr";tdId.style.fontSize="11.5px";tdId.style.fontFamily="monospace";tdId.textContent=r.user_id;
   const tdRole=document.createElement("td");
   const rBadge=document.createElement("span");
   rBadge.className="stock-badge "+(r.role==="owner"?"ok":r.role==="manager"?"info":"warn");
   rBadge.textContent=r.role==="owner"?"خاوەنکار":r.role==="manager"?"بەڕێوەبەر":"کاشێر";
   tdRole.append(rBadge);
   const tdSt=document.createElement("td");
   const sBadge=document.createElement("span");
   sBadge.className="stock-badge "+(r.active?"ok":"danger");
   sBadge.textContent=r.active?"چالاک":"ناچالاک";
   tdSt.append(sBadge);
   const tdAct=document.createElement("td");
   const editBtn=document.createElement("button");
   editBtn.type="button";editBtn.className="stock-pick-btn";
   editBtn.dataset.staffEdit=r.user_id;
   editBtn.textContent="دەستکاری";
   tdAct.append(editBtn);
   if(r.role!=="owner"){
     const toggleBtn=document.createElement("button");
     toggleBtn.type="button";toggleBtn.className="stock-action-btn";
     toggleBtn.dataset.staffToggleActive=r.user_id;
     toggleBtn.textContent=r.active?"ڕاگرتن":"چالاککردنەوە";
     tdAct.append(toggleBtn);
   }
   const switchBtn=document.createElement("button");
   switchBtn.type="button";switchBtn.className="stock-pick-btn";
   switchBtn.dataset.staffSwitchUser=r.user_id;
   switchBtn.style.marginInlineStart="6px";
   if(r.user_id===user?.id){
     switchBtn.style.background="#f1f5f9";
     switchBtn.style.borderColor="#cbd5e1";
     switchBtn.style.color="#64748b";
     switchBtn.disabled=true;
     switchBtn.textContent="هەژماری ئێستا ✓";
   }else{
     switchBtn.style.background="#ecfdf5";
     switchBtn.style.borderColor="#86efac";
     switchBtn.style.color="#065f46";
     switchBtn.textContent="چوونەژوورەوە بەم ڕۆڵە ↗";
   }
   tdAct.append(switchBtn);
   tr.append(tdName,tdJob,tdContact,tdId,tdRole,tdSt,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function renderSettingsPermissionsView(){
 const s={...defaultStoreSettings(),...storeSettings};
 if($("set-perm-kpi-myrole"))$("set-perm-kpi-myrole").textContent=role==="owner"?"خاوەنکار (دەسەڵاتی تەواو)":role==="manager"?"بەڕێوەبەر":"کاشێر";
 if($("set-perm-kpi-disc-limit"))$("set-perm-kpi-disc-limit").textContent=s.permCashierDiscount==="allowed"?money(s.permCashierMaxDisc):"قەدەغە بۆ کاشێر";
 if($("set-perm-kpi-refund-policy"))$("set-perm-kpi-refund-policy").textContent=s.permCashierRefund==="allowed"?"کاشێر و بەڕێوەبەر":"تەنها بەڕێوەبەر و خاوەنکار";
 if($("set-perm-kpi-profit-policy"))$("set-perm-kpi-profit-policy").textContent=s.permManagerProfit==="owner_only"?"تەنها خاوەنکار":"خاوەنکار و بەڕێوەبەر";

 if($("perm-cashier-discount"))$("perm-cashier-discount").value=s.permCashierDiscount;
 if($("perm-cashier-max-disc"))$("perm-cashier-max-disc").value=String(s.permCashierMaxDisc);
 if($("perm-cashier-credit-sale"))$("perm-cashier-credit-sale").value=s.permCashierCreditSale;
 if($("perm-cashier-refund"))$("perm-cashier-refund").value=s.permCashierRefund;
 if($("perm-cashier-cashout"))$("perm-cashier-cashout").value=s.permCashierCashout;
 if($("perm-manager-stock"))$("perm-manager-stock").value=s.permManagerStock;
 if($("perm-manager-profit"))$("perm-manager-profit").value=s.permManagerProfit;
 if($("perm-manager-safe-expense"))$("perm-manager-safe-expense").value=s.permManagerSafeExpense;

 const matrixRows=[
   ["فرۆشتنی کاشێر و کردنەوەی شێفت","✔ ڕێگەپێدراو","✔ ڕێگەپێدراو","✔ ڕێگەپێدراو"],
   ["پێدانی داشکاندن لەسەر پسووڵە",s.permCashierDiscount==="allowed"?("✔ تا "+money(s.permCashierMaxDisc)):"✖ قەدەغە","✔ بێ سنوور","✔ بێ سنوور"],
   ["فرۆشتن بە قەرز بۆ کڕیاران",s.permCashierCreditSale==="allowed"?"✔ ڕێگەپێدراو":"✖ قەدەغە","✔ ڕێگەپێدراو","✔ ڕێگەپێدراو"],
   ["گەڕاندنەوەی پسووڵە و کاڵا (Returns)",s.permCashierRefund==="allowed"?"✔ ڕێگەپێدراو":"✖ تەنها بەڕێوەبەر","✔ ڕێگەپێدراو","✔ ڕێگەپێدراو"],
   ["دەرکردنی پارە لە سندووقی شێفت",s.permCashierCashout==="allowed"?"✔ ڕێگەپێدراو":"✖ تەنها بەڕێوەبەر","✔ ڕێگەپێدراو","✔ ڕێگەپێدراو"],
   ["دەستکاریکردنی کۆگا و تەلەفکردن","✖ قەدەغە",s.permManagerStock==="owner_only"?"✖ تەنها خاوەنکار":"✔ ڕێگەپێدراو","✔ ڕێگەپێدراو"],
   ["بینینی نرخی تێچوو و قازانجی پوخت (P&L)","✖ قەدەغە",s.permManagerProfit==="owner_only"?"✖ تەنها خاوەنکار":"✔ ڕێگەپێدراو","✔ ڕێگەپێدراو"],
   ["خەرجکردن لە قاسەی سەرەکی فرۆشگا","✖ قەدەغە",s.permManagerSafeExpense==="owner_only"?"✖ تەنها خاوەنکار":"✔ ڕێگەپێدراو","✔ ڕێگەپێدراو"],
   ["بەڕێوەبردنی کارمەندان و دەسەڵاتەکان","✖ قەدەغە","✖ تەنها خاوەنکار","✔ تەنها خاوەنکار (Owner)"]
 ];
 renderTable("set-perm-matrix-table",["کردار / تایبەتمەندیی سیستەم","کاشێر (Cashier)","بەڕێوەبەر (Manager)","خاوەنکار (Owner)"],matrixRows);
}
function renderSettingsDevicesView(){
 const s={...defaultStoreSettings(),...storeSettings};
 const paper=String(s.paperWidth||"80");
 if($("set-dev-kpi-paper"))$("set-dev-kpi-paper").textContent=paper+"mm ("+(paper==="80"?"چاپکەری ستاندارد":"چاپکەری بچووک")+")";
 if($("set-dev-kpi-scanner"))$("set-dev-kpi-scanner").textContent=(scanSoundEnabled?"🔊 دەنگ چالاک":"🔇 بێدەنگ")+" ("+(s.scanDelayMs||160)+"ms)";
 if($("set-dev-kpi-scale"))$("set-dev-kpi-scale").textContent="پێشگری 27 — بنەڕەتی "+(s.scaleDefaultGrams||1000)+"g";
 if($("set-dev-kpi-online"))$("set-dev-kpi-online").textContent=navigator.onLine?"ئۆنلاین و ئامادە":"ئۆفلاین (پشکنینی هێڵ بکە)";

 if($("dev-paper-width"))$("dev-paper-width").value=paper;
 if($("dev-auto-print"))$("dev-auto-print").value=String(s.autoPrint||"0");
 if($("dev-print-copies"))$("dev-print-copies").value=String(s.printCopies||"1");
 if($("dev-scan-sound"))$("dev-scan-sound").value=scanSoundEnabled?"1":"0";
 if($("dev-scan-delay"))$("dev-scan-delay").value=String(s.scanDelayMs||160);
 if($("dev-scale-default-grams"))$("dev-scale-default-grams").value=String(s.scaleDefaultGrams||1000);
 renderDeviceLiveScanInspector();
}
function renderDeviceLiveScanInspector(){
 const box=$("dev-live-scan-result");
 if(!box)return;
 const raw=String($("dev-live-scan-input")?.value||"").trim();
 box.replaceChildren();
 if(!raw){
   const hint=document.createElement("div");hint.style.fontSize="12.5px";hint.style.color="#64748b";
   hint.textContent="هەر بارکۆدێک سکان بکە یان بنووسە تا جۆری کۆد، ژمارەی پشکنینی EAN-13، کێشی تەرازوو (Prefix-27) و کاڵای هاوتای ناو کۆگا ببینیت.";
   box.append(hint);
   return;
 }
 const isNum13=/^\d{13}$/.test(raw);
 const valid13=isNum13?isValidEan13(raw):null;
 const scaleParsed=parseScaleBarcode(raw);

 let matchedProd=null;
 const directBar=barcodes.find(b=>b.code===raw&&b.active!==false);
 if(directBar){
   matchedProd=products.find(p=>p.id===directBar.product_id);
 }else if(scaleParsed){
   const pluFull="27"+scaleParsed.pluRaw;
   matchedProd=products.find(p=>{
     const rp=String(p.plu||"").trim();
     const rs=String(p.sku||"").trim();
     return rp===scaleParsed.pluRaw||rp===scaleParsed.pluNum||rp===pluFull||rs===scaleParsed.pluRaw||rs===scaleParsed.pluNum;
   });
 }

 const grid=document.createElement("div");
 grid.style.display="grid";grid.style.gridTemplateColumns="repeat(auto-fit,minmax(200px,1fr))";grid.style.gap="10px";
 const items=[
   ["کۆدی سکانکراو",raw,"#172b45"],
   ["جۆری بارکۆد و درێژی",(scaleParsed?"بارکۆدی تەرازووی کێشان (EAN-13 Prefix 27)":isNum13?"EAN-13 ستاندارد":"کۆدی کاڵا ("+raw.length+" پیت)"),"#168db7"],
   ["ژمارەی پشکنین (Checksum)",valid13===true?"✔ دروستە (Valid EAN-13)":valid13===false?"✖ نادروستە (Checksum Error)":"پێویستی پێ نییە",valid13===false?"#dc2626":"#15803d"],
   ["شیکاریی تەرازوو (PLU / کێش)",scaleParsed?("کۆدی PLU: "+scaleParsed.pluRaw+" | کێش: "+scaleParsed.grams+"g ("+scaleParsed.scaleLabel+")"):"بارکۆدی دانە / کارتۆنی ئاسایی","#7c3aed"],
   ["کاڵای هاوتا لە کۆگا",matchedProd?(matchedProd.name+" — "+money(matchedProd.price_minor)+(scaleParsed?" (نرخی کێش: "+money(Math.round(Number(matchedProd.price_minor)*scaleParsed.grams/1000))+")":"")):"لە کاتەلۆگی ناوخۆیی نەدۆزرایەوە",matchedProd?"#15803d":"#d97706"]
 ];
 for(const [lbl,val,col] of items){
   const card=document.createElement("div");
   card.style.padding="10px 12px";card.style.background="#fff";card.style.border="1px solid #cbd5e1";card.style.borderRadius="9px";
   const s1=document.createElement("div");s1.style.fontSize="11.5px";s1.style.color="#64748b";s1.textContent=lbl;
   const s2=document.createElement("div");s2.style.fontSize="13.5px";s2.style.fontWeight="850";s2.style.marginTop="4px";s2.style.color=col;s2.textContent=val;
   card.append(s1,s2);
   grid.append(card);
 }
 box.append(grid);
}
function renderSettingsSystemView(){
 const s={...defaultStoreSettings(),...storeSettings};
 const totalRecords=products.length+barcodes.length+allReceipts.length+customersList.length+customerLedgerList.length+suppliersList.length+purchaseOrdersList.length+supplierLedgerList.length+financeEntriesList.length+stockExpiries.length;

 if($("set-sys-kpi-store"))$("set-sys-kpi-store").textContent=(s.storeName||store?.name||"سوپەرمارکێت")+" ("+(store?.currency||"IQD")+")";
 if($("set-sys-kpi-usd"))$("set-sys-kpi-usd").textContent=money(s.usdRate||152000);
 if($("set-sys-kpi-records"))$("set-sys-kpi-records").textContent=totalRecords.toLocaleString("en-US")+" تۆمار لە سیستەمدا";
 if($("set-sys-kpi-db"))$("set-sys-kpi-db").textContent=lastServerPingMs!==null?("چالاک ("+lastServerPingMs+"ms)"):"چالاک و پەیوەستە";

 if($("sys-store-name"))$("sys-store-name").value=s.storeName||store?.name||"سوپەرمارکێتی کانی چنار";
 if($("sys-store-phone"))$("sys-store-phone").value=s.storePhone||"";
 if($("sys-store-address"))$("sys-store-address").value=s.storeAddress||"";
 if($("sys-usd-rate"))$("sys-usd-rate").value=String(s.usdRate||152000);
 if($("sys-low-threshold"))$("sys-low-threshold").value=String(s.lowThreshold||5);
 if($("sys-low-target"))$("sys-low-target").value=String(s.lowTarget||25);
 if($("sys-debt-days"))$("sys-debt-days").value=String(s.debtDays||30);
 if($("sys-receipt-footer"))$("sys-receipt-footer").value=s.receiptFooter||"";

 const summaryRows=[
   ["کاڵاکان و بارکۆدەکان (Catalog & Barcodes)",products.length+" کاڵا / "+barcodes.length+" بارکۆد","چالاک و هاوکاتکراو"],
   ["پسووڵەکانی فرۆشتن و ڕیزەکانی فرۆشتن (POS Sales)",allReceipts.length+" پسووڵە / "+allSaleItems.length+" ڕیز","تۆمارکراو لە بنکەی دراوە"],
   ["کڕیاران و دەفتەری قەرز (Customers & Debt Ledger)",customersList.length+" کڕیار / "+customerLedgerList.length+" مامەڵە","چالاک"],
   ["دابینکەران و داواکاری کڕین (Suppliers & POs)",suppliersList.length+" دابینکەر / "+purchaseOrdersList.length+" داواکاری / "+supplierLedgerList.length+" وەسڵ","چالاک"],
   ["دارایی، داهات و خەرجییەکان (Finance & Safe)",financeEntriesList.length+" تۆماری دارایی / "+shiftSessionsHistory.length+" شێفت","چالاک"],
   ["کۆگا و وەجبەکانی بەسەرچوون (Inventory & Expiries)",balances.size+" باڵانس / "+stockExpiries.length+" وەجبەی بەسەرچوون","چالاک"]
 ];
 renderTable("set-sys-summary-table",["بەشی سیستەم","ژمارەی تۆمارەکان","دۆخی بنکەی دراوە"],summaryRows);
 renderOfflineHourlySyncStatus();
}

function renderOfflineHourlySyncStatus(){
 if(window.RETAIL_DEMO_MODE!==true){if($("offline-sync-badge")){$("offline-sync-badge").textContent="پەیوەندیی ڕاستەوخۆی سێرڤەر";$("offline-sync-badge").title="مامەڵەکان پێویستیان بە پشتڕاستکردنەوەی سێرڤەر هەیە؛ هاوکاتسازی ئۆفلاین چالاک نییە";}if($("offline-demo-panel"))$("offline-demo-panel").hidden=true;return;}
 if($("offline-demo-panel"))$("offline-demo-panel").hidden=false;

 const api=window.RetailOfflineSync;
 const st=api&&typeof api.getStatus==="function"?api.getStatus():{
   online:navigator.onLine,
   syncing:false,
   pendingCount:0,
   intervalMinutes:60,
   lastSyncedAt:null,
   nextSyncInMs:3600000,
   history:[]
 };
 const badge=$("offline-sync-badge");
 if(badge){
   const qTxt=st.pendingCount>0?(" ("+st.pendingCount+" لە ڕیزدا)"):"";
   badge.textContent=st.syncing
     ?"🔄 ناردنی داتا بۆ سێرڤەر..."
     :(st.online?"⚡ ١٠٠٪ ئۆفلاین | هاوکاتسازی هەر "+(st.intervalMinutes||60)+" خولەک"+qTxt:"📴 ١٠٠٪ ئۆفلاین (بێ ئینتەرنێت)"+qTxt);
 }
 if($("sys-sync-kpi-mode")){
   const bCount=Number(st.pcBackupFilesCount||2);
   $("sys-sync-kpi-mode").textContent="دیسکی D (D:\\SupermarketPOS_Data — "+bCount+" فایلی باکئەپ)";
 }
 if($("sys-sync-kpi-net")){
   $("sys-sync-kpi-net").textContent=st.online?"سەرهێڵ — ئینتەرنێت هەیە ✓":"دەرهێڵ — بێ ئینتەرنێت (پارێزراو لە ناوخۆ)";
   $("sys-sync-kpi-net").style.color=st.online?"#15803d":"#d97706";
 }
 if($("sys-sync-kpi-queue")){
   $("sys-sync-kpi-queue").textContent=st.pendingCount+" مامەڵەی چاوەڕوانکراو";
 }
 if($("sys-sync-kpi-last")){
   const minsLeft=Math.max(1,Math.ceil(Number(st.nextSyncInMs||3600000)/60000));
   const lastStr=st.lastSyncedAt?new Date(st.lastSyncedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}):"هێشتا نەنێردراوە";
   $("sys-sync-kpi-last").textContent="دوایین: "+lastStr+" | داهاتوو: "+minsLeft+" خولەکی تر";
 }
 if($("sys-sync-interval-select")){
   const v=String(st.intervalMinutes||60);
   if([...$("sys-sync-interval-select").options].some(o=>o.value===v)){
     $("sys-sync-interval-select").value=v;
   }
 }
 const histRoot=$("sys-offline-sync-history-table");
 if(histRoot){
   const hist=Array.isArray(st.history)?st.history:[];
   if(!hist.length){
     histRoot.innerHTML='<div class="blank" style="padding:10px">هەموو مامەڵەکان ١٠٠٪ بە ئۆفلاین لە ناو کۆمپیوتەرەکەدا خەزن دەکرێن و هەر کاتژمێرێک جارێک (ئەگەر ئینتەرنێت هەبوو) خۆکارانە دەنێردرێن بۆ سێرڤەر.</div>';
   }else{
     const rows=hist.slice(0,8).map(h=>[
       new Date(h.synced_at).toLocaleString("en-GB"),
       h.reason||"ناردنی کاتژمێری",
       (h.ops_count||0)+" مامەڵە",
       (h.records_count||0)+" تۆمار",
       h.target||"سێرڤەری سەرەکی"
     ]);
     renderTable("sys-offline-sync-history-table",["کاتی ناردن","شێوازی ناردن","مامەڵەی نێردراو","کۆی تۆمارەکان","شوێنی کۆتایی"],rows);
   }
 }
}

// ============================================================================
// OFFERS, DISCOUNTS, COUPONS & MARKETING CAMPAIGNS (ئۆفەر و داشکاندن)
// ============================================================================
function localOffersKey(){return store?"retail_offers_"+store.id:null;}
function localDiscountRulesKey(){return store?"retail_discount_rules_"+store.id:null;}
function localCouponsKey(){return store?"retail_coupons_"+store.id:null;}
function localCampaignsKey(){return store?"retail_campaigns_"+store.id:null;}

function saveLocalOffers(rows){const k=localOffersKey();if(!k)return;try{localStorage.setItem(k,JSON.stringify(rows||[]));}catch(_e){}}
function saveLocalDiscountRules(rows){const k=localDiscountRulesKey();if(!k)return;try{localStorage.setItem(k,JSON.stringify(rows||[]));}catch(_e){}}
function saveLocalCoupons(rows){const k=localCouponsKey();if(!k)return;try{localStorage.setItem(k,JSON.stringify(rows||[]));}catch(_e){}}
function saveLocalCampaigns(rows){const k=localCampaignsKey();if(!k)return;try{localStorage.setItem(k,JSON.stringify(rows||[]));}catch(_e){}}

function loadLocalArray(key){
 if(!key)return[];
 try{const raw=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(raw)?raw:[];}catch(_e){return[];}
}

async function loadOffersAndDiscountsData(){
 campaignsList=[];offersList=[];discountRulesList=[];couponsList=[];
 if(!store||!db){populateOffersSelectors();return;}
 try{
  const results=await Promise.all(["retail_campaigns","retail_offers","retail_discount_rules","retail_coupons"].map(table=>db.from(table).select("*").eq("store_id",store.id).order("created_at",{ascending:false}).limit(300)));
  for(const result of results){if(result.error)throw result.error;if(!Array.isArray(result.data))throw new Error("زانیاری ئۆفەر پشتڕاست نەکرایەوە");}
  [campaignsList,offersList,discountRulesList,couponsList]=results.map(x=>x.data);
  saveLocalCampaigns(campaignsList);saveLocalOffers(offersList);saveLocalDiscountRules(discountRulesList);saveLocalCoupons(couponsList);
 }catch(error){for(const id of ["off-new-msg","off-disc-msg","off-cpn-msg","off-cmp-msg"])msg(id,safe(error),"error");}
 populateOffersSelectors();
}
async function confirmPromotion(table,kind,payload,id,targetMsg){
 if(!canManage()){msg(targetMsg,"دەسەڵاتی ئەم کردارەت نییە","error");return false;}
 try{await window.RetailConfirmedRecords.mutate(db,store.id,table,kind,payload,id);return true;}
 catch(error){msg(targetMsg,safe(error),"error");return false;}
}

function populateOffersSelectors(){
 const activeProds=products.filter(p=>p.active!==false);
 for(const [selId,blankText] of [
   ["off-product","هەموو کاڵاکان (ئۆفەری گشتیی سەبەتە)"],
   ["disc-rule-product","هەموو کاڵاکان"],
   ["disc-md-product","کاڵا هەڵبژێرە..."]
 ]){
   const sel=$(selId);
   if(!sel)continue;
   const prev=sel.value;
   sel.replaceChildren();
   const bOpt=document.createElement("option");
   bOpt.value="";bOpt.textContent=blankText;
   sel.append(bOpt);
   for(const p of activeProds){
     const opt=document.createElement("option");
     opt.value=p.id;
     opt.textContent=p.name+" — "+money(p.price_minor);
     sel.append(opt);
   }
   if([...sel.options].some(o=>o.value===prev))sel.value=prev;
 }

 const cpnCust=$("cpn-customer");
 if(cpnCust){
   const prev=cpnCust.value;
   cpnCust.replaceChildren();
   const bOpt=document.createElement("option");
   bOpt.value="";bOpt.textContent="بۆ هەموو کڕیاران";
   cpnCust.append(bOpt);
   for(const c of customersList.filter(x=>x.active!==false)){
     const opt=document.createElement("option");
     opt.value=c.id;
     opt.textContent=c.name+(c.phone?" ("+c.phone+")":"");
     cpnCust.append(opt);
   }
   if([...cpnCust.options].some(o=>o.value===prev))cpnCust.value=prev;
 }

 for(const selId of ["off-campaign-select","cpn-campaign-select"]){
   const sel=$(selId);
   if(!sel)continue;
   const prev=sel.value;
   sel.replaceChildren();
   const bOpt=document.createElement("option");
   bOpt.value="";bOpt.textContent="بێ کەمپەین (سەربەخۆ)";
   sel.append(bOpt);
   for(const cmp of campaignsList){
     const opt=document.createElement("option");
     opt.value=cmp.id;
     opt.textContent=cmp.name;
     sel.append(opt);
   }
   if([...sel.options].some(o=>o.value===prev))sel.value=prev;
 }
 syncDirectMarkdownPreview();
}

function syncDirectMarkdownPreview(){
 const prodId=String($("disc-md-product")?.value||"");
 const pct=Math.max(0,Math.min(95,Number($("disc-md-pct")?.value||10)));
 const p=products.find(x=>x.id===prodId);
 if(!p){
   if($("disc-md-current"))$("disc-md-current").value="";
   if($("disc-md-new-price"))$("disc-md-new-price").value="";
   return;
 }
 const cur=Number(p.price_minor||0);
 if($("disc-md-current"))$("disc-md-current").value=money(cur);
 const discounted=Math.max(0,Math.round((cur*(100-pct))/250)*250);
 if($("disc-md-new-price"))$("disc-md-new-price").value=String(discounted);
}

function getOfferDateState(startDate,endDate,active=true){
 if(active===false)return {code:"paused",label:"ڕاگیراو",badge:"danger"};
 const today=new Date().toISOString().slice(0,10);
 if(startDate&&String(startDate)>today)return {code:"upcoming",label:"کاتی داهاتوو",badge:"info"};
 if(endDate&&String(endDate)<today)return {code:"expired",label:"بەسەرچوو",badge:"warn"};
 return {code:"active",label:"چالاک",badge:"ok"};
}

function offerTypeMeta(t){
 return ({
   item_special:{label:"نرخی تایبەتی کاڵا",badge:"info"},
   bogo_free:{label:"BOGO (بەخۆڕایی)",badge:"ok"},
   bundle_qty:{label:"پاکێجی کۆمەڵەیی",badge:"warn"},
   basket_threshold:{label:"ئۆفەری کۆی سەبەتە",badge:"info"}
 })[t]||{label:t||"ئۆفەر",badge:"info"};
}

function calculateOfferSavingForCart(offer,currentCart,subtotal){
 if(!offer)return 0;
 const minQ=Number(offer.min_qty||1);
 const discIqd=Math.max(0,Math.round(Number(offer.discount_minor||0)));
 const discPct=Math.max(0,Math.min(100,Number(offer.discount_pct||0)));

 if(offer.offer_type==="basket_threshold"){
   if(subtotal<minQ)return 0;
   const raw=discIqd>0?discIqd:Math.round((subtotal*discPct)/100);
   return Math.min(subtotal,Math.max(0,raw));
 }

 const targetLines=offer.product_id?currentCart.filter(x=>x.id===offer.product_id):currentCart;
 if(!targetLines.length)return 0;
 const totalQty=targetLines.reduce((n,x)=>n+(x.isScale?Number(x.units||0):Number(x.qty||0)*Number(x.units||1)),0);
 const targetSub=targetLines.reduce((n,x)=>n+Number(x.price||0)*Number(x.qty||0),0);
 const unitPrice=Number(targetLines[0]?.price||0);

 if(totalQty<minQ)return 0;
 if(offer.offer_type==="bogo_free"){
   const freeQ=Math.max(1,Number(offer.free_qty||1));
   const groupSize=Math.max(1,minQ);
   const sets=Math.floor(totalQty/groupSize);
   const raw=sets>0?Math.round(sets*freeQ*unitPrice):(discIqd>0?discIqd:Math.round((targetSub*discPct)/100));
   return Math.min(targetSub,Math.max(0,raw));
 }
 const raw=discIqd>0?discIqd:Math.round((targetSub*discPct)/100);
 return Math.min(targetSub,Math.max(0,raw));
}

function calculateDiscountRuleSavingForCart(rule,currentCart,subtotal,customerId){
 if(!rule)return 0;
 const minBasket=Number(rule.min_basket_minor||0);
 if(subtotal<minBasket)return 0;
 if(rule.scope==="customer_vip"&&!customerId)return 0;

 let eligibleAmount=subtotal;
 if(rule.scope==="product"&&rule.product_id){
   eligibleAmount=currentCart.filter(x=>x.id===rule.product_id).reduce((n,x)=>n+Number(x.price||0)*Number(x.qty||0),0);
 }else if(rule.scope==="near_expiry"){
   const nearIds=new Set(stockExpiries.filter(e=>computeDaysUntilExpiry(e.expiry_date)<=30).map(e=>e.product_id));
   if(rule.product_id)nearIds.add(rule.product_id);
   eligibleAmount=currentCart.filter(x=>nearIds.has(x.id)).reduce((n,x)=>n+Number(x.price||0)*Number(x.qty||0),0);
 }
 if(eligibleAmount<=0)return 0;

 const val=Number(rule.value||0);
 let saving=rule.mode==="fixed_iqd"?Math.round(val):Math.round((eligibleAmount*val)/100);
 const cap=Number(rule.max_cap_minor||0);
 if(cap>0&&saving>cap)saving=cap;
 return Math.min(eligibleAmount,Math.max(0,saving));
}

function updatePosPromoBanner(text="",isSuccess=true){
 const el=$("pos-promo-status");
 if(!el)return;
 if(!text){
   el.hidden=true;
   el.textContent="";
   return;
 }
 el.hidden=false;
 el.style.color=isSuccess?"#15803d":"#dc2626";
 el.textContent=text;
}

function applyPosCouponCode(rawCode){
 const code=String(rawCode||$("pos-coupon-code")?.value||"").trim().toUpperCase();
 if(!code){
   updatePosPromoBanner("تکایە کۆدی کوپۆن بنووسە",false);
   return false;
 }
 const subtotal=cartSubtotal();
 if(subtotal<=0){
   updatePosPromoBanner("سەرەتا کاڵا بخەرە ناو سەبەتەی کڕین",false);
   return false;
 }
 const cpn=couponsList.find(c=>String(c.code||"").toUpperCase()===code);
 if(!cpn){
   updatePosPromoBanner("کۆدی کوپۆنی «"+code+"» نەدۆزرایەوە",false);
   return false;
 }
 if(cpn.active===false){
   updatePosPromoBanner("ئەم کوپۆنە ڕاگیراوە و چالاک نییە",false);
   return false;
 }
 const today=new Date().toISOString().slice(0,10);
 if(cpn.expiry_date&&String(cpn.expiry_date)<today){
   updatePosPromoBanner("ماوەی کوپۆنی «"+code+"» بەسەرچووە ("+cpn.expiry_date+")",false);
   return false;
 }
 if(Number(cpn.max_uses)>0){
   updatePosPromoBanner("کوپۆنی سنووردار بەردەست نییە: پێویستی بە ژمێرەری بەکارهێنانی هاوکات لە سێرڤەر هەیە",false);
   return false;
 }
 const selCust=String($("checkout-customer")?.value||"");
 if(cpn.customer_id&&cpn.customer_id!==selCust){
   const targetCust=customersList.find(x=>x.id===cpn.customer_id);
   updatePosPromoBanner("ئەم کوپۆنە تەنها بۆ کڕیار «"+(targetCust?.name||"تایبەت")+"» کار دەکات",false);
   return false;
 }
 const minSpend=Number(cpn.min_spend_minor||0);
 if(subtotal<minSpend){
   updatePosPromoBanner("بۆ ئەم کوپۆنە کەمترین بڕی سەبەتە دەبێت "+money(minSpend)+" بێت",false);
   return false;
 }
 let saving=cpn.kind==="percent"?Math.round((subtotal*Number(cpn.value||0))/100):Math.round(Number(cpn.value||0));
 const maxDisc=Number(cpn.max_discount_minor||0);
 if(maxDisc>0&&saving>maxDisc)saving=maxDisc;
 saving=Math.min(subtotal,Math.max(0,saving));
 if(saving<=0){
   updatePosPromoBanner("بەهای داشکاندنی کوپۆن سفرە",false);
   return false;
 }
 if($("discount"))$("discount").value=String(saving);
 activePosPromo={kind:"coupon",id:cpn.id,code:cpn.code,title:cpn.title,amount:saving};
 renderCart();
 updatePosPromoBanner("✔ کوپۆنی "+cpn.code+" («"+cpn.title+"») جێبەجێ کرا: −"+money(saving),true);
 return true;
}

function evaluateAndApplyAutoPosOffers(){
 const subtotal=cartSubtotal();
 if(subtotal<=0||!cart.length){
   updatePosPromoBanner("سەرەتا کاڵا بخەرە سەبەتە بۆ هەژمارکردنی ئۆفەر",false);
   return false;
 }
 const customerId=String($("checkout-customer")?.value||"");
 let best={amount:0,kind:"",id:"",title:""};

 for(const off of offersList){
   const st=getOfferDateState(off.start_date,off.end_date,off.active);
   if(st.code!=="active")continue;
   const amt=calculateOfferSavingForCart(off,cart,subtotal);
   if(amt>best.amount){
     best={amount:amt,kind:"offer",id:off.id,title:off.title};
   }
 }
 for(const rule of discountRulesList){
   if(rule.active===false||rule.auto_pos===false)continue;
   const amt=calculateDiscountRuleSavingForCart(rule,cart,subtotal,customerId);
   if(amt>best.amount){
     best={amount:amt,kind:"rule",id:rule.id,title:rule.name};
   }
 }
 const today=new Date().toISOString().slice(0,10);
 for(const cmp of campaignsList){
   if(cmp.active===false)continue;
   if(cmp.start_date&&String(cmp.start_date)>today)continue;
   if(cmp.end_date&&String(cmp.end_date)<today)continue;
   const pct=Number(cmp.default_pct||0);
   if(pct>0){
     const amt=Math.min(subtotal,Math.round((subtotal*pct)/100));
     if(amt>best.amount){
       best={amount:amt,kind:"campaign",id:cmp.id,title:cmp.name+" ("+pct+"%)"};
     }
   }
 }

 if(best.amount<=0){
   updatePosPromoBanner("هیچ ئۆفەرێکی خۆکار بۆ پێکهاتەی ئێستای سەبەتە نەدۆزرایەوە",false);
   return false;
 }
 if($("discount"))$("discount").value=String(best.amount);
 activePosPromo=best;
 renderCart();
 updatePosPromoBanner("⚡ باشترین ئۆفەر جێبەجێ کرا («"+best.title+"»): −"+money(best.amount),true);
 return true;
}

async function recordPosPromoUsageAfterSale(discountAmount){
 // Redemption counters are not part of the checkout transaction. Never invent
 // confirmed usage counts locally or overwrite a concurrent cashier's count.
 const used=activePosPromo&&discountAmount>0;
 activePosPromo=null;
 if($("pos-coupon-code"))$("pos-coupon-code").value="";
 updatePosPromoBanner(used?"داشکاندن لە پسووڵە تۆمارکرا؛ ژمێرەری بەکارهێنانی ئۆفەر پشتڕاست نەکراوەتەوە":"",false);
}

async function refreshOffersSection(sub=offSub){
 if(!store)return;
 await loadOffersAndDiscountsData();
 if(!allReceipts.length)await refreshReceipts();
 if(sub==="new")renderOffersNewView();
 else if(sub==="discounts")renderOffersDiscountsView();
 else if(sub==="coupons")renderOffersCouponsView();
 else if(sub==="campaigns")renderOffersCampaignsView();
}

function renderOffersNewView(){
 populateOffersSelectors();
 const totalCount=offersList.length;
 const activeCount=offersList.filter(o=>getOfferDateState(o.start_date,o.end_date,o.active).code==="active").length;
 const bundleCount=offersList.filter(o=>["bogo_free","bundle_qty"].includes(o.offer_type)).length;
 const totalSaved=offersList.reduce((n,o)=>n+Number(o.total_saved_minor||0),0);

 if($("off-new-total"))$("off-new-total").textContent=totalCount.toLocaleString("en-US");
 if($("off-new-active"))$("off-new-active").textContent=activeCount.toLocaleString("en-US");
 if($("off-new-bundles"))$("off-new-bundles").textContent=bundleCount.toLocaleString("en-US");
 if($("off-new-saved-iqd"))$("off-new-saved-iqd").textContent=money(totalSaved);

 const q=String($("off-new-search")?.value||"").trim().toLowerCase();
 const typeFilter=String($("off-new-type-filter")?.value||"all");
 const statusFilter=String($("off-new-status-filter")?.value||"all");

 const filtered=offersList.filter(o=>{
   const st=getOfferDateState(o.start_date,o.end_date,o.active);
   if(typeFilter!=="all"&&o.offer_type!==typeFilter)return false;
   if(statusFilter!=="all"&&st.code!==statusFilter)return false;
   if(!q)return true;
   const p=products.find(x=>x.id===o.product_id);
   return (String(o.title||"")+" "+String(p?.name||"")+" "+String(o.note||"")).toLowerCase().includes(q);
 });

 const root=$("offers-new-list");
 if(!root)return;
 root.replaceChildren();
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";blank.textContent="هیچ ئۆفەرێک بەم فلتەرە نەدۆزرایەوە";
   root.append(blank);
   return;
 }

 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ناونیشانی ئۆفەر</th><th>جۆر</th><th>کاڵا / بازنە</th><th>مەرج و داشکاندن</th><th>ماوەی ئۆفەر</th><th>بەکارهێنان</th><th>دۆخ</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const o of filtered){
   const tr=document.createElement("tr");
   const p=products.find(x=>x.id===o.product_id);
   const cmp=campaignsList.find(c=>c.id===o.campaign_id);
   const meta=offerTypeMeta(o.offer_type);
   const st=getOfferDateState(o.start_date,o.end_date,o.active);

   const tdTitle=document.createElement("td");tdTitle.style.fontWeight="850";
   tdTitle.textContent=o.title+(cmp?" ["+cmp.name+"]":"");

   const tdType=document.createElement("td");
   const tBadge=document.createElement("span");tBadge.className="stock-badge "+meta.badge;tBadge.textContent=meta.label;
   tdType.append(tBadge);

   const tdProd=document.createElement("td");
   tdProd.textContent=p?p.name:"هەموو سەبەتە (گشتی)";

   const tdFormula=document.createElement("td");tdFormula.style.fontWeight="700";tdFormula.style.color="#831843";
   const condText=o.offer_type==="basket_threshold"?("سەبەتە ≥ "+money(o.min_qty)):("بڕ ≥ "+o.min_qty+(o.offer_type==="bogo_free"&&Number(o.free_qty)>0?" (+"+o.free_qty+" بەخۆڕایی)":""));
   const valText=Number(o.discount_minor)>0?("−"+money(o.discount_minor)):Number(o.discount_pct)>0?("−"+o.discount_pct+"%"):(o.offer_type==="bogo_free"?"بەخۆڕایی":"—");
   tdFormula.textContent=condText+" ➔ "+valText;

   const tdDates=document.createElement("td");tdDates.dir="ltr";tdDates.style.fontSize="12px";
   tdDates.textContent=(o.start_date||"سەرەتا")+" → "+(o.end_date||"بێ سنوور");

   const tdUsed=document.createElement("td");
   tdUsed.textContent=Number(o.used_count||0)+" جار ("+money(o.total_saved_minor||0)+")";

   const tdSt=document.createElement("td");
   const sBadge=document.createElement("span");sBadge.className="stock-badge "+st.badge;sBadge.textContent=st.label;
   tdSt.append(sBadge);

   const tdAct=document.createElement("td");
   const posBtn=document.createElement("button");
   posBtn.type="button";posBtn.className="stock-pick-btn";
   posBtn.dataset.offerToPos=o.id;
   posBtn.textContent="ناردن بۆ کاشێر";

   const editBtn=document.createElement("button");
   editBtn.type="button";editBtn.className="stock-action-btn";
   editBtn.dataset.offerEdit=o.id;
   editBtn.textContent="دەستکاری";

   const toggleBtn=document.createElement("button");
   toggleBtn.type="button";toggleBtn.className="stock-action-btn";
   toggleBtn.dataset.offerToggle=o.id;
   toggleBtn.textContent=o.active===false?"چالاککردن":"ڕاگرتن";

   const delBtn=document.createElement("button");
   delBtn.type="button";delBtn.className="stock-action-btn";
   delBtn.dataset.offerDelete=o.id;
   delBtn.textContent="سڕینەوە";

   tdAct.append(posBtn,editBtn,toggleBtn,delBtn);
   tr.append(tdTitle,tdType,tdProd,tdFormula,tdDates,tdUsed,tdSt,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}

function renderOffersDiscountsView(){
 populateOffersSelectors();
 const activeRules=discountRulesList.filter(r=>r.active!==false).length;
 const validSales=allReceipts.filter(s=>!s.refunded);
 const discountedSales=validSales.filter(s=>Number(s.discount_minor||0)>0);
 const totalDiscountGiven=discountedSales.reduce((n,s)=>n+Number(s.discount_minor||0),0);
 const totalGrossSales=validSales.reduce((n,s)=>n+Number(s.total_minor||0)+Number(s.discount_minor||0),0);
 const avgDiscRate=totalGrossSales>0?((totalDiscountGiven/totalGrossSales)*100).toFixed(1)+"%":"0%";

 if($("off-disc-rules-count"))$("off-disc-rules-count").textContent=activeRules.toLocaleString("en-US");
 if($("off-disc-total-given"))$("off-disc-total-given").textContent=money(totalDiscountGiven);
 if($("off-disc-receipts-count"))$("off-disc-receipts-count").textContent=discountedSales.length.toLocaleString("en-US");
 if($("off-disc-avg-rate"))$("off-disc-avg-rate").textContent=avgDiscRate;

 const q=String($("off-disc-search")?.value||"").trim().toLowerCase();
 const filteredRules=discountRulesList.filter(r=>{
   if(!q)return true;
   const p=products.find(x=>x.id===r.product_id);
   return (String(r.name||"")+" "+String(p?.name||"")+" "+String(r.note||"")).toLowerCase().includes(q);
 });

 const root=$("offers-discounts-list");
 if(root){
   root.replaceChildren();
   if(!filteredRules.length){
     const blank=document.createElement("div");blank.className="blank";blank.textContent="هیچ یاسایەکی داشکاندن نەدۆزرایەوە";
     root.append(blank);
   }else{
     const scopeLabelMap={
       basket_total:"کۆی گشتیی سەبەتە",
       product:"کاڵای دیاریکراو",
       customer_vip:"کڕیارانی تۆمارکراو (VIP)",
       near_expiry:"کاڵای نزیک لە بەسەرچوون"
     };
     const table=document.createElement("table");
     table.innerHTML="<thead><tr><th>ناوی یاسای داشکاندن</th><th>بازنەی کارکردن</th><th>بڕ / ڕێژەی داشکاندن</th><th>کەمترین سەبەتە</th><th>زۆرترین سەقف</th><th>خۆکار لە کاشێر</th><th>دۆخ</th><th>کردار</th></tr></thead><tbody></tbody>";
     for(const r of filteredRules){
       const tr=document.createElement("tr");
       const p=products.find(x=>x.id===r.product_id);
       const tdName=document.createElement("td");tdName.style.fontWeight="850";
       tdName.textContent=r.name+(r.note?" ("+r.note+")":"");
       const tdScope=document.createElement("td");
       tdScope.textContent=(scopeLabelMap[r.scope]||r.scope)+(p?" — "+p.name:"");
       const tdVal=document.createElement("td");tdVal.style.fontWeight="800";tdVal.style.color="#be185d";
       tdVal.textContent=r.mode==="percent"?(r.value+"%"):money(r.value);
       const tdMin=document.createElement("td");tdMin.textContent=money(r.min_basket_minor||0);
       const tdCap=document.createElement("td");tdCap.textContent=Number(r.max_cap_minor)>0?money(r.max_cap_minor):"بێ سنوور";
       const tdAuto=document.createElement("td");tdAuto.textContent=r.auto_pos!==false?"✔ بەڵێ":"نەخێر";
       const tdSt=document.createElement("td");
       const badge=document.createElement("span");badge.className="stock-badge "+(r.active!==false?"ok":"danger");
       badge.textContent=r.active!==false?"چالاک":"ڕاگیراو";
       tdSt.append(badge);
       const tdAct=document.createElement("td");
       const posBtn=document.createElement("button");
       posBtn.type="button";posBtn.className="stock-pick-btn";
       posBtn.dataset.discRuleToPos=r.id;
       posBtn.textContent="جێبەجێکردن لە کاشێر";
       const editBtn=document.createElement("button");
       editBtn.type="button";editBtn.className="stock-action-btn";
       editBtn.dataset.discRuleEdit=r.id;
       editBtn.textContent="دەستکاری";
       const toggleBtn=document.createElement("button");
       toggleBtn.type="button";toggleBtn.className="stock-action-btn";
       toggleBtn.dataset.discRuleToggle=r.id;
       toggleBtn.textContent=r.active!==false?"ڕاگرتن":"چالاککردن";
       const delBtn=document.createElement("button");
       delBtn.type="button";delBtn.className="stock-action-btn";
       delBtn.dataset.discRuleDelete=r.id;
       delBtn.textContent="سڕینەوە";
       tdAct.append(posBtn,editBtn,toggleBtn,delBtn);
       tr.append(tdName,tdScope,tdVal,tdMin,tdCap,tdAuto,tdSt,tdAct);
       table.tBodies[0].append(tr);
     }
     root.append(table);
   }
 }

 const salesRows=discountedSales.slice(0,50).map(s=>{
   const net=Number(s.total_minor||0);
   const disc=Number(s.discount_minor||0);
   const gross=net+disc;
   const pct=gross>0?((disc/gross)*100).toFixed(1)+"%":"0%";
   return [
     "#"+String(s.receipt_no||"").padStart(6,"0"),
     s.created_at?new Date(s.created_at).toLocaleString("en-GB"):"—",
     money(gross),
     "−"+money(disc),
     pct,
     money(net)
   ];
 });
 renderTable("offers-discounted-sales-list",["ژمارەی پسووڵە","کات و بەروار","کۆی پێش داشکاندن","بڕی داشکاندن","ڕێژەی داشکاندن","کۆی پوختی دراو"],salesRows);
}

function getCouponState(cpn){
 if(cpn.active===false)return {code:"paused",label:"ڕاگیراو",badge:"danger"};
 const today=new Date().toISOString().slice(0,10);
 if(cpn.expiry_date&&String(cpn.expiry_date)<today)return {code:"expired",label:"بەسەرچوو",badge:"warn"};
 if(Number(cpn.max_uses)>0&&Number(cpn.used_count||0)>=Number(cpn.max_uses))return {code:"exhausted",label:"تەواوبوو",badge:"warn"};
 return {code:"active",label:"چالاک و بەردەست",badge:"ok"};
}

function renderOffersCouponsView(){
 populateOffersSelectors();
 const totalCount=couponsList.length;
 const activeCount=couponsList.filter(c=>getCouponState(c).code==="active").length;
 const usedCount=couponsList.reduce((n,c)=>n+Number(c.used_count||0),0);
 const savedTotal=couponsList.reduce((n,c)=>n+Number(c.total_saved_minor||0),0);

 if($("off-cpn-total"))$("off-cpn-total").textContent=totalCount.toLocaleString("en-US");
 if($("off-cpn-active"))$("off-cpn-active").textContent=activeCount.toLocaleString("en-US");
 if($("off-cpn-used-count"))$("off-cpn-used-count").textContent=usedCount.toLocaleString("en-US");
 if($("off-cpn-total-saved"))$("off-cpn-total-saved").textContent=money(savedTotal);

 const q=String($("off-cpn-search")?.value||"").trim().toLowerCase();
 const stFilter=String($("off-cpn-status-filter")?.value||"all");
 const filtered=couponsList.filter(c=>{
   const st=getCouponState(c);
   if(stFilter!=="all"&&st.code!==stFilter)return false;
   if(!q)return true;
   return (String(c.code||"")+" "+String(c.title||"")).toLowerCase().includes(q);
 });

 const root=$("offers-coupons-list");
 if(!root)return;
 root.replaceChildren();
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";blank.textContent="هیچ کۆدێکی کوپۆن نەدۆزرایەوە";
   root.append(blank);
   return;
 }

 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کۆدی کوپۆن</th><th>ناونیشان و تایبەتمەندی</th><th>بەهای داشکاندن</th><th>کەمترین سەبەتە</th><th>بەکارهێنان</th><th>بەسەرچوون</th><th>دۆخ</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const c of filtered){
   const tr=document.createElement("tr");
   const st=getCouponState(c);
   const cust=customersList.find(x=>x.id===c.customer_id);
   const cmp=campaignsList.find(x=>x.id===c.campaign_id);

   const tdCode=document.createElement("td");
   tdCode.dir="ltr";tdCode.style.fontFamily="monospace";tdCode.style.fontWeight="900";tdCode.style.fontSize="13.5px";tdCode.style.color="#9d174d";
   tdCode.textContent=c.code;

   const tdTitle=document.createElement("td");tdTitle.style.fontWeight="750";
   tdTitle.textContent=c.title+(cust?" (تایبەت بە: "+cust.name+")":"")+(cmp?" ["+cmp.name+"]":"");

   const tdVal=document.createElement("td");tdVal.style.fontWeight="800";tdVal.style.color="#15803d";
   tdVal.textContent=c.kind==="percent"?(c.value+"% (تا "+money(c.max_discount_minor||0)+")"):money(c.value);

   const tdMin=document.createElement("td");tdMin.textContent=money(c.min_spend_minor||0);

   const tdUse=document.createElement("td");
   tdUse.textContent=Number(c.used_count||0)+" / "+(Number(c.max_uses)>0?c.max_uses:"∞")+" ("+money(c.total_saved_minor||0)+")";

   const tdExp=document.createElement("td");tdExp.dir="ltr";tdExp.textContent=c.expiry_date||"بێ سنوور";

   const tdSt=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+st.badge;badge.textContent=st.label;
   tdSt.append(badge);

   const tdAct=document.createElement("td");
   const posBtn=document.createElement("button");
   posBtn.type="button";posBtn.className="stock-pick-btn";
   posBtn.dataset.cpnToPos=c.code;
   posBtn.textContent="بەکارهێنان لە کاشێر";

   const editBtn=document.createElement("button");
   editBtn.type="button";editBtn.className="stock-action-btn";
   editBtn.dataset.cpnEdit=c.id;
   editBtn.textContent="دەستکاری";

   const toggleBtn=document.createElement("button");
   toggleBtn.type="button";toggleBtn.className="stock-action-btn";
   toggleBtn.dataset.cpnToggle=c.id;
   toggleBtn.textContent=c.active===false?"چالاککردن":"ڕاگرتن";

   const delBtn=document.createElement("button");
   delBtn.type="button";delBtn.className="stock-action-btn";
   delBtn.dataset.cpnDelete=c.id;
   delBtn.textContent="سڕینەوە";

   tdAct.append(posBtn,editBtn,toggleBtn,delBtn);
   tr.append(tdCode,tdTitle,tdVal,tdMin,tdUse,tdExp,tdSt,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}

function renderOffersCampaignsView(){
 const activeCount=campaignsList.filter(c=>getOfferDateState(c.start_date,c.end_date,c.active).code==="active").length;
 const linkedCount=offersList.filter(o=>o.campaign_id).length+couponsList.filter(c=>c.campaign_id).length;

 let totalCampaignSales=0;
 let totalCampaignDiscounts=0;
 for(const cmp of campaignsList){
   const sDate=cmp.start_date?String(cmp.start_date):"0000-01-01";
   const eDate=cmp.end_date?String(cmp.end_date):"9999-12-31";
   for(const sale of allReceipts){
     if(sale.refunded||!sale.created_at)continue;
     const day=String(sale.created_at).slice(0,10);
     if(day>=sDate&&day<=eDate){
       totalCampaignSales+=Number(sale.total_minor||0);
       totalCampaignDiscounts+=Number(sale.discount_minor||0);
     }
   }
 }

 if($("off-cmp-active"))$("off-cmp-active").textContent=activeCount.toLocaleString("en-US");
 if($("off-cmp-linked"))$("off-cmp-linked").textContent=linkedCount.toLocaleString("en-US");
 if($("off-cmp-revenue"))$("off-cmp-revenue").textContent=money(totalCampaignSales);
 if($("off-cmp-budget-used"))$("off-cmp-budget-used").textContent=money(totalCampaignDiscounts);

 const q=String($("off-cmp-search")?.value||"").trim().toLowerCase();
 const filtered=campaignsList.filter(c=>{
   if(!q)return true;
   return (String(c.name||"")+" "+String(c.channel||"")+" "+String(c.slogan||"")).toLowerCase().includes(q);
 });

 const root=$("offers-campaigns-list");
 if(!root)return;
 root.replaceChildren();
 if(!filtered.length){
   const blank=document.createElement("div");blank.className="blank";blank.textContent="هیچ کەمپەینێک نەدۆزرایەوە";
   root.append(blank);
   return;
 }

 const typeLabels={
   seasonal:"وەرزی / جەژن و بۆنەکان",
   weekend:"ئۆفەری کۆتایی هەفتە",
   clearance:"پاکتاوی کۆگا (Clearance)",
   vip_loyalty:"پاداشتی کڕیارانی VIP",
   happy_hour:"کاتژمێری زێڕین (Happy Hour)"
 };

 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ناوی کەمپەین و دروشم</th><th>جۆر و کەناڵ</th><th>ماوەی کەمپەین</th><th>داشکاندنی بنەڕەتی</th><th>ئۆفەر/کوپۆنی گرێدراو</th><th>بودجەی تەرخانکراو</th><th>دۆخ</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const c of filtered){
   const tr=document.createElement("tr");
   const st=getOfferDateState(c.start_date,c.end_date,c.active);
   const linkedOff=offersList.filter(o=>o.campaign_id===c.id).length;
   const linkedCpn=couponsList.filter(p=>p.campaign_id===c.id).length;

   const tdName=document.createElement("td");tdName.style.fontWeight="850";
   tdName.textContent=c.name+(c.slogan?" — «"+c.slogan+"»":"");

   const tdType=document.createElement("td");
   tdType.textContent=(typeLabels[c.campaign_type]||c.campaign_type)+" ("+(c.channel||"گشتی")+")";

   const tdDates=document.createElement("td");tdDates.dir="ltr";tdDates.style.fontSize="12px";
   tdDates.textContent=(c.start_date||"—")+" → "+(c.end_date||"—");

   const tdPct=document.createElement("td");tdPct.style.fontWeight="800";tdPct.style.color="#be185d";
   tdPct.textContent=(c.default_pct||0)+"%";

   const tdLinked=document.createElement("td");
   tdLinked.textContent=linkedOff+" ئۆفەر + "+linkedCpn+" کوپۆن";

   const tdBudget=document.createElement("td");
   tdBudget.textContent=money(c.budget_minor||0);

   const tdSt=document.createElement("td");
   const badge=document.createElement("span");badge.className="stock-badge "+st.badge;badge.textContent=st.label;
   tdSt.append(badge);

   const tdAct=document.createElement("td");
   const editBtn=document.createElement("button");
   editBtn.type="button";editBtn.className="stock-pick-btn";
   editBtn.dataset.cmpEdit=c.id;
   editBtn.textContent="دەستکاری";

   const toggleBtn=document.createElement("button");
   toggleBtn.type="button";toggleBtn.className="stock-action-btn";
   toggleBtn.dataset.cmpToggle=c.id;
   toggleBtn.textContent=c.active===false?"چالاککردن":"ڕاگرتن";

   const delBtn=document.createElement("button");
   delBtn.type="button";delBtn.className="stock-action-btn";
   delBtn.dataset.cmpDelete=c.id;
   delBtn.textContent="سڕینەوە";

   tdAct.append(editBtn,toggleBtn,delBtn);
   tr.append(tdName,tdType,tdDates,tdPct,tdLinked,tdBudget,tdSt,tdAct);
   table.tBodies[0].append(tr);
 }
 root.append(table);
}
function syncAuditPager(){
 $("audit-page-info").textContent=auditPageRows.length?(auditPageOffset+1)+"–"+(auditPageOffset+auditPageRows.length)+" / "+auditPageTotal:"0 / "+auditPageTotal;
 $("audit-prev").disabled=busy||auditLoading||auditPageOffset<=0;
 $("audit-next").disabled=busy||auditLoading||auditPageOffset+50>=auditPageTotal;
 $("audit-export-csv").disabled=busy||auditLoading||!auditPageRows.length||!canManage()||!user;
}
async function refreshAudit(reset=true){
 if(!canManage()||!store||!user||tab!=="audit")return;
 const token=++auditListToken,storeId=store.id,actor=user.id;
 auditPageRows=[];auditPageTotal=0;auditLoading=true;$("audit-list").replaceChildren();syncAuditPager();msg("audit-msg","وەرگرتنی تۆمارەکان…");
 const current=()=>token===auditListToken&&store?.id===storeId&&user?.id===actor&&tab==="audit"&&canManage();
 try{
  if(reset||!auditPageFilters){auditPageOffset=0;auditPageFilters=window.RetailAuditHistory.criteria({query:$("audit-search-input").value,field:$("audit-search-field").value,period:$("audit-date-filter").value});}
  let result=await window.RetailAuditHistory.read({db,store:storeId,filters:auditPageFilters,offset:auditPageOffset});if(!current())return;
  if(auditPageOffset>0&&!result.rows.length&&result.total<=auditPageOffset){
   auditPageOffset=result.total?Math.floor((result.total-1)/50)*50:0;
   result=await window.RetailAuditHistory.read({db,store:storeId,filters:auditPageFilters,offset:auditPageOffset});if(!current())return;
  }
  auditPageRows=result.rows;auditPageTotal=result.total;
  renderTable("audit-list",["کات","کردار","ناسنامەی بەکارهێنەر","ناسنامەی بابەت"],auditPageRows.map(x=>[new Date(x.created_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}),x.action,x.actor_id,x.subject_id||"—"]));
  msg("audit-msg",auditPageRows.length?"":"هیچ تۆمارێک نەدۆزرایەوە");
 }catch(error){
  if(!current())return;
  auditPageRows=[];auditPageTotal=0;auditPageFilters=null;$("audit-list").replaceChildren();msg("audit-msg",safe(error),"error");
 }finally{if(token===auditListToken){auditLoading=false;syncAuditPager();}}
}
function invalidateAuditQuery(){
 clearTimeout(auditQueryTimer);++auditListToken;auditPageRows=[];auditPageTotal=0;auditPageFilters=null;
 $("audit-list").replaceChildren();auditLoading=true;syncAuditPager();
 auditQueryTimer=setTimeout(()=>{if(!busy)void refreshAudit(true);else{auditLoading=false;syncAuditPager();}},200);
}
function printLink(saleId,paper,label){
 const a=document.createElement("a");
 a.className="receipt-action";
 a.href="./receipt-print.html?sale="+encodeURIComponent(String(saleId))+"&paper="+paper;
 a.target="_blank";a.rel="noopener noreferrer";
 a.textContent=label;
 return a;
}
function computeEan13CheckDigit(twelveDigits){
 let sum=0;
 for(let i=0;i<12;i++){
   const d=twelveDigits.charCodeAt(i)-48;
   sum+=(i%2===0)?d:d*3;
 }
 return String((10-(sum%10))%10);
}
function buildScaleEan13(pluRaw,grams){
 const cleanPlu=String(pluRaw||"").replace(/^27/,"").trim();
 if(!/^\d{1,5}$/.test(cleanPlu))return null;
 const g=Math.round(Number(grams||0));
 if(!Number.isSafeInteger(g)||g<1||g>99999)return null;
 const body="27"+cleanPlu.padStart(5,"0")+String(g).padStart(5,"0");
 return body+computeEan13CheckDigit(body);
}
function renderLastSaleBar(){
 const bar=$("last-sale-bar");
 if(!bar)return;
 bar.replaceChildren();
 if(!lastCompletedSale){bar.hidden=true;return;}
 bar.hidden=false;
 const info=document.createElement("span");
 info.textContent="دواهەمین پسووڵە: #"+String(lastCompletedSale.receipt_no||"").padStart(6,"0")+" ("+money(lastCompletedSale.total_minor||0)+")";
 const actions=document.createElement("div");
 actions.style.display="flex";actions.style.gap="6px";actions.style.flexWrap="wrap";
 actions.append(
   printLink(lastCompletedSale.id,"58","چاپی 58mm"),
   printLink(lastCompletedSale.id,"80","چاپی 80mm")
 );
 const viewBtn=document.createElement("button");
 viewBtn.type="button";viewBtn.className="quick-cash-btn";
 viewBtn.textContent="پسووڵەکان";
 viewBtn.addEventListener("click",()=>{if(!busy)selectTab("receipts");});
 actions.append(viewBtn);
 bar.append(info,actions);
}
async function returnSale(saleId,targetMsgId="receipts-msg"){
 if(!db||!store||busy||!shiftSession){
   msg(targetMsgId,"بۆ گەڕاندنەوەی پسووڵە سەرەتا شێفتی کاشێر بکەرەوە","error");
   return;
 }
 if(!returnAttempt)loadReturnAttempt();
 if(returnAttempt?.uncertain&&(returnAttempt.saleId!==saleId||returnAttempt.sessionId!==shiftSession.id)){
   msg(targetMsgId,"ئەنجامی گەڕاندنەوەی پێشوو دیار نییە؛ سەرەتا هەمان پسووڵە دووبارە بکەرەوە","error");
   return;
 }
 if(!returnAttempt||returnAttempt.saleId!==saleId||returnAttempt.sessionId!==shiftSession.id){
   returnAttempt={id:crypto.randomUUID(),saleId,sessionId:shiftSession.id,uncertain:false};
   persistReturnAttempt();
 }
 lock(true);msg(targetMsgId,"");
 try{
   const {data,error}=await db.rpc("retail_return_sale_v19",{
     p_store:store.id,p_sale:returnAttempt.saleId,p_session:returnAttempt.sessionId,p_request:returnAttempt.id
   });
   if(error)throw error;
   returnAttempt=null;persistReturnAttempt();
   await loadInventory();
   await refreshShift();
   await loadCustomersAndLedger();
   if(tab==="returns"){
     selectedReturnSaleId=saleId;
     await refreshReturns(false);
   }else{await refreshReceipts();await showReceipt(saleId);}
   msg(targetMsgId,"پسووڵەی #"+String(data?.receipt_no||"").padStart(6,"0")+" گەڕێندرایەوە و بڕی کاڵاکان گەڕایەوە بۆ کۆگا","success");
 }catch(err){
   if(["22023","42501","22P02","23505","23514","PGRST202","42883"].includes(err?.code)){
     returnAttempt=null;persistReturnAttempt();
     msg(targetMsgId,safe(err),"error");
   }else{
     returnAttempt.uncertain=true;persistReturnAttempt();
     msg(targetMsgId,safe(err)+" — ئەنجامی گەڕاندنەوە دیار نییە؛ هەمان داواکاری دووبارە بکەرەوە","error");
   }
 }finally{
   lock(false);
 }
}
function updateReceiptsMetrics(rows){
 const list=rows||[];
 const activeSales=list.filter(s=>!s.refunded);
 const refundedSales=list.filter(s=>s.refunded);
 const activeTotal=activeSales.reduce((n,s)=>n+Number(s.total_minor||0)-Number(s.returned_minor_total||0),0);
 const refundedTotal=list.reduce((n,s)=>n+Number(s.returned_minor_total??(s.refunded?s.total_minor:0)),0);
 const discountTotal=list.reduce((n,s)=>n+Number(s.discount_minor||0),0);
 if($("receipts-metric-count"))$("receipts-metric-count").textContent=list.length.toLocaleString("en-US");
 if($("receipts-metric-active"))$("receipts-metric-active").textContent=money(activeTotal);
 if($("receipts-metric-refunded"))$("receipts-metric-refunded").textContent=money(refundedTotal)+" ("+refundedSales.length+")";
 if($("receipts-metric-discount"))$("receipts-metric-discount").textContent=money(discountTotal);
}
async function renderReceiptsView(autoShowFirst=true){
 const root=$("receipts-list");
 if(!root)return;
 root.replaceChildren();
 updateReceiptsMetrics(receiptPageRows);
 const pageRows=receiptPageRows;
 const pager=$("receipts-pagination");
 if(!pageRows.length){
   syncReceiptPager();
   const empty=document.createElement("div");empty.className="blank";empty.textContent="هیچ پسووڵەیەک نییە";root.append(empty);
   return;
 }

 syncReceiptPager();
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ژمارەی پسووڵە</th><th>کات</th><th>داشکاندن</th><th>کۆی گشتی</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const sale of pageRows){
  const tr=document.createElement("tr");
  const numLabel="#"+String(sale.receipt_no??"").padStart(6,"0")+(sale.refunded?" (گەڕاوە)":"");
  const vals=[numLabel,new Date(sale.created_at).toLocaleString("en-GB"),money(sale.discount_minor||0),money(sale.total_minor)];
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
 }
 root.append(table);
 if(autoShowFirst&&pageRows[0]){
   await showReceipt(pageRows[0].id);
 }
}
function syncReceiptPager(){
 const pager=$("receipts-pagination");if(!pager)return;
 pager.hidden=false;
 $("receipts-page-info").textContent=receiptPageRows.length?(receiptsOffset+1)+"–"+(receiptsOffset+receiptPageRows.length)+" / "+receiptPageTotal:"0 / "+receiptPageTotal;
 $("receipts-prev").disabled=busy||receiptLoading||receiptsOffset<=0;
 $("receipts-next").disabled=busy||receiptLoading||receiptsOffset+RECEIPTS_PAGE_SIZE>=receiptPageTotal;
}
async function refreshReceiptHistory(reset=false){
 if(!db||!store||!user)return;
 const epoch=++receiptListEpoch,storeId=store.id,actor=user.id;
 ++receiptDetailEpoch;$("receipt-detail").hidden=true;$("receipt-detail").replaceChildren();
 receiptPageRows=[];receiptPageTotal=0;receiptLoading=true;
 $("receipts-list").replaceChildren();updateReceiptsMetrics([]);syncReceiptPager();msg("receipts-msg","وەرگرتنی پسووڵەکان…");
 try{
  if(reset||!receiptFilters){receiptsOffset=0;receiptFilters=window.RetailReceiptHistory.criteria({query:$("receipts-search").value,status:$("receipts-status-filter").value,period:$("receipts-date-filter").value});}
  const current=()=>epoch===receiptListEpoch&&store?.id===storeId&&user?.id===actor&&tab==="receipts";
  let result=await window.RetailReceiptHistory.read({db,store:storeId,filters:receiptFilters,offset:receiptsOffset});
  if(!current())return;
  if(receiptsOffset>0&&!result.rows.length&&result.total<=receiptsOffset){
   receiptsOffset=result.total?Math.floor((result.total-1)/RECEIPTS_PAGE_SIZE)*RECEIPTS_PAGE_SIZE:0;
   result=await window.RetailReceiptHistory.read({db,store:storeId,filters:receiptFilters,offset:receiptsOffset});if(!current())return;
  }
  receiptPageRows=result.rows;receiptPageTotal=result.total;receiptLoading=false;
  msg("receipts-msg","");await renderReceiptsView(true);
 }catch(error){
  if(epoch!==receiptListEpoch||store?.id!==storeId||user?.id!==actor||tab!=="receipts")return;
  receiptFilters=null;receiptLoading=false;receiptPageRows=[];receiptPageTotal=0;$("receipts-list").replaceChildren();updateReceiptsMetrics([]);
  msg("receipts-msg",["42703","PGRST204","PGRST205"].includes(error?.code)?"پێکهاتەی پسووڵەکان لە سێرڤەر نوێ بکەرەوە":safe(error),"error");
 }finally{if(epoch===receiptListEpoch){receiptLoading=false;syncReceiptPager();}}
}
async function refreshReceipts(){
 if(tab==="receipts")return refreshReceiptHistory(true);
 if(!db||!store)return;
 msg("receipts-msg","");
 let {data,error}=await db.from("retail_sales")
 .select("id,receipt_no,total_minor,discount_minor,cash_received_minor,change_due_minor,cashier_id,status,refunded,returned_minor_total,created_at")
 .eq("store_id",store.id).eq("status","posted")
 .order("created_at",{ascending:false}).limit(100);
 if(["42703","PGRST204","PGRST205"].includes(error?.code)){
   ({data,error}=await db.from("retail_sales")
   .select("id,receipt_no,total_minor,cash_received_minor,change_due_minor,cashier_id,status,created_at")
   .eq("store_id",store.id).eq("status","posted")
   .order("created_at",{ascending:false}).limit(100));
 }
 if(error){msg("receipts-msg",safe(error),"error");return}
 allReceipts=data||[];
 // Legacy report/return caches remain bounded; receipt browsing uses independent server pages.
}
async function showReceipt(saleId){
 if(!db||!store||!user)return;
 const epoch=++receiptDetailEpoch,storeId=store.id,actor=user.id,sourceTab=tab;
 const detailCurrent=()=>epoch===receiptDetailEpoch&&store?.id===storeId&&user?.id===actor&&tab===sourceTab;
 $("receipt-detail").hidden=true;$("receipt-detail").replaceChildren();
 let [head,items]=await Promise.all([
   db.from("retail_sales").select("id,receipt_no,total_minor,discount_minor,cash_received_minor,change_due_minor,created_at,cashier_id,refunded")
     .eq("store_id",store.id).eq("id",saleId).eq("status","posted").single(),
   db.from("retail_sale_items").select("product_id,quantity,unit_price_minor,product_name_snapshot,package_type,package_barcode,units_per_package,base_units")
     .eq("store_id",store.id).eq("sale_id",saleId).limit(200)
 ]);
 if(!detailCurrent())return;
 if(["42703","PGRST204","PGRST205"].includes(head.error?.code))
   head=await db.from("retail_sales").select("id,receipt_no,total_minor,cash_received_minor,change_due_minor,created_at,cashier_id")
     .eq("store_id",store.id).eq("id",saleId).eq("status","posted").single();
 if(["42703","PGRST204","PGRST205"].includes(items.error?.code))
   items=await db.from("retail_sale_items").select("product_id,quantity,unit_price_minor,product_name_snapshot")
     .eq("store_id",store.id).eq("sale_id",saleId).limit(200);
 if(!detailCurrent())return;
 if(head.error||items.error){msg("receipts-msg",safe(head.error||items.error),"error");return}
 const sale=head.data;
 const box=$("receipt-detail");box.replaceChildren();box.hidden=false;
 const activeCfg={...defaultStoreSettings(),...storeSettings};
 const heading=document.createElement("h3");
 heading.textContent="پسووڵەی #"+String(sale.receipt_no).padStart(6,"0")+(sale.refunded?" — ئەم پسوولەیە گەڕێندراوەتەوە":"");
 box.append(heading);
 const contactBanner=document.createElement("div");
 contactBanner.style.cssText="display:flex;gap:14px;flex-wrap:wrap;padding:8px 12px;margin-bottom:8px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-weight:750;color:#1e293b";
 const stNameSpan=document.createElement("span");
 stNameSpan.textContent="🏪 "+(activeCfg.storeName||store?.name||"سوپەرمارکێتی کانی چنار");
 const stAddrSpan=document.createElement("span");
 stAddrSpan.textContent="📍 ناونیشان: "+(activeCfg.storeAddress||"هەولێر — کانی چنار");
 const stPhoneSpan=document.createElement("span");
 stPhoneSpan.textContent="📞 ژمارەی تەلەفۆن: "+(activeCfg.storePhone||"0750 000 0000");
 contactBanner.append(stNameSpan,stAddrSpan,stPhoneSpan);
 box.append(contactBanner);
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
   retBtn.addEventListener("click",()=>{if(!busy)void returnSale(saleId,"receipts-msg");});
   const openRetTabBtn=document.createElement("button");
   openRetTabBtn.type="button";openRetTabBtn.className="receipt-action";openRetTabBtn.textContent="کردنەوە لە بەشی گەڕاندنەوە";
   openRetTabBtn.addEventListener("click",()=>{if(!busy){selectedReturnSaleId=saleId;selectTab("returns");}});
   printActions.append(retBtn,openRetTabBtn);
 }
 box.append(printActions);
 const table=document.createElement("table");table.innerHTML="<thead><tr><th>کاڵا</th><th>بڕ</th><th>نرخ</th><th>کۆ</th></tr></thead><tbody></tbody>";
 for(const line of items.data||[]){
   const tr=document.createElement("tr"),p=products.find(x=>x.id===line.product_id);
   const unitInfo=line.base_unit_snapshot==="kg"?" — "+String(line.quantity)+" kg":line.package_type==="carton"&&Number(line.units_per_package)>=2?
     " — "+String(line.quantity)+" کارتۆن × "+String(line.units_per_package)+" دانە":
     line.package_type==="unit"?" — "+String(line.quantity)+" دانە":"";
   for(const v of [(line.product_name_snapshot||p?.name||line.product_id)+unitInfo,
      String(line.quantity),money(line.unit_price_minor),money(Number(line.quantity)*Number(line.unit_price_minor))]){
     const td=document.createElement("td");td.textContent=v;tr.append(td);
   }table.tBodies[0].append(tr);
 }t.append(table);
}
$("receipt-cfg-save-btn")?.addEventListener("click",async()=>{
 if(busy)return;
 const storeName=String($("receipt-cfg-name")?.value||"").trim()||"سوپەرمارکێتی کانی چنار";
 const storeAddress=String($("receipt-cfg-address")?.value||"").trim()||"هەولێر — کانی چنار";
 const storePhone=String($("receipt-cfg-phone")?.value||"").trim()||"0750 000 0000";
 const receiptFooter=String($("receipt-cfg-footer")?.value||"").trim()||"سوپاس بۆ کڕینەکەتان";
 localStorage.setItem("retail_store_address",storeAddress);
 localStorage.setItem("retail_store_phone",storePhone);
 localStorage.setItem("retail_receipt_footer",receiptFooter);
 if(db&&store&&storeName!==store.name){
   try{
     await db.from("retail_stores").update({name:storeName}).eq("id",store.id);
     store.name=storeName;
   }catch(_e){}
 }
 await persistStoreSettingsToServer({storeName,storeAddress,storePhone,receiptFooter});
 if(receiptPageRows[0]?.id)await showReceipt(receiptPageRows[0].id);
 msg("receipts-msg","ناونیشان و ژمارەی تەلەفۆنی سەر پسووڵە پاشەکەوت کرا و لەسەر هەموو پسووڵەیەک دەردەکەوێت ✓","success");
});
$("receipts-refresh").addEventListener("click",()=>{if(!busy){receiptsOffset=0;void refreshReceipts();}});
if($("receipts-search")){
 $("receipts-search").addEventListener("input",()=>{void refreshReceiptHistory(true);});
}
if($("receipts-status-filter")){
 $("receipts-status-filter").addEventListener("change",()=>{void refreshReceiptHistory(true);});
}
if($("receipts-date-filter")){
 $("receipts-date-filter").addEventListener("change",()=>{void refreshReceiptHistory(true);});
}
if($("receipts-prev")){
 $("receipts-prev").addEventListener("click",()=>{
   if(!busy&&!receiptLoading&&receiptsOffset>=RECEIPTS_PAGE_SIZE){receiptsOffset-=RECEIPTS_PAGE_SIZE;void refreshReceiptHistory();}
 });
}
if($("receipts-next")){
 $("receipts-next").addEventListener("click",()=>{
   const total=receiptPageTotal;
   if(!busy&&!receiptLoading&&receiptsOffset+RECEIPTS_PAGE_SIZE<total){receiptsOffset+=RECEIPTS_PAGE_SIZE;void refreshReceiptHistory();}
 });
}
$("receipts-list").addEventListener("click",e=>{
 const ret=e.target.closest("[data-return-sale]");
 if(ret&&!busy){void returnSale(ret.dataset.returnSale,"receipts-msg");return;}
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
 shiftSummaryData=summary||null;
 const has=!!shiftSession;
 $("shift-open-form").hidden=!shiftVerified||has;
 $("shift-open-box").hidden=!shiftVerified||has;
 $("shift-state").textContent=!shiftVerified?"دۆخی شێفت پشتڕاست نەکراوەتەوە":has?"شێفت کراوەیە":"شێفتی کراوەت نییە";
 $("shift-active-forms").hidden=!has;
 $("shift-current").hidden=!has;
 for(const id of ["shift-opening","shift-sales","shift-moves","shift-expected","shift-profit"])$(id).textContent="—";
 if(summary){
  $("shift-opening").textContent=money(summary.opening);
  $("shift-sales").textContent=money(summary.sales);
  $("shift-moves").textContent=money(summary.movements);
  $("shift-expected").textContent=money(summary.expected);
  if($("shift-profit")) $("shift-profit").textContent=summary.profit!=null?money(summary.profit):"—";
 }
 $("movement-retry").hidden=!pendingCashMovement;
 $("movement-retry").disabled=busy;
 if($("pay-retry")){
  $("pay-retry").hidden=!pendingCashMovement;
  $("pay-retry").disabled=busy;
 }
 syncPending();
}
function syncShiftPager(){
 $("shift-prev").disabled=busy||shiftHistoryLoading||shiftOffset<=0;
 $("shift-next").disabled=busy||shiftHistoryLoading||shiftOffset+50>=shiftTotal;
 $("shift-page-info").textContent=shiftRows.length?(shiftOffset+1)+"–"+(shiftOffset+shiftRows.length)+" / "+shiftTotal:"0 / "+shiftTotal;
}
async function refreshShiftHistory(reset=true){
 if(!db||!store||!user||tab!=="shift")return;
 const token=++shiftHistoryToken,storeId=store.id,actor=user.id;
 const current=()=>token===shiftHistoryToken&&store?.id===storeId&&user?.id===actor&&tab==="shift";
 shiftRows=[];shiftTotal=0;shiftHistoryLoading=true;$("shift-history").replaceChildren();syncShiftPager();msg("shift-history-msg","وەرگرتنی شێفتەکان…");
 try{
  if(reset||!shiftFilters){shiftOffset=0;shiftFilters=window.RetailShiftHistory.criteria({status:$("shift-status-filter").value,period:$("shift-date-filter").value});}
  let result=await window.RetailShiftHistory.read({db,store:storeId,actor,filters:shiftFilters,offset:shiftOffset});if(!current())return;
  if(shiftOffset>0&&!result.rows.length&&result.total<=shiftOffset){shiftOffset=result.total?Math.floor((result.total-1)/50)*50:0;result=await window.RetailShiftHistory.read({db,store:storeId,actor,filters:shiftFilters,offset:shiftOffset});if(!current())return;}
  shiftRows=result.rows;shiftTotal=result.total;
  renderTable("shift-history",["کات","دۆخ","پارەی سەرەتا","پارەی ژمێردراو","جیاوازی"],shiftRows.map(x=>[new Date(x.opened_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}),x.status==="open"?"کراوە":"داخراوە",money(x.opening_cash_minor),x.counted_cash_minor==null?"—":money(x.counted_cash_minor),x.variance_minor==null?"—":money(x.variance_minor)]));
  msg("shift-history-msg",shiftRows.length?"":"هیچ شێفتێک نەدۆزرایەوە");
 }catch(error){if(!current())return;shiftRows=[];shiftTotal=0;shiftFilters=null;msg("shift-history-msg",safe(error),"error");}
 finally{if(current()){shiftHistoryLoading=false;syncShiftPager();}}
}
async function refreshShift(){
 if(!db||!store||!user)return false;
 const token=++shiftEpoch,storeId=store.id,actor=user.id;
 const current=()=>token===shiftEpoch&&store?.id===storeId&&user?.id===actor;
 shiftVerified=false;shiftSession=null;redrawShift(null);
 try{
  const session=await window.RetailShiftHistory.current({db,store:storeId,actor});if(!current())return false;
  let summary=null;
  if(session){const reply=await db.rpc("retail_shift_summary",{p_store:storeId,p_session:session.id});if(!current())return false;if(reply.error)throw reply.error;summary=window.RetailShiftHistory.summary(reply.data,session.id);}
  shiftSession=session;shiftVerified=true;
  if(session){try{const saved=JSON.parse(sessionStorage.getItem(cashMoveKey())||"null");pendingCashMovement=saved&&saved.sessionId===session.id?saved:null;}catch{pendingCashMovement=null;}}
  else pendingCashMovement=null;
  redrawShift(summary);
  if(!session&&!pendingCheckout)msg("checkout-msg","بۆ فرۆشتن سەرەتا شێفت بکەرەوە");
  // Retain the independent bounded legacy report cache, never use it to find the active shift.
  const legacy=await db.from("retail_cash_sessions").select("id,status,opening_cash_minor,opened_at,expected_cash_minor,counted_cash_minor,variance_minor").eq("store_id",storeId).eq("cashier_id",actor).order("opened_at",{ascending:false}).limit(30);
  if(!current())return false;
  shiftSessionsHistory=legacy.error?[]:legacy.data||[];
  return true;
 }catch(error){if(current()){shiftVerified=false;shiftSession=null;redrawShift(null);msg("shift-msg",safe(error),"error");}return false;}
 finally{if(current()&&tab==="shift")void refreshShiftHistory();}
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
async function commitCashMovement(targetMsgId="shift-msg"){
 if(!db||busy||!pendingCashMovement)return;
 lock(true);msg(targetMsgId);
 try{
  const v=pendingCashMovement;
  const {error}=await db.rpc("retail_cash_movement",{
    p_store:store.id,p_session:v.sessionId,p_request:v.id,
    p_kind:v.kind,p_amount:v.amount,p_note:v.note
  });
  if(error)throw error;
  pendingCashMovement=null;saveCashMove();
  $("shift-movement-form")?.reset();
  $("payments-form")?.reset();
  msg(targetMsgId,"جووڵەی پارە تۆمارکرا","success");
  await refreshShift();
  if(tab==="payments")await refreshPayments();
 }catch(e){
  if(["22023","42501","23505"].includes(e?.code)){
    pendingCashMovement=null;saveCashMove();
    msg(targetMsgId,safe(e),"error");
  }else msg(targetMsgId,safe(e)+" — پشکنینەوە بە هەمان داواکاری","error");
 }finally{
  lock(false);
  $("movement-retry").hidden=!pendingCashMovement;
  if($("pay-retry"))$("pay-retry").hidden=!pendingCashMovement;
 }
}
function syncPaymentsPager(){
 if(!$("payments-prev"))return;
 $("payments-prev").disabled=busy||paymentLoading||paymentOffset<=0;
 $("payments-next").disabled=busy||paymentLoading||paymentOffset+50>=paymentTotal;
 $("payments-page-info").textContent=paymentRows.length?(paymentOffset+1)+"–"+(paymentOffset+paymentRows.length)+" / "+paymentTotal:"0 / "+paymentTotal;
 $("pay-submit").disabled=busy||!paymentVerified||!shiftSession||!!pendingCashMovement;
 $("pay-open-shift-box").hidden=!paymentVerified||!!shiftSession;
}
function renderPaymentsList(){
 $("pay-shift-status").textContent=!paymentVerified?"پشتڕاست نەکراوەتەوە":shiftSession?"کراوە (چالاک)":"داخراوە";
 $("pay-sales-total").textContent=paymentVerified?money((shiftSummaryData?.opening||0)+(shiftSummaryData?.sales||0)):"—";
 $("pay-expected-balance").textContent=paymentVerified?money(shiftSummaryData?.expected||0):"—";
 $("pay-retry").hidden=!pendingCashMovement;
 renderTable("payments-list",["کات","جۆری مامەڵە","بڕی پارە","بابەت و تێبینی"],paymentRows.map(m=>[
  new Date(m.created_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}),m.kind==="cash_in"?"وەرگرتنی پارە (هاتوو)":"پارەدان / خەرجی (دەرچوو)",money(m.amount_minor),m.note||"—"
 ]));syncPaymentsPager();
}
async function refreshPayments(reset=true){
 if(!db||!store||!user||tab!=="payments")return;
 const token=++paymentToken,storeId=store.id,actor=user.id;
 const current=()=>token===paymentToken&&store?.id===storeId&&user?.id===actor&&tab==="payments";
 paymentRows=[];paymentTotal=0;paymentLoading=true;paymentVerified=false;renderPaymentsList();msg("payments-msg","وەرگرتنی جووڵەکان…");
 try{
  if(!await refreshShift()){if(current())throw Error("دۆخی شێفت پشتڕاست نەکرایەوە؛ نوێکردنەوە بکە");return;}
  if(!current())return;
  paymentVerified=true;
  if(!shiftSession){paymentSession=null;paymentOffset=0;msg("payments-msg","سەرەتا شێفت بکەرەوە");return;}
  const session=shiftSession.id;
  if(reset||!paymentFilters||paymentSession!==session){paymentOffset=0;paymentFilters=window.RetailPaymentsHistory.criteria({query:$("payments-search").value,field:$("payments-search-field").value,kind:$("payments-kind-filter").value});}
  paymentSession=session;
  let result=await window.RetailPaymentsHistory.read({db,store:storeId,session,filters:paymentFilters,offset:paymentOffset});if(!current()||shiftSession?.id!==session)return;
  if(paymentOffset>0&&!result.rows.length&&result.total<=paymentOffset){paymentOffset=result.total?Math.floor((result.total-1)/50)*50:0;result=await window.RetailPaymentsHistory.read({db,store:storeId,session,filters:paymentFilters,offset:paymentOffset});if(!current()||shiftSession?.id!==session)return;}
  paymentRows=result.rows;paymentTotal=result.total;msg("payments-msg",paymentRows.length?"":"هیچ جووڵەیەک نەدۆزرایەوە");
 }catch(error){if(!current())return;paymentRows=[];paymentTotal=0;paymentFilters=null;msg("payments-msg",safe(error),"error");}
 finally{if(current()){paymentLoading=false;renderPaymentsList();}}
}
function invalidatePayments(){
 clearTimeout(paymentTimer);++paymentToken;paymentRows=[];paymentTotal=0;paymentFilters=null;paymentLoading=true;renderPaymentsList();
 paymentTimer=setTimeout(()=>{void refreshPayments();},200);
}
function updateReturnItemBarcodes(){
 const line=returnReceiptLines.find(x=>x.id===$("return-item-product")?.value);
 selectedReturnLineId=line?.id||null;
 const codeSel=$("return-item-barcode"),qtyIn=$("return-item-qty"),refundIn=$("return-item-refund");
 if(codeSel){codeSel.replaceChildren();if(line){const option=document.createElement("option");option.value=line.package_barcode||"";option.textContent=line.package_barcode||"—";codeSel.append(option);}codeSel.disabled=true;}
 if(!line){if(refundIn)refundIn.value="";if(qtyIn){qtyIn.value="";qtyIn.removeAttribute("max");}return;}
 const kg=line.base_unit_snapshot==="kg";
 if(qtyIn){qtyIn.step=kg?"0.001":"1";qtyIn.min=kg?"0.001":"1";qtyIn.max=String(line.remaining_quantity);if(!(Number(qtyIn.value)>0)||Number(qtyIn.value)>Number(line.remaining_quantity))qtyIn.value=String(line.remaining_quantity);}
 const qty=Number(qtyIn?.value||0);
 if(!Number.isFinite(qty)||qty<=0||qty>Number(line.remaining_quantity)){if(refundIn)refundIn.value="";return;}
 const total=BigInt(Math.round(Number(line.quantity)*1000)),next=BigInt(Math.round((Number(line.returned_quantity)+qty)*1000));
 const refund=(2n*BigInt(line.net_minor)*next+total)/(2n*total)-BigInt(line.returned_minor);
 if(refundIn)refundIn.value=qty>0&&qty<=Number(line.remaining_quantity)?String(refund):"";
}
function populateReturnItemProducts(){
 const select=$("return-item-product");if(!select)return;
 const previous=selectedReturnLineId;select.replaceChildren();
 for(const line of returnReceiptLines.filter(x=>Number(x.remaining_quantity)>0)){
  const option=document.createElement("option");option.value=line.id;option.textContent=(line.product_name_snapshot||line.product_id)+" — "+line.remaining_quantity+" "+(line.base_unit_snapshot==="kg"?"kg":line.package_type==="carton"?"کارتۆن":"دانە");select.append(option);
 }
 if([...select.options].some(o=>o.value===previous))select.value=previous;
 updateReturnItemBarcodes();
}
function clearReturnSelection(){
 ++returnDetailToken;selectedReturnSaleId=null;selectedReturnLineId=null;returnReceiptLines=[];populateReturnItemProducts();
 $("returns-selected-box").hidden=true;$("returns-selected-box").replaceChildren();$("returns-item-form").hidden=true;
}
async function showReturnReceiptDetail(saleId){
 if(!db||!store||!user||!saleId||tab!=="returns")return;
 const storeId=store.id,actor=user.id;
 $("returns-item-form").hidden=true;
 selectedReturnSaleId=saleId;
 selectedReturnLineId=null;returnReceiptLines=[];populateReturnItemProducts();
 const oldBox=$("returns-selected-box");if(oldBox)oldBox.hidden=true;
 const token=++returnDetailToken;
 const {data,error}=await db.rpc("retail_return_state_v22",{p_store:store.id,p_sale:saleId});
 if(token!==returnDetailToken||store?.id!==storeId||user?.id!==actor||tab!=="returns")return;
 if(error||!data?.sale||data.sale.id!==saleId||!Array.isArray(data.items)){msg("returns-msg",safe(error||new Error("پسووڵە نەدۆزرایەوە")),"error");return;}
 const sale=data.sale,items={data:data.items||[]};returnReceiptLines=items.data;populateReturnItemProducts();
 $("returns-item-form").hidden=!!sale.refunded||!returnReceiptLines.some(line=>Number(line.remaining_quantity)>0);
 const box=$("returns-selected-box");
 if(!box)return;
 box.replaceChildren();box.hidden=false;
 const heading=document.createElement("h3");
 heading.textContent="پسووڵەی هەڵبژێردراو #"+String(sale.receipt_no).padStart(6,"0")+(sale.refunded?" — ئەم پسووڵەیە بە تەواوی گەڕێندراوەتەوە":" — ئامادەیە بۆ گەڕاندنەوە");
 box.append(heading);
 const info=document.createElement("div");info.className="receipt-metrics";
 const metricParts=[
   ["کۆی گشتی پسووڵە",money(sale.total_minor)],
   ["پارەی وەرگیراو",money(sale.cash_received_minor)],
   ["پارەی گەڕاوە",money(sale.change_due_minor)],
   ["کات",new Date(sale.created_at).toLocaleString("en-GB")]
 ];
 if(Number(sale.discount_minor)>0)metricParts.splice(1,0,["داشکاندن",money(sale.discount_minor)]);
 for(const part of metricParts){
   const span=document.createElement("span"),bold=document.createElement("strong");
   span.textContent=part[0]+": ";bold.textContent=part[1];span.append(bold);info.append(span);
 }
 box.append(info);
 const actions=document.createElement("div");actions.className="receipt-print-actions";
 actions.append(printLink(saleId,"58","چاپی 58mm"),printLink(saleId,"80","چاپی 80mm"));
 if(!sale.refunded){
   const retBtn=document.createElement("button");
   retBtn.type="button";retBtn.className="return-btn";retBtn.id="returns-full-btn";
   retBtn.dataset.returnSale=saleId;
   retBtn.textContent="گەڕاندنەوەی تەواوی پسووڵە و گێڕانەوەی کۆگا";
   retBtn.addEventListener("click",()=>{if(!busy)void returnSale(saleId,"returns-msg");});
   actions.append(retBtn);
 }
 box.append(actions);
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کاڵا</th><th>بڕ</th><th>نرخی تاک</th><th>کۆی ڕیز</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const line of items.data||[]){
   const tr=document.createElement("tr"),p=products.find(x=>x.id===line.product_id);
   const lineSum=Number(line.net_minor);
   const unitInfo=line.package_type==="carton"&&Number(line.units_per_package)>=2?
     " — "+String(line.quantity)+" کارتۆن × "+String(line.units_per_package)+" دانە":
     line.package_type==="unit"?" — "+String(line.quantity)+" دانە":"";
   for(const v of [(line.product_name_snapshot||p?.name||line.product_id)+unitInfo,
      String(line.quantity)+" / ماوە: "+String(line.remaining_quantity),money(line.unit_price_minor),money(lineSum)]){
     const td=document.createElement("td");td.textContent=v;tr.append(td);
   }
   const tdAct=document.createElement("td");
   if(!sale.refunded&&Number(line.remaining_quantity)>0){
     const pickItemBtn=document.createElement("button");
     pickItemBtn.type="button";pickItemBtn.className="receipt-action";
     pickItemBtn.textContent="گەڕاندنەوەی ئەم کاڵایە";
     pickItemBtn.addEventListener("click",()=>{
       selectedReturnLineId=line.id;
       if($("return-item-product"))$("return-item-product").value=line.id;
       if($("return-item-qty"))$("return-item-qty").value=String(line.remaining_quantity);
       updateReturnItemBarcodes();
       $("return-item-qty")?.focus();
     });
     tdAct.append(pickItemBtn);
   }else{
     tdAct.textContent="گەڕاوەتەوە";
   }
   tr.append(tdAct);
   table.tBodies[0].append(tr);
 }
 box.append(table);
}
function renderReturnsList(){
 const root=$("returns-list");
 if(!root)return;
 root.replaceChildren();
 const rows=returnPageRows;
 syncReturnPager();
 if(!rows.length){
   const empty=document.createElement("div");empty.className="blank";empty.textContent="هیچ پسووڵەیەک نەدۆزرایەوە";root.append(empty);
   return;
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ژمارەی پسووڵە</th><th>کات</th><th>کۆی گشتی</th><th>دۆخ</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const sale of rows){
   const tr=document.createElement("tr");
   const numLabel="#"+String(sale.receipt_no??"").padStart(6,"0");
   const statusLabel=sale.refunded?"گەڕێندراوەتەوە":"چالاک (ئامادە بۆ گەڕاندنەوە)";
   for(const val of [numLabel,new Date(sale.created_at).toLocaleString("en-GB"),money(sale.total_minor),statusLabel]){
     const td=document.createElement("td");td.textContent=val;tr.append(td);
   }
   const td=document.createElement("td");
   const inspectBtn=document.createElement("button");
   inspectBtn.type="button";inspectBtn.className="receipt-action";inspectBtn.dataset.inspectReturn=sale.id;
   inspectBtn.textContent="هەڵبژاردن و پشکنین";
   td.append(inspectBtn,printLink(sale.id,"58","58mm"),printLink(sale.id,"80","80mm"));
   if(!sale.refunded){
     const retBtn=document.createElement("button");
     retBtn.type="button";retBtn.className="return-btn";retBtn.dataset.returnSale=sale.id;retBtn.textContent="گەڕاندنەوەی تەواو";
     td.append(retBtn);
   }
   tr.append(td);table.tBodies[0].append(tr);
 }
 root.append(table);
}
function syncReturnPager(){
 const pager=$("returns-pagination");if(!pager)return;
 $("returns-page-info").textContent=returnPageRows.length?(returnPageOffset+1)+"–"+(returnPageOffset+returnPageRows.length)+" / "+returnPageTotal:"0 / "+returnPageTotal;
 $("returns-prev").disabled=busy||returnLoading||returnPageOffset<=0;
 $("returns-next").disabled=busy||returnLoading||returnPageOffset+RECEIPTS_PAGE_SIZE>=returnPageTotal;
}
async function refreshReturns(reset=true,keepSelected=true){
 if(!db||!store||!user||tab!=="returns")return;
 const storeId=store.id,actor=user.id,token=++returnListToken,wanted=keepSelected?selectedReturnSaleId:null;
 ++returnLookupToken;clearReturnSelection();returnPageRows=[];returnPageTotal=0;returnLoading=true;
 $("returns-list").replaceChildren();syncReturnPager();msg("returns-msg","وەرگرتنی پسووڵەکان…");
 const current=()=>token===returnListToken&&store?.id===storeId&&user?.id===actor&&tab==="returns";
 try{
  if(reset||!returnPageFilters){returnPageOffset=0;returnPageFilters=window.RetailReceiptHistory.criteria({status:$("returns-filter-mode").value});}
  let result=await window.RetailReceiptHistory.read({db,store:storeId,filters:returnPageFilters,offset:returnPageOffset});if(!current())return;
  if(returnPageOffset>0&&!result.rows.length&&result.total<=returnPageOffset){
   returnPageOffset=result.total?Math.floor((result.total-1)/RECEIPTS_PAGE_SIZE)*RECEIPTS_PAGE_SIZE:0;
   result=await window.RetailReceiptHistory.read({db,store:storeId,filters:returnPageFilters,offset:returnPageOffset});if(!current())return;
  }
  returnPageRows=result.rows;returnPageTotal=result.total;returnLoading=false;renderReturnsList();msg("returns-msg","");
  const targetId=wanted||returnPageRows[0]?.id;if(targetId)await showReturnReceiptDetail(targetId);
 }catch(error){
  if(!current())return;
  returnPageRows=[];returnPageTotal=0;returnPageFilters=null;clearReturnSelection();$("returns-list").replaceChildren();
  msg("returns-msg",safe(error),"error");
 }finally{if(token===returnListToken){returnLoading=false;syncReturnPager();}}
}
async function renderCashCatalogSearch(queryOverride){
 const box=$("cash-search-results");
 const wrap=$("cash-catalog-box");
 if(!box)return [];
 const q=String(queryOverride!==undefined?queryOverride:($("barcode")?.value||"")).trim();
 if(!q){
   box.replaceChildren();
   if(wrap)wrap.hidden=true;
   return [];
 }
 if(db&&store){
   try{
     const v18=await db.rpc("retail_catalog_page_v18",{p_store:store.id,p_search:q,p_offset:0,p_limit:20});
     if(!v18.error&&Array.isArray(v18.data?.items)){
       for(const item of v18.data.items){
         if(item.active!==false)upsertHotProduct(item,item.barcode_details||[],item.stock_quantity);
       }
     }
   }catch(_e){}
 }
 box.replaceChildren();
 const ql=q.toLocaleLowerCase();
 const matched=products.filter(p=>{
   if(p.active===false||p.currency!=="IQD")return false;
   if(String(p.name||"").toLocaleLowerCase().includes(ql))return true;
   if(String(p.plu||"").toLocaleLowerCase().includes(ql)||String(p.sku||"").toLocaleLowerCase().includes(ql))return true;
   return barcodes.some(b=>b.product_id===p.id&&b.active!==false&&String(b.code||"").toLocaleLowerCase().includes(ql));
 }).slice(0,20);
 if(!matched.length){
   const empty=document.createElement("div");empty.className="blank";empty.textContent="هیچ کاڵایەک نەدۆزرایەوە";box.append(empty);
   return [];
 }
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کاڵا</th><th>نرخ</th><th>بڕی کۆگا</th><th>زیادکردن بۆ سەبەتە</th></tr></thead><tbody></tbody>";
 for(const p of matched){
   const tr=document.createElement("tr");
   const isKg=p.base_unit==="kg";
   const stockQty=Number(balances.get(p.id)||0);
   const stockText=isKg?stockQty.toFixed(3)+" کگم":stockQty+" دانە";
   const unitBarcode=barcodes.find(b=>b.product_id===p.id&&b.unit_type==="unit"&&b.active!==false&&!b.is_scale);
   const cartonBarcode=barcodes.find(b=>b.product_id===p.id&&b.unit_type==="carton"&&b.active!==false);
   for(const v of [p.name,money(p.price_minor)+(isKg?" / کگم":""),stockText]){
     const td=document.createElement("td");td.textContent=v;tr.append(td);
   }
   const tdAct=document.createElement("td");
   if(isKg){
     const kgBtn=document.createElement("button");
     kgBtn.type="button";kgBtn.className="stock-pick-btn";
     kgBtn.textContent="+ زیادکردن بە کێش";
     kgBtn.addEventListener("click",()=>{
       const grams=Number($("cash-scale-grams")?.value||1000);
       const rawPlu=p.plu||p.sku||unitBarcode?.code||"";
       const scaleCode=buildScaleEan13(rawPlu,grams);
       if(!scaleCode){
         msg("scan-msg","ئەم کاڵایە کۆدی تەرازووی (PLU) نییە","error");
         return;
       }
       if(wrap)wrap.hidden=true;
       $("barcode").value=scaleCode;
       $("scan-form").requestSubmit();
     });
     tdAct.append(kgBtn);
   }else{
     if(unitBarcode){
       const uBtn=document.createElement("button");
       uBtn.type="button";uBtn.className="stock-pick-btn";
       uBtn.textContent="+ دانە";
       uBtn.addEventListener("click",()=>{
         if(wrap)wrap.hidden=true;
         $("barcode").value=unitBarcode.code;
         $("scan-form").requestSubmit();
       });
       tdAct.append(uBtn);
     }
     if(cartonBarcode){
       const cBtn=document.createElement("button");
       cBtn.type="button";cBtn.className="stock-pick-btn";cBtn.style.marginInlineStart="6px";
       cBtn.textContent="+ کارتۆن ("+cartonBarcode.units_per_scan+")";
       cBtn.addEventListener("click",()=>{
         if(wrap)wrap.hidden=true;
         $("barcode").value=cartonBarcode.code;
         $("scan-form").requestSubmit();
       });
       tdAct.append(cBtn);
     }
   }
   tr.append(tdAct);
   table.tBodies[0].append(tr);
 }
 box.append(table);
 return matched;
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
 await loadCustomersAndLedger();
 await loadSuppliersAndPurchasing();
 await loadFinanceEntries();
 await loadReportsData();
 await loadSettingsAndStaffProfiles();
 await loadOffersAndDiscountsData();
 if(window.RETAIL_DEMO_MODE===true){loadShiftStaffSubsectionsData();loadLabelsAndAuditSubsectionsData();}
 await refreshShift();
 loadParked();
 loadReturnAttempt();
 restorePending();
 const normalizedView=["low-stock","expiry","movements"].includes(view)?"stock":
   ["customer-debts","customer-history","customer-payments"].includes(view)?"customers":
   ["purchase-orders","receiving","supplier-accounts","suppliers-dir"].includes(view)?"suppliers":
   ["treasury","revenue","expenses","cashflow"].includes(view)?"finance":
   ["sales-report","profit-report","inventory-report","smart-insights"].includes(view)?"reports":
   ["settings","permissions","devices","system"].includes(view)?"staff":
   ["offers","discounts","coupons","campaigns"].includes(view)?"offers":
   ["attendance","workhours","evaluation"].includes(view)?"shift":
   ["labels","label-price","label-barcode","label-batch","label-template"].includes(view)?"labels":
   ["alerts","approvals"].includes(view)?"audit":view;
 selectTab(["cash","stock","customers","suppliers","finance","reports","staff","offers","labels","audit","receipts","shift","payments","returns"].includes(normalizedView)?normalizedView:"shift");
 if(normalizedView==="stock"&&initialStockProduct&&$("stock-quantity")){
   $("stock-quantity").focus();
 }
 syncPending();
}
async function init(){
 if($("low-threshold-input")&&localStorage.getItem("retail_low_threshold")){
  $("low-threshold-input").value=localStorage.getItem("retail_low_threshold");
 }
 if($("low-target-input")&&localStorage.getItem("retail_low_target")){
  $("low-target-input").value=localStorage.getItem("retail_low_target");
 }
 syncSoundToggleBtn();
 $("scan-sound-toggle")?.addEventListener("click",()=>{
  scanSoundEnabled=!scanSoundEnabled;
  localStorage.setItem("retail_scan_sound",scanSoundEnabled?"1":"0");
  syncSoundToggleBtn();
  if(scanSoundEnabled)playScanBeep(true);
  focusScanner();
 });
 $("cash-catalog-close")?.addEventListener("click",()=>{
  const box=$("cash-catalog-box");
  if(box)box.hidden=true;
  if($("barcode"))$("barcode").value="";
  focusScanner();
 });
 $("payments-refresh")?.addEventListener("click",()=>{if(!busy)void refreshPayments();});
 $("payments-go-shift")?.addEventListener("click",()=>{if(!busy)selectTab("shift");});
 $("payments-search")?.addEventListener("input",invalidatePayments);
 $("payments-kind-filter")?.addEventListener("change",invalidatePayments);
 $("payments-search-field").addEventListener("change",invalidatePayments);
 $("payments-prev").addEventListener("click",()=>{if(!busy&&!paymentLoading&&paymentOffset>=50){paymentOffset-=50;void refreshPayments(false);}});
 $("payments-next").addEventListener("click",()=>{if(!busy&&!paymentLoading&&paymentOffset+50<paymentTotal){paymentOffset+=50;void refreshPayments(false);}});
 $("pay-quick-row")?.addEventListener("click",e=>{
  const btn=e.target.closest("[data-pay-quick]");
  if(!btn||busy)return;
  const add=Number(btn.dataset.payQuick||0);
  const cur=Number($("pay-amount")?.value||0);
  if($("pay-amount"))$("pay-amount").value=String((Number.isSafeInteger(cur)&&cur>0?cur:0)+add);
 });
 $("pay-shift-open-form")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!db||!store||busy||shiftSession||!paymentVerified)return;
  const opening=Number(new FormData(e.target).get("opening"));
  if(!Number.isSafeInteger(opening)||opening<0||opening>9999999999999){msg("payments-msg","بڕی سەرەتایی نادروستە","error");return}
  lock(true);msg("payments-msg","");
  try{
   const {error}=await db.rpc("retail_shift_open",{p_store:store.id,p_opening:opening});
   if(error)throw error;
   e.target.reset();
   msg("payments-msg","شێفتی سندووق کرایەوە","success");
   await refreshPayments();
  }catch(err){msg("payments-msg",safe(err),"error");}
  finally{lock(false);}
 });
 $("payments-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!shiftSession){msg("payments-msg","سەرەتا شێفتی سندووق بکەرەوە","error");return;}
  if(busy||pendingCashMovement||!paymentVerified)return;
  const f=new FormData(e.target);
  const kind=String(f.get("kind")||"cash_out");
  const category=String(f.get("category")||"").trim();
  const amount=Number(f.get("amount"));
  const rawNote=String(f.get("note")||"").trim();
  const note=(category?category+" — "+rawNote:rawNote).slice(0,160);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>9999999999999||!rawNote){
   msg("payments-msg","بڕ یان تێبینی مامەڵەی پارە نادروستە","error");return;
  }
  pendingCashMovement={id:crypto.randomUUID(),sessionId:shiftSession.id,kind,amount,note};
  saveCashMove();
  await commitCashMovement("payments-msg");
 });
 $("pay-retry")?.addEventListener("click",()=>{if(!busy)void commitCashMovement("payments-msg");});
 $("returns-refresh")?.addEventListener("click",()=>{if(!busy)void refreshReturns();});
 $("returns-filter-mode")?.addEventListener("change",()=>{if(!busy)void refreshReturns(true,false);});
 $("returns-clear-search")?.addEventListener("click",()=>{
  if($("returns-search-input"))$("returns-search-input").value="";
  if(!busy)void refreshReturns(true,false);
 });
 $("returns-prev")?.addEventListener("click",()=>{if(!busy&&!returnLoading&&returnPageOffset>=RECEIPTS_PAGE_SIZE){returnPageOffset-=RECEIPTS_PAGE_SIZE;void refreshReturns(false,false);}});
 $("returns-next")?.addEventListener("click",()=>{if(!busy&&!returnLoading&&returnPageOffset+RECEIPTS_PAGE_SIZE<returnPageTotal){returnPageOffset+=RECEIPTS_PAGE_SIZE;void refreshReturns(false,false);}});
 $("returns-lookup-form")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!db||!store||busy)return;
  const raw=String($("returns-search-input")?.value||"").trim();if(!raw)return;
  const token=++returnLookupToken,storeId=store.id,actor=user?.id;
  ++returnListToken;returnLoading=false;clearReturnSelection();syncReturnPager();
  lock(true);msg("returns-msg","");
  try{
   const {data,error}=await db.rpc("retail_find_return_receipt_v22",{p_store:store.id,p_query:raw});
   if(token!==returnLookupToken||store?.id!==storeId||user?.id!==actor||tab!=="returns")return;
   if(error)throw error;
   if(data?.ambiguous){msg("returns-msg","ئەم بارکۆدە لە چەند پسووڵەیەکدا هەیە؛ ژمارەی پسووڵە دیاری بکە","error");return;}
   if(!data?.found){msg("returns-msg","پسووڵە نەدۆزرایەوە","error");return;}
   await showReturnReceiptDetail(data.sale_id);
  }catch(err){if(token===returnLookupToken&&store?.id===storeId&&user?.id===actor&&tab==="returns")msg("returns-msg",safe(err),"error");}finally{lock(false);}
 });
 $("returns-list")?.addEventListener("click",e=>{
  const ret=e.target.closest("[data-return-sale]");
  if(ret&&!busy){void returnSale(ret.dataset.returnSale,"returns-msg");return;}
  const inspect=e.target.closest("[data-inspect-return]");
  if(inspect&&!busy)void showReturnReceiptDetail(inspect.dataset.inspectReturn);
 });
 $("return-item-product")?.addEventListener("change",updateReturnItemBarcodes);
 $("return-item-barcode")?.addEventListener("change",updateReturnItemBarcodes);
 $("return-item-qty")?.addEventListener("input",updateReturnItemBarcodes);
 $("returns-item-form")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!db||!store||busy)return;
  if(!shiftSession||!selectedReturnSaleId||!selectedReturnLineId){msg("returns-msg","سەرەتا شێفت بکەرەوە و ڕیزی پسووڵە هەڵبژێرە","error");return;}
  lock(true);msg("returns-msg","");
  try{
   const result=await financialRpc("return-item","retail_return_item_v22",{p_store:store.id,p_sale:selectedReturnSaleId,p_line:selectedReturnLineId,p_quantity:Number($("return-item-qty")?.value||0),p_session:shiftSession.id,p_note:$("return-item-note")?.value.trim()||""});
   await loadInventory();await refreshShift();await loadCustomersAndLedger();await refreshReturns(false);
   msg("returns-msg","گەڕاندنەوە تۆمارکرا — پارە: "+money(result.cash_refunded_minor)+" | کەمکردنەوەی قەرز: "+money(result.debt_reduced_minor),"success");
  }catch(err){msg("returns-msg",safe(err),"error");}finally{lock(false);}
 });
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
 $("po-search").value="";msg("po-read-scope","");
 $("sup-search").value="";msg("sup-directory-scope","");
 ++supplierIdentityEpoch;++suppliersReadToken;suppliersReady=false;suppliersScope=null;suppliersList=[];purchaseOrdersList=[];supplierLedgerList=[];populateSupplierSelectors();clearSupplierViews();resetSupplierForm();msg("suppliers-read-scope","");
 for(const picker of customerPickers)picker.clear();
 clearCustomerDebtPage();$("debt-search").value="";msg("debt-read-scope","");
 clearCustomerDirectoryPage();$("cust-search").value="";msg("cust-read-scope","");
 clearCustomerPaymentsPage();$("cpay-phone").value="";$("cpay-search").value="";msg("cpay-read-scope","");
 clearCustomerHistoryPage();$("hist-phone").value="";$("hist-search").value="";msg("hist-read-scope","");
 clearTimeout(movementsTimer);++movementsReadToken;movementsReady=false;movementsLoading=false;movementsOffset=0;movementsTotal=0;movementsFilters=null;stockMovementsLedger=[];renderStockMovementsView();syncMovementPager();msg("movements-read-scope","");$("movements-product-code").value="";$("movements-search").value="";
 ++customerIdentityEpoch;++customersReadToken;resetCustomerForm();customersReady=false;customersScope=null;customersList=[];customerLedgerList=[];populateCustomerSelectors();clearCustomerViews();msg("customers-read-scope","");
 ++shiftEpoch;++shiftHistoryToken;shiftVerified=false;shiftRows=[];shiftTotal=0;shiftOffset=0;shiftFilters=null;shiftHistoryLoading=false;shiftSessionsHistory=[];shiftSession=null;redrawShift(null);$("shift-history").replaceChildren();$("shift-report").replaceChildren();$("shift-report").hidden=true;msg("shift-history-msg","");syncShiftPager();
 clearTimeout(paymentTimer);++paymentToken;paymentRows=[];paymentTotal=0;paymentOffset=0;paymentFilters=null;paymentSession=null;paymentVerified=false;paymentLoading=false;$("payments-list").replaceChildren();renderPaymentsList();
 clearTimeout(auditQueryTimer);++auditListToken;auditPageRows=[];auditPageTotal=0;auditPageOffset=0;auditPageFilters=null;auditLoading=false;$("audit-list").replaceChildren();$("audit-search-input").value="";msg("audit-msg","");
 ++returnListToken;++returnLookupToken;returnPageRows=[];returnPageTotal=0;returnPageOffset=0;returnPageFilters=null;returnLoading=false;clearReturnSelection();$("returns-list").replaceChildren();$("returns-search-input").value="";$("return-item-note").value="";syncReturnPager();
 ++receiptListEpoch;++receiptDetailEpoch;receiptPageRows=[];receiptPageTotal=0;receiptFilters=null;receiptsOffset=0;receiptLoading=false;$("receipts-list").replaceChildren();$("receipt-detail").replaceChildren();$("receipt-detail").hidden=true;updateReceiptsMetrics([]);syncReceiptPager();
 user=null;store=null;role=null;products=[];barcodes=[];prefixCache.clear();cart=[];parkedCarts=[];requestId=null;pendingCheckout=null;shiftSession=null;pendingCashMovement=null;stockAttempt=null;returnAttempt=null;allReceipts=[];allMovements=[];selectedReturnSaleId=null;lastCompletedSale=null;viewPanel("login");
 msg("login-msg");syncAuditPager();
 if(db)await db.auth.signOut();
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
 if((e.key==="F2"||e.key==="F6")&&tab==="cash"&&!busy&&!pendingCheckout){
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
   const total=cartNetTotal();
   if(!Number($("cash").value)) $("cash").value=String(total);
   $("checkout-form").requestSubmit();
 }
 if(e.key==="F9"&&!busy){
   e.preventDefault();selectTab("receipts");
 }
 if(e.key==="Escape"&&tab==="cash"){
   clearTimeout(scanIdleTimer);scanIdleTimer=null;
   if($("cash-catalog-box"))$("cash-catalog-box").hidden=true;
   if(document.activeElement===$("barcode")){
     $("barcode").value="";msg("scan-msg","");
   }
 }
});
$("barcode").addEventListener("input",()=>{
 clearTimeout(scanIdleTimer);
 const code=$("barcode").value.trim();
 const catBox=$("cash-catalog-box");
 if(tab!=="cash"||busy||pendingCheckout||!code){
   if(catBox)catBox.hidden=true;
   return;
 }
 scanIdleTimer=setTimeout(async()=>{
   if(tab!=="cash"||busy||pendingCheckout||$("barcode").value.trim()!==code)return;
   const looksLikeBarcode=/^[0-9A-Za-z\-_]+$/.test(code)&&/[0-9]/.test(code);
   if(looksLikeBarcode){
     let b=barcodes.find(x=>x.code===code&&x.active!==false);
     let hasLonger=barcodes.some(x=>x.active!==false&&x.code.length>code.length&&x.code.startsWith(code));
     if(!b||!prefixCache.has(code)){
       const resolved=await resolveBarcodeServer(code);
       if(tab!=="cash"||busy||pendingCheckout||$("barcode").value.trim()!==code)return;
       if(resolved)b=resolved;
     }
     if(prefixCache.has(code))hasLonger=hasLonger||!!prefixCache.get(code);
     const pMatch=b?products.find(x=>x.id===b.product_id):null;
     const canAutoSubmit=Boolean(b&&!hasLonger&&!(pMatch?.base_unit==="kg"&&!b.is_scale));
     // A valid short barcode could be the start of a longer barcode.
     // Wait for explicit Enter rather than silently selling the wrong item.
     if(canAutoSubmit){
       if(catBox)catBox.hidden=true;
       $("scan-form").requestSubmit();
       return;
     }
   }
   if(catBox)catBox.hidden=false;
   await renderCashCatalogSearch(code);
 },160);
});
let scanResolving=false;
$("scan-form").addEventListener("submit",async e=>{
 e.preventDefault();clearTimeout(scanIdleTimer);scanIdleTimer=null;
 if(pendingCheckout||busy||scanResolving)return;
 const form=e.currentTarget;
 const code=String(new FormData(form).get("barcode")||"").trim();
 if(!code)return;
 const catBox=$("cash-catalog-box");
 if(/^27[0-9]{11}$/.test(code)&&!parseScaleBarcode(code)){
   form.reset();if(catBox)catBox.hidden=true;
   msg("scan-msg","بارکۆدی تەرازوو: ژمارەی پشکنینی EAN-13 یان کێش نادروستە","error");
   playScanBeep(false);focusScanner();return;
 }
 scanResolving=true;
 let keepQuery=false;
 try{
   let b=await resolveBarcodeServer(code,{strict:true});
   if(b){
     const pCheck=products.find(x=>x.id===b.product_id);
     if(pCheck?.base_unit==="kg"&&!b.is_scale){
       const grams=Number($("cash-scale-grams")?.value||1000);
       const scaleCode=buildScaleEan13(pCheck.plu||pCheck.sku||b.code,grams);
       if(scaleCode){
         const scaleResolved=await resolveBarcodeServer(scaleCode,{strict:true});
         if(scaleResolved)b=scaleResolved;
       }
     }
   }
   if(!b){
     const matched=await renderCashCatalogSearch(code);
     const ql=code.toLocaleLowerCase();
     const exactMatch=matched.find(p=>String(p.name||"").trim().toLocaleLowerCase()===ql||String(p.plu||"").trim().toLocaleLowerCase()===ql||String(p.sku||"").trim().toLocaleLowerCase()===ql);
     const chosen=exactMatch||(matched.length===1?matched[0]:null);
     if(chosen){
       if(chosen.base_unit==="kg"){
         const unitBar=barcodes.find(x=>x.product_id===chosen.id&&x.unit_type==="unit"&&x.active!==false&&!x.is_scale);
         const grams=Number($("cash-scale-grams")?.value||1000);
         const scaleCode=buildScaleEan13(chosen.plu||chosen.sku||unitBar?.code||"",grams);
         if(scaleCode)b=await resolveBarcodeServer(scaleCode,{strict:true});
       }else{
         const unitBar=barcodes.find(x=>x.product_id===chosen.id&&x.unit_type==="unit"&&x.active!==false&&!x.is_scale);
         const cartonBar=barcodes.find(x=>x.product_id===chosen.id&&x.unit_type==="carton"&&x.active!==false);
         const targetCode=unitBar?.code||cartonBar?.code||"";
         if(targetCode)b=await resolveBarcodeServer(targetCode,{strict:true});
       }
     }else if(matched.length>1){
       if(catBox)catBox.hidden=false;
       keepQuery=true;
       msg("scan-msg","چەند کاڵایەک بەم ناوە دۆزرایەوە — لە لیستەکەی خوارەوە هەڵیبژێرە");
       return;
     }
   }
   if(!b){if(catBox)catBox.hidden=true;msg("scan-msg","بارکۆدەکە لە سێرڤەر نەدۆزرایەوە","error");playScanBeep(false);return;}
   if(catBox)catBox.hidden=true;
   if(!["unit","carton"].includes(b.unit_type)||
      (b.unit_type==="unit"&&!b.is_scale&&Number(b.units_per_scan)!==1)||
      (b.unit_type==="unit"&&b.is_scale&&!(Number(b.scale_grams)>0))||
      (b.unit_type==="carton"&&!Number.isSafeInteger(Number(b.price_minor)))){
     msg("scan-msg","شێوازی فرۆشتن پشتگیری ناکرێت","error");playScanBeep(false);return;
   }
   const p=products.find(x=>x.id===b.product_id);
   if(!p||p.currency!=="IQD"||p.active===false){
     msg("scan-msg","کاڵا بۆ فرۆشتن بەردەست نییە","error");playScanBeep(false);return;
   }
   if(p.base_unit==="kg"&&!b.is_scale){
     msg("scan-msg","ئەم کاڵایە بە کیلۆگرامە؛ بارکۆدی تەواوی تەرازوو بسکانە","error");
     playScanBeep(false);return;
   }
   const isScale=Boolean(b.is_scale&&Number(b.scale_grams)>0);
   const units=isScale?Number((Number(b.scale_grams)/1000).toFixed(3)):Number(b.units_per_scan);
   const price=Number(b.price_minor??p.price_minor);
   if(!Number.isSafeInteger(price)||price<0||
      (isScale?!(units>0&&units<=99.999):(!Number.isSafeInteger(units)||units<1))){
     msg("scan-msg","نرخ یان یەکەی کاڵا نادروستە","error");playScanBeep(false);return;
   }
   const stock=balances.get(p.id);
   const result=window.CashierV20.add(cart,{
     id:p.id,name:p.name,barcode:b.code,mode:b.unit_type,isScale,
     scaleGrams:isScale?Number(b.scale_grams):null,
     scaleLabel:b.scale_label||null,
     unitKgPrice:isScale?Number(b.scale_unit_price_minor??b.unit_price_minor??p.price_minor):null,
     price,units,available:stock,qty:1
   },Number(stock));
   if(!result.ok){
     const why={
       duplicate_scale:"ئەم لیبڵەی کێشدارە پێشتر سکان کراوە؛ دووبارە فرۆشتنی ناڕاستەوخۆ ڕاگیرا",
       stock:"بڕی کۆگا بەش ناکات",
       limit:"سنووری بڕی سەبەتە گەیشتووە",
       invalid:"زانیاری بارکۆد یان بڕ نادروستە"
     };
     msg("scan-msg",why[result.reason]||"سکانی کاڵا ڕەت کرایەوە","error");
     playScanBeep(false);return;
   }
   cart=result.cart;
   msg("scan-msg",isScale?p.name+" — "+units.toFixed(3)+" کیلۆگرام زیادکرا":"");
   playScanBeep(true);cartChanged();
 }catch(err){
   msg("scan-msg",safe(err)+" — پێش زیادکردن پشکنینی سێرڤەر پێویستە","error");playScanBeep(false);
 }finally{scanResolving=false;if(!keepQuery)form.reset();focusScanner();}
});
function explainBasketRejection(reason){
 return ({
   stock:"بڕی کۆگا بەش ناکات",
   quantity:"بڕ دەبێت ژمارەیەکی تەواو لە 1 تا 100 بێت",
   scale_immutable:"کێشی پاکەتی تەرازوو دەستکاری ناکرێت؛ بۆ زیادکردن پاکەتی نوێ بسکانە",
   invalid:"ڕیزی کاڵا نادروستە",
   duplicate_scale:"ئەم لیبڵەی کێشدارە دووبارە هاتووەتە سەبەتە"
 })[reason]||"دەستکاریی سەبەتە ڕەت کرایەوە";
}
function updateBasketQuantity(index,quantity){
 const line=cart[index];if(!line)return;
 if(line.outdated){msg("scan-msg","نرخ یان بارکۆد گۆڕاوە؛ ئەم ڕیزە بسڕەوە و دووبارە بسکانە","error");renderCart();return;}
 const available=Number(balances.get(line.id));
 const result=window.CashierV20.edit(cart,index,quantity,available);
 if(!result.ok){msg("scan-msg",explainBasketRejection(result.reason),"error");renderCart();return;}
 cart=result.cart;msg("scan-msg","");cartChanged();focusScanner();
}
$("cart-list").addEventListener("click",e=>{
 if(busy||pendingCheckout||scanResolving)return;
 const remove=e.target.closest("[data-remove-line]");
 if(remove){
   const index=Number(remove.dataset.removeLine);
   if(!cart[index])return;
   // Removal is permitted even when that barcode has been retired.
   cart=cart.filter((_,i)=>i!==index);
   msg("scan-msg","ڕیزی کاڵا سڕایەوە","success");cartChanged();focusScanner();return;
 }
 const btn=e.target.closest("[data-line]");
 if(!btn)return;
 const index=Number(btn.dataset.line),line=cart[index];
 if(!line||!["-1","1"].includes(btn.dataset.delta))return;
 updateBasketQuantity(index,line.qty+Number(btn.dataset.delta));
});
$("cart-list").addEventListener("change",e=>{
 if(busy||pendingCheckout||scanResolving)return;
 const input=e.target.closest("[data-quantity-line]");
 if(!input)return;
 const index=Number(input.dataset.quantityLine);
 if(!cart[index])return;
 const raw=String(input.value||"");
 if(!/^[0-9]{1,3}$/.test(raw)){
   msg("scan-msg","بڕ دەبێت ژمارەیەکی تەواو لە 1 تا 100 بێت","error");renderCart();return;
 }
 updateBasketQuantity(index,Number(raw));
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
if($("usd-toggle")){
 $("usd-toggle").addEventListener("click",()=>{
  const f=$("usd-fields");
  if(f){
   f.hidden=!f.hidden;
   const arrow=$("usd-arrow");
   if(arrow)arrow.textContent=f.hidden?"▼":"▲";
   if(!f.hidden)$("usd-amount")?.focus();
  }
 });
}
if($("usd-apply")){
 $("usd-apply").addEventListener("click",()=>{
  if(pendingCheckout)return;
  const amount=Number($("usd-amount")?.value||0);
  const rate=Number($("usd-rate")?.value||152000);
  if(amount>0&&rate>0){
   const iqd=Math.round((amount*rate)/100);
   $("cash").value=String(iqd);
   renderCart();
   focusScanner();
  }
 });
}
if($("hold-cart")){
 $("hold-cart").addEventListener("click",()=>{toggleHoldCart();});
}
document.querySelectorAll("#quick-discount-row button").forEach(btn=>{
 btn.addEventListener("click",()=>{
  if(busy||pendingCheckout)return;
  const pct=Number(btn.dataset.discountPct||0);
  const gross=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const discAmount=pct>0?Math.round((gross*pct)/100):0;
  if($("discount"))$("discount").value=String(discAmount);
  cartChanged();
 });
});
$("btn-shortcut-f2")?.addEventListener("click",()=>{
 if(!busy&&!pendingCheckout){focusScanner();$("barcode")?.select();}
});
$("btn-shortcut-f4")?.addEventListener("click",()=>{
 if(!busy&&!pendingCheckout)toggleHoldCart();
});
$("btn-shortcut-f8")?.addEventListener("click",()=>{
 if(!busy&&!pendingCheckout&&cart.length&&shiftSession){
  const total=cartNetTotal();
  if(!Number($("cash").value))$("cash").value=String(total);
  $("checkout-form").requestSubmit();
 }
});
$("btn-shortcut-f9")?.addEventListener("click",()=>{
 if(!busy)selectTab("receipts");
});
$("btn-shortcut-esc")?.addEventListener("click",()=>{
 clearTimeout(scanIdleTimer);scanIdleTimer=null;
 if($("cash-catalog-box"))$("cash-catalog-box").hidden=true;
 if($("barcode")){$("barcode").value="";msg("scan-msg","");focusScanner();}
});
$("ops-catalog-add-btn")?.addEventListener("click",()=>{
  if($("ops-catalog-form-box")){
    $("ops-catalog-form-box").hidden=!$("ops-catalog-form-box").hidden;
    $("ops-cat-id").value="";
    $("ops-catalog-form")?.reset();
    $("ops-catalog-form-title").textContent="تۆمارکردنی کاڵای نوێ";
    if(!$("ops-catalog-form-box").hidden)$("ops-cat-name")?.focus();
  }
});
$("ops-catalog-form-close")?.addEventListener("click",()=>{
  if($("ops-catalog-form-box"))$("ops-catalog-form-box").hidden=true;
});
$("ops-catalog-form")?.addEventListener("submit",saveOpsCatalogProduct);
$("ops-catalog-search")?.addEventListener("input",()=>{renderOpsCatalogList();});
$("ops-catalog-filter")?.addEventListener("change",()=>{renderOpsCatalogList();});
$("ops-catalog-refresh")?.addEventListener("click",()=>{loadInventory().then(()=>renderOpsCatalogList());});

// Barcode SVG generation for Shelf Edge Labels (40x25mm / 50x30mm)
function buildBarcodeSvg(code){
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg");
  svg.setAttribute("height","34");
  const clean=String(code||"000000").trim();
  const widths=[2,1,2,1];
  for(let i=0;i<clean.length;i++){
    const ch=clean.charCodeAt(i);
    widths.push(1+(ch%3),1+((ch>>2)%2),1+((ch>>3)%3),1);
  }
  widths.push(2,1,2);
  let x=4;
  for(let i=0;i<widths.length;i++){
    const w=widths[i];
    if(i%2===0){
      const rect=document.createElementNS(ns,"rect");
      rect.setAttribute("x",String(x));
      rect.setAttribute("y","2");
      rect.setAttribute("width",String(w));
      rect.setAttribute("height","30");
      rect.setAttribute("fill","#0f172a");
      svg.append(rect);
    }
    x+=w;
  }
  svg.setAttribute("width",String(Math.min(Math.max(x+4,120),220)));
  svg.setAttribute("viewBox","0 0 "+(x+4)+" 34");
  return svg;
}

function openOpsShelfLabel(item){
  const modal=$("ops-shelf-label-modal");
  if(!modal||!item)return;
  const prodName=$("ops-label-prod-name");
  const prodPrice=$("ops-label-prod-price");
  const prodUnit=$("ops-label-prod-unit");
  const prodCode=$("ops-label-prod-code");
  const barcodeWrap=$("ops-label-barcode-wrap");
  const card=$("ops-shelf-label-card");
  
  if(prodName)prodName.textContent=item.name||"—";
  if(prodPrice)prodPrice.textContent=money(item.priceMinor||0);
  if(prodUnit)prodUnit.textContent=item.unitLabel||"دانە";
  if(prodCode)prodCode.textContent=item.code||"—";
  if(barcodeWrap)barcodeWrap.replaceChildren(buildBarcodeSvg(item.code||"000000"));
  
  const curSize=$("ops-label-size-select")?.value||"40x25";
  if(card)card.className="ops-shelf-label-card size-"+curSize;
  modal.hidden=false;
}

function closeOpsShelfLabel(){
  const modal=$("ops-shelf-label-modal");
  if(modal)modal.hidden=true;
}

$("ops-label-print-btn")?.addEventListener("click",()=>{
  const size=$("ops-label-size-select")?.value||"40x25";
  document.body.classList.remove("label-size-40x25","label-size-50x30");
  document.body.classList.add("printing-ops-label","label-size-"+size);
  window.print();
  setTimeout(()=>{
    document.body.classList.remove("printing-ops-label","label-size-40x25","label-size-50x30");
  },1000);
});
$("ops-label-size-select")?.addEventListener("change",e=>{
  const card=$("ops-shelf-label-card");
  if(card)card.className="ops-shelf-label-card size-"+e.target.value;
});
$("ops-label-modal-close")?.addEventListener("click",closeOpsShelfLabel);
$("ops-shelf-label-backdrop")?.addEventListener("click",closeOpsShelfLabel);

// Universal On-Screen Touch Numpad for All Cashier Screen Inputs
let activeTouchInput = null;

function getFriendlyInputName(el){
  if(!el)return "وەرگیراو (IQD)";
  if(el.id==="barcode")return "بارکۆد یان ناوی کاڵا";
  if(el.id==="cash")return "وەرگیراو (IQD)";
  if(el.id==="discount")return "داشکاندن (IQD)";
  if(el.id==="pos-coupon-code")return "کۆدی کوپۆن";
  if(el.id==="cash-scale-grams")return "کێشی تەرازوو (گرام)";
  if(el.id==="usd-amount")return "بڕی دۆلار ($)";
  if(el.id==="usd-rate")return "نرخی 100$ (IQD)";
  if(el.classList?.contains("basket-qty-input"))return "ژمارەی دانە لە سەبەتە";
  const label=el.closest("label");
  if(label){
    const txt=label.textContent.replace(/[\n\r]+/g," ").trim();
    if(txt)return txt.slice(0,24);
  }
  return el.placeholder||el.name||el.id||"خانەی نووسین";
}

function updateTouchTargetIndicator(){
  const target=getActiveTouchTarget();
  const nameEl=$("pos-touch-target-name");
  if(nameEl)nameEl.textContent=getFriendlyInputName(target);
  const isBarcode=target?.id==="barcode";
  const isCash=target?.id==="cash";
  const isDiscount=target?.id==="discount";
  $("pos-touch-switch-barcode")?.classList.toggle("active",isBarcode);
  $("pos-touch-switch-cash")?.classList.toggle("active",isCash);
  $("pos-touch-switch-discount")?.classList.toggle("active",isDiscount);
}

function setActiveTouchTarget(el){
  if(!el||el.readOnly||el.disabled)return;
  if(el.tagName!=="INPUT"&&el.tagName!=="TEXTAREA")return;
  if(el.type==="button"||el.type==="submit"||el.type==="checkbox"||el.type==="radio")return;
  activeTouchInput=el;
  updateTouchTargetIndicator();
}

function getActiveTouchTarget(){
  if(activeTouchInput&&document.body.contains(activeTouchInput)&&!activeTouchInput.disabled){
    return activeTouchInput;
  }
  if(document.activeElement&&document.activeElement.tagName==="INPUT"&&!document.activeElement.disabled){
    activeTouchInput=document.activeElement;
    return activeTouchInput;
  }
  const cashEl=$("cash");
  const barcodeEl=$("barcode");
  if(cart.length>0&&cashEl&&(!cashEl.value||Number(cashEl.value)===0)){
    activeTouchInput=cashEl;
    return cashEl;
  }
  activeTouchInput=barcodeEl||cashEl;
  return activeTouchInput;
}

// Track input focus/click globally across the entire cashier operations UI
document.addEventListener("focusin",e=>{
  const el=e.target;
  if(el&&el.tagName==="INPUT"&&!["submit","button","checkbox","radio"].includes(el.type)){
    setActiveTouchTarget(el);
  }
});
document.addEventListener("click",e=>{
  const el=e.target.closest("input");
  if(el&&!["submit","button","checkbox","radio"].includes(el.type)){
    setActiveTouchTarget(el);
  }
});

// Quick switch buttons inside the Touch Numpad header
$("pos-touch-switch-barcode")?.addEventListener("click",()=>{
  const el=$("barcode");
  if(el){el.focus();setActiveTouchTarget(el);}
});
$("pos-touch-switch-cash")?.addEventListener("click",()=>{
  const el=$("cash");
  if(el){el.focus();setActiveTouchTarget(el);}
});
$("pos-touch-switch-discount")?.addEventListener("click",()=>{
  const el=$("discount");
  if(el){el.focus();setActiveTouchTarget(el);}
});

// Prevent losing focus from input when tapping numpad buttons
$("pos-touch-numpad-box")?.addEventListener("mousedown",e=>{
  if(e.target.closest(".touch-key")||e.target.closest(".pos-touch-switch-btn")){
    e.preventDefault();
  }
});

// On-Screen Touch Numpad Toggle
$("pos-touch-toggle-btn")?.addEventListener("click",()=>{
  const grid=$("pos-touch-grid");
  const indicator=$("pos-touch-target-indicator");
  const btn=$("pos-touch-toggle-btn");
  if(!grid||!btn)return;
  grid.hidden=!grid.hidden;
  if(indicator)indicator.hidden=grid.hidden;
  btn.textContent=grid.hidden?"پیشاندان ▼":"داخستن ✕";
});

// Touch Numpad Key Press Engine
$("pos-touch-grid")?.addEventListener("click",e=>{
  const keyBtn=e.target.closest("[data-key]");
  if(!keyBtn||busy||pendingCheckout)return;
  const target=getActiveTouchTarget();
  if(!target)return;
  const key=keyBtn.dataset.key;
  const cur=String(target.value||"").trim();

  if(key==="clear"){
    target.value="";
  }else if(key==="backspace"){
    target.value=cur.slice(0,-1);
  }else if(key==="exact"){
    if(target.id==="cash"){
      const total=cartNetTotal();
      target.value=total>0?String(total):"";
    }else if(target.id==="barcode"){
      target.dispatchEvent(new Event("input",{bubbles:true}));
      $("scan-form")?.requestSubmit();
      return;
    }else if(target.id==="discount"){
      target.value="0";
    }
  }else if(key==="000"){
    if(target.type==="number"){
      if(cur&&cur!=="0")target.value=cur+"000";
    }else{
      target.value=cur+"000";
    }
  }else if(key==="250"||key==="500"){
    if(target.id==="cash"||target.id==="discount"){
      if(!cur||cur==="0")target.value=key;
      else target.value=cur+key;
    }else{
      target.value=cur+key;
    }
  }else{
    // Digits 0-9
    if(target.type==="number"&&cur==="0"){
      target.value=key;
    }else{
      target.value=cur+key;
    }
  }

  target.dispatchEvent(new Event("input",{bubbles:true}));
  target.dispatchEvent(new Event("change",{bubbles:true}));
  if(target.id==="cash"||target.id==="discount"){
    if(cart.length)cartChanged();else renderCart();
  }
  updateTouchTargetIndicator();
  try{target.focus();}catch(_e){}
});

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
 if(busy)return;
 const pickBtn=e.target.closest("[data-pick-stock]");
 if(pickBtn){
   const id=pickBtn.dataset.pickStock;
   const sel=$("stock-product");
   if(sel&&[...sel.options].some(o=>o.value===id)){
     sel.value=id;
     updateStockUnits();
     $("stock-quantity")?.focus();
   }
   return;
 }
 const adjustBtn=e.target.closest("[data-adjust-stock]");
 if(adjustBtn){
   const id=adjustBtn.dataset.adjustStock;
   const box=$("stock-adjust-box");
   if(box)box.hidden=false;
   populateStockSelectors();
   const sel=$("stock-adjust-product");
   if(sel&&[...sel.options].some(o=>o.value===id)){
     sel.value=id;
     const p=products.find(x=>x.id===id);
     const isKg=p?.base_unit==="kg";
     if($("stock-adjust-mode"))$("stock-adjust-mode").value="set_exact";
     if($("stock-adjust-qty")){
       $("stock-adjust-qty").step=isKg?"0.001":"1";
       $("stock-adjust-qty").value=String(Number(balances.get(id)||0));
       $("stock-adjust-qty").focus();
       $("stock-adjust-qty").select();
     }
   }
   return;
 }
 const expBtn=e.target.closest("[data-expiry-stock]");
 if(expBtn){
   const id=expBtn.dataset.expiryStock;
   selectStockSub("expiry");
   populateStockSelectors();
   const sel=$("expiry-product");
   if(sel&&[...sel.options].some(o=>o.value===id)){
     sel.value=id;
     $("expiry-batch")?.focus();
   }
 }
});
$("stock-subtabs")?.addEventListener("click",e=>{
 const btn=e.target.closest("[data-stock-sub]");
 if(btn&&!busy)selectStockSub(btn.dataset.stockSub);
});
$("stock-adjust-toggle")?.addEventListener("click",()=>{
 const box=$("stock-adjust-box");
 if(!box)return;
 box.hidden=!box.hidden;
 if(!box.hidden){
   populateStockSelectors();
   $("stock-adjust-qty")?.focus();
 }
});
$("stock-adjust-close")?.addEventListener("click",()=>{
 if($("stock-adjust-box"))$("stock-adjust-box").hidden=true;
});
$("stock-adjust-product")?.addEventListener("change",()=>{
 const id=$("stock-adjust-product")?.value;
 const p=products.find(x=>x.id===id);
 const isKg=p?.base_unit==="kg";
 const qtyIn=$("stock-adjust-qty");
 if(qtyIn){
   qtyIn.step=isKg?"0.001":"1";
   if($("stock-adjust-mode")?.value==="set_exact"){
     qtyIn.value=String(Number(balances.get(id)||0));
   }
 }
});
$("stock-adjust-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(busy||!canManage())return;
 const productId=String($("stock-adjust-product")?.value||"");
 const mode=String($("stock-adjust-mode")?.value||"set_exact");
 const qty=Number($("stock-adjust-qty")?.value||0);
 const reason=String($("stock-adjust-reason")?.value||"inventory_count");
 const note=String($("stock-adjust-note")?.value||"").trim();
 const ok=await performStockAdjustment({productId,mode,qty,reason,note,targetMsgId:"stock-msg"});
 if(ok){
   if($("stock-adjust-note"))$("stock-adjust-note").value="";
 }
});
$("stock-export-csv")?.addEventListener("click",()=>{
 const rows=products.filter(p=>p.active!==false).map(p=>{
   const qty=Number(balances.get(p.id)||0);
   const code=barcodes.find(b=>b.product_id===p.id&&b.unit_type==="unit"&&b.active!==false)?.code||p.sku||p.plu||"";
   const status=qty<=0?"تەواوبوو":qty<=5?"کەمبووە":"باشە";
   return [p.name,code,p.base_unit==="kg"?qty.toFixed(3):qty,p.base_unit==="kg"?"کیلۆگرام":"دانە",p.price_minor,Math.round(qty*Number(p.price_minor||0)),status];
 });
 exportOperationsCsv("stock_status_"+new Date().toISOString().slice(0,10)+".csv",
   ["ناوی کاڵا","بارکۆد / کۆد","بڕی کۆگا","یەکە","نرخ (IQD)","بەهای کۆگا (IQD)","دۆخ"],rows);
});
$("low-search")?.addEventListener("input",renderLowStockView);
$("low-level-filter")?.addEventListener("change",renderLowStockView);
$("low-threshold-input")?.addEventListener("input",()=>{
 localStorage.setItem("retail_low_threshold",String($("low-threshold-input")?.value||5));
 renderLowStockView();
});
$("low-target-input")?.addEventListener("input",()=>{
 localStorage.setItem("retail_low_target",String($("low-target-input")?.value||25));
 renderLowStockView();
});
$("low-refresh")?.addEventListener("click",()=>{if(!busy)void refreshLowStockView();});
$("low-export-csv")?.addEventListener("click",()=>{
 const targetLevel=Math.max(1,Number($("low-target-input")?.value||25));
 const rows=(lowStockItemsCache||[]).map(p=>{
   const qty=Number(balances.get(p.id)||0);
   const code=barcodes.find(b=>b.product_id===p.id&&b.unit_type==="unit"&&b.active!==false)?.code||p.sku||p.plu||"";
   const suggested=Math.max(1,Number((targetLevel-Math.max(0,qty)).toFixed(p.base_unit==="kg"?3:0)));
   return [p.name,code,qty,suggested,p.price_minor,Math.round(suggested*Number(p.price_minor||0))];
 });
 exportOperationsCsv("low_stock_order_"+new Date().toISOString().slice(0,10)+".csv",
   ["کاڵا","بارکۆد","بڕی ئێستا","بڕی پێشنیارکراو بۆ کڕین","نرخی تاک (IQD)","تێچووی خەمڵێندراو (IQD)"],rows);
});
function resetExpiryForm(){
 if($("expiry-edit-id"))$("expiry-edit-id").value="";
 if($("expiry-batch"))$("expiry-batch").value="";
 if($("expiry-qty"))$("expiry-qty").value="1";
 if($("expiry-note"))$("expiry-note").value="";
 if($("expiry-submit"))$("expiry-submit").textContent="تۆمارکردنی وەجبە";
 if($("expiry-cancel-edit"))$("expiry-cancel-edit").hidden=true;
}
$("expiry-cancel-edit")?.addEventListener("click",resetExpiryForm);
$("expiry-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!db||!store||busy||!canManage())return;
 const editId=String($("expiry-edit-id")?.value||"").trim();
 const productId=String($("expiry-product")?.value||"");
 const batchNo=String($("expiry-batch")?.value||"").trim()||("B-"+new Date().toISOString().slice(0,10));
 const qty=Number($("expiry-qty")?.value||0);
 const expDate=String($("expiry-date")?.value||"").trim();
 const note=String($("expiry-note")?.value||"").trim();
 const p=products.find(x=>x.id===productId);
 if(!p||!(qty>0)||!expDate){
   msg("expiry-msg","تکایە کاڵا، بڕ و بەرواری بەسەرچوون بە دروستی پڕبکەرەوە","error");
   return;
 }
 const record={
   id:editId||crypto.randomUUID(),
   store_id:store.id,
   product_id:productId,
   product_name:p.name,
   batch_no:batchNo,
   quantity:Number(qty.toFixed(3)),
   expiry_date:expDate,
   note,
   status:"active",
   created_at:new Date().toISOString()
 };
 lock(true);msg("expiry-msg","");
 try{
   try{
     if(editId){
       await db.from("retail_stock_expiries").update({
         product_id:productId,batch_no:batchNo,quantity:record.quantity,expiry_date:expDate,note,updated_at:new Date().toISOString()
       }).eq("store_id",store.id).eq("id",editId);
     }else{
       await db.from("retail_stock_expiries").insert({
         id:record.id,store_id:store.id,product_id:productId,batch_no:batchNo,quantity:record.quantity,expiry_date:expDate,note,status:"active",actor_id:user?.id||null
       });
     }
   }catch(_e){}
   const list=loadLocalExpiries().filter(x=>x.id!==record.id);
   list.push(record);
   saveLocalExpiries(list);
   resetExpiryForm();
   await refreshExpiryView();
   msg("expiry-msg",editId?"زانیاری وەجبەی بەسەرچوون نوێکرایەوە":"وەجبەی بەسەرچوون بە سەرکەوتوویی تۆمارکرا","success");
 }catch(err){
   msg("expiry-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("expiry-search")?.addEventListener("input",renderExpiryView);
$("expiry-status-filter")?.addEventListener("change",renderExpiryView);
$("expiry-refresh")?.addEventListener("click",()=>{if(!busy)void refreshExpiryView();});
$("expiry-export-csv")?.addEventListener("click",()=>{
 const rows=(stockExpiries||[]).map(b=>{
   const p=products.find(x=>x.id===b.product_id);
   const days=computeDaysUntilExpiry(b.expiry_date);
   return [p?.name||b.product_name||"",b.batch_no||"",b.quantity||0,b.expiry_date||"",days,b.status==="written_off"?"تەلەفکراو":days<0?"بەسەرچوو":"چالاک",b.note||""];
 });
 exportOperationsCsv("stock_expiries_"+new Date().toISOString().slice(0,10)+".csv",
   ["کاڵا","ژمارەی وەجبە","بڕ","بەرواری بەسەرچوون","ڕۆژی ماوە","دۆخ","تێبینی"],rows);
});
$("expiry-list")?.addEventListener("click",async e=>{
 if(busy||!canManage())return;
 const writeoffBtn=e.target.closest("[data-writeoff-expiry]");
 if(writeoffBtn){
   const id=writeoffBtn.dataset.writeoffExpiry;
   const item=stockExpiries.find(x=>x.id===id);
   if(!item||item.status==="written_off")return;
   const curStock=Number(balances.get(item.product_id)||0);
   const deductQty=Math.min(curStock,Number(item.quantity||0));
   if(deductQty>0){
     const ok=await performStockAdjustment({
       productId:item.product_id,
       mode:"delta_out",
       qty:deductQty,
       reason:"expired_writeoff",
       note:"تەلەفکردنی وەجبەی بەسەرچوو ("+(item.batch_no||"—")+" — "+item.expiry_date+")",
       targetMsgId:"expiry-msg"
     });
     if(!ok)return;
   }
   item.status="written_off";
   try{
     await db.from("retail_stock_expiries").update({status:"written_off",updated_at:new Date().toISOString()}).eq("store_id",store.id).eq("id",id);
   }catch(_e){}
   saveLocalExpiries(stockExpiries);
   renderExpiryView();
   msg("expiry-msg","وەجبەکە لە کۆگا تەلەفکرا و لادرا","success");
   return;
 }
 const editBtn=e.target.closest("[data-edit-expiry]");
 if(editBtn){
   const id=editBtn.dataset.editExpiry;
   const item=stockExpiries.find(x=>x.id===id);
   if(!item)return;
   if($("expiry-edit-id"))$("expiry-edit-id").value=item.id;
   if($("expiry-product")&&[...$("expiry-product").options].some(o=>o.value===item.product_id))$("expiry-product").value=item.product_id;
   if($("expiry-batch"))$("expiry-batch").value=item.batch_no||"";
   if($("expiry-qty"))$("expiry-qty").value=String(item.quantity||1);
   if($("expiry-date"))$("expiry-date").value=item.expiry_date||"";
   if($("expiry-note"))$("expiry-note").value=item.note||"";
   if($("expiry-submit"))$("expiry-submit").textContent="پاشەکەوتکردنی گۆڕانکاری";
   if($("expiry-cancel-edit"))$("expiry-cancel-edit").hidden=false;
   $("expiry-batch")?.focus();
   return;
 }
 const delBtn=e.target.closest("[data-delete-expiry]");
 if(delBtn){
   const id=delBtn.dataset.deleteExpiry;
   stockExpiries=stockExpiries.filter(x=>x.id!==id);
   saveLocalExpiries(stockExpiries);
   try{
     await db.from("retail_stock_expiries").delete().eq("store_id",store.id).eq("id",id);
   }catch(_e){}
   renderExpiryView();
   msg("expiry-msg","تۆماری وەجبەی بەسەرچوون سڕایەوە","success");
 }
});
$("movements-entry-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(busy||!canManage())return;
 const productId=String($("move-entry-product")?.value||"");
 const entryType=String($("move-entry-type")?.value||"purchase_in");
 const qty=Number($("move-entry-qty")?.value||0);
 const note=String($("move-entry-note")?.value||"").trim();
 const mapType={
   purchase_in:{mode:"delta_in",reason:"purchase"},
   damage_out:{mode:"delta_out",reason:"damage_out"},
   expired_out:{mode:"delta_out",reason:"expired_writeoff"},
   count_set:{mode:"set_exact",reason:"inventory_count"}
 }[entryType]||{mode:"delta_in",reason:"purchase"};
 const ok=await performStockAdjustment({
   productId,mode:mapType.mode,qty,reason:mapType.reason,note,targetMsgId:"movements-msg"
 });
 if(ok){
   if($("move-entry-note"))$("move-entry-note").value="";
   await refreshStockMovementsView();
 }
});
$("movements-search")?.addEventListener("input",renderStockMovementsView);
$("movements-type-filter")?.addEventListener("change",invalidateMovementFilters);
$("movements-date-filter")?.addEventListener("change",invalidateMovementFilters);
$("movements-product-code")?.addEventListener("input",invalidateMovementFilters);
$("movements-prev")?.addEventListener("click",()=>{if(!busy&&!movementsLoading&&movementsReady&&movementsOffset>=50){movementsOffset-=50;void refreshStockMovementsView(false);}});
$("movements-next")?.addEventListener("click",()=>{if(!busy&&!movementsLoading&&movementsReady&&movementsOffset+50<movementsTotal){movementsOffset+=50;void refreshStockMovementsView(false);}});
$("movements-refresh")?.addEventListener("click",()=>{if(!busy)void refreshStockMovementsView();});
$("movements-export-csv")?.addEventListener("click",()=>{
 if(!movementsReady)return;
 const filtered=filterStockMovements(stockMovementsLedger);
 const rows=filtered.map(m=>{
   const p=m.product===undefined?products.find(x=>x.id===m.product_id):m.product;
   return [
     m.created_at?new Date(m.created_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}):"",
     p?.name||m.product_id||"",
     movementReasonLabel(m.reason).label,
     m.delta,
     p?(p.base_unit==="kg"?"کگم":"دانە"):"یەکە نادیارە",
     balances.has(m.product_id)?Number(balances.get(m.product_id)):"",
     m.note||""
   ];
 });
 exportOperationsCsv("stock_movements_page_"+(movementsOffset+1)+"-"+(movementsOffset+stockMovementsLedger.length)+"_of_"+movementsTotal+".csv",
   ["کات و بەروار (بەغدا)","کاڵا","جۆری جووڵە","بڕی گۆڕانکاری","یەکە","بڕی ئێستای کۆگا (بارکراو)","تێبینی"],rows);
});
$("clear-cart").onclick=()=>{if(pendingCheckout||busy)return;cart=[];requestId=null;activePosPromo=null;if($("pos-coupon-code"))$("pos-coupon-code").value="";updatePosPromoBanner("");$("cash").value="";if($("discount"))$("discount").value="0";msg("checkout-msg");renderCart();renderParkedBar();syncPending();focusScanner()};
async function commitCheckout(){
 if(!db||!store||busy||!pendingCheckout)return;
 lock(true);msg("checkout-msg");
 try{
   const rpcArgs={
     p_store:store.id,p_request:pendingCheckout.id,
     p_items:pendingCheckout.items,p_cash_received:pendingCheckout.cash
   };
   if(Number(pendingCheckout.discount)>0)rpcArgs.p_discount=Number(pendingCheckout.discount);
   const customerCheckout=Boolean(pendingCheckout.customerId);
   if(customerCheckout){
     rpcArgs.p_customer=pendingCheckout.customerId;
     rpcArgs.p_paid=Number(pendingCheckout.paidAmount);
     rpcArgs.p_discount=Number(pendingCheckout.discount||0);
   }
   const {data,error}=await db.rpc(customerCheckout?"retail_checkout_customer_v21":pendingCheckout.v19?"retail_checkout_weight_v19":pendingCheckout.v16?
      "retail_checkout_packs_v16":"retail_checkout_cash",rpcArgs);
   if(error)throw error;
   const saleId=data;
   const checkoutMeta={
     customerId:pendingCheckout.customerId||"",
     debtAmount:Number(pendingCheckout.debtAmount||0),
     paidAmount:Number(pendingCheckout.paidAmount??pendingCheckout.cash??0),
     summaryNote:pendingCheckout.summaryNote||""
   };
   unlockPending();cart=[];$("cash").value="";if($("discount"))$("discount").value="0";
   renderCart();msg("checkout-msg","فرۆشتن تۆمارکرا — "+saleId,"success");
   try{
     await refreshShift();
     const {data:receipt,error:receiptError}=await db.from("retail_sales")
       .select("receipt_no,total_minor,change_due_minor")
       .eq("store_id",store.id).eq("id",saleId).single();
     const rNo=receipt?.receipt_no?String(receipt.receipt_no).padStart(6,"0"):"";
     if(checkoutMeta.customerId)await loadCustomersAndLedger();
     if(!receiptError&&receipt?.receipt_no){
       lastCompletedSale={id:saleId,receipt_no:receipt.receipt_no,total_minor:receipt.total_minor};
       renderLastSaleBar();
       msg("checkout-msg","پسووڵەی ژمارە "+rNo+(checkoutMeta.debtAmount>0?" تۆمارکرا و "+money(checkoutMeta.debtAmount)+" خرایە سەر قەرزی کڕیار":" تۆمارکرا"),"success");
       $("checkout-msg").append(printLink(saleId,"58","چاپی 58mm"),printLink(saleId,"80","چاپی 80mm"));
       try{
         const autoPrintUrl="./receipt-print.html?sale="+encodeURIComponent(saleId)+"&paper=80&auto=1";
         const pWin=window.open(autoPrintUrl,"_blank","width=450,height=650");
         if(pWin)pWin.focus();
       }catch(_e){}
       if(Number(receipt?.discount_minor||checkoutMeta?.discountAmount||0)>0){
         void recordPosPromoUsageAfterSale(Number(receipt?.discount_minor||checkoutMeta?.discountAmount||0));
       }
       syncCustomerDisplay("completed",{receiptNo:rNo||receipt?.receipt_no||saleId});
     }
     await loadInventory();
     if($("cash-catalog-box")&&!$("cash-catalog-box").hidden)renderCashCatalogSearch();
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
async function verifyCartAtServer(){
 const local=window.CashierV20.validate(cart,id=>balances.get(id));
 if(!local.ok)throw new Error(explainBasketRejection(local.reason));
 if(cart.some(x=>x.outdated))throw new Error("نرخ یان بارکۆدی ڕیزێک گۆڕاوە؛ بسڕەوە و دووبارە بسکانە");
 const latestStock=new Map();
 for(const line of cart){
   const {data,error}=await db.rpc("retail_resolve_barcode_v18",{
     p_store:store.id,p_code:line.barcode
   });
   if(error)throw error;
   const valid=Boolean(data?.found&&data.code===line.barcode&&data.product_id===line.id&&
     data.currency==="IQD"&&data.unit_type===line.mode&&
     Number(data.price_minor)===line.price);
   const correctPack=line.isScale?
     (data?.base_unit==="kg"&&data?.is_scale===true&&
       Number(data.scale_grams)===Number(line.scaleGrams)&&
       Number(data.scale_weight_kg)===Number(line.units)):
     (data?.base_unit==="unit"&&!data?.is_scale&&
       Number(data.units_per_scan)===Number(line.units));
   if(!valid||!correctPack){
     line.outdated=true;renderCart();
     throw new Error("بارکۆد، نرخ یان یەکەی کاڵا گۆڕاوە؛ ڕیزەکە بسڕەوە و دووبارە بسکانە");
   }
   latestStock.set(line.id,Number(data.stock_quantity));
 }
 const remote=window.CashierV20.validate(cart,id=>latestStock.get(id));
 if(!remote.ok)throw new Error(explainBasketRejection(remote.reason));
 // Balance snapshots are only a UX guard; the checkout RPC performs the
 // final atomic stock/price validation to prevent checkout-time races.
 for(const [id,qty] of latestStock)balances.set(id,qty);
 return true;
}
$("checkout-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!db||!store||busy||!cart.length||pendingCheckout||customerSelectionPending("checkout-customer"))return;
 const subtotal=cartSubtotal(),discount=cartDiscount(),total=cartNetTotal(),cash=Number($("cash").value);
 if(discount>subtotal){
   msg("checkout-msg","داشکاندن نابێت لە کۆی گشتی زیاتر بێت","error");return;
 }
 if(discount>0&&role==="cashier"){
   if(storeSettings.permCashierDiscount==="manager_only"){
     msg("checkout-msg","پێدانی داشکاندن بۆ کاشێر قەدەغەیە بەپێی ڕێکخستنی دەسەڵاتەکان","error");return;
   }
   const maxDisc=Number(storeSettings.permCashierMaxDisc??25000);
   if(maxDisc>=0&&discount>maxDisc){
     msg("checkout-msg","بڕی داشکاندن لە سەقفی ڕێگەپێدراوی کاشێر ("+money(maxDisc)+") زیاترە","error");return;
   }
 }
 if(!Number.isSafeInteger(cash)||cash<total||cash>9999999999999){
   msg("checkout-msg","پارەی وەرگیراو نادروستە","error");return;
 }
 if(!shiftSession){msg("checkout-msg","سەرەتا شێفتی کاشێر بکەرەوە","error");return;}
 lock(true);
 try{await verifyCartAtServer();}
 catch(err){msg("checkout-msg",safe(err)+" — هیچ فرۆشتنێک تۆمار نەکرا","error");return;}
 finally{lock(false);}
 const customerId=String($("checkout-customer")?.value||"");
 const summaryNote=cart.map(x=>x.name+" × "+(x.isScale?Number(x.units).toFixed(3)+"کگم":x.qty)).join("، ").slice(0,150);
 // No checkout request UUID is created until every item is verified.
 requestId=crypto.randomUUID();
 const hasKg=cart.some(x=>x.isScale);
 const packs=Boolean(String($("checkout-customer")?.value||""))||cart.some(x=>x.mode==="carton"||Boolean(x.scaleLabel)||Boolean(x.isScale))||discount>0;
 pendingCheckout={id:requestId,
   v16:packs,
   v19:hasKg,
   discount,
   customerId,
   debtAmount:0,
   paidAmount:cash,
   summaryNote,
   items:packs?cart.map(x=>({barcode:x.barcode,quantity:x.qty,
       expected_price_minor:x.price,expected_units:x.isScale?1:x.units})):
      cart.map(x=>({product_id:x.id,quantity:x.qty})),cash};
 persistPending();syncPending();
 await commitCheckout();
});
$("checkout-to-debt")?.addEventListener("click",async()=>{
 if(!db||!store||busy||!cart.length||pendingCheckout||customerSelectionPending("checkout-customer"))return;
 if(!canManage()){
   msg("checkout-msg","فرۆشتن بە قەرز تەنها بۆ بەڕێوەبەر و خاوەنکار ڕێگەپێدراوە","error");
   return;
 }
 const customerId=String($("checkout-customer")?.value||"");
 if(!customerId){
   msg("checkout-msg","بۆ فرۆشتن بە قەرز سەرەتا لە لیستی سەرەوە کڕیارەکە هەڵبژێرە","error");
   $("checkout-customer")?.focus();
   return;
 }
 const subtotal=cartSubtotal(),discount=cartDiscount(),total=cartNetTotal();
 const paidCash=Math.max(0,Math.round(Number($("cash").value||0)));
 if(discount>subtotal){
   msg("checkout-msg","داشکاندن نابێت لە کۆی گشتی زیاتر بێت","error");return;
 }
 if(paidCash>=total){
   $("checkout-form").requestSubmit();
   return;
 }
 if(!shiftSession){msg("checkout-msg","سەرەتا شێفتی کاشێر بکەرەوە","error");return;}
 const debtAmount=total-paidCash;
 lock(true);
 try{await verifyCartAtServer();}
 catch(err){msg("checkout-msg",safe(err)+" — هیچ فرۆشتنێک تۆمار نەکرا","error");return;}
 finally{lock(false);}
 const summaryNote=cart.map(x=>x.name+" × "+(x.isScale?Number(x.units).toFixed(3)+"کگم":x.qty)).join("، ").slice(0,150);
 requestId=crypto.randomUUID();
 const hasKg=cart.some(x=>x.isScale);
 const packs=Boolean(String($("checkout-customer")?.value||""))||cart.some(x=>x.mode==="carton"||Boolean(x.scaleLabel)||Boolean(x.isScale))||discount>0;
 pendingCheckout={id:requestId,
   v16:packs,
   v19:hasKg,
   discount,
   customerId,
   debtAmount,
   paidAmount:paidCash,
   summaryNote,
   items:packs?cart.map(x=>({barcode:x.barcode,quantity:x.qty,
       expected_price_minor:x.price,expected_units:x.isScale?1:x.units})):
      cart.map(x=>({product_id:x.id,quantity:x.qty})),cash:total};
 persistPending();syncPending();
 await commitCheckout();
});
$("retry-checkout").addEventListener("click",()=>{if(pendingCheckout&&!busy)void commitCheckout();});
$("customers-subtabs")?.addEventListener("click",e=>{
 const btn=e.target.closest("[data-cust-sub]");
 if(btn&&!busy)selectCustomerSub(btn.dataset.custSub);
});
function resetCustomerForm(){
 if($("cust-edit-id"))$("cust-edit-id").value="";
 if($("cust-name"))$("cust-name").value="";
 if($("cust-phone"))$("cust-phone").value="";
 if($("cust-address"))$("cust-address").value="";
 if($("cust-credit-limit"))$("cust-credit-limit").value="500000";
 if($("cust-opening-debt"))$("cust-opening-debt").value="0";
 if($("cust-opening-wrap"))$("cust-opening-wrap").hidden=false;
 if($("cust-note"))$("cust-note").value="";
 if($("cust-submit"))$("cust-submit").textContent="تۆمارکردنی کڕیار";
 if($("cust-form-title"))$("cust-form-title").textContent="زیادکردنی کڕیاری نوێ و کردنەوەی حیساب";
 if($("cust-cancel-edit"))$("cust-cancel-edit").hidden=true;
}
$("cust-cancel-edit")?.addEventListener("click",resetCustomerForm);
$("customer-form")?.addEventListener("submit",async e=>{
 e.preventDefault();if(!store||busy||!canManage())return;
 const storeId=store.id,actor=user?.id,epoch=customerIdentityEpoch;
 const current=()=>store?.id===storeId&&user?.id===actor&&customerIdentityEpoch===epoch;
 lock(true);msg("cust-directory-msg","");
 try{
  await financialRpc("save-customer","retail_save_party_v21",{
   p_store:store.id,p_kind:"customer",p_party:{id:$("cust-edit-id")?.value||"",name:$("cust-name")?.value.trim()||"",
    phone:$("cust-phone")?.value||"",address:$("cust-address")?.value||"",credit_limit:Number($("cust-credit-limit")?.value||0),
    opening_balance:$("cust-edit-id")?.value?0:Number($("cust-opening-debt")?.value||0),note:$("cust-note")?.value||""}
  });
  if(!current())return;
  await refreshCustomersSection("directory");if(!current())return;resetCustomerForm();
  msg("cust-directory-msg","حیسابی کڕیار لە سێرڤەر پاشەکەوت کرا","success");
 }catch(err){if(current())msg("cust-directory-msg",safe(err),"error");}finally{lock(false);}
});
$("cust-search")?.addEventListener("input",invalidateCustomerDirectory);
$("cust-search-field")?.addEventListener("change",invalidateCustomerDirectory);
$("cust-status-filter")?.addEventListener("change",invalidateCustomerDirectory);
$("cust-over-limit-page")?.addEventListener("change",renderCustomersDirectory);
$("customers-read-refresh").addEventListener("click",()=>{if(!busy)void refreshCustomersSection(custSub);});
$("cust-refresh")?.addEventListener("click",()=>{if(!busy)void refreshCustomerDirectory();});
$("cust-prev")?.addEventListener("click",()=>{if(!busy&&!directoryLoading&&directoryReady&&directoryOffset>=50){directoryOffset-=50;void refreshCustomerDirectory(false);}});
$("cust-next")?.addEventListener("click",()=>{if(!busy&&!directoryLoading&&directoryReady&&directoryOffset+50<directoryTotal){directoryOffset+=50;void refreshCustomerDirectory(false);}});
$("cust-export-csv")?.addEventListener("click",()=>{
 if(!customersReady||!directoryReady)return;
 const rows=filterCustomerDirectoryRows().map(c=>[c.name,c.phone||"",c.address||"",c.balance_minor,c.credit_limit_minor,c.due_date||"",c.note||"",c.id]);
 exportOperationsCsv("customers_page_"+(directoryOffset+1)+"-"+(directoryOffset+directoryRows.length)+"_of_"+directoryTotal+".csv",["ناوی کڕیار","مۆبایل","ناونیشان","قەرزی ئێستا (IQD)","سنووری قەرز (IQD)","مۆڵەتی دانەوە","تێبینی","ناسنامە"],rows);
});
async function openCustomerDebtForm(id){
 const storeId=store?.id,actor=user?.id;selectCustomerSub("debts",false);if(!await loadCustomersAndLedger(id)||store?.id!==storeId||user?.id!==actor)return;
 $("debt-customer").value=id;await refreshCustomerDebts();$("debt-amount")?.focus();
}
$("customers-list")?.addEventListener("click",async e=>{
 if(busy)return;
 const addDebtBtn=e.target.closest("[data-cust-add-debt]");
 if(addDebtBtn){
   const id=addDebtBtn.dataset.custAddDebt;
   void openCustomerDebtForm(id);
   return;
 }
 const payBtn=e.target.closest("[data-cust-pay]");
 if(payBtn){
   const id=payBtn.dataset.custPay;
   void openCustomerPaymentForm(id);
   return;
 }
 const stmBtn=e.target.closest("[data-cust-statement]");
 if(stmBtn){
   const id=stmBtn.dataset.custStatement;
   void openCustomerHistory(id);
   return;
 }
 const editBtn=e.target.closest("[data-cust-edit]");
 if(editBtn){
   const id=editBtn.dataset.custEdit;
   const storeId=store?.id,actor=user?.id,epoch=customerIdentityEpoch;resetCustomerForm();lock(true);
   try{
   const c=await window.RetailCustomerDirectory.one({db,store:storeId,id});
   if(store?.id!==storeId||user?.id!==actor||customerIdentityEpoch!==epoch)return;
   if($("cust-edit-id"))$("cust-edit-id").value=c.id;
   if($("cust-name"))$("cust-name").value=c.name||"";
   if($("cust-phone"))$("cust-phone").value=c.phone||"";
   if($("cust-address"))$("cust-address").value=c.address||"";
   if($("cust-credit-limit"))$("cust-credit-limit").value=String(c.credit_limit_minor??500000);
   if($("cust-opening-wrap"))$("cust-opening-wrap").hidden=true;
   if($("cust-note"))$("cust-note").value=c.note||"";
   if($("cust-submit"))$("cust-submit").textContent="پاشەکەوتکردنی گۆڕانکاری";
   if($("cust-form-title"))$("cust-form-title").textContent="دەستکاریکردنی زانیاری کڕیار: "+c.name;
   if($("cust-cancel-edit"))$("cust-cancel-edit").hidden=false;
   $("cust-name")?.focus();
   }catch(error){if(store?.id===storeId&&user?.id===actor&&customerIdentityEpoch===epoch)msg("cust-directory-msg",safe(error),"error");}finally{lock(false);}
 }
});
$("customer-debt-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||!user||busy||customerSelectionPending("debt-customer"))return;
 const debtStore=store.id,debtActor=user.id,debtEpoch=customerIdentityEpoch;
 const debtCurrent=()=>store?.id===debtStore&&user?.id===debtActor&&customerIdentityEpoch===debtEpoch;
 const customerId=String($("debt-customer")?.value||"");
 const entryType=String($("debt-type")?.value||"debt_sale");
 const amount=Math.round(Number($("debt-amount")?.value||0));
 const receiptNo=String($("debt-receipt-no")?.value||"").trim();
 const dueDate=String($("debt-due-date")?.value||"").trim()||null;
 const note=String($("debt-note")?.value||"").trim();
 const cust=customersList.find(c=>c.id===customerId);
 if(!cust||!(amount>0)||!note){
   msg("cust-debts-msg","تکایە کڕیار، بڕی قەرز و وردەکاری بە دروستی پڕبکەرەوە","error");
   return;
 }
 lock(true);msg("cust-debts-msg","");
 try{
   const entry=await recordCustomerLedgerEntry({
     customerId,entryType,amount,note,receiptNo,dueDate,targetMsgId:"cust-debts-msg"
   });
   if(entry&&debtCurrent()){
     if($("debt-amount"))$("debt-amount").value="";
     if($("debt-receipt-no"))$("debt-receipt-no").value="";
     if($("debt-note"))$("debt-note").value="";
     await refreshCustomerDebts();if(!debtCurrent())return;
     const lim=Number(cust.credit_limit_minor||0);
     const overWarn=lim>0&&Number(cust.balance_minor)>lim?" (ئاگاداری: کۆی قەرز لە سنووری ڕێگەپێدراو تێپەڕی!)":"";
     msg("cust-debts-msg","بڕی "+money(amount)+" خرایە سەر قەرزی «"+cust.name+"» — قەرزی نوێ: "+money(cust.balance_minor)+overWarn,"success");
   }
 }finally{
   lock(false);
 }
});
$("debt-search")?.addEventListener("input",invalidateCustomerDebts);
$("debt-search-field")?.addEventListener("change",invalidateCustomerDebts);
$("debt-filter")?.addEventListener("change",invalidateCustomerDebts);
$("debt-over-limit-page")?.addEventListener("change",renderCustomerDebtsView);
$("debt-refresh")?.addEventListener("click",()=>{if(!busy)void refreshCustomersSection("debts");});
$("debt-prev")?.addEventListener("click",()=>{if(!busy&&!debtLoading&&debtReady&&debtOffset>=50){debtOffset-=50;void refreshCustomerDebts(false);}});
$("debt-next")?.addEventListener("click",()=>{if(!busy&&!debtLoading&&debtReady&&debtOffset+50<debtTotal){debtOffset+=50;void refreshCustomerDebts(false);}});
$("debt-export-csv")?.addEventListener("click",()=>{
 if(!customersReady||!debtReady)return;
 const rows=filterCustomerDebtRows().map(c=>[c.name,c.phone||"",c.balance_minor,c.credit_limit_minor,c.due_date||"",c.note||"",c.id]);
 exportOperationsCsv("customer_debts_page_"+(debtOffset+1)+"-"+(debtOffset+debtRows.length)+"_of_"+debtTotal+".csv",["کڕیار","مۆبایل","بڕی قەرز (IQD)","سنووری قەرز (IQD)","مۆڵەتی دانەوە","تێبینی","ناسنامە"],rows);
});
$("debts-list")?.addEventListener("click",e=>{
 if(busy)return;
 const colBtn=e.target.closest("[data-debt-collect]");
 if(colBtn){
   const id=colBtn.dataset.debtCollect;
   void openCustomerPaymentForm(id);
   return;
 }
 const stmBtn=e.target.closest("[data-debt-statement]");
 if(stmBtn){
   const id=stmBtn.dataset.debtStatement;
   void openCustomerHistory(id);
 }
});
$("history-link-sale-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||busy||customerSelectionPending("hist-link-customer"))return;
 const customerId=String($("hist-link-customer")?.value||"");
 const saleId=String($("hist-link-sale")?.value||"");
 const mode=String($("hist-link-mode")?.value||"paid_purchase");
 const extraNote=String($("hist-link-note")?.value||"").trim();
 const cust=customersList.find(c=>c.id===customerId);
 const sale=allReceipts.find(s=>s.id===saleId);
 if(!cust||!sale){
   msg("cust-history-msg","تکایە کڕیار و پسووڵەی فرۆشتن هەڵبژێرە","error");
   return;
 }
 const rNo=String(sale.receipt_no??"").padStart(6,"0");
 const amt=Number(sale.total_minor||0);
 const note=(extraNote?extraNote+" — ":"")+"پسووڵەی فرۆشتن #"+rNo;
 lock(true);msg("cust-history-msg","");
 try{
   const entry=await recordCustomerLedgerEntry({
     customerId,
     entryType:mode==="debt_sale"?"debt_sale":"paid_purchase",
     amount:amt,
     receiptNo:rNo,
     saleId:sale.id,
     note,
     targetMsgId:"cust-history-msg"
   });
   if(entry){
     if($("hist-link-note"))$("hist-link-note").value="";
     await refreshCustomerHistory();
     msg("cust-history-msg","پسووڵەی #"+rNo+" ("+money(amt)+") بە مێژووی کڕینی «"+cust.name+"» بەسترایەوە","success");
   }
 }finally{
   lock(false);
 }
});
$("hist-customer-filter")?.addEventListener("change",()=>{$("hist-phone").value="";invalidateCustomerHistory();});
$("hist-phone")?.addEventListener("input",()=>{$("hist-customer-filter").value="all";invalidateCustomerHistory();});
$("hist-type-filter")?.addEventListener("change",invalidateCustomerHistory);
$("hist-date-filter")?.addEventListener("change",invalidateCustomerHistory);
$("hist-search")?.addEventListener("input",()=>{$("customer-statement-box").hidden=true;renderCustomerHistoryView();syncCustomerHistoryPager();});
$("hist-prev")?.addEventListener("click",()=>{if(!busy&&!historyLoading&&historyReady&&historyOffset>=50){historyOffset-=50;void refreshCustomerHistory(false);}});
$("hist-next")?.addEventListener("click",()=>{if(!busy&&!historyLoading&&historyReady&&historyOffset+50<historyTotal){historyOffset+=50;void refreshCustomerHistory(false);}});
$("hist-refresh")?.addEventListener("click",()=>{if(!busy)void refreshCustomerHistory();});
$("hist-print-statement")?.addEventListener("click",()=>{renderCustomerStatementBox();});
$("hist-export-csv")?.addEventListener("click",()=>{
 if(!customersReady||!historyReady)return;
 const rows=filterCustomerHistoryRows().map(item=>{
   const c=item.customer;
   return [
     item.created_at?new Date(item.created_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}):"",
     c?.name||item.customer_id||"",
     customerEntryTypeMeta(item.entry_type).label,
     item.receipt_no||"",
     item.amount_minor,
     item.delta_minor,
     item.balance_after_minor,
     item.note||""
   ];
 });
 exportOperationsCsv("customer_history_page_"+(historyOffset+1)+"-"+(historyOffset+historyRows.length)+"_of_"+historyTotal+".csv",
   ["کات و بەروار","کڕیار","جۆری مامەڵە","ژمارەی پسووڵە","بڕی مامەڵە (IQD)","گۆڕانی قەرز (IQD)","قەرزی ماوە دوای مامەڵە (IQD)","تێبینی"],rows);
});
$("cpay-quick-row")?.addEventListener("click",e=>{
 const btn=e.target.closest("[data-cpay-quick]");
 if(!btn||busy)return;
 const mode=btn.dataset.cpayQuick;
 const custId=String($("cpay-customer")?.value||"");
 const cust=customersList.find(c=>c.id===custId);
 if(mode==="full"){
   const bal=Math.max(0,Number(cust?.balance_minor||0));
   if($("cpay-amount"))$("cpay-amount").value=bal>0?String(bal):"";
 }else{
   const add=Number(mode||0);
   const cur=Number($("cpay-amount")?.value||0);
   if($("cpay-amount"))$("cpay-amount").value=String((Number.isSafeInteger(cur)&&cur>0?cur:0)+add);
 }
});
$("customer-payment-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||busy||customerSelectionPending("cpay-customer"))return;
 const customerId=String($("cpay-customer")?.value||"");
 const amount=Math.round(Number($("cpay-amount")?.value||0));
 const method=String($("cpay-method")?.value||"cash_drawer");
 const note=String($("cpay-note")?.value||"دانەوەی قەرز").trim();
 const cust=customersList.find(c=>c.id===customerId);
 if(!cust||!(amount>0)||!note){
   msg("cust-payments-msg","تکایە کڕیار و بڕی پارەی وەرگیراو بنووسە","error");
   return;
 }
 if(method==="cash_drawer"&&!shiftSession){
   msg("cust-payments-msg","بۆ زیادکردنی پارەی قەرز بۆ ناو سندووق، سەرەتا شێفتی کاشێر بکەرەوە یان «تەنها داشکاندن لە حیسابی قەرزی کڕیار» هەڵبژێرە","error");
   return;
 }
 lock(true);msg("cust-payments-msg","");
 try{
   const entry=await recordCustomerLedgerEntry({
     customerId,
     entryType:"payment_received",
     amount,
     paymentMethod:method,
     note,
     targetMsgId:"cust-payments-msg"
   });
   if(entry){
     if($("cpay-amount"))$("cpay-amount").value="";
     await refreshCustomerPaymentsPage();
     if(store?.id!==entry.store_id||user?.id!==entry.actor_id)return;
     renderCustomerPaymentVoucher(entry.id);
     msg("cust-payments-msg","بڕی "+money(amount)+(method==="cash_drawer"?" لە کڕیار «":" لە حیسابی کڕیار «")+cust.name+"» تۆمارکرا — قەرزی ماوە: "+money(cust.balance_minor),"success");
   }
 }catch(err){
   msg("cust-payments-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("cpay-search")?.addEventListener("input",()=>{$("cpay-voucher-box").hidden=true;renderCustomerPaymentsView();});
$("cpay-customer-filter")?.addEventListener("change",()=>{$("cpay-phone").value="";invalidateCustomerPayments();});
$("cpay-phone")?.addEventListener("input",()=>{$("cpay-customer-filter").value="all";invalidateCustomerPayments();});
$("cpay-date-filter")?.addEventListener("change",invalidateCustomerPayments);
$("cpay-method-filter")?.addEventListener("change",invalidateCustomerPayments);
$("cpay-prev")?.addEventListener("click",()=>{if(!busy&&!customerPayLoading&&customerPayReady&&customerPayOffset>=50){customerPayOffset-=50;void refreshCustomerPaymentsPage(false);}});
$("cpay-next")?.addEventListener("click",()=>{if(!busy&&!customerPayLoading&&customerPayReady&&customerPayOffset+50<customerPayTotal){customerPayOffset+=50;void refreshCustomerPaymentsPage(false);}});
$("cpay-refresh")?.addEventListener("click",()=>{if(!busy)void refreshCustomerPaymentsPage();});
$("cpay-export-csv")?.addEventListener("click",()=>{
 if(!customersReady||!customerPayReady)return;
 const rows=filterCustomerPaymentRows().map(item=>[
  new Date(item.created_at).toLocaleString("en-GB",{timeZone:"Asia/Baghdad"}),item.customer?.name||item.customer_id,
  item.amount_minor,item.delta_minor,item.balance_after_minor,customerPaymentMethodLabel(item.payment_method),item.note||"",item.id
 ]);
 exportOperationsCsv("customer_payments_page_"+(customerPayOffset+1)+"-"+(customerPayOffset+customerPayRows.length)+"_of_"+customerPayTotal+".csv",
  ["کات و بەروار (بەغدا)","کڕیار","بڕی پارەدان (IQD)","گۆڕانی قەرز (IQD)","قەرزی ماوە دوای مامەڵە (IQD)","شێواز","تێبینی","ناسنامەی وەسڵ"],rows);
});
$("customer-payments-list")?.addEventListener("click",e=>{
 const vBtn=e.target.closest("[data-cpay-voucher]");
 if(vBtn&&!busy)renderCustomerPaymentVoucher(vBtn.dataset.cpayVoucher);
});
$("suppliers-subtabs")?.addEventListener("click",e=>{
 const btn=e.target.closest("[data-sup-sub]");
 if(btn&&!busy)selectSupplierSub(btn.dataset.supSub);
});
$("po-product")?.addEventListener("change",()=>syncPoTotalCost(true));
$("po-qty")?.addEventListener("input",()=>syncPoTotalCost(false));
$("po-unit-cost")?.addEventListener("input",()=>syncPoTotalCost(false));
$("po-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||busy||!canManage()||!suppliersReady)return;
 const current=supplierIdentityGuard();
 const supplierId=String($("po-supplier")?.value||"");
 const productId=String($("po-product")?.value||"");
 const qty=Number($("po-qty")?.value||0);
 const rawCost=String($("po-unit-cost")?.value??"").trim();
 const unitCost=Number(rawCost);
 if(!rawCost||!Number.isSafeInteger(unitCost)||unitCost<0){msg("po-msg","نرخی ڕاستەقینەی وەسڵەکە بە IQD بنووسە","error");return;}
 const expectedDate=String($("po-expected-date")?.value||"").trim()||null;
 const note=String($("po-note")?.value||"").trim();
 const p=products.find(x=>x.id===productId);
 const sup=suppliersList.find(s=>s.id===supplierId);
 if(!p||!(qty>0)){
   msg("po-msg","تکایە کاڵا و بڕی داواکراو بە دروستی دیاری بکە","error");
   return;
 }
 const totalCost=Math.round(qty*unitCost);
 const nextNum=purchaseOrdersList.length+1;
 const poNo="PO-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+String(nextNum).padStart(3,"0");
 const newPo={
   id:crypto.randomUUID(),
   store_id:store.id,
   po_no:poNo,
   supplier_id:sup?sup.id:null,
   supplier_name:sup?sup.name:"دابینکەری گشتی",
   product_id:p.id,
   product_name:p.name,
   quantity:Number(qty.toFixed(3)),
   unit_cost_minor:unitCost,
   total_cost_minor:totalCost,
   expected_date:expectedDate,
   status:"pending",
   note,
   actor_id:user?.id||null,
   created_at:new Date().toISOString(),
   updated_at:new Date().toISOString()
 };
 lock(true);msg("po-msg","");
 try{
   await window.PurchasingV23.insertOrders(db,store.id,[newPo]);
   if(!current())return;
   await refreshSuppliersSection("orders");if(!current())return;
   if($("po-note"))$("po-note").value="";
   renderPurchaseOrdersView();
   msg("po-msg","داواکاری کڕینی ژمارە "+poNo+" بۆ «"+p.name+"» تۆمارکرا","success");
 }catch(err){
   if(current())msg("po-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("po-import-low-stock")?.addEventListener("click",async()=>{
 if(!store||busy||!canManage()||!suppliersReady)return;
 const current=supplierIdentityGuard();
 const threshold=Math.max(1,Number($("low-threshold-input")?.value||localStorage.getItem("retail_low_threshold")||5));
 const targetLevel=Math.max(threshold+1,Number($("low-target-input")?.value||localStorage.getItem("retail_low_target")||25));
 const lowItems=products.filter(p=>p.active!==false&&Number(balances.get(p.id)||0)<=threshold);
 if(!lowItems.length){
   msg("po-msg","هیچ کاڵایەکی کەمبوو لە کۆگادا نییە تا داواکاری بۆ دروست بکرێت","error");
   return;
 }
 const supplierId=String($("po-supplier")?.value||"");
 const sup=suppliersList.find(s=>s.id===supplierId);
 const expectedDate=String($("po-expected-date")?.value||new Date(Date.now()+2*86400000).toISOString().slice(0,10));
 let createdCount=0,missingCost=0;const drafts=[];
 lock(true);msg("po-msg","");
 try{
   for(const p of lowItems){
     const alreadyPending=purchaseOrdersList.some(o=>o.status==="pending"&&o.product_id===p.id);
     if(alreadyPending)continue;
     const curQty=Math.max(0,Number(balances.get(p.id)||0));
     const isKg=p.base_unit==="kg";
     const qty=Math.max(1,Number((targetLevel-curQty).toFixed(isKg?3:0)));
     const unitCost=getProductUnitCostInfo(p.id).unitCost;
     if(unitCost===null){missingCost++;continue;}
     const totalCost=Math.round(qty*unitCost);
     const poNo="PO-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+String(purchaseOrdersList.length+drafts.length+1).padStart(3,"0");
     const newPo={
       id:crypto.randomUUID(),
       store_id:store.id,
       po_no:poNo,
       supplier_id:sup?sup.id:null,
       supplier_name:sup?sup.name:"دابینکەری گشتی",
       product_id:p.id,
       product_name:p.name,
       quantity:qty,
       unit_cost_minor:unitCost,
       total_cost_minor:totalCost,
       expected_date:expectedDate,
       status:"pending",
       note:"پێشنیاری خۆکار لە کاڵای کەمبووی کۆگا (ئێستا: "+curQty+")",
       actor_id:user?.id||null,
       created_at:new Date().toISOString(),
       updated_at:new Date().toISOString()
     };
     drafts.push(newPo);
   }
   if(drafts.length){
     await window.PurchasingV23.insertOrders(db,store.id,drafts);
     if(!current())return;createdCount=drafts.length;
   }
   if(!current())return;await refreshSuppliersSection("orders");if(!current())return;
   msg("po-msg",createdCount+" داواکاری تۆمارکرا"+(missingCost?" — "+missingCost+" کاڵا بەهۆی نەبوونی تێچووی تۆمارکراو جێهێڵدرا؛ نرخی وەسڵەکە بە دەست بنووسە":""),missingCost?"info":"success");
 }catch(err){if(current())msg("po-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("po-search")?.addEventListener("input",invalidatePurchaseOrders);
$("po-search-field")?.addEventListener("change",invalidatePurchaseOrders);
$("po-status-filter")?.addEventListener("change",invalidatePurchaseOrders);
$("po-supplier-filter")?.addEventListener("change",invalidatePurchaseOrders);
$("po-refresh")?.addEventListener("click",()=>{if(!busy){if(suppliersReady)void refreshPurchaseOrders();else void refreshSuppliersSection("orders");}});
$("po-prev")?.addEventListener("click",()=>{if(!busy&&!poLoading&&poReady&&poOffset>=50){poOffset-=50;void refreshPurchaseOrders(false);}});
$("po-next")?.addEventListener("click",()=>{if(!busy&&!poLoading&&poReady&&poOffset+50<poTotal){poOffset+=50;void refreshPurchaseOrders(false);}});
$("po-export-csv")?.addEventListener("click",()=>{
 if(!suppliersReady||!poReady)return;
 const rows=poRows.map(o=>[o.po_no||"",o.supplier_name||"دابینکەری گشتی",o.product_name||"",o.quantity,o.unit_cost_minor,o.total_cost_minor,o.expected_date||"",o.status,o.note||"",o.id]);
 exportOperationsCsv("purchase_orders_page_"+(poOffset+1)+"-"+(poOffset+poRows.length)+"_of_"+poTotal+".csv",["ژمارەی داواکاری","دابینکەر","کاڵا","بڕ","نرخی تاک (IQD)","کۆی تێچوو (IQD)","بەرواری چاوەڕوانکراو","دۆخ","تێبینی","ناسنامە"],rows);
});
$("po-list")?.addEventListener("click",async e=>{
 if(busy||!canManage()||!suppliersReady||!poReady)return;
 const action=e.target.closest("[data-po-receive],[data-po-cancel],[data-po-print]");if(!action)return;
 const id=action.dataset.poReceive||action.dataset.poCancel||action.dataset.poPrint;
 const identityCurrent=supplierIdentityGuard(),pageToken=poToken,revision=suppliersReadToken;
 const current=()=>identityCurrent()&&poToken===pageToken&&suppliersReadToken===revision;
 lock(true);msg("po-msg","");
 try{
  const po=await window.RetailPurchaseOrderPages.one({db,store:store.id,id});if(!current())return;
  if(action.dataset.poPrint){renderPurchaseOrderPrintBox(po);return;}
  if(po.status!=="pending")throw Error("دۆخی داواکاری گۆڕاوە؛ لیستەکە نوێ بکەرەوە");
  if(action.dataset.poCancel){await window.PurchasingV23.cancelOrder(db,store.id,po.id);if(!current())return;await refreshPurchaseOrders(false);if(identityCurrent())msg("po-msg","داواکاری "+po.po_no+" هەڵوەشێندرایەوە","success");return;}
  const productSelect=$("rec-product");if(!po.product_id||![...productSelect.options].some(o=>o.value===po.product_id))throw Error("کاڵای ئەم داواکارییە لە لیستی وەرگرتندا بەردەست نییە؛ کاتەلۆگ نوێ بکەرەوە");
  if(po.supplier_id){const supplier=await window.RetailSupplierDirectory.one({db,store:store.id,id:po.supplier_id});if(!current())return;const next=suppliersList.filter(s=>s.id!==supplier.id).concat(supplier);window.RetailSupplierAccounts.totals(next,purchaseOrdersList,supplierLedgerList);suppliersList=next;populateSupplierSelectors();saveLocalSuppliers(suppliersList);renderSupplierReadScope();}
  if(!current())return;selectSupplierSub("receiving",false);renderGoodsReceivingView();
  $("rec-po-id").value=po.id;$("rec-supplier").value=po.supplier_id||"";$("rec-invoice-no").value=po.po_no||"";productSelect.value=po.product_id;$("rec-qty").value=String(po.quantity);$("rec-unit-cost").value=String(po.unit_cost_minor);$("rec-note").value="وەرگرتنی داواکاری کڕین "+po.po_no+(po.note?" — "+po.note:"");syncRecTotalCost(false);$("rec-qty")?.focus();
 }catch(error){if(current())msg("po-msg",safe(error),"error");}finally{lock(false);}
});
function resetSupplierForm(){
 if($("sup-edit-id"))$("sup-edit-id").value="";
 if($("sup-name"))$("sup-name").value="";
 if($("sup-company"))$("sup-company").value="";
 if($("sup-phone"))$("sup-phone").value="";
 if($("sup-address"))$("sup-address").value="";
 if($("sup-category"))$("sup-category").value="";
 if($("sup-opening-balance"))$("sup-opening-balance").value="0";
 if($("sup-opening-wrap"))$("sup-opening-wrap").hidden=false;
 if($("sup-note"))$("sup-note").value="";
 if($("sup-submit"))$("sup-submit").textContent="تۆمارکردنی دابینکەر";
 if($("sup-form-title"))$("sup-form-title").textContent="تۆمارکردنی دابینکەر / کۆمپانیای نوێ";
 if($("sup-cancel-edit"))$("sup-cancel-edit").hidden=true;
}
$("sup-cancel-edit")?.addEventListener("click",resetSupplierForm);
$("suppliers-read-refresh")?.addEventListener("click",()=>{if(!busy)void refreshSuppliersSection(supSub);});
$("supplier-form")?.addEventListener("submit",async e=>{
 e.preventDefault();if(!store||busy||!canManage()||!suppliersReady)return;
 const savedStore=store.id,savedActor=user?.id,savedEpoch=supplierIdentityEpoch;
 const current=()=>store?.id===savedStore&&user?.id===savedActor&&supplierIdentityEpoch===savedEpoch;
 lock(true);msg("sup-directory-msg","");
 try{
  await financialRpc("save-supplier","retail_save_party_v21",{
   p_store:store.id,p_kind:"supplier",p_party:{id:$("sup-edit-id")?.value||"",name:$("sup-name")?.value.trim()||"",
    company:$("sup-company")?.value||"",phone:$("sup-phone")?.value||"",address:$("sup-address")?.value||"",category:$("sup-category")?.value||"",
    opening_balance:$("sup-edit-id")?.value?0:Number($("sup-opening-balance")?.value||0),note:$("sup-note")?.value||""}
  });
  if(!current())return;
  const refreshed=await loadSuppliersAndPurchasing();if(!current())return;resetSupplierForm();if(refreshed)await refreshSupplierDirectory();
  msg("sup-directory-msg","حیسابی دابینکەر لە سێرڤەر پاشەکەوت کرا","success");
 }catch(err){if(current())msg("sup-directory-msg",safe(err),"error");}finally{lock(false);}
});
$("sup-search")?.addEventListener("input",invalidateSupplierDirectory);
$("sup-search-field")?.addEventListener("change",invalidateSupplierDirectory);
$("sup-filter")?.addEventListener("change",invalidateSupplierDirectory);
$("sup-refresh")?.addEventListener("click",()=>{if(!busy){if(suppliersReady)void refreshSupplierDirectory();else void refreshSuppliersSection("suppliers");}});
$("sup-prev")?.addEventListener("click",()=>{if(!busy&&!supDirectoryLoading&&supDirectoryReady&&supDirectoryOffset>=50){supDirectoryOffset-=50;void refreshSupplierDirectory(false);}});
$("sup-next")?.addEventListener("click",()=>{if(!busy&&!supDirectoryLoading&&supDirectoryReady&&supDirectoryOffset+50<supDirectoryTotal){supDirectoryOffset+=50;void refreshSupplierDirectory(false);}});
$("sup-export-csv")?.addEventListener("click",()=>{
 if(!suppliersReady||!supDirectoryReady)return;
 const rows=supDirectoryRows.map(s=>[s.name,s.company||"",s.phone||"",s.category||"",s.address||"",s.balance_minor,s.note||"",s.id]);
 exportOperationsCsv("suppliers_page_"+(supDirectoryOffset+1)+"-"+(supDirectoryOffset+supDirectoryRows.length)+"_of_"+supDirectoryTotal+".csv",["ناوی دابینکەر","کۆمپانیا","مۆبایل","جۆری کاڵا","ناونیشان","قەرزی ئێستا (IQD)","تێبینی","ناسنامە"],rows);
});
$("suppliers-list")?.addEventListener("click",async e=>{
 if(busy||!suppliersReady||!supDirectoryReady)return;
 const action=e.target.closest("[data-sup-order],[data-sup-receive],[data-sup-pay],[data-sup-statement],[data-sup-edit]");if(!action)return;
 const id=action.dataset.supOrder||action.dataset.supReceive||action.dataset.supPay||action.dataset.supStatement||action.dataset.supEdit;
 const identityCurrent=supplierIdentityGuard(),revision=suppliersReadToken,pageToken=supDirectoryToken;
 const current=()=>identityCurrent()&&suppliersReadToken===revision&&supDirectoryToken===pageToken;if(action.dataset.supEdit)resetSupplierForm();lock(true);
 try{
  const fresh=await window.RetailSupplierDirectory.one({db,store:store.id,id});if(!current()||suppliersReadToken!==revision||!suppliersReady)return;
  const next=suppliersList.filter(s=>s.id!==id).concat(fresh);window.RetailSupplierAccounts.totals(next,purchaseOrdersList,supplierLedgerList);suppliersList=next;populateSupplierSelectors();saveLocalSuppliers(suppliersList);renderSupplierReadScope();
 const ordBtn=e.target.closest("[data-sup-order]");
 if(ordBtn){
   const id=ordBtn.dataset.supOrder;
   selectSupplierSub("orders",false);await refreshPurchaseOrders();
   populateSupplierSelectors();
   if($("po-supplier"))$("po-supplier").value=id;
   $("po-product")?.focus();
   return;
 }
 const recBtn=e.target.closest("[data-sup-receive]");
 if(recBtn){
   const id=recBtn.dataset.supReceive;
   selectSupplierSub("receiving",false);renderGoodsReceivingView();
   populateSupplierSelectors();
   if($("rec-supplier"))$("rec-supplier").value=id;
   $("rec-invoice-no")?.focus();
   return;
 }
 const payBtn=e.target.closest("[data-sup-pay]");
 if(payBtn){
   const id=payBtn.dataset.supPay;
   const s=suppliersList.find(x=>x.id===id);
   selectSupplierSub("accounts",false);renderSupplierAccountsView();
   populateSupplierSelectors();
   if($("sacc-supplier"))$("sacc-supplier").value=id;
   if($("sacc-entry-type"))$("sacc-entry-type").value="payment_sent";
   if($("sacc-amount"))$("sacc-amount").value=Number(s?.balance_minor)>0?String(s.balance_minor):"";
   $("sacc-amount")?.focus();
   return;
 }
 const stmBtn=e.target.closest("[data-sup-statement]");
 if(stmBtn){
   const id=stmBtn.dataset.supStatement;
   selectSupplierSub("accounts",false);renderSupplierAccountsView();
   populateSupplierSelectors();
   if($("sacc-supplier-filter"))$("sacc-supplier-filter").value=id;
   renderSupplierAccountsView();
   renderSupplierStatementBox(id);
   return;
 }
 const editBtn=e.target.closest("[data-sup-edit]");
 if(editBtn){
   const s=suppliersList.find(x=>x.id===editBtn.dataset.supEdit);
   if(!s)return;
   if($("sup-edit-id"))$("sup-edit-id").value=s.id;
   if($("sup-name"))$("sup-name").value=s.name||"";
   if($("sup-company"))$("sup-company").value=s.company||"";
   if($("sup-phone"))$("sup-phone").value=s.phone||"";
   if($("sup-address"))$("sup-address").value=s.address||"";
   if($("sup-category"))$("sup-category").value=s.category||"";
   if($("sup-opening-wrap"))$("sup-opening-wrap").hidden=true;
   if($("sup-note"))$("sup-note").value=s.note||"";
   if($("sup-submit"))$("sup-submit").textContent="پاشەکەوتکردنی گۆڕانکاری";
   if($("sup-form-title"))$("sup-form-title").textContent="دەستکاریکردنی دابینکەر: "+s.name;
   if($("sup-cancel-edit"))$("sup-cancel-edit").hidden=false;
   $("sup-name")?.focus();
 }
 }catch(error){if(current())msg("sup-directory-msg",safe(error),"error");}finally{lock(false);}
});
$("rec-product")?.addEventListener("change",()=>syncRecTotalCost(true));
$("rec-qty")?.addEventListener("input",()=>syncRecTotalCost(false));
$("rec-unit-cost")?.addEventListener("input",()=>syncRecTotalCost(false));
$("receiving-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||busy||!canManage()||!suppliersReady)return;
 const current=supplierIdentityGuard();
 const poId=String($("rec-po-id")?.value||"").trim();
 const supplierId=String($("rec-supplier")?.value||"");
 const invoiceNo=String($("rec-invoice-no")?.value||"").trim()||("INV-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+String(supplierLedgerList.length+1).padStart(3,"0"));
 const productId=String($("rec-product")?.value||"");
 const qty=Number($("rec-qty")?.value||0);
 const rawCost=String($("rec-unit-cost")?.value??"").trim();
 const unitCost=Number(rawCost);
 if(!rawCost||!Number.isSafeInteger(unitCost)||unitCost<0){msg("rec-msg","نرخی ڕاستەقینەی وەسڵەکە بە IQD بنووسە","error");return;}
 const paymentMode=String($("rec-payment-mode")?.value||"credit");
 const expiryDate=String($("rec-expiry-date")?.value||"").trim();
 const note=String($("rec-note")?.value||"").trim();
 const p=products.find(x=>x.id===productId);
 const sup=suppliersList.find(s=>s.id===supplierId);
 if(!p||!(qty>0)){
   msg("rec-msg","تکایە کاڵای وەرگیراو و بڕی هاتوو بە دروستی دیاری بکە","error");
   return;
 }
 if(paymentMode==="credit"&&!sup){
   msg("rec-msg","بۆ کڕین بە قەرز پێویستە دابینکەرێکی دیاریکراو هەڵبژێریت (یان لە ژێرکارتی دابینکەران زیادی بکەیت)","error");
   return;
 }
 const totalCost=Math.round(qty*unitCost);
 if(paymentMode==="cash_drawer"&&totalCost>0&&!shiftSession){
   msg("rec-msg","بۆ ڕاکێشانی پارەی وەسڵ لە سندووقی کاشێر، سەرەتا شێفت بکەرەوە یان «نەقد لە قاسەی سەرەکی» هەڵبژێرە","error");
   return;
 }
 lock(true);msg("rec-msg","");
 try{
  await financialRpc("purchase-receipt","retail_receive_purchase_v21",{
   p_store:store.id,p_purchase:{product_id:p.id,supplier_id:sup?.id||"",po_id:poId||"",
    quantity:qty,unit_cost:unitCost,invoice_no:invoiceNo,payment_method:paymentMode,
    expiry_date:expiryDate||"",note}
  });
  if(!current())return;e.target.reset();
  await loadInventory();await loadSuppliersAndPurchasing();await refreshShift();
  if(!current())return;renderGoodsReceivingView();
  msg("rec-msg","وەسڵی کڕین، کۆگا و حیساب بە یەک مامەڵە تۆمارکران","success");
 }catch(err){if(current())msg("rec-msg",safe(err),"error");}
 finally{lock(false);}
});
$("rec-search")?.addEventListener("input",renderGoodsReceivingView);
$("rec-supplier-filter")?.addEventListener("change",renderGoodsReceivingView);
$("rec-mode-filter")?.addEventListener("change",renderGoodsReceivingView);
$("rec-refresh")?.addEventListener("click",()=>{if(!busy)void refreshSuppliersSection("receiving");});
$("rec-export-csv")?.addEventListener("click",()=>{
 if(!suppliersReady)return;
 const receipts=supplierLedgerList.filter(x=>x.entry_type==="purchase_credit"||x.entry_type==="purchase_cash");
 const rows=receipts.map(r=>[
   r.created_at?new Date(r.created_at).toLocaleString("en-GB"):"",
   r.invoice_no||"",
   r.supplier_name||"دابینکەری گشتی",
   r.product_name||"",
   r.quantity??"",
   r.unit_cost_minor??"",
   r.amount_minor||0,
   r.entry_type==="purchase_credit"?"بە قەرز":"نەقدی",
   r.note||""
 ]);
 exportOperationsCsv("goods_receiving_"+new Date().toISOString().slice(0,10)+".csv",
   ["کات و بەروار","ژمارەی وەسڵ","دابینکەر","کاڵا","بڕ","نرخی تاک (IQD)","کۆی وەسڵ (IQD)","شێوازی پارەدان","تێبینی"],rows);
});
$("sacc-supplier")?.addEventListener("change",()=>{if($("sacc-amount"))$("sacc-amount").value="";if($("supplier-statement-box"))$("supplier-statement-box").hidden=true;});
$("sacc-quick-row")?.addEventListener("click",e=>{
 if(!suppliersReady)return;
 const btn=e.target.closest("[data-sacc-quick]");
 if(!btn||busy)return;
 const mode=btn.dataset.saccQuick;
 const supId=String($("sacc-supplier")?.value||"");
 const sup=suppliersList.find(s=>s.id===supId);
 if(mode==="full"){
   const bal=Math.max(0,Number(sup?.balance_minor||0));
   if($("sacc-amount"))$("sacc-amount").value=bal>0?String(bal):"";
 }else{
   const add=Number(mode||0);
   const cur=Number($("sacc-amount")?.value||0);
   if($("sacc-amount"))$("sacc-amount").value=String((Number.isSafeInteger(cur)&&cur>0?cur:0)+add);
 }
});
$("supplier-payment-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||busy||!canManage()||!suppliersReady)return;
 const supplierId=String($("sacc-supplier")?.value||"");
 const entryType=String($("sacc-entry-type")?.value||"payment_sent");
 const amount=Math.round(Number($("sacc-amount")?.value||0));
 const invoiceNo=String($("sacc-invoice-no")?.value||"").trim();
 const paymentMethod=String($("sacc-payment-method")?.value||"ledger_only");
 const note=String($("sacc-note")?.value||"").trim();
 const sup=suppliersList.find(s=>s.id===supplierId);
 if(!sup||!(amount>0)||!note){
   msg("sacc-msg","تکایە دابینکەر، بڕی پارە و تێبینی بە دروستی پڕبکەرەوە","error");
   return;
 }
 if(entryType==="payment_sent"&&paymentMethod==="cash_drawer"&&!shiftSession){
   msg("sacc-msg","بۆ ڕاکێشانی پارەی دابینکەر لە سندووقی کاشێر، سەرەتا شێفت بکەرەوە یان «تەنها لە حیسابی دابینکەر (قاسەی سەرەکی)» هەڵبژێرە","error");
   return;
 }
 const paymentStore=store.id,paymentActor=user?.id,paymentEpoch=supplierIdentityEpoch;
 const current=()=>store?.id===paymentStore&&user?.id===paymentActor&&supplierIdentityEpoch===paymentEpoch;
 lock(true);msg("sacc-msg","");
 try{
   const entry=await recordSupplierLedgerEntry({
     supplierId:sup.id,
     entryType,
     amount,
     invoiceNo,
     paymentMethod,
     note,
     targetMsgId:"sacc-msg"
   });
   if(entry&&current()){
     if($("sacc-amount"))$("sacc-amount").value="";
     if($("sacc-invoice-no"))$("sacc-invoice-no").value="";
     if($("sacc-note"))$("sacc-note").value="";
     renderSupplierAccountsView();
     msg("sacc-msg","مامەڵەکە بۆ «"+sup.name+"» تۆمارکرا — قەرزی ماوەی ئێستا: "+money(sup.balance_minor),"success");
   }
 }catch(err){
   if(current())msg("sacc-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("sacc-supplier-filter")?.addEventListener("change",()=>{
 renderSupplierAccountsView();
 if($("supplier-statement-box")&&!$("supplier-statement-box").hidden){
   renderSupplierStatementBox();
 }
});
$("sacc-type-filter")?.addEventListener("change",renderSupplierAccountsView);
$("sacc-date-filter")?.addEventListener("change",renderSupplierAccountsView);
$("sacc-search")?.addEventListener("input",renderSupplierAccountsView);
$("sacc-print-statement")?.addEventListener("click",()=>{
 renderSupplierStatementBox();
});
$("sacc-export-csv")?.addEventListener("click",()=>{
 if(!suppliersReady)return;
 const rows=filterSupplierAccountsRows().map(item=>{
   const sup=suppliersList.find(s=>s.id===item.supplier_id);
   return [
     item.created_at?new Date(item.created_at).toLocaleString("en-GB"):"",
     sup?.name||item.supplier_name||"دابینکەری گشتی",
     supplierEntryTypeMeta(item.entry_type).label,
     item.invoice_no||"",
     item.amount_minor||0,
     item.balance_after_minor??0,
     item.note||""
   ];
 });
 exportOperationsCsv("supplier_accounts_"+new Date().toISOString().slice(0,10)+".csv",
   ["کات و بەروار","دابینکەر","جۆری مامەڵە","ژمارەی وەسڵ","بڕی مامەڵە (IQD)","قەرزی ماوە دوای مامەڵە (IQD)","تێبینی"],rows);
});
$("finance-subtabs")?.addEventListener("click",e=>{
 const btn=e.target.closest("[data-fin-sub]");
 if(btn&&!busy)selectFinanceSub(btn.dataset.finSub);
});
$("fin-go-shift")?.addEventListener("click",()=>{
 if(!busy)selectTab("shift");
});
$("fin-tr-quick-row")?.addEventListener("click",e=>{
 const btn=e.target.closest("[data-fin-tr-quick]");
 if(!btn||busy)return;
 const mode=btn.dataset.finTrQuick;
 if(mode==="drawer_full"){
   const exp=Math.max(0,Number(shiftSummaryData?.expected||0));
   if($("fin-tr-amount"))$("fin-tr-amount").value=exp>0?String(exp):"";
 }else{
   const add=Number(mode||0);
   const cur=Number($("fin-tr-amount")?.value||0);
   if($("fin-tr-amount"))$("fin-tr-amount").value=String((Number.isSafeInteger(cur)&&cur>0?cur:0)+add);
 }
});
$("fin-treasury-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||busy||!canManage())return;
 const kind=String($("fin-tr-kind")?.value||"drawer_to_safe");
 const amount=Number($("fin-tr-amount")?.value||0);
 const refNo=String($("fin-tr-ref")?.value||"").trim()||("TR-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+String(financeEntriesList.length+1).padStart(3,"0"));
 const note=String($("fin-tr-note")?.value||"").trim();
 if(!(amount>0)||!note){
   msg("fin-tr-msg","تکایە بڕی پارە و تێبینی مامەڵەکە بنووسە","error");
   return;
 }
 if((kind==="drawer_to_safe"||kind==="safe_to_drawer")&&!shiftSession){
   msg("fin-tr-msg","بۆ گواستنەوەی پارە لەنێوان سندووقی کاشێر و قاسەی سەرەکی، پێویستە شێفتی کاشێر کراوە بێت","error");
   return;
 }
 lock(true);msg("fin-tr-msg","");
 try{
   const catLabel=kind==="drawer_to_safe"?"گواستنەوە لە سندووق بۆ قاسە":
     kind==="safe_to_drawer"?"گواستنەوە لە قاسە بۆ سندووق":
     kind==="safe_deposit"?"دانانی پارە لە قاسەی سەرەکی":"ڕاکێشانی پارە لە قاسەی سەرەکی";
   await recordFinanceEntry({
     entryKind:kind,
     category:catLabel,
     amount,
     wallet:"safe",
     referenceNo:refNo,
     note,
     targetMsgId:"fin-tr-msg"
   });
   if($("fin-tr-amount"))$("fin-tr-amount").value="";
   if($("fin-tr-ref"))$("fin-tr-ref").value="";
   if($("fin-tr-note"))$("fin-tr-note").value="";
   renderFinanceTreasuryView();
   msg("fin-tr-msg","مامەڵەی "+catLabel+" بە بڕی "+money(amount)+" بە سەرکەوتوویی تۆمارکرا","success");
 }catch(err){
   msg("fin-tr-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("fin-tr-search")?.addEventListener("input",renderFinanceTreasuryView);
$("fin-tr-filter")?.addEventListener("change",renderFinanceTreasuryView);
$("fin-tr-refresh")?.addEventListener("click",()=>{if(!busy)void refreshFinanceSection("treasury");});
$("fin-tr-export-csv")?.addEventListener("click",()=>{
 const rows=financeEntriesList.filter(e=>["drawer_to_safe","safe_to_drawer","safe_deposit","safe_withdraw"].includes(e.entry_kind)).map(e=>[
   e.created_at?new Date(e.created_at).toLocaleString("en-GB"):"",
   e.category||"",
   e.reference_no||"",
   e.amount_minor||0,
   e.note||""
 ]);
 exportOperationsCsv("treasury_safe_"+new Date().toISOString().slice(0,10)+".csv",
   ["کات و بەروار","جۆری مامەڵە","ژمارەی مەرجەع","بڕی پارە (IQD)","تێبینی"],rows);
});
$("fin-revenue-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||busy||!canManage())return;
 const category=String($("fin-rev-category")?.value||"داهاتی تر");
 const amount=Number($("fin-rev-amount")?.value||0);
 const wallet=String($("fin-rev-wallet")?.value||"safe");
 const payee=String($("fin-rev-payee")?.value||"").trim();
 const refNo=String($("fin-rev-ref")?.value||"").trim()||("REV-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+String(financeEntriesList.length+1).padStart(3,"0"));
 const note=String($("fin-rev-note")?.value||"").trim();
 if(!(amount>0)||!note){
   msg("fin-rev-msg","تکایە بڕی داهات و تێبینی بنووسە","error");
   return;
 }
 if(wallet==="cash_drawer"&&!shiftSession){
   msg("fin-rev-msg","بۆ تۆمارکردنی داهات لە سندووقی کاشێر، سەرەتا شێفت بکەرەوە یان «قاسەی سەرەکی فرۆشگا» هەڵبژێرە","error");
   return;
 }
 lock(true);msg("fin-rev-msg","");
 try{
   await recordFinanceEntry({
     entryKind:"revenue",
     category,
     amount,
     wallet,
     payee,
     referenceNo:refNo,
     note,
     targetMsgId:"fin-rev-msg"
   });
   if($("fin-rev-amount"))$("fin-rev-amount").value="";
   if($("fin-rev-payee"))$("fin-rev-payee").value="";
   if($("fin-rev-ref"))$("fin-rev-ref").value="";
   if($("fin-rev-note"))$("fin-rev-note").value="";
   renderFinanceRevenueView();
   msg("fin-rev-msg","داهاتی «"+category+"» بە بڕی "+money(amount)+" تۆمارکرا","success");
 }catch(err){
   msg("fin-rev-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("fin-rev-search")?.addEventListener("input",renderFinanceRevenueView);
$("fin-rev-source-filter")?.addEventListener("change",renderFinanceRevenueView);
$("fin-rev-date-filter")?.addEventListener("change",renderFinanceRevenueView);
$("fin-rev-refresh")?.addEventListener("click",()=>{if(!busy)void refreshFinanceSection("revenue");});
$("fin-rev-export-csv")?.addEventListener("click",()=>{
 const rows=filterRevenueRows().map(r=>[
   r.created_at?new Date(r.created_at).toLocaleString("en-GB"):"",
   r.sourceLabel,
   r.category,
   r.ref,
   r.walletLabel,
   r.amount_minor||0,
   r.note||""
 ]);
 exportOperationsCsv("store_revenues_"+new Date().toISOString().slice(0,10)+".csv",
   ["کات و بەروار","سەرچاوەی داهات","بابەت / کڕیار","ژمارەی وەسڵ","سندووق / قاسە","بڕی داهات (IQD)","تێبینی"],rows);
});
$("fin-exp-quick-row")?.addEventListener("click",e=>{
 const btn=e.target.closest("[data-fin-exp-quick]");
 if(!btn||busy)return;
 const add=Number(btn.dataset.finExpQuick||0);
 const cur=Number($("fin-exp-amount")?.value||0);
 if($("fin-exp-amount"))$("fin-exp-amount").value=String((Number.isSafeInteger(cur)&&cur>0?cur:0)+add);
});
$("fin-expense-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||busy||!canManage())return;
 const category=String($("fin-exp-category")?.value||"خەرجی گشتی");
 const amount=Number($("fin-exp-amount")?.value||0);
 const wallet=String($("fin-exp-wallet")?.value||"safe");
 const payee=String($("fin-exp-payee")?.value||"").trim();
 const refNo=String($("fin-exp-ref")?.value||"").trim()||("EXP-"+new Date().toISOString().slice(2,10).replace(/-/g,"")+"-"+String(financeEntriesList.length+1).padStart(3,"0"));
 const note=String($("fin-exp-note")?.value||"").trim();
 if(!(amount>0)||!note){
   msg("fin-exp-msg","تکایە بڕی خەرجی و تێبینی بنووسە","error");
   return;
 }
 if(wallet==="cash_drawer"&&!shiftSession){
   msg("fin-exp-msg","بۆ خەرجکردن لە سندووقی کاشێر، سەرەتا شێفت بکەرەوە یان «قاسەی سەرەکی فرۆشگا» هەڵبژێرە","error");
   return;
 }
 lock(true);msg("fin-exp-msg","");
 try{
   const entry=await recordFinanceEntry({
     entryKind:"expense",
     category,
     amount,
     wallet,
     payee,
     referenceNo:refNo,
     note,
     targetMsgId:"fin-exp-msg"
   });
   if($("fin-exp-amount"))$("fin-exp-amount").value="";
   if($("fin-exp-payee"))$("fin-exp-payee").value="";
   if($("fin-exp-ref"))$("fin-exp-ref").value="";
   if($("fin-exp-note"))$("fin-exp-note").value="";
   renderFinanceExpensesView();
   if(entry)renderFinanceExpenseVoucher(entry.id);
   msg("fin-exp-msg","خەرجی «"+category+"» بە بڕی "+money(amount)+" تۆمارکرا","success");
 }catch(err){
   msg("fin-exp-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("fin-exp-search")?.addEventListener("input",renderFinanceExpensesView);
$("fin-exp-type-filter")?.addEventListener("change",renderFinanceExpensesView);
$("fin-exp-date-filter")?.addEventListener("change",renderFinanceExpensesView);
$("fin-exp-refresh")?.addEventListener("click",()=>{if(!busy)void refreshFinanceSection("expenses");});
$("fin-exp-export-csv")?.addEventListener("click",()=>{
 const rows=filterExpenseRows().map(r=>[
   r.created_at?new Date(r.created_at).toLocaleString("en-GB"):"",
   r.kindLabel,
   r.category,
   r.payee,
   r.ref,
   r.walletLabel,
   r.amount_minor||0,
   r.note||""
 ]);
 exportOperationsCsv("store_expenses_"+new Date().toISOString().slice(0,10)+".csv",
   ["کات و بەروار","جۆری خەرجی","پۆلێن","وەرگر / لایەن","ژمارەی وەسڵ","سەرچاوەی پارە","بڕی خەرجی (IQD)","تێبینی"],rows);
});
$("fin-expenses-list")?.addEventListener("click",e=>{
 const vBtn=e.target.closest("[data-fin-exp-voucher]");
 if(vBtn&&!busy)renderFinanceExpenseVoucher(vBtn.dataset.finExpVoucher);
});
$("fin-cf-search")?.addEventListener("input",renderFinanceCashflowView);
$("fin-cf-dir-filter")?.addEventListener("change",renderFinanceCashflowView);
$("fin-cf-source-filter")?.addEventListener("change",renderFinanceCashflowView);
$("fin-cf-date-filter")?.addEventListener("change",renderFinanceCashflowView);
$("fin-cf-refresh")?.addEventListener("click",()=>{if(!busy)void refreshFinanceSection("cashflow");});
$("fin-cf-print-statement")?.addEventListener("click",()=>{
 renderFinanceCashflowStatement();
});
$("fin-cf-export-csv")?.addEventListener("click",()=>{
 const rows=filterCashflowRows().map(r=>[
   r.created_at?new Date(r.created_at).toLocaleString("en-GB"):"",
   r.dir==="in"?"هاتوو (+)":"دەرچوو (−)",
   r.typeLabel,
   r.party,
   r.ref,
   r.walletLabel,
   r.amount_minor||0,
   r.note||""
 ]);
 exportOperationsCsv("cashflow_ledger_"+new Date().toISOString().slice(0,10)+".csv",
   ["کات و بەروار","ئاراستە","جۆری جووڵە","لایەن / بابەت","ژمارەی مەرجەع","سندووق / قاسە","بڕی پارە (IQD)","تێبینی"],rows);
});
$("reports-subtabs")?.addEventListener("click",e=>{
 const btn=e.target.closest("[data-rep-sub]");
 if(btn&&!busy)selectReportsSub(btn.dataset.repSub);
});
$("rep-sales-search")?.addEventListener("input",renderReportsSalesView);
$("rep-sales-group-mode")?.addEventListener("change",renderReportsSalesView);
$("rep-sales-date-filter")?.addEventListener("change",renderReportsSalesView);
$("rep-sales-from")?.addEventListener("change",renderReportsSalesView);
$("rep-sales-to")?.addEventListener("change",renderReportsSalesView);
$("rep-sales-refresh")?.addEventListener("click",()=>{if(!busy)void refreshReportsSection("sales");});
$("rep-sales-print-btn")?.addEventListener("click",renderReportsSalesPrintBox);
$("rep-sales-export-csv")?.addEventListener("click",()=>window.RetailReportsV22.exportPage("sales"));
$("rep-cost-product")?.addEventListener("change",()=>syncReportCostFormPreview(true));
$("rep-cost-value")?.addEventListener("input",()=>syncReportCostFormPreview(false));
$("rep-cost-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!store||busy||!canManage())return;
 const productId=String($("rep-cost-product")?.value||"");
 const unitCost=Math.max(0,Math.round(Number($("rep-cost-value")?.value||0)));
 const note=String($("rep-cost-note")?.value||"").trim();
 const p=products.find(x=>x.id===productId);
 if(!p){
   msg("rep-profit-msg","تکایە کاڵاکە هەڵبژێرە","error");
   return;
 }
 lock(true);msg("rep-profit-msg","");
 try{
   const {error}=await db.from("retail_product_costs").upsert({store_id:store.id,product_id:productId,unit_cost_minor:unitCost,note:note||null,actor_id:user.id,updated_at:new Date().toISOString()},{onConflict:"store_id,product_id"});
   if(error)throw error;
   productCostsMap.set(productId,{unit_cost_minor:unitCost,note});saveLocalProductCosts();
   populateReportCostSelect();
   if($("rep-cost-product"))$("rep-cost-product").value=productId;
   syncReportCostFormPreview(true);
   renderReportsProfitView();
   msg("rep-profit-msg","نرخی تێچووی «"+p.name+"» کرا بە "+money(unitCost)+" وەک تێچووی ئێستا پاشەکەوت کرا","success");
 }catch(err){
   msg("rep-profit-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("rep-profit-search")?.addEventListener("input",renderReportsProfitView);
$("rep-profit-filter")?.addEventListener("change",renderReportsProfitView);
$("rep-profit-date-filter")?.addEventListener("change",renderReportsProfitView);
$("rep-profit-refresh")?.addEventListener("click",()=>{if(!busy)void refreshReportsSection("profit");});
$("rep-profit-print-btn")?.addEventListener("click",renderReportsProfitPrintBox);
$("rep-profit-export-csv")?.addEventListener("click",()=>window.RetailReportsV22.exportPage("profit"));
$("rep-profit-list")?.addEventListener("click",e=>{
 const editBtn=e.target.closest("[data-rep-edit-cost]");
 if(!editBtn||busy)return;
 const pid=editBtn.dataset.repEditCost;
 if($("rep-cost-product")&&[...$("rep-cost-product").options].some(o=>o.value===pid)){
   $("rep-cost-product").value=pid;
   syncReportCostFormPreview(true);
   $("rep-cost-value")?.focus();
   $("rep-cost-value")?.select();
 }
});
$("rep-inv-search")?.addEventListener("input",renderReportsInventoryView);
$("rep-inv-filter")?.addEventListener("change",renderReportsInventoryView);
$("rep-inv-sort")?.addEventListener("change",renderReportsInventoryView);
$("rep-inv-refresh")?.addEventListener("click",()=>{if(!busy)void refreshReportsSection("inventory");});
$("rep-inv-print-btn")?.addEventListener("click",renderReportsInventoryPrintBox);
$("rep-inv-export-csv")?.addEventListener("click",()=>window.RetailReportsV22.exportPage("inventory"));
$("rep-ins-search")?.addEventListener("input",renderReportsInsightsView);
$("rep-ins-filter")?.addEventListener("change",renderReportsInsightsView);
$("rep-ins-refresh")?.addEventListener("click",()=>{if(!busy)void refreshReportsSection("insights");});
$("rep-ins-print-btn")?.addEventListener("click",renderReportsInsightsPrintBox);
$("rep-ins-export-csv")?.addEventListener("click",()=>window.RetailReportsV22.exportPage("insights"));
$("rep-ins-cards")?.addEventListener("click",async e=>{
 const btn=e.target.closest("[data-ins-quick-action]");
 if(!btn||busy)return;
 const act=btn.dataset.insQuickAction;
 if(act==="go_po"){
   selectTab("suppliers");
   await selectSupplierSub("orders");if(!suppliersReady)return;
   $("po-import-low-stock")?.click();
 }else if(act==="filter_c"){
   if($("rep-ins-filter"))$("rep-ins-filter").value="abc_c";
   renderReportsInsightsView();
 }else if(act==="go_debts"){
   selectTab("customers");
   selectCustomerSub("debts");
 }
});
$("rep-ins-abc-list")?.addEventListener("click",async e=>{
 const btn=e.target.closest("[data-ins-order-prod]");
 if(!btn||busy)return;
 const pid=btn.dataset.insOrderProd;
 selectTab("suppliers");
 await selectSupplierSub("orders");if(!suppliersReady)return;
 populateSupplierSelectors();
 if($("po-product")&&[...$("po-product").options].some(o=>o.value===pid)){
   $("po-product").value=pid;
   syncPoTotalCost(true);
   $("po-qty")?.focus();
 }
});
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
 const isKg=products.find(p=>p.id===product)?.base_unit==="kg";
 const total=qty*units+(mixed?mixedQty*Number(mix?.units_per_scan||0):0);
 if(!first||(isKg?(mode!=="unit"||!Number.isFinite(qty)||qty<0.001||Math.abs(qty*1000-Math.round(qty*1000))>0.000001):!Number.isSafeInteger(qty)||qty<1)||qty>1000000||
   !Number.isSafeInteger(units)||units<1||mode==="unit"&&units!==1||
   mode==="carton"&&units<2||mixed&&(
      !mix||!Number.isSafeInteger(mixedQty)||mixedQty<1||mixedQty>1000000||
      first.unit_type!=="unit"||units!==1||Number(mix.units_per_scan)<2
   )||(!(isKg)&&!Number.isSafeInteger(total))||total<(isKg?0.001:1)||total>1000000||
   !["unit","carton","both"].includes(mode)||!["opening","purchase"].includes(reason)){
   msg("stock-msg","بڕ یان بارکۆدی کۆگا نادروستە","error");return;
 }
 const args=isKg?{p_store:store.id,p_barcode:code,p_kg:qty,p_reason:reason}:mixed?
   {p_store:store.id,p_lines:[
      {barcode:first.code,packages:qty,expected_units:1},
      {barcode:mix.code,packages:mixedQty,expected_units:Number(mix.units_per_scan)}
    ],p_reason:reason}:
   {p_store:store.id,p_barcode:code,p_packages:qty,p_expected_units:units,p_reason:reason};
 const fingerprint=JSON.stringify({rpc:isKg?"kg":mixed?"mixed":"single",...args});
 if(stockAttempt?.uncertain&&stockAttempt.fingerprint!==fingerprint){
   msg("stock-msg","ئەنجامی وەرگرتنی پێشوو دیار نییە؛ هەمان داواکاری دووبارە بکەرەوە","error");return;
 }
 if(!stockAttempt||stockAttempt.fingerprint!==fingerprint)
   stockAttempt={fingerprint,id:crypto.randomUUID(),uncertain:false};
 lock(true);msg("stock-msg");
 try{
   const {error}=await db.rpc(isKg?"retail_receive_weight_v19":mixed?"retail_receive_mixed_v171":"retail_receive_packs_v17",
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
$("settings-subtabs")?.addEventListener("click",e=>{
 const btn=e.target.closest("[data-set-sub]");
 if(btn&&!busy)selectSettingsSub(btn.dataset.setSub);
});
function resetStaffForm(){
 if($("staff-user-id")){$("staff-user-id").value="";$("staff-user-id").readOnly=false;}
 if($("staff-full-name"))$("staff-full-name").value="";
 if($("staff-job-title"))$("staff-job-title").value="کاشێری سەرەکی";
 if($("staff-phone"))$("staff-phone").value="";
 if($("staff-email"))$("staff-email").value="";
 if($("staff-role"))$("staff-role").value="cashier";
 if($("staff-active"))$("staff-active").value="true";
 if($("staff-pin"))$("staff-pin").value="";
 if($("staff-note"))$("staff-note").value="";
 if($("staff-form-title"))$("staff-form-title").textContent="زیادکردن و پێدانی ڕۆڵ بە کارمەند / بەکارهێنەر";
 if($("staff-submit-btn"))$("staff-submit-btn").textContent="پاشەکەوتکردن";
 if($("staff-cancel-edit"))$("staff-cancel-edit").hidden=true;
}
$("staff-gen-uuid")?.addEventListener("click",()=>{
 if(busy)return;
 if($("staff-user-id")){
   $("staff-user-id").value=crypto.randomUUID();
   $("staff-full-name")?.focus();
 }
});
$("staff-cancel-edit")?.addEventListener("click",resetStaffForm);
$("staff-search")?.addEventListener("input",renderStaffUsersDirectory);
$("staff-role-filter")?.addEventListener("change",renderStaffUsersDirectory);
$("staff-refresh")?.addEventListener("click",()=>{if(!busy)void refreshStaff();});
$("staff-export-csv")?.addEventListener("click",()=>{
 const rows=buildUnifiedStaffRows().map(r=>[
   r.full_name||"",r.job_title||"",r.phone||"",r.email||"",r.user_id,r.role==="owner"?"خاوەنکار":r.role==="manager"?"بەڕێوەبەر":"کاشێر",r.active?"چالاک":"ناچالاک",r.note||""
 ]);
 exportOperationsCsv("staff_users_directory_"+new Date().toISOString().slice(0,10)+".csv",
   ["ناوی کارمەند","پیشە","مۆبایل","ئیمەیڵ","ناسنامەی UUID","ڕۆڵ","دۆخ","تێبینی"],rows);
});
$("staff-list")?.addEventListener("click",async e=>{
 if(busy||role!=="owner")return;
 const swBtn=e.target.closest("[data-staff-switch-user]");
 if(swBtn){
   const uid=swBtn.dataset.staffSwitchUser;
   await switchActiveUser(uid);
   return;
 }
 const editBtn=e.target.closest("[data-staff-edit]");
 if(editBtn){
   const uid=editBtn.dataset.staffEdit;
   const r=buildUnifiedStaffRows().find(x=>x.user_id===uid);
   if(!r)return;
   if($("staff-user-id"))$("staff-user-id").value=r.user_id;
   if($("staff-full-name"))$("staff-full-name").value=r.full_name||"";
   if($("staff-job-title")&&[...$("staff-job-title").options].some(o=>o.value===r.job_title))$("staff-job-title").value=r.job_title;
   if($("staff-phone"))$("staff-phone").value=r.phone==="—"?"":r.phone;
   if($("staff-email"))$("staff-email").value=r.email==="—"?"":r.email;
   if($("staff-role")&&r.role!=="owner")$("staff-role").value=r.role;
   if($("staff-active"))$("staff-active").value=r.active?"true":"false";
   if($("staff-pin"))$("staff-pin").value=r.pin_code==="—"?"":r.pin_code;
   if($("staff-note"))$("staff-note").value=r.note||"";
   if($("staff-form-title"))$("staff-form-title").textContent="دەستکاریکردنی کارمەند: "+r.full_name;
   if($("staff-submit-btn"))$("staff-submit-btn").textContent="نوێکردنەوەی زانیاری کارمەند";
   if($("staff-cancel-edit"))$("staff-cancel-edit").hidden=false;
   $("staff-full-name")?.focus();
   return;
 }
 const togBtn=e.target.closest("[data-staff-toggle-active]");
 if(togBtn){
   const uid=togBtn.dataset.staffToggleActive;
   const r=buildUnifiedStaffRows().find(x=>x.user_id===uid);
   if(!r||r.role==="owner")return;
   const nextActive=!r.active;
   lock(true);msg("staff-msg","");
   try{
     const {error}=await db.rpc("retail_assign_staff",{
       p_store:store.id,p_user:uid,p_role:r.role,p_active:nextActive
     });
     if(error)throw error;
     const prof=staffProfilesMap.get(uid)||{user_id:uid,full_name:r.full_name,job_title:r.job_title,phone:r.phone,email:r.email,role:r.role};
     prof.active=nextActive;
     staffProfilesMap.set(uid,prof);
     saveLocalSettingsAndProfiles();
     await refreshStaff();
     msg("staff-msg","دۆخی کارمەند «"+r.full_name+"» کرا بە "+(nextActive?"چالاک":"ناچالاک"),"success");
   }catch(err){
     msg("staff-msg",safe(err),"error");
   }finally{
     lock(false);
   }
 }
});
$("quick-switch-user")?.addEventListener("click",async()=>{
 if(!db||busy)return;
 const staffRows=buildUnifiedStaffRows().filter(x=>x.active);
 const otherUsers=staffRows.filter(x=>x.user_id!==user?.id);
 if(!otherUsers.length){
   alert("هیچ بەکارهێنەرێکی تری چالاک لە سیستەمدا نەدۆزرایەوە.");
   return;
 }
 if(role!=="owner"){
   const owner=staffRows.find(x=>x.role==="owner");
   if(owner){await switchActiveUser(owner.user_id);return;}
 }
 const firstCashier=otherUsers.find(x=>x.role==="cashier")||otherUsers[0];
 if(firstCashier){await switchActiveUser(firstCashier.user_id);}
});
$("staff-form").addEventListener("submit",async e=>{
 e.preventDefault();if(role!=="owner"||busy||!store)return;
 const f=new FormData(e.target),id=String(f.get("user")||"").trim();
 if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)){
   msg("staff-msg","ناسنامەی کارمەند نادروستە","error");return
 }
 const fullName=String($("staff-full-name")?.value||"").trim()||("کارمەند #"+id.slice(0,8));
 const jobTitle=String($("staff-job-title")?.value||"کاشێری سەرەکی").trim();
 const phone=String($("staff-phone")?.value||"").trim();
 const email=String($("staff-email")?.value||"").trim();
 const assignedRole=String(f.get("role")||"cashier");
 const isActive=String(f.get("active"))==="true";
 const pinCode=String($("staff-pin")?.value||"").trim();
 const note=String($("staff-note")?.value||"").trim();
 lock(true);msg("staff-msg");
 try{
   if(id!==store.owner_user_id){
     const {error}=await db.rpc("retail_assign_staff",{
       p_store:store.id,p_user:id,p_role:assignedRole,p_active:isActive
     });if(error)throw error;
   }
   const profileObj={
     store_id:store.id,
     user_id:id,
     full_name:fullName,
     job_title:jobTitle,
     phone:phone||"—",
     email:email||"—",
     role:id===store.owner_user_id?"owner":assignedRole,
     active:id===store.owner_user_id?true:isActive,

     note,
     updated_at:new Date().toISOString()
   };
   staffProfilesMap.set(id,profileObj);
   saveLocalSettingsAndProfiles();
   if(db){
     try{
       await db.from("retail_staff_profiles").upsert({
         store_id:store.id,user_id:id,full_name:fullName,job_title:jobTitle,
         phone:phone||null,email:email||null,role:profileObj.role,active:profileObj.active,
         note:note||null,actor_id:user?.id||null,updated_at:profileObj.updated_at
       },{onConflict:"store_id,user_id"});
     }catch(_e){}
   }
   resetStaffForm();
   await refreshStaff();msg("staff-msg","مۆڵەت و پڕۆفایلی کارمەند «"+fullName+"» بە سەرکەوتوویی نوێکرایەوە","success");
 }catch(err){msg("staff-msg",safe(err),"error")}
 finally{lock(false)}
});
$("set-permissions-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(busy||role!=="owner")return;
 const patch={
   permCashierDiscount:String($("perm-cashier-discount")?.value||"allowed"),
   permCashierMaxDisc:Math.max(0,Math.round(Number($("perm-cashier-max-disc")?.value||0))),
   permCashierCreditSale:String($("perm-cashier-credit-sale")?.value||"allowed"),
   permCashierRefund:String($("perm-cashier-refund")?.value||"allowed"),
   permCashierCashout:String($("perm-cashier-cashout")?.value||"allowed"),
   permManagerStock:String($("perm-manager-stock")?.value||"manager_and_owner"),
   permManagerProfit:String($("perm-manager-profit")?.value||"manager_and_owner"),
   permManagerSafeExpense:String($("perm-manager-safe-expense")?.value||"manager_and_owner")
 };
 lock(true);msg("set-perm-msg","");
 try{
   await persistStoreSettingsToServer(patch);
   renderSettingsPermissionsView();
   msg("set-perm-msg","سیاسەتی دەسەڵاتەکان و سنووری ڕۆڵەکان بە سەرکەوتوویی پاشەکەوتکرا","success");
 }catch(err){
   msg("set-perm-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("perm-reset-defaults")?.addEventListener("click",async()=>{
 if(busy||role!=="owner")return;
 const defaults={
   permCashierDiscount:"allowed",
   permCashierMaxDisc:25000,
   permCashierCreditSale:"allowed",
   permCashierRefund:"allowed",
   permCashierCashout:"allowed",
   permManagerStock:"manager_and_owner",
   permManagerProfit:"manager_and_owner",
   permManagerSafeExpense:"manager_and_owner"
 };
 await persistStoreSettingsToServer(defaults);
 renderSettingsPermissionsView();
 msg("set-perm-msg","دەسەڵاتەکان گەڕێندرایەوە سەر دۆخی ستاندارد","success");
});
$("perm-export-csv")?.addEventListener("click",()=>{
 const s={...defaultStoreSettings(),...storeSettings};
 const rows=[
   ["پێدانی داشکاندنی کاشێر",s.permCashierDiscount==="allowed"?"ڕێگەپێدراو تا "+s.permCashierMaxDisc+" IQD":"قەدەغە"],
   ["فرۆشتن بە قەرز لە کاشێرەوە",s.permCashierCreditSale],
   ["گەڕاندنەوەی پسووڵە",s.permCashierRefund],
   ["دەرکردنی پارە لە شێفت",s.permCashierCashout],
   ["دەستکاریکردنی کۆگا",s.permManagerStock],
   ["بینینی ڕاپۆرتی قازانج",s.permManagerProfit],
   ["خەرجی لە قاسەی سەرەکی",s.permManagerSafeExpense]
 ];
 exportOperationsCsv("role_permissions_policy_"+new Date().toISOString().slice(0,10)+".csv",
   ["دەسەڵات / تایبەتمەندی","بڕیاری سیاسەت"],rows);
});
$("set-devices-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(busy)return;
 const paperWidth=String($("dev-paper-width")?.value||"80");
 const autoPrint=String($("dev-auto-print")?.value||"0");
 const printCopies=String($("dev-print-copies")?.value||"1");
 const soundOn=$("dev-scan-sound")?.value!=="0";
 const scanDelayMs=Math.max(50,Math.round(Number($("dev-scan-delay")?.value||160)));
 const scaleDefaultGrams=Math.max(50,Math.round(Number($("dev-scale-default-grams")?.value||1000)));
 scanSoundEnabled=soundOn;
 localStorage.setItem("retail_scan_sound",soundOn?"1":"0");
 localStorage.setItem("retail_diagnostic_paper_width",paperWidth);
 localStorage.setItem("retail_auto_print",autoPrint);
 localStorage.setItem("retail_print_copies",printCopies);
 localStorage.setItem("retail_scan_delay_ms",String(scanDelayMs));
 localStorage.setItem("retail_scale_default_grams",String(scaleDefaultGrams));
 syncSoundToggleBtn();
 await persistStoreSettingsToServer({paperWidth,autoPrint,printCopies,scanDelayMs,scaleDefaultGrams});
 renderSettingsDevicesView();
 msg("set-dev-msg","ڕێکخستنی چاپکەر ("+paperWidth+"mm)، بارکۆد سکانەر و تەرازوو پاشەکەوتکرا","success");
});
$("dev-test-beep-btn")?.addEventListener("click",()=>{
 const prev=scanSoundEnabled;
 scanSoundEnabled=true;
 playScanBeep(true);
 scanSoundEnabled=prev;
 msg("set-dev-msg","دەنگی تاقیکردنەوەی سکانەر لێدرا (880Hz Beep)","success");
});
$("dev-test-print-btn")?.addEventListener("click",()=>{
 window.print();
});
$("dev-live-scan-input")?.addEventListener("input",renderDeviceLiveScanInspector);
$("dev-sample-scale-btn")?.addEventListener("click",()=>{
 if($("dev-live-scan-input")){
   $("dev-live-scan-input").value="2700002029709";
   renderDeviceLiveScanInspector();
 }
});
$("dev-clear-scan-btn")?.addEventListener("click",()=>{
 if($("dev-live-scan-input")){
   $("dev-live-scan-input").value="";
   renderDeviceLiveScanInspector();
   $("dev-live-scan-input").focus();
 }
});
$("set-system-form")?.addEventListener("submit",async e=>{
 e.preventDefault();
 if(busy||role!=="owner")return;
 const storeName=String($("sys-store-name")?.value||"").trim()||"سوپەرمارکێتی کانی چنار";
 const storePhone=String($("sys-store-phone")?.value||"").trim();
 const storeAddress=String($("sys-store-address")?.value||"").trim();
 const usdRate=Math.max(100000,Math.round(Number($("sys-usd-rate")?.value||152000)));
 const lowThreshold=Math.max(1,Math.round(Number($("sys-low-threshold")?.value||5)));
 const lowTarget=Math.max(lowThreshold+1,Math.round(Number($("sys-low-target")?.value||25)));
 const debtDays=Math.max(1,Math.round(Number($("sys-debt-days")?.value||30)));
 const receiptFooter=String($("sys-receipt-footer")?.value||"").trim();

 lock(true);msg("set-sys-msg","");
 try{
   localStorage.setItem("retail_store_phone",storePhone);
   localStorage.setItem("retail_store_address",storeAddress);
   localStorage.setItem("retail_usd_rate",String(usdRate));
   localStorage.setItem("retail_low_threshold",String(lowThreshold));
   localStorage.setItem("retail_low_target",String(lowTarget));
   localStorage.setItem("retail_debt_days",String(debtDays));
   localStorage.setItem("retail_receipt_footer",receiptFooter);
   if(db&&store&&storeName!==store.name){
     try{
       await db.from("retail_stores").update({name:storeName}).eq("id",store.id);
       store.name=storeName;
     }catch(_e){}
   }
   await persistStoreSettingsToServer({
     storeName,storePhone,storeAddress,usdRate,lowThreshold,lowTarget,debtDays,receiptFooter
   });
   renderSettingsSystemView();
   msg("set-sys-msg","ڕێکخستنەکانی فرۆشگا و سیستەم بە سەرکەوتوویی پاشەکەوتکران و لە هەموو بەشەکان جێبەجێ کران","success");
 }catch(err){
   msg("set-sys-msg",safe(err),"error");
 }finally{
   lock(false);
 }
});
$("sys-backup-json-btn")?.addEventListener("click",()=>{
 const backupPayload={
   exported_at:new Date().toISOString(),
   store:{id:store?.id,name:storeSettings.storeName||store?.name,currency:store?.currency||"IQD"},
   settings:storeSettings,
   staff_profiles:[...staffProfilesMap.values()].map(({pin_code,...profile})=>profile),
   products,
   barcodes,
   stock_balances:[...balances.entries()].map(([product_id,quantity])=>({product_id,quantity})),
   stock_expiries:stockExpiries,
   customers:customersList,
   customer_ledger:customerLedgerList,
   suppliers:suppliersList,
   purchase_orders:purchaseOrdersList,
   supplier_ledger:supplierLedgerList,
   finance_entries:financeEntriesList,
   receipts_summary:allReceipts
 };
 const blob=new Blob([JSON.stringify(backupPayload,null,2)],{type:"application/json;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;
 a.download="kani_chnar_loaded_snapshot_"+new Date().toISOString().slice(0,10)+".json";
 document.body.append(a);
 a.click();
 a.remove();
 URL.revokeObjectURL(url);
 msg("set-sys-msg","داتای بارکراوی ئەم پەڕەیە هەناردە کرا؛ ئەمە پاشەکەوتی تەواوی داتابەیس نییە","success");
});

$("sys-restore-json-input")?.addEventListener("change",async e=>{
  if(window.RETAIL_DEMO_MODE!==true)return;
  const file=e.target.files?.[0];
  if(!file)return;
  try{
    const text=await file.text();
    const data=JSON.parse(text);
    if(!data||(!data.products&&!data.customers&&!data.settings)){
      msg("set-sys-msg","فایلەکە پاشەکەوتی دروستی سوپەرمارکێت نییە","error");
      return;
    }
    if(Array.isArray(data.products)&&data.products.length)products=data.products;
    if(Array.isArray(data.barcodes)&&data.barcodes.length)barcodes=data.barcodes;
    if(Array.isArray(data.stock_balances)&&data.stock_balances.length)balances=data.stock_balances;
    if(Array.isArray(data.stock_expiries)&&data.stock_expiries.length){stockExpiries=data.stock_expiries;saveLocalStockExpiries(stockExpiries);}
    if(Array.isArray(data.customers)&&data.customers.length){customersList=data.customers;saveLocalCustomers(customersList);populateCustomerSelectors();}
    if(Array.isArray(data.customer_ledger)&&data.customer_ledger.length){customerLedgerList=data.customer_ledger;saveLocalCustomerLedger(customerLedgerList);}
    if(Array.isArray(data.suppliers)&&data.suppliers.length){suppliersList=data.suppliers;saveLocalSuppliers(suppliersList);}
    if(Array.isArray(data.purchase_orders)&&data.purchase_orders.length){purchaseOrdersList=data.purchase_orders;saveLocalPurchaseOrders(purchaseOrdersList);}
    if(Array.isArray(data.supplier_ledger)&&data.supplier_ledger.length){supplierLedgerList=data.supplier_ledger;saveLocalSupplierLedger(supplierLedgerList);}
    if(Array.isArray(data.finance_entries)&&data.finance_entries.length){financeEntriesList=data.finance_entries;saveLocalFinanceEntries(financeEntriesList);}
    if(data.settings&&typeof data.settings==="object"){
      storeSettings={...storeSettings,...data.settings};
      await saveLocalSettingsAndProfiles();
      applyStoreSettingsToRuntime();
      renderSettingsSystemView();
    }
    window.RetailOfflineSync?.importBackupSnapshot?.(data);
    renderOpsCatalogList();
    renderStock();
    msg("set-sys-msg","زانیارییەکان بە سەرکەوتوویی لە پاشەکەوتەکە هێنرانەوە و لەسەر دیسکی ناوخۆ جێگیر کران","success");
  }catch(err){
    msg("set-sys-msg","هەڵە لە فایلی پاشەکەوت: "+safe(err),"error");
  }finally{
    e.target.value="";
  }
});

// Direct Web-Serial Electronic Scale Protocol (RS-232 / USB)
async function connectSerialScale(){
  if(!navigator.serial){
    msg("scan-msg","وێبگەڕەکەت پشتگیری Web Serial ناکات یان تەرازووی USB پێوە نییە؛ دەتوانی کێش بە دەست بنووسیت","warn");
    $("cash-scale-grams")?.focus();
    return;
  }
  try{
    msg("scan-msg","پەیوەستکردنی تەرازوو... پۆرتەکەی هەڵبژێرە","info");
    const port=await navigator.serial.requestPort();
    await port.open({baudRate:9600,dataBits:8,stopBits:1,parity:"none"});
    const reader=port.readable.getReader();
    msg("scan-msg","تەرازوو بەسترا — کاڵاکە بخەرە سەر تەرازوو","success");
    let buffer="";
    const decoder=new TextDecoder();
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      const lines=buffer.split(/[\r\n]+/);
      buffer=lines.pop();
      for(const line of lines){
        const match=line.match(/([0-9]+\.?[0-9]*)\s*(?:kg|g)?/i);
        if(match){
          let val=parseFloat(match[1]);
          if(val>0){
            const grams=val<50?Math.round(val*1000):Math.round(val);
            if($("cash-scale-grams"))$("cash-scale-grams").value=String(grams);
            msg("scan-msg","کێش لە تەرازووەوە وەرگیرا: "+grams+" گرام","success");
            playScanBeep(true);
            reader.releaseLock();
            await port.close();
            return;
          }
        }
      }
    }
  }catch(err){
    if(err.name!=="NotFoundError"){
      msg("scan-msg","هەڵە لە تەرازوو: "+safe(err),"error");
    }
  }
}
$("scale-serial-btn")?.addEventListener("click",connectSerialScale);

$("sys-export-summary-csv")?.addEventListener("click",()=>{
 const rows=[
   ["ناوی فرۆشگا",storeSettings.storeName||store?.name||""],
   ["نرخی ١٠٠ دۆلار (IQD)",storeSettings.usdRate||152000],
   ["ژمارەی کاڵاکان",products.length],
   ["ژمارەی بارکۆدەکان",barcodes.length],
   ["ژمارەی پسووڵەکان",allReceipts.length],
   ["ژمارەی کڕیاران",customersList.length],
   ["ژمارەی دابینکەران",suppliersList.length],
   ["تۆمارە داراییەکان",financeEntriesList.length]
 ];
 exportOperationsCsv("system_overview_"+new Date().toISOString().slice(0,10)+".csv",
   ["پێوەر / بەش","بەها / ژمارەی تۆمار"],rows);
});
$("sys-ping-server-btn")?.addEventListener("click",async()=>{
 if(busy||!db||!store)return;
 const t0=performance.now();
 try{
   const {error}=await db.from("retail_stores").select("id").eq("id",store.id).maybeSingle();
   if(error)throw error;
   lastServerPingMs=Math.max(1,Math.round(performance.now()-t0));
   renderSettingsSystemView();
   msg("set-sys-msg","پەیوەندیی سێرڤەری Supabase چالاکە — خێرایی وەڵامدانەوە: "+lastServerPingMs+"ms","success");
 }catch(err){
   msg("set-sys-msg",safe(err),"error");
 }
});
$("sys-clear-cache-btn")?.addEventListener("click",async()=>{
 if(busy)return;
 prefixCache.clear();
 await loadInventory();
 renderSettingsSystemView();
 msg("set-sys-msg","کاشی گەڕان و کاتەلۆگ پاککرایەوە و نوێکرایەوە","success");
});

// --- Offers & Discounts Event Wiring ---
$("offers-subtabs")?.addEventListener("click",e=>{
  const btn=e.target.closest("[data-off-sub]");
  if(btn&&!busy)selectOffersSub(btn.dataset.offSub);
});

function resetOfferNewForm(){
  if($("off-edit-id"))$("off-edit-id").value="";
  if($("off-title"))$("off-title").value="";
  if($("off-type"))$("off-type").value="item_special";
  if($("off-product"))$("off-product").value="";
  if($("off-min-qty"))$("off-min-qty").value="1";
  if($("off-free-qty"))$("off-free-qty").value="0";
  if($("off-discount-iqd"))$("off-discount-iqd").value="0";
  if($("off-discount-pct"))$("off-discount-pct").value="0";
  if($("off-start-date"))$("off-start-date").value="";
  if($("off-end-date"))$("off-end-date").value="";
  if($("off-campaign-select"))$("off-campaign-select").value="";
  if($("off-note"))$("off-note").value="";
  if($("off-new-form-title"))$("off-new-form-title").textContent="دروستکردنی ئۆفەری نوێ (نرخی تایبەت، BOGO، پاکێجی کۆمەڵەیی، یان ئۆفەری سەبەتە)";
  if($("off-new-submit"))$("off-new-submit").textContent="تۆمارکردنی ئۆفەر";
  if($("off-new-cancel-edit"))$("off-new-cancel-edit").hidden=true;
}
$("off-new-cancel-edit")?.addEventListener("click",resetOfferNewForm);

$("offer-new-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!store||busy)return;
  const editId=String($("off-edit-id")?.value||"");
  const title=String($("off-title")?.value||"").trim();
  const offerType=String($("off-type")?.value||"item_special");
  const prodId=String($("off-product")?.value||"")||null;
  const minQty=Number($("off-min-qty")?.value||1);
  const freeQty=Number($("off-free-qty")?.value||0);
  const discIqd=Number($("off-discount-iqd")?.value||0);
  const discPct=Number($("off-discount-pct")?.value||0);
  const startDate=String($("off-start-date")?.value||"")||null;
  const endDate=String($("off-end-date")?.value||"")||null;
  const cmpId=String($("off-campaign-select")?.value||"")||null;
  const note=String($("off-note")?.value||"").trim();

  if(!title||minQty<0||discIqd<0||discPct<0||discPct>100){
    msg("off-new-msg","زانیاری ئۆفەر نادروستە","error");
    return;
  }
  lock(true);msg("off-new-msg","");
  try{
    const targetId=editId||crypto.randomUUID();
    const payload={
      id:targetId,
      store_id:store.id,
      title,
      offer_type:offerType,
      product_id:prodId,
      min_qty:minQty,
      free_qty:freeQty,
      discount_minor:discIqd,
      discount_pct:discPct,
      start_date:startDate,
      end_date:endDate,
      campaign_id:cmpId,
      note,
      active:true
    };
    if(!await confirmPromotion("retail_offers","upsert",payload,targetId,"off-new-msg"))return;
    const idx=offersList.findIndex(x=>x.id===targetId);
    if(idx>=0){
      offersList[idx]={...offersList[idx],...payload};
    }else{
      offersList.unshift({...payload,used_count:0,total_saved_minor:0,created_at:new Date().toISOString()});
    }
    saveLocalOffers(offersList);
    resetOfferNewForm();
    renderOffersNewView();
    msg("off-new-msg","ئۆفەری «"+title+"» بەسەرکەوتوویی پاشەکەوتکرا","success");
  }catch(err){
    msg("off-new-msg",safe(err),"error");
  }finally{
    lock(false);
  }
});

$("offers-new-list")?.addEventListener("click",async e=>{
  const toPosBtn=e.target.closest("[data-offer-to-pos]");
  if(toPosBtn){
    const offId=toPosBtn.dataset.offerToPos;
    const off=offersList.find(x=>x.id===offId);
    if(off){
      selectTab("cash");
      if(off.product_id){
        const b=barcodes.find(x=>x.product_id===off.product_id&&x.active!==false);
        if(b&&$("barcode")){$("barcode").value=b.code;focusScanner();}
      }
      evaluateAndApplyAutoPosOffers();
    }
    return;
  }
  const editBtn=e.target.closest("[data-offer-edit]");
  if(editBtn){
    const offId=editBtn.dataset.offerEdit;
    const off=offersList.find(x=>x.id===offId);
    if(!off)return;
    if($("off-edit-id"))$("off-edit-id").value=off.id;
    if($("off-title"))$("off-title").value=off.title;
    if($("off-type"))$("off-type").value=off.offer_type;
    if($("off-product"))$("off-product").value=off.product_id||"";
    if($("off-min-qty"))$("off-min-qty").value=off.min_qty;
    if($("off-free-qty"))$("off-free-qty").value=off.free_qty||0;
    if($("off-discount-iqd"))$("off-discount-iqd").value=off.discount_minor||0;
    if($("off-discount-pct"))$("off-discount-pct").value=off.discount_pct||0;
    if($("off-start-date"))$("off-start-date").value=off.start_date||"";
    if($("off-end-date"))$("off-end-date").value=off.end_date||"";
    if($("off-campaign-select"))$("off-campaign-select").value=off.campaign_id||"";
    if($("off-note"))$("off-note").value=off.note||"";
    if($("off-new-form-title"))$("off-new-form-title").textContent="دەستکاریکردنی ئۆفەر: "+off.title;
    if($("off-new-submit"))$("off-new-submit").textContent="نوێکردنەوەی ئۆفەر";
    if($("off-new-cancel-edit"))$("off-new-cancel-edit").hidden=false;
    $("off-title")?.focus();
    return;
  }
  const toggleBtn=e.target.closest("[data-offer-toggle]");
  if(toggleBtn){
    const offId=toggleBtn.dataset.offerToggle;
    const off=offersList.find(x=>x.id===offId);
    if(!off)return;
    const active=off.active===false;
    if(!await confirmPromotion("retail_offers","update",{active},off.id,"off-new-msg"))return;
    off.active=active;
    saveLocalOffers(offersList);
    renderOffersNewView();
    msg("off-new-msg","دۆخی ئۆفەری «"+off.title+"» گۆڕدرا بۆ "+(off.active?"چالاک":"ڕاگیراو"),"success");
    return;
  }
  const delBtn=e.target.closest("[data-offer-delete]");
  if(delBtn){
    const offId=delBtn.dataset.offerDelete;
    if(!await confirmPromotion("retail_offers","delete",null,offId,"off-new-msg"))return;
    offersList=offersList.filter(x=>x.id!==offId);
    saveLocalOffers(offersList);
    renderOffersNewView();
    msg("off-new-msg","ئۆفەر سڕایەوە","success");
    return;
  }
});

$("off-new-search")?.addEventListener("input",renderOffersNewView);
$("off-new-type-filter")?.addEventListener("change",renderOffersNewView);
$("off-new-status-filter")?.addEventListener("change",renderOffersNewView);
$("off-new-refresh")?.addEventListener("click",()=>{if(!busy)void refreshOffersSection("new");});
$("off-new-export-csv")?.addEventListener("click",()=>{
  const rows=offersList.map(o=>[
    o.title,o.offer_type,products.find(x=>x.id===o.product_id)?.name||"گشتی",o.min_qty,o.free_qty||0,
    o.discount_minor||0,o.discount_pct||0,o.start_date||"",o.end_date||"",o.used_count||0,o.total_saved_minor||0,o.active!==false?"چالاک":"ڕاگیراو",o.note||""
  ]);
  exportOperationsCsv("offers_list_"+new Date().toISOString().slice(0,10)+".csv",
    ["ناونیشان","جۆر","کاڵا","کەمترین بڕ","دانەی بێبەرامبەر","داشکاندنی IQD","داشکاندنی %","دەستپێک","کۆتایی","بەکارهێنان","کۆی پاشەکەوت","دۆخ","تێبینی"],rows);
});

function resetOfferDiscountForm(){
  if($("disc-edit-id"))$("disc-edit-id").value="";
  if($("disc-rule-name"))$("disc-rule-name").value="";
  if($("disc-rule-scope"))$("disc-rule-scope").value="basket_total";
  if($("disc-rule-product"))$("disc-rule-product").value="";
  if($("disc-rule-mode"))$("disc-rule-mode").value="percent";
  if($("disc-rule-value"))$("disc-rule-value").value="5";
  if($("disc-rule-min-basket"))$("disc-rule-min-basket").value="0";
  if($("disc-rule-max-cap"))$("disc-rule-max-cap").value="25000";
  if($("disc-rule-auto-pos"))$("disc-rule-auto-pos").value="yes";
  if($("disc-rule-note"))$("disc-rule-note").value="";
  if($("off-disc-form-title"))$("off-disc-form-title").textContent="١. زیادکردنی یاسای داشکاندنی خۆکار و ڕێژەیی (بۆ سەبەتە، کاڵا، کڕیاری VIP، یان کاڵای نزیک بەسەرچوون)";
  if($("disc-rule-submit"))$("disc-rule-submit").textContent="پاشەکەوتکردنی یاسا";
  if($("off-disc-cancel-edit"))$("off-disc-cancel-edit").hidden=true;
}
$("off-disc-cancel-edit")?.addEventListener("click",resetOfferDiscountForm);

$("offer-discount-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!store||busy)return;
  const editId=String($("disc-edit-id")?.value||"");
  const name=String($("disc-rule-name")?.value||"").trim();
  const scope=String($("disc-rule-scope")?.value||"basket_total");
  const prodId=String($("disc-rule-product")?.value||"")||null;
  const mode=String($("disc-rule-mode")?.value||"percent");
  const val=Number($("disc-rule-value")?.value||0);
  const minBasket=Number($("disc-rule-min-basket")?.value||0);
  const maxCap=Number($("disc-rule-max-cap")?.value||0);
  const autoPos=$("disc-rule-auto-pos")?.value!=="no";
  const note=String($("disc-rule-note")?.value||"").trim();

  if(!name||val<=0){
    msg("off-disc-msg","ناوی یاسا و بەهای داشکاندن بنووسە","error");
    return;
  }
  lock(true);msg("off-disc-msg","");
  try{
    const targetId=editId||crypto.randomUUID();
    const payload={
      id:targetId,
      store_id:store.id,
      name,
      scope,
      product_id:prodId,
      mode,
      value:val,
      min_basket_minor:minBasket,
      max_cap_minor:maxCap,
      auto_pos:autoPos,
      note,
      active:true
    };
    if(!await confirmPromotion("retail_discount_rules","upsert",payload,targetId,"off-disc-msg"))return;
    const idx=discountRulesList.findIndex(x=>x.id===targetId);
    if(idx>=0){
      discountRulesList[idx]={...discountRulesList[idx],...payload};
    }else{
      discountRulesList.unshift({...payload,used_count:0,total_saved_minor:0,created_at:new Date().toISOString()});
    }
    saveLocalDiscountRules(discountRulesList);
    resetOfferDiscountForm();
    renderOffersDiscountsView();
    msg("off-disc-msg","یاسای داشکاندنی «"+name+"» بەسەرکەوتوویی پاشەکەوتکرا","success");
  }catch(err){
    msg("off-disc-msg",safe(err),"error");
  }finally{
    lock(false);
  }
});

$("disc-md-product")?.addEventListener("change",syncDirectMarkdownPreview);
$("disc-md-pct")?.addEventListener("input",syncDirectMarkdownPreview);

// V22: a direct sale-price markdown is a catalog change, never an unsynchronized
// retail_products UPDATE followed by per-barcode writes. V15 performs it atomically.
async function submitDirectMarkdown(e){
  e?.preventDefault();
  if(!store||!db||busy)return;
  if(role!=="owner"){
    msg("disc-md-msg","تەنها خاوەنی فرۆشگا دەتوانێت نرخ بگۆڕێت","error");
    return;
  }
  const prodId=String($("disc-md-product")?.value||"");
  const rawPrice=String($("disc-md-new-price")?.value??"").trim();
  const newPrice=Number(rawPrice);
  const p=products.find(x=>x.id===prodId);
  if(!p||!/^[0-9]{1,9}$/.test(rawPrice)||!Number.isSafeInteger(newPrice)||newPrice<1||newPrice>999999999){
    msg("disc-md-msg","کاڵا و نرخی نوێ نادروستە","error");
    return;
  }
  lock(true);msg("disc-md-msg","");
  let saved=false;
  try{
    const {data:snapshot,error:readError}=await db.rpc("retail_product_snapshot_v19",{
      p_store_id:store.id,p_product_id:prodId
    });
    if(readError)throw readError;
    if(!snapshot||!Number.isSafeInteger(Number(snapshot.version))||
       !["unit","both"].includes(snapshot.sale_mode)||
       !["unit","kg"].includes(snapshot.base_unit)||
       typeof snapshot.unit_barcode!=="string"||!snapshot.unit_barcode){
      throw new Error("نرخی ئەم کاڵایە لەم فۆرمەدا ناگۆڕدرێت؛ بەشی کاڵاکان بەکاربهێنە");
    }
    const oldPrice=Number(snapshot.unit_sale_price_iqd);
    if(!Number.isSafeInteger(oldPrice)||oldPrice!==Number(p.price_minor)){
      throw new Error("نرخی کاڵا لە سێرڤەر گۆڕاوە؛ سەرەتا لیستی کاڵاکان نوێ بکەرەوە");
    }
    if(newPrice>=oldPrice){
      throw new Error("نرخی نوێ بۆ داشکاندن دەبێت لە نرخی ئێستا کەمتر بێت");
    }
    const catalog={
      name:snapshot.name,sku:snapshot.sku??null,plu:snapshot.plu??null,
      sale_mode:snapshot.sale_mode,currency:"IQD",unit_barcode:snapshot.unit_barcode,
      unit_alias_barcodes:snapshot.unit_alias_barcodes||[],
      unit_sale_price_iqd:newPrice,
      unit_purchase_price_iqd:snapshot.unit_purchase_price_iqd??null,
      carton:snapshot.carton??null
    };
    const {error:saveError}=await db.rpc("retail_update_product_v15",{
      p_store_id:store.id,p_product_id:prodId,
      p_expected_version:Number(snapshot.version),p_catalog:catalog
    });
    if(saveError)throw saveError;
    saved=true;
    // The server owns prices and barcode definitions. Refresh only after commit.
    await loadInventory();
    syncDirectMarkdownPreview();
    renderOffersDiscountsView();
    msg("disc-md-msg","نرخی «"+p.name+"» لە "+money(oldPrice)+" کەمکرایەوە بۆ "+money(newPrice),"success");
  }catch(err){
    msg("disc-md-msg",saved?
      "نرخ لە سێرڤەر پاشەکەوت کرا، بەڵام نوێکردنەوەی لیست شکست هێنا؛ Refresh بکە":
      err?.code==="40001"?
        "نرخی کاڵا لەلایەن بەکارهێنەرێکی تر گۆڕاوە؛ لیستی کاڵاکان نوێ بکەرەوە":
        safe(err),"error");
  }finally{
    lock(false);
  }
}
$("disc-direct-markdown-form")?.addEventListener("submit",submitDirectMarkdown);

$("offers-discounts-list")?.addEventListener("click",async e=>{
  const toPosBtn=e.target.closest("[data-disc-rule-to-pos]");
  if(toPosBtn){
    const rId=toPosBtn.dataset.discRuleToPos;
    const rule=discountRulesList.find(x=>x.id===rId);
    if(rule){
      selectTab("cash");
      const subtotal=cartSubtotal();
      const customerId=String($("checkout-customer")?.value||"");
      const saving=calculateDiscountRuleSavingForCart(rule,cart,subtotal,customerId);
      if(saving>0){
        if($("discount"))$("discount").value=String(saving);
        activePosPromo={kind:"rule",id:rule.id,title:rule.name,amount:saving};
        renderCart();
        updatePosPromoBanner("یاسای داشکاندنی «"+rule.name+"» جێبەجێکرا: −"+money(saving),true);
      }else{
        updatePosPromoBanner("مەرجەکانی یاسای «"+rule.name+"» تەواو نییە بۆ سەبەتە",false);
      }
    }
    return;
  }
  const editBtn=e.target.closest("[data-disc-rule-edit]");
  if(editBtn){
    const rId=editBtn.dataset.discRuleEdit;
    const rule=discountRulesList.find(x=>x.id===rId);
    if(!rule)return;
    if($("disc-edit-id"))$("disc-edit-id").value=rule.id;
    if($("disc-rule-name"))$("disc-rule-name").value=rule.name;
    if($("disc-rule-scope"))$("disc-rule-scope").value=rule.scope||"basket_total";
    if($("disc-rule-product"))$("disc-rule-product").value=rule.product_id||"";
    if($("disc-rule-mode"))$("disc-rule-mode").value=rule.mode||"percent";
    if($("disc-rule-value"))$("disc-rule-value").value=rule.value;
    if($("disc-rule-min-basket"))$("disc-rule-min-basket").value=rule.min_basket_minor||0;
    if($("disc-rule-max-cap"))$("disc-rule-max-cap").value=rule.max_cap_minor||0;
    if($("disc-rule-auto-pos"))$("disc-rule-auto-pos").value=rule.auto_pos!==false?"yes":"no";
    if($("disc-rule-note"))$("disc-rule-note").value=rule.note||"";
    if($("off-disc-form-title"))$("off-disc-form-title").textContent="دەستکاریکردنی یاسای داشکاندن: "+rule.name;
    if($("disc-rule-submit"))$("disc-rule-submit").textContent="نوێکردنەوەی یاسا";
    if($("off-disc-cancel-edit"))$("off-disc-cancel-edit").hidden=false;
    $("disc-rule-name")?.focus();
    return;
  }
  const toggleBtn=e.target.closest("[data-disc-rule-toggle]");
  if(toggleBtn){
    const rId=toggleBtn.dataset.discRuleToggle;
    const rule=discountRulesList.find(x=>x.id===rId);
    if(!rule)return;
    const nextActive=rule.active===false;
    if(!await confirmPromotion("retail_discount_rules","update",{active:nextActive},rule.id,"off-disc-msg"))return;
    rule.active=nextActive;
    saveLocalDiscountRules(discountRulesList);
    renderOffersDiscountsView();
    msg("off-disc-msg","دۆخی یاسای «"+rule.name+"» نوێکرایەوە","success");
    return;
  }
  const delBtn=e.target.closest("[data-disc-rule-delete]");
  if(delBtn){
    const rId=delBtn.dataset.discRuleDelete;
    if(!await confirmPromotion("retail_discount_rules","delete",null,rId,"off-disc-msg"))return;
    discountRulesList=discountRulesList.filter(x=>x.id!==rId);
    saveLocalDiscountRules(discountRulesList);
    renderOffersDiscountsView();
    msg("off-disc-msg","یاسای داشکاندن سڕایەوە","success");
    return;
  }
});

$("off-disc-search")?.addEventListener("input",renderOffersDiscountsView);
$("off-disc-refresh")?.addEventListener("click",()=>{if(!busy)void refreshOffersSection("discounts");});
$("off-disc-export-csv")?.addEventListener("click",()=>{
  const rows=discountRulesList.map(r=>[
    r.name,r.scope,products.find(x=>x.id===r.product_id)?.name||"هەموو",r.mode,r.value,r.min_basket_minor||0,r.max_cap_minor||0,r.auto_pos!==false?"بەڵێ":"نەخێر",r.active!==false?"چالاک":"ڕاگیراو",r.note||""
  ]);
  exportOperationsCsv("discount_rules_"+new Date().toISOString().slice(0,10)+".csv",
    ["ناوی یاسا","بازنە","کاڵا","جۆر","بەها","کەمترین سەبەتە","زۆرترین سەقف","خۆکار لە کاشێر","دۆخ","تێبینی"],rows);
});

function resetOfferCouponForm(){
  if($("cpn-edit-id"))$("cpn-edit-id").value="";
  if($("cpn-code"))$("cpn-code").value="";
  if($("cpn-title"))$("cpn-title").value="";
  if($("cpn-kind"))$("cpn-kind").value="fixed_iqd";
  if($("cpn-value"))$("cpn-value").value="5000";
  if($("cpn-min-spend"))$("cpn-min-spend").value="15000";
  if($("cpn-max-discount"))$("cpn-max-discount").value="25000";
  if($("cpn-max-uses"))$("cpn-max-uses").value="50";
  if($("cpn-expiry-date"))$("cpn-expiry-date").value="";
  if($("cpn-customer"))$("cpn-customer").value="";
  if($("cpn-campaign-select"))$("cpn-campaign-select").value="";
  if($("off-cpn-form-title"))$("off-cpn-form-title").textContent="دروستکردن و بەڕێوەبردنی کۆدی کوپۆن (Promo & Voucher Codes)";
  if($("cpn-submit"))$("cpn-submit").textContent="پاشەکەوتکردنی کوپۆن";
  if($("off-cpn-cancel-edit"))$("off-cpn-cancel-edit").hidden=true;
}
$("off-cpn-cancel-edit")?.addEventListener("click",resetOfferCouponForm);

$("cpn-generate-random")?.addEventListener("click",()=>{
  const prefix=["KANI","GIFT","SALE","VIP","SUPER"][Math.floor(Math.random()*5)];
  const num=Math.floor(100+Math.random()*900);
  if($("cpn-code"))$("cpn-code").value=prefix+num;
  if($("cpn-title")&&!$("cpn-title").value)$("cpn-title").value="کوپۆنی داشکاندنی "+prefix+num;
});

$("offer-coupon-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!store||busy)return;
  const editId=String($("cpn-edit-id")?.value||"");
  const code=String($("cpn-code")?.value||"").trim().toUpperCase();
  const title=String($("cpn-title")?.value||"").trim();
  const kind=String($("cpn-kind")?.value||"fixed_iqd");
  const val=Number($("cpn-value")?.value||0);
  const minSpend=Number($("cpn-min-spend")?.value||0);
  const maxDisc=Number($("cpn-max-discount")?.value||0);
  const maxUses=Number($("cpn-max-uses")?.value||0);
  const expDate=String($("cpn-expiry-date")?.value||"")||null;
  const custId=String($("cpn-customer")?.value||"")||null;
  const cmpId=String($("cpn-campaign-select")?.value||"")||null;

  if(!code||!title||val<=0){
    msg("off-cpn-msg","کۆدی کوپۆن و بەهای داشکاندن بنووسە","error");
    return;
  }
  lock(true);msg("off-cpn-msg","");
  try{
    const targetId=editId||crypto.randomUUID();
    const payload={
      id:targetId,
      store_id:store.id,
      code,
      title,
      kind,
      value:val,
      min_spend_minor:minSpend,
      max_discount_minor:maxDisc,
      max_uses:maxUses,
      expiry_date:expDate,
      customer_id:custId,
      campaign_id:cmpId,
      active:true
    };
    if(!await confirmPromotion("retail_coupons","upsert",payload,targetId,"off-cpn-msg"))return;
    const idx=couponsList.findIndex(x=>x.id===targetId);
    if(idx>=0){
      couponsList[idx]={...couponsList[idx],...payload};
    }else{
      couponsList.unshift({...payload,used_count:0,total_saved_minor:0,created_at:new Date().toISOString()});
    }
    saveLocalCoupons(couponsList);
    resetOfferCouponForm();
    renderOffersCouponsView();
    msg("off-cpn-msg","کۆدی کوپۆنی «"+code+"» بەسەرکەوتوویی پاشەکەوتکرا","success");
  }catch(err){
    msg("off-cpn-msg",safe(err),"error");
  }finally{
    lock(false);
  }
});

$("offers-coupons-list")?.addEventListener("click",async e=>{
  const toPosBtn=e.target.closest("[data-cpn-to-pos]");
  if(toPosBtn){
    const code=toPosBtn.dataset.cpnToPos;
    selectTab("cash");
    if($("pos-coupon-code"))$("pos-coupon-code").value=code;
    applyPosCouponCode(code);
    return;
  }
  const editBtn=e.target.closest("[data-cpn-edit]");
  if(editBtn){
    const cId=editBtn.dataset.cpnEdit;
    const cpn=couponsList.find(x=>x.id===cId);
    if(!cpn)return;
    if($("cpn-edit-id"))$("cpn-edit-id").value=cpn.id;
    if($("cpn-code"))$("cpn-code").value=cpn.code;
    if($("cpn-title"))$("cpn-title").value=cpn.title;
    if($("cpn-kind"))$("cpn-kind").value=cpn.kind||"fixed_iqd";
    if($("cpn-value"))$("cpn-value").value=cpn.value;
    if($("cpn-min-spend"))$("cpn-min-spend").value=cpn.min_spend_minor||0;
    if($("cpn-max-discount"))$("cpn-max-discount").value=cpn.max_discount_minor||0;
    if($("cpn-max-uses"))$("cpn-max-uses").value=cpn.max_uses||0;
    if($("cpn-expiry-date"))$("cpn-expiry-date").value=cpn.expiry_date||"";
    if($("cpn-customer"))$("cpn-customer").value=cpn.customer_id||"";
    if($("cpn-campaign-select"))$("cpn-campaign-select").value=cpn.campaign_id||"";
    if($("off-cpn-form-title"))$("off-cpn-form-title").textContent="دەستکاریکردنی کوپۆن: "+cpn.code;
    if($("cpn-submit"))$("cpn-submit").textContent="نوێکردنەوەی کوپۆن";
    if($("off-cpn-cancel-edit"))$("off-cpn-cancel-edit").hidden=false;
    $("cpn-code")?.focus();
    return;
  }
  const toggleBtn=e.target.closest("[data-cpn-toggle]");
  if(toggleBtn){
    const cId=toggleBtn.dataset.cpnToggle;
    const cpn=couponsList.find(x=>x.id===cId);
    if(!cpn)return;
    const nextActive=cpn.active===false;
    if(!await confirmPromotion("retail_coupons","update",{active:nextActive},cpn.id,"off-cpn-msg"))return;
    cpn.active=nextActive;
    saveLocalCoupons(couponsList);
    renderOffersCouponsView();
    msg("off-cpn-msg","دۆخی کوپۆنی «"+cpn.code+"» نوێکرایەوە","success");
    return;
  }
  const delBtn=e.target.closest("[data-cpn-delete]");
  if(delBtn){
    const cId=delBtn.dataset.cpnDelete;
    if(!await confirmPromotion("retail_coupons","delete",null,cId,"off-cpn-msg"))return;
    couponsList=couponsList.filter(x=>x.id!==cId);
    saveLocalCoupons(couponsList);
    renderOffersCouponsView();
    msg("off-cpn-msg","کوپۆن سڕایەوە","success");
    return;
  }
});

$("off-cpn-search")?.addEventListener("input",renderOffersCouponsView);
$("off-cpn-status-filter")?.addEventListener("change",renderOffersCouponsView);
$("off-cpn-refresh")?.addEventListener("click",()=>{if(!busy)void refreshOffersSection("coupons");});
$("off-cpn-export-csv")?.addEventListener("click",()=>{
  const rows=couponsList.map(c=>[
    c.code,c.title,c.kind,c.value,c.min_spend_minor||0,c.max_discount_minor||0,c.used_count||0,c.max_uses||0,c.total_saved_minor||0,c.expiry_date||"",c.active!==false?"چالاک":"ڕاگیراو"
  ]);
  exportOperationsCsv("coupons_directory_"+new Date().toISOString().slice(0,10)+".csv",
    ["کۆدی کوپۆن","ناونیشان","جۆر","بەها","کەمترین کڕین","زۆرترین داشکاندن","بەکارهاتوو","سەقفی بەکارهێنان","کۆی پاشەکەوت","بەسەرچوون","دۆخ"],rows);
});

function resetOfferCampaignForm(){
  if($("cmp-edit-id"))$("cmp-edit-id").value="";
  if($("cmp-name"))$("cmp-name").value="";
  if($("cmp-type"))$("cmp-type").value="seasonal";
  if($("cmp-start"))$("cmp-start").value="";
  if($("cmp-end"))$("cmp-end").value="";
  if($("cmp-budget"))$("cmp-budget").value="500000";
  if($("cmp-default-pct"))$("cmp-default-pct").value="5";
  if($("cmp-channel"))$("cmp-channel").value="ناو فرۆشگا و کاشێر";
  if($("cmp-slogan"))$("cmp-slogan").value="";
  if($("off-cmp-form-title"))$("off-cmp-form-title").textContent="پلاندانان و بەڕێوەبردنی کەمپەینی بازاڕگەری و وەرزی (Marketing Campaigns)";
  if($("cmp-submit"))$("cmp-submit").textContent="تۆمارکردنی کەمپەین";
  if($("off-cmp-cancel-edit"))$("off-cmp-cancel-edit").hidden=true;
}
$("off-cmp-cancel-edit")?.addEventListener("click",resetOfferCampaignForm);

$("offer-campaign-form")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!store||busy)return;
  const editId=String($("cmp-edit-id")?.value||"");
  const name=String($("cmp-name")?.value||"").trim();
  const campaignType=String($("cmp-type")?.value||"seasonal");
  const startDate=String($("cmp-start")?.value||"").trim();
  const endDate=String($("cmp-end")?.value||"").trim();
  const budget=Number($("cmp-budget")?.value||0);
  const defaultPct=Number($("cmp-default-pct")?.value||0);
  const channel=String($("cmp-channel")?.value||"ناو فرۆشگا و کاشێر");
  const slogan=String($("cmp-slogan")?.value||"").trim();

  if(!name||!startDate||!endDate){
    msg("off-cmp-msg","ناوی کەمپەین و بەرواری دەستپێک و کۆتایی بنووسە","error");
    return;
  }
  lock(true);msg("off-cmp-msg","");
  try{
    const targetId=editId||crypto.randomUUID();
    const payload={
      id:targetId,
      store_id:store.id,
      name,
      campaign_type:campaignType,
      start_date:startDate,
      end_date:endDate,
      budget_minor:budget,
      default_pct:defaultPct,
      channel,
      slogan,
      active:true
    };
    if(!await confirmPromotion("retail_campaigns","upsert",payload,targetId,"off-cmp-msg"))return;
    const idx=campaignsList.findIndex(x=>x.id===targetId);
    if(idx>=0){
      campaignsList[idx]={...campaignsList[idx],...payload};
    }else{
      campaignsList.unshift({...payload,created_at:new Date().toISOString()});
    }
    saveLocalCampaigns(campaignsList);
    resetOfferCampaignForm();
    populateOffersSelectors();
    renderOffersCampaignsView();
    msg("off-cmp-msg","کەمپەینی بازاڕگەری «"+name+"» بەسەرکەوتوویی پاشەکەوتکرا","success");
  }catch(err){
    msg("off-cmp-msg",safe(err),"error");
  }finally{
    lock(false);
  }
});

$("offers-campaigns-list")?.addEventListener("click",async e=>{
  const editBtn=e.target.closest("[data-cmp-edit]");
  if(editBtn){
    const cId=editBtn.dataset.cmpEdit;
    const cmp=campaignsList.find(x=>x.id===cId);
    if(!cmp)return;
    if($("cmp-edit-id"))$("cmp-edit-id").value=cmp.id;
    if($("cmp-name"))$("cmp-name").value=cmp.name;
    if($("cmp-type"))$("cmp-type").value=cmp.campaign_type||"seasonal";
    if($("cmp-start"))$("cmp-start").value=cmp.start_date||"";
    if($("cmp-end"))$("cmp-end").value=cmp.end_date||"";
    if($("cmp-budget"))$("cmp-budget").value=cmp.budget_minor||0;
    if($("cmp-default-pct"))$("cmp-default-pct").value=cmp.default_pct||0;
    if($("cmp-channel"))$("cmp-channel").value=cmp.channel||"ناو فرۆشگا و کاشێر";
    if($("cmp-slogan"))$("cmp-slogan").value=cmp.slogan||"";
    if($("off-cmp-form-title"))$("off-cmp-form-title").textContent="دەستکاریکردنی کەمپەین: "+cmp.name;
    if($("cmp-submit"))$("cmp-submit").textContent="نوێکردنەوەی کەمپەین";
    if($("off-cmp-cancel-edit"))$("off-cmp-cancel-edit").hidden=false;
    $("cmp-name")?.focus();
    return;
  }
  const toggleBtn=e.target.closest("[data-cmp-toggle]");
  if(toggleBtn){
    const cId=toggleBtn.dataset.cmpToggle;
    const cmp=campaignsList.find(x=>x.id===cId);
    if(!cmp)return;
    const nextActive=cmp.active===false;
    if(!await confirmPromotion("retail_campaigns","update",{active:nextActive},cmp.id,"off-cmp-msg"))return;
    cmp.active=nextActive;
    saveLocalCampaigns(campaignsList);
    renderOffersCampaignsView();
    msg("off-cmp-msg","دۆخی کەمپەینی «"+cmp.name+"» نوێکرایەوە","success");
    return;
  }
  const delBtn=e.target.closest("[data-cmp-delete]");
  if(delBtn){
    const cId=delBtn.dataset.cmpDelete;
    if(!await confirmPromotion("retail_campaigns","delete",null,cId,"off-cmp-msg"))return;
    campaignsList=campaignsList.filter(x=>x.id!==cId);
    saveLocalCampaigns(campaignsList);
    populateOffersSelectors();
    renderOffersCampaignsView();
    msg("off-cmp-msg","کەمپەین سڕایەوە","success");
    return;
  }
});

$("off-cmp-search")?.addEventListener("input",renderOffersCampaignsView);
$("off-cmp-refresh")?.addEventListener("click",()=>{if(!busy)void refreshOffersSection("campaigns");});
$("off-cmp-export-csv")?.addEventListener("click",()=>{
  const rows=campaignsList.map(c=>[
    c.name,c.campaign_type,c.channel||"",c.start_date||"",c.end_date||"",c.default_pct||0,c.budget_minor||0,c.active!==false?"چالاک":"ڕاگیراو",c.slogan||""
  ]);
  exportOperationsCsv("campaigns_list_"+new Date().toISOString().slice(0,10)+".csv",
    ["ناوی کەمپەین","جۆر","کەناڵ","دەستپێک","کۆتایی","داشکاندنی بنەڕەتی %","بودجە","دۆخ","دروشم"],rows);
});

// POS Checkout Quick Promo & Coupon Actions
$("pos-apply-coupon-btn")?.addEventListener("click",()=>{
  if(!busy)applyPosCouponCode();
});
$("pos-auto-offer-btn")?.addEventListener("click",()=>{
  if(!busy)evaluateAndApplyAutoPosOffers();
});
$("pos-coupon-code")?.addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    e.preventDefault();
    if(!busy)applyPosCouponCode();
  }
});

$("shift-refresh").addEventListener("click",()=>{if(!busy){msg("shift-msg","");void refreshShift();}});
for(const id of ["shift-status-filter","shift-date-filter"])$(id).addEventListener("change",()=>void refreshShiftHistory());
$("shift-prev").addEventListener("click",()=>{if(!busy&&!shiftHistoryLoading&&shiftOffset>=50){shiftOffset-=50;void refreshShiftHistory(false);}});
$("shift-next").addEventListener("click",()=>{if(!busy&&!shiftHistoryLoading&&shiftOffset+50<shiftTotal){shiftOffset+=50;void refreshShiftHistory(false);}});
$("shift-open-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!db||!store||busy||shiftSession||!shiftVerified)return;
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
window.RetailReportsV22.configure({getClient:()=>db,getStore:()=>store,safe,exportCsv:exportOperationsCsv});

// =========================================================================
// Card 10 (Labels & Printing), Card 11 (Shift & Staff), Card 12 (Audit & Approvals)
// =========================================================================
function shiftSubStoreKey(suffix){return "retail_shift_staff_"+(store?.id||"default")+"_"+suffix;}
function loadShiftStaffSubsectionsData(){
  const today=new Date().toISOString().slice(0,10);
  if($("att-date")&&!$("att-date").value)$("att-date").value=today;
  if($("wh-date")&&!$("wh-date").value)$("wh-date").value=today;
  try{
    attendanceList=JSON.parse(localStorage.getItem(shiftSubStoreKey("attendance"))||"[]");
    if(!Array.isArray(attendanceList))attendanceList=[];
  }catch(_e){attendanceList=[];}
  try{
    workHoursList=JSON.parse(localStorage.getItem(shiftSubStoreKey("workhours"))||"[]");
    if(!Array.isArray(workHoursList))workHoursList=[];
  }catch(_e){workHoursList=[];}
  try{
    evaluationsList=JSON.parse(localStorage.getItem(shiftSubStoreKey("evaluation"))||"[]");
    if(!Array.isArray(evaluationsList))evaluationsList=[];
  }catch(_e){evaluationsList=[];}
}
function saveShiftStaffSubsectionsData(){
  try{
    localStorage.setItem(shiftSubStoreKey("attendance"),JSON.stringify(attendanceList));
    localStorage.setItem(shiftSubStoreKey("workhours"),JSON.stringify(workHoursList));
    localStorage.setItem(shiftSubStoreKey("evaluation"),JSON.stringify(evaluationsList));
  }catch(_e){}
}
function renderShiftStaffSubsections(){
  renderAttendanceView();
  renderWorkHoursView();
  renderEvaluationView();
}
function renderAttendanceView(){
  const root=$("attendance-list");
  if(!root)return;
  const presentCount=attendanceList.filter(x=>x.status==="present").length;
  const lateCount=attendanceList.filter(x=>x.status==="late").length;
  const absentCount=attendanceList.filter(x=>x.status==="leave"||x.status==="absent").length;
  if($("att-kpi-present"))$("att-kpi-present").textContent=String(presentCount);
  if($("att-kpi-late"))$("att-kpi-late").textContent=String(lateCount);
  if($("att-kpi-absent"))$("att-kpi-absent").textContent=String(absentCount);
  if($("att-kpi-total"))$("att-kpi-total").textContent=String(attendanceList.length);
  const q=String($("att-search")?.value||"").trim().toLowerCase();
  const st=String($("att-status-filter")?.value||"all");
  const rows=attendanceList.filter(r=>{
    if(st!=="all"&&r.status!==st)return false;
    if(!q)return true;
    return String(r.name||"").toLowerCase().includes(q)||String(r.role||"").toLowerCase().includes(q)||String(r.note||"").toLowerCase().includes(q);
  });
  root.replaceChildren();
  if(!rows.length){
    const b=document.createElement("div");b.className="blank";b.textContent="هیچ تۆمارێکی ئامادەبوون نییە — لە فۆڕمی سەرەوە تۆماری نوێ زیاد بکە";root.append(b);return;
  }
  const tbl=document.createElement("table");
  tbl.innerHTML="<thead><tr><th>کارمەند</th><th>پلە</th><th>بەروار</th><th>هاتن</th><th>دەرچوون</th><th>دۆخ</th><th>تێبینی</th><th>کردار</th></tr></thead><tbody></tbody>";
  const statusMap={present:"ئامادەبوو ✅",late:"دواکەوتوو ⏰",leave:"مۆڵەت 📄",absent:"نەهاتوو ❌"};
  for(const r of rows){
    const tr=document.createElement("tr");
    for(const v of [r.name,r.role,r.date,r.checkIn||"—",r.checkOut||"—",statusMap[r.status]||r.status,r.note||"—"]){
      const td=document.createElement("td");td.textContent=v;tr.append(td);
    }
    const tdAct=document.createElement("td");
    const delBtn=document.createElement("button");
    delBtn.type="button";delBtn.className="return-btn";delBtn.textContent="سڕینەوە";
    delBtn.addEventListener("click",()=>{
      attendanceList=attendanceList.filter(x=>x.id!==r.id);
      saveShiftStaffSubsectionsData();
      renderAttendanceView();
    });
    tdAct.append(delBtn);tr.append(tdAct);
    tbl.tBodies[0].append(tr);
  }
  root.append(tbl);
}
function renderWorkHoursView(){
  const root=$("workhours-list");
  if(!root)return;
  const totalReg=workHoursList.reduce((s,x)=>s+Number(x.regularHrs||0),0);
  const totalOt=workHoursList.reduce((s,x)=>s+Number(x.overtimeHrs||0),0);
  const totalPay=workHoursList.reduce((s,x)=>s+Number(x.totalPay||0),0);
  if($("wh-kpi-regular"))$("wh-kpi-regular").textContent=totalReg.toFixed(1)+" کاتژمێر";
  if($("wh-kpi-overtime"))$("wh-kpi-overtime").textContent=totalOt.toFixed(1)+" کاتژمێر";
  if($("wh-kpi-pay"))$("wh-kpi-pay").textContent=money(totalPay);
  if($("wh-kpi-shifts"))$("wh-kpi-shifts").textContent=String(shiftSessionsHistory.length);
  const q=String($("wh-search")?.value||"").trim().toLowerCase();
  const rows=workHoursList.filter(r=>!q||String(r.name||"").toLowerCase().includes(q)||String(r.note||"").toLowerCase().includes(q));
  root.replaceChildren();
  if(!rows.length){
    const b=document.createElement("div");b.className="blank";b.textContent="هیچ تۆمارێکی کاتژمێری کار نییە";root.append(b);return;
  }
  const tbl=document.createElement("table");
  tbl.innerHTML="<thead><tr><th>کارمەند</th><th>بەروار</th><th>کاتژمێری ئاسایی</th><th>کاتژمێری زیادە</th><th>کرێی کاتژمێر</th><th>پاداشت/لێبڕین</th><th>کۆی شایستە</th><th>کردار</th></tr></thead><tbody></tbody>";
  for(const r of rows){
    const tr=document.createElement("tr");
    for(const v of [r.name,r.date,r.regularHrs+" کاتژمێر",r.overtimeHrs+" کاتژمێر",money(r.hourlyRate),money(r.bonus||0),money(r.totalPay)]){
      const td=document.createElement("td");td.textContent=v;tr.append(td);
    }
    const tdAct=document.createElement("td");
    const delBtn=document.createElement("button");
    delBtn.type="button";delBtn.className="return-btn";delBtn.textContent="سڕینەوە";
    delBtn.addEventListener("click",()=>{
      workHoursList=workHoursList.filter(x=>x.id!==r.id);
      saveShiftStaffSubsectionsData();
      renderWorkHoursView();
    });
    tdAct.append(delBtn);tr.append(tdAct);
    tbl.tBodies[0].append(tr);
  }
  root.append(tbl);
}
function renderEvaluationView(){
  const root=$("evaluation-list");
  if(!root)return;
  const count=evaluationsList.length;
  const avg=count?(evaluationsList.reduce((s,x)=>s+Number(x.avgScore||5),0)/count).toFixed(1):"5.0";
  const topCount=evaluationsList.filter(x=>Number(x.avgScore)>=4.5).length;
  const exactShifts=shiftSessionsHistory.filter(s=>Number(s.variance_minor||0)===0).length;
  const accPct=shiftSessionsHistory.length?Math.round((exactShifts/shiftSessionsHistory.length)*100):100;
  if($("eval-kpi-avg"))$("eval-kpi-avg").textContent=avg+" / 5";
  if($("eval-kpi-top"))$("eval-kpi-top").textContent=String(topCount);
  if($("eval-kpi-accuracy"))$("eval-kpi-accuracy").textContent=accPct+"%";
  if($("eval-kpi-count"))$("eval-kpi-count").textContent=String(count);
  const q=String($("eval-search")?.value||"").trim().toLowerCase();
  const rows=evaluationsList.filter(r=>!q||String(r.name||"").toLowerCase().includes(q)||String(r.note||"").toLowerCase().includes(q));
  root.replaceChildren();
  if(!rows.length){
    const b=document.createElement("div");b.className="blank";b.textContent="هیچ هەڵسەنگاندنێک تۆمار نەکراوە";root.append(b);return;
  }
  const tbl=document.createElement("table");
  tbl.innerHTML="<thead><tr><th>کارمەند</th><th>ماوە</th><th>خێرایی</th><th>پاکیی سندووق</th><th>پابەندبوون</th><th>کۆی نمرە</th><th>تێبینی</th><th>کردار</th></tr></thead><tbody></tbody>";
  for(const r of rows){
    const tr=document.createElement("tr");
    for(const v of [r.name,r.period,r.speed+"/5",r.accuracy+"/5",r.discipline+"/5",r.avgScore+" ⭐",r.note||"—"]){
      const td=document.createElement("td");td.textContent=v;tr.append(td);
    }
    const tdAct=document.createElement("td");
    const delBtn=document.createElement("button");
    delBtn.type="button";delBtn.className="return-btn";delBtn.textContent="سڕینەوە";
    delBtn.addEventListener("click",()=>{
      evaluationsList=evaluationsList.filter(x=>x.id!==r.id);
      saveShiftStaffSubsectionsData();
      renderEvaluationView();
    });
    tdAct.append(delBtn);tr.append(tdAct);
    tbl.tBodies[0].append(tr);
  }
  root.append(tbl);
}
$("shift-subtabs")?.addEventListener("click",e=>{
  const btn=e.target.closest("[data-shift-sub]");
  if(btn&&!busy)selectShiftSub(btn.dataset.shiftSub);
});
$("attendance-form")?.addEventListener("submit",e=>{
  e.preventDefault();
  const name=String($("att-staff-name")?.value||"").trim();
  if(!name)return;
  attendanceList.unshift({
    id:crypto.randomUUID(),
    name,
    role:String($("att-role")?.value||"کاشێر"),
    date:String($("att-date")?.value||new Date().toISOString().slice(0,10)),
    checkIn:String($("att-check-in")?.value||"08:00"),
    checkOut:String($("att-check-out")?.value||"16:00"),
    status:String($("att-status")?.value||"present"),
    note:String($("att-note")?.value||"").trim()
  });
  saveShiftStaffSubsectionsData();
  if($("att-staff-name"))$("att-staff-name").value="";
  if($("att-note"))$("att-note").value="";
  renderAttendanceView();
  msg("att-msg","ئامادەبوونی «"+name+"» بە سەرکەوتوویی تۆمارکرا","success");
});
$("att-search")?.addEventListener("input",renderAttendanceView);
$("att-status-filter")?.addEventListener("change",renderAttendanceView);
$("att-export-csv")?.addEventListener("click",()=>{
  exportOperationsCsv("staff_attendance_"+new Date().toISOString().slice(0,10)+".csv",
    ["کارمەند","پلە","بەروار","هاتن","دەرچوون","دۆخ","تێبینی"],
    attendanceList.map(r=>[r.name,r.role,r.date,r.checkIn,r.checkOut,r.status,r.note||""]));
});
$("workhours-form")?.addEventListener("submit",e=>{
  e.preventDefault();
  const name=String($("wh-staff-name")?.value||"").trim();
  if(!name)return;
  const reg=Number($("wh-regular-hrs")?.value||0);
  const ot=Number($("wh-overtime-hrs")?.value||0);
  const rate=Number($("wh-hourly-rate")?.value||0);
  const bonus=Number($("wh-bonus")?.value||0);
  const totalPay=Math.round((reg*rate)+(ot*rate*1.5)+bonus);
  workHoursList.unshift({
    id:crypto.randomUUID(),
    name,
    date:String($("wh-date")?.value||new Date().toISOString().slice(0,10)),
    regularHrs:reg,
    overtimeHrs:ot,
    hourlyRate:rate,
    bonus,
    totalPay,
    note:String($("wh-note")?.value||"").trim()
  });
  saveShiftStaffSubsectionsData();
  if($("wh-staff-name"))$("wh-staff-name").value="";
  if($("wh-note"))$("wh-note").value="";
  renderWorkHoursView();
  msg("wh-msg","کاتی کار و شایستەی دارایی «"+name+"» تۆمارکرا ("+money(totalPay)+")","success");
});
$("wh-search")?.addEventListener("input",renderWorkHoursView);
$("wh-export-csv")?.addEventListener("click",()=>{
  exportOperationsCsv("staff_workhours_"+new Date().toISOString().slice(0,10)+".csv",
    ["کارمەند","بەروار","کاتژمێری ئاسایی","کاتژمێری زیادە","کرێی کاتژمێر","پاداشت","کۆی شایستە","تێبینی"],
    workHoursList.map(r=>[r.name,r.date,r.regularHrs,r.overtimeHrs,r.hourlyRate,r.bonus,r.totalPay,r.note||""]));
});
$("evaluation-form")?.addEventListener("submit",e=>{
  e.preventDefault();
  const name=String($("eval-staff-name")?.value||"").trim();
  if(!name)return;
  const speed=Number($("eval-speed")?.value||5);
  const accuracy=Number($("eval-accuracy")?.value||5);
  const discipline=Number($("eval-discipline")?.value||5);
  const avgScore=((speed+accuracy+discipline)/3).toFixed(1);
  evaluationsList.unshift({
    id:crypto.randomUUID(),
    name,
    period:String($("eval-period")?.value||"2026-10"),
    speed,
    accuracy,
    discipline,
    avgScore,
    note:String($("eval-note")?.value||"").trim()
  });
  saveShiftStaffSubsectionsData();
  if($("eval-staff-name"))$("eval-staff-name").value="";
  if($("eval-note"))$("eval-note").value="";
  renderEvaluationView();
  msg("eval-msg","هەڵسەنگاندنی کارمەند «"+name+"» بە نمرەی "+avgScore+"/5 پاشەکەوتکرا","success");
});
$("eval-search")?.addEventListener("input",renderEvaluationView);
$("eval-export-csv")?.addEventListener("click",()=>{
  exportOperationsCsv("staff_evaluations_"+new Date().toISOString().slice(0,10)+".csv",
    ["کارمەند","ماوە","خێرایی","پاکیی سندووق","پابەندبوون","تێکڕا","تێبینی"],
    evaluationsList.map(r=>[r.name,r.period,r.speed,r.accuracy,r.discipline,r.avgScore,r.note||""]));
});

// --- Card 10: Labels & Printing Workspace ---
function loadLabelsAndAuditSubsectionsData(){
  try{
    batchLabelsQueue=JSON.parse(localStorage.getItem(shiftSubStoreKey("batch_labels"))||"[]");
    if(!Array.isArray(batchLabelsQueue))batchLabelsQueue=[];
  }catch(_e){batchLabelsQueue=[];}
  try{
    customAlertsList=JSON.parse(localStorage.getItem(shiftSubStoreKey("custom_alerts"))||"[]");
    if(!Array.isArray(customAlertsList))customAlertsList=[];
  }catch(_e){customAlertsList=[];}
  try{
    approvalRequestsList=JSON.parse(localStorage.getItem(shiftSubStoreKey("approvals"))||"[]");
    if(!Array.isArray(approvalRequestsList))approvalRequestsList=[];
  }catch(_e){approvalRequestsList=[];}
}
function saveLabelsAndAuditSubsectionsData(){
  try{
    localStorage.setItem(shiftSubStoreKey("batch_labels"),JSON.stringify(batchLabelsQueue));
    localStorage.setItem(shiftSubStoreKey("custom_alerts"),JSON.stringify(customAlertsList));
    localStorage.setItem(shiftSubStoreKey("approvals"),JSON.stringify(approvalRequestsList));
  }catch(_e){}
}
function populateLabelsSelectors(){
  const activeProds=products.filter(p=>p.active!==false);
  if($("lbl-kpi-products"))$("lbl-kpi-products").textContent=String(activeProds.length);
  for(const selId of ["lbl-price-product","lbl-bc-product","batch-lbl-product"]){
    const sel=$(selId);
    if(!sel)continue;
    const prev=sel.value;
    sel.replaceChildren();
    const defOpt=document.createElement("option");
    defOpt.value="";defOpt.textContent="کاڵایەک هەڵبژێرە...";
    sel.append(defOpt);
    for(const p of activeProds){
      const opt=document.createElement("option");
      opt.value=p.id;
      opt.textContent=p.name+" — "+money(p.price_minor);
      sel.append(opt);
    }
    if(prev&&[...sel.options].some(o=>o.value===prev))sel.value=prev;
  }
}
function renderLabelsWorkspace(){
  populateLabelsSelectors();
  renderLabelsPriceCatalog();
  renderLabelsBarcodeSection();
  renderBatchLabelsQueue();
}
function renderLabelsPriceCatalog(){
  const root=$("labels-price-catalog-list");
  if(!root)return;
  const q=String($("lbl-price-search")?.value||"").trim().toLowerCase();
  const activeProds=products.filter(p=>{
    if(p.active===false)return false;
    if(!q)return true;
    const bc=barcodes.find(b=>b.product_id===p.id&&b.active!==false)?.code||"";
    return String(p.name||"").toLowerCase().includes(q)||bc.toLowerCase().includes(q);
  });
  root.replaceChildren();
  if(!activeProds.length){
    const b=document.createElement("div");b.className="blank";b.textContent="هیچ کاڵایەک نەدۆزرایەوە";root.append(b);return;
  }
  const tbl=document.createElement("table");
  tbl.innerHTML="<thead><tr><th>ناوی کاڵا</th><th>بارکۆد</th><th>یەکە</th><th>نرخ</th><th>کردار</th></tr></thead><tbody></tbody>";
  for(const p of activeProds.slice(0,50)){
    const bc=barcodes.find(b=>b.product_id===p.id&&b.active!==false)?.code||p.sku||p.plu||"000000";
    const unitLabel=p.base_unit==="kg"?"کیلۆگرام":"دانە";
    const tr=document.createElement("tr");
    for(const v of [p.name,bc,unitLabel,money(p.price_minor)]){
      const td=document.createElement("td");td.textContent=v;tr.append(td);
    }
    const tdAct=document.createElement("td");
    const printBtn=document.createElement("button");
    printBtn.type="button";printBtn.className="stock-pick-btn";
    printBtn.textContent="🏷 چاپی لەیبڵی نرخ";
    printBtn.addEventListener("click",()=>{
      openOpsShelfLabel({name:p.name,priceMinor:p.price_minor,unitLabel,code:bc});
    });
    const batchBtn=document.createElement("button");
    batchBtn.type="button";batchBtn.className="stock-action-btn";
    batchBtn.textContent="+ کۆمەڵەیی";
    batchBtn.addEventListener("click",()=>{
      batchLabelsQueue.push({id:crypto.randomUUID(),name:p.name,priceMinor:p.price_minor,unitLabel,code:bc,copies:2});
      saveLabelsAndAuditSubsectionsData();
      msg("lbl-price-msg","کاڵای «"+p.name+"» زیادکرا بۆ لیستی چاپی کۆمەڵەیی","success");
    });
    tdAct.append(printBtn,batchBtn);tr.append(tdAct);
    tbl.tBodies[0].append(tr);
  }
  root.append(tbl);
}
function renderLabelsBarcodeSection(){
  const preview=$("lbl-bc-preview-box");
  const code=String($("lbl-bc-code-input")?.value||"2001000000018").trim()||"2001000000018";
  if(preview){
    preview.replaceChildren();
    const wrap=document.createElement("div");
    wrap.style.textAlign="center";wrap.style.background="#fff";wrap.style.padding="12px 20px";wrap.style.borderRadius="10px";wrap.style.border="1.5px solid #0f172a";
    wrap.append(buildBarcodeSvg(code));
    const num=document.createElement("div");
    num.style.fontFamily="monospace";num.style.fontWeight="900";num.style.marginTop="4px";num.style.direction="ltr";
    num.textContent=code;
    wrap.append(num);
    preview.append(wrap);
  }
  const tblRoot=$("labels-barcode-table");
  if(!tblRoot)return;
  tblRoot.replaceChildren();
  const tbl=document.createElement("table");
  tbl.innerHTML="<thead><tr><th>بارکۆد</th><th>کاڵا</th><th>جۆری یەکە</th><th>نرخ</th><th>چاپ</th></tr></thead><tbody></tbody>";
  for(const b of barcodes.filter(x=>x.active!==false).slice(0,40)){
    const p=products.find(x=>x.id===b.product_id);
    const tr=document.createElement("tr");
    for(const v of [b.code,p?.name||"—",b.unit_type==="carton"?"کارتۆن ("+b.units_per_scan+")":"دانە",money(b.price_minor??p?.price_minor??0)]){
      const td=document.createElement("td");td.textContent=v;tr.append(td);
    }
    const tdAct=document.createElement("td");
    const btn=document.createElement("button");
    btn.type="button";btn.className="stock-pick-btn";btn.textContent="🖨 چاپی بارکۆد";
    btn.addEventListener("click",()=>{
      openOpsShelfLabel({name:p?.name||"بارکۆد",priceMinor:b.price_minor??p?.price_minor??0,unitLabel:b.unit_type==="carton"?"کارتۆن":"دانە",code:b.code});
    });
    tdAct.append(btn);tr.append(tdAct);
    tbl.tBodies[0].append(tr);
  }
  tblRoot.append(tbl);
}
function renderBatchLabelsQueue(){
  const totalCopies=batchLabelsQueue.reduce((s,x)=>s+Number(x.copies||1),0);
  if($("batch-kpi-items"))$("batch-kpi-items").textContent=String(batchLabelsQueue.length);
  if($("batch-kpi-copies"))$("batch-kpi-copies").textContent=String(totalCopies);
  const qRoot=$("batch-labels-queue-table");
  const sheet=$("batch-labels-print-sheet");
  if(!qRoot||!sheet)return;
  qRoot.replaceChildren();
  sheet.replaceChildren();
  if(!batchLabelsQueue.length){
    const b=document.createElement("div");b.className="blank";b.textContent="لیستی چاپی کۆمەڵەیی بەتاڵە — کاڵا زیاد بکە یان کلیک لە «زیادکردنی هەموو کاڵاکان» بکە";qRoot.append(b);
    return;
  }
  const tbl=document.createElement("table");
  tbl.innerHTML="<thead><tr><th>کاڵا</th><th>بارکۆد</th><th>نرخ</th><th>ژمارەی کۆپی</th><th>کردار</th></tr></thead><tbody></tbody>";
  const storeTitle=localStorage.getItem("retail_tpl_store_title")||storeSettings.storeName||"سوپەرمارکێتی کانی چنار";
  for(const item of batchLabelsQueue){
    const tr=document.createElement("tr");
    for(const v of [item.name,item.code,money(item.priceMinor),item.copies+" دانە"]){
      const td=document.createElement("td");td.textContent=v;tr.append(td);
    }
    const tdAct=document.createElement("td");
    const delBtn=document.createElement("button");
    delBtn.type="button";delBtn.className="return-btn";delBtn.textContent="لابردن";
    delBtn.addEventListener("click",()=>{
      batchLabelsQueue=batchLabelsQueue.filter(x=>x.id!==item.id);
      saveLabelsAndAuditSubsectionsData();
      renderBatchLabelsQueue();
    });
    tdAct.append(delBtn);tr.append(tdAct);
    tbl.tBodies[0].append(tr);
    const copies=Math.min(Math.max(Number(item.copies||1),1),30);
    for(let c=0;c<copies;c++){
      const card=document.createElement("div");
      card.className="ops-shelf-label-card size-40x25";
      card.innerHTML='<div class="ops-label-store"></div><div class="ops-label-name"></div><div class="ops-label-price-box"><strong class="ops-label-price"></strong><span class="ops-label-unit"></span></div><div class="ops-label-barcode-wrap"></div><div class="ops-label-code"></div>';
      card.querySelector(".ops-label-store").textContent=storeTitle;
      card.querySelector(".ops-label-name").textContent=item.name;
      card.querySelector(".ops-label-price").textContent=money(item.priceMinor);
      card.querySelector(".ops-label-unit").textContent=item.unitLabel||"دانە";
      card.querySelector(".ops-label-barcode-wrap").append(buildBarcodeSvg(item.code||"000000"));
      card.querySelector(".ops-label-code").textContent=item.code||"—";
      sheet.append(card);
    }
  }
  qRoot.append(tbl);
}
$("labels-subtabs")?.addEventListener("click",e=>{
  const btn=e.target.closest("[data-labels-sub]");
  if(btn&&!busy)selectLabelsSub(btn.dataset.labelsSub);
});
$("lbl-price-product")?.addEventListener("change",e=>{
  const p=products.find(x=>x.id===e.target.value);
  if(p){
    if($("lbl-price-custom-name"))$("lbl-price-custom-name").value=p.name;
    if($("lbl-price-custom-val"))$("lbl-price-custom-val").value=String(p.price_minor||0);
  }
});
$("lbl-price-size")?.addEventListener("change",e=>{
  if($("lbl-kpi-size"))$("lbl-kpi-size").textContent=e.target.value==="50x30"?"50×30 mm":"40×25 mm";
  if($("ops-label-size-select"))$("ops-label-size-select").value=e.target.value;
});
$("lbl-price-print-now")?.addEventListener("click",()=>{
  const pId=$("lbl-price-product")?.value||"";
  const p=products.find(x=>x.id===pId);
  const name=String($("lbl-price-custom-name")?.value||p?.name||"کاڵای فرۆشگا").trim();
  const priceMinor=Number($("lbl-price-custom-val")?.value||p?.price_minor||0);
  const bc=barcodes.find(b=>b.product_id===pId&&b.active!==false)?.code||p?.sku||p?.plu||"2001000000018";
  if($("ops-label-size-select")&&$("lbl-price-size"))$("ops-label-size-select").value=$("lbl-price-size").value;
  openOpsShelfLabel({name,priceMinor,unitLabel:p?.base_unit==="kg"?"کیلۆگرام":"دانە",code:bc});
});
$("lbl-price-search")?.addEventListener("input",renderLabelsPriceCatalog);
$("lbl-bc-product")?.addEventListener("change",e=>{
  const p=products.find(x=>x.id===e.target.value);
  if(!p)return;
  const bc=barcodes.find(b=>b.product_id===p.id&&b.active!==false)?.code||"";
  if(bc&&$("lbl-bc-code-input")){
    $("lbl-bc-code-input").value=bc;
    renderLabelsBarcodeSection();
  }
});
$("lbl-bc-generate-btn")?.addEventListener("click",()=>{
  const mode=$("lbl-bc-mode")?.value||"ean13";
  let code="";
  if(mode==="scale27"){
    const plu=$("lbl-bc-plu")?.value||"101";
    const grams=Number($("lbl-bc-grams")?.value||1000);
    code=buildScaleEan13(plu,grams)||"2700101010008";
  }else{
    const body="20"+String(Math.floor(1000000000+Math.random()*8999999999));
    code=body+computeEan13CheckDigit(body);
  }
  if($("lbl-bc-code-input"))$("lbl-bc-code-input").value=code;
  renderLabelsBarcodeSection();
  msg("lbl-bc-msg","بارکۆدی ستانداردی دروستکراو: "+code,"success");
});
$("lbl-bc-code-input")?.addEventListener("input",renderLabelsBarcodeSection);
$("lbl-bc-print-btn")?.addEventListener("click",()=>{
  const pId=$("lbl-bc-product")?.value||"";
  const p=products.find(x=>x.id===pId);
  const code=String($("lbl-bc-code-input")?.value||"2001000000018").trim();
  openOpsShelfLabel({name:p?.name||"لەیبڵی بارکۆد",priceMinor:p?.price_minor||0,unitLabel:p?.base_unit==="kg"?"کیلۆگرام":"دانە",code});
});
$("lbl-bc-add-batch-btn")?.addEventListener("click",()=>{
  const pId=$("lbl-bc-product")?.value||"";
  const p=products.find(x=>x.id===pId);
  const code=String($("lbl-bc-code-input")?.value||"2001000000018").trim();
  batchLabelsQueue.push({id:crypto.randomUUID(),name:p?.name||"لەیبڵی بارکۆد",priceMinor:p?.price_minor||0,unitLabel:"دانە",code,copies:2});
  saveLabelsAndAuditSubsectionsData();
  msg("lbl-bc-msg","بارکۆدی "+code+" زیادکرا بۆ لیستی چاپی کۆمەڵەیی","success");
});
$("batch-label-add-form")?.addEventListener("submit",e=>{
  e.preventDefault();
  const pId=$("batch-lbl-product")?.value||"";
  const p=products.find(x=>x.id===pId);
  if(!p){msg("batch-lbl-msg","سەرەتا کاڵایەک هەڵبژێرە","error");return;}
  const copies=Math.max(1,Number($("batch-lbl-copies")?.value||1));
  const bc=barcodes.find(b=>b.product_id===p.id&&b.active!==false)?.code||p.sku||"000000";
  batchLabelsQueue.push({id:crypto.randomUUID(),name:p.name,priceMinor:p.price_minor,unitLabel:p.base_unit==="kg"?"کیلۆگرام":"دانە",code:bc,copies});
  saveLabelsAndAuditSubsectionsData();
  renderBatchLabelsQueue();
  msg("batch-lbl-msg","کاڵای «"+p.name+"» زیادکرا بۆ پەڕەی چاپی کۆمەڵەیی","success");
});
$("batch-lbl-add-all")?.addEventListener("click",()=>{
  for(const p of products.filter(x=>x.active!==false).slice(0,24)){
    const bc=barcodes.find(b=>b.product_id===p.id&&b.active!==false)?.code||p.sku||"000000";
    if(!batchLabelsQueue.some(q=>q.code===bc&&q.name===p.name)){
      batchLabelsQueue.push({id:crypto.randomUUID(),name:p.name,priceMinor:p.price_minor,unitLabel:p.base_unit==="kg"?"کیلۆگرام":"دانە",code:bc,copies:1});
    }
  }
  saveLabelsAndAuditSubsectionsData();
  renderBatchLabelsQueue();
  msg("batch-lbl-msg","کاڵاکانی کاتەلۆگ زیادکران بۆ پەڕەی چاپی کۆمەڵەیی","success");
});
$("batch-lbl-clear")?.addEventListener("click",()=>{
  batchLabelsQueue=[];
  saveLabelsAndAuditSubsectionsData();
  renderBatchLabelsQueue();
});
$("batch-lbl-print-all")?.addEventListener("click",()=>{
  if(!batchLabelsQueue.length){msg("batch-lbl-msg","لیستی چاپی کۆمەڵەیی بەتاڵە","error");return;}
  document.body.classList.add("printing-batch-labels");
  window.print();
  setTimeout(()=>{document.body.classList.remove("printing-batch-labels");},1000);
});
$("label-template-form")?.addEventListener("submit",e=>{
  e.preventDefault();
  const title=String($("tpl-store-title")?.value||"سوپەرمارکێتی کانی چنار").trim();
  const size=String($("tpl-default-size")?.value||"40x25");
  localStorage.setItem("retail_tpl_store_title",title);
  localStorage.setItem("retail_tpl_default_size",size);
  if($("ops-label-size-select"))$("ops-label-size-select").value=size;
  const storeBanner=document.querySelector("#ops-shelf-label-card .ops-label-store");
  if(storeBanner)storeBanner.textContent=title;
  renderBatchLabelsQueue();
  msg("tpl-msg","قاڵبی چاپی لەیبڵ پاشەکەوتکرا و لەسەر هەموو لەیبڵەکان جێبەجێ کرا","success");
});

// --- Card 12: Audit, Alerts & Approvals Workspace ---
function renderAuditSubsections(){
  renderAuditAlertsView();
  renderAuditApprovalsView();
}
function renderAuditAlertsView(){
  const root=$("audit-alerts-list");
  if(!root)return;
  const liveAlerts=[];
  const lowThreshold=Number(localStorage.getItem("retail_low_threshold")||5);
  for(const p of products.filter(x=>x.active!==false)){
    const qty=Number(balances.get(p.id)||0);
    if(qty<=0){
      liveAlerts.push({severity:"critical",dept:"کۆگا",title:"تەواوبوونی کاڵا لە کۆگا: "+p.name+" (بڕ: 0)",auto:true});
    }else if(qty<=lowThreshold){
      liveAlerts.push({severity:"warning",dept:"کۆگا",title:"کەمبوونی بڕی کاڵا: "+p.name+" (ماوە: "+qty+")",auto:true});
    }
  }
  for(const c of customersList){
    const debt=Number(c.balance_minor||0);
    const limit=Number(c.credit_limit_minor||0);
    if(limit>0&&debt>limit){
      liveAlerts.push({severity:"critical",dept:"دارایی و قەرز",title:"تێپەڕینی سنووری قەرز: "+c.name+" ("+money(debt)+")",auto:true});
    }
  }
  for(const ca of customAlertsList){
    liveAlerts.unshift(ca);
  }
  const critCount=liveAlerts.filter(x=>x.severity==="critical").length;
  const warnCount=liveAlerts.filter(x=>x.severity==="warning").length;
  const finCount=liveAlerts.filter(x=>x.dept==="دارایی و قەرز"||x.severity==="info").length;
  if($("alert-kpi-critical"))$("alert-kpi-critical").textContent=String(critCount);
  if($("alert-kpi-warning"))$("alert-kpi-warning").textContent=String(warnCount);
  if($("alert-kpi-finance"))$("alert-kpi-finance").textContent=String(finCount);
  if($("alert-kpi-total"))$("alert-kpi-total").textContent=String(liveAlerts.length);
  root.replaceChildren();
  if(!liveAlerts.length){
    const b=document.createElement("div");b.className="blank";b.textContent="هیچ ئاگادارییەکی فریاگوزاری نییە — دۆخی کۆگا و قەرز سەلامەتە";root.append(b);return;
  }
  const tbl=document.createElement("table");
  tbl.innerHTML="<thead><tr><th>ئاست</th><th>بەش</th><th>وردەکاریی ئاگاداری</th><th>کردار</th></tr></thead><tbody></tbody>";
  const sevMap={critical:"فریاگوزاری 🔴",warning:"ئاگادارکردنەوە 🟡",info:"زانیاری 🔵"};
  for(const a of liveAlerts.slice(0,50)){
    const tr=document.createElement("tr");
    for(const v of [sevMap[a.severity]||a.severity,a.dept||"گشتی",a.title]){
      const td=document.createElement("td");td.textContent=v;tr.append(td);
    }
    const tdAct=document.createElement("td");
    if(!a.auto&&a.id){
      const doneBtn=document.createElement("button");
      doneBtn.type="button";doneBtn.className="stock-pick-btn";doneBtn.textContent="✓ چارەسەرکرا";
      doneBtn.addEventListener("click",()=>{
        customAlertsList=customAlertsList.filter(x=>x.id!==a.id);
        saveLabelsAndAuditSubsectionsData();
        renderAuditAlertsView();
      });
      tdAct.append(doneBtn);
    }else{
      tdAct.textContent="پشکنینی خۆکار";
    }
    tr.append(tdAct);
    tbl.tBodies[0].append(tr);
  }
  root.append(tbl);
}
function renderAuditApprovalsView(){
  const root=$("audit-approvals-list");
  if(!root)return;
  const pendingCount=approvalRequestsList.filter(x=>x.status==="pending").length;
  const approvedCount=approvalRequestsList.filter(x=>x.status==="approved").length;
  const rejectedCount=approvalRequestsList.filter(x=>x.status==="rejected").length;
  if($("appr-kpi-pending"))$("appr-kpi-pending").textContent=String(pendingCount);
  if($("appr-kpi-approved"))$("appr-kpi-approved").textContent=String(approvedCount);
  if($("appr-kpi-rejected"))$("appr-kpi-rejected").textContent=String(rejectedCount);
  if($("appr-kpi-total"))$("appr-kpi-total").textContent=String(approvalRequestsList.length);
  root.replaceChildren();
  if(!approvalRequestsList.length){
    const b=document.createElement("div");b.className="blank";b.textContent="هیچ داواکارییەکی مۆڵەت تۆمار نەکراوە";root.append(b);return;
  }
  const tbl=document.createElement("table");
  tbl.innerHTML="<thead><tr><th>داواکار</th><th>جۆری مۆڵەت</th><th>بڕ / ماوە</th><th>هۆکار</th><th>دۆخ</th><th>بڕیاری بەڕێوەبەر</th></tr></thead><tbody></tbody>";
  const stMap={pending:"چاوەڕوانکراو ⏳",approved:"پەسەندکراو ✅",rejected:"ڕەتکراوە ❌"};
  for(const req of approvalRequestsList){
    const tr=document.createElement("tr");
    for(const v of [req.requester,req.type,req.amount||"—",req.reason,stMap[req.status]||req.status]){
      const td=document.createElement("td");td.textContent=v;tr.append(td);
    }
    const tdAct=document.createElement("td");
    const okBtn=document.createElement("button");
    okBtn.type="button";okBtn.className="stock-pick-btn";okBtn.textContent="✓ پەسەندکردن";
    okBtn.addEventListener("click",()=>{
      req.status="approved";
      saveLabelsAndAuditSubsectionsData();
      renderAuditApprovalsView();
    });
    const noBtn=document.createElement("button");
    noBtn.type="button";noBtn.className="return-btn";noBtn.textContent="✕ ڕەتکردنەوە";
    noBtn.addEventListener("click",()=>{
      req.status="rejected";
      saveLabelsAndAuditSubsectionsData();
      renderAuditApprovalsView();
    });
    tdAct.append(okBtn,noBtn);tr.append(tdAct);
    tbl.tBodies[0].append(tr);
  }
  root.append(tbl);
}
$("audit-subtabs")?.addEventListener("click",e=>{
  const btn=e.target.closest("[data-audit-sub]");
  if(btn&&!busy)selectAuditSub(btn.dataset.auditSub);
});
$("audit-alert-form")?.addEventListener("submit",e=>{
  e.preventDefault();
  const title=String($("alert-custom-title")?.value||"").trim();
  if(!title)return;
  customAlertsList.unshift({
    id:crypto.randomUUID(),
    title,
    severity:String($("alert-custom-severity")?.value||"warning"),
    dept:String($("alert-custom-dept")?.value||"کۆگا"),
    auto:false
  });
  saveLabelsAndAuditSubsectionsData();
  if($("alert-custom-title"))$("alert-custom-title").value="";
  renderAuditAlertsView();
  msg("audit-alert-msg","ئاگاداریی نوێ بە سەرکەوتوویی تۆمارکرا","success");
});
$("alert-refresh-btn")?.addEventListener("click",renderAuditAlertsView);
$("approval-request-form")?.addEventListener("submit",e=>{
  e.preventDefault();
  const requester=String($("appr-requester")?.value||"").trim();
  const reason=String($("appr-reason")?.value||"").trim();
  if(!requester||!reason)return;
  approvalRequestsList.unshift({
    id:crypto.randomUUID(),
    requester,
    type:String($("appr-type")?.value||"داشکاندنی تایبەت"),
    amount:String($("appr-amount")?.value||"").trim(),
    reason,
    status:"pending",
    createdAt:new Date().toISOString()
  });
  saveLabelsAndAuditSubsectionsData();
  if($("appr-requester"))$("appr-requester").value="";
  if($("appr-amount"))$("appr-amount").value="";
  if($("appr-reason"))$("appr-reason").value="";
  renderAuditApprovalsView();
  msg("appr-msg","داوای مۆڵەت بۆ «"+requester+"» تۆمارکرا","success");
});
$("audit-refresh-btn")?.addEventListener("click",()=>{if(!busy)void refreshAudit();});
$("audit-search-input")?.addEventListener("input",invalidateAuditQuery);
$("audit-search-field")?.addEventListener("change",invalidateAuditQuery);
$("audit-date-filter")?.addEventListener("change",invalidateAuditQuery);
$("audit-prev")?.addEventListener("click",()=>{if(!busy&&!auditLoading&&auditPageOffset>=50){auditPageOffset-=50;void refreshAudit(false);}});
$("audit-next")?.addEventListener("click",()=>{if(!busy&&!auditLoading&&auditPageOffset+50<auditPageTotal){auditPageOffset+=50;void refreshAudit(false);}});
$("audit-export-csv")?.addEventListener("click",()=>{
 if(busy||auditLoading||!canManage()||!user||!store||!auditPageRows.length||tab!=="audit")return;
 const blob=new Blob([window.RetailAuditHistory.csv(auditPageRows)],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;
 a.download="audit_page_"+(auditPageOffset+1)+"-"+(auditPageOffset+auditPageRows.length)+"_of_"+auditPageTotal+".csv";
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
});

$("offline-sync-badge")?.addEventListener("click",()=>{
  if(busy)return;
  selectTab("staff");
  selectSettingsSub("system");
  renderOfflineHourlySyncStatus();
});
$("sys-sync-interval-select")?.addEventListener("change",e=>{
  const mins=Number(e.target.value||60);
  window.RetailOfflineSync?.setIntervalMinutes?.(mins);
  renderOfflineHourlySyncStatus();
  msg("set-sys-msg","ماوەی ناردنی خۆکاری داتاکان بۆ سێرڤەر گۆڕدرا بۆ هەر "+mins+" خولەک جارێک","success");
});
$("sys-sync-now-btn")?.addEventListener("click",async()=>{
  if(!window.RetailOfflineSync?.syncNow){
    msg("set-sys-msg","بزوێنەری هاوکاتسازیی ئۆفلاین ئامادەیە","success");
    return;
  }
  const st=await window.RetailOfflineSync.syncNow("manual");
  renderOfflineHourlySyncStatus();
  if(st.lastStatus==="synced"){
    msg("set-sys-msg","هەموو داتاکانی ناوخۆ بە سەرکەوتوویی نێردران بۆ سێرڤەر ("+new Date(st.lastSyncedAt).toLocaleTimeString("en-GB")+")","success");
  }else if(!st.online){
    msg("set-sys-msg","هێڵی ئینتەرنێت نییە — داتاکان ١٠٠٪ بە ئۆفلاین پارێزراون و لە کاتی هەبوونی ئینتەرنێتدا دەنێردرێن","error");
  }else{
    msg("set-sys-msg",st.lastError||"ناردنی داتاکان خرایە ڕیزی کاتژمێری","error");
  }
});
window.addEventListener("retail-offline-sync-status",()=>{
  renderOfflineHourlySyncStatus();
});
renderOfflineHourlySyncStatus();

mountCustomerPickers();
$("cpay-customer")?.addEventListener("change",()=>{const customer=customersList.find(c=>c.id===$("cpay-customer").value);$("cpay-amount").value=customer?.balance_minor>0?String(customer.balance_minor):"";});
void init();
})();
