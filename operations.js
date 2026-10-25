"use strict";
(() => {
const $=id=>document.getElementById(id);
const config=window.RETAIL_CONFIG;
const view=new URLSearchParams(location.search).get("view");
let db=null,user=null,store=null,role=null,products=[],barcodes=[],balances=new Map(),members=[],cart=[],requestId=null,tab="cash",busy=false,pendingCheckout=null;
const money=n=>Number(n).toLocaleString("en-US")+" IQD";
const safe=e=>(e?.code==="42501"?"دەسەڵاتی ئەم کردارەت نییە":
 /insufficient stock/i.test(e?.message||"")?"بڕی کۆگا بەش ناکات":
 /cash amount is below/i.test(e?.message||"")?"پارەی وەرگیراو کەمترە لە کۆی فرۆشتن":
 /invalid checkout/i.test(e?.message||"")?"زانیاری فرۆشتن هەڵەیە":
 /request reused|different actor or payload/i.test(e?.message||"")?"ناسنامەی ئەم فرۆشتنە بە مامەڵەیەکی تر بەکارهاتووە":
 /duplicate/i.test(e?.message||"")?"ئەم کردارە دووبارەیە":
 /Failed to fetch|NetworkError/i.test(e?.message||"")?"پەیوەندیی سێرڤەر/ئینتەرنێت بپشکنە":
 (e?.message||"کردارەکە سەرکەوتوو نەبوو"));
function msg(id,value="",kind=""){const x=$(id);x.textContent=value;x.className="msg"+(kind?" "+kind:"");}
function lock(v){busy=!!v;document.querySelectorAll("#operations-panel button").forEach(x=>{x.disabled=busy;});syncPending();}
function pendingKey(){return store&&user?"retail_pending_checkout_"+store.id+"_"+user.id:null}
function persistPending(){const key=pendingKey();if(!key)return;try{if(pendingCheckout)sessionStorage.setItem(key,JSON.stringify(pendingCheckout));else sessionStorage.removeItem(key);}catch(e){msg("system-msg","پاراستنی هەوڵی فرۆشتن لە بیرگەی وێبگەڕدا سەرکەوتوو نەبوو","error")}}
function syncPending(){const pending=!!pendingCheckout;for(const id of ["barcode","cash"])$(id).disabled=pending||busy;$("clear-cart").disabled=pending||busy;$("finish-sale").disabled=pending||busy;$("retry-checkout").hidden=!pending;$("retry-checkout").disabled=busy;}
function restorePending(){const key=pendingKey();if(!key)return;try{const val=JSON.parse(sessionStorage.getItem(key)||"null");if(!val||!val.id||!Array.isArray(val.items)||!Number.isSafeInteger(val.cash))return;pendingCheckout=val;requestId=val.id;cart=val.items.map(x=>{const p=products.find(p=>p.id===x.product_id);return p?{id:p.id,name:p.name,price:Number(p.price_minor),available:balances.get(p.id)||0,qty:x.quantity}:null}).filter(Boolean);$("cash").value=val.cash;msg("checkout-msg","ئەنجامی فرۆشتنی پێشوو دیار نییە؛ بۆ پشکنینی دووبارە هەمان داواکاری بەکاربهێنە","error");renderCart();syncPending();}catch(e){msg("system-msg","هەوڵی پارێزراوی پێشوو نەتوانرا بخوێندرێتەوە","error")}}
function unlockPending(){pendingCheckout=null;requestId=null;persistPending();syncPending();}
function canManage(){return role==="owner"||role==="manager";}
function viewPanel(name){
 $("login-panel").hidden=name!=="login";
 $("operations-panel").hidden=name!=="operations";
 $("logout").hidden=name!=="operations";
 $("who").textContent=user?user.email||"":"";
}
function selectTab(next){
 if(next==="staff"&&role!=="owner")next="cash";
 if((next==="stock"||next==="audit")&&!canManage())next="cash";
 tab=next;
 for(const x of ["cash","stock","staff","audit","receipts"])$(x+"-panel").hidden=x!==next;
 document.querySelectorAll("[data-tab]").forEach(x=>{
   x.classList.toggle("active",x.dataset.tab===next);
   x.hidden=(x.dataset.tab==="staff"&&role!=="owner") ||
      (["stock","audit"].includes(x.dataset.tab)&&!canManage());
 });
 if(next==="cash"){$("barcode").focus();renderCart();}
 if(next==="stock")renderStock();
 if(next==="staff")void refreshStaff();
 if(next==="audit")void refreshAudit();
 if(next==="receipts")void refreshReceipts();
}
function renderTable(target,headers,data){
 const x=$(target);x.replaceChildren();
 if(!data.length){const blank=document.createElement("div");blank.className="blank";blank.textContent="هیچ تۆمارێک نییە";x.append(blank);return}
 const table=document.createElement("table");const head=document.createElement("thead"),hr=document.createElement("tr");
 headers.forEach(label=>{const th=document.createElement("th");th.textContent=label;hr.append(th)});
 head.append(hr);table.append(head);
 const body=document.createElement("tbody");
 for(const row of data){const tr=document.createElement("tr");row.forEach(cell=>{
    const td=document.createElement("td");td.textContent=String(cell);tr.append(td);
 });body.append(tr)}
 table.append(body);x.append(table);
}
async function loadInventory(){
 const pres=await db.from("retail_products")
   .select("id,name,price_minor,currency,active")
   .eq("store_id",store.id).eq("active",true)
   .order("name").limit(400);
 if(pres.error)throw pres.error;
 const bres=await db.from("retail_barcodes")
   .select("product_id,code,unit_type,units_per_scan")
   .eq("store_id",store.id).limit(2000);
 if(bres.error)throw bres.error;
 const sres=await db.from("retail_stock_balances")
   .select("product_id,quantity").eq("store_id",store.id).limit(2000);
 if(sres.error)throw sres.error;
 products=pres.data||[];barcodes=bres.data||[];
 balances=new Map((sres.data||[]).map(x=>[x.product_id,Number(x.quantity)]));
 cart=cart.map(x=>{const p=products.find(p=>p.id===x.id);
   return p?{...x,name:p.name,price:Number(p.price_minor),available:balances.get(x.id)||0}:null;
 }).filter(Boolean);
 const old=document.activeElement;
 if(tab==="stock")renderStock();else if(tab==="cash")renderCart();
 if(products.length===400||barcodes.length===2000||(sres.data||[]).length===2000){
   msg("system-msg","ژمارەی کاڵاکان زۆرە؛ پەڕەبەندیی تەواو هێشتا جێبەجێ نەکراوە");
 }
}
function renderStock(){
 const selector=$("stock-product"),old=selector.value;selector.replaceChildren();
 for(const p of products){const opt=document.createElement("option");opt.value=p.id;opt.textContent=p.name;selector.append(opt)}
 if(products.some(p=>p.id===old))selector.value=old;
 renderTable("stock-list",["کاڵا","بڕی کۆگا"],products.map(p=>[p.name,(balances.get(p.id)||0).toLocaleString("en-US")]));
}
function cartChanged(){if(pendingCheckout){syncPending();return}requestId=null;msg("checkout-msg","");renderCart()}
function renderCart(){
 const total=cart.reduce((sum,item)=>sum+item.price*item.qty,0);
 $("total").textContent=money(total);
 const paid=Number($("cash").value||0);
 $("change").textContent=money(Math.max(0,paid-total));
 const list=$("cart-list");list.replaceChildren();
 if(!cart.length){const div=document.createElement("div");div.className="blank";div.textContent="سەبەتە بەتاڵە";list.append(div);return}
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>کاڵا</th><th>نرخ</th><th>بڕ</th><th>کۆ</th></tr></thead><tbody></tbody>";
 cart.forEach((it,i)=>{
  const row=document.createElement("tr");
  for(const x of [it.name,money(it.price),"",money(it.qty*it.price)]){const td=document.createElement("td");td.textContent=x;row.append(td)}
  const cell=row.children[2],wrap=document.createElement("span");wrap.className="qty";
  const minus=document.createElement("button");minus.type="button";minus.dataset.line=i;minus.dataset.delta="-1";minus.textContent="−";
  const plus=document.createElement("button");plus.type="button";plus.dataset.line=i;plus.dataset.delta="1";plus.textContent="+";
  const count=document.createElement("span");count.textContent=String(it.qty);
  wrap.append(minus,count,plus);cell.append(wrap);table.tBodies[0].append(row);
 });list.append(table);
}
async function refreshStaff(){
 if(role!=="owner")return;
 const {data,error}=await db.from("retail_memberships").select("user_id,role,active,created_at")
 .eq("store_id",store.id).order("created_at",{ascending:false}).limit(100);
 if(error){msg("staff-msg",safe(error),"error");return}
 members=data||[];
 renderTable("staff-list",["ناسنامە","ڕۆڵ","دۆخ"],members.map(x=>[x.user_id,x.role==="manager"?"بەڕێوەبەر":"کاشێر",x.active?"چالاک":"ناچالاک"]));
}
async function refreshAudit(){
 if(!canManage())return;
 const {data,error}=await db.from("retail_audit_events").select("action,actor_id,subject_id,created_at")
 .eq("store_id",store.id).order("created_at",{ascending:false}).limit(100);
 if(error){msg("system-msg",safe(error),"error");return}
 renderTable("audit-list",["کات","کردار","بەکارهێنەر"],(data||[]).map(x=>[
 new Date(x.created_at).toLocaleString("en-GB"),x.action,x.actor_id
 ]));
}
async function refreshReceipts(){
 if(!db||!store)return;
 msg("receipts-msg","");
 const {data,error}=await db.from("retail_sales")
 .select("id,receipt_no,total_minor,cash_received_minor,change_due_minor,cashier_id,status,created_at")
 .eq("store_id",store.id).eq("status","posted")
 .order("created_at",{ascending:false}).limit(100);
 if(error){msg("receipts-msg",safe(error),"error");return}
 const root=$("receipts-list");root.replaceChildren();
 const rows=data||[];
 if(!rows.length){const empty=document.createElement("div");empty.className="blank";empty.textContent="هیچ پسووڵەیەک نییە";root.append(empty);return}
 const table=document.createElement("table");
 table.innerHTML="<thead><tr><th>ژمارەی پسووڵە</th><th>کات</th><th>کۆی گشتی</th><th>کردار</th></tr></thead><tbody></tbody>";
 for(const sale of rows){
  const tr=document.createElement("tr");
  const vals=["#"+String(sale.receipt_no??"").padStart(6,"0"),
    new Date(sale.created_at).toLocaleString("en-GB"),money(sale.total_minor)];
  for(const val of vals){const td=document.createElement("td");td.textContent=val;tr.append(td)}
  const td=document.createElement("td"),button=document.createElement("button");
  button.className="receipt-action";button.textContent="وردەکاری";button.dataset.receipt=sale.id;
  td.append(button);tr.append(td);table.tBodies[0].append(tr);
 }root.append(table);
 if(rows.length===100)msg("receipts-msg","١٠٠ پسووڵەی دواهەم پیشان دەدرێت؛ پەڕەبەندی هێشتا نییە");
}
async function showReceipt(saleId){
 if(!db||!store)return;
 const [head,items]=await Promise.all([
   db.from("retail_sales").select("id,receipt_no,total_minor,cash_received_minor,change_due_minor,created_at,cashier_id")
     .eq("store_id",store.id).eq("id",saleId).eq("status","posted").single(),
   db.from("retail_sale_items").select("product_id,quantity,unit_price_minor")
     .eq("store_id",store.id).eq("sale_id",saleId).limit(200)
 ]);
 if(head.error||items.error){msg("receipts-msg",safe(head.error||items.error),"error");return}
 const sale=head.data;
 const box=$("receipt-detail");box.replaceChildren();box.hidden=false;
 const heading=document.createElement("h3");heading.textContent="پسووڵەی #"+String(sale.receipt_no).padStart(6,"0");box.append(heading);
 const info=document.createElement("div");info.className="receipt-metrics";
 for(const part of [
   ["کۆی گشتی",money(sale.total_minor)],
   ["پارەی وەرگیراو",money(sale.cash_received_minor)],
   ["پارەی گەڕاوە",money(sale.change_due_minor)]
 ]){
   const span=document.createElement("span"),bold=document.createElement("strong");
   span.textContent=part[0]+" : ";bold.textContent=part[1];span.append(bold);info.append(span);
 }box.append(info);
 const t=document.createElement("div");box.append(t);
 const lastBox=$("receipts-list"); // Render the detail table without replacing the list.
 const table=document.createElement("table");table.innerHTML="<thead><tr><th>کاڵا</th><th>بڕ</th><th>نرخ</th><th>کۆ</th></tr></thead><tbody></tbody>";
 for(const line of items.data||[]){
   const tr=document.createElement("tr"),p=products.find(x=>x.id===line.product_id);
   for(const v of [p?.name||line.product_id,String(line.quantity),money(line.unit_price_minor),money(Number(line.quantity)*Number(line.unit_price_minor))]){
     const td=document.createElement("td");td.textContent=v;tr.append(td);
   }table.tBodies[0].append(tr);
 }t.append(table);
}
$("receipts-refresh").addEventListener("click",()=>{if(!busy)void refreshReceipts();});
$("receipts-list").addEventListener("click",e=>{
 const button=e.target.closest("[data-receipt]");
 if(button&&!busy)void showReceipt(button.dataset.receipt);
});
async function enter(){
 const {data,error}=await db.from("retail_stores").select("id,name,owner_user_id,currency")
 .order("created_at",{ascending:true}).limit(1).maybeSingle();
 if(error)throw error;
 if(!data){viewPanel("login");msg("login-msg","هیچ فرۆشگایەکت نییە؛ لە بەشی کاڵاکان فرۆشگای نوێ دروست بکە","error");return}
 store=data;
 if(data.currency!=="IQD"){viewPanel("login");msg("login-msg","ئەم وەشانە تەنها فرۆشتنی IQD پشتگیری دەکات","error");return}
 if(data.owner_user_id===user.id){role="owner"}else{
   const r=await db.from("retail_memberships").select("role,active")
     .eq("store_id",store.id).eq("user_id",user.id).maybeSingle();
   if(r.error||!r.data?.active)throw r.error||new Error("بەکارهێنەری چالاک نیت");
   role=r.data.role;
 }
 viewPanel("operations");
 await loadInventory();
 restorePending();
 selectTab(["cash","stock","staff","audit","receipts"].includes(view)?view:"cash");
 syncPending();
}
async function init(){
 if(!window.supabase||!config?.supabaseUrl||!config?.publishableKey){
   viewPanel("login");msg("login-msg","پەیوەندی Supabase بەردەست نییە","error");return;
 }
 db=window.supabase.createClient(config.supabaseUrl,config.publishableKey,{
   auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
 });
 const result=await db.auth.getUser();
 if(result.error||!result.data?.user){viewPanel("login");return}
 user=result.data.user;
 try{await enter()}catch(e){viewPanel("login");msg("login-msg",safe(e),"error")}
}
$("login-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!db)return;const btn=e.submitter||e.target.querySelector("button");btn.disabled=true;msg("login-msg");
 try{
   const f=new FormData(e.target),result=await db.auth.signInWithPassword({
     email:String(f.get("email")||"").trim(),password:String(f.get("password")||"")
   });
   if(result.error)throw result.error;
   user=result.data.user;await enter();
 }catch(err){msg("login-msg",safe(err),"error")}
 finally{btn.disabled=false;}
});
$("logout").onclick=async()=>{
 if(db)await db.auth.signOut();
 user=null;store=null;role=null;products=[];cart=[];requestId=null;pendingCheckout=null;viewPanel("login");
 msg("login-msg");
};
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{if(!busy)selectTab(b.dataset.tab)}));
$("scan-form").addEventListener("submit",e=>{
 e.preventDefault();if(pendingCheckout||busy){msg("scan-msg","داواکارییەکی فرۆشتن هێشتا یەکلا نەکراوەتەوە","error");return}const code=String(new FormData(e.target).get("barcode")||"").trim();
 const b=barcodes.find(x=>x.code===code);
 if(!b){msg("scan-msg","بارکۆدەکە نەدۆزرایەوە","error");return}
 if(b.unit_type!=="unit"||Number(b.units_per_scan)!==1){
   msg("scan-msg","ئەم وەشانە تەنها بارکۆدی تاک پشتگیری دەکات","error");return
 }
 const p=products.find(x=>x.id===b.product_id);
 if(!p||p.currency!=="IQD"){msg("scan-msg","کاڵا بۆ فرۆشتن بەردەست نییە","error");return}
 const current=cart.find(x=>x.id===p.id),stock=balances.get(p.id)||0;
 if((current?.qty||0)+1>stock){msg("scan-msg","بڕی کۆگا بەش ناکات","error");return}
 if(current)current.qty++;else cart.push({id:p.id,name:p.name,price:Number(p.price_minor),available:stock,qty:1});
 e.target.reset();msg("scan-msg");cartChanged();$("barcode").focus();
});
$("cart-list").addEventListener("click",e=>{
 const btn=e.target.closest("[data-line]");if(!btn||busy||pendingCheckout)return;
 const i=Number(btn.dataset.line),line=cart[i];if(!line)return;
 const qty=line.qty+Number(btn.dataset.delta);
 if(qty>line.available){msg("scan-msg","بڕی کۆگا بەش ناکات","error");return}
 if(qty<=0)cart.splice(i,1);else line.qty=qty;
 cartChanged();
});
$("cash").addEventListener("input",()=>{if(pendingCheckout)return;if(cart.length)cartChanged();else renderCart()});
$("clear-cart").onclick=()=>{if(pendingCheckout||busy)return;cart=[];requestId=null;$("cash").value="";msg("checkout-msg");renderCart()};
async function commitCheckout(){
 if(!db||!store||busy||!pendingCheckout)return;
 lock(true);msg("checkout-msg");
 try{
   const {data,error}=await db.rpc("retail_checkout_cash",{
     p_store:store.id,p_request:pendingCheckout.id,
     p_items:pendingCheckout.items,p_cash_received:pendingCheckout.cash
   });
   if(error)throw error;
   const saleId=data;
   unlockPending();cart=[];$("cash").value="";
   renderCart();msg("checkout-msg","فرۆشتن تۆمارکرا — "+saleId,"success");
   try{
     const {data:receipt,error:receiptError}=await db.from("retail_sales")
       .select("receipt_no,total_minor,change_due_minor")
       .eq("store_id",store.id).eq("id",saleId).single();
     if(!receiptError&&receipt?.receipt_no)
       msg("checkout-msg","پسووڵەی ژمارە "+String(receipt.receipt_no).padStart(6,"0")+" تۆمارکرا","success");
     await loadInventory();
   }catch(inventoryError){msg("system-msg","فرۆشتن تۆمارکرا؛ نوێکردنەوەی کۆگا سەرکەوتوو نەبوو","error")}
 }catch(err){
   // Keep ambiguous requests frozen for retry with the identical request UUID and payload.
   if(["22023","42501","22P02","23514"].includes(err?.code)){
     unlockPending();
     msg("checkout-msg",safe(err),"error");
   }else{
     syncPending();
     msg("checkout-msg",safe(err)+" — هەمان داواکاری دووبارە پشکنەوە","error");
   }
 }finally{lock(false)}
}
$("checkout-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!db||!store||busy||!cart.length||pendingCheckout)return;
 const total=cart.reduce((s,i)=>s+i.price*i.qty,0),cash=Number($("cash").value);
 if(!Number.isSafeInteger(cash)||cash<total||cash>9999999999999){
   msg("checkout-msg","پارەی وەرگیراو نادروستە","error");return;
 }
 requestId=crypto.randomUUID();
 pendingCheckout={id:requestId,items:cart.map(x=>({product_id:x.id,quantity:x.qty})),cash};
 persistPending();syncPending();
 await commitCheckout();
});
$("retry-checkout").addEventListener("click",()=>{if(pendingCheckout&&!busy)void commitCheckout();});
$("stock-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!canManage()||busy||!store)return;
 const f=new FormData(e.target),amount=Number(f.get("quantity")),reason=String(f.get("reason")||"");
 if(!Number.isFinite(amount)||amount<=0||amount>1000000||Math.round(amount*1000)!==amount*1000){
   msg("stock-msg","بڕەکە نادروستە","error");return
 }
 lock(true);msg("stock-msg");
 try{
   const {error}=await db.rpc("retail_receive_stock",{
     p_store:store.id,p_product:String(f.get("product")),p_quantity:amount,p_reason:reason
   });if(error)throw error;
   e.target.reset();await loadInventory();msg("stock-msg","بڕی کۆگا تۆمارکرا","success");
 }catch(err){msg("stock-msg",safe(err),"error")}
 finally{lock(false)}
});
$("staff-form").addEventListener("submit",async e=>{
 e.preventDefault();if(role!=="owner"||busy||!store)return;
 const f=new FormData(e.target),id=String(f.get("user")||"").trim();
 if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)){
   msg("staff-msg","ناسنامەی کارمەند نادروستە","error");return
 }
 lock(true);msg("staff-msg");
 try{
   const {error}=await db.rpc("retail_assign_staff",{
     p_store:store.id,p_user:id,p_role:String(f.get("role")),p_active:String(f.get("active"))==="true"
   });if(error)throw error;
   await refreshStaff();msg("staff-msg","مۆڵەتی کارمەند نوێکرایەوە","success");
 }catch(err){msg("staff-msg",safe(err),"error")}
 finally{lock(false)}
});
void init();
})();
