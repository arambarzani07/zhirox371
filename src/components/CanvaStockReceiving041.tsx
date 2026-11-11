import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

const columns = ['ناوی کاڵا', 'بارکۆد', 'یەکە', 'بڕ', 'بەرواری بەسەرچوون'];

export function CanvaStockReceiving041() {
  const { products, suppliers, receiveStock, navigateTo } = useApp();
  const [productId, setProductId] = useState('');
  const [query, setQuery] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [mode, setMode] = useState<'unit' | 'carton'>('unit');
  const [received, setReceived] = useState(false);
  const product = products.find(p => p.id === productId);
  const matches = query.trim() && !product
    ? products.filter(p => matchesUnitPriceQuery027(p, query)).slice(0, 8)
    : [];
  const isWeight = product?.base_unit === 'kg';
  const displayMode = mode === 'carton' ? 'کارتۆن' : isWeight ? 'کیلۆ' : 'دانە';
  const amount = Number(quantity);
  const valid = Number.isFinite(amount) && amount > 0
    && (mode === 'unit' && isWeight ? amount >= 0.001 : Number.isInteger(amount));
  const barcode = mode === 'carton' ? product?.carton?.barcode : product?.unit_barcode;
  const unitCost = mode === 'carton' ? product?.carton?.purchase_price_iqd : product?.unit_purchase_price_iqd;
  const totalCost = valid && unitCost != null ? amount * unitCost : null;
  const canReceive = Boolean(product && valid && (mode !== 'carton' || product.carton)
    && (!supplierId || (suppliers.some(supplier => supplier.id === supplierId) && totalCost != null && totalCost > 0)));

  return (
    <CanvaStockFrame number="041" title="وەرگرتنی کاڵا بۆ کۆگا" listTitle="زیادکردنی کاڵا بۆ کۆگا"
      summaryTitle="پوختەی وەرگرتن" onHome={() => navigateTo('home')}
      filters={
        <form id="stock-receive-041" className="stock-receive-form" onSubmit={event => {
          event.preventDefault();
          if (!product || !canReceive) return;
          receiveStock(product.id, amount, mode, supplierId || undefined, invoice.trim() || undefined);
          setProductId('');
          setQuery('');
          setInvoice('');
          setQuantity('1');
          setMode('unit');
          setReceived(true);
        }}>
          <div className="stock-036-filters">
            <label>ناسنامەی وەرگرتن
              <input value={invoice} onChange={event => setInvoice(event.target.value)}
                placeholder="ژمارەی پسووڵەی وەرگرتن" />
            </label>
            <label>دابینکەر
              <select value={supplierId} onChange={event => setSupplierId(event.target.value)}>
                <option value="">کڕینی نەختینە</option>
                {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
          </div>
          <label>کاڵا
            <input type="search" value={query} placeholder="بارکۆد یان ناوی کاڵا"
              onChange={event => {
                setQuery(event.target.value);
                setProductId('');
                setMode('unit');
                setReceived(false);
              }} />
          </label>
          {matches.length > 0 && (
            <div className="stock-workflow-tabs" role="group" aria-label="ئەنجامی گەڕانی کاڵا">
              {matches.map(p => <button type="button" key={p.id} onClick={() => {
                setProductId(p.id);
                setQuery(p.name);
              }}>{p.name} — {p.unit_barcode}</button>)}
            </div>
          )}
          <div className="stock-receive-units">
            <div className="stock-workflow-tabs" role="group" aria-label="یەکەی وەرگرتن">
              <button type="button" disabled={Boolean(isWeight)} aria-pressed={mode === 'unit' && !isWeight}
                onClick={() => setMode('unit')}>دانە</button>
              <button type="button" disabled={!product?.carton} aria-pressed={mode === 'carton'}
                onClick={() => setMode('carton')}>کارتۆن</button>
              <button type="button" disabled>دەستە</button>
              <button type="button" disabled>سێت</button>
              <button type="button" disabled={!isWeight} aria-pressed={mode === 'unit' && Boolean(isWeight)}
                onClick={() => setMode('unit')}>کیلۆ</button>
            </div>
            <label>بڕ
              <input type="number" min={mode === 'unit' && isWeight ? 0.001 : 1}
                step={mode === 'unit' && isWeight ? 0.001 : 1} required
                value={quantity} onChange={event => setQuantity(event.target.value)} />
            </label>
          </div>
        </form>
      }
      note="بڕی وەرگیراو بەپێی یەکەی بنەڕەتی دەخرێتە سەر کۆگا."
      summary={<dl>
        <div><dt>ڕیزی وەرگرتن</dt><dd>{product ? 1 : 0}</dd></div>
        <div><dt>کۆی نرخی وەرگرتن</dt><dd>{totalCost == null ? '—' : money(totalCost)}</dd></div>
        <div><dt>دۆخی وەرگرتن</dt><dd role="status">{received ? 'تۆمارکرا' : 'ئامادەکردن'}</dd></div>
      </dl>}
      actions={<>
        <button type="submit" form="stock-receive-041" className="stock-036-primary" disabled={!canReceive}>
          تۆمارکردنی وەرگرتن
        </button>
        <button type="button" onClick={() => navigateTo('stock', 'overview', 'stock-stack')}>گەڕانەوە بۆ کۆگا</button>
      </>}>
      <CanvaStockTable columns={columns}>
        {product ? <tr>
          <td>{product.name}</td><td><bdi>{barcode || '—'}</bdi></td><td>{displayMode}</td>
          <td><bdi>{valid ? amount : '—'}</bdi></td><td>—</td>
        </tr> : <tr><td colSpan={columns.length}>کاڵا هەڵبژێرە</td></tr>}
      </CanvaStockTable>
    </CanvaStockFrame>
  );
}
