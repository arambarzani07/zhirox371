import { useState } from 'react';
import type { ReactNode } from 'react';
import { money } from '../utils/retailHelpers';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';

export function CanvaSaleDiscount({ subtotal, current, onApply, onBack, children }: {
  subtotal: number;
  current: number;
  onApply: (percent: number, fixed: number) => void;
  onBack: () => void;
  children: ReactNode;
}) {
  const [method, setMethod] = useState<'percent' | 'fixed'>('percent');
  const [scope, setScope] = useState<'receipt' | 'none'>('receipt');
  const [input, setInput] = useState('0');
  const [previewed, setPreviewed] = useState(false);
  const value = Number(input);
  const valid = scope === 'none' || (/^\d+$/.test(input) && Number.isSafeInteger(value) &&
    value <= (method === 'percent' ? 100 : subtotal));
  const percent = scope === 'receipt' && method === 'percent' ? value : 0;
  const fixed = scope === 'receipt' && method === 'fixed' ? value : 0;
  const discount = valid ? Math.min(subtotal, Math.round(subtotal * percent / 100) + fixed) : 0;

  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="016">
      <CanvaWorkspaceHeader title="داشکاندنی ڕیز و پسووڵە" actions={
        <button type="button" className="secondary" onClick={onBack}>گەڕانەوە بۆ فرۆشتن</button>
      } />
      {children}
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>پێدانی داشکاندن</h2>
          <form className="canva-detail" onSubmit={event => { event.preventDefault(); setPreviewed(true); }}>
            <label className="form-col">داشکاندن بۆ
              <select value={scope} onChange={event => {
                setScope(event.target.value === 'none' ? 'none' : 'receipt');
                setPreviewed(false);
              }}>
                <option value="receipt">هەموو پسووڵە</option>
                <option value="line" disabled>ڕیزی هەڵبژێردراو</option>
                <option value="none">بەبێ داشکاندن</option>
              </select>
            </label>
            <label className="form-col">جۆری داشکاندن
              <select value={method} disabled={scope === 'none'} onChange={event => {
                setMethod(event.target.value === 'fixed' ? 'fixed' : 'percent');
                setPreviewed(false);
              }}>
                <option value="percent">ڕێژە %</option>
                <option value="fixed">بڕی دیاریکراو</option>
              </select>
            </label>
            <label className="form-col">بڕی داشکاندن
              <input inputMode="numeric" disabled={scope === 'none'} value={input} onChange={event => {
                setInput(event.target.value);
                setPreviewed(false);
              }} />
            </label>
            <div className="canva-detail__actions">
              <button type="submit" className="secondary">پێشبینینی داشکاندن</button>
              <button type="button" className="primary" disabled={!previewed || !valid}
                onClick={() => onApply(percent, fixed)}>جێبەجێکردنی داشکاندن</button>
            </div>
          </form>
        </section>
        <aside className="canva-detail__panel">
          <h2>پوختە و پشکنین</h2>
          <dl className="canva-detail__summary">
            <div><dt>کۆی پێش داشکاندن</dt><dd><bdi>{money(subtotal)}</bdi></dd></div>
            <div><dt>داشکاندنی پێشوو</dt><dd><bdi>{money(current)}</bdi></dd></div>
            <div><dt>داشکاندنی نوێ</dt><dd><bdi>{previewed && valid ? money(discount) : '—'}</bdi></dd></div>
            <div><dt>کۆی دوای داشکاندن</dt><dd><bdi>{previewed && valid ? money(subtotal - discount) : '—'}</bdi></dd></div>
          </dl>
          {previewed && !valid && <p role="alert">بڕی داشکاندن نادروستە.</p>}
        </aside>
      </div>
    </section>
  );
}
