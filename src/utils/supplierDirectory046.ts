import type { Supplier } from '../types';
/** Canva 046: no trustworthy active/retired status or signed actor in DEMO. */
export type SupplierFilter046='all'|'active'|'inactive';
export interface SupplierRow046 {supplier:Supplier;status:'unverified';debt:number|null}
export const trustedSupplierDebt046=(n:unknown):number|null=>
 typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:null;
export const supplierRows046=(source:readonly Supplier[],query:string,filter:SupplierFilter046):SupplierRow046[]=>{
 if(filter!=='all')return [];
 const term=query.trim().toLocaleLowerCase();
 return source.filter(s=>!term||[s.name,s.id,s.phone].some(v=>v.toLocaleLowerCase().includes(term)))
   .map(s=>({supplier:s,status:'unverified' as const,debt:trustedSupplierDebt046(s.balanceDebt)}));
};
/** Browser-side role claims do not grant authority to create/update suppliers. */
export const canWriteSupplier046=(_actor?:string):false=>false;
