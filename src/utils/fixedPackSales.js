// Browser DEMO sale-unit rules. Never authorizes a PostgreSQL checkout.
// Fixed bundles/sets represent multiple units of ONE SKU, not mixed-SKU kits.
const PACK_MODES = new Set(['bundle', 'set']);
const validPrice = value => Number.isSafeInteger(value) && value > 0 && value <= 999999999;
export function validFixedPack(pack) {
  return Boolean(pack && PACK_MODES.has(pack.kind) &&
    typeof pack.barcode === 'string' && pack.barcode.length > 0 &&
    Array.isArray(pack.alias_barcodes) &&
    Number.isSafeInteger(pack.units_per_pack) &&
    pack.units_per_pack >= 2 && pack.units_per_pack <= 100000 &&
    validPrice(pack.sale_price_iqd));
}
export function saleUnitConfig(product, mode) {
  if (!product) return null;
  if (PACK_MODES.has(mode)) {
    if (product.base_unit !== 'unit' || product.sale_mode === 'carton') return null;
    const matches = (product.extra_packs || []).filter(pack => pack.kind === mode);
    if (matches.length !== 1 || !validFixedPack(matches[0])) return null;
    const pack = matches[0];
    return {name: pack.name, barcode: pack.barcode, aliases: pack.alias_barcodes,
      units: pack.units_per_pack, price: pack.sale_price_iqd};
  }
  if (mode === 'carton') {
    const carton = product.carton;
    if (!carton || !Number.isSafeInteger(carton.units_per_carton) ||
      carton.units_per_carton < 2 || !validPrice(carton.sale_price_iqd)) return null;
    return {name: carton.name || `کارتۆنی ${product.name}`, barcode: carton.barcode,
      aliases: carton.alias_barcodes || [], units: carton.units_per_carton, price: carton.sale_price_iqd};
  }
  if (mode === 'unit') {
    if (!validPrice(product.unit_sale_price_iqd)) return null;
    return {name: product.name, barcode: product.unit_barcode,
      aliases: product.unit_alias_barcodes || [], units: 1, price: product.unit_sale_price_iqd};
  }
  return null;
}
export function resolveFixedPackBarcode(products, code) {
  if (typeof code !== 'string' || !code.trim() || !Array.isArray(products)) return null;
  let found = null;
  for (const product of products) {
    for (const pack of product.extra_packs || []) {
      if (pack.barcode !== code && !pack.alias_barcodes?.includes(code)) continue;
      if (found) return {conflict: true}; // fail closed on duplicate persisted barcodes
      found = {product, pack, mode: pack.kind};
    }
  }
  if (found) {
    // Persisted browser data can be modified outside the catalog form. A pack
    // barcode must never also resolve to another product or sale unit.
    for (const product of products) {
      if (product.unit_barcode === code ||
          product.unit_alias_barcodes?.includes(code) ||
          product.carton?.barcode === code ||
          product.carton?.alias_barcodes?.includes(code)) return {conflict:true};
    }
  }
  return found;
}
// Snapshot preflight is for the browser DEMO ONLY, not an atomic server transaction.
export function validateDemoSaleCart(cart, products) {
  if (!Array.isArray(cart) || cart.length < 1 || cart.length > 100 ||
    !Array.isArray(products)) return {ok: false, reason: 'invalid_cart'};
  const used = new Map(), scaleLabels = new Set();
  let subtotal = 0;
  for (const line of cart) {
    if (!line || !Number.isSafeInteger(line.qty) || line.qty < 1 || line.qty > 1000 ||
      !validPrice(line.price) || typeof line.productId !== 'string') {
      return {ok: false, reason: 'invalid_line'};
    }
    const product = products.find(p => p.id === line.productId);
    if (!product || !Number.isFinite(product.stock) || product.stock < 0)
      return {ok: false, reason: 'product_missing'};
    if (line.isScale) {
      if (line.mode !== 'unit' || product.base_unit !== 'kg' || line.qty !== 1 ||
        !Number.isSafeInteger(line.scaleGrams) || line.scaleGrams < 1 ||
        line.units !== line.scaleGrams / 1000 ||
        line.price !== Math.round(product.unit_sale_price_iqd * line.scaleGrams / 1000) ||
        !/^(27|28)[0-9]{11}$/.test(line.barcode) || scaleLabels.has(line.barcode))
        return {ok: false, reason: 'scale_mismatch'};
      scaleLabels.add(line.barcode);
    } else {
      const definition = saleUnitConfig(product, line.mode);
      if (!definition || line.units !== definition.units || line.price !== definition.price ||
        line.name !== definition.name || !(
          line.barcode === definition.barcode || definition.aliases.includes(line.barcode) ||
          (line.mode === 'unit' &&
            (line.barcode === product.sku || line.barcode === product.plu ||
              product.name.toLowerCase().includes(String(line.barcode).toLowerCase())))
        )) return {ok: false, reason: 'stale_sale_unit'};
    }
    const needed = line.qty * line.units;
    if (!Number.isFinite(needed) || needed <= 0) return {ok: false, reason: 'invalid_quantity'};
    used.set(product.id, (used.get(product.id) || 0) + needed);
    const amount = line.price * line.qty;
    if (!Number.isSafeInteger(amount)) return {ok: false, reason: 'total_overflow'};
    subtotal += amount;
    if (!Number.isSafeInteger(subtotal)) return {ok: false, reason: 'total_overflow'};
  }
  for (const [id, quantity] of used) {
    const product = products.find(p => p.id === id);
    if (quantity > product.stock + 0.000001) return {ok: false, reason: 'insufficient_stock'};
  }
  return {ok: true, subtotal};
}
