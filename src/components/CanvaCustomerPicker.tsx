import { useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';

export function CanvaCustomerPicker({ initialId, requiresCustomer, onSelect, onBack, children }: {
  initialId: string;
  requiresCustomer: boolean;
  onSelect: (id: string) => void;
  onBack: () => void;
  children: ReactNode;
}) {
  const { customers } = useApp();
  const [query, setQuery] = useState('');
  const [draftId, setDraftId] = useState(initialId);
  const selected = customers.find(customer => customer.id === draftId);
  const search = query.trim().toLowerCase();
  const matches = customers.filter(customer =>
    [customer.name, customer.id, customer.phone].some(value => value.toLowerCase().includes(search)));
  const type = 'کڕیاری تۆمارکراو';

  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="011">
      <CanvaWorkspaceHeader title="هەڵبژاردنی کڕیار" actions={
        <button type="button" className="secondary" onClick={onBack}>گەڕانەوە بۆ فرۆشتن</button>
      } />
      {children}
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>گەڕان بەدوای کڕیار</h2>
          <div className="canva-detail__filters">
            <input type="search" aria-label="ناو، ناسنامە یان مۆبایلی کڕیار" placeholder="ناو، ناسنامە یان مۆبایلی کڕیار"
              value={query} onChange={event => setQuery(event.target.value)} />
          </div>
          <div className="section-workspace__table" tabIndex={0} role="region" aria-label="ئەنجامی گەڕانی کڕیار">
            <table>
              <thead><tr><th>ناوی کڕیار</th><th>ناسنامە</th><th>جۆر</th><th>دۆخی قەرز</th><th>هەڵبژاردن</th></tr></thead>
              <tbody>
                {matches.map(customer => (
                  <tr key={customer.id} data-selected={customer.id === draftId}>
                    <td>{customer.name}</td><td><bdi>{customer.id}</bdi></td>
                    <td>{type}</td><td><bdi>{money(customer.balanceDebt)}</bdi></td>
                    <td><button type="button" className="secondary" aria-label={`هەڵبژاردنی ${customer.name}`}
                      aria-pressed={customer.id === draftId} onClick={() => setDraftId(customer.id)}>هەڵبژاردن</button></td>
                  </tr>
                ))}
                {matches.length === 0 && <tr><td colSpan={5} className="section-workspace__empty">هیچ کڕیارێک نەدۆزرایەوە</td></tr>}
              </tbody>
            </table>
          </div>
          <span>ئەنجامی گەڕان: {matches.length}</span>
        </section>
        <aside className="canva-detail__panel">
          <h2>کڕیاری هەڵبژێردراو</h2>
          <dl className="canva-detail__summary">
            <div><dt>ناوی کڕیار</dt><dd>{selected?.name ?? '—'}</dd></div>
            <div><dt>جۆری کڕیار</dt><dd>{selected ? type : '—'}</dd></div>
            <div><dt>دۆخی قەرز</dt><dd><bdi>{selected ? money(selected.balanceDebt) : '—'}</bdi></dd></div>
          </dl>
          <div className="canva-detail__actions">
            <button type="button" className="primary" disabled={!selected}
              onClick={() => selected && onSelect(selected.id)}>پەسەندکردنی کڕیار</button>
            <button type="button" className="secondary" disabled={requiresCustomer}
              onClick={() => onSelect('')}>کڕیاری ئاسایی</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
