import React,{useEffect,useState} from "react";
import "../testMarketV81.css";

// This is an isolated test-market viewer, NOT the generic React Demo.
// Never import AppContext or browser-local financial storage. All values
// arrive only from the authenticated local PostgreSQL endpoint.
type Login={token:string;role:"owner"|"manager"|"cashier";store_name:string};
type View="overview"|"products"|"sales"|"customers"|"ledger";
type Data={ok:boolean;[key:string]:unknown};
const PRIMARY=["سەرەتا","کاشێر و فرۆشتن","کاڵاکان","کڕیاران و حسابەکان"];
const SUBS:Record<number,{id:View;name:string}[]>={
 1:[{id:"sales",name:"پسووڵەکان"}],
 2:[{id:"products",name:"لیستی کاڵاکان"}],
 3:[{id:"customers",name:"کڕیاران"},{id:"ledger",name:"قەرزەکان"}]
};
const money=(n:unknown)=>Number(n||0).toLocaleString("en-US")+" IQD";
const count=(n:unknown)=>Number(n||0).toLocaleString("en-US");
const text=(n:unknown)=>typeof n==="string"||typeof n==="number"?String(n):"—";
const rows=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v.filter(x=>x!==null&&typeof x==="object"):[];
const api=async(path:string,token?:string,body?:object)=>{
 const r=await fetch("/api/local/v81/"+path,{
  method:body?"POST":"GET",credentials:"omit",cache:"no-store",
  headers:{"Accept":"application/json",...(token?{"Authorization":"Bearer "+token}:{}),
   ...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 if(!r.ok)throw Error(r.status===401?"login_required":r.status===403?"manager_required":r.status===503?"db_unavailable":"request_failed");
 return await r.json() as Data;
};
const message=(v:string)=>({
 login_required:"پەیوەندییەکە کۆتایی هاتووە؛ دووبارە بچۆ ژوورەوە.",
 manager_required:"ئەم بەشە تەنها بۆ خاوەن مارکێت و بەڕێوەبەرە.",
 db_unavailable:"داتابەیسی ناوخۆیی بەردەست نییە؛ هیچ داتایەکی نمایشی جێگرەوە ناکرێت.",
 request_failed:"پەیوەندی لەگەڵ سێرڤەری تاقیکردنەوە سەرکەوتوو نەبوو.",
 bad_login:"هەژمار یان وشەی نهێنی هەڵەیە."
})[v]||v;

export const TestMarketDesktopV81:React.FC=()=>{
 const [session,setSession]=useState<Login|null>(null);
 const [user,setUser]=useState("test-market-owner");
 const [password,setPassword]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [main,setMain]=useState(0);
 const [view,setView]=useState<View>("overview");
 const [data,setData]=useState<Data|null>(null);
 const [selectedCustomer,setSelectedCustomer]=useState("");
 const [customerName,setCustomerName]=useState("");

 useEffect(()=>{
  if(!session)return;
  let cancelled=false;
  setBusy(true);setData(null);setError("");
  let path:string=view;
  if(view==="ledger"){
   if(!selectedCustomer){setBusy(false);return;}
   path="customers/"+selectedCustomer+"/ledger";
  }
  api(path,session.token).then(v=>{if(!cancelled)setData(v)}).catch(e=>{
   if(cancelled)return;
   setError(message((e as Error).message));
   if((e as Error).message==="login_required")setSession(null);
  }).finally(()=>{if(!cancelled)setBusy(false)});
  return()=>{cancelled=true};
 },[session,view,selectedCustomer]);
 const login=async(e:React.FormEvent)=>{
  e.preventDefault();setBusy(true);setError("");
  try{
   const result=await api("login",undefined,{username:user.trim(),password});
   if(typeof result.token!=="string"||!["owner","manager","cashier"].includes(String(result.role)))
    throw Error("bad_login");
   setSession({token:result.token,role:result.role as Login["role"],store_name:String(result.store_name)});
   setPassword("");setMain(0);setView("overview");setSelectedCustomer("");setCustomerName("");
  }catch(e){setError(message((e as Error).message==="request_failed"?"bad_login":(e as Error).message))}
  finally{setBusy(false)}
 };
 const nav=(i:number)=>{
  setMain(i);setError("");setSelectedCustomer("");
  setView(i===0?"overview":i===1?"sales":i===2?"products":"customers");
 };
 const label=view==="overview"?"پوختەی مارکێتی تاقیکردنەوە":
   view==="products"?"لیستی کاڵاکان":view==="sales"?"پسووڵە تۆمارکراوەکان":
   view==="customers"?"کڕیاران و قەرزەکان":"مێژووی قەرزی "+customerName;
 const table=(columns:{key:string;title:string;format?:(v:unknown)=>string}[],values:Record<string,unknown>[])=>(
  <div className="v81-table">
   <table><thead><tr>{columns.map(c=><th key={c.key}>{c.title}</th>)}</tr></thead>
    <tbody>{values.length?values.map((r,i)=><tr key={String(r.id||r.customer_id||r.entry_id||r.receipt_no||i)}>
     {columns.map(c=><td key={c.key}>{c.format?c.format(r[c.key]):text(r[c.key])}</td>)}</tr>):
     <tr><td colSpan={columns.length} className="v81-empty">هیچ تۆمارێک نییە</td></tr>}
    </tbody>
   </table>
  </div>
 );
 return <div className="v81-root" data-v81-test-market="true" dir="rtl">
  <div className="v81-market-title">مارکێتی تاقیکردنەوە <span>PostgreSQL · TEST ONLY</span></div>
  {!session?
    <main className="v81-login-wrap">
     <form className="v81-login" onSubmit={login}>
      <h1>چوونەژوورەوەی مارکێتی تاقیکردنەوە</h1>
      <p>هەژماری جیاوازە؛ هیچ داتایەکی سوپەرمارکێتی کانی چنار بەکارناهێنرێت.</p>
      <label>ناوی هەژمار<input value={user} onChange={e=>setUser(e.target.value)} autoComplete="username" required/></label>
      <label>وشەی نهێنی<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>
      <button disabled={busy} type="submit">{busy?"پشکنین...":"چوونە ژوورەوە"}</button>
      {error&&<p role="alert" className="v81-error">{error}</p>}
      <small>تەنها تاقیکردنەوە · فرۆشتن و پارەدان لەم ڕووکارەدا ناچالاکن</small>
     </form>
    </main>
   :<>
    <div className="v81-first-row">
     <nav aria-label="بەشە سەرەکییەکان">
      {PRIMARY.map((name,i)=><button type="button" key={name}
       className={main===i?"selected":""} onClick={()=>nav(i)}>{name}</button>)}
     </nav>
     <button type="button" onClick={()=>{setSession(null);setData(null);setPassword("");setMain(0);setView("overview")}}>دەرچوون</button>
    </div>
    <nav className="v81-second-row" aria-label="ژێربەشەکان">
     {(SUBS[main]||[]).map(t=><button type="button" key={t.id}
       className={view===t.id?"selected":""} onClick={()=>{
        setView(t.id);setError("");setSelectedCustomer("");
       }}>{t.name}{view===t.id?" ✓":""}</button>)}
    </nav>
    <main className="v81-body">
     <header className="v81-page-heading">
      <h1>{label}</h1>
      <span>تەنها خوێندنەوە · {session.role==="cashier"?"کاشێر":"خاوەن مارکێت"}</span>
     </header>
     {busy&&<p role="status">زانیارییەکان لە داتابەیس دەخوێندرێنەوە…</p>}
     {error&&<p role="alert" className="v81-error">{error}</p>}
     {data&&!busy&&view==="overview"&&
      <div className="v81-overview" data-testid="real-postgres-overview">
       <div><strong>ژمارەی فرۆشتنەکان</strong><output>{count((data.sales as Record<string,unknown>)?.sale_count)}</output></div>
       <div><strong>کۆی فرۆشتن</strong><output>{money((data.sales as Record<string,unknown>)?.sale_total)}</output></div>
       <div><strong>کاڵاکان</strong><output>{count((data.stock as Record<string,unknown>)?.product_count)}</output></div>
       <div><strong>کۆی بڕی کۆگا</strong><output>{count((data.stock as Record<string,unknown>)?.stock_total)}</output></div>
       {data.customers&&<div><strong>قەرزی ماوە</strong><output>{money((data.customers as Record<string,unknown>)?.debt_total)}</output></div>}
      </div>}
     {data&&!busy&&view==="products"&&table([
      {key:"name",title:"ناوی کاڵا"},{key:"barcode",title:"بارکۆد"},
      {key:"price_minor",title:"نرخ",format:money},
      {key:"stock_base_units",title:"کۆگا",format:count}
     ],rows(data.products))}
     {data&&!busy&&view==="sales"&&table([
      {key:"receipt_no",title:"ژمارەی پسووڵە"},
      {key:"total_minor",title:"کۆی گشتی",format:money},
      {key:"created_at",title:"بەروار",format:v=>v?new Date(String(v)).toLocaleString("en-GB"):"—"}
     ],rows(data.sales))}
     {data&&!busy&&view==="customers"&&<div className="v81-table">
      <table><thead><tr><th>ناوی کڕیار</th><th>قەرزی ماوە</th><th>مێژوو</th></tr></thead>
       <tbody>{rows(data.customers).map(c=><tr key={String(c.customer_id)}>
        <td>{text(c.display_name)}</td><td>{money(c.balance_minor)}</td>
        <td><button type="button" onClick={()=>{
         setSelectedCustomer(String(c.customer_id));setCustomerName(text(c.display_name));setView("ledger");
        }}>بینینی مامەڵەکان</button></td></tr>)}</tbody>
      </table>
     </div>}
     {data&&!busy&&view==="ledger"&&table([
      {key:"entry_type",title:"جۆری مامەڵە",format:v=>v==="opening_debt"?"قەرز":"پارەدانی تۆمارکراو (تاقیکردنەوە)"},
      {key:"amount_minor",title:"بڕ",format:money},
      {key:"reference",title:"وردەکاری"},
      {key:"created_at",title:"بەروار",format:v=>v?new Date(String(v)).toLocaleString("en-GB"):"—"}
     ],rows(data.entries))}
     <p className="v81-footnote">داتاکان لە PostgreSQL ـی جیاکراوی تاقیکردنەوە دەخوێندرێنەوە؛ هیچ دەستکاری، سڕینەوە یان وەرگرتنی پارە لەم پەڕەیەدا ئەنجام نادرێت.</p>
    </main>
   </>}
 </div>;
};
