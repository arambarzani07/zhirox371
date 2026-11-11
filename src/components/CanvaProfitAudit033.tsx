import React,{useMemo,useState} from 'react';
import type { Product } from '../types';
import { money } from '../utils/retailHelpers';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import {
  productProfitRows033,isTrustedProfit033,
  type ProfitMode033,type ProfitRow033
} from '../utils/profitAudit033';

interface Props {
  products:Product[];
  onHome:()=>void;
  onCatalog:()=>void;
  onPermissions:()=>void;
}
const statuses:Record<ProfitRow033['status'],string>={
  not_configured:'—',missing_cost:'تێچوو دیار نییە',invalid_price:'نرخی نادروست',
  profit:'قازانج',break_even:'یەکسان',loss:'زیان'
};
/** Canva 033: DEMO catalog's real per-unit buy and sale values only. No writes. */
export const CanvaProfitAudit033:React.FC<Props>=({
  products,onHome,onCatalog,onPermissions
})=>{
 const [query,setQuery]=useState('');
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [mode,setMode]=useState<ProfitMode033>('unit');
 const selected=products.find(p=>p.id===selectedId)||null;
 const matches=useMemo(()=>query.trim()&&query!==selected?.name
  ?products.filter(p=>matchesUnitPriceQuery027(p,query)).slice(0,8):[],
  [products,query,selected?.name]);
 const rows=productProfitRows033(selected);
 const current=rows.find(row=>row.mode===mode)!;
 const displayMoney=(n:number|null)=>n===null?'— IQD':money(n);
 const displayPercent=(n:number|null)=>n===null?'— %':n.toFixed(1)+' %';
 return (
  <section className="canva-profit-audit-033" data-canva-screen="033" dir="rtl">
   <header className="canva-catalog-page-heading canva-profit-heading">
     <h1>پشکنینی قازانج و نرخی کاڵا</h1>
     <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی قازانج">
       <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
       <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
     </nav>
   </header>
   <div className="canva-profit-layout">
     <main className="canva-profit-main">
       <h2>شیکاریی نرخی کڕین و فرۆشتن</h2>
       <label htmlFor="canva-033-search" className="canva-profit-search">
         کاڵای هەڵبژێردراو
         <input id="canva-033-search" type="search" autoComplete="off"
           placeholder="کاڵایەک هەڵبژێرە" value={query}
           onChange={e=>setQuery(e.target.value)}/>
       </label>
       {matches.length>0&&(
         <div className="canva-profit-suggestions" aria-label="کاڵاکانی دۆزراوە">
           {matches.map(p=><button key={p.id} type="button" className="secondary"
             onClick={()=>{
               setSelectedId(p.id);setMode(p.base_unit==='kg'?'kg':'unit');
               setQuery(p.name);
             }}>{p.name} — {p.unit_barcode}</button>)}
         </div>
       )}
       <div className="canva-profit-table-wrap">
         <table className="canva-profit-table">
          <thead><tr>
            <th>یەکە</th><th>نرخی کڕین</th><th>نرخی فرۆشتن</th>
            <th>قازانج IQD</th><th>ڕێژەی قازانج</th><th>دۆخ</th>
          </tr></thead>
          <tbody>{rows.map(row=>(
            <tr key={row.mode} data-profit-mode={row.mode}
              className={mode===row.mode&&selected?'canva-profit-selected':''}>
              <td><button type="button" className="canva-profit-unit-pick"
                aria-pressed={mode===row.mode&&Boolean(selected)}
                disabled={!selected||!row.configured}
                onClick={()=>setMode(row.mode)}>{row.label}</button></td>
              <td dir="ltr">{displayMoney(row.buyIqd)}</td>
              <td dir="ltr">{displayMoney(row.sellIqd)}</td>
              <td dir="ltr">{displayMoney(row.grossIqd)}</td>
              <td dir="ltr">{displayPercent(row.marginPercent)}</td>
              <td>{statuses[row.status]}</td>
            </tr>
          ))}</tbody>
         </table>
       </div>
       <p className="canva-profit-rule">
         قازانج = نرخی فرۆشتن − تێچوون؛ نرخی ناوەند بەپێی هەر یەکە هەژمار دەکرێت.
       </p>
       <p className="canva-profit-qualifier" role="status">
         {selected&&!isTrustedProfit033(current)
          ?'بۆ ئەم یەکەیە تێچوو و نرخی پشتڕاستکراوی تەواو بەردەست نییە'
          :'ڕێژەی قازانج = قازانجی خام ÷ نرخی فرۆشتن × 100؛ خەرجی گشتی و باج لەخۆ ناگرێت'}
       </p>
     </main>
     <aside className="canva-profit-aside" aria-label="ڕێنمایی و پەسەندکردن">
       <h2>ڕێنمایی و پەسەندکردن</h2>
       <dl>
         <div><dt>نرخی فرۆشتن</dt><dd dir="ltr">{displayMoney(current.sellIqd)}</dd></div>
         <div><dt>تێچوونی کاڵا</dt><dd dir="ltr">{displayMoney(current.buyIqd)}</dd></div>
         <div><dt>قازانجی چاوەڕوان</dt><dd dir="ltr">{displayMoney(current.grossIqd)}</dd></div>
       </dl>
       <button type="button" className="secondary" onClick={onPermissions}>
         داواکردنی گۆڕینی نرخ
       </button>
       <button type="button" className="secondary" onClick={onCatalog}>
         گەڕانەوە بۆ خشتە
       </button>
     </aside>
   </div>
  </section>
 );
};
