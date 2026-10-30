import React,{useState} from "react";
import {loginLocal} from "../localPilotV24";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Line={sale_id:string;line_no:number;name_snapshot:string;line_total_minor:string|number;
 quantity_base_units:string|number;refunded:boolean};
const money=(n:string|number)=>Number(n).toLocaleString("en-US")+" IQD";

// Manager password/token are never persisted in state, storage, or query string.
// A manager is independently authenticated for each physical refund approval.
// This UI stays behind V36/37/38/39 *disposable* LAN flags.
export const LocalV39RefundPanel:React.FC<{
 store:string;token:string;shiftId:string
}>=({store,token,shiftId})=>{
 const [saleId,setSaleId]=useState("");
 const [lines,setLines]=useState<Line[]>([]);
 const [line,setLine]=useState(0);
 const [restock,setRestock]=useState(false);
 const [reason,setReason]=useState("");
 const [managerUser,setManagerUser]=useState("");
 const [managerPassword,setManagerPassword]=useState("");
 const [refundId,setRefundId]=useState(()=>crypto.randomUUID());
 const [frozen,setFrozen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const review=async()=>{
  if(!uuid.test(saleId)||busy||frozen)return;
  setBusy(true);setMessage("");setLines([]);setLine(0);
  try{
   const response=await fetch("/api/local/v39/refundable-lines?sale_id="+saleId,{
    headers:{Authorization:"Bearer "+token},cache:"no-store",
    credentials:"omit",redirect:"error"});
   if(!response.ok)throw Error("missing");
   const data=await response.json();
   if(data.ok!==true||!Array.isArray(data.lines)||data.lines.length>100)
    throw Error("invalid");
   setLines(data.lines);
  }catch{setMessage("پسووڵەی پشتڕاستکراو نەدۆزرایەوە.");}
  finally{setBusy(false);}
 };
 const approve=async()=>{
  if(busy||!line||!uuid.test(saleId)||reason.trim().length<3||
     reason.trim().length>240||!managerUser.trim()||!managerPassword)return;
  setBusy(true);setMessage("");
  const password=managerPassword;setManagerPassword("");
  try{
   // The approver credential is used once, as a separate signed session.
   const approval=await loginLocal(store,managerUser,password);
   if(!["owner","manager"].includes(approval.role))throw Error("manager_required");
   const response=await fetch("/api/local/v39/refund",{
    method:"POST",cache:"no-store",credentials:"omit",redirect:"error",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,
     "x-zhirox-manager-token":approval.token},
    body:JSON.stringify({refund_id:refundId,sale_id:saleId,shift_id:shiftId,
      line_no:line,restock,reason:reason.trim()})
   });
   if(!response.ok)throw Error("refund_status_uncertain");
   const payload=await response.json();
   if(payload.ok!==true||payload.refund?.refund_id!==refundId||
      payload.refund?.line_no!==line)throw Error("refund_reply_unverified");
   setMessage("گەڕاندنەوە لە PostgreSQL پشتڕاست کرایەوە؛ بڕەکە تەنها لە پسووڵەی ئەسڵی وەرگیرا.");
   setLines([]);setLine(0);setReason("");setRestock(false);setSaleId("");
   setFrozen(false);setRefundId(crypto.randomUUID());
  }catch{
   setFrozen(true);
   setMessage("ئەنجام نادیارە. هەمان داواکاری بە هەمان ناسنامە دووبارە بنێرە و بەڕێوەبەر دووبارە ڕەزامەندی بدات؛ زانیاری مەگۆڕە.");
  }finally{setBusy(false);}
 };
 return <section dir="rtl" aria-label="گەڕاندنەوەی V39 بە ڕەزامەندی بەڕێوەبەر"
  style={{border:"1px solid #64748b",padding:12,marginTop:12,borderRadius:9}}>
  <strong>V39 — گەڕاندنەوەی تەواوی ڕیزی پسووڵە (تەنها تاقیکردنەوە)</strong>
  <p>بۆ پارەی نەختینەیی، تەنها بە ڕەزامەندی بەڕێوەبەرێکی جیاواز.</p>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <label>ناسنامەی فرۆشتن
    <input aria-label="ناسنامەی فرۆشتنی گەڕاندنەوە" value={saleId}
     disabled={busy||frozen} onChange={e=>{setSaleId(e.target.value);setLines([]);setLine(0);}}/>
   </label>
   <button type="button" disabled={busy||frozen||!uuid.test(saleId)} onClick={()=>void review()}>
    پشکنینی ڕیزەکانی پسووڵە
   </button>
  </div>
  {lines.length>0&&<div style={{marginTop:8}}>
   <label>ڕیزی گەڕاندنەوە
    <select aria-label="ڕیزی گەڕاندنەوە" value={line} disabled={busy||frozen}
     onChange={e=>setLine(Number(e.target.value))}>
     <option value={0}>ڕیز هەڵبژێرە</option>
     {lines.map(l=><option key={l.line_no} value={l.line_no} disabled={l.refunded}>
      {l.line_no} — {l.name_snapshot} — {money(l.line_total_minor)} {l.refunded?"(گەڕێندراوەتەوە)":""}
     </option>)}
    </select>
   </label>
   <label>گەڕاندنەوە بۆ کۆگا
    <input type="checkbox" checked={restock} disabled={busy||frozen}
     onChange={e=>setRestock(e.target.checked)}/>
   </label>
   <label>هۆکاری گەڕاندنەوە
    <input aria-label="هۆکاری گەڕاندنەوە" value={reason} disabled={busy||frozen}
     maxLength={240} onChange={e=>setReason(e.target.value)}/>
   </label>
  </div>}
  {(line>0||frozen)&&<div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
   <label>ناوی بەڕێوەبەر
    <input aria-label="ناوی بەڕێوەبەری ڕەزامەند" value={managerUser}
     disabled={busy||frozen} onChange={e=>setManagerUser(e.target.value)}/>
   </label>
   <label>وشەی نهێنی بەڕێوەبەر
    <input aria-label="وشەی نهێنی ڕەزامەندی" type="password"
     autoComplete="off" value={managerPassword}
     disabled={busy} onChange={e=>setManagerPassword(e.target.value)}/>
   </label>
   <button type="button" disabled={busy||!line||!managerPassword||!managerUser||reason.trim().length<3}
    onClick={()=>void approve()}>{frozen?"دووبارە هەمان داواکاری بە ڕەزامەندی بنێرە":"پەسەندکردنی گەڕاندنەوە"}</button>
  </div>}
  {message&&<div role="status">{message}</div>}
 </section>;
};
