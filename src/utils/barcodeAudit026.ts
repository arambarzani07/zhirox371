import type { Product } from '../types';

/** Exact-code scan of the active local DEMO catalog. This is read-only. */
export type BarcodeSellingMode026 = 'unit' | 'kg' | 'carton' | 'bundle' | 'set';
export type BarcodeKind026 = 'primary' | 'alias';
export type BarcodeAuditStatus026 = 'empty' | 'invalid' | 'unused' | 'unique' | 'duplicate';
export interface BarcodeOwner026 {
  code: string;
  productId: string;
  productName: string;
  mode: BarcodeSellingMode026;
  kind: BarcodeKind026;
}
export interface BarcodeScan026 {
  code: string;
  status: BarcodeAuditStatus026;
  matches: BarcodeOwner026[];
}
export const enumerateActiveBarcodes026 = (products: readonly Product[]): BarcodeOwner026[] => {
  const entries: BarcodeOwner026[] = [];
  for (const p of products) {
    const record = (code: string, mode: BarcodeSellingMode026, kind: BarcodeKind026) => {
      // Every assignment is counted. A code reused in two modes of one product
      // is a conflict too, not a valid one-owner result.
      if (code.trim()) entries.push({ code: code.trim(), productId: p.id, productName: p.name, mode, kind });
    };
    const baseMode = p.base_unit === 'kg' ? 'kg' : 'unit';
    record(p.unit_barcode, baseMode, 'primary');
    for (const code of p.unit_alias_barcodes || []) record(code, baseMode, 'alias');
    if (p.carton) {
      record(p.carton.barcode, 'carton', 'primary');
      for (const code of p.carton.alias_barcodes || []) record(code, 'carton', 'alias');
    }
    for (const pack of p.extra_packs || []) {
      record(pack.barcode, pack.kind, 'primary');
      for (const code of pack.alias_barcodes || []) record(code, pack.kind, 'alias');
    }
  }
  return entries;
};
/** A local exact-match result is never represented as an authoritative market-wide audit. */
export const inspectDuplicateBarcode026 = (
  products: readonly Product[], raw: string
): BarcodeScan026 => {
  const code = raw.trim();
  if (!code) return { code, status: 'empty', matches: [] };
  if (code.length > 60 || /[\s,،;]/u.test(code)) {
    return { code, status: 'invalid', matches: [] };
  }
  const matches = enumerateActiveBarcodes026(products).filter(entry => entry.code === code);
  return {
    code, matches,
    status: matches.length === 0 ? 'unused' : matches.length === 1 ? 'unique' : 'duplicate'
  };
};
