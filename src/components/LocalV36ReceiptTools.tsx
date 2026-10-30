import React,{useState,useMemo} from "react";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Props={token:string;saleId:string};
export const LocalV36ReceiptTools:React.FC<Props>=({token,saleId})=>{
 const jobId=useMemo(()=>crypto.randomUUID(),[saleId]);
 const [preview,setPreview]=useState("");
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [width,setWidth]=useState<58|80>(80);
 const readPreview=async()=>{
  if(!UUID.test(saleId)||busy)return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/local/v34/print-preview?sale_id="+saleId+"&width="+width,
    {headers:{Authorization:"Bearer "+token},credentials:"omit",redirect:"error",cache:"no-store"});
   if(!response.ok)throw Error("preview_unavailable");
   const html=await response.text();
   if(html.length>150000||!html.includes("lang=\"ckb\""))throw Error("invalid_preview");
   setPreview(html);
  }catch{setPreview("");setMessage("پێشبینینی پسووڵە بەردەست نییە؛ داواکاری چاپ مەکە.");}
  finally{setBusy(false);}
 };
 const queuePrint=async()=>{
  if(!UUID.test(saleId)||busy)return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch("/api/local/v35/print-jobs",{
    method:"POST",credentials:"omit",redirect:"error",cache:"no-store",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({sale_id:saleId,job_id:jobId,width_mm:width})
   });
   if(!response.ok)throw Error("queue_unconfirmed");
   const body=await response.json();
   if(body.ok!==true||body.job?.job_id!==jobId||body.job.state!=="queued"||
      body.hardware_printed!==false)throw Error("invalid_queue");
   setMessage("تەنها لە ڕیزی تاقیکردنەوەی چاپ تۆمارکرا؛ هیچ پرینتەرێک چاپی نەکردووە.");
  }catch{setMessage("ئەنجامی داواکاری چاپ نادیارە؛ دووبارە بە هەمان ID پشکنە، نەک داواکاری نوێ.");}
  finally{setBusy(false);}
 };
 return <section dir="rtl" aria-label="پێشبینینی پسووڵەی ناوخۆیی V36"
  style={{border:"1px solid #b1bed0",padding:12,borderRadius:10,marginTop:12}}>
  <strong>V36 — پسووڵەی PostgreSQL (تەنها تاقیکردنەوە)</strong>
  <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10}}>
    <label>قەبارەی کاغەز
      <select value={width} onChange={e=>{setWidth(Number(e.target.value) as 58|80);setPreview("");}}
       disabled={busy} style={{margin:6}}>
       <option value={58}>58mm</option><option value={80}>80mm</option>
      </select>
    </label>
    <button type="button" disabled={busy} onClick={readPreview}>پێشبینینی پسووڵە</button>
    <button type="button" disabled={busy} onClick={queuePrint}>تۆمارکردنی داواکاری چاپی تاقیکردنەوە</button>
  </div>
  {message&&<div role="status">{message}</div>}
  {preview&&<iframe title="پێشبینینی پارێزراوی پسووڵە" sandbox=""
   style={{width:"100%",height:320,border:"1px solid #aaa",marginTop:10}}
   srcDoc={preview}/>}
 </section>;
};
