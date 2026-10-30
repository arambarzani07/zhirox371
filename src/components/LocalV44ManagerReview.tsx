import React,{useState} from "react";
import {loginLocal} from "../localPilotV24";
type Exception={
 request_id:string;cashier_id:string;exception_code:string;
 cash_minor:string|number;external_minor:string|number;
 expected_total_minor:string|number;reservation_state:string|null;
 expires_at:string|null;evidence_recorded:boolean;review_count:number|string;
};
const reason=(code:string)=>({
 evidence_without_committed_sale:"بەڵگەی داتابەیس هەیە، فرۆشتن تەواو نەکراوە — پشکنینی فەوری",
 cancelled_with_external_evidence:"مامەڵە هەڵوەشێندراوە، بەڵگەی داتابەیس هەیە",
 expired_unresolved_hold:"حجزی کۆگا بەسەرچووە — پشکنینی پارە و کۆگا",
 active_unverified_hold:"حجزی چالاک، بانکی پشتڕاست نەکراو",
 external_quote_without_hold:"پلانی بانکی بەبێ حجزی کۆگا",
 cancelled_hold_with_prepared_checkout:"حجز هەڵوەشاوەتەوە، داواکاری هێشتا چاوەڕوانە",
 other_pending_external_case:"مامەڵەی بانکی چاوەڕوان"
} as Record<string,string>)[code]||"پێویستی بە پشکنینی زیاتر";
const categories=[
 ["investigating","پشکنین دەکرێت"],
 ["contacted_provider","پەیوەندی بە دابینکەر کرا"],
 ["awaiting_bank_response","چاوەڕوانی وەڵامی بانک"],
 ["requires_supervisor_followup","پێویستی بە چاودێری بەڕێوەبەرە"],
 ["hardware_network_check","پشکنینی ئامێر و تۆڕ"]
] as const;
const number=(x:string|number)=>Number(x).toLocaleString("en-US");
export const LocalV44ManagerReview:React.FC<{store:string}>=({store})=>{
 const [name,setName]=useState("");
 const [password,setPassword]=useState("");
 const [managerToken,setManagerToken]=useState("");
 const [cases,setCases]=useState<Exception[]>([]);
 const [selected,setSelected]=useState("");
 const [category,setCategory]=useState<string>("investigating");
 const [note,setNote]=useState("");
 const [noteId,setNoteId]=useState(()=>crypto.randomUUID());
 const [frozen,setFrozen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("بۆ بینینی مامەڵە بانکییەکان، بەڕێوەبەر جیاواز بچێتە ژوورەوە.");
 const login=async()=>{
  if(busy||!name||!password)return;
  setBusy(true);setMessage("");
  const secret=password;setPassword("");
  try{
   const session=await loginLocal(store,name,secret);
   if(!["manager","owner"].includes(session.role))throw Error("manager_only");
   setManagerToken(session.token);
   setMessage("چوونەژوورەوەی بەڕێوەبەر پشتڕاست کرا؛ لیستی مامەڵەکان بخوێنەوە.");
  }catch{setManagerToken("");setMessage("تەنها بەڕێوەبەری ڕەسەن دەتوانێت ئەم لیستە ببینێت.");}
  finally{setBusy(false);}
 };
 const load=async()=>{
  if(busy||!managerToken)return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/local/v44/bank-exceptions?limit=100",{
    cache:"no-store",credentials:"omit",redirect:"error",
    headers:{Authorization:"Bearer "+managerToken}});
   if(!r.ok)throw Error("unavailable");
   const data=await r.json();
   if(!data.ok||data.provider_payment_verified!==false||
     !data.operator_actions_are_notes_only||!Array.isArray(data.cases))
     throw Error("invalid");
   setCases(data.cases);
   setMessage("تەنها پشکنینی مێژوو؛ هیچ بڕێکی بانکی لێرە پەسەند ناکرێت.");
  }catch{setCases([]);setMessage("لیستی مامەڵەکان پشتڕاست نەکراوە؛ مامەڵەیەک بە پارەدراو مەزانە.");}
  finally{setBusy(false);}
 };
 const save=async()=>{
  if(busy||!managerToken||!selected||note.trim()!==note||
    note.length<10||note.length>500)return;
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/local/v44/review-notes",{
    method:"POST",cache:"no-store",credentials:"omit",redirect:"error",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+managerToken},
    body:JSON.stringify({request_id:selected,note_id:noteId,category,note})
   });
   if(!r.ok)throw Error("unconfirmed");
   const x=await r.json();
   if(!x.ok||x.review?.note_id!==noteId||
     x.bank_payment_confirmed!==false||x.funds_refunded!==false||
     x.inventory_hold_released!==false)throw Error("invalid");
   setFrozen(false);setNote("");setNoteId(crypto.randomUUID());
   setMessage("تێبینی بەڕێوەبەر بە شێوەی نەگۆڕ لە PostgreSQL تۆمار کرا. ئەمە پشتڕاستکردنەوەی بانک نییە.");
  }catch{
   setFrozen(true);
   setMessage("ئەنجامی تێبینی نادیارە؛ هەمان ناسنامە و هەمان دەق دووبارە بنێرە. بڕی پارە مەگۆڕە.");
  }finally{setBusy(false);}
 };
 return <section dir="rtl" aria-label="چاودێری بانکی V44 — بەڕێوەبەر"
 style={{border:"2px solid #64748b",borderRadius:10,padding:12,marginTop:12}}>
 <strong>V44 — مامەڵە بانکییە پێویست‌بە‌پشکنینەکان (تاقیکردنەوە)</strong>
 <p>دەستگەیشتنی بەڕێوەبەر جیاوازە؛ هیچ دوگمەیەک بۆ «پارەدراو»، «پارە گەڕێندرایەوە» یان «حجز ئازاد کرا» نییە.</p>
 {!managerToken?<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
  <label>ناوی بەڕێوەبەر <input aria-label="ناوی بەڕێوەبەری V44"
   value={name} onChange={e=>setName(e.target.value)}/></label>
  <label>وشەی نهێنی بەڕێوەبەر <input type="password"
   aria-label="وشەی نهێنی بەڕێوەبەری V44" autoComplete="off"
   value={password} onChange={e=>setPassword(e.target.value)}/></label>
  <button type="button" disabled={busy||!name||!password}
   onClick={()=>void login()}>چوونەژوورەوەی بەڕێوەبەر</button>
 </div>:<div>
  <button type="button" disabled={busy} onClick={()=>void load()}>نوێکردنەوەی لیستی مامەڵە</button>
  <button type="button" disabled={busy} onClick={()=>{
   setManagerToken("");setCases([]);setSelected("");setNote("");setFrozen(false);
  }}>دەرچوونی بەڕێوەبەر</button>
  <div style={{overflowX:"auto"}}>
   <table style={{width:"100%",marginTop:8,borderCollapse:"collapse"}}>
    <thead><tr><th>داواکاری</th><th>دۆخ</th><th>بانک</th><th>نەختینە</th><th>تێبینی</th></tr></thead>
    <tbody>{cases.map(x=><tr key={x.request_id}>
     <td><button type="button" disabled={busy||frozen} onClick={()=>setSelected(x.request_id)}>
       {x.request_id.slice(0,8)}</button></td>
     <td>{reason(x.exception_code)}</td>
     <td>{number(x.external_minor)} IQD</td>
     <td>{number(x.cash_minor)} IQD</td>
     <td>{x.review_count}</td>
    </tr>)}</tbody>
   </table>
  </div>
  {selected&&<div style={{marginTop:12}}>
   <strong>تێبینی بۆ داواکاری {selected.slice(0,8)}</strong>
   <label>جۆری پشکنین <select aria-label="جۆری پشکنینی V44" value={category}
     disabled={busy||frozen} onChange={e=>setCategory(e.target.value)}>
    {categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select></label>
   <label>تێبینی بەڕێوەبەر <textarea aria-label="تێبینی بانکی V44"
    value={note} disabled={busy||frozen} maxLength={500}
    onChange={e=>setNote(e.target.value)}/></label>
   <button type="button" disabled={busy||note.length<10}
    onClick={()=>void save()}>{frozen?"دووبارە ناردنی هەمان تێبینی":"تۆمارکردنی تێبینی (نەک پارەدان)"}</button>
  </div>}
 </div>}
 <div role="status">{message}</div>
 </section>;
};
