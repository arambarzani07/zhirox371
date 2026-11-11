import type { Product } from '../types';

/** Profit is unit-specific GROSS spread (sale - purchase), not net business profit.
 * Missing or nonpositive costs never become a fabricated zero-cost margin.
 */
export type ProfitMode033 = 'unit' | 'carton' | 'bundle' | 'set' | 'kg';
export type ProfitStatus033 = 'not_configured' | 'missing_cost' | 'invalid_price' | 'profit' | 'break_even' | 'loss';
export interface ProfitRow033 {
  mode:ProfitMode033;
  label:string;
  configured:boolean;
  buyIqd:number|null;
  sellIqd:number|null;
  grossIqd:number|null;
  marginPercent:number|null;
  status:ProfitStatus033;
}
const labels:Record<ProfitMode033,string>={
 unit:'دانە',carton:'کارتۆن',bundle:'دەستە',set:'سێت',kg:'کیلۆ'
};
const validSale=(x:unknown):x is number=>
 typeof x==='number'&&Number.isSafeInteger(x)&&x>0;
const knownCost=(x:unknown):x is number=>
 typeof x==='number'&&Number.isSafeInteger(x)&&x>0;

/** No cross-mode estimation, carton cost averaging, or implicit scale decoding. */
export const productProfitRows033=(product:Product|null):ProfitRow033[]=>{
 const modes:ProfitMode033[]=['unit','carton','bundle','set','kg'];
 return modes.map(mode=>{
  const empty:ProfitRow033={
   mode,label:labels[mode],configured:false,buyIqd:null,sellIqd:null,
   grossIqd:null,marginPercent:null,status:'not_configured'
  };
  if(!product)return empty;
  let purchase:unknown, sale:unknown;
  if((mode==='unit'&&product.base_unit==='unit')||(mode==='kg'&&product.base_unit==='kg')){
    purchase=product.unit_purchase_price_iqd;
    sale=product.unit_sale_price_iqd;
  } else if(mode==='carton'&&product.carton){
    purchase=product.carton.purchase_price_iqd;
    sale=product.carton.sale_price_iqd;
  } else if(mode==='bundle'||mode==='set'){
    const pack=product.extra_packs?.find(p=>p.kind===mode);
    if(!pack)return empty;
    purchase=pack.purchase_price_iqd;
    sale=pack.sale_price_iqd;
  } else return empty;
  // A configured selling mode can still contain inconsistent legacy values.
  const sellIqd=validSale(sale)?sale:null;
  const buyIqd=knownCost(purchase)?purchase:null;
  if(sellIqd===null)return {...empty,configured:true,buyIqd,status:'invalid_price'};
  if(buyIqd===null)return {...empty,configured:true,sellIqd,status:'missing_cost'};
  const grossIqd=sellIqd-buyIqd;
  // Explicit gross margin: gross spread ÷ selling price, not markup ÷ cost.
  const marginPercent=Math.round((grossIqd/sellIqd)*1000)/10;
  return {...empty,configured:true,sellIqd,buyIqd,grossIqd,marginPercent,
    status:grossIqd>0?'profit':grossIqd<0?'loss':'break_even'};
 });
};
export const isTrustedProfit033=(row:ProfitRow033):boolean=>
 row.grossIqd!==null&&row.marginPercent!==null&&
 (row.status==='profit'||row.status==='loss'||row.status==='break_even');
