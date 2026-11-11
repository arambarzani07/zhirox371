import { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Product } from '../types';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

import { loadDraft, countedQuantity, storageKey, type CountLine } from '../utils/stockCountDraft';

const columns = ['ناوی کاڵا', 'یەکە', 'بڕی سیستەم', 'بڕی ژمێردراو', 'جیاوازی', 'دۆخ'];
const format = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function CanvaStockCount040() {
  const { products, navigateTo } = useApp();
  const [lines, setLines] = useState(loadDraft);
  const [search, setSearch] = useState('');
  const [storageError, setStorageError] = useState(false);
  const term = search.trim().toLowerCase();
  const current = new Map(products.map(product => [product.id, product]));
  const rows = lines.map(line => {
    const counted = countedQuantity(line);
    const difference = counted === null ? null : Math.round((counted - line.systemStock) * 1000) / 1000;
    const product = current.get(line.id);
    const stale = !product || product.stock !== line.systemStock || product.base_unit !== line.unit;
    return { line, counted, difference, stale };
  });
  const listedIds = new Set(lines.map(line => line.id));
  const matches = term ? products.filter(p => !listedIds.has(p.id) && matchesUnitPriceQuery027(p, term)).slice(0, 6) : [];
  const countedRows = rows.filter(row => row.counted !== null).length;
  const differences = rows.filter(row => row.difference !== null && row.difference !== 0).length;

  function saveDraft(next: CountLine[]) {
    setLines(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  function addProduct(product: Product) {
    if (listedIds.has(product.id)) return;
    saveDraft([...lines, {
      id: product.id, name: product.name, unit: product.base_unit,
      systemStock: product.stock, counted: '',
    }]);
    setSearch('');
  }

  return (
    <CanvaStockFrame number="040" title="ژماردنی کۆگا و جیاوازیی بڕ" listTitle="ڕاپۆرتی ژماردنی کۆگا"
      summaryTitle="پشکنین و پەسەندکردن" onHome={() => navigateTo('home')}
      filters={<div className="stock-workflow-filters stock-count-filters">
        <label>گەڕان لە کاڵاکان
          <input type="search" value={search} placeholder="ناوی کاڵا یان بارکۆدی کاڵا"
            onChange={event => setSearch(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && matches.length === 1) addProduct(matches[0]);
            }} />
        </label>
        {matches.length > 0 && (
          <div className="stock-workflow-tabs" role="group" aria-label="کاڵاکانی دۆزراوە">
            {matches.map(product => (
              <button type="button" key={product.id} onClick={() => addProduct(product)}>
                {product.name} — <bdi>{product.unit_barcode}</bdi>
              </button>
            ))}
          </div>
        )}
        <p className="stock-036-note">بڕی سیستەم لە کاتی زیادکردنی کاڵا بۆ ژماردن هەڵدەگیرێت.</p>
      </div>}
      note={storageError ? 'پاشەکەوتکردنی ڕەشنووس لەم تابە سەرکەوتوو نەبوو.'
        : 'ڕەشنووس لەم تابە پاشەکەوت دەکرێت. پەسەندکردنی بەڕێوەبەر هێشتا بەردەست نییە.'}
      summary={<dl>
        <div><dt>ڕیزە ژمێردراوەکان</dt><dd>{countedRows}</dd></div>
        <div><dt>جیاوازییەکان</dt><dd>{differences}</dd></div>
        <div><dt>دۆخی ژماردن</dt><dd>{rows.some(row => row.stale) ? 'پێویستی بە ژماردنەوەیە' : 'ڕەشنووس'}</dd></div>
      </dl>}
      actions={<>
        <button type="button" className="stock-036-primary" onClick={() => navigateTo('stock', 'reconcile', 'stock-stack')}>پێداچوونەوەی جیاوازییەکان</button>
        <button type="button" onClick={() => navigateTo('stock', 'overview', 'stock-stack')}>گەڕانەوە بۆ کۆگا</button>
      </>}>
      <CanvaStockTable columns={columns}>
        {rows.map(({ line, counted, difference, stale }) => (
          <tr key={line.id}>
            <td>
              <span>{line.name}</span>
              <button type="button" className="stock-036-product stock-count-remove"
                aria-label={`لابردن لە ڕەشنووس: ${line.name}`}
                onClick={() => saveDraft(lines.filter(item => item.id !== line.id))}>×</button>
            </td>
            <td>{line.unit === 'kg' ? 'کیلۆگرام' : 'دانە'}</td>
            <td><bdi>{format(line.systemStock)}</bdi></td>
            <td>
              <input type="text" inputMode={line.unit === 'kg' ? 'decimal' : 'numeric'} dir="ltr"
                className="stock-count-input" value={line.counted} placeholder="—"
                aria-label={`بڕی ژمێردراو: ${line.name}`}
                aria-invalid={Boolean(line.counted) && counted === null}
                onChange={event => saveDraft(lines.map(item => item.id === line.id
                  ? { ...item, counted: event.target.value } : item))} />
            </td>
            <td><bdi>{difference === null ? '—' : `${difference > 0 ? '+' : ''}${format(difference)}`}</bdi></td>
            <td>{stale ? 'بڕی بنەڕەتی گۆڕاوە' : counted === null
              ? line.counted ? 'بڕ نادروستە' : 'چاوەڕوان'
              : difference === 0 ? 'هاوتا' : 'جیاواز'}</td>
          </tr>
        ))}
        {rows.length === 0 && Array.from({ length: 4 }, (_, index) => (
          <tr key={index} aria-hidden="true">{columns.map(column => <td key={column}>—</td>)}</tr>
        ))}
      </CanvaStockTable>
    </CanvaStockFrame>
  );
}
