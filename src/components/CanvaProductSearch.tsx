import { useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';

const modes = [
  ['unit', 'دانە'], ['carton', 'کارتۆن'], ['bundle', 'دەستە'], ['set', 'سێت'], ['kg', 'کیلۆ'],
] as const;

export function CanvaProductSearch({ initialQuery, onBack, children }: {
  initialQuery: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const { products, addToCart } = useApp();
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<(typeof modes)[number][0]>('unit');
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState('');
  const term = query.trim().toLowerCase();
  const label = modes.find(([key]) => key === mode)?.[1];
  const matches = products.flatMap(product => {
    const pack = mode === 'carton' ? product.carton : product.extra_packs?.find(item => item.kind === mode);
    const isBase = mode === 'kg' ? product.base_unit === 'kg' :
      mode === 'unit' && product.base_unit === 'unit' && product.sale_mode !== 'carton';
    if (!isBase && (mode === 'unit' || mode === 'kg' || !pack)) return [];
    const barcode = isBase ? product.unit_barcode : pack?.barcode ?? '';
    const aliases = (isBase ? product.unit_alias_barcodes : pack?.alias_barcodes) ?? [];
    if (![product.name, barcode, ...aliases].some(value => value.toLowerCase().includes(term))) return [];
    return [{ product, barcode, price: isBase ? product.unit_sale_price_iqd : pack?.sale_price_iqd ?? 0 }];
  });
  const selected = matches.find(row => row.product.id === selectedId);
  const canAdd = mode === 'unit' || mode === 'carton';

  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="007">
      <CanvaWorkspaceHeader title="زیادکردنی کاڵا و سکانکردنی بارکۆد" actions={
        <button type="button" className="secondary" onClick={onBack}>گەڕانەوە بۆ کاشێر</button>
      } />
      {children}
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>گەڕان و هەڵبژاردنی کاڵا</h2>
          <div className="canva-detail__filters">
            <input type="search" aria-label="بارکۆد یان ناوی کاڵا" placeholder="بارکۆد یان ناوی کاڵا"
              value={query} onChange={event => { setQuery(event.target.value); setError(''); }} />
          </div>
          <div className="canva-detail__actions" role="group" aria-label="جۆری فرۆشتن">
            {modes.map(([key, title]) => <button key={key} type="button" className={mode === key ? 'primary' : 'secondary'}
              aria-pressed={mode === key} onClick={() => { setMode(key); setSelectedId(''); setError(''); }}>{title}</button>)}
          </div>
          <div className="section-workspace__table" tabIndex={0} role="region" aria-label="ئەنجامی گەڕان">
            <table>
              <thead><tr><th>ناوی کاڵا</th><th>بارکۆد</th><th>یەکە</th><th>نرخ</th><th>دۆخ</th></tr></thead>
              <tbody>
                {matches.map(row => <tr key={row.product.id} data-selected={row === selected}>
                  <td><button type="button" className="secondary" aria-pressed={row === selected}
                    onClick={() => { setSelectedId(row.product.id); setError(''); }}>{row.product.name}</button></td>
                  <td><bdi>{row.barcode || '—'}</bdi></td><td>{label}</td><td><bdi>{money(row.price)}</bdi></td>
                  <td>{row.product.stock > 0 ? 'بەردەستە' : 'تەواو بووە'}</td>
                </tr>)}
                {matches.length === 0 && <tr><td colSpan={5} className="section-workspace__empty">هیچ کاڵایەک نەدۆزرایەوە</td></tr>}
              </tbody>
            </table>
          </div>
          <span>ئەنجامی گەڕان: {matches.length}</span>
        </section>
        <aside className="canva-detail__panel">
          <h2>وردەکاریی کاڵای هەڵبژێردراو</h2>
          <dl className="canva-detail__summary">
            <div><dt>ناوی کاڵا</dt><dd>{selected?.product.name ?? '—'}</dd></div>
            <div><dt>بارکۆد</dt><dd><bdi>{selected?.barcode || '—'}</bdi></dd></div>
            <div><dt>یەکە</dt><dd>{selected ? label : '—'}</dd></div>
            <div><dt>نرخ</dt><dd><bdi>{money(selected?.price ?? 0)}</bdi></dd></div>
          </dl>
          <form className="ws-form-grid" onSubmit={event => {
            event.preventDefault();
            if (!selected || (mode !== 'unit' && mode !== 'carton')) return;
            const count = Number(quantity);
            if (!Number.isSafeInteger(count) || count < 1) return;
            const result = addToCart(selected.product, mode, count);
            if (result.success) onBack();
            else setError(result.message || 'کاڵا زیاد نەکرا');
          }}>
            <label className="form-col">بڕ<input type="number" min="1" step="1" required disabled={!canAdd}
              value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
            <button className="primary" type="submit" disabled={!selected || !canAdd}>زیادکردن بۆ سەبەتە</button>
          </form>
          {!canAdd && <p>{mode === 'kg' ? 'بارکۆدی تەرازوو لە شاشەی کاشێر بسکێنە.' : 'فرۆشتنی ئەم یەکەیە هێشتا بەردەست نییە.'}</p>}
          {error && <p role="alert">{error}</p>}
        </aside>
      </div>
    </section>
  );
}
