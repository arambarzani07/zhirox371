"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const config = window.RETAIL_CONFIG;
  let db, user = null, store = null, products = [], currentTab = "new";
  const requestedTab = new URLSearchParams(window.location.search).get("view");

  function show(id) {
    for (const name of ["auth-panel","store-panel","products-panel"]) $(name).hidden = name !== id;
    $("logout").hidden = id === "auth-panel";
    $("who").textContent = user && id !== "auth-panel" ? user.email || "" : "";
  }
  function message(id, value, kind = "") {
    const el = $(id); el.textContent = value || ""; el.className = "message" + (kind ? " " + kind : "");
  }
  function busy(button, on) {
    button.disabled = !!on;
    button.setAttribute("aria-busy", String(!!on));
  }
  function explain(error) {
    if (!error) return "هەڵەیەکی نەناسراو ڕوویدا";
    if (error.code === "23505") return "ئەم بارکۆدە پێشتر تۆمارکراوە";
    if (error.code === "42501" || error.code === "PGRST301") return "دەسەڵاتی ئەم کردارەت نییە";
    if (/Invalid login credentials/i.test(error.message || "")) return "ئیمەیڵ یان وشەی نهێنی هەڵەیە";
    if (/Email not confirmed/i.test(error.message || "")) return "سەرەتا ئیمەیڵەکەت پشتڕاست بکەرەوە";
    if (/Failed to fetch|NetworkError/i.test(error.message || "")) return "پەیوەندیی ئینتەرنێت یان سێرڤەر بپشکنە";
    return error.message || "کردارەکە سەرکەوتوو نەبوو";
  }
  function setTab(tab) {
    currentTab = tab === "list" ? "list" : "new";
    $("new-panel").hidden = currentTab !== "new";
    $("list-panel").hidden = currentTab !== "list";
    document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === currentTab));
    if (currentTab === "list") void loadProducts();
  }
  function renderProducts() {
    const results = $("results");
    results.replaceChildren();
    const query = $("search").value.trim().toLocaleLowerCase();
    const filtered = products.filter(p => (p.name + " " + p.barcodes.join(" ")).toLocaleLowerCase().includes(query));
    if (!filtered.length) {
      const el = document.createElement("div"); el.className = "blank"; el.textContent = "هیچ کاڵایەک نەدۆزرایەوە"; results.append(el); return;
    }
    const table = document.createElement("table"); table.className = "table";
    table.innerHTML = "<thead><tr><th>کاڵا</th><th>بارکۆد</th><th>نرخ</th><th>دۆخ</th></tr></thead><tbody></tbody>";
    for (const p of filtered) {
      const row = document.createElement("tr");
      const cells = [p.name, p.barcodes.join("، ") || "—", Number(p.price_minor).toLocaleString("en-US") + " IQD", p.active ? "چالاک" : "ناچالاک"];
      cells.forEach(value => { const td = document.createElement("td"); td.textContent = String(value); row.append(td); });
      table.tBodies[0].append(row);
    }
    results.append(table);
  }
  async function loadProducts() {
    if (!db || !store) return;
    message("list-message", "");
    const productsResult = await db.from("retail_products")
      .select("id,name,price_minor,active")
      .eq("store_id", store.id).order("created_at", {ascending:false}).limit(200);
    if (productsResult.error) {message("list-message", explain(productsResult.error), "error");return;}
    const base = productsResult.data || [];
    const barcodesResult = await db.from("retail_barcodes")
      .select("product_id,code").eq("store_id", store.id).limit(1000);
    if (barcodesResult.error) {message("list-message", explain(barcodesResult.error), "error");return;}
    const index = new Map();
    for (const b of barcodesResult.data || []) {
      if (!index.has(b.product_id)) index.set(b.product_id,[]);
      index.get(b.product_id).push(b.code);
    }
    products = base.map(p=>({...p,barcodes:index.get(p.id)||[]}));
    renderProducts();
    if (base.length >= 200 || (barcodesResult.data || []).length >= 1000)
      message("list-message", "تەنها بەشێک لە کاڵاکان پیشان دەدرێت؛ پەڕەبەندی لە قۆناغی داهاتوو زیاد دەکرێت");
  }
  async function loadStore() {
    if (!db || !user) return;
    const {data,error} = await db.from("retail_stores")
      .select("id,name,currency").order("created_at",{ascending:true}).limit(1).maybeSingle();
    if (error) {show("auth-panel");message("auth-message", explain(error), "error");return;}
    store = data;
    if (!store) {show("store-panel");return;}
    show("products-panel");
    setTab(requestedTab === "list" ? "list" : currentTab);
  }
  async function initialize() {
    if (!window.supabase || !config?.supabaseUrl || !config?.publishableKey) {
      message("system-message","پەیوەندیی Supabase بەردەست نییە؛ فایلەکانی config.js و supabase-js بپشکنە","error");
      show("auth-panel"); return;
    }
    db = window.supabase.createClient(config.supabaseUrl,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });
    const {data,error} = await db.auth.getUser();
    if (error || !data?.user) {show("auth-panel");return;}
    user = data.user;
    await loadStore();
  }
  $("login-form").addEventListener("submit",async event=>{
    event.preventDefault(); if(!db)return;
    const btn=$("sign-in"),data=new FormData(event.currentTarget);
    busy(btn,true);message("auth-message","");
    try {
      const {data:result,error}=await db.auth.signInWithPassword({
        email:String(data.get("email")||"").trim(),password:String(data.get("password")||"")
      });
      if(error)throw error;
      user=result.user;
      await loadStore();
    } catch(error){message("auth-message",explain(error),"error");}
    finally{busy(btn,false);}
  });
  $("sign-up").addEventListener("click",async ()=>{
    if(!db)return;
    const form=$("login-form");if(!form.reportValidity())return;
    const values=new FormData(form),btn=$("sign-up");
    busy(btn,true);message("auth-message","");
    try{
      const {data,error}=await db.auth.signUp({
        email:String(values.get("email")||"").trim(),password:String(values.get("password")||"")
      });
      if(error)throw error;
      if(data?.session && data?.user){user=data.user;await loadStore();}
      else message("auth-message","ئیمەیڵەکەت بپشکنە و هەژمارەکە پشتڕاست بکەرەوە","success");
    }catch(error){message("auth-message",explain(error),"error");}
    finally{busy(btn,false);}
  });
  $("store-form").addEventListener("submit",async event=>{
    event.preventDefault();if(!db||!user)return;
    const name=String(new FormData(event.currentTarget).get("name")||"").trim();
    if(!name||name.length>160)return;
    const btn=$("create-store");busy(btn,true);message("store-message","");
    try{
      const {data,error}=await db.from("retail_stores")
        .insert({owner_user_id:user.id,name,currency:"IQD"}).select("id,name,currency").single();
      if(error)throw error;
      store=data;show("products-panel");setTab(currentTab);
    }catch(error){message("store-message",explain(error),"error");}
    finally{busy(btn,false);}
  });
  $("product-form").addEventListener("submit",async event=>{
    event.preventDefault();if(!db||!store||!user)return;
    const f=new FormData(event.currentTarget),name=String(f.get("name")||"").trim(),
      barcode=String(f.get("barcode")||"").trim(),price=Number(f.get("price"));
    if(!name||name.length>160||!barcode||barcode.length>60||!Number.isSafeInteger(price)||price<0||price>999999999){
      message("product-message","زانیارییەکان بە دروستی پڕ بکەرەوە","error");return;
    }
    const btn=$("save-product");busy(btn,true);message("product-message","");
    try {
      const {error}=await db.rpc("retail_create_product",{
        p_store_id:store.id,p_name:name,p_barcode:barcode,p_price_minor:price
      });
      if(error)throw error;
      event.target.reset();message("product-message","کاڵاکە بە سەرکەوتوویی تۆمارکرا","success");
    }catch(error){message("product-message",explain(error),"error");}
    finally{busy(btn,false);}
  });
  $("refresh").addEventListener("click",()=>void loadProducts());
  $("search").addEventListener("input",renderProducts);
  document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
  $("logout").addEventListener("click",async()=>{
    if(db) await db.auth.signOut();
    user=null;store=null;products=[];show("auth-panel");message("auth-message","");
  });
  void initialize();
})();
