import type { Product, TradePackage } from '../types';

/** Product-registration only. Barcodes are TEXT: leading zeros must never be cast to numbers. */
export const MAX_ALIAS_BARCODES = 30;
export const MAX_EXTRA_PACKAGES = 12;

export const parseAliases = (raw: string): string[] =>
  raw.split(/[\n,]+/).map(code => code.trim()).filter(Boolean);

const validPrice = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
const validCost = (value: number | null): boolean =>
  value === null || (Number.isSafeInteger(value) && value >= 0);
const validCode = (value: string): boolean =>
  value.length > 0 && value.length <= 64 && value === value.trim() &&
  !/[\u0000-\u001f\u007f]/.test(value);

/** Checks all scan codes across unit, primary carton and independently priced package cards. */
export const productCodes = (p: Product): string[] => [
  p.unit_barcode,
  ...p.unit_alias_barcodes,
  ...(p.carton ? [p.carton.barcode, ...p.carton.alias_barcodes] : []),
  ...(p.packages || []).flatMap(pkg => [pkg.barcode, ...pkg.alias_barcodes])
];

export function validateLockedProduct(
  next: Product,
  existing: Product[],
  editingId: string | null
): string | null {
  if (!next.name.trim()) return 'ناوی کاڵا پێویستە';
  if (!validCode(next.unit_barcode)) return 'بارکۆدی سەرەکی نادروستە';
  if (!validPrice(next.unit_sale_price_iqd) || !validCost(next.unit_purchase_price_iqd)) {
    return 'نرخی دانە نادروستە';
  }
  if (!Number.isFinite(next.stock) || next.stock < 0 ||
      (next.base_unit === 'unit' && !Number.isInteger(next.stock)) ||
      (next.base_unit === 'kg' && Math.abs(next.stock * 1000 - Math.round(next.stock * 1000)) > 1e-7)) {
    return 'کۆگای سەرەتایی نادروستە';
  }
  if (next.min_stock !== undefined && (!Number.isFinite(next.min_stock) || next.min_stock < 0))
    return 'کەمترین بڕی کۆگا نادروستە';
  if (next.unit_alias_barcodes.length > MAX_ALIAS_BARCODES)
    return 'زۆرترین ژمارەی بارکۆدی هاوتای دانە 30 ـە';
  const carton = next.carton;
  if (carton) {
    if (!validCode(carton.barcode) ||
        !Number.isSafeInteger(carton.units_per_carton) || carton.units_per_carton < 2 ||
        !validPrice(carton.sale_price_iqd) || !validCost(carton.purchase_price_iqd))
      return 'بارکۆد، بڕ و نرخی کارتۆن نادروستن';
    if (carton.alias_barcodes.length > MAX_ALIAS_BARCODES)
      return 'زۆرترین ژمارەی بارکۆدی هاوتای کارتۆن 30 ـە';
  }
  const packages: TradePackage[] = next.packages || [];
  if (packages.length > MAX_EXTRA_PACKAGES) return 'زۆرترین ژمارەی بەستەکان 12 ـە';
  const seenIds = new Set<string>();
  for (const pkg of packages) {
    if (!pkg.id || seenIds.has(pkg.id)) return 'ناسنامەی بەستە دووبارە بووەتەوە';
    seenIds.add(pkg.id);
    if (!['carton', 'pack', 'set'].includes(pkg.kind) ||
        !pkg.name.trim() || !validCode(pkg.barcode) ||
        !Number.isSafeInteger(pkg.units_per_package) || pkg.units_per_package < 2 ||
        !validPrice(pkg.sale_price_iqd) || !validCost(pkg.purchase_price_iqd)) {
      return 'زانیارییەکانی بەستە، دەستە یان سێت نادروستن';
    }
    if (pkg.alias_barcodes.length > MAX_ALIAS_BARCODES)
      return 'زۆرترین ژمارەی بارکۆدی هاوتای هەر بەستەیەک 30 ـە';
  }
  const mine = productCodes(next);
  if (mine.some(code => !validCode(code))) return 'بارکۆدێکی نادروست یان بەتاڵ هەیە';
  if (new Set(mine).size !== mine.length)
    return 'بارکۆدێک لە هەمان کاڵادا دووبارە کراوەتەوە';
  const usedElsewhere = new Set(
    existing.filter(p => p.id !== editingId).flatMap(productCodes)
  );
  if (mine.some(code => usedElsewhere.has(code)))
    return 'بارکۆدێک پێشتر بۆ کاڵایەکی تر تۆمارکراوە';
  return null;
}
