// Read-only iPhone-width owner preview. Access token exists ONLY in JS memory.
// No cookies, localStorage, sessionStorage, URL token or service worker.
const $=id=>document.getElementById(id);
let secret=null,storeId=null,loading=false;
const fmt=value=>Number(value).toLocaleString("en-US");
const setStatus=message=>{$("status").textContent=message;};
function reset(){
 secret=null;storeId=null;
 $("dashboard").hidden=true;$("login").hidden=false;
 $("token").value="";
 $("rows").replaceChildren();
 ["sales","total","receipt"].forEach(id=>$(id).textContent="—");
 setStatus("");
}
async function getJSON(path){
 if(!secret||!storeId)throw Error("unauthorized");
 const url=new URL(path,location.origin);
 url.searchParams.set("store_id",storeId);
 const resp=await fetch(url.toString(),{method:"GET",cache:"no-store",
  credentials:"omit",redirect:"error",headers:{Authorization:"Bearer "+secret}});
 if(resp.status===401)throw Error("بەکارهێنەر مۆڵەتی بینینی ئەم فرۆشگایەی نییە");
 if(!resp.ok)throw Error("پەیوەندی بە سێرڤەر سەرکەوتوو نەبوو");
 return resp.json();
}
async function refresh(){
 if(loading||!secret||!storeId)return;
 loading=true;$("refresh").disabled=true;setStatus("نوێکردنەوەی داتا...");
 // Never leave stale totals visible after a failed call.
 $("dashboard").hidden=true;
 try{
  const [summary,latest]=await Promise.all([
   getJSON("/v28/owner/summary"),getJSON("/v28/owner/latest?limit=20")
  ]);
  if(summary.ok!==true||latest.ok!==true||summary.store_id!==storeId||
     latest.store_id!==storeId||!Array.isArray(latest.events)||
     !Number.isSafeInteger(summary.sales_count)||summary.sales_count<0||
     !/^\d+$/.test(String(summary.total_minor))||
     !Number.isSafeInteger(summary.last_receipt_no)||
     summary.source!=="received_cloud_events_not_local_inventory")
   throw Error("وەڵامی سێرڤەر نادروستە");
  $("sales").textContent=fmt(summary.sales_count);
  $("total").textContent=fmt(summary.total_minor);
  $("receipt").textContent=fmt(summary.last_receipt_no);
  $("last-seen").textContent=summary.last_received_at?
   "دوایین وەرگرتن: "+new Date(summary.last_received_at).toLocaleString("en-GB"):
   "هێشتا هیچ ڕووداوێک نەگەیشتووە";
  $("updated").textContent="نوێکراوە: "+new Date().toLocaleTimeString("en-GB");
  $("warning").textContent="تەنها فرۆشتنە گەیشتووەکانی کلاود. ئەگەر ئینتەرنێتی مارکێت نەبێت، فرۆشتنە نوێیەکان دواتر دێن. ئەمە ژمێریاریی تەواوی کۆگای ناوخۆ نییە.";
  const rows=$("rows");rows.replaceChildren();
  for(const item of latest.events.slice(0,20)){
   const tr=document.createElement("tr");
   const data=[String(item.receipt_no),fmt(item.total_minor),
     item.received_at?new Date(item.received_at).toLocaleString("en-GB"):"—"];
   for(const value of data){
    const td=document.createElement("td");
    td.textContent=value;
    tr.appendChild(td);
   }
   rows.appendChild(tr);
  }
  $("dashboard").hidden=false;setStatus("");
 }catch(error){
  setStatus(error instanceof Error?error.message:"هەڵەی خوێندنەوە");
 }finally{loading=false;$("refresh").disabled=false;}
}
$("login").addEventListener("submit",event=>{
 event.preventDefault();
 const newStore=$("store").value.trim();
 const newToken=$("token").value;
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(newStore)||
     newToken.length<32){setStatus("UUID یان کلیلی خاوەن نادروستە");return;}
 storeId=newStore;secret=newToken;$("token").value="";
 $("login").hidden=true;
 void refresh();
});
$("refresh").addEventListener("click",()=>{void refresh();});
$("logout").addEventListener("click",reset);
window.addEventListener("pagehide",()=>{secret=null;});
