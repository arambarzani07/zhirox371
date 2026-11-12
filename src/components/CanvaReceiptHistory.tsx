import { useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import type { PaymentMethod } from '../types';
import { formatDateTime, money } from '../utils/retailHelpers';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';

const methods: { value: 'all' | PaymentMethod; label: string }[] = [
  { value: 'all', label: 'هەموو پارەدانەکان' },
  { value: 'cash', label: 'نەختینە' },
  { value: 'debt', label: 'قەرز' },
];

export function CanvaReceiptHistory({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { receipts, navigateTo, setActiveReceiptForModal } = useApp();
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<'all' | PaymentMethod>('all');
  const [date, setDate] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const search = query.trim().toLowerCase();
  const visible = receipts.filter(receipt =>
    (method === 'all' || receipt.paymentMethod === method) &&
    (!date || new Date(receipt.createdAt).toLocaleDateString('sv-SE') === date) &&
    (receipt.receiptNumber.toLowerCase().includes(search) ||
      receipt.customerName.toLowerCase().includes(search) ||
      receipt.items.some(item => item.name.toLowerCase().includes(search) || item.barcode.includes(search)))
  );
  const selected = visible.find(receipt => receipt.id === selectedId);
  const total = receipts.reduce((sum, receipt) => sum + receipt.total, 0);
  const debt = receipts.reduce((sum, receipt) => sum + (receipt.paymentMethod === 'debt' ? receipt.total : 0), 0);

  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="003">
      <CanvaWorkspaceHeader title="پسووڵەکان و مێژووی فرۆشتن" actions={
        <button type="button" className="secondary" onClick={onBack}>کاشێر</button>
      } />
      {children}
      <div className="ws-kpi-grid">
        <div className="ws-kpi-card"><span className="ws-kpi-label">ژمارەی پسووڵەکان</span><strong className="ws-kpi-value">{receipts.length}</strong></div>
        <div className="ws-kpi-card"><span className="ws-kpi-label">کۆی فرۆشتن</span><strong className="ws-kpi-value">{money(total)}</strong></div>
        <div className="ws-kpi-card"><span className="ws-kpi-label">قەرزی فرۆشتن</span><strong className="ws-kpi-value">{money(debt)}</strong></div>
      </div>
      <div className="canva-detail__columns">
        <section className="canva-detail__panel" aria-labelledby="receipt-list-title">
          <h2 id="receipt-list-title">لیستی پسووڵەکان</h2>
          <div className="canva-detail__filters">
            <input type="search" aria-label="گەڕان لە پسووڵەکان" placeholder="ژمارەی پسووڵە، بارکۆد یان ناوی کڕیار"
              value={query} onChange={event => setQuery(event.target.value)} />
            <input type="date" aria-label="بەرواری پسووڵە" value={date} onChange={event => setDate(event.target.value)} />
            <select aria-label="جۆری پارەدان" value={method} onChange={event => setMethod(event.target.value as typeof method)}>
              {methods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="section-workspace__table" role="region" aria-label="خشتەی پسووڵەکان" tabIndex={0}>
            <table>
              <thead><tr><th>ژمارەی پسووڵە</th><th>بەروار</th><th>کاشێر</th><th>پارەدان</th><th>کۆ</th><th>دۆخ</th></tr></thead>
              <tbody>
                {visible.map(receipt => (
                  <tr key={receipt.id} data-selected={receipt.id === selectedId}>
                    <td><button type="button" className="secondary" aria-pressed={receipt.id === selectedId}
                      onClick={() => setSelectedId(receipt.id)}><bdi>{receipt.receiptNumber}</bdi></button></td>
                    <td><bdi>{formatDateTime(receipt.createdAt)}</bdi></td>
                    <td>{receipt.cashierName}</td>
                    <td>{receipt.paymentMethod === 'cash' ? 'نەختینە' : 'قەرز'}</td>
                    <td><bdi>{money(receipt.total)}</bdi></td><td>تۆمارکراو</td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={6} className="section-workspace__empty">هیچ پسووڵەیەک نەدۆزرایەوە</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="canva-detail__panel" aria-labelledby="receipt-detail-title">
          <h2 id="receipt-detail-title">وردەکاریی پسووڵە</h2>
          <dl className="canva-detail__summary">
            <div><dt>ژمارەی پسووڵە</dt><dd><bdi>{selected?.receiptNumber ?? '—'}</bdi></dd></div>
            <div><dt>بەروار</dt><dd><bdi>{selected ? formatDateTime(selected.createdAt) : '—'}</bdi></dd></div>
            <div><dt>کڕیار</dt><dd>{selected?.customerName ?? '—'}</dd></div>
            <div><dt>کاشێر</dt><dd>{selected?.cashierName ?? '—'}</dd></div>
            <div><dt>کۆی پسووڵە</dt><dd><bdi>{selected ? money(selected.total) : '—'}</bdi></dd></div>
          </dl>
          <div className="canva-detail__actions">
            <button className="primary" type="button" disabled={!selected}
              onClick={() => selected && setActiveReceiptForModal(selected)}>پێشبینینی چاپ</button>
            <button className="secondary" type="button" disabled={!selected}
              onClick={() => selected && navigateTo('pos', selected.receiptNumber, 'return-arrow')}>گەڕاندنەوە</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
