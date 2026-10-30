import React,{useState} from "react";
import {loginLocal} from "../localPilotV24";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Line={sale_id:string;line_no:number;name_snapshot:string;
 quantity_base_units:string|number;returned_base_units:string|number;
 line_total_minor:string|number;refunded_minor:string|number;fully_refunded:boolean};
export const LocalV40PartialRefundPanel:React.FC<{
 store:string;token:string;shiftId:string
}>=({store,token,shiftId})=>{
 const [saleId,setSaleId]=useState("");
 const [lines,setLines]=useState<Line[]>([]);
 const [lineNo,setLineNo]=useState(0);
 const [qty,setQty]=useState("");
 const [restock,setRestock]=useState(false);
 const [reason,setReason]=useState("");
 const [approver,setApprover]=useState("");
 const [password,setPassword]=useState("");
 const [refundId,setRefundId]=useState(()=>crypto.randomUUID());
 const [frozen,setFrozen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const selected=lines.find(x=>x.line_no===lineNo);
 const remaining=selected?Number(selected.quantity_base_units)-Number(selected.returned_base_units):0;
 const validQty=/^[1-9][0-9]*$/.test(qty)&&Number.isSafeInteger(Number(qty))&&Number(qty)<=remaining;
 const load=async()=>{
  if(busy||frozen||!uuid.test(saleId))return;
  setBusy(true);setMessage("");setLines([]);setLineNo(0);setQty("");
  try{
   const r=await fetch("/api/local/v40/refundable-lines?sale_id="+saleId,{
    headers:{Authorization:"Bearer "+token},cache:"no-store",
    credentials:"omit",redirect:"error"});
   if(!r.ok)throw Error("missing");
   const data=await r.json();
   if(data.ok!==true||!Array.isArray(data.lines))throw Error("invalid");
   setLines(data.lines);
  }catch{setMessage("ڕیزەکانی پسووڵە لە PostgreSQL پشتڕاست نەکرانەوە.");}
  finally{setBusy(false);}
 };
 const submit=async()=>{
  if(busy||!uuid.test(saleId)||!selected||!validQty||
    reason.trim().length<3||!approver.trim()||!password)return;
  const secret=password;setPassword("");setBusy(true);setMessage("");
  try{
   const m=await loginLocal(store,approver,secret);
   if(!["owner","manager"].includes(m.role))throw Error("manager_required");
   const r=await fetch("/api/local/v40/partial-refund",{
    method:"POST",cache:"no-store",credentials:"omit",redirect:"error",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,
      "x-zhirox-manager-token":m.token},
    body:JSON.stringify({refund_id:refundId,sale_id:saleId,line_no:lineNo,
     shift_id:shiftId,quantity_base_units:Number(qty),restock,reason:reason.trim()})
   });
   if(!r.ok)throw Error("unconfirmed_refund");
   const result=await r.json();
   if(result.ok!==true||result.refund?.refund_id!==refundId||
      Number(result.refund?.quantity_base_units)!==Number(qty))
    throw Error("unverified_response");
   setMessage("گەڕاندنەوەی بەشی کاڵا لە PostgreSQL پشتڕاست کرا؛ بڕی IQD لە سێرڤەر هەژمار کرا.");
   setRefundId(crypto.randomUUID());setFrozen(false);setLines([]);
   setLineNo(0);setQty("");setSaleId("");setReason("");setRestock(false);
  }catch{
   setFrozen(true);
   setMessage("ئەنجام نادیارە؛ هەمان ناسنامە و بڕە قوفڵکراوەکە دووبارە بنێرە بە ڕەزامەندی بەڕێوەبەر.");
  }finally{setBusy(false);}
 };
 return <section dir="rtl" aria-label="گەڕاندنەوەی بەشی کاڵای V40" style={{
  border:"1px solid #6b7280",borderRadius:9,padding:12,marginTop:12}}>
  <strong>V40 — گەڕاندنەوەی بەشی ڕیزی پسووڵە (تەنها تاقیکردنەوە)</strong>
  <p>بڕ: دانەی بنەڕەتی یان گرام؛ نرخ و کۆی گەڕاندنەوە تەنها سێرڤەر هەژمار دەکات.</p>
  <label>ناسنامەی پسووڵە
   <input aria-label="ناسنامەی پسووڵە بۆ بەشی گەڕاندنەوە" value={saleId} disabled={busy||frozen}
    onChange={e=>{setSaleId(e.target.value);setLines([]);setLineNo(0);}}/>
  </label>
  <button type="button" disabled={busy||frozen||!uuid.test(saleId)} onClick={()=>void load()}>
   پشکنینی بڕی ماوەی پسووڵە
  </button>
  {lines.length>0&&<div>
    <label>ڕیزی ڕاستەقینە
     <select aria-label="ڕیزی بەشی گەڕاندنەوە" value={lineNo} disabled={busy||frozen}
      onChange={e=>{setLineNo(Number(e.target.value));setQty("");}}>
      <option value={0}>ڕیز هەڵبژێرە</option>
      {lines.map(x=><option key={x.line_no} value={x.line_no}
        disabled={x.fully_refunded||Number(x.quantity_base_units)<=Number(x.returned_base_units)}>
        {x.line_no} — {x.name_snapshot} — ماوە: {Number(x.quantity_base_units)-Number(x.returned_base_units)}
      </option>)}
     </select>
    </label>
    {selected&&<div>
      <label>بڕی گەڕاندنەوە بە یەکەی بنەڕەتی
       <input aria-label="بڕی بەشی گەڕاندنەوە" value={qty} inputMode="numeric"
        disabled={busy||frozen} onChange={e=>setQty(e.target.value)}/>
      </label>
      <span>زۆرترین بڕی ماوە: {remaining.toLocaleString("en-US")}</span>
      <label>گەڕاندنەوە بۆ کۆگا
       <input type="checkbox" disabled={busy||frozen} checked={restock}
        onChange={e=>setRestock(e.target.checked)}/>
      </label>
      <label>هۆکار
       <input aria-label="هۆکاری بەشی گەڕاندنەوە" disabled={busy||frozen} value={reason}
        maxLength={240} onChange={e=>setReason(e.target.value)}/>
      </label>
    </div>}
   </div>}
  {(selected||frozen)&&<div>
    <label>بەڕێوەبەر
     <input aria-label="بەڕێوەبەری بەشی گەڕاندنەوە" disabled={busy||frozen}
       value={approver} onChange={e=>setApprover(e.target.value)}/>
    </label>
    <label>وشەی نهێنی ڕەزامەندی
     <input aria-label="وشەی نهێنی بەشی گەڕاندنەوە" type="password"
       value={password} autoComplete="off" disabled={busy}
       onChange={e=>setPassword(e.target.value)}/>
    </label>
    <button type="button" disabled={busy||!validQty||reason.trim().length<3||!password||!approver}
      onClick={()=>void submit()}>{frozen?"دووبارە ناردنی هەمان گەڕاندنەوە":"پەسەندکردنی بەشی گەڕاندنەوە"}</button>
   </div>}
  {message&&<div role="status">{message}</div>}
 </section>;
};
