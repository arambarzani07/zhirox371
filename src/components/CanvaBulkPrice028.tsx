import React, { useMemo, useState } from 'react';
import type { Product } from '../types';
import { money } from '../utils/retailHelpers';
import { previewBulkPrices028, type BulkPriceRequest028, type BulkPricePreview028 } from '../utils/bulkPricePreview028';

interface Props {
  products:Product[];
  onHome:()=>void;
  onCatalog:()=>void;
}
const initialRequest=():BulkPriceRequest028=>({
  category:'', priceType:'unit', adjustmentType:'percent', adjustment:''
});
/** Official Canva 028 migration: preview only, no mutation until real role approval exists. */
export const CanvaBulkPrice028:React.FC<Props>=({products,onHome,onCatalog})=>{
  const [request,setRequest]=useState<BulkPriceRequest028>(initialRequest);
  const [preview,setPreview]=useState<BulkPricePreview028|null>(null);
  const categories=useMemo(()=>[...new Set(products.map(p=>p.category||'گشتی'))].sort(),[products]);
  const selectedCount=products.filter(p=>(p.category||'گشتی')===request.category).length;
  const patch=(updates:Partial<BulkPriceRequest028>)=>{
    setRequest(prev=>({...prev,...updates}));
    // Changing any rule invalidates its earlier calculation.
    setPreview(null);
  };
  const reset=()=>{setRequest(initialRequest());setPreview(null);};
  const showPreview=()=>setPreview(previewBulkPrices028(products,request));
  const rows=preview?.rows||[];
  return (
    <section className="canva-bulk-price-028" data-canva-screen="028" dir="rtl">
      <header className="canva-catalog-page-heading canva-bulk-price-heading">
        <h1>گۆڕینی نرخ بەکۆمەڵ</h1>
        <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی نرخ بەکۆمەڵ">
          <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
          <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
        </nav>
      </header>
      <div className="canva-bulk-price-layout">
        <main className="canva-bulk-price-main">
          <h2>پێشبینینی گۆڕینی نرخ بەکۆمەڵ</h2>
          <div className="canva-bulk-price-filters">
            <label htmlFor="canva-028-category">پۆلبەندی
              <select id="canva-028-category" value={request.category}
                onChange={e=>patch({category:e.target.value})}>
                <option value="">هەڵبژاردنی پۆلی کاڵاکان</option>
                {categories.map(category=><option value={category} key={category}>{category}</option>)}
              </select>
            </label>
            <label htmlFor="canva-028-change">جۆری گۆڕانکاری
              <input id="canva-028-change" type="number" inputMode="decimal"
                value={request.adjustment} step={request.adjustmentType==='percent'?'0.01':'1'}
                placeholder="ڕێژە یان بڕی گۆڕانکاری"
                onChange={e=>patch({adjustment:e.target.value})}/>
            </label>
          </div>
          <div className="canva-bulk-price-type-section">
            <h3>جۆری نرخ</h3>
            <div className="canva-bulk-price-type-picker" role="group" aria-label="جۆری نرخ">
              <button type="button" className={request.priceType==='unit'?'primary':'secondary'}
                aria-pressed={request.priceType==='unit'} onClick={()=>patch({priceType:'unit'})}>نرخی دانە</button>
              <button type="button" className={request.priceType==='carton'?'primary':'secondary'}
                aria-pressed={request.priceType==='carton'} onClick={()=>patch({priceType:'carton'})}>نرخی کارتۆن</button>
              <button type="button" className="secondary" disabled
                title="نرخی بەکۆمەڵ لەم کەتەلۆگی Demo ـەدا خانەی پشتڕاستکراوی نییە">نرخی بەکۆمەڵ</button>
            </div>
            <div className="canva-bulk-price-adjustment" role="group" aria-label="ڕێژە یان بڕ">
              <button type="button" className={request.adjustmentType==='percent'?'primary':'secondary'}
                aria-pressed={request.adjustmentType==='percent'}
                onClick={()=>patch({adjustmentType:'percent',adjustment:''})}>ڕێژە %</button>
              <button type="button" className={request.adjustmentType==='amount'?'primary':'secondary'}
                aria-pressed={request.adjustmentType==='amount'}
                onClick={()=>patch({adjustmentType:'amount',adjustment:''})}>بڕی دینار</button>
            </div>
          </div>
          <div className="canva-bulk-price-table-scroll">
            <table className="canva-bulk-price-table">
              <thead><tr><th>کاڵا</th><th>جۆری یەکە</th><th>نرخی پێشوو</th>
                <th>نرخی نوێ</th><th>دۆخ</th></tr></thead>
              <tbody>
                {rows.length?rows.map(row=>(
                  <tr key={row.id}>
                    <td>{row.productName}</td><td>{row.label}</td>
                    <td dir="ltr">{money(row.previousIqd)}</td>
                    <td dir="ltr">{money(row.proposedIqd)}</td>
                    <td>پێشبینین</td>
                  </tr>
                )):Array.from({length:3},(_,i)=><tr key={i} aria-hidden="true">
                  <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="canva-bulk-price-warning" role="status">
            {preview?.error||'پێش پەسەندکردن هیچ نرخێکی ڕاستەقینە ناگۆڕدرێت'}
          </p>
        </main>
        <aside className="canva-bulk-price-aside" aria-label="پوختەی گۆڕانکارییەکان">
          <h2>پوختەی گۆڕانکارییەکان</h2>
          <dl>
            <div><dt>کاڵای هەڵبژێردراو</dt><dd>{request.category?selectedCount:'—'}</dd></div>
            <div><dt>گۆڕانکاریی چاوەڕوان</dt><dd>{preview&&!preview.error?rows.length:'—'}</dd></div>
            <div><dt>هەڵە و دەرخستنەکان</dt><dd>{preview?
              (preview.error?preview.error:preview.skipped):'—'}</dd></div>
          </dl>
          <button type="button" className="primary" onClick={showPreview}
            disabled={!request.category||!request.adjustment.trim()}>پێشبینینی گۆڕانکاری</button>
          <button type="button" className="secondary" onClick={reset}>پاککردنەوەی پێشبینین</button>
          <button type="button" className="secondary" onClick={onCatalog}>هەڵوەشاندنەوە</button>
        </aside>
      </div>
    </section>
  );
};
