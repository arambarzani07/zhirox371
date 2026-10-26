"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const config = window.RETAIL_CONFIG;
  const PAGE_SIZE = 50;
  let db, user = null, store = null, products = [], currentTab = "new", editing = null;
  let listOffset = 0, listTotal = 0;
  let priceItems = [], pricesOffset = 0, pricesTotal = 0;
  let barcodeItems = [], barcodesOffset = 0, barcodesTotal = 0;
  const requestedTab = new URLSearchParams(window.location.search).get("view");

  function show(id) {
    for (const name of ["auth-panel","store-panel","products-panel"]) $(name).hidden = name !== id;
    $("logout").hidden = id === "auth-panel";
    $("who").textContent = user && id !== "auth-panel" ? user.email || "" : "";
  }
  function message(id, value, kind = "") {
    const el = $(id); if (!el) return;
    el.textContent = value || ""; el.className = "message" + (kind ? " " + kind : "");
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
  function fmtIqd(n) {
    return n === null || n === undefined || !Number.isSafeInteger(Number(n)) ? "—" : Number(n).toLocaleString("en-US") + " IQD";
  }
  function updatePager(prefix, offset, total, count) {
    const box = $(prefix + "-pagination");
    if (!box) return;
    if (total <= 0) {
      box.hidden = true;
      return;
    }
    box.hidden = total <= PAGE_SIZE && offset === 0;
    const start = offset + 1;
    const end = Math.min(offset + count, total);
    $(prefix + "-page-info").textContent = start.toLocaleString("en-US") + "–" + end.toLocaleString("en-US") + " / " + total.toLocaleString("en-US");
    $(prefix + "-prev").disabled = offset <= 0;
    $(prefix + "-next").disabled = offset + PAGE_SIZE >= total;
  }
  function setTab(tab) {
    currentTab = ["new","list","prices","barcodes"].includes(tab) ? tab : "new";
    $("new-panel").hidden = currentTab !== "new";
    $("list-panel").hidden = currentTab !== "list";
    $("prices-panel").hidden = currentTab !== "prices";
    $("barcodes-panel").hidden = currentTab !== "barcodes";
    document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === currentTab));
    if (currentTab === "list") void loadProducts();
    if (currentTab === "prices") void loadPrices();
    if (currentTab === "barcodes") void loadBarcodes();
  }
  function renderProducts(filterLocal = false) {
    const results = $("results");
    results.replaceChildren();
    const query = $("search").value.trim().toLocaleLowerCase();
    const filtered = filterLocal && query
      ? products.filter(p => (p.name + " " + (p.sku || "") + " " + (p.plu || "") + " " + p.barcodes.join(" ")).toLocaleLowerCase().includes(query))
      : products;
    if (!filtered.length) {
      const el = document.createElement("div"); el.className = "blank"; el.textContent = "هیچ کاڵایەک نەدۆزرایەوە"; results.append(el);
      updatePager("list", 0, 0, 0);
      return;
    }
    const table = document.createElement("table"); table.className = "table";
    table.innerHTML = "<thead><tr><th>کاڵا</th><th>بارکۆد</th><th>نرخ</th><th>دۆخ</th><th></th></tr></thead><tbody></tbody>";
    for (const p of filtered) {
      const row = document.createElement("tr");
      const priceText = p.sale_mode === "carton" && p.carton_price_minor != null
        ? fmtIqd(p.carton_price_minor)
        : fmtIqd(p.price_minor);
      const cells = [p.name, p.barcodes.join("، ") || "—", priceText, p.active ? "چالاک" : "ناچالاک"];
      cells.forEach(value => { const td = document.createElement("td"); td.textContent = String(value); row.append(td); });
      const actionCell = document.createElement("td");
      if (user?.id === store?.owner_user_id) {
        const editBtn = document.createElement("button");
        editBtn.type = "button"; editBtn.className = "catalog-table-btn"; editBtn.textContent = "دەستکاری";
        editBtn.addEventListener("click", () => void beginEdit(p.id)); actionCell.append(editBtn);
      }
      row.append(actionCell);
      table.tBodies[0].append(row);
    }
    results.append(table);
    updatePager("list", listOffset, listTotal || filtered.length, filtered.length);
  }
  async function fetchCatalogPage(query, offset) {
    const v18 = await db.rpc("retail_catalog_page_v18", {
      p_store: store.id,
      p_search: query,
      p_offset: offset,
      p_limit: PAGE_SIZE
    });
    if (!v18.error && v18.data && Array.isArray(v18.data.items)) {
      return {
        items: v18.data.items.map(p => ({
          ...p,
          barcodes: Array.isArray(p.barcodes) ? p.barcodes : []
        })),
        total: Number(v18.data.total_count ?? v18.data.items.length),
        error: null
      };
    }
    if (!["PGRST202","42883"].includes(v18.error?.code)) {
      return { items: [], total: 0, error: v18.error };
    }
    // Legacy fallback when V18 RPC is not yet installed on an older hosted DB
    const productsResult = await db.from("retail_products")
      .select("id,name,price_minor,active")
      .eq("store_id", store.id).order("created_at", {ascending:false}).limit(200);
    if (productsResult.error) return { items: [], total: 0, error: productsResult.error };
    const base = productsResult.data || [];
    let barcodesResult = await db.from("retail_barcodes")
      .select("product_id,code,active").eq("store_id", store.id).limit(1000);
    // V15 stores inactive retired codes. Older hosted DBs lack this column:
    // use the previous catalogue query instead of disrupting unit-only work.
    if (["42703","PGRST204","PGRST205"].includes(barcodesResult.error?.code))
      barcodesResult = await db.from("retail_barcodes")
        .select("product_id,code").eq("store_id", store.id).limit(1000);
    if (barcodesResult.error) return { items: [], total: 0, error: barcodesResult.error };
    const index = new Map();
    for (const b of barcodesResult.data || []) {
      if (b.active === false) continue;
      if (!index.has(b.product_id)) index.set(b.product_id, []);
      index.get(b.product_id).push(b.code);
    }
    const q = query.trim().toLocaleLowerCase();
    const mapped = base.map(p => ({ ...p, barcodes: index.get(p.id) || [] }))
      .filter(p => !q || (p.name + " " + p.barcodes.join(" ")).toLocaleLowerCase().includes(q));
    return {
      items: mapped.slice(offset, offset + PAGE_SIZE),
      total: mapped.length,
      error: null
    };
  }
  async function loadProducts() {
    if (!db || !store) return;
    message("list-message", "");
    const query = $("search").value.trim();
    const res = await fetchCatalogPage(query, listOffset);
    if (res.error) { message("list-message", explain(res.error), "error"); return; }
    products = res.items;
    listTotal = res.total;
    renderProducts(false);
  }
  function renderPrices() {
    const root = $("prices-results");
    root.replaceChildren();
    if (!priceItems.length) {
      const el = document.createElement("div"); el.className = "blank"; el.textContent = "هیچ کاڵایەک نەدۆزرایەوە"; root.append(el);
      updatePager("prices", 0, 0, 0);
      return;
    }
    const table = document.createElement("table"); table.className = "table";
    table.innerHTML = "<thead><tr><th>کاڵا</th><th>شێوازی فرۆشتن</th><th>نرخی دانە</th><th>نرخی کارتۆن</th><th>دانە لە کارتۆن</th><th>کۆگا</th><th></th></tr></thead><tbody></tbody>";
    for (const p of priceItems) {
      const tr = document.createElement("tr");
      const mode = p.sale_mode === "carton" ? "کارتۆن" : p.sale_mode === "both" || p.carton_price_minor != null ? "هەردووکیان" : "دانە";
      const unitPrice = p.sale_mode === "carton" ? "—" : fmtIqd(p.price_minor);
      const cartonPrice = p.carton_price_minor != null ? fmtIqd(p.carton_price_minor) : "—";
      const packUnits = p.units_per_carton ? String(p.units_per_carton) + " دانە" : "—";
      const stockText = Number(p.stock_quantity || 0).toLocaleString("en-US") + " دانە";
      for (const val of [p.name, mode, unitPrice, cartonPrice, packUnits, stockText]) {
        const td = document.createElement("td"); td.textContent = val; tr.append(td);
      }
      const actionCell = document.createElement("td");
      if (user?.id === store?.owner_user_id) {
        const editBtn = document.createElement("button");
        editBtn.type = "button"; editBtn.className = "catalog-table-btn"; editBtn.textContent = "دەستکاری";
        editBtn.addEventListener("click", () => void beginEdit(p.id)); actionCell.append(editBtn);
      }
      tr.append(actionCell);
      table.tBodies[0].append(tr);
    }
    root.append(table);
    updatePager("prices", pricesOffset, pricesTotal, priceItems.length);
  }
  async function loadPrices() {
    if (!db || !store) return;
    message("prices-message", "");
    const query = $("prices-search").value.trim();
    const res = await fetchCatalogPage(query, pricesOffset);
    if (res.error) { message("prices-message", explain(res.error), "error"); return; }
    priceItems = res.items;
    pricesTotal = res.total;
    renderPrices();
  }
  function renderBarcodes() {
    const root = $("barcodes-results");
    root.replaceChildren();
    if (!barcodeItems.length) {
      const el = document.createElement("div"); el.className = "blank"; el.textContent = "هیچ بارکۆدێک نەدۆزرایەوە"; root.append(el);
      updatePager("barcodes", 0, 0, 0);
      return;
    }
    const table = document.createElement("table"); table.className = "table";
    table.innerHTML = "<thead><tr><th>بارکۆد</th><th>کاڵا</th><th>یەکە</th><th>بڕی دانە</th><th>نرخی فرۆشتن</th><th>جۆری بارکۆد</th></tr></thead><tbody></tbody>";
    for (const b of barcodeItems) {
      const tr = document.createElement("tr");
      const unitLabel = b.unit_type === "carton" ? "کارتۆن" : "دانە";
      const tierLabel = b.is_primary === false ? "فرەبارکۆد" : "سەرەکی";
      for (const val of [
        b.code,
        b.product_name || "—",
        unitLabel,
        String(b.units_per_scan || 1) + " دانە",
        fmtIqd(b.price_minor),
        tierLabel
      ]) {
        const td = document.createElement("td"); td.textContent = String(val); tr.append(td);
      }
      table.tBodies[0].append(tr);
    }
    root.append(table);
    updatePager("barcodes", barcodesOffset, barcodesTotal, barcodeItems.length);
  }
  async function loadBarcodes() {
    if (!db || !store) return;
    message("barcodes-message", "");
    const query = $("barcodes-search").value.trim();
    const v18 = await db.rpc("retail_barcode_page_v18", {
      p_store: store.id,
      p_search: query,
      p_offset: barcodesOffset,
      p_limit: PAGE_SIZE
    });
    if (!v18.error && v18.data && Array.isArray(v18.data.items)) {
      barcodeItems = v18.data.items;
      barcodesTotal = Number(v18.data.total_count ?? barcodeItems.length);
      renderBarcodes();
      return;
    }
    if (!["PGRST202","42883"].includes(v18.error?.code)) {
      message("barcodes-message", explain(v18.error), "error");
      return;
    }
    const pageRes = await fetchCatalogPage(query, 0);
    if (pageRes.error) { message("barcodes-message", explain(pageRes.error), "error"); return; }
    const flat = [];
    for (const p of pageRes.items) {
      for (const code of p.barcodes || []) {
        flat.push({ code, product_id: p.id, product_name: p.name, unit_type: "unit", units_per_scan: 1, price_minor: p.price_minor, is_primary: true });
      }
    }
    barcodesTotal = flat.length;
    barcodeItems = flat.slice(barcodesOffset, barcodesOffset + PAGE_SIZE);
    renderBarcodes();
  }
  async function inspectExactBarcode(code) {
    if (!db || !store) return;
    const target = $("barcode-inspect-result");
    target.replaceChildren();
    target.hidden = true;
    message("barcodes-message", "");
    const clean = String(code || "").trim();
    if (!clean) return;
    const res = await db.rpc("retail_resolve_barcode_v18", {
      p_store: store.id,
      p_code: clean
    });
    if (res.error) {
      message("barcodes-message", explain(res.error), "error");
      return;
    }
    if (!res.data || !res.data.found) {
      message("barcodes-message", "بارکۆدەکە نەدۆزرایەوە", "error");
      return;
    }
    const d = res.data;
    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = "<thead><tr><th>بارکۆد</th><th>کاڵا</th><th>یەکە</th><th>دانە لە پاکەت</th><th>نرخی فرۆشتن</th><th>بڕی کۆگا</th></tr></thead><tbody><tr></tr></tbody>";
    const tr = table.tBodies[0].rows[0];
    for (const val of [
      d.code,
      d.product_name,
      d.unit_type === "carton" ? "کارتۆن" : "دانە",
      String(d.units_per_scan) + " دانە",
      fmtIqd(d.price_minor),
      Number(d.stock_quantity || 0).toLocaleString("en-US") + " دانە"
    ]) {
      const td = document.createElement("td"); td.textContent = String(val); tr.append(td);
    }
    target.append(table);
    target.hidden = false;
  }
  function syncSellingMode(){
    const form=$("product-form");
    const mode=String(new FormData(form).get("sale_mode")||"unit");
    for(const [section,enabled] of [["unit-fields",mode!=="carton"],["carton-fields",mode!=="unit"]]){
      const node=$(section);node.hidden=!enabled;
      node.querySelectorAll("input,textarea").forEach(field=>field.disabled=!enabled);
    }
  }
  function sellingModeFromSnapshot(c){
    if(["unit","carton","both"].includes(c.sale_mode))return c.sale_mode;
    return c.carton?(c.unit_barcode?"both":"carton"):"unit";
  }
  function resetEditor() {
    editing=null;
    $("product-form").reset();
    syncSellingMode();
    $("product-form-title").textContent="کاڵای نوێ";
    $("save-product").textContent="زیادکردن";
    $("cancel-edit").hidden=true;$("history-product").hidden=true;
    $("product-history").hidden=true;
    $("product-history-list").replaceChildren();
    message("product-message","");
  }
  function fillEditor(c) {
    const form=$("product-form");
    const radio=form.querySelector(`[name="sale_mode"][value="${sellingModeFromSnapshot(c)}"]`);
    if(radio)radio.checked=true;
    syncSellingMode();
    const assign=(key,value)=>{
      const input=form.elements.namedItem(key);
      if(input)input.value=value===null||value===undefined?"":String(value);
    };
    for(const [input,key] of [
      ["name","name"],["sku","sku"],["plu","plu"],["barcode","unit_barcode"],
      ["purchase_price","unit_purchase_price_iqd"],["price","unit_sale_price_iqd"]])
      assign(input,c[key]);
    assign("extra_barcodes",(c.unit_alias_barcodes||[]).join("\n"));
    const carton=c.carton;
    assign("carton_name",carton?.name);assign("carton_barcode",carton?.barcode);
    assign("units_per_carton",carton?.units_per_carton);
    assign("carton_purchase_price",carton?.purchase_price_iqd);
    assign("carton_price",carton?.sale_price_iqd);
    assign("extra_carton_barcodes",(carton?.alias_barcodes||[]).join("\n"));
  }
  async function beginEdit(productId) {
    if(!db||!store||!user||user.id!==store.owner_user_id)return;
    message("list-message","");
    const {data,error}=await db.rpc("retail_product_snapshot_v15",{
      p_store_id:store.id,p_product_id:productId
    });
    if(error){message("list-message",explain(error),"error");return;}
    if(!data||!Number.isInteger(Number(data.version))){message("list-message","کاڵاکە نەدۆزرایەوە","error");return;}
    resetEditor();editing={id:productId,version:Number(data.version)};
    fillEditor(data);
    $("product-form-title").textContent="دەستکاریکردنی کاڵا";
    $("save-product").textContent="پاشەکەوتکردن";
    $("cancel-edit").hidden=false;$("history-product").hidden=false;
    setTab("new");
  }
  async function showProductHistory() {
    if(!editing||!db||!store)return;
    const result=await db.rpc("retail_product_history_v15",{
      p_store_id:store.id,p_product_id:editing.id
    });
    if(result.error){message("product-message",explain(result.error),"error");return;}
    const container=$("product-history-list");container.replaceChildren();
    const table=document.createElement("table");table.className="table";
    table.innerHTML="<thead><tr><th>کات</th><th>کارمەند</th><th>گۆڕانکاری</th></tr></thead><tbody></tbody>";
    for(const ev of result.data||[]){
      const row=document.createElement("tr");
      const before=ev.details?.before,after=ev.details?.after;
      const labels=[];
      if(before&&after){
        for(const [label,key] of [["ناو","name"],["نرخی فرۆشتنی دانە","unit_sale_price_iqd"],
          ["نرخی کڕینی دانە","unit_purchase_price_iqd"],["بارکۆدی دانە","unit_barcode"]]){
          if(before[key]!==after[key])labels.push(label);
        }
        if(JSON.stringify(before.unit_alias_barcodes)!==JSON.stringify(after.unit_alias_barcodes))
          labels.push("فرەبارکۆدی دانە");
        if(JSON.stringify(before.carton)!==JSON.stringify(after.carton))
          labels.push("کارتۆن و فرەبارکۆد");
      }
      const details=labels.join("، ")||(ev.action==="product.register_v14"?"زیادکردن":"دەستکاری");
      for(const cell of [new Date(ev.created_at).toLocaleString("en-GB"),ev.actor_id,details]){
        const td=document.createElement("td");td.textContent=cell;row.append(td);
      }
      table.tBodies[0].append(row);
    }
    container.append(table);$("product-history").hidden=false;
  }
  async function loadStore() {
    if (!db || !user) return;
    const {data,error} = await db.from("retail_stores")
      .select("id,name,currency,owner_user_id").order("created_at",{ascending:true}).limit(1).maybeSingle();
    if (error) {show("auth-panel");message("auth-message", explain(error), "error");return;}
    store = data;
    if (!store) {show("store-panel");return;}
    show("products-panel");
    setTab(["new","list","prices","barcodes"].includes(requestedTab) ? requestedTab : currentTab);
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
      // With RLS, INSERT ... RETURNING may fail its separate SELECT policy
      // even when the owner passes the INSERT check. Read after commit instead.
      const {error}=await db.from("retail_stores")
        .insert({owner_user_id:user.id,name,currency:"IQD"});
      if(error)throw error;
      await loadStore();
      if(!store)throw new Error("Store saved; refresh and sign in to load it");
    }catch(error){message("store-message",explain(error),"error");}
    finally{busy(btn,false);}
  });
  $("product-form").addEventListener("submit",async event=>{
    event.preventDefault();if(!db||!store||!user)return;
    let catalog;
    try {
      catalog=window.RetailCatalog.fromForm(new FormData(event.currentTarget));
    }catch(error){message("product-message",error.message,"error");return;}
    const btn=$("save-product");busy(btn,true);message("product-message","");
    try {
      // Product definitions, costs and pack barcodes belong exclusively here,
      // NEVER in cashier. The legacy RPC only supports one unit barcode and price.
      // Full details are sent atomically ONLY if the advanced server RPC is ready.
      const result=editing?
        await db.rpc("retail_update_product_v15",{
          p_store_id:store.id,p_product_id:editing.id,
          p_expected_version:editing.version,p_catalog:catalog
        }):
        catalog.advanced?
          await db.rpc("retail_register_product_v14",{p_store_id:store.id,p_catalog:catalog}):
          await db.rpc("retail_create_product",{
            p_store_id:store.id,p_name:catalog.name,
            p_barcode:catalog.unit_barcode,p_price_minor:catalog.unit_sale_price_iqd
          });
      if(result.error){
        if(editing&&result.error.code==="40001")
          throw new Error("کاڵاکە لەلایەن بەکارهێنەرێکی تر گۆڕدراوە؛ دووبارە بیکەرەوە");
        if(editing&&["PGRST202","42883"].includes(result.error.code))
          throw new Error("دەستکاریکردنی کاڵا لە داتابەیس چالاک نییە");
        if(!editing&&catalog.advanced&&["PGRST202","42883"].includes(result.error.code))
          throw new Error("تۆمارکردنی فرەبارکۆد و کارتۆن هێشتا لە داتابەیس چالاک نییە");
        throw result.error;
      }
      const wasEditing=!!editing;
      resetEditor();message("product-message",wasEditing?"کاڵاکە نوێ کرایەوە":"کاڵاکە بە سەرکەوتوویی تۆمارکرا","success");
      if(wasEditing)await loadProducts();
    }catch(error){message("product-message",explain(error),"error");}
    finally{busy(btn,false);}
  });
  $("product-form").querySelectorAll(`[name="sale_mode"]`).forEach(x=>x.addEventListener("change",syncSellingMode));
  syncSellingMode();
  $("cancel-edit").addEventListener("click",resetEditor);
  $("history-product").addEventListener("click",()=>void showProductHistory());
  $("refresh").addEventListener("click",()=>void loadProducts());
  $("search").addEventListener("input",()=>{
    listOffset=0;
    renderProducts(true);
    void loadProducts();
  });
  $("list-prev").addEventListener("click",()=>{
    if(listOffset>=PAGE_SIZE){listOffset-=PAGE_SIZE;void loadProducts();}
  });
  $("list-next").addEventListener("click",()=>{
    if(listOffset+PAGE_SIZE<listTotal){listOffset+=PAGE_SIZE;void loadProducts();}
  });
  $("prices-refresh").addEventListener("click",()=>void loadPrices());
  $("prices-search").addEventListener("input",()=>{
    pricesOffset=0;
    void loadPrices();
  });
  $("prices-prev").addEventListener("click",()=>{
    if(pricesOffset>=PAGE_SIZE){pricesOffset-=PAGE_SIZE;void loadPrices();}
  });
  $("prices-next").addEventListener("click",()=>{
    if(pricesOffset+PAGE_SIZE<pricesTotal){pricesOffset+=PAGE_SIZE;void loadPrices();}
  });
  $("barcodes-refresh").addEventListener("click",()=>void loadBarcodes());
  $("barcodes-search").addEventListener("input",()=>{
    barcodesOffset=0;
    void loadBarcodes();
  });
  $("barcodes-prev").addEventListener("click",()=>{
    if(barcodesOffset>=PAGE_SIZE){barcodesOffset-=PAGE_SIZE;void loadBarcodes();}
  });
  $("barcodes-next").addEventListener("click",()=>{
    if(barcodesOffset+PAGE_SIZE<barcodesTotal){barcodesOffset+=PAGE_SIZE;void loadBarcodes();}
  });
  $("barcode-inspect-form").addEventListener("submit",e=>{
    e.preventDefault();
    void inspectExactBarcode($("barcode-inspect-input").value);
  });
  document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
  $("logout").addEventListener("click",async()=>{
    if(db) await db.auth.signOut();
    user=null;store=null;products=[];show("auth-panel");message("auth-message","");
  });
  void initialize();
})();
