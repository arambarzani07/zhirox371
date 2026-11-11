import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

const columns = ['ناوی کاڵا', 'بارکۆد', 'ژمارەی لۆت', 'بەسەرچوون', 'بڕی ماوە', 'دۆخ'];

// Product expiry is available in this demo. Never infer a lot or its balance
// from aggregate product stock. The isolated server's lot ledger is separate.
export function CanvaStockLots044() {
  const { products, navigateTo } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const rows = products.flatMap(product => {
    const date = product.expiry_date?.slice(0, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const time = Date.parse(date);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) return [];
    const days = Math.round((time - today) / 86400000);
    const status = days <= 0 ? 'expired' : days <= 30 ? 'near' : 'normal';
    return [{ product, date, status }];
  }).filter(row => (filter === 'all' || row.status === filter)
    && (!query.trim() || matchesUnitPriceQuery027(row.product, query)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.product.name.localeCompare(b.product.name));
  const selected = rows.find(row => row.product.id === selectedId);
  return <CanvaStockFrame number="044" title="مێژووی بەسەرچوون و لۆتەکان"
    listTitle="بەدواداچوونی لۆت و بەسەرچوون" summaryTitle="پوختەی لۆتی هەڵبژێردراو"
    onHome={() => navigateTo('home')}
    filters={<div className="stock-workflow-filters">
      <label>گەڕان<input type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="ناوی کاڵا یان بارکۆد" /></label>
      <div className="stock-workflow-tabs" role="group" aria-label="پاڵاوتنی بەسەرچوون">
        {[['all', 'هەموو'], ['near', 'نزیکە'], ['expired', 'بەسەرچووە']].map(([value, label]) =>
          <button type="button" key={value} aria-pressed={filter === value}
            onClick={() => setFilter(value)}>{label}</button>)}
      </div>
    </div>}
    summary={<dl>
      <div><dt>ژمارەی لۆت</dt><dd>—</dd></div>
      <div><dt>بڕی ماوەی لۆت</dt><dd>—</dd></div>
      <div><dt>بەرواری بەسەرچوونی کاڵا</dt><dd><bdi>{selected?.date ?? '—'}</bdi></dd></div>
    </dl>}
    actions={<><button type="button" className="stock-036-primary" disabled
      title="داتای جووڵەی لۆت هێشتا نەبەستراوەتەوە">بینینی جووڵەی لۆت</button>
      <button type="button" onClick={() => navigateTo('stock', 'expiry', 'expiry')}>گەڕانەوە بۆ بەسەرچوون</button></>}
    note="بەروارەکان هی تۆماری کاڵان. ژمارە، بڕ و جووڵەی لۆت هێشتا نەبەستراونەتەوە.">
    <CanvaStockTable columns={columns}>
      {rows.map(({product, date, status}) => <tr key={product.id}
        className={selected?.product.id === product.id ? 'stock-workflow-selected' : undefined}>
        <td><button type="button" className="stock-036-product"
          aria-pressed={selected?.product.id === product.id} onClick={() => setSelectedId(product.id)}>{product.name}</button></td>
        <td><bdi>{product.unit_barcode || '—'}</bdi></td><td>—</td><td><bdi>{date}</bdi></td><td>—</td>
        <td>{status === 'expired' ? 'بەسەرچووە' : status === 'near' ? 'نزیکە' : 'بەردەست'}</td>
      </tr>)}
      {!rows.length && <tr><td colSpan={6}>هیچ بەروارێکی بەسەرچوون نەدۆزرایەوە</td></tr>}
    </CanvaStockTable>
  </CanvaStockFrame>;
}
