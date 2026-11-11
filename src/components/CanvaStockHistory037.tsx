import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { StockMovement } from '../types';
import { formatDateTime } from '../utils/retailHelpers';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

const kinds: Record<StockMovement['type'], string> = {
  receive: 'وەرگرتن',
  sale: 'فرۆشتن',
  return: 'گەڕاندنەوە',
  adjust: 'ڕێکخستن',
  damage: 'تەلەفبوون',
};
const columns = ['ناوی کاڵا', 'ناسنامە', 'بەروار و کات', 'جۆر', 'بڕ', 'دۆخ'];
const format = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function CanvaStockHistory037() {
  const { products, stockMovements, navigateTo } = useApp();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [selected, setSelected] = useState<StockMovement | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matchingProducts = new Set(term
      ? products.filter(p => matchesUnitPriceQuery027(p, term)).map(p => p.id)
      : []);
    return stockMovements.filter(m => (kind === 'all' || m.type === kind) &&
      (!term || matchingProducts.has(m.productId) || m.productName.toLowerCase().includes(term)
        || m.id.toLowerCase().includes(term) || (m.reference ?? '').toLowerCase().includes(term)));
  }, [products, stockMovements, query, kind]);
  const movement = selected && rows.includes(selected) ? selected : null;
  const selectMovement = (row: StockMovement) => {
    setSelected(row);
    setShowDetails(false);
  };

  return (
    <CanvaStockFrame number="037" title="جووڵە و مێژووی کۆگا" listTitle="تۆماری هاتووچۆی کاڵاکان"
      summaryTitle="هەڵبژاردن و وردەکاری" onHome={() => navigateTo('home')}
      filters={
        <div className="stock-036-filters">
          <label>گەڕان لە جووڵەکان
            <input type="search" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ناوی کاڵا، بارکۆد یان ژمارەی مامەڵە" />
          </label>
          <label>جۆری جووڵە
            <select value={kind} onChange={e => setKind(e.target.value)}>
              <option value="all">هەموو جۆرەکان</option>
              {Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      }
      note="وەرگرتن، فرۆشتن، گەڕاندنەوە و ڕاستکردنەوە بە جیا تۆمار دەکرێن."
      summary={<>
        <dl>
          <div><dt>کاڵای هەڵبژێردراو</dt><dd>{movement?.productName ?? '—'}</dd></div>
          <div><dt>بڕی جووڵە</dt><dd>{movement ? format(movement.newStock - movement.previousStock) : '—'}</dd></div>
          <div><dt>بڕی دوای جووڵە</dt><dd>{movement ? format(movement.newStock) : '—'}</dd></div>
        </dl>
        {movement && showDetails && (
          <p className="stock-workflow-detail">
            <span>بڕی پێش جووڵە <bdi>{format(movement.previousStock)}</bdi></span>
            <span>{movement.reference || '—'}</span>
          </p>
        )}
      </>}
      actions={<>
        <button type="button" className="stock-036-primary" disabled={!movement}
          aria-expanded={showDetails && Boolean(movement)}
          onClick={() => setShowDetails(value => !value)}>وردەکاریی مامەڵە</button>
        <button type="button" onClick={() => navigateTo('stock', 'overview', 'stock-stack')}>گەڕانەوە بۆ کۆگا</button>
        <button type="button" className="stock-workflow-link"
          onClick={() => navigateTo('stock', 'transfer', 'stock-transfer')}>تۆمارکردنی گواستنەوە</button>
      </>}>
      <CanvaStockTable columns={columns}>
        {rows.map(m => (
          <tr key={m.id} className={movement === m ? 'stock-workflow-selected' : undefined}>
            <td><button type="button" className="stock-036-product" aria-pressed={movement === m}
              onClick={() => selectMovement(m)}>{m.productName}</button></td>
            <td><bdi>{m.id}</bdi></td>
            <td><bdi dir="ltr">{formatDateTime(m.createdAt)}</bdi></td>
            <td>{kinds[m.type]}</td>
            <td><bdi>{format(m.newStock - m.previousStock)}</bdi></td>
            <td>تۆمارکراو</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={columns.length}>هیچ جووڵەیەک نەدۆزرایەوە</td></tr>}
      </CanvaStockTable>
    </CanvaStockFrame>
  );
}
