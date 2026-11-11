import type { Product } from '../types';
import './canvaStockOverview036.css';

interface Props {
  products: Product[];
  filteredProducts: Product[];
  lowStockCount: number;
  search: string;
  onSearch: (value: string) => void;
  onAdjust: (product: Product) => void;
  onMovements: () => void;
  onHome: () => void;
}

const columns = ['ناوی کاڵا', 'بارکۆد', 'کەمترین بڕ', 'یەکە', 'بڕی بەردەست', 'دۆخ'];
const format = (quantity: number) => quantity.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function CanvaStockOverview036({
  products, filteredProducts, lowStockCount, search, onSearch, onAdjust, onMovements, onHome,
}: Props) {
  return (
    <section className="canva-stock-036" data-canva-screen="036" dir="rtl" aria-labelledby="stock-036-title">
      <header className="stock-036-heading">
        <h1 id="stock-036-title">دۆخی کۆگا و بڕی بەردەست</h1>
        <span>کۆگا و بەسەرچوون</span>
        <button type="button" onClick={onHome}>ماڵەوە</button>
      </header>

      <div className="stock-036-layout">
        <section className="stock-036-list" aria-labelledby="stock-036-list-title">
          <h2 id="stock-036-list-title">لیستی کاڵاکان و بڕی کۆگا</h2>
          <div className="stock-036-filters">
            <label>
              گەڕان لە کۆگا
              <input type="search" value={search} onChange={event => onSearch(event.target.value)}
                placeholder="بارکۆد، ناوی کاڵا یان پۆل" />
            </label>
            <label>
              شوێنی کۆگا
              <select disabled><option>هەموو شوێنەکان</option></select>
            </label>
          </div>

          <div className="stock-036-table" role="region" aria-label="لیستی کاڵاکانی کۆگا" tabIndex={0}>
            <table>
              <thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
              <tbody>
                {filteredProducts.map(product => {
                  const minimum = product.min_stock ?? 10;
                  const status = product.stock <= 0 ? 'بەردەست نییە'
                    : product.stock <= minimum ? 'کەمبوو' : 'بەردەست';
                  return (
                    <tr key={product.id}>
                      <td><button type="button" className="stock-036-product"
                        aria-label={`ڕێکخستنی بڕی کۆگا: ${product.name}`}
                        title="ڕێکخستنی بڕ (+/−)"
                        onClick={() => onAdjust(product)}>{product.name}</button></td>
                      <td><bdi dir="ltr">{product.unit_barcode || '—'}</bdi></td>
                      <td><bdi dir="ltr">{format(minimum)}</bdi></td>
                      <td>{product.base_unit === 'kg' ? 'کیلۆگرام' : 'دانە'}</td>
                      <td><bdi dir="ltr">{format(product.stock)}</bdi></td>
                      <td>{status}</td>
                    </tr>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={columns.length}>هیچ کاڵایەک نەدۆزرایەوە</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="stock-036-note">هەموو بڕەکان بەپێی یەکەی بنەڕەتی کاڵا هەژمار دەکرێن.</p>
        </section>

        <aside className="stock-036-summary" aria-labelledby="stock-036-summary-title">
          <h2 id="stock-036-summary-title">پوختە و پشکنین</h2>
          <dl>
            <div><dt>هەموو کاڵاکان</dt><dd>{format(products.length)}</dd></div>
            <div><dt>کاڵای بەردەست</dt><dd>{format(products.filter(product => product.stock > 0).length)}</dd></div>
            <div><dt>کاڵای کەمبوو</dt><dd>{format(lowStockCount)}</dd></div>
          </dl>
          <div className="stock-036-actions">
            <button type="button" className="stock-036-primary" onClick={onMovements}>بینینی جووڵەی کاڵا</button>
            <button type="button" onClick={onHome}>گەڕانەوە بۆ ماڵەوە</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
