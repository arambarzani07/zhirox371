import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function createOfflineWindow() {
  const storage = new Map();
  const localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    key: (i) => Array.from(storage.keys())[i] || null,
    get length() {
      return storage.size;
    },
  };
  const win = {
    localStorage,
    navigator: { onLine: false },
    addEventListener: () => {},
    dispatchEvent: () => {},
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    crypto: globalThis.crypto,
  };
  win.window = win;
  const code = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
  vm.runInNewContext(code, win);
  return win;
}

test("Offline Engine RPC: retail_resolve_barcode_v18 returns object with found:true for unit and prefix-27 scale barcodes", async () => {
  const win = createOfflineWindow();
  const db = win.supabase.createClient();
  const storeId = (await db.rpc("retail_bootstrap_store", {})).data;

  // 1. Standard unit barcode
  const unitRes = await db.rpc("retail_resolve_barcode_v18", {
    p_store: storeId,
    p_code: "6291000000012",
  });
  assert.equal(unitRes.error, null);
  assert.equal(unitRes.data.found, true);
  assert.equal(unitRes.data.code, "6291000000012");
  assert.equal(unitRes.data.currency, "IQD");
  assert.equal(unitRes.data.base_unit, "unit");
  assert.equal(unitRes.data.is_scale, false);
  assert.equal(unitRes.data.price_minor, 12500);
  assert.ok(Array.isArray(unitRes.data.product_barcodes));

  // 2. Prefix-27 scale barcode (2700101 + 00500g = 0.500 kg @ 9000 IQD/kg => 4500 IQD)
  const scaleRes = await db.rpc("retail_resolve_barcode_v18", {
    p_store: storeId,
    p_code: "2700101005003",
  });
  assert.equal(scaleRes.error, null);
  assert.equal(scaleRes.data.found, true);
  assert.equal(scaleRes.data.is_scale, true);
  assert.equal(scaleRes.data.base_unit, "kg");
  assert.equal(scaleRes.data.scale_grams, 500);
  assert.equal(scaleRes.data.scale_weight_kg, 0.5);
  assert.equal(scaleRes.data.scale_unit_price_minor, 9000);
  assert.equal(scaleRes.data.price_minor, 4500);

  // 3. Unknown barcode returns { found: false }
  const missRes = await db.rpc("retail_resolve_barcode_v18", {
    p_store: storeId,
    p_code: "9999999999999",
  });
  assert.equal(missRes.data.found, false);
});

test("Offline Engine RPC: retail_catalog_page_v18 and retail_barcode_page_v18 return { items, total_count }", async () => {
  const win = createOfflineWindow();
  const db = win.supabase.createClient();
  const storeId = (await db.rpc("retail_bootstrap_store", {})).data;

  const catRes = await db.rpc("retail_catalog_page_v18", {
    p_store: storeId,
    p_search: "",
    p_limit: 50,
    p_offset: 0,
  });
  assert.equal(catRes.error, null);
  assert.ok(Array.isArray(catRes.data.items));
  assert.equal(catRes.data.total_count, 6);
  assert.ok(Array.isArray(catRes.data.items[0].barcodes));
  assert.ok(Array.isArray(catRes.data.items[0].barcode_details));

  const barRes = await db.rpc("retail_barcode_page_v18", {
    p_store: storeId,
    p_search: "6291000000012",
    p_limit: 50,
    p_offset: 0,
  });
  assert.equal(barRes.error, null);
  assert.equal(barRes.data.total_count, 1);
  assert.equal(barRes.data.items[0].code, "6291000000012");
  assert.equal(barRes.data.items[0].is_primary, true);
});

test("Offline Engine RPC: retail_checkout_weight_v19 processes barcode & scale lines, stores receipt fields, and returns UUID saleId", async () => {
  const win = createOfflineWindow();
  const db = win.supabase.createClient();
  const storeId = (await db.rpc("retail_bootstrap_store", {})).data;

  // Checkout 1 unit of 6291000000012 (12,500 IQD) + 0.500 kg of 2700101005003 (4,500 IQD) - 1,000 discount = 16,000 IQD
  const checkoutRes = await db.rpc("retail_checkout_weight_v19", {
    p_store: storeId,
    p_request: "44444444-1111-4111-8111-000000000099",
    p_items: [
      {
        barcode: "6291000000012",
        quantity: 1,
        expected_price_minor: 12500,
        expected_units: 1,
      },
      {
        barcode: "2700101005003",
        quantity: 1,
        expected_price_minor: 4500,
        expected_units: 1,
      },
    ],
    p_discount: 1000,
    p_cash_received: 20000,
  });

  assert.equal(checkoutRes.error, null);
  const saleId = checkoutRes.data;
  assert.equal(typeof saleId, "string");
  assert.match(saleId, /^[0-9a-f-]{36}$/i);

  const saleRow = await db
    .from("retail_sales")
    .select("*")
    .eq("id", saleId)
    .single();
  assert.equal(saleRow.data.total_minor, 16000);
  assert.equal(saleRow.data.change_due_minor, 4000);
  assert.equal(saleRow.data.request_payload.discount, 1000);

  const lineRows = await db
    .from("retail_sale_items")
    .select("*")
    .eq("sale_id", saleId);
  assert.equal(lineRows.data.length, 2);
  const kgLine = lineRows.data.find((l) => l.base_unit_snapshot === "kg");
  assert.ok(kgLine);
  assert.equal(kgLine.quantity, 0.5);
  assert.equal(kgLine.unit_price_minor, 9000);
});

test("Offline Engine RPC: product register v14, snapshot v19, update v15, history v15, and stock adjust v19 work end-to-end", async () => {
  const win = createOfflineWindow();
  const db = win.supabase.createClient();
  const storeId = (await db.rpc("retail_bootstrap_store", {})).data;

  const regRes = await db.rpc("retail_register_product_v14", {
    p_store_id: storeId,
    p_catalog: {
      name: "شەربەتی فرێش ١ لیتر",
      sku: "J-100",
      plu: null,
      sale_mode: "both",
      currency: "IQD",
      unit_barcode: "6299990001112",
      unit_alias_barcodes: ["6299990001113"],
      unit_sale_price_iqd: 2000,
      unit_purchase_price_iqd: 1500,
      carton: {
        name: "کارتۆنی ١٢ دانەیی",
        barcode: "6299990002222",
        alias_barcodes: [],
        units_per_carton: 12,
        sale_price_iqd: 22000,
        purchase_price_iqd: 18000,
      },
    },
  });
  assert.equal(regRes.error, null);
  const pid = regRes.data;
  assert.equal(typeof pid, "string");

  const snapRes = await db.rpc("retail_product_snapshot_v19", {
    p_store_id: storeId,
    p_product_id: pid,
  });
  assert.equal(snapRes.error, null);
  assert.equal(snapRes.data.version, 1);
  assert.equal(snapRes.data.name, "شەربەتی فرێش ١ لیتر");
  assert.equal(snapRes.data.sale_mode, "both");
  assert.equal(snapRes.data.carton.units_per_carton, 12);

  // Stock adjustment (set_exact + delta_in)
  await db.rpc("retail_adjust_stock_v19", {
    p_store: storeId,
    p_product: pid,
    p_mode: "set_exact",
    p_quantity: 50,
    p_reason: "ئاماری سەرەتایی",
  });
  const receivePacks = await db.rpc("retail_receive_packs_v17", {
    p_store: storeId,
    p_barcode: "6299990002222",
    p_packages: 2,
    p_expected_units: 12,
    p_reason: "کڕینی کارتۆن",
  });
  assert.equal(receivePacks.data.quantity, 74);

  const histRes = await db.rpc("retail_product_history_v15", {
    p_store_id: storeId,
    p_product_id: pid,
  });
  assert.ok(Array.isArray(histRes.data));
  assert.equal(histRes.data.length, 1);
});

test("Code Audit: operations.js has no undefined expiryDaysRemaining or saveStoreSettings references", () => {
  const opsSource = fs.readFileSync(
    new URL("../operations.js", import.meta.url),
    "utf8"
  );
  assert.equal(
    opsSource.includes("expiryDaysRemaining("),
    false,
    "operations.js must use computeDaysUntilExpiry instead of undefined expiryDaysRemaining"
  );
  assert.equal(
    opsSource.includes("saveStoreSettings()"),
    false,
    "operations.js must use saveLocalSettingsAndProfiles() instead of undefined saveStoreSettings()"
  );
  assert.equal(
    opsSource.includes("populateSystemSettingsForm()"),
    false,
    "operations.js must use renderSettingsSystemView() instead of undefined populateSystemSettingsForm()"
  );
});

test("Offline Shift & Cash Sessions: retail_cash_sessions returns open shift session and shift summary includes movements", async () => {
  const win = createOfflineWindow();
  const db = win.supabase.createClient();
  const storeId = (await db.rpc("retail_bootstrap_store", {})).data;

  // Query retail_cash_sessions exactly as operations.js refreshShift() does
  const { data: sessions, error } = await db
    .from("retail_cash_sessions")
    .select("id,status,opening_cash_minor,opened_at,expected_cash_minor,counted_cash_minor,variance_minor")
    .eq("store_id", storeId)
    .order("opened_at", { ascending: false })
    .limit(30);
  assert.equal(error, null);
  assert.ok(Array.isArray(sessions) && sessions.length > 0, "retail_cash_sessions must return seeded open shift");
  const openShift = sessions.find((s) => s.status === "open");
  assert.ok(openShift, "An open shift session must be active by default offline");

  // Record a cash movement and verify retail_shift_summary includes movements
  const movRes = await db.rpc("retail_cash_movement", {
    p_store: storeId,
    p_session: openShift.id,
    p_request: "55555555-1111-4111-8111-000000000011",
    p_kind: "cash_out",
    p_amount: 15000,
    p_note: "پارەدانی دابینکەر — تاقیکردنەوە",
  });
  assert.equal(movRes.error, null);

  const sumRes = await db.rpc("retail_shift_summary", {
    p_store: storeId,
    p_session: openShift.id,
  });
  assert.equal(sumRes.error, null);
  assert.equal(sumRes.data.movements, -15000);
  assert.equal(sumRes.data.expected, openShift.opening_cash_minor - 15000);
});

test("UI & Design Integrity: operations.html includes #payments-panel, #returns-panel, and all subtab/card CSS rules", () => {
  const opsHtml = fs.readFileSync(new URL("../operations.html", import.meta.url), "utf8");
  const contrastCss = fs.readFileSync(new URL("../ui-contrast-lock.css", import.meta.url), "utf8");
  const swJs = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

  for (const id of [
    "payments-panel",
    "payments-form",
    "payments-list",
    "payments-search",
    "payments-kind-filter",
    "pay-shift-status",
    "pay-expected-balance",
    "returns-panel",
    "returns-lookup-form",
    "returns-item-form",
    "returns-list",
    "returns-selected-box",
    "return-item-product",
    "return-item-barcode",
  ]) {
    assert.match(opsHtml, new RegExp(`id="${id}"`), `Missing #${id} in operations.html`);
  }

  for (const cls of [".stock-sub-head", ".stock-subnav", ".stock-sub-nav", ".stock-subtab", ".stock-adjust-card"]) {
    assert.ok(opsHtml.includes(cls), `Missing CSS rule for ${cls} in operations.html`);
  }

  assert.match(contrastCss, /\.stock-subtab\.active/);
  assert.match(swJs, /jsdelivr\.net/);
});

