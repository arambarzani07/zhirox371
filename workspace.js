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
    if(id!=="products-panel")clearLabelState();
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
    const stockFilter = $("list-stock-filter")?.value || "all";
    const filtered = products.filter(p => {
      const qty = Number(p.stock_quantity ?? 0);
      if (stockFilter === "low" && qty > 5) return false;
      if (stockFilter === "out" && qty > 0) return false;
      if (!filterLocal || !query) return true;
      return (p.name + " " + (p.sku || "") + " " + (p.plu || "") + " " + p.barcodes.join(" ")).toLocaleLowerCase().includes(query);
    });
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
      const stockQty = Number(p.stock_quantity ?? 0);
      const stockUnit = p.base_unit === "kg" ? " کیلۆگرام" : " دانە";
      const statusText = (p.active ? "چالاک" : "ناچالاک") + " · کۆگا: " + stockQty.toLocaleString("en-US", { maximumFractionDigits: 3 }) + stockUnit + (stockQty <= 0 ? " (تەواوبوو)" : stockQty <= 5 ? " (کەمبووە)" : "");
      const cells = [p.name + (p.base_unit === "kg" ? " (کیلۆگرام)" : " "), p.barcodes.join("، ") || "—", priceText, statusText];
      cells.forEach((value, idx) => {
        const td = document.createElement("td");
        td.textContent = String(value);
        if (idx === 3) {
          if (stockQty <= 0) { td.style.color = "#dc2626"; td.style.fontWeight = "bold"; }
          else if (stockQty <= 5) { td.style.color = "#d97706"; td.style.fontWeight = "bold"; }
        }
        row.append(td);
      });
      const actionCell = document.createElement("td");
      if (user?.id === store?.owner_user_id) {
        const editBtn = document.createElement("button");
        editBtn.type = "button"; editBtn.className = "catalog-table-btn"; editBtn.textContent = "دەستکاری";
        editBtn.addEventListener("click", () => void beginEdit(p.id)); actionCell.append(editBtn);
      }
      const stockLink = document.createElement("a");
      stockLink.className = "catalog-stock-btn";
      stockLink.href = "./operations.html?view=stock&product=" + encodeURIComponent(p.id) + "&q=" + encodeURIComponent(p.name || "");
      stockLink.textContent = "+ کۆگا";
      actionCell.append(stockLink);
      const labelBtn = document.createElement("button");
      labelBtn.type = "button"; labelBtn.className = "catalog-label-btn"; labelBtn.dataset.printLabel = (p.barcodes && p.barcodes[0]) || p.id;
      labelBtn.textContent = "لەیبڵ";
      labelBtn.addEventListener("click", () => openLabelPreview({
        code: (p.barcodes && p.barcodes[0]) || "",
        name: p.name,
        priceMinor: p.sale_mode === "carton" && p.carton_price_minor != null ? p.carton_price_minor : p.price_minor,
        unitLabel: p.sale_mode === "carton" ? "کارتۆن" : p.base_unit === "kg" ? "کیلۆگرام" : "دانە"
      }));
      actionCell.append(labelBtn);
      row.append(actionCell);
      table.tBodies[0].append(row);
    }
    results.append(table);
    updatePager("list", listOffset, listTotal || filtered.length, filtered.length);
  }
  async function fetchCatalogPage(query, offset, stockFilter = "all") {
    const rpcArgs = {
      p_store: store.id,
      p_search: query,
      p_offset: offset,
      p_limit: PAGE_SIZE
    };
    if (stockFilter && stockFilter !== "all") rpcArgs.p_stock_filter = stockFilter;
    const v18 = await db.rpc("retail_catalog_page_v18", rpcArgs);
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
      .select("id,name,price_minor,active,base_unit")
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
    const stockRes=await db.from("retail_stock_balances").select("product_id,quantity").eq("store_id",store.id).limit(2000);
    const stockMap=new Map((stockRes.error?[]:stockRes.data||[]).map(x=>[x.product_id,Number(x.quantity)]));
    const q = query.trim().toLocaleLowerCase();
    const mapped = base.map(p => ({ ...p, stock_quantity:stockMap.get(p.id)??0, barcodes: index.get(p.id) || [] }))
      .filter(p => {
        const qty = Number(p.stock_quantity ?? 0);
        if (stockFilter === "low" && qty > 5) return false;
        if (stockFilter === "out" && qty > 0) return false;
        return !q || (p.name + " " + p.barcodes.join(" ")).toLocaleLowerCase().includes(q);
      });
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
    const stockFilter = $("list-stock-filter")?.value || "all";
    const res = await fetchCatalogPage(query, listOffset, stockFilter);
    if (res.error) { message("list-message", explain(res.error), "error"); return; }
    products = res.items;
    listTotal = res.total;
    renderProducts(false);
  }
  function buildEan13WithCheckDigit(twelveDigits) {
    const clean = String(twelveDigits || "").replace(/\D/g, "").padStart(12, "0").slice(0, 12);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = clean.charCodeAt(i) - 48;
      sum += (i % 2 === 0) ? d : d * 3;
    }
    const check = (10 - (sum % 10)) % 10;
    return clean + String(check);
  }
  function generateUniqueStoreEan13(prefix = "200") {
    const tail = String(Math.floor(100000000 + Math.random() * 900000000));
    return buildEan13WithCheckDigit((prefix + tail).slice(0, 12));
  }
  function buildScaleEan13(plu, grams) {
    const cleanPlu = String(plu || "1").replace(/\D/g, "").padStart(5, "0").slice(-5);
    const cleanGrams = String(Math.max(1, Math.min(99999, Math.round(Number(grams) || 0)))).padStart(5, "0");
    return buildEan13WithCheckDigit("27" + cleanPlu + cleanGrams);
  }
  function exportCsvFile(filename, headers, rows) {
    const escapeCsv = val => {
      const s = String(val ?? "");
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(escapeCsv).join(",")];
    for (const r of rows) lines.push(r.map(escapeCsv).join(","));
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function updateMarginHints() {
    const form = $("product-form");
    if (!form) return;
    const uCostRaw = String(form.elements.namedItem("purchase_price")?.value ?? "").trim();
    const uPriceRaw = String(form.elements.namedItem("price")?.value ?? "").trim();
    const uHint = $("unit-margin-hint");
    if (uHint) {
      if (uCostRaw !== "" && uPriceRaw !== "") {
        const cost = Number(uCostRaw), sale = Number(uPriceRaw);
        if (Number.isFinite(cost) && Number.isFinite(sale) && sale >= 0 && cost >= 0) {
          const profit = sale - cost;
          const pct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : "100.0";
          uHint.textContent = (profit >= 0 ? "قازانجی دانە: +" : "زیانی دانە: ") + profit.toLocaleString("en-US") + " IQD (" + pct + "%)";
          uHint.style.color = profit < 0 ? "#dc2626" : "#0f766e";
          uHint.hidden = false;
        } else uHint.hidden = true;
      } else uHint.hidden = true;
    }
    const cCostRaw = String(form.elements.namedItem("carton_purchase_price")?.value ?? "").trim();
    const cPriceRaw = String(form.elements.namedItem("carton_price")?.value ?? "").trim();
    const cUnitsRaw = Number(form.elements.namedItem("units_per_carton")?.value || 0);
    const cHint = $("carton-margin-hint");
    if (cHint) {
      if (cPriceRaw !== "") {
        const sale = Number(cPriceRaw);
        const perUnitText = cUnitsRaw >= 2 && Number.isFinite(sale) ? " · هەر دانەیەک لە کارتۆندا: " + Math.round(sale / cUnitsRaw).toLocaleString("en-US") + " IQD" : "";
        if (cCostRaw !== "") {
          const cost = Number(cCostRaw);
          const profit = sale - cost;
          const pct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : "100.0";
          cHint.textContent = (profit >= 0 ? "قازانجی کارتۆن: +" : "زیانی کارتۆن: ") + profit.toLocaleString("en-US") + " IQD (" + pct + "%)" + perUnitText;
          cHint.style.color = profit < 0 ? "#dc2626" : "#0f766e";
          cHint.hidden = false;
        } else if (perUnitText) {
          cHint.textContent = perUnitText.replace(/^ · /, "");
          cHint.style.color = "#0f766e";
          cHint.hidden = false;
        } else cHint.hidden = true;
      } else cHint.hidden = true;
    }
  }
  let currentLabel=null,batchLabels=[],batchReady=false,printingBatch=false,batchBusy=false,labelEpoch=0;
  function labelContext(){return `${store?.id}|${user?.id}|${labelEpoch}`;}
  function clearLabelState(){labelEpoch++;currentLabel=null;batchLabels=[];invalidateBatch();$("batch-label-list").replaceChildren();$("barcode-label-box").hidden=true;$("label-print-root")?.remove();document.body.classList.remove("printing-labels");}
  function buildBarcodeSvg(code){return window.RetailLabelTools.svg(code);}
  function showLabel(item){
    currentLabel=window.RetailLabelTools.item(item);
    $("label-product-name").textContent=item.name+" ("+item.unitLabel+")";
    $("label-price-text").textContent=fmtIqd(item.priceMinor);$("label-code-text").textContent=item.code;
    const svg=buildBarcodeSvg(item.code);svg.id="label-barcode-svg";$("label-barcode-holder").replaceChildren(svg);$("barcode-label-box").hidden=false;
  }
  async function openLabelPreview(item){
    try{if(!db||!store)throw new Error("سەرەتا بچۆ ژوورەوە");const context=labelContext();const [confirmed]=await window.RetailLabelTools.confirm(db,store.id,[{...item,copies:1}]);if(context!==labelContext())return;showLabel(confirmed);}
    catch(error){$("barcode-label-box").hidden=true;message("system-message",explain(error),"error");}
  }
  function printLabels(nodes,size="50x30"){
    if(size==="38x25"&&nodes.some(x=>Number(x.querySelector("svg")?.getAttribute("width"))/2>170))throw new Error("بارکۆدەکە بۆ لیبڵی ٣٨ ملیمەتری درێژە؛ قەبارەی ٥٠ ملیمەتری هەڵبژێرە");
    document.getElementById("label-print-root")?.remove();
    const root=document.createElement("div");root.id="label-print-root";
    for(const node of nodes){const copy=node.cloneNode(true);copy.removeAttribute("id");for(const el of copy.querySelectorAll("[id]"))el.removeAttribute("id");copy.className="batch-print-label"+(size==="38x25"?" size-small":"");root.append(copy);}
    const style=document.createElement("style");style.textContent="@page{size:"+(size==="38x25"?"38mm 25mm":"50mm 30mm")+";margin:0}";root.append(style);
    document.body.append(root);document.body.classList.add("printing-labels");window.print();
  }
  function setBatchBusy(value){batchBusy=value;for(const el of $("batch-label-panel").querySelectorAll("button,input"))el.disabled=value;$("label-queue-btn").disabled=value;$("batch-print").disabled=value||!batchReady;}
  function invalidateBatch(){batchReady=false;$("batch-print").disabled=true;$("batch-label-preview").replaceChildren();}
  function renderBatch(){
    invalidateBatch();$("batch-label-panel").hidden=false;const root=$("batch-label-list");root.replaceChildren();
    for(const row of batchLabels){const line=document.createElement("div");line.className="batch-queue-row";const text=document.createElement("span");text.textContent=row.name+" — "+row.code;
      const copies=document.createElement("input");copies.type="number";copies.min="1";copies.max="50";copies.value=row.copies;copies.setAttribute("aria-label","ژمارەی کۆپی "+row.code);copies.oninput=()=>{row.copies=copies.value;invalidateBatch();};
      const remove=document.createElement("button");remove.type="button";remove.className="secondary";remove.textContent="لابردن";remove.onclick=()=>{batchLabels=batchLabels.filter(x=>x!==row);renderBatch();};line.append(text,copies,remove);root.append(line);}
  }
  $("label-queue-btn").onclick=()=>{if(!currentLabel||batchBusy)return;const old=batchLabels.find(x=>x.code===currentLabel.code);if(!old)batchLabels.push({...currentLabel,copies:1});renderBatch();};
  $("batch-clear").onclick=()=>{batchLabels=[];renderBatch();message("batch-message","");};
  $("batch-prepare").onclick=async()=>{const btn=$("batch-prepare");setBatchBusy(true);invalidateBatch();try{
    const context=labelContext(),fresh=await window.RetailLabelTools.confirm(db,store.id,batchLabels);if(context!==labelContext())return;batchLabels=fresh;const root=$("batch-label-preview");
    for(const row of batchLabels)for(let i=0;i<Number(row.copies);i++){const card=document.createElement("article");card.className="batch-print-label";for(const text of [store.name,row.name+" ("+row.unitLabel+")",fmtIqd(row.priceMinor)]){const p=document.createElement("div");p.textContent=text;card.append(p);}card.append(buildBarcodeSvg(row.code));const code=document.createElement("div");code.textContent=row.code;code.dir="ltr";card.append(code);root.append(card);}
    batchReady=true;$("batch-print").disabled=false;message("batch-message","نرخەکان پشتڕاست کرانەوە؛ پێشبینینەکە بپشکنە. چاپ تۆمارێکی کۆگا یان نرخ ناگۆڕێت.","success");
   }catch(error){message("batch-message",explain(error),"error");}finally{setBatchBusy(false);}};
  $("batch-print").onclick=async()=>{if(!batchReady)return;const btn=$("batch-print");setBatchBusy(true);try{
    const context=labelContext(),fresh=await window.RetailLabelTools.confirm(db,store.id,batchLabels);if(context!==labelContext())return;if(fresh.some((x,i)=>x.priceMinor!==batchLabels[i].priceMinor||x.name!==batchLabels[i].name)){invalidateBatch();throw new Error("نرخ یان ناوی کاڵا گۆڕدراوە؛ پێشبینین دووبارە ئامادە بکە");}
    printingBatch=true;printLabels([...$("batch-label-preview").children]);
   }catch(error){invalidateBatch();message("batch-message",explain(error),"error");}finally{setBatchBusy(false);}};
  window.addEventListener("afterprint",()=>{document.body.classList.remove("printing-labels");$("label-print-root")?.remove();printingBatch=false;});

  if(new URLSearchParams(location.search).get("batch")==="1")$("batch-label-panel").hidden=false;
  function renderPrices() {
    const root = $("prices-results");
    root.replaceChildren();
    if (!priceItems.length) {
      const el = document.createElement("div"); el.className = "blank"; el.textContent = "هیچ کاڵایەک نەدۆزرایەوە"; root.append(el);
      updatePager("prices", 0, 0, 0);
      return;
    }
    const table = document.createElement("table"); table.className = "table";
    table.innerHTML = "<thead><tr><th>کاڵا</th><th>شێوازی فرۆشتن</th><th>نرخی دانە / کیلۆگرام</th><th>نرخی کارتۆن</th><th>دانە لە کارتۆن</th><th>کۆگا</th><th></th></tr></thead><tbody></tbody>";
    for (const p of priceItems) {
      const tr = document.createElement("tr");
      const mode = p.sale_mode === "carton" ? "کارتۆن" : p.sale_mode === "both" || p.carton_price_minor != null ? "هەردووکیان" : p.base_unit==="kg"?"کیلۆگرام":"دانە";
      const unitPrice = p.sale_mode === "carton" ? "—" : fmtIqd(p.price_minor);
      const cartonPrice = p.carton_price_minor != null ? fmtIqd(p.carton_price_minor) : "—";
      const packUnits = p.units_per_carton ? String(p.units_per_carton) + " دانە" : "—";
      const stockQty = Number(p.stock_quantity || 0);
      const stockText = stockQty.toLocaleString("en-US",{maximumFractionDigits:3}) + (p.base_unit==="kg"?" کیلۆگرام":" دانە") + (stockQty<=0?" (تەواوبوو)":stockQty<=5?" (کەمبووە)":"");
      for (const val of [p.name, mode, unitPrice, cartonPrice, packUnits, stockText]) {
        const td = document.createElement("td"); td.textContent = val;
        if (val === stockText) {
          if (stockQty <= 0) { td.style.color = "#dc2626"; td.style.fontWeight = "bold"; }
          else if (stockQty <= 5) { td.style.color = "#d97706"; td.style.fontWeight = "bold"; }
        }
        tr.append(td);
      }
      const actionCell = document.createElement("td");
      if (user?.id === store?.owner_user_id) {
        const editBtn = document.createElement("button");
        editBtn.type = "button"; editBtn.className = "catalog-table-btn"; editBtn.textContent = "دەستکاری";
        editBtn.addEventListener("click", () => void beginEdit(p.id)); actionCell.append(editBtn);
      }
      const stockLink = document.createElement("a");
      stockLink.className = "catalog-stock-btn";
      stockLink.href = "./operations.html?view=stock&product=" + encodeURIComponent(p.id) + "&q=" + encodeURIComponent(p.name || "");
      stockLink.textContent = "+ کۆگا";
      actionCell.append(stockLink);
      const labelBtn = document.createElement("button");
      labelBtn.type = "button"; labelBtn.className = "catalog-label-btn"; labelBtn.dataset.printLabel = (p.barcodes && p.barcodes[0]) || p.id;
      labelBtn.textContent = "لەیبڵ";
      labelBtn.addEventListener("click", () => openLabelPreview({
        code: (p.barcodes && p.barcodes[0]) || "",
        name: p.name,
        priceMinor: p.sale_mode === "carton" && p.carton_price_minor != null ? p.carton_price_minor : p.price_minor,
        unitLabel: p.sale_mode === "carton" ? "کارتۆن" : p.base_unit==="kg"?"کیلۆگرام":"دانە"
      }));
      actionCell.append(labelBtn);
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
    const stockFilter = $("prices-stock-filter")?.value || "all";
    const res = await fetchCatalogPage(query, pricesOffset, stockFilter);
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
    table.innerHTML = "<thead><tr><th>بارکۆد</th><th>کاڵا</th><th>یەکە</th><th>بڕی دانە</th><th>نرخی فرۆشتن</th><th>جۆری بارکۆد</th><th></th></tr></thead><tbody></tbody>";
    for (const b of barcodeItems) {
      const tr = document.createElement("tr");
      const unitLabel = b.unit_type === "carton" ? "کارتۆن" : b.base_unit==="kg"?"کیلۆگرام":"دانە";
      const tierLabel = b.is_primary === false ? "فرەبارکۆد" : "سەرەکی";
      for (const val of [
        b.code,
        b.product_name || "—",
        unitLabel,
        String(b.units_per_scan || 1) + (b.base_unit==="kg"?" کیلۆگرام":" دانە"),
        fmtIqd(b.price_minor),
        tierLabel
      ]) {
        const td = document.createElement("td"); td.textContent = String(val); tr.append(td);
      }
      const actionTd = document.createElement("td");
      if (b.product_id && user?.id === store?.owner_user_id) {
        const editBtn = document.createElement("button");
        editBtn.type = "button"; editBtn.className = "catalog-table-btn"; editBtn.textContent = "دەستکاری";
        editBtn.addEventListener("click", () => void beginEdit(b.product_id));
        actionTd.append(editBtn);
      }
      const labelBtn = document.createElement("button");
      labelBtn.type = "button"; labelBtn.className = "catalog-label-btn"; labelBtn.dataset.printLabel = b.code;
      labelBtn.textContent = "لەیبڵ";
      labelBtn.addEventListener("click", () => openLabelPreview({
        code: b.code,
        name: b.product_name || "کاڵا",
        priceMinor: b.price_minor,
        unitLabel
      }));
      actionTd.append(labelBtn);
      tr.append(actionTd);
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
        flat.push({ code, product_id: p.id, product_name: p.name, unit_type: "unit", base_unit:p.base_unit||"unit", units_per_scan: 1, price_minor: p.price_minor, is_primary: true });
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
    table.innerHTML = "<thead><tr><th>بارکۆد</th><th>کاڵا</th><th>یەکە</th><th>دانە لە پاکەت</th><th>نرخی فرۆشتن</th><th>بڕی کۆگا</th><th></th></tr></thead><tbody><tr></tr></tbody>";
    const tr = table.tBodies[0].rows[0];
    const singleStock = Number(d.stock_quantity || 0);
    const stockVal = singleStock.toLocaleString("en-US",{maximumFractionDigits:3}) + (d.base_unit==="kg"?" کیلۆگرام":" دانە") + (singleStock<=0?" (تەواوبوو)":singleStock<=5?" (کەمبووە)":"");
    for (const val of [
      d.code,
      d.product_name,
      d.unit_type === "carton" ? "کارتۆن" : d.base_unit==="kg"?"کیلۆگرام":"دانە",
      d.scale_label || (String(d.units_per_scan) + (d.base_unit==="kg"?" کیلۆگرام":" دانە")),
      fmtIqd(d.price_minor),
      stockVal
    ]) {
      const td = document.createElement("td"); td.textContent = String(val);
      if (val === stockVal) {
        if (singleStock <= 0) { td.style.color = "#dc2626"; td.style.fontWeight = "bold"; }
        else if (singleStock <= 5) { td.style.color = "#d97706"; td.style.fontWeight = "bold"; }
      }
      tr.append(td);
    }
    const actionTd = document.createElement("td");
    if (d.product_id && user?.id === store?.owner_user_id) {
      const editBtn = document.createElement("button");
      editBtn.type = "button"; editBtn.className = "catalog-table-btn"; editBtn.textContent = "دەستکاری";
      editBtn.addEventListener("click", () => void beginEdit(d.product_id));
      actionTd.append(editBtn);
    }
    const labelBtn = document.createElement("button");
    labelBtn.type = "button"; labelBtn.className = "catalog-label-btn"; labelBtn.dataset.printLabel = d.code;
    labelBtn.textContent = "لەیبڵ";
    labelBtn.addEventListener("click", () => openLabelPreview({
      code: d.code,
      name: d.product_name,
      priceMinor: d.price_minor,
      unitLabel: d.unit_type === "carton" ? "کارتۆن" : d.base_unit==="kg"?"کیلۆگرام":"دانە"
    }));
    actionTd.append(labelBtn);
    tr.append(actionTd);
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
    updateMarginHints();
  }
  function sellingModeFromSnapshot(c){
    if(["unit","carton","both"].includes(c.sale_mode))return c.sale_mode;
    return c.carton?(c.unit_barcode?"both":"carton"):"unit";
  }
  function resetEditor() {
    editing=null;
    $("product-form").reset();
    $("base-unit").value="unit";$("base-unit").disabled=true;
    $("save-base-unit").hidden=true;
    syncSellingMode();
    updateMarginHints();
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
    $("base-unit").disabled=false;
    const assign=(key,value)=>{
      const input=form.elements.namedItem(key);
      if(input)input.value=value===null||value===undefined?"":String(value);
    };
    for(const [input,key] of [
      ["name","name"],["sku","sku"],["plu","plu"],["barcode","unit_barcode"],
      ["purchase_price","unit_purchase_price_iqd"],["price","unit_sale_price_iqd"]])
      assign(input,c[key]);
    assign("base_unit",c.base_unit||"unit");
    assign("extra_barcodes",(c.unit_alias_barcodes||[]).join("\n"));
    const carton=c.carton;
    assign("carton_name",carton?.name);assign("carton_barcode",carton?.barcode);
    assign("units_per_carton",carton?.units_per_carton);
    assign("carton_purchase_price",carton?.purchase_price_iqd);
    assign("carton_price",carton?.sale_price_iqd);
    assign("extra_carton_barcodes",(carton?.alias_barcodes||[]).join("\n"));
    updateMarginHints();
  }
  async function beginEdit(productId) {
    if(!db||!store||!user||user.id!==store.owner_user_id)return;
    message("list-message","");
    let {data:snapshotData,error}=await db.rpc("retail_product_snapshot_v19",{
      p_store_id:store.id,p_product_id:productId
    });
    if(error&&["PGRST202","42883"].includes(error.code)){
      const v15=await db.rpc("retail_product_snapshot_v15",{
        p_store_id:store.id,p_product_id:productId
      });
      if(!v15.error&&v15.data){
        snapshotData={...v15.data,base_unit:v15.data.base_unit||"unit",stock_quantity:Number(v15.data.stock_quantity||0)};
        error=null;
      }
    }
    if(error){message("list-message",explain(error),"error");return;}
    if(!snapshotData||!Number.isInteger(Number(snapshotData.version))){
      message("list-message","کاڵاکە نەدۆزرایەوە یان وەشانی کاڵا نادروستە","error");return;
    }
    resetEditor();editing={id:productId,version:Number(snapshotData.version),baseUnit:snapshotData.base_unit||"unit",stockQuantity:Number(snapshotData.stock_quantity)};
    fillEditor(snapshotData);
    $("product-form-title").textContent="دەستکاریکردنی کاڵا";
    $("save-product").textContent="پاشەکەوتکردن";
    $("cancel-edit").hidden=false;$("history-product").hidden=false;
    $("save-base-unit").hidden=false;
    setTab("new");
  }
  async function showProductHistory() {
    if(!editing||!db||!store)return;
    const result=await db.rpc("retail_product_history_v15",{
      p_store_id:store.id,p_product_id:editing.id
    });
    if(result.error){
      if(["PGRST202","42883"].includes(result.error.code) || String(result.error.message||"").includes("retail_product_history_v15")){
        const container=$("product-history-list");container.replaceChildren();
        const p=document.createElement("p");p.style.padding="8px";p.style.color="#64748b";
        p.textContent="مێژووی گۆڕانکارییەکان لە داتابەیس بەردەست دەبێت پاش چالاککردنی مایگرەیشن.";
        container.append(p);$("product-history").hidden=false;
        return;
      }
      message("product-message",explain(result.error),"error");return;
    }
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
    if(store?.id!==data?.id)clearLabelState();
    store = data;
    if (!store) {show("store-panel");return;}
    show("products-panel");
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (editId && user.id === store.owner_user_id) {
      await beginEdit(editId);
      return;
    }
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
    if(editing&&$("base-unit").value!==editing.baseUnit){
      message("product-message","سەرەتا دوگمەی پاشەکەوتکردنی یەکە دابگرە، پاشان زانیارییەکانی تر پاشەکەوت بکە","error");return;
    }
    const btn=$("save-product");busy(btn,true);message("product-message","");
    try {
      // Product definitions, costs and pack barcodes belong exclusively here,
      // NEVER in cashier. The legacy RPC only supports one unit barcode and price.
      // Full details are sent atomically ONLY if the advanced server RPC is ready.
      let result=editing?
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
          throw new Error("دەستکاریکردنی کاڵا لە داتابەیس چالاک نییە؛ فایلی مایگرەیشن جێبەجێ بکە");
        if(!editing&&catalog.advanced&&["PGRST202","42883"].includes(result.error.code))
          throw new Error("تۆمارکردنی فرەبارکۆد و کارتۆن پێویستی بە جێبەجێکردنی فایلی SQLە لە ناو Supabase");
        throw result.error;
      }
      const wasEditing=!!editing;
      resetEditor();
      const msgText=wasEditing?"کاڵاکە نوێ کرایەوە":"کاڵاکە بە سەرکەوتوویی تۆمارکرا";
      message("product-message",msgText,"success");
      await loadProducts();
    }catch(error){message("product-message",explain(error),"error");}
    finally{busy(btn,false);}
  });
  $("save-base-unit").addEventListener("click",async()=>{
    if(!editing||!store||!db)return;
    const next=$("base-unit").value;
    if(next===editing.baseUnit){message("product-message","یەکەکە پێشتر دیاریکراوە","success");return;}
    if(!["unit","kg"].includes(next)){message("product-message","یەکە نادروستە","error");return;}
    const btn=$("save-base-unit");busy(btn,true);message("product-message","");
    try{
      const {error}=await db.rpc("retail_set_product_base_unit_v19",{
        p_store:store.id,p_product:editing.id,p_expected_version:editing.version,
        p_expected_stock:editing.stockQuantity,p_unit:next
      });
      if(error)throw error;
      const productId=editing.id;
      await beginEdit(productId);
      message("product-message","یەکە نوێکرایەوە، بڕی کۆگا نەگۆڕا","success");
      await loadProducts();
    }catch(error){message("product-message",explain(error),"error");}
    finally{busy(btn,false);}
  });
  $("product-form").querySelectorAll(`[name="sale_mode"]`).forEach(x=>x.addEventListener("change",syncSellingMode));
  $("product-form").addEventListener("input",updateMarginHints);
  if($("gen-unit-barcode")){
    $("gen-unit-barcode").addEventListener("click",()=>{
      const inp=$("product-form")?.elements?.namedItem("barcode");
      if(inp&&!inp.disabled){inp.value=generateUniqueStoreEan13("200");inp.focus();}
    });
  }
  if($("gen-carton-barcode")){
    $("gen-carton-barcode").addEventListener("click",()=>{
      const inp=$("product-form")?.elements?.namedItem("carton_barcode");
      if(inp&&!inp.disabled){inp.value=generateUniqueStoreEan13("201");inp.focus();}
    });
  }
  if($("preview-form-label")){
    $("preview-form-label").addEventListener("click",()=>{
      const f=new FormData($("product-form"));
      const mode=String(f.get("sale_mode")||"unit");
      const name=String(f.get("name")||"").trim()||"کاڵای نوێ";
      const isCarton=mode==="carton";
      const code=String(isCarton?f.get("carton_barcode"):f.get("barcode")||f.get("plu")||f.get("sku")||"000000").trim()||"000000";
      const priceVal=Number(isCarton?f.get("carton_price"):f.get("price"))||0;
      const unitLabel=isCarton?"کارتۆن":($("base-unit")?.value==="kg"?"کیلۆگرام":"دانە");
      openLabelPreview({code,name,priceMinor:priceVal,unitLabel});
    });
  }
  syncSellingMode();
  $("cancel-edit").addEventListener("click",resetEditor);
  $("history-product").addEventListener("click",()=>void showProductHistory());
  $("refresh").addEventListener("click",()=>void loadProducts());
  if($("list-stock-filter")){
    $("list-stock-filter").addEventListener("change",()=>{
      listOffset=0;
      void loadProducts();
    });
  }
  if($("export-list-csv")){
    $("export-list-csv").addEventListener("click",()=>{
      if(!products.length){message("list-message","هیچ کاڵایەک نییە بۆ هەناردەکردن","error");return;}
      exportCsvFile("catalog-products.csv",["ناوی کاڵا","بارکۆدەکان","کۆدی ناوخۆیی (SKU)","کۆدی تەرازوو (PLU)","یەکە","نرخی دانە (IQD)","نرخی کارتۆن (IQD)","بڕی کۆگا","دۆخ"],
        products.map(p=>[p.name,(p.barcodes||[]).join(" | "),p.sku||"",p.plu||"",p.base_unit||"unit",p.price_minor??0,p.carton_price_minor??"",p.stock_quantity??0,p.active?"چالاک":"ناچالاک"]));
    });
  }
  if($("import-btn")){
    $("import-btn").addEventListener("click",()=>{
      const p=$("import-panel");
      if(p){p.hidden=!p.hidden;if(!p.hidden)$("import-text")?.focus();}
    });
  }
  if($("import-cancel")){
    $("import-cancel").addEventListener("click",()=>{
      if($("import-panel"))$("import-panel").hidden=true;
      if($("import-status"))$("import-status").textContent="";
    });
  }
  if($("import-file")){
    $("import-file").addEventListener("change",e=>{
      const file=e.target.files?.[0];
      if(!file)return;
      const reader=new FileReader();
      reader.onload=evt=>{
        if($("import-text"))$("import-text").value=evt.target?.result||"";
      };
      reader.readAsText(file);
    });
  }
  if($("import-submit")){
    $("import-submit").addEventListener("click",async()=>{
      if(!db||!store||!user)return;
      const raw=$("import-text")?.value?.trim()||"";
      if(!raw){message("import-status","تکایە داتای CSV بنووسە یان فایلێک دیاری بکە","error");return;}
      let prepared;
      try{prepared=window.RetailCatalogImport.prepare(raw);}catch(error){message("import-status",error.message,"error");return;}
      const lines=prepared.items;
      const btn=$("import-submit");
      busy(btn,true);
      message("import-status",`دەستکرا بە هاوردەکردنی ${lines.length} کاڵا...`,"info");
      let successCount=0;
      let errorCount=0;
      for(const item of lines){
        const {name,barcode,price:priceMinor}=item;
        try{
          const {error}=await db.rpc("retail_create_product",{
            p_store_id:store.id,
            p_name:name,
            p_barcode:barcode,
            p_price_minor:priceMinor
          });
          if(error)errorCount++;
          else successCount++;
        }catch(err){
          errorCount++;
        }
      }
      busy(btn,false);
      message("import-status",`هاوردەکردن تەواو بوو: ${successCount} کاڵا تۆمارکران${errorCount>0?` (${errorCount} دانە هەڵە یان دووبارە بوون)`:""}`,successCount>0?"success":"error");
      if(successCount>0){
        listOffset=0;
        await loadProducts();
      }
    });
  }
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
  if($("prices-stock-filter")){
    $("prices-stock-filter").addEventListener("change",()=>{
      pricesOffset=0;
      void loadPrices();
    });
  }
  if($("export-prices-csv")){
    $("export-prices-csv").addEventListener("click",()=>{
      if(!priceItems.length){message("prices-message","هیچ کاڵایەک نییە بۆ هەناردەکردن","error");return;}
      exportCsvFile("catalog-prices.csv",["ناوی کاڵا","شێوازی فرۆشتن","نرخی دانە / کیلۆگرام (IQD)","نرخی کارتۆن (IQD)","دانە لە کارتۆن","بڕی کۆگا"],
        priceItems.map(p=>[p.name,p.sale_mode||"unit",p.price_minor??0,p.carton_price_minor??"",p.units_per_carton??"",p.stock_quantity??0]));
    });
  }
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
  if($("scale-helper-toggle")){
    $("scale-helper-toggle").addEventListener("click",()=>{
      const box=$("scale-helper-box");
      if(box)box.hidden=!box.hidden;
    });
  }
  if($("scale-helper-build")){
    $("scale-helper-build").addEventListener("click",()=>{
      const plu=$("scale-helper-plu")?.value||"00001";
      const grams=$("scale-helper-grams")?.value||"480";
      const ean=buildScaleEan13(plu,grams);
      if($("scale-helper-output"))$("scale-helper-output").textContent="EAN-13: "+ean;
      if($("barcode-inspect-input"))$("barcode-inspect-input").value=ean;
      void inspectExactBarcode(ean);
    });
  }
  if($("export-barcodes-csv")){
    $("export-barcodes-csv").addEventListener("click",()=>{
      if(!barcodeItems.length){message("barcodes-message","هیچ بارکۆدێک نییە بۆ هەناردەکردن","error");return;}
      exportCsvFile("catalog-barcodes.csv",["بارکۆد","کاڵا","یەکە","بڕی دانە","نرخی فرۆشتن (IQD)","جۆری بارکۆد"],
        barcodeItems.map(b=>[b.code,b.product_name||"",b.unit_type||"unit",b.units_per_scan||1,b.price_minor??0,b.is_primary===false?"فرەبارکۆد":"سەرەکی"]));
    });
  }
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
  if($("label-size")){
    $("label-size").addEventListener("change",()=>{
      $("label-card")?.classList.toggle("size-small",$("label-size").value==="38x25");
    });
  }
  if($("label-print-btn")){
    $("label-print-btn").addEventListener("click",async()=>{try{if(!currentLabel)return;const context=labelContext();const [fresh]=await window.RetailLabelTools.confirm(db,store.id,[{...currentLabel,copies:1}]);if(context!==labelContext())return;if(fresh.priceMinor!==currentLabel.priceMinor||fresh.name!==currentLabel.name){showLabel(fresh);throw new Error("نرخ یان ناو گۆڕدراوە؛ لیبڵە نوێکە بپشکنە و دووبارە چاپ بکە");}printLabels([$("label-card")],$("label-size").value);}catch(error){message("system-message",explain(error),"error");}});
  }
  if($("label-close-btn")){
    $("label-close-btn").addEventListener("click",()=>{
      if($("barcode-label-box"))$("barcode-label-box").hidden=true;
    });
  }
  document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
  document.addEventListener("keydown",e=>{
    if(e.key==="F1"){e.preventDefault();window.location.href="./operations.html?view=cash";}
    if(e.key==="F3"){e.preventDefault();window.location.href="./operations.html?view=stock";}
    if(e.key==="F2"){
      e.preventDefault();
      if(currentTab==="list")$("search")?.focus();
      else if(currentTab==="prices")$("prices-search")?.focus();
      else if(currentTab==="barcodes")$("barcode-inspect-input")?.focus();
      else $("product-form")?.querySelector('input[name="name"]')?.focus();
    }
  });
  $("logout").addEventListener("click",async()=>{
    if(db) await db.auth.signOut();
    user=null;store=null;products=[];show("auth-panel");message("auth-message","");
  });
  void initialize();
})();
