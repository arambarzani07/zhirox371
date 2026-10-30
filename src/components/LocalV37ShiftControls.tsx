import React,{useEffect,useState} from "react";
import {LocalV38CashMovements} from "./LocalV38CashMovements";
import {LocalV39RefundPanel} from "./LocalV39RefundPanel";
import {LocalV40PartialRefundPanel} from "./LocalV40PartialRefundPanel";
type Shift={shift_id:string;state:"open"|"closed";opening_minor:string|number;
 cash_sales_minor?:string|number;expected_minor?:string|number;
 counted_minor?:string|number;variance_minor?:string|number};
const money=(n:string|number)=>Number(n).toLocaleString("en-US")+" IQD";
const cash=(n:string)=>/^(0|[1-9][0-9]{0,12})$/.test(n)&&Number(n)<=9999999999999;
export const LocalV37ShiftControls:React.FC<{
 token:string;store:string;onShiftOpen:(value:boolean)=>void;
}>=({token,store,onShiftOpen})=>{
 const [shift,setShift]=useState<Shift|null>(null);
 const v38=import.meta.env.PROD&&import.meta.env.VITE_V38_CASH_LEDGER==="true";
 const v39=v38&&import.meta.env.VITE_V39_REFUNDS==="true";
 const v40=v39&&import.meta.env.VITE_V40_PARTIAL_REFUNDS==="true";
 const [closedReport,setClosedReport]=useState<(Shift&{cash_in_minor?:string|number;cash_out_minor?:string|number;expense_minor?:string|number})|null>(null);
 const [opening,setOpening]=useState("0");
 const [counted,setCounted]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [verified,setVerified]=useState(false);
 const [pendingId,setPendingId]=useState(()=>crypto.randomUUID());
 const fetchShift=async()=>{
  onShiftOpen(false);setVerified(false);setError("");setBusy(true);
  try{
   const res=await fetch("/api/local/v37/shift",{cache:"no-store",credentials:"omit",redirect:"error",
    headers:{Authorization:"Bearer "+token}});
   if(!res.ok)throw Error("shift_unavailable");
   const body=await res.json();
   if(body?.ok!==true||body.shift&&
      (body.shift.state!=="open"||typeof body.shift.shift_id!=="string"))
    throw Error("invalid_shift_response");
   setShift(body.shift);onShiftOpen(Boolean(body.shift));setVerified(true);
  }catch{setShift(null);setError("دۆخی شێفت پشتڕاست نەکراوەتەوە؛ فرۆشتن ڕاگیراوە.");}
  finally{setBusy(false);}
 };
 useEffect(()=>{
  let live=true;
  const start=async()=>{
   onShiftOpen(false);setVerified(false);setBusy(true);
   try{
    const res=await fetch("/api/local/v37/shift",{cache:"no-store",credentials:"omit",redirect:"error",
     headers:{Authorization:"Bearer "+token}});
    if(!res.ok)throw Error("unavailable");
    const body=await res.json();
    if(body.ok!==true||body.shift&&body.shift.state!=="open")
     throw Error("bad_shift");
    if(live){setShift(body.shift);setVerified(true);onShiftOpen(Boolean(body.shift));}
   }catch{if(live){setShift(null);setError("دۆخی شێفت نادیارە؛ فرۆشتن قەدەغەیە.");}}
   finally{if(live)setBusy(false);}
  };
  void start();
  return()=>{live=false;onShiftOpen(false);};
 },[token,onShiftOpen]);
 const change=async(kind:"open"|"close")=>{
  if(busy)return;
  const isOpening=kind==="open";
  const amount=isOpening?opening:counted;
  if(!cash(amount)||(!isOpening&&!shift)){setError("بڕی پارە بە ژمارەی تەواوی IQD بنووسە.");return;}
  setBusy(true);setError("");onShiftOpen(false);
  try{
   const payload=isOpening?{shift_id:pendingId,opening_minor:Number(amount)}:
    {shift_id:shift!.shift_id,counted_minor:Number(amount)};
   const res=await fetch("/api/local/v37/shift/"+kind,{method:"POST",
    cache:"no-store",credentials:"omit",redirect:"error",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(payload)});
   if(!res.ok)throw Error("shift_operation_unconfirmed");
   const body=await res.json();
   if(body.ok!==true||!body.shift||body.shift.shift_id!==payload.shift_id||
      body.shift.state!==(isOpening?"open":"closed"))
    throw Error("invalid_shift_reply");
   setShift(isOpening?body.shift:null);setClosedReport(isOpening?null:body.shift);setVerified(true);
   onShiftOpen(isOpening);
   if(!isOpening){setPendingId(crypto.randomUUID());setCounted("");}
  }catch{setShift(null);setVerified(false);
   setError("ئەنجام دڵنیا نییە؛ دۆخی شێفت نوێ بکەرەوە. هەمان مامەڵە دووبارە مەکە.");}
  finally{setBusy(false);}
 };
 return <section dir="rtl" aria-label="سندووق و شێفتی PostgreSQL"
  style={{border:"2px solid #94a3b8",borderRadius:10,padding:14,margin:"12px 0",background:"#fff"}}>
  <strong>V37 — شێفتی نەختینەی PostgreSQL (تاقیکردنەوە)</strong>
  <div role="status" style={{marginTop:8,fontWeight:750}}>
   {verified?(shift?"شێفت کراوە — فرۆشتنی نەختینە ڕێگەپێدراوە":
    "هیچ شێفتێک نەکراوەتەوە — فرۆشتن ڕاگیراوە"):"دۆخی شێفت هێشتا پشتڕاست نەکراوەتەوە"}
  </div>
  {closedReport&&!shift&&<div role="status" style={{marginTop:8,border:"1px solid #64748b",padding:8}}>
    <strong>ڕاپۆرتی کۆتایی شێفتی داخراو</strong>
    <div>سەرەتای سندووق: {money(closedReport.opening_minor)}</div>
    <div>کۆی فرۆشتن: {money(closedReport.cash_sales_minor??0)}</div>
    {v38&&<><div>پارەی هاتوو: {money(closedReport.cash_in_minor??0)}</div><div>پارەی دەرچوو: {money(closedReport.cash_out_minor??0)}</div><div>خەرجی: {money(closedReport.expense_minor??0)}</div></>}
    <div>کۆی چاوەڕوانکراو: {money(closedReport.expected_minor??0)}</div>
    <div>پارەی ژمێردراو: {money(closedReport.counted_minor??0)}</div>
    <div>جیاوازی: {money(closedReport.variance_minor??0)}</div>
   </div>}
  {shift?<div style={{marginTop:8}}>
    <div>سەرەتای سندووق: {money(shift.opening_minor)}</div>
    <label>پارەی ژمێردراو لە کۆتایی شێفت
     <input aria-label="پارەی ژمێردراو" value={counted} disabled={busy}
      onChange={e=>setCounted(e.target.value)} inputMode="numeric"
      style={{margin:8,padding:8,border:"1px solid #94a3b8"}}/>
    </label>
    <button type="button" disabled={busy||!cash(counted)}
     onClick={()=>void change("close")}>داخستنی شێفت و پشتڕاستکردنەوەی سندووق</button>
   </div>:<div style={{marginTop:8}}>
    <label>پارەی سەرەتای سندووق
     <input aria-label="پارەی سەرەتای سندووق" value={opening}
      disabled={busy||!verified} inputMode="numeric"
      onChange={e=>setOpening(e.target.value)}
      style={{margin:8,padding:8,border:"1px solid #94a3b8"}}/>
    </label>
    <button type="button" disabled={busy||!verified||!cash(opening)}
      onClick={()=>void change("open")}>کردنەوەی شێفت</button>
   </div>}
  {v38&&shift&&<LocalV38CashMovements token={token} shiftId={shift.shift_id}/>}
  {v39&&shift&&<LocalV39RefundPanel token={token} store={store} shiftId={shift.shift_id}/>}
  {v40&&shift&&<LocalV40PartialRefundPanel token={token} store={store} shiftId={shift.shift_id}/>}
  <button type="button" disabled={busy} onClick={()=>void fetchShift()}
   style={{margin:8}}>پشکنینی دۆخی شێفت</button>
  {error&&<div role="alert" style={{color:"#991b1b",fontWeight:800}}>{error}</div>}
 </section>;
};
