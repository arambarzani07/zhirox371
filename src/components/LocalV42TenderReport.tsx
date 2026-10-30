import React,{useEffect,useState} from "react";
type TenderReport={gross_sales_minor:string|number;cash_sales_minor:string|number;
 bank_sales_minor:string|number;cash_refunds_minor:string|number;
 expected_drawer_minor:string|number};
const money=(v:string|number)=>Number(v).toLocaleString("en-US")+" IQD";
export const LocalV42TenderReport:React.FC<{token:string;shiftId:string}>=({token,shiftId})=>{
 const [data,setData]=useState<TenderReport|null>(null);
 const [status,setStatus]=useState("پشکنینی ڕاپۆرت...");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   if(live){setBusy(true);setData(null);}
   try{
    const [summary,readiness]=await Promise.all([
     fetch("/api/local/v42/tender-report?shift_id="+shiftId,
      {cache:"no-store",credentials:"omit",redirect:"error",
       headers:{Authorization:"Bearer "+token}}),
     fetch("/api/local/v42/merchant-readiness",
      {cache:"no-store",credentials:"omit",redirect:"error",
       headers:{Authorization:"Bearer "+token}})
    ]);
    if(!summary.ok||!readiness.ok)throw Error("unavailable");
    const [s,r]=await Promise.all([summary.json(),readiness.json()]);
    if(s.ok!==true||!s.report||s.official_mixed_tender_enabled!==false||
      r.release_ready!==false||r.external_provider_integrated!==false)
     throw Error("invalid");
    if(live){setData(s.report);
      setStatus("پارەدانی بانکی فەرمی قوفڵە؛ هیچ پەیوەندییەکی پشتڕاستکراوی بانک نییە.");}
   }catch{if(live){setData(null);
      setStatus("ڕاپۆرت پشتڕاست نەکرایەوە؛ پشت بە داتای کۆن مەبەستە.");}}
   finally{if(live)setBusy(false);}
  };
  void load();return()=>{live=false;};
 },[token,shiftId]);
 return <section aria-label="ڕاپۆرتی جیاوازی نەختینە و بانک V42" dir="rtl"
  style={{border:"1px solid #94a3b8",padding:12,marginTop:12,borderRadius:9}}>
  <strong>V42 — ڕاپۆرتی جیاکراوەی نەختینە / بانک (تاقیکردنەوە)</strong>
  {data&&<div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginTop:10}}>
    <span>کۆی فرۆشتن: {money(data.gross_sales_minor)}</span>
    <span>فرۆشتنی نەختینە: {money(data.cash_sales_minor)}</span>
    <span>بەشی بانکی: {money(data.bank_sales_minor)}</span>
    <span>گەڕاندنەوەی نەختینە: {money(data.cash_refunds_minor)}</span>
    <strong>پارەی چاوەڕوانکراوی سندووق: {money(data.expected_drawer_minor)}</strong>
   </div>}
  <div role="status" style={{marginTop:8,fontWeight:750}}>{busy?"پشکنین...":status}</div>
 </section>;
};
