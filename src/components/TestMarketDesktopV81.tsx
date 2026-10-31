import React,{useEffect,useState} from "react";
import {MODULE_SPECS} from "./CardIcon";
import "../testMarketV81.css";

// V82: all 12 modules / 48 semantic submodules are navigable, but financial
// writes remain blocked. Every value comes from the isolated PostgreSQL API.
// No AppContext, browser demo data, direct PG credentials or production fallback.
type Login={token:string;role:"owner"|"manager"|"cashier";store_name:string};
type Column={key:string;label:string;format?:string};
type SectionResponse={
 ok?:boolean;status?:string;source?:string;write_enabled?:boolean;
 section?:{id:string;title:string;module_id:number};
 columns?:Column[];rows?:Record<string,unknown>[];
 note?:string;entries?:Record<string,unknown>[];
};
const money=(n:unknown)=>Number(n||0).toLocaleString("en-US")+" IQD";
const num=(n:unknown)=>Number(n||0).toLocaleString("en-US");
const text=(v:unknown)=>typeof v==="string"||typeof v==="number"?String(v):"—";
const rows=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?
 v.filter((x):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x)):[];
const fmt=(v:unknown,kind?:string)=>{
 if(kind==="money")return money(v);
 if(kind==="number")return num(v);
 if(kind==="date")return v?new Date(String(v)).toLocaleString("en-GB"):"—";
 if(kind==="bool")return v?"بەڵێ":"نەخێر";
 if(kind==="debt_kind")return v==="opening_debt"?"قەرزی تۆمارکراو":"پارەدانی ژمێریاری (تاقیکردنەوە)";
 return text(v);
};
const errors:Record<string,string>={
 login_required:"ماوەی چوونەژوورەوە کۆتایی هاتووە.",
 manager_required:"ئەم ژێربەشە تەنها بۆ خاوەن مارکێت و بەڕێوەبەرە.",
 test_market_not_available:"داتابەیسی مارکێتی تاقیکردنەوە بەردەست نییە.",
 local_database_unavailable:"داتابەیسی ناوخۆیی نەخوێندرایەوە.",
 invalid_login:"ناوی هەژمار یان وشەی نهێنی هەڵەیە.",
 invalid_credentials:"ناوی هەژمار یان وشەی نهێنی هەڵەیە.",
 not_found:"ژێربەشەکە نەدۆزرایەوە.",
 unknown_test_section:"ژێربەشەکە لە تۆماری داتابەیس نییە.",
 request_failed:"پەیوەندی بە PostgreSQL سەرکەوتوو نەبوو."
};
const api=async(path:string,token?:string,body?:object)=>{
 const response=await fetch("/api/local/v81/"+path,{
  method:body?"POST":"GET",credentials:"omit",cache:"no-store",
  headers:{"Accept":"application/json",...(token?{"Authorization":"Bearer "+token}:{}),
    ...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 if(!response.ok){
  const payload=await response.json().catch(()=>({error:"request_failed"})) as {error?:string};
  const reason=payload.error||"request_failed";
  throw Error(errors[reason]||errors.request_failed);
 }
 return await response.json() as SectionResponse & Record<string,unknown>;
};
export const TestMarketDesktopV81:React.FC=()=>{
 const [session,setSession]=useState<Login|null>(null);
 const [username,setUsername]=useState("test-market-owner");
 const [password,setPassword]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [moduleId,setModuleId]=useState<number|null>(null);
 const [sectionId,setSectionId]=useState<string|null>(null);
 const [data,setData]=useState<SectionResponse|null>(null);
 const [summary,setSummary]=useState<Record<string,unknown>|null>(null);
 const [detailId,setDetailId]=useState("");
 const [detailName,setDetailName]=useState("");
 const module=MODULE_SPECS.find(m=>m.id===moduleId);
 const section=module?.submodules.find(s=>s.iconName===sectionId);
 useEffect(()=>{
  if(!session||!sectionId)return;
  let cancelled=false;
  setBusy(true);setError("");setData(null);setSummary(null);
  const path=detailId?"customers/"+detailId+"/ledger":"sections/"+sectionId;
  const fetchSection=api(path,session.token);
  const fetchSummary=sectionId==="sales-trend"?api("overview",session.token):Promise.resolve(null);
  Promise.all([fetchSection,fetchSummary]).then(([result,total])=>{
   if(cancelled)return;
   setData(result);setSummary(total);
  }).catch(e=>{
   if(cancelled)return;
   setError((e as Error).message);
   if((e as Error).message===errors.login_required)setSession(null);
  }).finally(()=>{if(!cancelled)setBusy(false)});
  return()=>{cancelled=true};
 },[session,sectionId,detailId]);
 const login=async(e:React.FormEvent)=>{
  e.preventDefault();setError("");setBusy(true);
  try{
   const result=await api("login",undefined,{username:username.trim(),password});
   if(typeof result.token!=="string"||!["owner","manager","cashier"].includes(String(result.role)))
    throw Error(errors.invalid_login);
   setSession({token:result.token,role:result.role as Login["role"],store_name:String(result.store_name)});
   setPassword("");setModuleId(null);setSectionId(null);setData(null);
  }catch(e){setError((e as Error).message)}
  finally{setBusy(false)}
 };
 const chooseMain=(id:number|null)=>{
  setModuleId(id);setSectionId(id===null?null:MODULE_SPECS[id].submodules[0].iconName);
  setData(null);setSummary(null);setError("");setDetailId("");setDetailName("");
 };
 const chooseSub=(id:string)=>{
  // A second click on the already selected tab must not erase a completed
  // PostgreSQL read without changing the effect dependencies.
  if(sectionId===id&&!detailId)return;
  setSectionId(id);setData(null);setSummary(null);setError("");setDetailId("");setDetailName("");
 };
 const renderTable=(columns:Column[],entries:Record<string,unknown>[])=>(
  <div className="v81-table" role="region" aria-label={section?.label||detailName}>
   <table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}
     {(sectionId==="single-customer"||sectionId==="debt-book")&&<th>مێژوو</th>}
    </tr></thead><tbody>
    {entries.length?entries.map((entry,index)=><tr key={text(entry.id||entry.entry_id||entry.customer_id||entry.receipt_no||index)}>
      {columns.map(c=><td key={c.key}>{fmt(entry[c.key],c.format)}</td>)}
      {(sectionId==="single-customer"||sectionId==="debt-book")&&<td>
       <button type="button" onClick={()=>{
        const id=String(entry.customer_id||"");
        if(!id)return;
        setData(null);setDetailId(id);setDetailName(text(entry.display_name));
       }}>بینینی مامەڵەکان</button>
      </td>}
     </tr>):<tr><td colSpan={columns.length+((sectionId==="single-customer"||sectionId==="debt-book")?1:0)}
       className="v81-empty">هیچ تۆمارێک نییە</td></tr>}
    </tbody></table>
  </div>
 );
 return <div className="v81-root" data-v81-test-market="true" data-v82-all-sections="true" dir="rtl">
  <div className="v81-market-title">مارکێتی تاقیکردنەوە <span>PostgreSQL · TEST ONLY</span></div>
  {!session?
   <main className="v81-login-wrap">
    <form className="v81-login" onSubmit={login}>
     <h1>چوونەژوورەوەی مارکێتی تاقیکردنەوە</h1>
     <p>هەژماری جیاوازە؛ داتای کانی چنار بەکارناهێنرێت.</p>
     <label>ناوی هەژمار<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/></label>
     <label>وشەی نهێنی<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
     <button type="submit" disabled={busy}>{busy?"پشکنین...":"چوونە ژوورەوە"}</button>
     {error&&<p role="alert" className="v81-error">{error}</p>}
     <small>تەنها تاقیکردنەوە · کردارە داراییەکانی نووسینەوە ناچالاکن</small>
    </form>
   </main>
  :<>
   <div className="v81-first-row">
    <nav aria-label="بەشە سەرەکییەکان">
     <button type="button" className={moduleId===null?"selected":""} onClick={()=>chooseMain(null)}>سەرەتا</button>
     {MODULE_SPECS.map(m=><button type="button" key={m.id} data-module-id={m.id}
       className={moduleId===m.id?"selected":""} onClick={()=>chooseMain(m.id)}>{m.title}</button>)}
    </nav>
    <button type="button" onClick={()=>{setSession(null);setData(null);setSummary(null);setSectionId(null);setModuleId(null);setPassword("")}}>دەرچوون</button>
   </div>
   <nav className="v81-second-row" aria-label="ژێربەشەکان">
    {module?.submodules.map(sub=><button type="button" key={sub.iconName}
      data-sub-icon={sub.iconName} className={sectionId===sub.iconName?"selected":""}
      aria-current={sectionId===sub.iconName?"page":undefined}
      onClick={()=>chooseSub(sub.iconName)}>
      {sub.label}{sectionId===sub.iconName?" ✓":""}
    </button>)}
   </nav>
   <main className="v81-body">
    {section&&<header className="v81-page-heading"><h1>{detailId?"مێژووی قەرزی "+detailName:section.label}</h1>
     <span>تەنها خوێندنەوە · {session.role==="cashier"?"کاشێر":"خاوەن مارکێت"}</span>
    </header>}
    {busy&&<p role="status">زانیارییەکان لە PostgreSQL دەخوێندرێنەوە…</p>}
    {error&&<p role="alert" className="v81-error">{error}</p>}
    {data&&!busy&&summary&&sectionId==="sales-trend"&&<div className="v81-overview" data-testid="real-postgres-overview">
     <div><strong>ژمارەی فرۆشتن</strong><output>{num((summary.sales as Record<string,unknown>)?.sale_count)}</output></div>
     <div><strong>کۆی فرۆشتن</strong><output>{money((summary.sales as Record<string,unknown>)?.sale_total)}</output></div>
     <div><strong>کاڵاکان</strong><output>{num((summary.stock as Record<string,unknown>)?.product_count)}</output></div>
     <div><strong>کۆگای ماوە</strong><output>{num((summary.stock as Record<string,unknown>)?.stock_total)}</output></div>
     {Boolean(summary.customers)&&<div><strong>قەرزی ماوە</strong><output>{money((summary.customers as Record<string,unknown>)?.debt_total)}</output></div>}
    </div>}
    {data&&!busy&&section&&<section className="v82-section" data-section-id={sectionId} data-testid="v82-section">
      <div className="v82-section-meta">
       <span className={data.status==="read_only"?"v82-live":"v82-planned"}>
         {detailId?"مێژووی ڕاستەقینە":data.status==="read_only"?"داتای PostgreSQL · تەنها خوێندنەوە":"ئەم تایبەتمەندییە هێشتا تەواو نییە"}
       </span>
       {detailId&&<button type="button" onClick={()=>{setDetailId("");setDetailName("");setData(null)}}>گەڕانەوە بۆ کڕیاران</button>}
      </div>
      {data.note&&<p className="v82-note">{data.note}</p>}
      {data.status==="planned"?<div className="v82-unavailable" role="status">
       ژێربەشی «{section.label}» پەڕەی تایبەتی خۆی هەیە؛ بەڵام داتابەیس و کردارەکانی هێشتا تەواو نەکراون.
      </div>:renderTable(
        detailId?[
         {key:"entry_type",label:"جۆری مامەڵە",format:"debt_kind"},
         {key:"amount_minor",label:"بڕ",format:"money"},
         {key:"reference",label:"وردەکاری"},
         {key:"created_at",label:"بەروار",format:"date"}
        ]:data.columns||[],
        rows(detailId?data.entries:data.rows)
      )}
     </section>}
    <p className="v81-footnote">
     هەموو 48 ژێربەشەکە دەتوانرێت بکرێنەوە؛ هیچ داتای Demo یان مامەڵەی ساختە جێگرەوە ناکرێت. هیچ فرۆشتن، پارەدان یان سڕینەوەیەک لێرە جێبەجێ نابێت.
    </p>
   </main>
  </>}
 </div>;
};
