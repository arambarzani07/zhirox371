import type { Product } from '../types';

export type UnitPriceMode027 = 'unit' | 'carton' | 'bundle' | 'set' | 'kg';
export interface UnitPriceRow027 {
  mode: UnitPriceMode027;
  label: string;
  configured: boolean;
  units: number | null;
  buyIqd: number | null;
  sellIqd: number | null;
  barcode: string | null;
}
const modeLabels: Record<UnitPriceMode027, string> = {
  unit:'دانە', carton:'کارتۆن', bundle:'دەستە', set:'سێت', kg:'کیلۆ'
};

/** Returns exactly five original Canva 027 rows. Missing values remain null. */
export const unitPriceRows027 = (p: Product | null): UnitPriceRow027[] => {
  const modes: UnitPriceMode027[] = ['unit','carton','bundle','set','kg'];
  return modes.map(mode => {
    const empty: UnitPriceRow027 = {
      mode, label:modeLabels[mode], configured:false, units:null,
      buyIqd:null, sellIqd:null, barcode:null
    };
    if (!p) return empty;
    if ((mode==='unit' && p.base_unit==='unit') ||
        (mode==='kg' && p.base_unit==='kg')) {
      return {
        ...empty, configured:true, units:1, barcode:p.unit_barcode,
        buyIqd:p.unit_purchase_price_iqd && p.unit_purchase_price_iqd>0
          ? p.unit_purchase_price_iqd : null,
        sellIqd:p.unit_sale_price_iqd>0 ? p.unit_sale_price_iqd : null
      };
    }
    const pack=mode==='carton' ? p.carton
      : mode==='bundle'||mode==='set' ? p.extra_packs?.find(x=>x.kind===mode) : null;
    if (!pack) return empty;
    const quantity='units_per_carton' in pack ? pack.units_per_carton : pack.units_per_pack;
    return {
      ...empty, configured:true, units:quantity>0?quantity:null,
      barcode:pack.barcode,
      buyIqd:pack.purchase_price_iqd && pack.purchase_price_iqd>0?pack.purchase_price_iqd:null,
      sellIqd:pack.sale_price_iqd>0?pack.sale_price_iqd:null
    };
  });
};

/** Unit mode is selected by its *exact* registered barcode, not by assumptions. */
export const resolveUnitByBarcode027 = (
  p:Product, code:string
): UnitPriceMode027|null => {
  const clean=code.trim();
  if (!clean) return null;
  const base=p.base_unit==='kg'?'kg':'unit';
  if (p.unit_barcode===clean || p.unit_alias_barcodes.includes(clean)) return base;
  if (p.carton && (p.carton.barcode===clean || p.carton.alias_barcodes.includes(clean))) return 'carton';
  for (const pack of p.extra_packs||[]) {
    if (pack.barcode===clean || pack.alias_barcodes.includes(clean)) return pack.kind;
  }
  return null;
};

/** Product name and registered barcodes only; no implicit scale decoding. */
export const matchesUnitPriceQuery027=(p:Product,input:string):boolean=>{
  const q=input.trim().toLowerCase();
  if (!q) return false;
  return p.name.toLowerCase().includes(q)
    || p.unit_barcode.includes(q)
    || p.unit_alias_barcodes.some(x=>x.includes(q))
    || Boolean(p.carton && (p.carton.barcode.includes(q)
      || p.carton.alias_barcodes.some(x=>x.includes(q))))
    || Boolean(p.extra_packs?.some(x=>x.barcode.includes(q)
      || x.alias_barcodes.some(a=>a.includes(q))));
};
