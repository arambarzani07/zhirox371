import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import type { AuditLogEntry, Customer, Receipt } from '../types';
import { formatDateTime, money } from '../utils/retailHelpers';
import { KurdishVoiceAnnouncer } from '../utils/kurdishVoiceEngine';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';
import './canvaCustomerWorkspace.css';

type Screen = '056' | '057' | '058' | '060' | '061';
type Metric = [label: string, value: ReactNode];
const screens: Record<Screen, [string, string, string]> = {
  '056': ['لیستی کڕیاران و قەرز', 'لیستی کڕیاران و دۆخی حساب', 'پوختەی کڕیار'],
  '057': ['تۆمارکردنی کڕیاری نوێ', 'زانیاریی بنەڕەتی کڕیار', 'پشکنینی تۆمارکردن'],
  '058': ['کەشفی حسابی قەرزی کڕیار', 'مامەڵە و مێژووی قەرزی کڕیار', 'پوختەی حساب'],
  '060': ['وەرگرتنەوەی پارەی قەرز', 'پارەدان لە قەرزی کڕیار', 'پوختەی وەرگرتنەوە'],
  '061': ['مێژووی مامەڵەکانی کڕیار', 'مێژووی کڕین و دانەوەی قەرز', 'پوختەی مامەڵەکان'],
};

function CustomerFrame({ screen, fields, children, metrics, actions, notice }: {
  screen: Screen;
  fields: ReactNode;
  children?: ReactNode;
  metrics: Metric[];
  actions: ReactNode;
  notice: ReactNode;
}) {
  const { navigateTo } = useApp();
  const [title, listTitle, summaryTitle] = screens[screen];
  return <div className="ws-stack stock-036-shell canva-customer-shell">
    <CanvaStockFrame number={screen} category="کڕیار و قەرز" title={title}
      listTitle={listTitle} summaryTitle={summaryTitle} onHome={() => navigateTo('home')}
      filters={fields} summary={<dl>{metrics.map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      actions={actions} note={<span role="status">{notice}</span>}>
      {children}
    </CanvaStockFrame>
  </div>;
}

function CustomerSelect({ customers, value, onChange, all }: {
  customers: Customer[]; value: string; onChange: (id: string) => void; all?: boolean;
}) {
  return <label>کڕیار
    <select aria-label="کڕیار" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">{all ? 'هەموو کڕیاران' : 'هەڵبژاردنی کڕیار'}</option>
      {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.id}</option>)}
    </select>
  </label>;
}

const currency = (amount: number) => <bdi>{money(amount)}</bdi>;
const noRows = <tr><td colSpan={5}>هیچ تۆمارێک نەدۆزرایەوە</td></tr>;

function CustomerDirectory({ open }: { open: (screen: Screen, customerId?: string) => void }) {
  const { customers, navigateTo } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const query = search.trim().toLowerCase();
  const rows = customers.filter(customer => [customer.name, customer.id, customer.phone].some(
    value => value.toLowerCase().includes(query),
  ) && (filter === 'all' || (filter === 'debt' ? customer.balanceDebt > 0 : customer.balanceDebt === 0)));
  const selected = rows.find(customer => customer.id === selectedId);
  return <CustomerFrame screen="056"
    fields={<div className="stock-workflow-filters">
      <label>گەڕان لە کڕیاران<input type="search" value={search} onChange={event => setSearch(event.target.value)}
        placeholder="ناوی کڕیار، ناسنامە یان ژمارەی مۆبایل" /></label>
      <div className="stock-workflow-tabs customer-directory-tools">
        {[['all', 'هەموو'], ['clear', 'بێ قەرز'], ['debt', 'قەرزدار']].map(([key, label]) =>
          <button key={key} type="button" aria-pressed={key === filter} onClick={() => setFilter(key)}>{label}</button>)}
        <button type="button" onClick={() => open('057')}>زیادکردنی کڕیار</button>
      </div>
    </div>}
    metrics={[
      ['کڕیاری هەڵبژێردراو', selected?.name ?? '—'],
      ['باقی قەرز', selected ? currency(selected.balanceDebt) : '—'],
      ['دۆخی حساب', selected ? (selected.balanceDebt > 0 ? 'قەرزدار' : 'بێ قەرز') : '—'],
    ]}
    actions={<>
      <button className="stock-036-primary" type="button" disabled={!selected}
        onClick={() => open('058', selected?.id)}>بینینی کەشفی حساب</button>
      <button type="button" onClick={() => navigateTo('home')}>گەڕانەوە بۆ ماڵەوە</button>
    </>}
    notice={selected ? <>مۆبایل <bdi>{selected.phone}</bdi></> : 'کڕیارێک هەڵبژێرە بۆ بینینی حسابەکەی.'}>
    <CanvaStockTable columns={['ناوی کڕیار', 'ناسنامە', 'باقی قەرز', 'دۆخ', 'کردار']}>
      {rows.map(customer => <tr key={customer.id}>
        <td><button className="stock-036-product" type="button" aria-pressed={selected?.id === customer.id}
          onClick={() => setSelectedId(customer.id)}>{customer.name}</button></td>
        <td><bdi>{customer.id}</bdi></td><td>{currency(customer.balanceDebt)}</td>
        <td>{customer.balanceDebt > 0 ? 'قەرزدار' : 'بێ قەرز'}</td>
        <td><button className="stock-036-product" type="button"
          onClick={() => open(customer.balanceDebt > 0 ? '060' : '058', customer.id)}>
          {customer.balanceDebt > 0 ? 'وەرگرتنەوە' : 'حساب'}
        </button></td>
      </tr>)}
      {!rows.length && noRows}
    </CanvaStockTable>
  </CustomerFrame>;
}

function CustomerRegistration({ open }: { open: (screen: Screen, customerId?: string) => void }) {
  const { addCustomer, customers } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [openingDebt, setOpeningDebt] = useState('0');
  const normalizePhone = (value: string) => value.replace(/[\s()-]/g, '');
  const phoneNumber = normalizePhone(phone.trim());
  const duplicate = phoneNumber.length > 0 && customers.some(customer => normalizePhone(customer.phone) === phoneNumber);
  const debt = Number(openingDebt);
  const valid = !!name.trim() && (!phoneNumber || /^\+?\d{6,20}$/.test(phoneNumber))
    && !duplicate && /^\d+$/.test(openingDebt) && Number.isSafeInteger(debt);
  return <CustomerFrame screen="057"
    fields={<form id="customer-057" className="stock-036-filters customer-form" onSubmit={event => {
      event.preventDefault();
      if (!valid) return;
      const customer = addCustomer({ name: name.trim(), phone: phoneNumber || '—',
        address: address.trim() || undefined, note: note.trim() || undefined, balanceDebt: debt });
      open('058', customer.id);
    }}>
      <label>ناوی کڕیار<input value={name} maxLength={120} onChange={event => setName(event.target.value)} required /></label>
      <label>ناسنامە<input readOnly value="خۆکار" /></label>
      <label>مۆبایل<input type="tel" dir="ltr" value={phone} maxLength={30} onChange={event => setPhone(event.target.value)} /></label>
      <label>شوێن<input value={address} maxLength={160} onChange={event => setAddress(event.target.value)} /></label>
      <label>باقی قەرزی سەرەتایی<input dir="ltr" inputMode="numeric" value={openingDebt}
        onChange={event => setOpeningDebt(event.target.value)} required /></label>
      <label>تێبینی<input value={note} maxLength={160} onChange={event => setNote(event.target.value)} /></label>
    </form>}
    metrics={[[ 'ناوی کڕیار', name.trim() || '—'], ['ناسنامەی نوێ', 'خۆکار'], ['تۆمارکردن', 'ڕەشنووس']]}
    actions={<>
      <button className="stock-036-primary" type="submit" form="customer-057" disabled={!valid}>تۆمارکردنی کڕیار</button>
      <button type="button" onClick={() => open('056')}>هەڵوەشاندنەوە</button>
    </>}
    notice={duplicate ? 'ئەم ژمارەی مۆبایلە پێشتر تۆمار کراوە.' : 'مۆبایل و شوێن ئارەزوومەندانەن.'}
  />;
}

function CustomerRepayment({ initialId, open }: { initialId: string; open: (screen: Screen, customerId?: string) => void }) {
  const { customers, currentShift, recordDebtRepayment } = useApp();
  const [id, setId] = useState(initialId);
  const [amount, setAmount] = useState('');
  const [recorded, setRecorded] = useState<AuditLogEntry | null>(null);
  const [error, setError] = useState(false);
  const customer = customers.find(item => item.id === id);
  const paid = recorded?.customerRepayment;
  const balance = customer?.balanceDebt ?? 0;
  const value = Number(amount);
  const valid = !!customer && /^\d+$/.test(amount) && Number.isSafeInteger(value) && value > 0
    && value <= balance && currentShift.status === 'open' && !paid;
  return <CustomerFrame screen="060"
    fields={<form id="customer-060" className="stock-036-filters customer-form" onSubmit={event => {
      event.preventDefault();
      if (!valid || !customer) return;
      const entry = recordDebtRepayment(id, value);
      setError(!entry);
      if (!entry) return;
      setRecorded(entry);
      KurdishVoiceAnnouncer.announceDebtRepaid(customer.name, value);
    }}>
      <CustomerSelect customers={customers.filter(item => item.balanceDebt > 0 || item.id === id)}
        value={id} onChange={next => { setId(next); setAmount(''); setRecorded(null); setError(false); }} />
      <label>ناسنامەی وەرگرتن<input readOnly value={recorded?.id ?? 'خۆکار'} /></label>
      <label>بڕی پارەی وەرگیراو<input dir="ltr" inputMode="numeric" value={amount} readOnly={!!paid}
        onChange={event => { setAmount(event.target.value); setError(false); }} required /></label>
      <label>شێوازی پارەدان<input readOnly value="نەختینە" /></label>
      <label>بەروار<input readOnly value={recorded ? formatDateTime(recorded.timestamp) : 'لە کاتی تۆمارکردن'} /></label>
    </form>}
    metrics={[
      ['باقی قەرزی پێش وەرگرتن', currency(paid ? paid.remaining + paid.amount : balance)],
      ['پارەی وەرگیراو', currency(paid?.amount ?? (valid ? value : 0))],
      ['باقی دوای پارەدان', currency(paid?.remaining ?? (valid ? balance - value : balance))],
    ]}
    actions={<>
      <button type="submit" form="customer-060" className="stock-036-primary" disabled={!valid}>پشتڕاستکردنەوەی وەرگرتن</button>
      <button type="button" disabled={!paid} onClick={() => window.print()}>چاپکردنی پسووڵە</button>
      {paid && <button className="stock-workflow-link" type="button" onClick={() => { setRecorded(null); setAmount(''); }}>وەرگرتنی نوێ</button>}
      <button className="stock-workflow-link" type="button" onClick={() => open('058', id)}>کەشفی حساب</button>
    </>}
    notice={paid ? 'پارەکە لە سندووق و حسابی کڕیار تۆمار کرا.'
      : error || currentShift.status !== 'open' ? 'بۆ تۆمارکردن دۆخی شیفت و قەرزەکە بپشکنە.'
      : value > balance ? 'بڕی وەرگرتن لە باقی قەرز زیاترە.' : 'بڕی وەرگرتن بنووسە.'}>
    {recorded && paid && createPortal(<section className="canva-customer-print" dir="rtl">
      <h1>سوپەرمارکێتی کانی چنار</h1><h2>پسووڵەی وەرگرتنەوەی قەرز</h2>
      <p>{customer?.name}</p><p><bdi>{recorded.id}</bdi> · <bdi>{formatDateTime(recorded.timestamp)}</bdi></p>
      <p>پارەی وەرگیراو {currency(paid.amount)}</p><p>باقی قەرز {currency(paid.remaining)}</p>
    </section>, document.body)}
  </CustomerFrame>;
}

type Transaction = { id: string; timestamp: string; amount: number; kind: 'debt' | 'cash' | 'repayment'; remaining?: number; receipt?: Receipt };
const kinds = { debt: 'کڕینی قەرز', cash: 'کڕینی نەختینە', repayment: 'وەرگرتنەوە' };

function CustomerHistory({ screen, initialId, open }: {
  screen: '058' | '061'; initialId: string; open: (screen: Screen, customerId?: string) => void;
}) {
  const { customers, receipts, auditLogs, setActiveReceiptForModal } = useApp();
  const [id, setId] = useState(initialId);
  const [period, setPeriod] = useState('all');
  const [kind, setKind] = useState('all');
  const [search, setSearch] = useState('');
  const statement = screen === '058';
  const customer = customers.find(item => item.id === id);
  const query = search.trim().toLowerCase();
  const sales: Transaction[] = receipts.filter(receipt => (!id || receipt.customerId === id)
    && (!statement || (!!id && receipt.paymentMethod === 'debt'))).map(receipt => ({
    id: receipt.receiptNumber, timestamp: receipt.createdAt, amount: receipt.total,
    kind: receipt.paymentMethod, receipt,
  }));
  const payments: Transaction[] = auditLogs.flatMap(entry => {
    const payment = entry.customerRepayment;
    if (!payment || (statement && !id) || (id && id !== payment.customerId)
      || !Number.isFinite(payment.amount) || payment.amount <= 0) return [];
    return [{ id: entry.id, timestamp: entry.timestamp, amount: payment.amount,
      kind: 'repayment' as const, remaining: payment.remaining }];
  });
  const priorPayments = !statement && !id ? auditLogs.filter(entry =>
    entry.action === 'دانەوەی قەرز' && !entry.customerRepayment
    && (period === 'all' || Date.parse(entry.timestamp) >= Date.now() - Number(period) * 86_400_000)
    && (!query || [entry.id, entry.details].some(value => value.toLowerCase().includes(query)))) : [];
  const visiblePriorPayments = kind === 'all' || kind === 'repayment' ? priorPayments : [];
  const rows = [...sales, ...payments].filter(row => (kind === 'all' || kind === row.kind)
    && (period === 'all' || Date.parse(row.timestamp) >= Date.now() - Number(period) * 86_400_000)
    && (!query || [row.id, row.receipt?.customerName ?? '', ...(row.receipt?.items.map(item => item.name) ?? [])]
      .some(value => value.toLowerCase().includes(query))))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return <CustomerFrame screen={screen}
    fields={<div className="stock-workflow-filters">
      <div className="stock-036-filters customer-history-fields">
        <CustomerSelect customers={customers} value={id} onChange={setId} all={!statement} />
        <label>ماوەی کات<select aria-label="ماوەی کات" value={period} onChange={event => setPeriod(event.target.value)}>
          <option value="all">هەموو بەروارەکان</option><option value="7">7 ڕۆژ</option><option value="30">30 ڕۆژ</option>
        </select></label>
      </div>
      {!statement && <label>گەڕان<input type="search" value={search} onChange={event => setSearch(event.target.value)}
        placeholder="پسووڵە، کڕیار یان کاڵا" /></label>}
      {!statement && <div className="stock-workflow-tabs">
        {[['all', 'هەموو'], ...Object.entries(kinds)].map(([key, label]) =>
          <button type="button" key={key} aria-pressed={kind === key} onClick={() => setKind(key)}>{label}</button>)}
      </div>}
    </div>}
    metrics={[
      ['کۆی قەرزی نوێی پیشاندراو', currency(rows.reduce((sum, row) => sum + (row.kind === 'debt' ? row.amount : 0), 0))],
      ['کۆی پارەی وەرگیراوی پیشاندراو', currency(rows.reduce((sum, row) => sum + (row.kind === 'repayment' ? row.amount : 0), 0))],
      [statement ? 'باقی قەرزی ئێستا' : 'ژمارەی مامەڵەکان', statement ? (customer ? currency(customer.balanceDebt) : '—') : rows.length + visiblePriorPayments.length],
    ]}
    actions={statement ? <>
      <button className="stock-036-primary" type="button" onClick={() => open('061', id)}>بینینی مێژووی مامەڵە</button>
      <button type="button" disabled={!customer} onClick={() => window.print()}>چاپکردنی کەشفی حساب</button>
      <button className="stock-workflow-link" type="button" disabled={!customer?.balanceDebt} onClick={() => open('060', id)}>وەرگرتنەوەی قەرز</button>
    </> : <button className="stock-036-primary" type="button" onClick={() => open('056')}>گەڕانەوە بۆ کڕیاران</button>}
    notice="کڕین و تۆمارە بەردەستەکانی وەرگرتنەوە پیشان دەدرێن.">
    <CanvaStockTable columns={['مامەڵە', 'بەروار', 'جۆر', 'بڕ', 'باقی لە کاتی مامەڵە']}>
      {rows.map(row => <tr key={row.id}>
        <td>{row.receipt ? <button type="button" className="stock-036-product"
          onClick={() => setActiveReceiptForModal(row.receipt ?? null)}><bdi>{row.id}</bdi></button> : <bdi>{row.id}</bdi>}</td>
        <td><bdi>{formatDateTime(row.timestamp)}</bdi></td><td>{kinds[row.kind]}</td><td>{currency(row.amount)}</td>
        <td>{row.remaining === undefined ? '—' : currency(row.remaining)}</td>
      </tr>)}
      {visiblePriorPayments.map(entry => <tr key={entry.id}>
        <td>{entry.details}</td><td><bdi>{formatDateTime(entry.timestamp)}</bdi></td>
        <td>تۆماری پێشووی وەرگرتنەوە</td><td>—</td><td>—</td>
      </tr>)}
      {!rows.length && !visiblePriorPayments.length && noRows}
    </CanvaStockTable>
    {statement && customer && createPortal(<section className="canva-customer-print" dir="rtl">
      <h1>سوپەرمارکێتی کانی چنار</h1><h2>کەشفی حسابی قەرز · {customer.name}</h2>
      <p>باقی قەرزی ئێستا {currency(customer.balanceDebt)}</p>
      <table><thead><tr><th>ناسنامە</th><th>بەروار</th><th>جۆر</th><th>بڕ</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td><bdi>{row.id}</bdi></td><td>{formatDateTime(row.timestamp)}</td>
          <td>{kinds[row.kind]}</td><td>{currency(row.amount)}</td></tr>)}</tbody>
      </table>
      <p>تۆمارە بەردەستەکان بەپێی پاڵاوتنی هەڵبژێردراو</p>
    </section>, document.body)}
  </CustomerFrame>;
}

const customerRoutes = {
  '056': ['list', 'single-customer'],
  '057': ['register', 'single-customer'],
  '058': ['debts', 'debt-book'],
  '060': ['repayment', 'customer-repayment'],
  '061': ['history', 'purchase-history'],
} as const;

export function CanvaCustomerWorkspace() {
  const { activeSectionId, subtab, navigateTo } = useApp();
  const [mode, customerId = ''] = subtab.split(':', 2);
  const screen = mode === 'register' ? '057'
    : mode === 'debts' || activeSectionId === 'debt-book' ? '058'
    : mode === 'repayment' || activeSectionId === 'customer-repayment' ? '060'
    : mode === 'history' || activeSectionId === 'purchase-history' ? '061' : '056';
  function open(next: Screen, id = '') {
    const [tab, section] = customerRoutes[next];
    navigateTo('customers', id ? tab + ':' + id : tab, section);
  }
  switch (screen) {
    case '056': return <CustomerDirectory open={open} />;
    case '057': return <CustomerRegistration open={open} />;
    case '060': return <CustomerRepayment key={subtab} initialId={customerId} open={open} />;
    default: return <CustomerHistory key={subtab} screen={screen} initialId={customerId} open={open} />;
  }
}
