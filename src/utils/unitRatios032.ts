import type { Product } from '../types';

/** Source-based Canva 032 conversion: never treat kg as a count of pieces. */
export type RatioMode032 = 'unit' | 'carton' | 'bundle' | 'set' | 'kg';
export type RatioStatus032 = 'چالاک' | 'دیاری نەکراوە' | 'پشکنین پێویستە' | 'سەربەخۆ';
export interface RatioRow032 {
  mode:RatioMode032;
  name:string;
  baseUnit:'دانە'|'کیلۆ';
  factor:number|null;
  baseQuantity:number|null;
  status:RatioStatus032;
}
const modeNames:Record<RatioMode032,string>={
 unit:'دانە',carton:'کارتۆن',bundle:'دەستە',set:'سێت',kg:'کیلۆ'
};
const getPackQuantity=(p:Product,mode:RatioMode032):number|null=>{
 if(mode==='carton') return p.carton ? p.carton.units_per_carton : null;
 if(mode==='bundle'||mode==='set')
   return p.extra_packs?.find(pack=>pack.kind===mode)?.units_per_pack??null;
 return null;
};
/** Validate configured factors only. Absent packs are not pending approval requests. */
export const validConversionFactor032=(p:Product,n:number):boolean=>
 Number.isFinite(n)&&n>0&&n<=1000000
 &&(p.base_unit==='kg'?Math.round(n*1000)===n*1000:Number.isSafeInteger(n));
export const unitRatioRows032=(p:Product|null):RatioRow032[]=>{
 const modes:RatioMode032[]=['unit','carton','bundle','set','kg'];
 return modes.map(mode=>{
  const baseUnit:'دانە'|'کیلۆ'=p?.base_unit==='kg'?'کیلۆ':'دانە';
  const blank:RatioRow032={mode,name:modeNames[mode],baseUnit:mode==='kg'?'کیلۆ':baseUnit,
   factor:null,baseQuantity:null,status:mode==='kg'?'سەربەخۆ':'دیاری نەکراوە'};
  if(!p)return blank;
  if((mode==='unit'&&p.base_unit==='unit')||(mode==='kg'&&p.base_unit==='kg'))
    return {...blank,factor:1,baseQuantity:1,status:'چالاک'};
  if(mode==='unit'||mode==='kg')return blank;
  const q=getPackQuantity(p,mode);
  if(q===null)return blank;
  if(!validConversionFactor032(p,q))
    return {...blank,status:'پشکنین پێویستە'};
  return {...blank,factor:q,baseQuantity:q,status:'چالاک'};
 });
};
export interface RatioCheck032 {checked:boolean;issues:string[];verifiedCount:number}
export const inspectUnitRatios032=(p:Product|null):RatioCheck032=>{
 if(!p)return {checked:false,issues:['سەرەتا کاڵا هەڵبژێرە'],verifiedCount:0};
 const rows=unitRatioRows032(p),issues:string[]=[];
 for(const row of rows){
  if(row.status==='پشکنین پێویستە')issues.push('فاکتەری گۆڕینی '+row.name+' نادروستە');
 }
 return {checked:true,issues,verifiedCount:rows.filter(x=>x.status==='چالاک').length};
};
