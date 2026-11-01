import React,{useState} from "react";
import "../cashierCleanV1.css";

// V102 operator-only, DEV-only viewport. No production SQL, inventory writes,
// public GitHub Pages data or fake receipts. Cashier sales stay DISABLED.
type CatalogItem={item_name_id:string;barcode:string;name:string;price_minor:number};
type Status={valid_rows:number;invalid_rows:number;ambiguous_barcodes:number;
 source_modified_at:string|null;source_sha256:string;stale:boolean};
const api=async<T,>(path:string,token:string):Promise<T>=>{
 if(!path.startsWith("/api/local/v102/")||path.includes("//"))throw Error("invalid_path");
 const response=await fetch(path,{
  method:"GET",credentials:"omit",cache:"no-store",redirect:"error",
  headers:{Accept:"application/json",Authorization:"Bearer "+token}
 });
 const data=await response.json() as T & {error?:string};
 if(!response.ok)throw Error(data.error||"connection_failed");
 return data;
};
export const MarketCatalogReadOnlyV102:React.FC=()=>{
 const [token,setToken]=useState("");
 const [query,setQuery]=useState("");
 const [status,setStatus]=useState<Status|null>(null);
 const [items,setItems]=useState<CatalogItem[]>([]);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [searched,setSearched]=useState(false);
 const load=async(e:React.FormEvent)=>{
  e.preventDefault();setBusy(true);setError("");
  try{
   const s=await api<Status>("/api/local/v102/status",token);
   setStatus(s);
   const typed=query.trim();
   if(typed.length<2){setItems([]);setSearched(false);}
   else{
    const result=/^[0-9A-Za-z._-]{3,40}$/.test(typed)?
     await api<{ok:boolean;item?:CatalogItem;error?:string}>(
       "/api/local/v102/scan?code="+encodeURIComponent(typed),token)
       .then(r=>({items:r.item?[r.item]:[]}))
       .catch(async()=>api<{items:CatalogItem[]}>(
        "/api/local/v102/products?q="+encodeURIComponent(typed),token)):
     await api<{items:CatalogItem[]}>(
      "/api/local/v102/products?q="+encodeURIComponent(typed),token);
    setItems(result.items);setSearched(true);
   }
  }catch(err){setError((err as Error).message);setItems([]);setStatus(null);}
  finally{setBusy(false);}
 };
 return <div className="viewport" dir="rtl" data-v102-market-catalog-readonly="true"
  style={{background:"#f2f6fb",minHeight:"100vh",padding:24,color:"#172b45"}}>
  <div className="market-banner">سوپەرمارکێتی کانی چنار</div>
  <main style={{maxWidth:1240,margin:"24px auto",background:"white",padding:24,borderRadius:14}}>
   <h1 style={{fontWeight:900,fontSize:23}}>پشکنەری کاڵا و نرخ — داتای مارکێت</h1>
   <div role="status" style={{color:"#9b360a",fontWeight:800,marginBottom:16}}>
    تەنها خوێندنەوەی CSV ـی هەڵگیراوە — فرۆشتن، گۆڕینی نرخ و کۆگا ناچالاکن
   </div>
   <form onSubmit={load} style={{display:"flex",flexWrap:"wrap",gap:10,alignItems:"center"}}>
    <input type="password" value={token} onChange={e=>setToken(e.target.value)}
     autoComplete="off" aria-label="کلیلی خوێندنەوە" required placeholder="کلیلی خوێندنەوە"
     style={{padding:11,border:"1px solid #cad4e2",borderRadius:8,flex:"1 1 220px"}}/>
    <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
     aria-label="بارکۆد یان ناوی کاڵا" placeholder="بارکۆد بسکێنە یان ناوی کاڵا بنووسە"
     style={{padding:11,border:"1px solid #cad4e2",borderRadius:8,flex:"3 1 280px"}}/>
    <button type="submit" disabled={busy||token.length<32}
     style={{padding:"11px 22px",border:0,borderRadius:8,
      background:"#23496e",color:"white",fontWeight:800}}>
     {busy?"پشکنین...":"گەڕان"}
    </button>
   </form>
   {error&&<p role="alert" style={{color:"#b42318",fontWeight:800}}>پەیوەندی سەرکەوتوو نەبوو: {error}</p>}
   {status&&<section style={{padding:"14px 4px",borderBottom:"1px solid #e3e8ef"}}>
    <strong>داتای خوێندراو: {status.valid_rows.toLocaleString("en-US")} کاڵا</strong>
    <span style={{marginInlineStart:18}}>بارکۆدی ناکۆک: {status.ambiguous_barcodes.toLocaleString("en-US")}</span>
    <p style={{fontSize:13,color:status.stale?"#9b360a":"#53667f"}}>
     {status.stale?"ئاگاداری: ئەم فایلە نوێ نییە یان بەرواری دیار نییە. ":""}
     کۆتا دەستکاریی فایلی هەڵگیراو: {status.source_modified_at||"نەزانراو"}
    </p>
   </section>}
   <div style={{overflowX:"auto"}}>
    <table style={{borderCollapse:"collapse",width:"100%",minWidth:640,marginTop:14,fontSize:15}}>
     <thead style={{background:"#edf3f9",textAlign:"right"}}>
      <tr>{["ژمارەی کاڵا","بارکۆد","ناوی کاڵا","نرخی هەڵگیراو (IQD)"].map(x=>
       <th key={x} style={{padding:13,borderBottom:"1px solid #d1dbe8"}}>{x}</th>)}</tr>
     </thead>
     <tbody>{items.map(item=><tr key={item.item_name_id+":"+item.barcode}>
      <td style={{padding:12,borderBottom:"1px solid #e8edf2"}}>{item.item_name_id}</td>
      <td dir="ltr" style={{padding:12,borderBottom:"1px solid #e8edf2"}}>{item.barcode}</td>
      <td style={{padding:12,borderBottom:"1px solid #e8edf2"}}>{item.name}</td>
      <td style={{padding:12,borderBottom:"1px solid #e8edf2",fontWeight:800}}>
       {item.price_minor.toLocaleString("en-US")}</td>
     </tr>)}</tbody>
    </table>
   </div>
   {searched&&items.length===0&&<p>کاڵا نەدۆزرایەوە، یان بارکۆدەکە ناکۆکە.</p>}
  </main>
 </div>;
};
