import type { Product } from '../types';

export type LifecycleMode035='unit'|'carton'|'bundle'|'set'|'kg';
export type LifecycleStatus035='unverified';
export interface BarcodeLifecycleRow035 {
  barcode:string;
  productName:string;
  mode:LifecycleMode035;
  label:string;
  primary:boolean;
  status:LifecycleStatus035;
}
const modeLabels035:Record<LifecycleMode035,string>={
  unit:'دانە',carton:'کارتۆن',bundle:'دەستە',set:'سێت',kg:'کیلۆ'
};
/** The DEMO Product model stores barcodes but has no trusted active/retired
 * bit or lifecycle history. Do NOT treat registration as proof of activation.
 * These are catalog observations, not business authorizations.
 */
export const productBarcodeRows035=(p:Product|null):BarcodeLifecycleRow035[]=>{
  if(!p)return [];
  const rows:BarcodeLifecycleRow035[]=[];
  const append=(mode:LifecycleMode035,main:string,aliases:readonly string[])=>{
    const push=(code:string,primary:boolean)=>{
      if(!code.trim())return;
      rows.push({
        barcode:code,productName:p.name,mode,label:modeLabels035[mode],
        primary,status:'unverified'
      });
    };
    push(main,true);for(const alias of aliases)push(alias,false);
  };
  append(p.base_unit==='kg'?'kg':'unit',p.unit_barcode,p.unit_alias_barcodes||[]);
  if(p.carton)append('carton',p.carton.barcode,p.carton.alias_barcodes||[]);
  for(const pack of p.extra_packs||[])append(pack.kind,pack.barcode,pack.alias_barcodes||[]);
  return rows;
};
export const lifecycleSummary035=(p:Product|null)=>({
  status:p===null?'no_selection' as const:'unverified' as const,
  verifiedActiveCodes:null as number|null,
  registeredCodes:productBarcodeRows035(p).length,
  canDeactivate:false as const,
  canRestore:false as const,
  canSubmitRequest:false as const
});
