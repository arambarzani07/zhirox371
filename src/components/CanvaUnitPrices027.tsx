import React, { useMemo, useState } from 'react';
import type { Product, AuditLogEntry } from '../types';
import { money } from '../utils/retailHelpers';
import { matchesUnitPriceQuery027, resolveUnitByBarcode027, unitPriceRows027 } from '../utils/unitPrices027';

interface Props {
  products: Product[];
  auditLogs: AuditLogEntry[];
  initialProductId?:string|null;
  onHome:()=>void;
  onCatalog:()=>void;
}

/** Canva original 027: read-only per-unit price table, from actual local DEMO catalog. */
export const CanvaUnitPrices027:React.FC<Props>=({
  products,auditLogs,initialProductId,onHome,onCatalog
})=>{
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(initialProductId||null);
  const selected=products.find(x=>x.id===selectedId)||null;
  const matches=useMemo(()=>query.trim()
    ? products.filter(x=>matchesUnitPriceQuery027(x,query)).slice(0,8):[],
    [products,query]);
  const rows=unitPriceRows027(selected);
  const selectedUnit=selected ? resolveUnitByBarcode027(selected,query):null;
  const lastChange=selected
    ? auditLogs.filter(x=>x.priceChange?.productId===selected.id)
      .sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0]?.timestamp
    :null;
  const displayedDate=lastChange ? new Date(lastChange).toLocaleString('en-GB'):'—';
  return (
    <section className="canva-unit-prices-027" data-canva-screen="027" dir="rtl">
      <header className="canva-catalog-page-heading canva-unit-price-heading">
        <h1>نرخەکانی هەر جۆری یەکە</h1>
        <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی نرخەکانی یەکە">
          <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
          <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
        </nav>
      </header>
      <div className="canva-unit-price-layout">
        <div className="canva-unit-price-main">
          <h2>خشتەی نرخەکانی یەکەکان</h2>
          <label htmlFor="canva-027-product-search" className="canva-unit-price-search">
            کاڵای هەڵبژێردراو
            <input id="canva-027-product-search" type="search" dir="rtl"
              placeholder="کاڵا بە ناو یان بارکۆد هەڵبژێرە"
              value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off"/>
          </label>
          {query.trim() && query!==selected?.name && matches.length>0 && (
            <div className="canva-unit-price-suggestions" role="group" aria-label="کاڵاکانی دۆزراوە">
              {matches.map(p=><button key={p.id} type="button" className="secondary"
                onClick={() => {setSelectedId(p.id);setQuery(p.name);}}>
                {p.name} — {p.unit_barcode}
              </button>)}
            </div>
          )}
          <div className="canva-unit-price-table-wrap">
            <table className="canva-unit-price-table">
              <thead><tr><th>دۆخ</th><th>جۆری یەکە</th><th>ژمارەی دانە</th>
                <th>نرخی فرۆشتن</th><th>نرخی کڕین</th></tr></thead>
              <tbody>
                {rows.map(row=><tr key={row.mode}
                  className={selectedUnit===row.mode?'canva-unit-price-scanned':''}
                  data-unit-price-mode={row.mode}>
                  <td>{!selected||!row.configured?'—':'چالاک'}</td>
                  <td>{row.label}</td>
                  <td dir="ltr">{row.units??'—'}</td>
                  <td dir="ltr">{row.sellIqd===null?'— IQD':money(row.sellIqd)}</td>
                  <td dir="ltr">{row.buyIqd===null?'— IQD':money(row.buyIqd)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="canva-unit-price-rule">
            بارکۆدی هەر یەکە نرخ و جۆری فرۆشتنی خۆی هەڵدەبژێرێت
          </p>
        </div>
        <aside className="canva-unit-price-aside" aria-label="پوختە و گۆڕینی نرخ">
          <h2>پوختە و گۆڕینی نرخ</h2>
          <dl>
            <div><dt>یەکەی سەرەکی</dt><dd>
              {selected?(selected.base_unit==='kg'?'کیلۆ':'دانە'):'—'}
            </dd></div>
            <div><dt>دانە لە کارتۆندا</dt><dd>
              {selected?.carton?.units_per_carton??'—'}
            </dd></div>
            <div><dt>بەرواری دوا گۆڕانکاری</dt><dd dir="ltr">{displayedDate}</dd></div>
          </dl>
          <button type="button" className="secondary" disabled
            title="داواکاریی گۆڕینی نرخ و پەسەندی بەڕێوەبەر هێشتا لە ئەم DEMO ـەدا بەردەست نییە">
            داواکردنی گۆڕینی نرخ
          </button>
          <button type="button" className="secondary" onClick={onCatalog}>
            گەڕانەوە بۆ کاڵاکان
          </button>
        </aside>
      </div>
    </section>
  );
};
