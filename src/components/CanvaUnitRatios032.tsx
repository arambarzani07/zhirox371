import React, { useMemo, useState } from 'react';
import type { Product } from '../types';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import {
  unitRatioRows032, inspectUnitRatios032, type RatioCheck032
} from '../utils/unitRatios032';

interface Props {
  products:Product[];
  onHome:()=>void;
  onCatalog:()=>void;
}
/** Original Canva screen 032, local-DEMO read-only conversion factors.
 * No role authorization or write path exists for factor editing here.
 */
export const CanvaUnitRatios032:React.FC<Props>=({products,onHome,onCatalog})=>{
 const [query,setQuery]=useState('');
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [inspection,setInspection]=useState<RatioCheck032|null>(null);
 const selected=products.find(p=>p.id===selectedId)||null;
 const suggestions=useMemo(()=>query.trim()&&query!==selected?.name
   ?products.filter(p=>matchesUnitPriceQuery027(p,query)).slice(0,8):[],
   [products,query,selected?.name]);
 const rows=unitRatioRows032(selected);
 const formatFactor=(n:number|null)=>n===null?'—':n.toLocaleString('en-US',{maximumFractionDigits:3});
 const carton=rows.find(r=>r.mode==='carton')?.baseQuantity??null;
 const pack=rows.filter(r=>r.mode==='bundle'||r.mode==='set').filter(r=>r.baseQuantity!==null);
 return (
   <section className="canva-unit-ratios-032" data-canva-screen="032" dir="rtl">
    <header className="canva-catalog-page-heading canva-ratio-heading">
      <h1>ڕێژەی گۆڕینی یەکەکان</h1>
      <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی ڕێژەی گۆڕین">
        <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
        <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
      </nav>
    </header>
    <div className="canva-ratio-layout">
      <main className="canva-ratio-main">
        <h2>گۆڕینی یەکەکان و ژمارەی دانە</h2>
        <label htmlFor="canva-032-search" className="canva-ratio-search">
          کاڵا
          <input id="canva-032-search" type="search"
            placeholder="کاڵا بە بارکۆد یان ناو هەڵبژێرە"
            value={query} autoComplete="off"
            onChange={e=>{setQuery(e.target.value);setInspection(null);}}/>
        </label>
        {suggestions.length>0&&(
          <div className="canva-ratio-suggestions" aria-label="کاڵاکانی دۆزراوە">
            {suggestions.map(p=>(
              <button key={p.id} type="button" className="secondary" onClick={()=>{
                setSelectedId(p.id);setQuery(p.name);setInspection(null);
              }}>{p.name} — {p.unit_barcode}</button>
            ))}
          </div>
        )}
        <p className="canva-ratio-intro">یەکەی سەرەکی بۆ کاڵای ژمێردراو: دانە؛ کیلۆ بە کێش هەژمار دەکرێت.</p>
        <div className="canva-ratio-table-wrap">
          <table className="canva-ratio-table">
            <thead><tr><th>جۆری فرۆشتن</th><th>یەکەی بنەڕەتی</th>
              <th>فاکتەری گۆڕین</th><th>ژمارەی بنەڕەتی</th><th>دۆخ</th></tr></thead>
            <tbody>{rows.map(row=>(
              <tr key={row.mode} data-unit-ratio-mode={row.mode}>
                <td>{row.name}</td><td>{row.baseUnit}</td>
                <td dir="ltr">{formatFactor(row.factor)}</td>
                <td dir="ltr">{formatFactor(row.baseQuantity)}</td>
                <td>{row.status}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="canva-ratio-rule">
          <span>ژمارەی دانە لە کارتۆندا بۆ هەر کاڵایەک سەربەخۆ دیاری دەکرێت.</span>
          <button type="button" className="secondary"
            onClick={()=>setInspection(inspectUnitRatios032(selected))}>پشکنینی ڕێژەکان</button>
        </div>
        <p className="canva-ratio-report" role="status">
          {inspection===null?'پشکنینی ڕێژەکان هێشتا ئەنجام نەدراوە'
          :inspection.issues.length?inspection.issues.join('، ')
          :'پشکنین تەواو بوو — '+inspection.verifiedCount+' جۆری یەکەی چالاک پشتڕاست کرایەوە'}
        </p>
      </main>
      <aside className="canva-ratio-aside" aria-label="پوختە و پشتڕاستکردنەوە">
        <h2>پوختە و پشتڕاستکردنەوە</h2>
        <dl>
          <div><dt>یەکەی بنەڕەتی</dt><dd>{selected?(selected.base_unit==='kg'?'کیلۆ':'دانە'):'—'}</dd></div>
          <div><dt>دانە لە کارتۆندا</dt><dd>{selected?formatFactor(carton):'—'}</dd></div>
          <div><dt>دانە لە دەستە یان سێتدا</dt>
            <dd>{pack.length?pack.map(r=>r.name+': '+formatFactor(r.baseQuantity)).join('، '):'—'}</dd></div>
        </dl>
        <button type="button" className="primary" disabled
          title="داواکاریی پاشەکەوتکردن پێویستی بە ناسنامە و مۆڵەتی سێرڤەر هەیە">
          داواکردنی پاشەکەوتکردن
        </button>
        <button type="button" className="secondary" onClick={onCatalog}>گەڕانەوە</button>
      </aside>
    </div>
   </section>
 );
};
