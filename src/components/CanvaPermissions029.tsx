import React, { useState } from 'react';
import { authorizationStatus029, permissionPolicyRows029 } from '../utils/permissionPolicy029';

interface Props {
  onHome:()=>void;
  onCatalog:()=>void;
  onBulkPrice:()=>void;
  onDuplicateAudit:()=>void;
  onReview:()=>void;
}

/** Canva 029 is a role-policy reference only until server identity can be verified.
 * It cannot grant rights, send real requests, or modify the catalog.
 */
export const CanvaPermissions029:React.FC<Props>=({
  onHome,onCatalog,onBulkPrice,onDuplicateAudit,onReview
})=>{
  const [reason,setReason]=useState('');
  const permissions=authorizationStatus029();
  return (
    <section className="canva-permissions-029" data-canva-screen="029" dir="rtl">
      <header className="canva-catalog-page-heading canva-permission-heading">
        <h1>دەسەڵاتی کاشێر و بەڕێوەبەر</h1>
        <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی دەسەڵات">
          <button className="canva-catalog-home" type="button" onClick={onHome}>ماڵەوە</button>
          <button className="secondary" type="button" onClick={onCatalog}>کاڵا و نرخ</button>
        </nav>
      </header>
      <div className="canva-permission-layout">
        <main className="canva-permission-main">
          <h2>خشتەی دەسەڵاتی بەکارهێنەران</h2>
          <p className="canva-permission-intro">
            کاشێر زانیاریی کاڵا دەبینێت؛ گۆڕینی نرخ پێویستی بە ڕێگەپێدان هەیە
          </p>
          <div className="canva-permission-table-scroll">
            <table className="canva-permission-table">
              <thead><tr><th>کردار</th><th>کاشێر</th><th>بەڕێوەبەر</th></tr></thead>
              <tbody>
                {permissionPolicyRows029.map(row=>(
                  <tr key={row.id} data-policy-action={row.id}>
                    <td>
                      {row.target==='bulk-prices'
                        ? <button type="button" className="canva-permission-linked-action"
                            onClick={onBulkPrice}>{row.action}</button>
                        : row.target==='duplicates'
                        ? <button type="button" className="canva-permission-linked-action"
                            onClick={onDuplicateAudit}>{row.action}</button>
                        : row.action}
                    </td>
                    <td>{row.cashier}</td><td>{row.manager}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="canva-permission-rule">
            هەر داواکارییەک: کێ، کەی، چی گۆڕا و بۆچی — تۆمار دەکرێت
          </p>
          <p className="canva-permission-unverified">
            ئەمە نموونەی یاسای دەسەڵاتەکانە؛ بێ پشتڕاستکردنەوەی ناسنامە، هیچ مۆڵەتێک جێبەجێ نابێت.
          </p>
        </main>
        <aside className="canva-permission-aside" aria-label="داواکاری و پشتڕاستکردنەوە">
          <h2>داواکاری و پشتڕاستکردنەوە</h2>
          <dl>
            <div><dt>ڕۆڵی ئێستا</dt><dd>پشتڕاست نەکراوە</dd></div>
          </dl>
          <label htmlFor="canva-029-reason" className="canva-permission-reason">
            هۆکاری داواکاری
            <textarea id="canva-029-reason" rows={3} value={reason}
              onChange={e=>setReason(e.target.value)}
              placeholder="هۆکاری داواکاری بنووسە"/>
          </label>
          <dl>
            <div><dt>دۆخی داواکاری</dt><dd>نەنێردراوە</dd></div>
          </dl>
          <button type="button" className="primary" disabled={!permissions.canSubmitRequest}
            title="پەیوەندی ناسنامەی پشتڕاستکراو و ڕێگەپێدانی بەڕێوەبەر هێشتا نەبەستراوە">
            ناردنی داواکاری
          </button>
          <button type="button" className="secondary" onClick={onReview}>پێداچوونەوە و پەسەندکردنی گۆڕانکاری</button>
          <button type="button" className="secondary" onClick={onCatalog}>گەڕانەوە</button>
        </aside>
      </div>
    </section>
  );
};
