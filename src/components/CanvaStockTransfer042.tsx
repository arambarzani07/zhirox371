import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

const columns = ['ناوی کاڵا', 'بارکۆد', 'یەکە', 'کۆی بەردەست', 'بڕی داواکراو', 'دۆخ'];
const format = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });
const normalizeLocation = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export function CanvaStockTransfer042() {
  const { products, navigateTo } = useApp();
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const product = products.find(item => item.id === selectedId);
  const matches = !product && query.trim()
    ? products.filter(item => matchesUnitPriceQuery027(item, query)).slice(0, 6)
    : [];
  const step = product?.base_unit === 'kg' ? 0.001 : 1;
  const amount = Number(quantity);
  const pattern = step === 1 ? /^\d+$/ : /^\d+(\.\d{1,3})?$/;
  const validAmount = pattern.test(quantity) && amount > 0 && Number.isSafeInteger(Math.round(amount * 1000));
  const origin = normalizeLocation(source);
  const target = normalizeLocation(destination);
  const sameLocation = Boolean(origin && origin === target);
  const overStock = Boolean(product && validAmount && amount > product.stock);
  const draftStatus = sameLocation ? 'سەرچاوە و مەبەست دەبێت جیاواز بن'
    : overStock ? 'بڕ لە کۆی بەردەست زیاترە'
    : !validAmount ? 'بڕ نادروستە'
    : product && origin && target ? 'ڕەشنووس ئامادەیە' : 'چاوەڕوان';

  return (
    <CanvaStockFrame number="042" title="گواستنەوەی کاڵا لەنێوان کۆگاکان"
      listTitle="داواکاریی گواستنەوەی کاڵا" summaryTitle="پوختە و پشکنین"
      onHome={() => navigateTo('home')}
      filters={<div className="stock-transfer-fields">
        <div className="stock-036-filters">
          <label>لە کۆگا
            <input value={source} maxLength={100} onChange={event => setSource(event.target.value)}
              placeholder="شوێنی سەرچاوە" />
          </label>
          <label>بۆ کۆگا
            <input value={destination} maxLength={100} onChange={event => setDestination(event.target.value)}
              placeholder="شوێنی مەبەست" aria-invalid={sameLocation} />
          </label>
        </div>
        <div className="stock-036-filters">
          <label>هەڵبژاردنی کاڵا
            <input type="search" value={query} placeholder="گەڕان بە بارکۆد یان ناوی کاڵا"
              onChange={event => { setQuery(event.target.value); setSelectedId(''); }} />
          </label>
          <label>بڕی گواستنەوە
            <input type="number" min={step} step={step} dir="ltr" value={quantity}
              onChange={event => setQuantity(event.target.value)} aria-invalid={!validAmount || overStock} />
          </label>
        </div>
        {matches.length > 0 && (
          <div className="stock-workflow-tabs" role="group" aria-label="کاڵاکانی دۆزراوە">
            {matches.map(item => (
              <button type="button" key={item.id} onClick={() => {
                setSelectedId(item.id);
                setQuery(item.name);
              }}>{item.name} — <bdi>{item.unit_barcode}</bdi></button>
            ))}
          </div>
        )}
      </div>}
      note="بڕی بەردەست کۆی گشتییە. بڕ بە پێی شوێن و ناردن بۆ پەسەندکردن هێشتا بەردەست نین."
      summary={<dl>
        <div><dt>کۆی بڕی بەردەست</dt><dd>{product ? format(product.stock) : '—'}</dd></div>
        <div><dt>ڕیزی گواستنەوە</dt><dd>{product ? 1 : 0}</dd></div>
        <div><dt>دۆخی داواکاری</dt><dd role="status">{draftStatus}</dd></div>
      </dl>}
      actions={<>
        <button type="button" className="stock-036-primary" disabled>ناردن بۆ پەسەندکردن</button>
        <button type="button" onClick={() => navigateTo('stock', 'overview', 'stock-stack')}>گەڕانەوە بۆ کۆگا</button>
      </>}>
      <CanvaStockTable columns={columns}>
        {product && (
          <tr>
            <td>{product.name}</td><td><bdi>{product.unit_barcode || '—'}</bdi></td>
            <td>{product.base_unit === 'kg' ? 'کیلۆگرام' : 'دانە'}</td>
            <td><bdi>{format(product.stock)}</bdi></td>
            <td><bdi>{validAmount ? format(amount) : '—'}</bdi></td><td>{draftStatus}</td>
          </tr>
        )}
        {Array.from({ length: product ? 2 : 3 }, (_, index) => (
          <tr key={index} aria-hidden="true">{columns.map(column => <td key={column}>—</td>)}</tr>
        ))}
      </CanvaStockTable>
    </CanvaStockFrame>
  );
}
