import React, { useMemo, useState } from 'react';
import type { AuditLogEntry, PriceChangeAudit025, Product } from '../types';
import { money } from '../utils/retailHelpers';

/**
 * Original Canva screen 025: read-only price change history.
 * Never synthesize historical prices or approvals; legacy audit entries
 * lacking structured price changes cannot supply old/new prices.
 * This view only displays changes actually recorded in the local DEMO.
 */
interface Props {
  auditLogs: AuditLogEntry[];
  products: Product[];
  preferredProductId?: string | null;
  onHome: () => void;
  onCatalog: () => void;
  onInspect: (product: Product) => void;
}

type PriceRow = AuditLogEntry & { priceChange: PriceChangeAudit025 };
const isPriceRow = (entry: AuditLogEntry): entry is PriceRow =>
  Boolean(entry.priceChange && entry.priceChange.status === 'recorded_demo');

const unitName = (unit: PriceChangeAudit025['unit']) =>
  ({ unit: 'دانە', kg: 'کیلۆ', carton: 'کارتۆن', bundle: 'دەستە', set: 'سێت' })[unit];

export const CanvaPriceHistory025: React.FC<Props> = ({
  auditLogs, products, preferredProductId, onHome, onCatalog, onInspect
}) => {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'sale' | 'purchase'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(preferredProductId ?? null);

  const entries = useMemo(() => auditLogs
    .filter(isPriceRow)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [auditLogs]);

  const matches = entries.filter(item => {
    const p = item.priceChange;
    const matchQuery = !query.trim() || p.productName.toLowerCase().includes(query.trim().toLowerCase())
      || p.barcode.includes(query.trim());
    return matchQuery && (kind === 'all' || p.priceType === kind);
  });

  const inspected = products.find(p => p.id === selectedId) || null;
  const summaryValues = { pending: '—', approved: '—', rejected: '—' };
  return (
    <section className="canva-price-history-025" data-canva-screen="025" dir="rtl" aria-label="مێژووی گۆڕانکاریی نرخەکان">
      <header className="canva-catalog-page-heading canva-history-heading">
        <h1>مێژووی گۆڕانکاریی نرخەکان</h1>
        <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی نرخەکان">
          <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
          <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
        </nav>
      </header>
      <div className="canva-history-layout">
        <main className="canva-history-primary">
          <h2>تۆماری گۆڕانکارییەکان</h2>
          <div className="canva-history-filters">
            <label>گەڕان
              <input type="search" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="ناوی کاڵا یان بارکۆد" aria-label="گەڕان بە ناوی کاڵا یان بارکۆد"/>
            </label>
            <label>جۆری گۆڕانکاری
              <select value={kind} onChange={e => setKind(e.target.value as typeof kind)}
                aria-label="جۆری گۆڕانکاری">
                <option value="all">هەموو گۆڕانکارییەکان</option>
                <option value="sale">نرخی فرۆشتن</option>
                <option value="purchase">نرخی کڕین</option>
              </select>
            </label>
          </div>
          <div className="canva-history-table-scroll">
            <table className="canva-history-table">
              <thead>
                <tr><th>کاڵا</th><th>کردار</th><th>بەروار</th>
                  <th>نرخی پێشوو</th><th>نرخی نوێ</th><th>دۆخ</th></tr>
              </thead>
              <tbody>
                {matches.map(item => (
                  <tr key={item.id}>
                    <td>
                      <button type="button" className="canva-history-pick"
                        onClick={() => setSelectedId(item.priceChange.productId)}
                        aria-pressed={selectedId === item.priceChange.productId}>
                        {item.priceChange.productName}
                      </button>
                    </td>
                    <td>{item.priceChange.priceType === 'sale' ? 'فرۆشتن' : 'کڕین'} — {unitName(item.priceChange.unit)}</td>
                    <td dir="ltr">{new Date(item.timestamp).toLocaleString('en-GB')}</td>
                    <td dir="ltr">{item.priceChange.previousIqd === null ? '—' : money(item.priceChange.previousIqd)}</td>
                    <td dir="ltr">{item.priceChange.nextIqd === null ? '—' : money(item.priceChange.nextIqd)}</td>
                    <td>تۆمارکراو (تاقیکردنەوە)</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matches.length === 0 && (
            <p className="canva-history-empty">هیچ گۆڕانکارییەک بۆ ئەم هەڵبژاردنە نییە</p>
          )}
        </main>
        <aside className="canva-history-aside" aria-label="پشکنین و ڕێگەپێدان">
          <h2>پشکنین و ڕێگەپێدان</h2>
          <dl>
            <div><dt>داواکاریی چاوەڕوان</dt><dd>{summaryValues.pending}</dd></div>
            <div><dt>گۆڕانکاریی پەسەندکراو</dt><dd>{summaryValues.approved}</dd></div>
            <div><dt>گۆڕانکاریی ڕەتکراوە</dt><dd>{summaryValues.rejected}</dd></div>
          </dl>
          <p>تۆماری گۆڕانکارییەکان لە داتای تاقیکردنەوەن؛ پەسەندی دەسەڵاتدار پشتڕاست نەکراوە.</p>
          <button type="button" className="secondary" disabled={!inspected}
            onClick={() => inspected && onInspect(inspected)}>
            پشکنینی وردەکاری
          </button>
        </aside>
      </div>
    </section>
  );
};
