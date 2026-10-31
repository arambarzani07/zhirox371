import React,{useEffect,useState} from 'react';
import {prepareDurableLocal,commitDurableLocal,cancelDurableLocal,recoverDurableLocal,loginLocal,makePilotPending,scanLocal,validPilotPending} from '../localPilotV24';
import type {LocalPilotItem,PilotPending,PilotResult} from '../localPilotV24';
import {getLocalReceiptsV32,getLocalIntentStatusV32} from '../localCashierHistoryV32';
import type {LocalReceiptV32} from '../localCashierHistoryV32';
import {isolatedLanPilotV36} from '../localPilotV24';
import {LocalV36ReceiptTools} from './LocalV36ReceiptTools';
import {LocalV37ShiftControls} from "./LocalV37ShiftControls";
import {LocalV41TenderDraft} from "./LocalV41TenderDraft";
import {LocalV44ManagerReview} from "./LocalV44ManagerReview";

type Line={item:LocalPilotItem;qty:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money=(n:number)=>n.toLocaleString("en-US")+" IQD";
const pendingKey=(id:string)=>"zhirox-v24-local-pending:"+id;
const box:React.CSSProperties={border:"1px solid #b1bed0",borderRadius:12,padding:16,background:"white",marginBottom:16};
const inputStyle:React.CSSProperties={height:38,margin:4,padding:"5px 9px",border:"1px solid #aabed7",borderRadius:6};
export const LocalPostgresPilotV24:React.FC<{standalone?:boolean}>=({standalone=false})=>{
 const [open,setOpen]=useState(standalone);
 const [store,setStore]=useState("");
 const [username,setUsername]=useState("");
 const [password,setPassword]=useState("");
 const [token,setToken]=useState("");
 const [scan,setScan]=useState("");
 const [cart,setCart]=useState<Line[]>([]);
 const [pending,setPending]=useState<PilotPending|null>(null);
 const [last,setLast]=useState<PilotResult|null>(null);
 const [history,setHistory]=useState<LocalReceiptV32[]>([]);
 const [historyError,setHistoryError]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [expiresAt,setExpiresAt]=useState(0);
 const v37Shifts=isolatedLanPilotV36&&import.meta.env.VITE_V37_LOCAL_SHIFTS==="true";
 const [v37ShiftOpen,setV37ShiftOpen]=useState(false);
 const v41Tender=isolatedLanPilotV36&&import.meta.env.VITE_V41_TENDER_PREFLIGHT==="true";
 const [v41CashAllowed,setV41CashAllowed]=useState(false);
 // No access token or password is written to LocalStorage or SessionStorage.
 useEffect(()=>{if(!open)return;setError("");},[open]);
 const available=Boolean(token&&expiresAt>Date.now());
 const submitLogin=async(e:React.FormEvent)=>{
   e.preventDefault();if(busy)return;
   setBusy(true);setError("");
   try {
     const session=await loginLocal(store,username,password);
     // Guard an unresolved request from another store, even across reload.
     const raw=sessionStorage.getItem(pendingKey(store));
     const parsed=raw?JSON.parse(raw) as unknown:null;
     if(raw&&!validPilotPending(parsed))throw new Error("هەڵە لە مامەڵەی چاوەڕوانە؛ بەدەستی مەیسڕەوە");
     // The PostgreSQL journal is authoritative across tabs and PC/browser restarts.
     // A stale browser hint may still be retried with the SAME UUID and quote.
     const serverIntent=await recoverDurableLocal(session.token);
     let revived:PilotPending|null=serverIntent?{
       request_id:serverIntent.request_id,lines:serverIntent.lines,
       expected_total_minor:serverIntent.expected_total_minor
     }:parsed as PilotPending|null;
     let previousReceipt:PilotResult|null=null;
     if(standalone&&parsed&&!serverIntent){
       const status=await getLocalIntentStatusV32(session.token,(parsed as PilotPending).request_id);
       if(status?.state==="committed"){
         previousReceipt={sale_id:status.sale_id!,receipt_no:status.receipt_no!,
           total_minor:status.total_minor!,replayed:true};
         revived=null;
       }else if(status?.state==="cancelled")revived=null;
       else if(status?.state==="prepared"){
         revived={request_id:status.request_id,lines:status.lines,
           expected_total_minor:status.expected_total_minor};
       }
     }
     if(standalone&&serverIntent&&parsed&&
       serverIntent.request_id!==(parsed as PilotPending).request_id)
       throw new Error("conflicting local intent; manual review required");
     if(revived)sessionStorage.setItem(pendingKey(store),JSON.stringify(revived));
     else if(standalone)sessionStorage.removeItem(pendingKey(store));
     setPending(revived);
     setToken(session.token);setExpiresAt(Date.now()+session.expires_in_seconds*1000);
     setCart([]);setLast(previousReceipt);
     if(standalone){
       try{setHistory(await getLocalReceiptsV32(session.token));setHistoryError("");}
       catch{setHistoryError("مێژووی پسووڵەکان نەتوانرا بخوێندرێتەوە");setHistory([]);}
     }
   }catch{setToken("");setError("چوونەژوورەوە سەرکەوتوو نەبوو یان داواکارییەکی ناتەواو هەیە");}
   finally {setPassword("");setBusy(false);}
 };
 const submitScan=async(e:React.FormEvent)=>{
   e.preventDefault();if(!available||busy||pending)return;
   const barcode=scan.trim();setBusy(true);setError("");
   try{
     const p=await scanLocal(token,barcode);
     const existing=cart.find(x=>x.item.barcode===p.barcode);
     if(existing&&p.sale_mode==="scale")
       throw new Error("ئەم لیبڵەی کێشدارە پێشتر سکان کراوە؛ دووبارەی مەکە");
     if(existing&&(existing.item.price_minor!==p.price_minor||
       existing.item.quantity_base_units!==p.quantity_base_units||
       existing.item.sale_mode!==p.sale_mode))
       throw new Error("نرخ یان یەکەی کاڵا گۆڕاوە؛ پێویستە سەبەتە نوێ بکرێتەوە");
     const used=cart.reduce((n,x)=>n+(x.item.id===p.id?x.qty*x.item.quantity_base_units:0),0);
     if(used+p.quantity_base_units>p.stock_base_units||cart.length>=100&&!existing||
       (existing&&existing.qty>=100))throw new Error("بڕی کۆگا بەش ناکات");
     setCart(prev=>existing?prev.map(x=>x.item.barcode===p.barcode?
       {...x,qty:x.qty+1}:x):[...prev,{item:p,qty:1}]);
     setScan("");
   }catch(err){setError(err instanceof Error?err.message:"سکان نەکرا");}
   finally {setBusy(false);}
 };
 const total=cart.reduce((sum,l)=>sum+l.qty*l.item.price_minor,0);
 // The mixed-tender staging path ONLY prepares a durable V31 request.
 // It never charges a bank, commits a sale, prints a receipt or reduces stock.
 const prepareV41Draft=async()=>{
   if(!v41Tender||!available||busy||pending||!v37ShiftOpen||!cart.length)return;
   let request:PilotPending;
   try{
     if(cart.some(x=>!Number.isSafeInteger(x.qty)||x.qty<1||x.qty>100||
        x.item.sale_mode==="scale"&&x.qty!==1))
       throw Error("بڕی کاڵا نادروستە");
     for(const x of cart){
       const used=cart.reduce((n,l)=>n+(l.item.id===x.item.id?
          l.qty*l.item.quantity_base_units:0),0);
       if(used>x.item.stock_base_units)throw Error("بڕی کۆگا بەش ناکات");
     }
     request=makePilotPending(cart.map(x=>({barcode:x.item.barcode,qty:x.qty})),
       crypto.randomUUID(),total);
     sessionStorage.setItem(pendingKey(store),JSON.stringify(request));
     setPending(request);setV41CashAllowed(false);
   }catch(e){setError(e instanceof Error?e.message:"پلان دروست نەکرا");return;}
   setBusy(true);setError("");
   try{
     await prepareDurableLocal(token,request);
     setError("داواکاری V31 تەنها ئامادە کرا؛ لە خوارەوە پلانی پارەدان تۆمار بکە.");
   }catch{
     setError("ئامادەکردنی داواکاری نادیارە؛ هەمان UUID بەکاربهێنە و دۆخ بپشکنە.");
   }finally{setBusy(false);}
 };
 const cancelV41Draft=async()=>{
   if(!v41Tender||busy||!pending)return;
   setBusy(true);setError("");setV41CashAllowed(false);
   try{
     const status=await cancelDurableLocal(token,pending.request_id);
     if(status!=="cancelled")throw Error("cannot_cancel");
     sessionStorage.removeItem(pendingKey(store));
     setPending(null);setCart([]);setV41CashAllowed(false);
     setError("داواکاری هەڵوەشێندرایەوە؛ هیچ فرۆشتنێک تۆمار نەکرا.");
   }catch{setError("هەڵوەشاندنەوە پشتڕاست نەکراوە؛ هەمان داواکاری دووبارە بپشکنە.");}
   finally{setBusy(false);}
 };
 const submitCheckout=async(e:React.FormEvent)=>{
   e.preventDefault();if(!available||busy||(v37Shifts&&!v37ShiftOpen)||(!pending&&!cart.length)||(v41Tender&&pending&&!v41CashAllowed))return;
   let request: PilotPending;
   try {
     if(pending)request=pending;
     else{
       if(cart.some(x=>!Number.isSafeInteger(x.qty)||x.qty<1||x.qty>100||
         x.item.sale_mode==="scale"&&x.qty!==1))
         throw new Error("بڕی کاڵا نادروستە");
       for(const x of cart){
         const taken=cart.reduce((n,l)=>n+(l.item.id===x.item.id?
           l.qty*l.item.quantity_base_units:0),0);
         if(taken>x.item.stock_base_units)throw new Error("بڕی کۆگا بەش ناکات");
       }
       request=makePilotPending(cart.map(x=>({barcode:x.item.barcode,qty:x.qty})),crypto.randomUUID(),total);
       // Persist before sending: uncertain network results MUST retry the same UUID.
       sessionStorage.setItem(pendingKey(store),JSON.stringify(request));
       setPending(request);
     }
   }catch(err){setError(err instanceof Error?err.message:"هەڵە لە سەبەتە");return;}
   setBusy(true);setError("");
   try{
     // First SQL statement durably prepares; only then can the second statement
     // execute the real atomic sale. Repeated calls use exactly the same UUID.
     await prepareDurableLocal(token,request);
     const receipt=await commitDurableLocal(token,request.request_id);
     sessionStorage.removeItem(pendingKey(store));
     setPending(null);setCart([]);setLast(receipt);
     if(standalone){
       try{setHistory(await getLocalReceiptsV32(token));setHistoryError("");}
       catch{setHistory([]);setHistoryError("مێژووی پسووڵەکان نەتوانرا بخوێندرێتەوە");}
     }
   }catch(err){
     if(err instanceof Error && err.message==="price_changed"){
       // Price failure rolls back V26 sale. Keep the cart locked until the
       // server confirms the prepared intent was safely cancelled (or committed).
       try{
         const status=await cancelDurableLocal(token,request.request_id);
         if(status==="committed"){
           const receipt=await commitDurableLocal(token,request.request_id);
           sessionStorage.removeItem(pendingKey(store));
           setPending(null);setCart([]);setLast(receipt);
         }else{
           sessionStorage.removeItem(pendingKey(store));
           setPending(null);setCart([]);setScan("");
           setError("نرخی کاڵا لە سێرڤەر گۆڕاوە؛ داواکاری هەڵوەشێندرایەوە. کاڵاکان دووبارە بسکانە.");
         }
       }catch{
         setError("نرخی کاڵا گۆڕاوە، بەڵام هەڵوەشاندنەوە پشتڕاست نەکراوەتەوە. هەمان داواکاری دووبارە بپشکنە.");
       }
     }else{
       setError("ئەنجامی فرۆشتن دڵنیا نییە؛ تەنها هەمان داواکاری دووبارە بنێرە. سەبەتە مەگۆڕە.");
     }
   }finally{setBusy(false);}
 };
 const changeQty=(barcode:string,delta:number)=>{
   if(busy||pending)return;
   setCart(prev=>prev.flatMap(x=>{
     if(x.item.barcode!==barcode)return [x];
     const target=x.qty+delta;
     if(target<=0)return [];
     if(x.item.sale_mode==="scale"||target>100)return [x];
     const others=prev.reduce((n,l)=>n+(l.item.id===x.item.id&&l.item.barcode!==barcode?
       l.qty*l.item.quantity_base_units:0),0);
     return target*x.item.quantity_base_units+others>x.item.stock_base_units?[x]:[{...x,qty:target}];
   }));
 };
 return <section className={standalone?"pos-clean__pilot":undefined} style={standalone?undefined:box} dir="rtl" aria-label="تاقیکردنەوەی PostgreSQL ـی ناوخۆیی">
   {!standalone&&<button type="button" onClick={()=>setOpen(x=>!x)} style={{fontWeight:850,padding:9}}>
     {open?"داخستنی":"کردنەوەی"} V31 — تاقیکردنەوەی PostgreSQL ـی ناوخۆیی
   </button>}
   {open&&<div className={standalone?"pos-clean__body":undefined} style={standalone?undefined:{marginTop:12}}>
     {!standalone&&<div role="status" style={{padding:12,border:"2px solid #b45309",background:"#fff7ed",fontWeight:800}}>
       تەنها تاقیکردنەوە لەسەر هەمان PC و PostgreSQL ـی جیاکراوە؛ دانە، کارتۆن و کیلۆگرام بە نەختینە. نرخی کۆتایی لە سێرڤەر پشتڕاست دەکرێتەوە.
       داشکاندن، قەرز و فرۆشتنی Production پشتگیری ناکرێن.
       ئەم بەشە بە سەبەتەی Demo تێکەڵ نابێت.
     </div>}
     {!available?<form className={standalone?"pos-clean__login":undefined} onSubmit={submitLogin} style={standalone?undefined:{marginTop:12}}>
       <input style={{...inputStyle,width:320}} value={store} onChange={e=>setStore(e.target.value.trim())}
          placeholder="UUID ـی فرۆشگا" required aria-label="UUID ـی فرۆشگا"/>
       <input style={inputStyle} value={username} onChange={e=>setUsername(e.target.value)} placeholder="ناوی بەکارهێنەر" required/>
       <input style={inputStyle} value={password} onChange={e=>setPassword(e.target.value)} type="password"
          placeholder="وشەی نهێنی ناوخۆیی" required autoComplete="off"/>
       <button disabled={busy||!uuid.test(store)} type="submit">چوونەژوورەوەی تاقیکردنەوە</button>
     </form>:<>
       <div className={standalone?"pos-clean__connect":undefined} style={standalone?undefined:{marginTop:10}}>● پەیوەندی ناوخۆیی چالاکە</div>
       {v37Shifts&&<LocalV37ShiftControls token={token} store={store} onShiftOpen={setV37ShiftOpen}/>}
       {isolatedLanPilotV36&&import.meta.env.VITE_V44_RECONCILIATION_LAB==="true"&&<LocalV44ManagerReview store={store}/>}
       <div className={standalone?"pos-clean__workspace":undefined}>
       <div className={standalone?"pos-clean__transaction":undefined}>
       <form className={standalone?"pos-clean__scan":undefined} onSubmit={submitScan} style={standalone?undefined:{display:"flex",gap:8,marginTop:10}}>
         <input style={{...inputStyle,flex:1}} value={scan} onChange={e=>setScan(e.target.value)}
           aria-label="بارکۆدی دانە، کارتۆن یان تەرازوو" placeholder="بارکۆدی دانە، کارتۆن یان تەرازوو بسکانە" disabled={busy||!!pending}/>
         <button type="submit" disabled={busy||!!pending}>سکان</button>
       </form>
       <div className={standalone?"pos-clean__basket":undefined}>
       <table style={standalone?undefined:{borderCollapse:"collapse",width:"100%",marginTop:10}}>
         <thead><tr>{["ژمارە","ناوی کاڵا","یەکە","نرخ","بڕ","کۆ"].map(x=><th key={x} style={{border:"1px solid #555",padding:6}}>{x}</th>)}</tr></thead>
         <tbody>{cart.map((x,i)=><tr key={x.item.barcode}>
           {[i+1,x.item.name,x.item.sale_mode==="scale"?"کیلۆگرام":
              x.item.sale_mode==="carton"?"کارتۆن":"دانە",
              x.item.sale_mode==="scale"?money(x.item.unit_price_minor):money(x.item.price_minor)
           ].map((v,k)=><td key={k} style={{border:"1px solid #555",padding:7}}>{v}</td>)}
           <td style={{border:"1px solid #555",padding:7}}><div className={standalone?"pos-clean__quantity":undefined}>
             <button disabled={busy||!!pending} type="button" onClick={()=>changeQty(x.item.barcode,-1)}>−</button>
             <strong style={{margin:7}}>{x.item.sale_mode==="scale"?
                (x.item.quantity_base_units/1000).toFixed(3):x.qty}</strong>
             <button disabled={busy||!!pending||x.item.sale_mode==="scale"} type="button" onClick={()=>changeQty(x.item.barcode,1)}>+</button>
           </div></td><td style={{border:"1px solid #555",padding:7}}>{money(x.qty*x.item.price_minor)}</td>
         </tr>)}</tbody>
       </table>
       {standalone&&cart.length===0&&<div className="pos-clean__empty">سەبەتە بەتاڵە</div>}
       </div>
       </div>
       <aside className={standalone?"pos-clean__side":undefined}>
       {standalone?(
         <div className="pos-clean__total">
           <span>کۆی گشتی</span><strong>{money(total)}</strong>
         </div>
       ):(
         <strong style={{display:"block",margin:"10px 0"}}>کۆی نموونەیی: {money(total)}</strong>
       )}
       {standalone&&<div className="pos-clean__payment">نەختینە</div>}
       {v41Tender&&!pending&&<button type="button"
         disabled={busy||!available||!v37ShiftOpen||!cart.length}
         onClick={()=>void prepareV41Draft()} style={{margin:"8px 0",fontWeight:800}}>
         ئامادەکردنی پلانی نەختینە + بانک (بەبێ فرۆشتن)
       </button>}
       {v41Tender&&pending&&<LocalV41TenderDraft key={pending.request_id} token={token}
         requestId={pending.request_id} total={pending.expected_total_minor}
         onCashCheckoutAllowed={setV41CashAllowed}/>}
       {v41Tender&&pending&&<button type="button" disabled={busy}
         onClick={()=>void cancelV41Draft()}>هەڵوەشاندنەوەی پلانی چاوەڕوان</button>}
       <form className={standalone?"pos-clean__checkout":undefined} onSubmit={submitCheckout}>
         <button type="submit" disabled={busy||(v37Shifts&&!v37ShiftOpen)||(!pending&&!cart.length)||(v41Tender&&!!pending&&!v41CashAllowed)} style={{fontWeight:850}}>
           {pending?"دووبارە ناردنی هەمان داواکاری":"تاقیکردنەوەی فرۆشتنی Atomic"}
         </button>
       </form>
       {pending&&<div className={standalone?"pos-clean__pending":undefined} role="alert" style={standalone?undefined:{color:"#9a3412",marginTop:8}}>
         مامەڵەی چاوەڕوانە هەیە؛ لە PostgreSQL پاشەکەوت دەکرێت و سەبەتە قوفڵ کراوە. دوای داخستنی پەڕە دەتوانرێت بگەڕێنرێتەوە.
       </div>}
       {last&&<div role="status" style={{marginTop:8,fontWeight:850}}>
         پسووڵەی PostgreSQL ـی تاقیکردنەوە: #{last.receipt_no} — {money(last.total_minor)}
         {last.replayed?" (دووبارە ناردن، فرۆشتنی نوێ نییە)":""}
       </div>}
       {isolatedLanPilotV36&&standalone&&last&&available&&<LocalV36ReceiptTools key={last.sale_id} token={token} saleId={last.sale_id}/>}
       </aside>
       </div>
       {standalone&&<section className="pos-clean__history" aria-label="مێژووی پسووڵەی ناوخۆیی">
         <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
           <strong>پسووڵەکانی PostgreSQL ـی ناوخۆیی</strong>
           <button disabled={busy} type="button" onClick={async()=>{
             try{setHistory(await getLocalReceiptsV32(token));setHistoryError("");}
             catch{setHistory([]);setHistoryError("مێژووی پسووڵەکان نەتوانرا بخوێندرێتەوە");}
           }}>نوێکردنەوەی پسووڵەکان</button>
         </div>
         <div role="status">{historyError}</div>
         <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
           <thead><tr>{["ژمارەی پسووڵە","کۆی پارە","بەروار"].map(x=>
             <th key={x} style={{border:"1px solid #aabed7",padding:8}}>{x}</th>)}</tr></thead>
           <tbody>{history.map(r=><tr key={r.sale_id}>
             <td style={{border:"1px solid #aabed7",padding:8}}>{r.receipt_no}</td>
             <td style={{border:"1px solid #aabed7",padding:8}}>{money(r.total_minor)}</td>
             <td style={{border:"1px solid #aabed7",padding:8}}>{new Date(r.created_at).toLocaleString("en-GB")}</td>
           </tr>)}</tbody>
         </table>
         {!history.length&&!historyError&&<div>هیچ پسووڵەیەکی PostgreSQL ـی تاقیکردنەوە نەدۆزرایەوە</div>}
       </section>}
       <button className={standalone?"pos-clean__logout":undefined} type="button" style={standalone?undefined:{marginTop:10}} onClick={()=>{setV37ShiftOpen(false);setToken("");setExpiresAt(0);setCart([]);setLast(null);setHistory([]);setHistoryError("");}}>
         دەرچوون لە تاقیکردنەوە
       </button>
     </>}
     {error&&<div className={standalone?"pos-clean__error":undefined} role="alert" style={standalone?undefined:{color:"#a21d1d",fontWeight:800,padding:8}}>{error}</div>}
   </div>}
 </section>;
};
