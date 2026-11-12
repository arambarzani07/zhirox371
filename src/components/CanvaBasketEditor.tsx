import { useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import type { CartLine } from '../types';
import { money } from '../utils/retailHelpers';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';

const unit = (line: CartLine) => line.isScale ? 'کیلۆ' : line.mode === 'carton' ? 'کارتۆن' : 'دانە';

export function CanvaBasketEditor({ initialId, onBack, children }: {
  initialId: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const { cart } = useApp();
  const [id, setId] = useState(initialId);
  const index = cart.findIndex(line => line.id === id);
  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="008">
      <CanvaWorkspaceHeader title="دەستکاریکردنی ڕیزی سەبەتە" actions={
        <button type="button" className="secondary" onClick={onBack}>گەڕانەوە بۆ کاشێر</button>
      } />
      {children}
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>سەبەتەی فرۆشتن</h2>
          <div className="section-workspace__table">
            <table>
              <thead><tr><th>ژمارە</th><th>ناوی کاڵا</th><th>یەکە</th><th>نرخ</th><th>بڕ</th><th>کۆ</th></tr></thead>
              <tbody>
                {cart.map((line, position) => (
                  <tr key={line.id} data-selected={line.id === id}>
                    <td>{position + 1}</td>
                    <td><button type="button" className="secondary" aria-pressed={line.id === id}
                      onClick={() => setId(line.id)}>{line.name}</button></td>
                    <td>{unit(line)}</td><td><bdi>{money(line.price)}</bdi></td>
                    <td>{line.qty}</td><td><bdi>{money(line.qty * line.price)}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <strong>کۆی سەبەتە · <bdi>{money(cart.reduce((sum, line) => sum + line.qty * line.price, 0))}</bdi></strong>
        </section>
        <aside className="canva-detail__panel">
          <h2>ڕیزی هەڵبژێردراو</h2>
          {index < 0 ? <p>ڕیزێکی سەبەتە هەڵبژێرە</p> :
            <BasketLineForm key={id} index={index} line={cart[index]} onBack={onBack} />}
        </aside>
      </div>
    </section>
  );
}

function BasketLineForm({ index, line, onBack }: { index: number; line: CartLine; onBack: () => void }) {
  const { products, editCartLine, setCartLineLocked, removeFromCart } = useApp();
  const [quantity, setQuantity] = useState(String(line.qty));
  const [mode, setMode] = useState(line.mode);
  const [error, setError] = useState('');
  const product = products.find(item => item.id === line.productId);
  const price = mode === line.mode ? line.price :
    (mode === 'carton' ? product?.carton?.sale_price_iqd : product?.unit_sale_price_iqd) ?? line.price;
  return (
    <form className="canva-detail" onSubmit={event => {
      event.preventDefault();
      const result = editCartLine(index, Number(quantity), mode);
      if (result.success) onBack();
      else setError(result.message || 'ڕیزەکە پاشەکەوت نەکرا');
    }}>
      <dl className="canva-detail__summary">
        <div><dt>ناوی کاڵا</dt><dd>{line.name}</dd></div>
        <div><dt>نرخ</dt><dd><bdi>{money(price)}</bdi></dd></div>
      </dl>
      <label className="form-col">جۆری یەکە
        <select value={mode} disabled={line.locked || line.isScale}
          onChange={event => setMode(event.target.value as CartLine['mode'])}>
          <option value="unit" disabled={!line.isScale && product?.sale_mode === 'carton'}>{line.isScale ? 'کیلۆ' : 'دانە'}</option>
          <option value="carton" disabled={!product?.carton}>کارتۆن</option>
        </select>
      </label>
      <label className="form-col">بڕ
        <input type="number" min="1" step="1" required value={quantity} disabled={line.locked || line.isScale}
          onChange={event => setQuantity(event.target.value)} />
      </label>
      <div className="canva-detail__actions">
        {[-1, 1].map(delta => <button key={delta} type="button" className="secondary"
          aria-label={delta > 0 ? 'زیادکردنی بڕ' : 'کەمکردنەوەی بڕ'}
          disabled={line.locked || line.isScale} onClick={() => setQuantity(String(Math.max(1, (Number(quantity) || 1) + delta)))}>
          {delta > 0 ? '+' : '−'}
        </button>)}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="canva-detail__actions">
        <button type="submit" className="primary" disabled={line.locked || line.isScale}>پاشەکەوتکردنی ڕیز</button>
        <button type="button" className="secondary" aria-pressed={Boolean(line.locked)}
          onClick={() => {
            setCartLineLocked(line.id, !line.locked);
            setQuantity(String(line.qty));
            setMode(line.mode);
            setError('');
          }}>{line.locked ? 'کردنەوەی قوفڵ' : 'قوفڵی ڕیز'}</button>
        <button type="button" className="secondary" disabled={line.locked}
          onClick={() => removeFromCart(index)}>سڕینەوەی ڕیز</button>
      </div>
    </form>
  );
}
