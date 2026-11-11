import { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Product } from '../types';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

const DAY = 86_400_000;
const warningDays = 30;

function daysUntilExpiry(date: string | null | undefined, today: number) {
  if (!date) return null;
  const time = Date.parse(date.slice(0, 10));
  return Number.isFinite(time) ? Math.round((time - today) / DAY) : null;
}

interface Props {
  mode: 'low' | 'expiry';
  onAdjust: (product: Product) => void;
}

export function CanvaStockWatch({ mode, onAdjust }: Props) {
  const { products, navigateTo, adjustStock, updateProduct } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [date, setDate] = useState('');
  const expiry = mode === 'expiry';
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates = products.map(product => {
    const days = daysUntilExpiry(product.expiry_date, today);
    const minimum = product.min_stock ?? 10;
    const status = expiry
      ? days === null ? '' : days <= 0 ? 'critical' : days <= warningDays ? 'warning' : 'normal'
      : product.stock <= 0 ? 'critical' : product.stock <= minimum ? 'warning' : '';
    return { product, days, minimum, status };
  }).filter(row => row.status);
  const rows = candidates.filter(row => (filter === 'all' || row.status === filter)
    && (!query.trim() || matchesUnitPriceQuery027(row.product, query)));
  rows.sort((a, b) => expiry ? a.days! - b.days! : a.product.stock - b.product.stock);
  const selected = rows.find(row => row.product.id === selectedId);
  const critical = candidates.filter(row => row.status === 'critical').length;
  const warning = candidates.filter(row => row.status === 'warning').length;
  const criticalLabel = expiry ? 'بەسەرچووە' : 'بەتاڵ';
  const warningLabel = expiry ? 'نزیک' : 'کەمبوو';
  const columns = expiry
    ? ['ناوی کاڵا', 'بارکۆد', 'بڕ', 'بەرواری بەسەرچوون', 'ماوە', 'دۆخ']
    : ['کاڵا', 'یەکە', 'کەمترین بڕ', 'بەردەست', 'پێویستی', 'دۆخ'];

  return (
    <CanvaStockFrame number={expiry ? '039' : '038'}
      title={expiry ? 'بەسەرچوون و بەرواری کاڵاکان' : 'ئاگاداریی کەمبوونەوەی کاڵا'}
      listTitle={expiry ? 'بەدواداچوونی بەرواری بەسەرچوون' : 'کاڵاکانی کەم و بەتاڵ'}
      summaryTitle={expiry ? 'وردەکاری و ئاگاداری' : 'پوختە و سنووری ئاگاداری'}
      onHome={() => navigateTo('home')}
      filters={<div className="stock-workflow-filters">
        <label>گەڕان
          <input type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="گەڕان بە ناوی کاڵا یان بارکۆد" />
        </label>
        <div className="stock-workflow-tabs" role="group" aria-label="دۆخی کاڵا">
          {[['all', 'هەموو'], ['warning', warningLabel], ['critical', criticalLabel]].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value}
              onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </div>}
      note={expiry
        ? 'بەرواری بەسەرچوون لەسەر تۆماری کاڵا پیشان دەدرێت.'
        : 'ئاگادارییەکان بەپێی بڕی بەردەست و کەمترین بڕی هەر کاڵا هەژمار دەکرێن.'}
      summary={<>
        <dl>
          <div><dt>{expiry ? 'نزیک لە بەسەرچوون' : 'کاڵای کەمبوو'}</dt><dd>{warning}</dd></div>
          <div><dt>{expiry ? 'بەسەرچوو' : 'کاڵای بەتاڵ'}</dt><dd>{critical}</dd></div>
          <div><dt>{expiry ? 'سنووری ئاگاداری' : 'کەمترین بڕی کاڵای هەڵبژێردراو'}</dt>
            <dd>{expiry ? `${warningDays} ڕۆژ` : selected?.minimum ?? '—'}</dd></div>
        </dl>
        {expiry && selected && editingExpiry && (
          <form className="stock-workflow-detail" onSubmit={event => {
            event.preventDefault();
            if (!date) return;
            updateProduct(selected.product.id, { expiry_date: date });
            setEditingExpiry(false);
          }}>
            <label>بەرواری بەسەرچوون<input type="date" value={date} required
              onChange={event => setDate(event.target.value)} /></label>
            <button type="submit">پاشەکەوت</button>
          </form>
        )}
      </>}
      actions={<>
        <button type="button" className="stock-036-primary" disabled={!selected}
          onClick={() => {
            if (!selected) return;
            if (expiry) {
              setDate(selected.product.expiry_date?.slice(0, 10) ?? '');
              setEditingExpiry(value => !value);
            } else {
              adjustStock(selected.product.id, 20, 'unit', 'پڕکردنەوەی خێرای کاڵای کەمبوو');
            }
          }}>{expiry ? 'بینینی وردەکاری' : 'پڕکردنەوە (+20)'}</button>
        <button type="button" onClick={() => navigateTo('stock', 'overview', 'stock-stack')}>گەڕانەوە بۆ کۆگا</button>
        {selected && <button type="button" className="stock-workflow-link"
          onClick={() => onAdjust(selected.product)}>ڕێکخستنی بڕ (+/−)</button>}
      </>}>
      <CanvaStockTable columns={columns}>
        {rows.map(({ product, days, minimum, status }) => (
          <tr key={product.id} className={selected?.product.id === product.id ? 'stock-workflow-selected' : undefined}>
            <td><button type="button" className="stock-036-product" aria-pressed={selected?.product.id === product.id}
              onClick={() => { setSelectedId(product.id); setEditingExpiry(false); }}>{product.name}</button></td>
            {expiry ? <>
              <td><bdi>{product.unit_barcode}</bdi></td><td><bdi>{product.stock}</bdi></td>
              <td><bdi>{product.expiry_date?.slice(0, 10)}</bdi></td><td><bdi>{Math.max(days ?? 0, 0)}</bdi></td>
            </> : <>
              <td>{product.base_unit === 'kg' ? 'کیلۆگرام' : 'دانە'}</td><td><bdi>{minimum}</bdi></td>
              <td><bdi>{product.stock}</bdi></td><td><bdi>{Math.max(minimum - product.stock, 0)}</bdi></td>
            </>}
            <td>{status === 'critical' ? criticalLabel : status === 'warning' ? warningLabel : 'بەردەست'}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={columns.length}>هیچ کاڵایەک نەدۆزرایەوە</td></tr>}
      </CanvaStockTable>
    </CanvaStockFrame>
  );
}
