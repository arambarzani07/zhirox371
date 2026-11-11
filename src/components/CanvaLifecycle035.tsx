import React,{useMemo,useState} from 'react';
import type { Product } from '../types';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import {productBarcodeRows035,lifecycleSummary035} from '../utils/lifecyclePreview035';

interface Props {
 products:Product[];
 onHome:()=>void;
 onCatalog:()=>void;
}
/** Canva source 035: product/barcode lifecycle read-only reference.
 * No verified role, barcode-retirement history, or authoritative active flag
 * exists in this local DEMO model. Always fail closed.
 */
export const CanvaLifecycle035:React.FC<Props>=({products,onHome,onCatalog})=>{
  const [search,setSearch]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [reason,setReason]=useState('');
  const selected=products.find(p=>p.id===selectedId)||null;
  const matches=useMemo(()=>search.trim()&&search!==selected?.name
    ?products.filter(p=>matchesUnitPriceQuery027(p,search)).slice(0,8):[],
    [products,search,selected?.name]);
  const rows=productBarcodeRows035(selected),summary=lifecycleSummary035(selected);
  return (
   <section className="canva-lifecycle-035" data-canva-screen="035" dir="rtl">
    <header className="canva-catalog-page-heading canva-lifecycle-heading">
      <h1>ناچالاککردن و گەڕاندنەوەی کاڵا</h1>
      <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی دۆخی کاڵا">
        <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
        <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
      </nav>
    </header>
    <div className="canva-lifecycle-layout">
      <main className="canva-lifecycle-main">
        <h2>بەڕێوەبردنی دۆخی کاڵا و بارکۆد</h2>
        <label htmlFor="canva-035-search" className="canva-lifecycle-search">
          کاڵای هەڵبژێردراو
          <input id="canva-035-search" type="search" autoComplete="off"
            value={search} placeholder="دۆزینەوەی کاڵا بە ناو یان بارکۆد"
            onChange={e=>setSearch(e.target.value)}/>
        </label>
        {matches.length>0&&(
          <div className="canva-lifecycle-suggestions" aria-label="کاڵاکانی دۆزراوە">
            {matches.map(p=><button type="button" className="secondary"
              key={p.id} onClick={()=>{
                setSelectedId(p.id);setSearch(p.name);setReason('');
              }}>{p.name} — {p.unit_barcode}</button>)}
          </div>
        )}
        <p className="canva-lifecycle-explanation">
          ناچالاککردن واتە وەستاندنی فرۆشتن؛ مێژووی پسووڵەکان ناسڕدرێتەوە.
        </p>
        <div className="canva-lifecycle-table-scroll">
          <table className="canva-lifecycle-table">
            <thead><tr>
              <th>ناوی کاڵا</th><th>بارکۆد</th><th>جۆری یەکە</th><th>دۆخ</th><th>کردار</th>
            </tr></thead>
            <tbody>
              {rows.length?rows.map((r,i)=>(
                <tr key={r.mode+'-'+r.barcode+'-'+i} data-lifecycle-status={r.status}>
                  <td>{r.productName}</td>
                  <td dir="ltr">{r.barcode}</td>
                  <td>{r.label}</td>
                  <td>پشتڕاست نەکراوە</td>
                  <td>—</td>
                </tr>
              )):Array.from({length:4},(_,i)=>(
                <tr aria-hidden="true" key={i}>
                  <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="canva-lifecycle-rule">
          بارکۆدی لابراو بە ناچالاکی دەپارێزرێت؛ هەڵوەشاندنەوە لە مێژوودا تۆمار دەکرێت.
        </p>
        <p className="canva-lifecycle-caution" role="status">
          لە داتای Demo دۆخی چالاکی و مێژووی ناچالاککردنی ڕاستەقینە بەردەست نییە؛ هیچ کردارێکی فرۆشتن نەگۆڕاوە.
        </p>
      </main>
      <aside className="canva-lifecycle-aside" aria-label="دۆخ و پشتڕاستکردنەوە">
        <h2>دۆخ و پشتڕاستکردنەوە</h2>
        <dl>
          <div><dt>دۆخی ئێستا</dt>
            <dd>{selected?'پشتڕاست نەکراوە':'—'}</dd>
          </div>
          <div><dt>بارکۆدی چالاک</dt>
            <dd>{summary.verifiedActiveCodes===null?'—':summary.verifiedActiveCodes}</dd>
          </div>
        </dl>
        <label className="canva-lifecycle-reason" htmlFor="canva-035-reason">
          هۆکار
          <textarea id="canva-035-reason" value={reason} rows={3}
            placeholder="هۆکاری ناچالاککردن"
            onChange={e=>setReason(e.target.value)}/>
        </label>
        <button type="button" className="primary" disabled={!summary.canSubmitRequest}
          title="ناردنی داواکاری پێویستی بە ناسنامە و مۆڵەتی پشتڕاستکراو هەیە">
          داواکردنی ناچالاککردن
        </button>
        <button type="button" className="secondary" disabled={!summary.canRestore}
          title="گەڕاندنەوەی کاڵا تەنها بە مۆڵەتی پشتڕاستکراوی سێرڤەر دەکرێت">
          گەڕاندنەوەی کاڵا
        </button>
      </aside>
    </div>
   </section>
  );
};
