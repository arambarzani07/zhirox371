import type { ReactNode } from 'react';
import type { Customer } from '../types';
import { money } from '../utils/retailHelpers';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';

export function CanvaCreditSale({ total, customer, notes, feedback, canConfirm, onNotes, onPick, onConfirm, onBack, children }: {
  total: number;
  customer?: Customer;
  notes: string;
  feedback?: string;
  canConfirm: boolean;
  onNotes: (notes: string) => void;
  onPick: () => void;
  onConfirm: () => void;
  onBack: () => void;
  children: ReactNode;
}) {
  const nextDebt = customer ? customer.balanceDebt + total : null;
  const exceedsLimit = customer && (customer.creditLimit ?? 0) > 0 && nextDebt! > customer.creditLimit!;
  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="012">
      <CanvaWorkspaceHeader title="فرۆشتنی قەرز" actions={
        <button type="button" className="secondary" onClick={onBack}>گەڕانەوە بۆ کاشێر</button>
      } />
      {children}
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>پوختەی پسووڵە</h2>
          <dl className="canva-detail__summary">
            <div><dt>کۆی گشتی</dt><dd><bdi>{money(total)}</bdi></dd></div>
            <div><dt>پارەی پێشەکی</dt><dd><bdi>{money(0)}</bdi></dd></div>
            <div><dt>قەرزی نوێ</dt><dd><bdi>{money(total)}</bdi></dd></div>
            <div><dt>قەرزی پێشووی کڕیار</dt><dd><bdi>{customer ? money(customer.balanceDebt) : '—'}</bdi></dd></div>
            <div><dt>کۆی قەرز دوای فرۆشتن</dt><dd><bdi>{nextDebt === null ? '—' : money(nextDebt)}</bdi></dd></div>
          </dl>
          {exceedsLimit && <p role="status">کۆی قەرز لە سنووری قەرزی کڕیار زیاترە.</p>}
        </section>
        <section className="canva-detail__panel">
          <h2>زانیاریی قەرز</h2>
          <div className="canva-detail__actions">
            <button type="button" className="secondary" onClick={onPick}>{customer?.name || 'کڕیار هەڵبژێرە'}</button>
          </div>
          <label className="form-col">تێبینیی مامەڵە
            <textarea rows={2} value={notes} onChange={event => onNotes(event.target.value)} />
          </label>
          {feedback && <p role="alert">{feedback}</p>}
          <div className="canva-detail__actions">
            <button type="button" className="primary" disabled={!canConfirm} onClick={onConfirm}>
              پشتڕاستکردنەوەی فرۆشتنی قەرز
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
