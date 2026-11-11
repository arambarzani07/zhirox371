import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { countedQuantity, loadDraft } from '../utils/stockCountDraft';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

const columns = ['کاڵا', 'یەکە', 'بڕی سیستەم', 'ژمێردراو', 'جیاوازی', 'دۆخ'];
const format = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function CanvaStockReconcile043() {
  const { products, navigateTo } = useApp();
  const [lines] = useState(loadDraft);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const term = search.trim().toLowerCase();
  const rows = lines.map(line => {
    const product = products.find(p => p.id === line.id);
    const counted = countedQuantity(line);
    const difference = counted === null ? null : Math.round((counted - line.systemStock) * 1000) / 1000;
    const stale = !product || product.stock !== line.systemStock || product.base_unit !== line.unit;
    return { line, product, counted, difference, stale };
  }).filter(row => row.difference !== 0 || row.stale);
  const visible = rows.filter(({line, product}) => !term || line.name.toLowerCase().includes(term)
    || Boolean(product && matchesUnitPriceQuery027(product, term)));
  const totals = (['unit', 'kg'] as const).map(unit => {
    const valid = rows.filter(row => row.line.unit === unit && row.difference !== null && !row.stale);
    return { unit, count: valid.length, total: valid.reduce((sum, row) => sum + row.difference!, 0) };
  }).filter(group => group.count);
  return <CanvaStockFrame number="043" title="ڕاستکردنەوەی جیاوازیی کۆگا"
    listTitle="جیاوازیی بڕە ژمێردراوەکان" summaryTitle="پوختە و ڕێگەپێدان"
    onHome={() => navigateTo('home')}
    filters={<div className="stock-workflow-filters">
      <label>گەڕان لە جیاوازییەکان<input type="search" value={search}
        onChange={event => setSearch(event.target.value)} placeholder="بارکۆد یان ناوی کاڵا" /></label>
      <p className="stock-036-note">هیچ بڕێکی کۆگا پێش پەسەندکردنی بەڕێوەبەر ناگۆڕدرێت.</p>
    </div>}
    summary={<dl>
      <div><dt>جیاوازییە هەڵبژێردراوەکان</dt><dd>{rows.filter(row => row.difference !== null && !row.stale).length}</dd></div>
      <div><dt>کۆی جیاوازی</dt><dd>{totals.length ? totals.map(group => <div className="stock-reconcile-total" key={group.unit}>
        <bdi>{group.total > 0 ? '+' : ''}{format(group.total)}</bdi> {group.unit === 'kg' ? 'کیلۆگرام' : 'دانە'}
      </div>) : '0'}</dd></div>
      <div><dt>دۆخی داواکاری</dt><dd>{rows.some(row => row.stale || row.counted === null) ? 'پێویستی بە ژماردنەوەیە' : 'ڕەشنووس'}</dd></div>
    </dl>}
    actions={<><button type="button" className="stock-036-primary" disabled title="پەسەندکردنی بەڕێوەبەر هێشتا بەردەست نییە">داواکردنی پەسەندکردن</button>
      <button type="button" onClick={() => navigateTo('stock', 'count', 'stock-stack')}>گەڕانەوە بۆ ژماردن</button></>}
    note="پەسەندکردنی بەڕێوەبەر هێشتا بەردەست نییە.">
    <CanvaStockTable columns={columns}>
      {visible.map(({line, counted, difference, stale}) => <tr key={line.id}>
        <td>{line.name}</td><td>{line.unit === 'kg' ? 'کیلۆگرام' : 'دانە'}</td>
        <td><bdi>{format(line.systemStock)}</bdi></td><td><bdi>{counted === null ? '—' : format(counted)}</bdi></td>
        <td><bdi>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${format(difference)}`}</bdi></td>
        <td>{stale ? 'بڕی بنەڕەتی گۆڕاوە' : counted === null ? 'ژماردن ناتەواوە' : 'پێداچوونەوە'}</td>
      </tr>)}
      {!visible.length && <tr><td colSpan={6}>{term ? 'هیچ ئەنجامێک نەدۆزرایەوە' : 'هیچ جیاوازییەک نییە'}</td></tr>}
    </CanvaStockTable>
    <div className="stock-036-filters stock-reconcile-reason"><label>هۆکاری ڕاستکردنەوە
      <select value={reason} onChange={event => setReason(event.target.value)}>
        <option value="">هەڵبژاردنی هۆکار</option><option value="count">جیاوازیی ژماردن</option>
        <option value="damage">تەلەفبوون</option><option value="entry">هەڵەی تۆمارکردن</option>
      </select></label></div>
  </CanvaStockFrame>;
}
