import { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { StockMovement, SupplierReceiptLine } from '../types';
import { money, formatDateTime } from '../utils/retailHelpers';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

type ReceiptMovement = StockMovement & { supplierReceipt: SupplierReceiptLine };
const unitLabels = { unit: 'دانە', carton: 'کارتۆن', kg: 'کیلۆ' };
const returnKey = 'zhirox371_canva051_demo_return_session';
const format = (quantity: number) => quantity.toLocaleString('en-US', { maximumFractionDigits: 3 });

function hasReceipt(movement: StockMovement): movement is ReceiptMovement {
  const line = movement.supplierReceipt;
  return movement.type === 'receive' && !!line && typeof line.supplierId === 'string'
    && typeof line.invoiceNo === 'string' && line.invoiceNo.length > 0
    && Object.hasOwn(unitLabels, line.unit)
    && Number.isFinite(line.quantity) && line.quantity > 0
    && Number.isFinite(line.unitCost) && line.unitCost > 0
    && Number.isFinite(line.total) && line.total > 0;
}

export function CanvaSupplierRecords({ screen }: { screen: '050' | '051' | '052' }) {
  const { stockMovements, suppliers, auditLogs, navigateTo } = useApp();
  const [supplierId, setSupplierId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('all');
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const supplier = suppliers.find(item => item.id === supplierId);
  const receipts = stockMovements.filter(hasReceipt).filter(row => row.supplierReceipt.supplierId === supplierId);
  const invoiceNumbers = [...new Set(receipts.map(row => row.supplierReceipt.invoiceNo))];
  const rows = receipts.filter(row => row.supplierReceipt.invoiceNo === invoice);
  const payments = auditLogs.filter(log => log.supplierPayment?.supplierId === supplierId
    && Number.isFinite(log.supplierPayment.amount) && log.supplierPayment.amount > 0);
  const isLedger = screen === '052';
  const isReturn = screen === '051';
  const withinPeriod = (date: string) => period === 'all'
    || Date.parse(date) >= Date.now() - Number(period) * 86_400_000;
  const total = rows.reduce((sum, row) => sum + row.supplierReceipt.total, 0);
  const ledger = [
    ...receipts.map(row => ({
      id: row.id, date: row.createdAt, label: row.supplierReceipt.invoiceNo,
      charge: row.supplierReceipt.total, paid: 0,
    })),
    ...payments.map(log => ({
      id: log.id, date: log.timestamp, label: 'پارەدان بە دابینکەر',
      charge: 0, paid: log.supplierPayment!.amount,
    })),
  ].filter(row => withinPeriod(row.date)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const returnRows = rows.map(row => {
    const input = quantities[row.id] ?? '';
    const pattern = row.supplierReceipt.unit === 'kg' ? /^\d+(\.\d{1,3})?$/ : /^\d+$/;
    const quantity = Number(input);
    const valid = input === '' || (pattern.test(input) && quantity >= 0 && quantity <= row.supplierReceipt.quantity);
    return { row, input, quantity, valid };
  });
  const term = search.trim().toLowerCase();
  const visibleReturnRows = returnRows.filter(({ row }) => !term || row.productName.toLowerCase().includes(term)
    || row.supplierReceipt.barcode?.toLowerCase().includes(term));
  const selected = returnRows.filter(line => line.valid && line.quantity > 0);
  const returnTotal = selected.reduce((sum, { row, quantity }) => sum + Math.round(quantity * row.supplierReceipt.unitCost), 0);
  const canSave = !!reason.trim() && selected.length > 0 && returnRows.every(line => line.valid) && Number.isSafeInteger(returnTotal);

  function selectInvoice(value: string) {
    setInvoice(value);
    setQuantities({});
    setReason('');
    setNotice('');
    if (!isReturn || !value) return;
    try {
      const draft = JSON.parse(sessionStorage.getItem(returnKey) ?? 'null');
      if (draft?.supplierId === supplierId && draft.invoice === value && typeof draft.reason === 'string'
        && draft.quantities && typeof draft.quantities === 'object') {
        setReason(draft.reason);
        setQuantities(Object.fromEntries(Object.entries(draft.quantities).filter(
          ([id, quantity]) => typeof quantity === 'string' && receipts.some(row => row.id === id
            && row.supplierReceipt.invoiceNo === value),
        )) as Record<string, string>);
      }
    } catch {
      setNotice('ڕەشنووسی پاشەکەوتکراو بەردەست نییە');
    }
  }

  function saveReturn() {
    if (!canSave) return;
    try {
      sessionStorage.setItem(returnKey, JSON.stringify({ supplierId, invoice, reason, quantities }));
      setNotice('ڕەشنووسی گەڕاندنەوە پاشەکەوت کرا');
    } catch {
      setNotice('پاشەکەوتکردن سەرکەوتوو نەبوو');
    }
  }

  return <div className="ws-stack stock-036-shell">
    <CanvaStockFrame number={screen} category="کڕین و دابینکەران"
      title={isLedger ? 'قەرزی دابینکەران و حساب' : isReturn ? 'گەڕاندنەوەی کڕین بۆ دابینکەر' : 'پسووڵەی کڕین و پارەدان'}
      listTitle={isLedger ? 'کەشفی حساب و قەرزی دابینکەران' : isReturn ? 'کاڵاکانی گەڕاندنەوە' : 'پسووڵە و پارەدان'}
      summaryTitle={isLedger ? 'حسابی دابینکەر' : isReturn ? 'پوختەی گەڕاندنەوە' : 'پارەدانی دابینکەر'}
      onHome={() => navigateTo('home')}
      filters={<div className="stock-workflow-filters supplier-record-filters">
        <div className="stock-036-filters">
          <label>دابینکەر<select aria-label="دابینکەر" value={supplierId} onChange={event => { setSupplierId(event.target.value); selectInvoice(''); }}>
            <option value="">هەڵبژاردنی دابینکەر</option>
            {suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          {isLedger ? <label>ماوەی کات<select aria-label="ماوەی کات" value={period} onChange={event => setPeriod(event.target.value)}>
            <option value="all">هەموو بەروارەکان</option><option value="7">7 ڕۆژی ڕابردوو</option><option value="30">30 ڕۆژی ڕابردوو</option>
          </select></label> : <label>ژمارەی پسووڵە<select aria-label="ژمارەی پسووڵە" value={invoice} onChange={event => selectInvoice(event.target.value)}>
            <option value="">هەڵبژاردنی پسووڵە</option>
            {invoiceNumbers.map(number => <option key={number} value={number}>{number}</option>)}
          </select></label>}
        </div>
        {isReturn && <div className="stock-036-filters">
          <label>گەڕان بەدوای کاڵا<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label>هۆکاری گەڕاندنەوە<input value={reason} maxLength={120} onChange={event => { setReason(event.target.value); setNotice(''); }} /></label>
        </div>}
      </div>}
      summary={<dl>{(isLedger ? [
        ['کڕینی تۆمارکراو', money(ledger.reduce((sum, line) => sum + line.charge, 0))],
        ['پارەدانی تۆمارکراو', money(ledger.reduce((sum, line) => sum + line.paid, 0))],
        ['پارەی ماوە', supplier ? money(supplier.balanceDebt) : '—'],
      ] : isReturn ? [
        ['ژمارەی ڕیزەکان', selected.length], ['دۆخی گەڕاندنەوە', 'ڕەشنووس'],
        ['کۆی پارەی گەڕاندنەوە', money(returnTotal)],
      ] : [
        ['کۆی پسووڵە', rows.length ? money(total) : '—'], ['پارەی پێدراو', '—'], ['پارەی ماوەی پسووڵە', '—'],
      ]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>)}</dl>}
      actions={isLedger ? <>
        <button type="button" className="stock-036-primary" onClick={() => navigateTo('suppliers', 'payments', 'supplier-accounts')}>بینینی وردەکاریی حساب</button>
        <button type="button" onClick={() => navigateTo('suppliers', 'list', 'supplier-building')}>گەڕانەوە بۆ دابینکەران</button>
      </> : isReturn ? <>
        <button type="button" className="stock-036-primary" disabled>ناردن بۆ پەسەندکردن</button>
        <button type="button" disabled={!canSave} onClick={saveReturn}>پاشەکەوتکردنی ڕەشنووس</button>
        <button type="button" className="stock-workflow-link" onClick={() => navigateTo('suppliers', 'invoice', 'purchase-order')}>گەڕانەوە بۆ پسووڵە</button>
      </> : <>
        <button type="button" className="stock-036-primary" disabled>پشتڕاستکردنەوەی پارەدان</button>
        <button type="button" onClick={() => navigateTo('suppliers', 'supplier-return', 'purchase-order')}>گەڕاندنەوەی کڕین</button>
        <button type="button" className="stock-workflow-link" onClick={() => navigateTo('suppliers', 'order', 'purchase-order')}>گەڕانەوە بۆ فەرمان</button>
      </>}
      note={<span role="status">{notice || (isLedger
        ? 'پسووڵە ناسنامەدارەکان و پارەدانە بەردەستەکانی تۆماری نوێ پیشان دەدرێن. پارەی ماوە قەرزی ئێستای دابینکەرە.'
        : isReturn ? 'بڕی گەڕاندنەوە لە بڕی وەرگیراو زیاتر نابێت. ناردن بۆ پەسەندکردن بەردەست نییە.'
        : 'پارەدان لەسەر حسابی دابینکەرە. بەستنی پارەدان بە پسووڵە بەردەست نییە.')}</span>}>
      <CanvaStockTable columns={isLedger ? ['مامەڵە', 'بەروار', 'قەرزی نوێ', 'پارەی دراو', 'باقی']
        : isReturn ? ['کاڵا', 'یەکە', 'وەرگیراو', 'گەڕاندنەوە', 'دۆخ'] : ['کاڵا', 'بڕ', 'نرخ', 'کۆی ڕیز', 'دۆخ']}>
        {isLedger ? ledger.map(row => <tr key={row.id}>
          <td>{row.label}</td><td><bdi>{formatDateTime(row.date)}</bdi></td>
          <td><bdi>{row.charge ? money(row.charge) : '—'}</bdi></td><td><bdi>{row.paid ? money(row.paid) : '—'}</bdi></td><td>—</td>
        </tr>) : isReturn ? visibleReturnRows.map(({ row, input, valid }) => <tr key={row.id}>
          <td>{row.productName}</td><td>{unitLabels[row.supplierReceipt.unit]}</td><td><bdi>{format(row.supplierReceipt.quantity)}</bdi></td>
          <td><input className="stock-count-input" dir="ltr" inputMode="decimal" aria-label={row.productName}
            aria-invalid={!valid} value={input} onChange={event => { setQuantities(previous => ({ ...previous, [row.id]: event.target.value })); setNotice(''); }} /></td>
          <td>{valid ? 'ڕەشنووس' : 'بڕ نادروستە'}</td>
        </tr>) : rows.map(row => <tr key={row.id}>
          <td>{row.productName}</td><td><bdi>{format(row.supplierReceipt.quantity)}</bdi> {unitLabels[row.supplierReceipt.unit]}</td>
          <td><bdi>{money(row.supplierReceipt.unitCost)}</bdi></td><td><bdi>{money(row.supplierReceipt.total)}</bdi></td><td>وەرگیراو</td>
        </tr>)}
        {(isLedger ? !ledger.length : isReturn ? !visibleReturnRows.length : !rows.length) && <tr><td colSpan={5}>هیچ تۆمارێک نەدۆزرایەوە</td></tr>}
      </CanvaStockTable>
    </CanvaStockFrame>
  </div>;
}
