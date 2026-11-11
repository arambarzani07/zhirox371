import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDateTime, money } from '../utils/retailHelpers';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

export function CanvaSupplierPayments053() {
  const { auditLogs, currentShift, suppliers, navigateTo, recordSupplierPayment } = useApp();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [fromDrawer, setFromDrawer] = useState(true);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');

  const term = search.trim().toLowerCase();
  const payments = auditLogs.flatMap(log => {
    const payment = log.supplierPayment;
    if (!payment || !Number.isFinite(payment.amount) || payment.amount <= 0) return [];
    const supplier = suppliers.find(item => item.id === payment.supplierId);
    return [{ log, payment, supplier }];
  }).filter(({ log, payment, supplier }) => (!source || source === payment.source)
    && [log.id, payment.supplierId, supplier?.name ?? ''].some(value => value.toLowerCase().includes(term)));
  const selected = payments.find(({ log }) => log.id === selectedId);
  const supplier = suppliers.find(item => item.id === supplierId);
  const value = Number(amount);
  const validAmount = /^\d+$/.test(amount) && Number.isSafeInteger(value) && value > 0;
  const canPay = validAmount && !!supplier && value <= supplier.balanceDebt
    && (!fromDrawer || (currentShift.status === 'open' && value <= currentShift.expectedCash));

  return (
    <div className="ws-stack stock-036-shell">
      <CanvaStockFrame number="053" category="کڕین و دابینکەران"
        title="مێژووی پارەدانی دابینکەران" listTitle="تۆماری پارەدانەکانی دابینکەران"
        summaryTitle="پوختەی پارەدان" onHome={() => navigateTo('home')}
        filters={<div className="stock-workflow-filters supplier-record-filters">
          <div className="stock-036-filters">
            <label>گەڕان<input type="search" value={search} onChange={event => setSearch(event.target.value)}
              placeholder="دابینکەر یان ناسنامەی پارەدان" /></label>
            <label>سەرچاوە<select aria-label="سەرچاوەی پارەدانەکان" value={source} onChange={event => setSource(event.target.value)}>
              <option value="">هەموو</option>
              <option value="drawer">سندووقی کاشێر</option>
              <option value="safe">قاسەی سەرەکی</option>
            </select></label>
          </div>
          {showForm && <form id="supplier-payment-053" className="stock-036-filters" onSubmit={event => {
            event.preventDefault();
            if (!canPay) return;
            recordSupplierPayment(supplierId, value, fromDrawer, note.trim());
            setAmount('');
            setNote('');
            setShowForm(false);
            setNotice('پارەدان لە حسابی دابینکەر تۆمار کرا');
          }}>
            <label>دابینکەر<select aria-label="دابینکەر" value={supplierId} onChange={event => setSupplierId(event.target.value)}>
              <option value="">هەڵبژاردنی دابینکەر</option>
              {suppliers.filter(item => item.balanceDebt > 0).map(item => <option key={item.id} value={item.id}>
                {item.name} — {money(item.balanceDebt)}
              </option>)}
            </select></label>
            <label>بڕی پارەی دراو<input value={amount} dir="ltr" inputMode="numeric" required
              onChange={event => setAmount(event.target.value)} /></label>
            <label>سەرچاوەی پارەدان<select aria-label="سەرچاوەی پارەدان" value={fromDrawer ? 'drawer' : 'safe'}
              onChange={event => setFromDrawer(event.target.value === 'drawer')}>
              <option value="drawer">سندووقی کاشێر</option><option value="safe">قاسەی سەرەکی</option>
            </select></label>
            <label>ژمارەی پسووڵە / تێبینی<input value={note} maxLength={120}
              onChange={event => setNote(event.target.value)} /></label>
          </form>}
        </div>}
        summary={<dl>
          <div><dt>پارەدانی تۆمارکراو</dt><dd>{payments.length}</dd></div>
          <div><dt>کۆی پارەدان</dt><dd><bdi>{money(payments.reduce((sum, row) => sum + row.payment.amount, 0))}</bdi></dd></div>
          <div><dt>{showDetails && selected ? 'وردەکاریی پارەدان' : 'دابینکەر'}</dt>
            <dd>{showDetails && selected ? selected.log.details : selected?.supplier?.name ?? '—'}</dd></div>
        </dl>}
        actions={<>
          {showForm
            ? <button type="submit" form="supplier-payment-053" className="stock-036-primary" disabled={!canPay}>تۆمارکردنی پارەدان بە دابینکەر</button>
            : <button type="button" className="stock-036-primary" onClick={() => { setShowForm(true); setNotice(''); }}>پارەدانی نوێ</button>}
          <button type="button" disabled={!selected} onClick={() => setShowDetails(previous => !previous)}>بینینی وردەکاریی پارەدان</button>
          <button type="button" className="stock-workflow-link" onClick={() => navigateTo('suppliers', 'accounts', 'supplier-accounts')}>گەڕانەوە بۆ حسابەکان</button>
        </>}
        note={<span role="status">{notice || 'مێژوو لە تۆمارە بەردەستەکانی پارەدانی دابینکەر پیشان دەدرێت.'}</span>}>
        <CanvaStockTable columns={['ناسنامەی پارەدان', 'بەروار', 'سەرچاوە', 'بڕی پارە', 'دۆخ']}>
          {payments.map(({ log, payment, supplier }) => (
            <tr key={log.id}>
              <td><button type="button" className="stock-036-product" aria-pressed={selectedId === log.id}
                onClick={() => { setSelectedId(log.id); setShowDetails(false); }}>
                {supplier?.name ?? payment.supplierId} <bdi>{log.id}</bdi>
              </button></td>
              <td><bdi>{formatDateTime(log.timestamp)}</bdi></td>
              <td>{payment.source === 'drawer' ? 'سندووقی کاشێر' : payment.source === 'safe' ? 'قاسەی سەرەکی' : '—'}</td>
              <td><bdi>{money(payment.amount)}</bdi></td><td>تۆمارکراو</td>
            </tr>
          ))}
          {!payments.length && <tr><td colSpan={5}>هیچ پارەدانێک نەدۆزرایەوە</td></tr>}
        </CanvaStockTable>
      </CanvaStockFrame>
    </div>
  );
}
