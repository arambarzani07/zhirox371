import { useState } from 'react';
import type { ReactNode } from 'react';
import { money } from '../utils/retailHelpers';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';

const reasons = ['داواکاریی کڕیار', 'هەڵە لە تۆمارکردنی کاڵا', 'پسووڵەی دووبارە', 'هۆکاری تر'];

export function CanvaCancelTicket({ label, quantity, total, onBack, onConfirm, children }: {
  label: string;
  quantity: number;
  total: number;
  onBack: () => void;
  onConfirm: (reason: string) => void;
  children: ReactNode;
}) {
  const [reason, setReason] = useState('');
  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="013">
      <CanvaWorkspaceHeader title="پشتڕاستکردنەوەی هەڵوەشاندنەوە" />
      {children}
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>هەڵوەشاندنەوەی پسووڵەی کراوە</h2>
          <p>ئەم کردارە تەنها پسووڵەی ناتەواو هەڵدەوەشێنێتەوە.</p>
          <dl className="canva-detail__summary">
            <div><dt>پسووڵەی هەڵبژێردراو</dt><dd>{label}</dd></div>
          </dl>
          <form className="canva-detail" onSubmit={event => {
            event.preventDefault();
            if (reasons.includes(reason)) onConfirm(reason);
          }}>
            <label className="form-col">هۆکاری هەڵوەشاندنەوە
              <select required value={reason} onChange={event => setReason(event.target.value)}>
                <option value="">هەڵبژێرە</option>
                {reasons.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
            <p>بۆ پسووڵەی تەواوکراو، شاشەی گەڕاندنەوەی فرۆشتن بەکاربهێنە.</p>
            <div className="canva-detail__actions">
              <button type="button" className="secondary" onClick={onBack}>نەخێر، گەڕانەوە بۆ فرۆشتن</button>
              <button type="submit" className="primary" disabled={!reason}>بەڵێ، هەڵوەشاندنەوەی پسووڵە</button>
            </div>
          </form>
        </section>
        <aside className="canva-detail__panel">
          <h2>پوختەی کاریگەری</h2>
          <dl className="canva-detail__summary">
            <div><dt>بڕی کاڵا</dt><dd><bdi>{quantity.toLocaleString('en-US')}</bdi></dd></div>
            <div><dt>کۆی سەبەتە</dt><dd><bdi>{money(total)}</bdi></dd></div>
            <div><dt>پسووڵەی کراوە</dt><dd>{label}</dd></div>
            <div><dt>پارەدانی تۆمارکراو</dt><dd><bdi>{money(0)}</bdi></dd></div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
