import React, { useState } from 'react';
import type { Product } from '../types';
import { inspectDuplicateBarcode026, type BarcodeScan026, type BarcodeSellingMode026 } from '../utils/barcodeAudit026';

interface Props {
  products: Product[];
  onHome: () => void;
  onCatalog: () => void;
  onBackToBarcodes: () => void;
}

const sellingUnit = (mode: BarcodeSellingMode026) =>
  ({ unit: 'دانە', kg: 'کیلۆ', carton: 'کارتۆن', bundle: 'دەستە', set: 'سێت' })[mode];

/** Original Canva screen 026. Read-only diagnosis in existing React DEMO. */
export const CanvaBarcodeAudit026: React.FC<Props> = ({
  products, onHome, onCatalog, onBackToBarcodes
}) => {
  const [barcode, setBarcode] = useState('');
  const [inspection, setInspection] = useState<BarcodeScan026 | null>(null);
  const check = () => setInspection(inspectDuplicateBarcode026(products, barcode));
  const reset = () => { setBarcode(''); setInspection(null); };

  const detail = inspection?.status === 'unique' ? 'یەک خاوەند'
    : inspection?.status === 'duplicate' ? 'بارکۆدی دووبارە'
    : inspection?.status === 'unused' ? 'لە کەتەلۆگی تاقیکردنەوە نەدۆزرایەوە'
    : inspection?.status === 'invalid' ? 'بارکۆدی نادروست'
    : '—';
  const productNames = [...new Set(inspection?.matches.map(x => x.productName) || [])];

  return (
    <section className="canva-duplicate-026" data-canva-screen="026" dir="rtl">
      <header className="canva-catalog-page-heading canva-duplicate-heading">
        <h1>پشکنینی بارکۆدی دووبارە</h1>
        <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی بارکۆد">
          <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
          <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
        </nav>
      </header>
      <div className="canva-duplicate-layout">
        <div className="canva-duplicate-main">
          <h2>دۆزینەوەی بارکۆدی دووبارە</h2>
          <form className="canva-duplicate-check-form" onSubmit={e => { e.preventDefault(); check(); }}>
            <label htmlFor="canva-duplicate-barcode-input">
              بارکۆدی پشکنراو
              <input
                id="canva-duplicate-barcode-input"
                type="text"
                dir="ltr"
                value={barcode}
                onChange={e => { setBarcode(e.target.value); setInspection(null); }}
                placeholder="بارکۆد بنووسە یان سکان بکە"
                autoComplete="off"
                maxLength={70}
              />
            </label>
            <button className="primary" type="submit" disabled={!barcode.trim()}>پشکنین</button>
          </form>
          <p className="canva-duplicate-rule">یەک بارکۆدی چالاک تەنها بۆ یەک کاڵا و یەک جۆری فرۆشتن</p>
          <div className="canva-duplicate-table-scroll">
            <table className="canva-duplicate-table">
              <thead><tr><th>بارکۆد</th><th>ناسنامە</th><th>ناوی کاڵا</th><th>یەکە</th><th>دۆخ</th></tr></thead>
              <tbody>
                {inspection?.matches.length ? inspection.matches.map((row, i) => (
                  <tr key={row.productId + '-' + row.mode + '-' + row.kind + '-' + i}>
                    <td dir="ltr">{row.code}</td>
                    <td dir="ltr">{row.productId}</td>
                    <td>{row.productName}</td>
                    <td>{sellingUnit(row.mode)}</td>
                    <td>{inspection.status === 'duplicate' ? 'دووبارە'
                      : row.kind === 'primary' ? 'سەرەکی' : 'هاوتا'}</td>
                  </tr>
                )) : Array.from({ length: 3 }, (_, i) => (
                  <tr key={i} aria-hidden="true">
                    <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="canva-duplicate-empty" role="status">
            {inspection === null ? 'هیچ ئەنجامێک پیشان نەدراوە — سەرەتا بارکۆد بپشکنە'
              : inspection.status === 'duplicate' ? 'بارکۆد بە زیاتر لە یەک پەیوەندی تۆمارکراوە'
              : inspection.status === 'unique' ? 'بارکۆدەکە تەنها یەک پەیوەندی هەیە'
              : inspection.status === 'invalid' ? 'بارکۆدەکە نادروستە'
              : inspection.status === 'unused' ? 'بارکۆد لە کەتەلۆگی تاقیکردنەوە نەدۆزرایەوە'
              : 'بارکۆد بنووسە یان سکان بکە'}
          </p>
        </div>
        <aside className="canva-duplicate-aside" aria-label="پشکنین و چارەسەر">
          <h2>پشکنین و چارەسەر</h2>
          <dl>
            <div><dt>ئەنجامی پشکنین</dt><dd>{detail}</dd></div>
            <div><dt>بارکۆدی چالاک</dt><dd>{inspection && inspection.status !== 'invalid' && inspection.status !== 'empty' ? inspection.matches.length : '—'}</dd></div>
            <div><dt>کاڵای پەیوەندیدار</dt><dd>{productNames.join('، ') || '—'}</dd></div>
          </dl>
          <p className="canva-duplicate-demogate">پشکنینی تەنها-خوێندنەوەی کەتەلۆگی ناوخۆیی تاقیکردنەوە؛ هیچ بارکۆدێک ناگۆڕێت.</p>
          <button type="button" className="secondary" onClick={onBackToBarcodes}>گەڕانەوە بۆ بارکۆدەکان</button>
          <button type="button" className="secondary" onClick={reset}>هەڵوەشاندنەوەی داواکاری</button>
        </aside>
      </div>
    </section>
  );
};
