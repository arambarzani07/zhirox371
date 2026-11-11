import React,{useMemo,useState} from 'react';
import type { AuditLogEntry } from '../types';
import { money } from '../utils/retailHelpers';
import {
  canFinalizeReview030, reviewEntries030, type ReviewFilter030
} from '../utils/reviewApproval030';

interface Props {
  auditLogs:AuditLogEntry[];
  onHome:()=>void;
  onCatalog:()=>void;
}

/** Original Canva 030 review & approval UI. No server-side approval exists.
 * Only recorded DEMO changes can be shown; never claim a pending request.
 */
export const CanvaReviewApproval030:React.FC<Props>=({
  auditLogs,onHome,onCatalog
})=>{
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<ReviewFilter030>('all');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const entries=useMemo(()=>reviewEntries030(auditLogs,filter,query),[auditLogs,filter,query]);
  const selected=entries.find(x=>x.id===selectedId)||null;
  const isAuthorized=canFinalizeReview030();
  const price=(amount:number|null)=>amount===null?'— IQD':money(amount);
  return (
    <section className="canva-review-030" data-canva-screen="030" dir="rtl">
      <header className="canva-catalog-page-heading canva-review-heading">
        <h1>پێداچوونەوە و پەسەندکردنی گۆڕانکاری</h1>
        <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی پێداچوونەوە">
          <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
          <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
        </nav>
      </header>
      <div className="canva-review-layout">
        <main className="canva-review-main">
          <h2>پشکنینی گۆڕانکارییە چاوەڕوانەکان</h2>
          <div className="canva-review-filters">
            <label htmlFor="canva-030-search">گەڕان
              <input type="search" id="canva-030-search"
                placeholder="کاڵا، داواکاری یان بارکۆد"
                value={query} onChange={e=>{setQuery(e.target.value);setSelectedId(null);}}
                autoComplete="off"/>
            </label>
            <label htmlFor="canva-030-status">دۆخ
              <select id="canva-030-status" value={filter}
                onChange={e=>{setFilter(e.target.value as ReviewFilter030);setSelectedId(null);}}>
                <option value="all">هەموو دۆخەکان</option>
                <option value="pending">چاوەڕوان</option>
                <option value="recorded_demo">تۆماری تاقیکردنەوە</option>
              </select>
            </label>
          </div>
          <div className="canva-review-table-scroll">
            <table className="canva-review-table">
              <thead><tr>
                <th>کاڵا</th><th>جۆر</th><th>بەروار</th>
                <th>نرخی پێشوو</th><th>نرخی نوێ</th><th>دۆخ</th>
              </tr></thead>
              <tbody>
                {entries.length?entries.map(item=>(
                  <tr key={item.id} data-review-type="recorded_demo">
                    <td><button type="button" className="canva-review-select"
                      aria-pressed={selected?.id===item.id}
                      onClick={()=>setSelectedId(item.id)}>{item.priceChange.productName}</button></td>
                    <td>{item.priceChange.priceType==='sale'?'فرۆشتن':'کڕین'} — {item.priceChange.unit}</td>
                    <td dir="ltr">{new Date(item.timestamp).toLocaleString('en-GB')}</td>
                    <td dir="ltr">{price(item.priceChange.previousIqd)}</td>
                    <td dir="ltr">{price(item.priceChange.nextIqd)}</td>
                    <td>تۆمارکراو (تاقیکردنەوە)</td>
                  </tr>
                )):Array.from({length:4},(_,i)=><tr aria-hidden="true" key={i}>
                  <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <p className="canva-review-empty" role="status">
            {filter==='pending'
              ? 'هیچ داواکاریی چاوەڕوانێکی پشتڕاستکراو بەردەست نییە'
              : entries.length===0
                ? 'هیچ داواکارییەکی پشتڕاستکراو بەردەست نییە'
                : 'ئەم تۆمارانە گۆڕانکاریی Demo ـن، داواکاریی چاوەڕوان یان پەسەندکراو نین'}
          </p>
          <p className="canva-review-rule">
            پەسەندکردنی دووبارەی هەمان داواکاری ڕێگەی پێ نادرێت
          </p>
        </main>
        <aside className="canva-review-aside" aria-label="پشتڕاستکردنەوە و تۆمار">
          <h2>پشتڕاستکردنەوە و تۆمار</h2>
          <dl>
            <div><dt>داواکاریی هەڵبژێردراو</dt>
              <dd>{selected?'تۆماری Demo — '+selected.priceChange.productName:'—'}</dd></div>
            <div><dt>پێش / دوای گۆڕانکاری</dt>
              <dd>{selected?price(selected.priceChange.previousIqd)+' / '+price(selected.priceChange.nextIqd):'—'}</dd></div>
            <div><dt>دۆخی پەسەندکردن</dt>
              <dd>{selected?'پەسەند نەکراوە — تۆماری Demo':'هیچ داواکارییەکی پشتڕاستکراو نییە'}</dd></div>
          </dl>
          <p className="canva-review-no-auth">
            ناسنامەی بەڕێوەبەر، داواکاریی پشتڕاستکراو و سیستەمی پەسەندکردنی سێرڤەر هێشتا بەردەست نین.
          </p>
          <button type="button" className="primary" disabled={!isAuthorized}
            title="پەسەندکردنی ڕاستەقینە لە سێرڤەر نەبەستراوە">پەسەندکردن</button>
          <button type="button" className="secondary" disabled={!isAuthorized}
            title="ڕەتکردنەوەی ڕاستەقینە لە سێرڤەر نەبەستراوە">ڕەتکردنەوە</button>
        </aside>
      </div>
    </section>
  );
};
