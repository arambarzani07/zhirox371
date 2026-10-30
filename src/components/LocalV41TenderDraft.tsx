import React,{useEffect,useState} from "react";
type Plan={request_id:string;cash_minor:string|number;external_minor:string|number;
 external_method:string;state:string;intent_state?:string};
export const LocalV41TenderDraft:React.FC<{
 token:string;requestId:string;total:number;onCashCheckoutAllowed:(v:boolean)=>void;
}>=({token,requestId,total,onCashCheckoutAllowed})=>{
 const [cash,setCash]=useState(String(total));
 const [method,setMethod]=useState<"card"|"bank_transfer">("card");
 const [plan,setPlan]=useState<Plan|null>(null);
 const [busy,setBusy]=useState(false);
 const v43=import.meta.env.PROD&&import.meta.env.VITE_V43_RESERVATIONS==="true";
 const [hold,setHold]=useState<null|{state:string;expires_at:string;expired?:boolean}>(null);
 const [holdMessage,setHoldMessage]=useState("");
 const [status,setStatus]=useState("دۆخی پارەدان پشتڕاست دەکرێتەوە؛ فرۆشتن ڕاگیراوە.");
 const [verified,setVerified]=useState(false);
 const cashNum=/^(0|[1-9][0-9]*)$/.test(cash)?Number(cash):NaN;
 const valid=Number.isSafeInteger(cashNum)&&cashNum>=0&&cashNum<=total&&total>0;
 const external=valid?total-cashNum:null;
 const refresh=async()=>{
  onCashCheckoutAllowed(false);setVerified(false);setBusy(true);
  try{
   const r=await fetch("/api/local/v41/tender-status?request_id="+requestId,{
    headers:{Authorization:"Bearer "+token},cache:"no-store",
    credentials:"omit",redirect:"error"});
   if(!r.ok)throw Error("status_unknown");
   const x=await r.json();
   if(x.ok!==true||x.external_settlement_supported!==false||
     (x.plan&&x.plan.request_id!==requestId))throw Error("invalid_status");
   const allowed=!x.plan||x.plan.state==="cash_ready"&&x.plan.intent_state==="prepared";
   setPlan(x.plan);setVerified(true);onCashCheckoutAllowed(Boolean(allowed));
   setStatus(x.plan?.state==="external_unverified"?
    "پارەی بانکی پشتڕاست نەکراوە. هیچ فرۆشتنێک تۆمار نابێت؛ تەنها هەڵوەشاندنەوەی مامەڵە ڕێگەپێدراوە.":
    "پارەدانی نەختینەیی ئامادەی تاقیکردنەوەی V31 ـە.");
  }catch{setPlan(null);setStatus("دۆخی پلان نادیارە؛ فرۆشتن ڕاگیراوە.");}
  finally{setBusy(false);}
 };
 useEffect(()=>{
  let active=true;
  onCashCheckoutAllowed(false);setVerified(false);setPlan(null);
  const start=async()=>{
   try{
    const r=await fetch("/api/local/v41/tender-status?request_id="+requestId,{
      headers:{Authorization:"Bearer "+token},cache:"no-store",
      credentials:"omit",redirect:"error"});
    if(!r.ok)throw Error("unavailable");
    const x=await r.json();
    if(x.ok!==true||x.external_settlement_supported!==false||
       (x.plan&&x.plan.request_id!==requestId))throw Error("invalid_reply");
    if(!active)return;
    const allowed=!x.plan||x.plan.state==="cash_ready"&&x.plan.intent_state==="prepared";
    setPlan(x.plan);setVerified(true);onCashCheckoutAllowed(Boolean(allowed));
    setStatus(x.plan?.state==="external_unverified"?
      "پارەی بانکی پشتڕاست نەکراوە؛ فرۆشتن قەدەغەیە.":
      "دۆخی داواکاری پشتڕاست کرا؛ تەنها نەختینە ڕێگەپێدراوە.");
   }catch{if(active)setStatus("پشکنینی تێندەر شکستی هێنا؛ فرۆشتن ڕاگیراوە.");}
  };
  void start();
  return()=>{active=false;onCashCheckoutAllowed(false);};
 },[token,requestId,onCashCheckoutAllowed]);
 const refreshHold=async()=>{
  if(!v43||busy)return;
  setBusy(true);
  try{
   const r=await fetch("/api/local/v43/reservation-status?request_id="+requestId,{
    cache:"no-store",credentials:"omit",redirect:"error",
    headers:{Authorization:"Bearer "+token}});
   if(!r.ok)throw Error("status_unknown");
   const x=await r.json();
   if(x.ok!==true||x.provider_payment_verified!==false||
      (x.reservation&&x.reservation.request_id!==requestId))
    throw Error("invalid_reply");
   setHold(x.reservation);
   setHoldMessage(x.reservation?
     x.reservation.expired?"پاراستنی کۆگا بەسەرچووە؛ مامەڵە پێویستی بە چارەسەرکردن هەیە.":
     "کۆگا پارێزراوە؛ بانک هێشتا پشتڕاست نەکراوە.":
     "حجزی کۆگا نییە؛ بانک هێشتا پشتڕاست نەکراوە.");
  }catch{setHoldMessage("دۆخی کۆگا نادیارە؛ مامەڵە مەفرۆشە.");}
  finally{setBusy(false);}
 };
 const reserve=async()=>{
  if(!v43||busy||plan?.state!=="external_unverified"||hold)return;
  setBusy(true);onCashCheckoutAllowed(false);
  try{
   const r=await fetch("/api/local/v43/reserve",{
    method:"POST",cache:"no-store",credentials:"omit",redirect:"error",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({request_id:requestId})
   });
   if(!r.ok)throw Error("hold_unconfirmed");
   const x=await r.json();
   if(x.ok!==true||x.provider_payment_verified!==false||
      x.reservation?.request_id!==requestId)
     throw Error("invalid_hold_reply");
   setHold(x.reservation);
   setHoldMessage("کاڵا و نرخ بۆ 15 خولەک پارێزراون؛ هیچ پارەیەکی بانکی وەرنەگیراوە.");
  }catch{setHoldMessage("دۆخی حجزی کۆگا نادیارە؛ دووبارە دۆخ بپشکنە.");}
  finally{setBusy(false);}
 };
 const save=async()=>{
  if(busy||plan||!verified||!valid||external===null)return;
  setBusy(true);setStatus("پلانی چاوەڕوان تۆمار دەکرێت...");
  onCashCheckoutAllowed(false);
  try{
   const r=await fetch("/api/local/v41/tender-plan",{
    method:"POST",cache:"no-store",credentials:"omit",redirect:"error",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({request_id:requestId,cash_minor:cashNum,
      external_minor:external,external_method:external===0?"none":method})
   });
   if(!r.ok)throw Error("unconfirmed");
   const x=await r.json();
   if(x.ok!==true||x.external_settlement_supported!==false||
     x.plan?.request_id!==requestId||x.plan?.state!==(external>0?"external_unverified":"cash_ready"))
     throw Error("invalid_confirmation");
   setPlan(x.plan);onCashCheckoutAllowed(external===0);
   setStatus(external>0?
     "بانک پشتڕاست نەکراوە؛ داواکاری تەنها پلانە و فرۆشتن/چاپ/کۆگا ڕاگیراون.":
     "تەنها نەختینە تۆمار کرا و دەتوانیت هەمان داواکاریی V31 تەواو بکەیت.");
  }catch{setStatus("دۆخی تۆمارکردنی پلان نادیارە؛ پشکنینی دووبارە بکە، دوو پلان دروست مەکە.");}
  finally{setBusy(false);}
 };
 return <section dir="rtl" aria-label="پلانی پارەدانی تێکەڵی V41" style={{
  border:"2px solid #b45309",borderRadius:9,padding:12,marginTop:12}}>
  <strong>V41 — پلانکردنی نەختینە + بانک (تەنها تاقیکردنەوە)</strong>
  <p>هیچ پەیوەندییەکی پشتڕاستکراوی کارت/بانک نییە. بەشی بانکی هەرگیز بە پارەی وەرگیراو دانانرێت.</p>
  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
   <label>نەختینە بە IQD
    <input aria-label="نەختینەی پلانی تێکەڵ" inputMode="numeric"
     disabled={busy||Boolean(plan)||!verified} value={cash}
     onChange={e=>setCash(e.target.value)}/>
   </label>
   <span>بەشی بانکی: {external===null?"—":external.toLocaleString("en-US")} IQD</span>
   <label>جۆری بانکی
    <select aria-label="جۆری بانکیی پلان" disabled={busy||Boolean(plan)||!verified}
     value={method} onChange={e=>setMethod(e.target.value as "card"|"bank_transfer")}>
     <option value="card">کارت</option>
     <option value="bank_transfer">گواستنەوەی بانکی</option>
    </select>
   </label>
   <button type="button" disabled={busy||Boolean(plan)||!verified||!valid}
    onClick={()=>void save()}>تۆمارکردنی پلان بەبێ فرۆشتن</button>
   <button type="button" disabled={busy} onClick={()=>void refresh()}>
    پشکنینی دۆخی پلان
   </button>
  </div>
  {v43&&plan?.state==="external_unverified"&&<div style={{marginTop:10}}>
   <button type="button" disabled={busy||Boolean(hold)} onClick={()=>void reserve()}>پاراستنی کۆگا و نرخ بۆ بانکی چاوەڕوان</button>
   <button type="button" disabled={busy} onClick={()=>void refreshHold()}>پشکنینی حجزی کۆگا</button>
   {hold&&<div>دۆخی کۆگا: {hold.state} — {hold.expires_at}</div>}
   <div role="status">{holdMessage}</div>
  </div>}
  {plan&&<div>دۆخ: {plan.state==="external_unverified"?"بانکی پشتڕاست نەکراوە":"نەختینەی ئامادە"}</div>}
  <div role="status" style={{fontWeight:750,marginTop:8}}>{status}</div>
 </section>;
};
