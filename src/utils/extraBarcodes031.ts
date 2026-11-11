import type { Product } from '../types';
import type { BarcodeSellingMode026 } from './barcodeAudit026';

export type BarcodeUnit031 = BarcodeSellingMode026;
export interface BarcodeRecord031 { code:string; primary:boolean; mode:BarcodeUnit031; }
export type AliasResult031 =
 | {ok:true; code:string; updates:Partial<Product>}
 | {ok:false; error:string};

export const labels031:Record<BarcodeUnit031,string>={
  unit:'دانە',carton:'کارتۆن',bundle:'دەستە',set:'سێت',kg:'کیلۆ'
};

/** A selling mode is usable only when the DEMO catalog actually defines it. */
export const isConfigured031=(p:Product|null,mode:BarcodeUnit031):boolean=>{
  if(!p)return false;
  if(mode==='unit')return p.base_unit==='unit';
  if(mode==='kg')return p.base_unit==='kg';
  if(mode==='carton')return !!p.carton;
  return !!p.extra_packs?.some(pack=>pack.kind===mode);
};

export const listBarcodes031=(p:Product|null,mode:BarcodeUnit031):BarcodeRecord031[]=>{
  if(!isConfigured031(p,mode)||!p)return [];
  let main:string,aliases:string[];
  if(mode==='unit'||mode==='kg'){main=p.unit_barcode;aliases=p.unit_alias_barcodes||[];}
  else if(mode==='carton'){main=p.carton!.barcode;aliases=p.carton!.alias_barcodes||[];}
  else {
    const pack=p.extra_packs!.find(x=>x.kind===mode)!;
    main=pack.barcode;aliases=pack.alias_barcodes||[];
  }
  return [
    ...(main?[{code:main,primary:true,mode}]:[]),
    ...aliases.map(code=>({code,primary:false,mode}))
  ];
};

/** Pure validation: rejects duplicates across ALL products and ALL modes,
 * including a repeat on the same product, and never changes actual data.
 * The returned Partial<Product> is ONLY for the isolated browser DEMO.
 */
/** Same exact-code ownership policy as screen 026; self-contained to work in
 * the production TypeScript bundle and the zero-dependency Node native tests.
 */
export const codeTaken031=(products:readonly Product[],code:string):boolean=>
  products.some(p=>
    p.unit_barcode===code
    || p.unit_alias_barcodes.includes(code)
    || Boolean(p.carton&&(p.carton.barcode===code||p.carton.alias_barcodes.includes(code)))
    || Boolean(p.extra_packs?.some(pack=>
      pack.barcode===code||pack.alias_barcodes.includes(code)))
  );

export const prepareExtraAlias031=(
  products:readonly Product[],productId:string,mode:BarcodeUnit031,raw:string
):AliasResult031=>{
  const p=products.find(item=>item.id===productId);
  if(!p)return {ok:false,error:'کاڵای هەڵبژێردراو نەدۆزرایەوە'};
  if(!isConfigured031(p,mode))return {ok:false,error:'ئەم جۆرە یەکەیە بۆ کاڵاکە تۆمار نەکراوە'};
  const code=raw.trim();
  if(!code || code.length>60 || /[\\s,،;]/u.test(code))return {
    ok:false,error:'بارکۆدی دروست بنووسە، بەبێ بۆشایی و بە درێژی زۆرترین 60 نووسە'
  };
  if(codeTaken031(products,code))return {
    ok:false,error:'بارکۆدەکە پێشتر بە کاڵا یان یەکەیەکی تر پەیوەستە'
  };
  const aliases=listBarcodes031(p,mode).filter(x=>!x.primary);
  if(aliases.length>=30)return {ok:false,error:'سنووری 30 بارکۆدی زیادە بۆ ئەم یەکەیە پڕبووە'};
  if(mode==='unit'||mode==='kg')return {
    ok:true,code,updates:{unit_alias_barcodes:[...p.unit_alias_barcodes,code]}
  };
  if(mode==='carton' && p.carton)return {
    ok:true,code,updates:{carton:{...p.carton,alias_barcodes:[...p.carton.alias_barcodes,code]}}
  };
  if(mode==='bundle'||mode==='set')return {
    ok:true,code,updates:{extra_packs:p.extra_packs?.map(pack=>
      pack.kind===mode?{...pack,alias_barcodes:[...pack.alias_barcodes,code]}:pack)}
  };
  return {ok:false,error:'ئەم جۆرە یەکەیە بۆ کاڵاکە نەدۆزرایەوە'};
};
