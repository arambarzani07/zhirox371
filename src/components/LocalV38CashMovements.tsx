import React,{useEffect,useState} from "react";
type Movement={entry_id:string;kind:"cash_in"|"cash_out"|"expense";
 amount_minor:string|number;reason:string};
type Summary={state:string;opening_minor:string|number;cash_sales_minor:string|number;
 cash_in_minor:string|number;cash_out_minor:string|number;expense_minor:string|number;
 expected_minor:string|number};
const cash=(s:string)=>/^[1-9][0-9]{0,12}$/.test(s)&&Number(s)<=9999999999999;
const money=(n:string|number)=>Number(n).toLocaleString("en-US")+" IQD";
export const LocalV38CashMovements:React.FC<{token:string;shiftId:string}> = ({token,shiftId})=>{
 const [kind,setKind]=useState<Movement["kind"]>("expense");
 const [amount,setAmount]=useState("");
 const [reason,setReason]=useState("");
 const [entryId,setEntryId]=useState(()=>crypto.randomUUID());
 const [locked,setLocked]=useState(false);
 const [busy,setBusy]=useState(false);
 const [summary,setSummary]=useState<Summary|null>(null);
 const [history,setHistory]=useState<Movement[]>([]);
 const [message,setMessage]=useState("");
 const read=async()=>{
  setBusy(true);
  try{
   const header={Authorization:"Bearer "+token};
   const [a,b]=await Promise.all([
    fetch("/api/local/v38/summary?shift_id="+shiftId,
     {headers:header,cache:"no-store",credentials:"omit",redirect:"error"}),
    fetch("/api/local/v38/movements?shift_id="+shiftId,
     {headers:header,cache:"no-store",credentials:"omit",redirect:"error"})
   ]);
   if(!a.ok||!b.ok)throw Error("unavailable");
   const [data,rows]=await Promise.all([a.json(),b.json()]);
   if(data.ok!==true||rows.ok!==true||!data.summary||!Array.isArray(rows.movements))
    throw Error("invalid_ledger_reply");
   setSummary(data.summary);setHistory(rows.movements);
  }catch{setSummary(null);setHistory([]);
   setMessage("ڕاپۆرتی سندووق پشتڕاست نەکراوەتەوە.");}
  finally{setBusy(false);}
 };
 useEffect(()=>{void read();},[shiftId,token]);
 const send=async()=>{
  if(busy||!cash(amount)||reason.trim().length<3||reason.trim().length>240)return;
  const payload={entry_id:entryId,shift_id:shiftId,kind,amount_minor:Number(amount),
   reason:reason.trim()};
  setBusy(true);setLocked(true);setMessage("");
  try{
   const res=await fetch("/api/local/v38/movement",{
    method:"POST",cache:"no-store",credentials:"omit",redirect:"error",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify(payload)
   });
   if(!res.ok)throw Error("unknown");
   const result=await res.json();
   if(result.ok!==true||result.movement?.entry_id!==entryId)
    throw Error("invalid_reply");
   // After confirmed write, allocate the NEXT UUID. A lost network response
   // keeps the original ID and frozen form to prevent double cash posting.
   setEntryId(crypto.randomUUID());setLocked(false);setAmount("");setReason("");
   setMessage("تۆمارکرا — بڕی پارە لە PostgreSQL پشتڕاست کرایەوە.");
   setBusy(false);void read();
  }catch{
   setMessage("ئەنجام دڵنیا نییە؛ هەمان داواکاری دووبارە بنێرە، بڕ و هۆکار مەگۆڕە.");
   setBusy(false);
  }
 };
 return <section dir="rtl" aria-label="تۆماری پارەی هاتوو و دەرچووی V38"
   style={{padding:12,border:"1px solid #64748b",borderRadius:9,marginTop:12}}>
  <strong>V38 — تۆماری نەختینەی ڕاستەقینە (ژینگەی تاقیکردنەوە)</strong>
  {summary&&<div aria-label="ڕاپۆرتی نەختینە" style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,margin:"12px 0"}}>
    <span>سەرەتای سندووق: {money(summary.opening_minor)}</span>
    <span>فرۆشتن: {money(summary.cash_sales_minor)}</span>
    <span>پارەی هاتوو: {money(summary.cash_in_minor)}</span>
    <span>پارەی دەرچوو: {money(summary.cash_out_minor)}</span>
    <span>خەرجی: {money(summary.expense_minor)}</span>
    <strong>پارەی چاوەڕوانکراو: {money(summary.expected_minor)}</strong>
  </div>}
  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
   <label>جۆر
    <select aria-label="جۆری جووڵەی پارە" value={kind} disabled={busy||locked}
     onChange={e=>setKind(e.target.value as Movement["kind"])}>
     <option value="expense">خەرجی</option>
     <option value="cash_in">پارەی هاتوو</option>
     <option value="cash_out">پارەی دەرچوو</option>
    </select>
   </label>
   <label>بڕی IQD
    <input aria-label="بڕی جووڵەی پارە" inputMode="numeric" value={amount}
      disabled={busy||locked} onChange={e=>setAmount(e.target.value)}/>
   </label>
   <label>هۆکار
    <input aria-label="هۆکاری جووڵەی پارە" value={reason} disabled={busy||locked}
      onChange={e=>setReason(e.target.value)} maxLength={240}/>
   </label>
   <button type="button" disabled={busy||(!locked&&(!cash(amount)||reason.trim().length<3))}
     onClick={()=>void send()}>{locked?"دووبارە ناردنی هەمان داواکاری":"تۆمارکردنی جووڵەی پارە"}</button>
   <button type="button" disabled={busy} onClick={()=>void read()}>نوێکردنەوەی ڕاپۆرت</button>
  </div>
  {message&&<div role="status" style={{marginTop:8,fontWeight:700}}>{message}</div>}
  <table style={{width:"100%",marginTop:8}}><thead><tr>
   <th>جۆر</th><th>بڕ</th><th>هۆکار</th></tr></thead><tbody>
   {history.map(m=><tr key={m.entry_id}><td>{m.kind==="expense"?"خەرجی":
    m.kind==="cash_in"?"پارەی هاتوو":"پارەی دەرچوو"}</td>
    <td>{money(m.amount_minor)}</td><td>{m.reason}</td></tr>)}
  </tbody></table>
 </section>;
};
