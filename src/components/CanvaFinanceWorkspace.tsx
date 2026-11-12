import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import type { Receipt } from '../types';
import { formatDateTime, money } from '../utils/retailHelpers';
import { KurdishVoiceAnnouncer } from '../utils/kurdishVoiceEngine';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';
import './canvaFinanceWorkspace.css';

type Screen = '066' | '067' | '068' | '069' | '070' | '071';
type Action = (screen: Screen) => void;
const routes: Record<Screen, [tab: string, section: string, title: string, summary: string]> = {
  '066': ['drawer', 'cash-drawer', 'پوختەی سندووق و دارایی', 'پوختەی شێفت'],
  '067': ['shifts', 'shift-clock', 'کردنەوە و داخستنی شێفتی کاشێر', 'پوختەی شێفت'],
  '068': ['movements', 'cash-movements', 'جووڵەی پارەی سندووق', 'تۆمارکردنی جووڵە'],
  '069': ['expenses', 'expense-fall', 'تۆمارکردنی خەرجی و داهاتی تر', 'پوختەی کردار'],
  '070': ['reconcile', 'shift-clock', 'هاوتاکردنەوەی سندووق و ژماردنی پارە', 'پوختەی داخستن'],
  '071': ['income', 'income-rise', 'مێژووی خەرجی و داهات', 'پوختەی جووڵەکان'],
};

function FinanceFrame({ screen, fields, children, totals, actions, notice }: {
  screen: Screen;
  fields?: ReactNode;
  children?: ReactNode;
  totals: [string, ReactNode][];
  actions: ReactNode;
  notice?: ReactNode;
}) {
  const { navigateTo } = useApp();
  const [, , title, summary] = routes[screen];
  return <div className="ws-stack stock-036-shell canva-finance-shell">
    <CanvaStockFrame number={screen} title={title} listTitle={title} summaryTitle={summary}
      category="سندووق و دارایی" onHome={() => navigateTo('home')} filters={fields}
      summary={<dl>{totals.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      actions={actions} note={<span role="status">{notice}</span>}>
      {children}
    </CanvaStockFrame>
  </div>;
}

const iq = (value: number) => <bdi>{money(value)}</bdi>;
const amountOf = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const empty = (columns: number) => <tr><td colSpan={columns}>هیچ تۆمارێک نەدۆزرایەوە</td></tr>;
const categories = ['خەرجی ڕۆژانە', 'میوانداری', 'کرێ و خزمەتگوزاری', 'چاککردنەوە', 'حیساباتی دابینکەران'];

function FinanceOverview({ open }: { open: Action }) {
  const { currentShift: shift } = useApp();
  const rows: [string, string, number][] = [
    ['سندووق', 'پارەی سەرەتایی', shift.openingFloat],
    ['کاشێر', 'پارەی نەختینەی وەرگیراو', shift.cashSales],
    ['کاشێر', 'فرۆشتنی قەرز', shift.debtSales],
    ['دارایی', 'خەرجی', shift.expenses],
    ['کاشێر', 'پارەی گەڕاوە', shift.cashReturns ?? 0],
  ];
  const status = shift.status === 'open' ? 'کراوە' : 'داخراوە';
  return <FinanceFrame screen="066"
    fields={<div className="stock-036-filters finance-fields">
      <label>ماوەی ڕاپۆرت<input readOnly value="شێفتی ئێستا" /></label>
      <label>کاشێر<input readOnly value={shift.cashierName} /></label>
    </div>}
    totals={[
      ['باقی سندووق', iq(shift.expectedCash)],
      ['پارەی هاتوو بە جگە لە سەرەتایی', iq(shift.cashSales)],
      ['کۆی پارەی چوو', iq(shift.expenses + (shift.cashReturns ?? 0))],
    ]}
    actions={<>
      <button className="stock-036-primary" type="button" onClick={() => open('068')}>بینینی جووڵەی سندووق</button>
      <button type="button" onClick={() => open('067')}>بەڕێوەبردنی شێفت</button>
    </>}
    notice="پوختەکە لەسەر شێفتی ئێستایە. فرۆشتنی قەرز بە پارەی هاتووی سندووق هەژمار ناکرێت.">
    <CanvaStockTable columns={['بەش', 'جۆری مامەڵە', 'بڕی پارە', 'دۆخ']}>
      {rows.map(([section, label, value]) => <tr key={label}>
        <td>{section}</td><td>{label}</td><td>{iq(value)}</td><td>{status}</td>
      </tr>)}
    </CanvaStockTable>
  </FinanceFrame>;
}

function FinanceShift({ screen, open }: { screen: '067' | '070'; open: Action }) {
  const { currentShift: shift, openNewShift, closeShift } = useApp();
  const reconcile = screen === '070';
  const active = shift.status === 'open';
  const [cashier, setCashier] = useState(shift.cashierName);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = amountOf(amount);
  const difference = value === null ? null : value - shift.expectedCash;
  const canClose = active && difference !== null && (difference === 0 || !!note.trim());
  const canOpen = !active && !!cashier.trim() && value !== null;
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value === null) return;
    if (reconcile && canClose) {
      closeShift(value, note.trim());
      KurdishVoiceAnnouncer.announceShiftClosed(value);
    } else if (!reconcile && canOpen) {
      openNewShift(cashier.trim(), value, note.trim());
      KurdishVoiceAnnouncer.announceShiftOpened(cashier.trim());
    } else {
      return;
    }
    setAmount('');
    setNote('');
  }
  return <FinanceFrame screen={screen}
    fields={<form id="canva-finance-shift" className="stock-036-filters finance-fields" onSubmit={submit}>
      <label>کاشێر<input value={active || reconcile ? shift.cashierName : cashier}
        readOnly={active || reconcile} maxLength={120} onChange={event => setCashier(event.target.value)} /></label>
      <label>ژمارەی شێفت<input readOnly value={!active && !reconcile ? 'بە شێوەی خۆکار' : shift.id} /></label>
      {reconcile ? <>
        <label>پارەی چاوەڕوانکراو<input readOnly value={money(shift.expectedCash)} /></label>
        <label>پارەی ژمێردراو<input dir="ltr" inputMode="numeric" required readOnly={!active}
          value={active ? amount : String(shift.actualCash ?? '')} onChange={event => setAmount(event.target.value)} /></label>
      </> : <>
        <label>پارەی سەرەتایی<input dir="ltr" inputMode="numeric" required readOnly={active}
          value={active ? String(shift.openingFloat) : amount} onChange={event => setAmount(event.target.value)} /></label>
        <label>کاتی کردنەوە<input readOnly value={active ? formatDateTime(shift.openedAt) : 'لە کاتی تۆمارکردن'} /></label>
      </>}
      <label className="finance-full-field">{reconcile ? 'هۆکاری جیاوازی' : 'تێبینی شێفت'}
        <input maxLength={160} readOnly={reconcile ? !active : active}
          value={reconcile && !active ? shift.closeReason ?? '' : !reconcile && active ? shift.openNote ?? '' : note}
          onChange={event => setNote(event.target.value)} />
      </label>
    </form>}
    totals={reconcile ? [
      ['پارەی چاوەڕوانکراو', iq(shift.expectedCash)],
      ['جیاوازی حساب', (active ? difference : shift.discrepancy) === null ? '—' : iq((active ? difference : shift.discrepancy) ?? 0)],
      ['دۆخی هاوتاکردنەوە', active ? 'چاوەڕوانی ژماردن' : 'داخراوە'],
    ] : [
      ['دۆخی شێفت', active ? 'کراوە' : 'داخراوە'],
      ['پارەی سەرەتایی', iq(shift.openingFloat)],
      ['پارەی چاوەڕوانکراو', iq(shift.expectedCash)],
    ]}
    actions={reconcile ? <>
      {active
        ? <button className="stock-036-primary" form="canva-finance-shift" type="submit" disabled={!canClose}>پشتڕاستکردنەوەی داخستن</button>
        : <button className="stock-036-primary" type="button" disabled={shift.actualCash === null} onClick={() => window.print()}>چاپی ڕاپۆرتی کۆتایی شێفت</button>}
      <button type="button" onClick={() => open('067')}>گەڕانەوە بۆ شێفت</button>
    </> : <>
      {!active && <button className="stock-036-primary" form="canva-finance-shift" type="submit" disabled={!canOpen}>کردنەوەی شێفت</button>}
      <button className={active ? 'stock-036-primary' : undefined} type="button" onClick={() => open('070')}>پشکنینی داخستنی شێفت</button>
      <button type="button" onClick={() => open('066')}>پوختەی سندووق</button>
    </>}
    notice={reconcile && active && difference !== null && difference !== 0 && !note.trim()
      ? 'هۆکاری جیاوازی بنووسە پێش داخستن.' : 'تۆماری شێفت لە داتای تاقیکردنەوەی ئەپەکە پاشەکەوت دەکرێت.'}>
    {reconcile && !active && shift.actualCash !== null && createPortal(<section className="canva-finance-print" dir="rtl">
      <h1>سوپەرمارکێتی کانی چنار</h1><h2>ڕاپۆرتی کۆتایی شێفت</h2>
      <p>{shift.cashierName} · <bdi>{shift.id}</bdi></p>
      <p>کاتی داخستن <bdi>{formatDateTime(shift.closedAt ?? '')}</bdi></p>
      <p>پارەی چاوەڕوانکراو {iq(shift.expectedCash)}</p><p>پارەی ژمێردراو {iq(shift.actualCash)}</p>
      <p>جیاوازی {iq(shift.discrepancy ?? 0)}</p><p>{shift.closeReason}</p>
    </section>, document.body)}
  </FinanceFrame>;
}

function FinanceExpense({ open }: { open: Action }) {
  const { currentShift: shift, recordExpense, expenses } = useApp();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [note, setNote] = useState('');
  const [review, setReview] = useState('');
  const [recorded, setRecorded] = useState(false);
  const value = amountOf(amount);
  const valid = shift.status === 'open' && !!title.trim() && value !== null && value > 0 && value <= shift.expectedCash;
  const draft = JSON.stringify([shift.id, shift.expectedCash, title, amount, category, note]);
  const preview = review === draft;
  const today = new Date().toDateString();
  const dailyExpenses = expenses.filter(item => new Date(item.createdAt).toDateString() === today)
    .reduce((sum, item) => sum + item.amount, 0);
  return <FinanceFrame screen="069"
    fields={<form id="canva-finance-expense" className="stock-036-filters finance-fields" onChange={() => setRecorded(false)}
      onSubmit={event => {
        event.preventDefault();
        if (!valid || value === null) return;
        if (!preview) { setReview(draft); return; }
        if (!recordExpense(title.trim(), value, category, note.trim())) return;
        KurdishVoiceAnnouncer.announceExpenseAdded(value);
        setReview(''); setTitle(''); setAmount(''); setNote(''); setRecorded(true);
      }}>
      <label>جۆری کردار<input readOnly value="خەرجی" /></label>
      <label>پۆلی خەرجی<select aria-label="پۆلی خەرجی" value={category} onChange={event => setCategory(event.target.value)}>
        {categories.map(item => <option key={item}>{item}</option>)}
      </select></label>
      <label>بڕی پارە<input dir="ltr" inputMode="numeric" value={amount} required onChange={event => setAmount(event.target.value)} /></label>
      <label>شێوازی پارەدان<input readOnly value="نەختینە" /></label>
      <label>ناونیشانی خەرجی<input value={title} maxLength={120} required onChange={event => setTitle(event.target.value)} /></label>
      <label>تێبینی<input value={note} maxLength={160} onChange={event => setNote(event.target.value)} /></label>
    </form>}
    totals={[
      ['خەرجیی ئەمڕۆ', iq(dailyExpenses)],
      ['باقی سندووق دوای خەرجی', valid && value !== null ? iq(shift.expectedCash - value) : '—'],
      ['دۆخی تۆمارکردن', recorded ? 'تۆمارکرا' : preview ? 'ئامادەی پشتڕاستکردنەوە' : 'ئامادەی پشکنین'],
    ]}
    actions={<>
      <button className="stock-036-primary" form="canva-finance-expense" type="submit" disabled={!valid}>
        {preview ? 'پشتڕاستکردنەوەی تۆمارکردن' : 'پێشبینینی تۆمارکردن'}
      </button>
      <button type="button" onClick={() => open('071')}>بینینی مێژوو</button>
    </>}
    notice={recorded ? 'خەرجی تۆمار کرا.' : 'تۆمارکردنی خەرجی باقی سندووق دەگۆڕێت. داهاتی تر لە ئەم شاشەیە تۆمار ناکرێت.'}
  />;
}

type FinanceRow = { id: string; date: string; type: 'opening' | 'cash' | 'debt' | 'expense' | 'repayment' | 'refund';
  label: string; amount: number; actor?: string; receipt?: Receipt };
const typeNames: Record<FinanceRow['type'], string> = {
  opening: 'پارەی سەرەتایی', cash: 'فرۆشتنی نەختینە', debt: 'فرۆشتنی قەرز',
  expense: 'خەرجی', repayment: 'وەرگرتنەوەی قەرز', refund: 'پارەی گەڕاوە',
};
const isOut = (row: FinanceRow) => row.type === 'expense' || row.type === 'refund';

function FinanceHistory({ screen, open }: { screen: '068' | '071'; open: Action }) {
  const { currentShift: shift, receipts, expenses, demoRefunds, auditLogs, setActiveReceiptForModal } = useApp();
  const movement = screen === '068';
  const [period, setPeriod] = useState('all');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const rows: FinanceRow[] = [
    ...(movement ? [{ id: shift.id, date: shift.openedAt, type: 'opening' as const,
      label: typeNames.opening, amount: shift.openingFloat, actor: shift.cashierName }] : []),
    ...receipts.filter(receipt => !movement || receipt.paymentMethod === 'cash').map(receipt => ({
      id: receipt.receiptNumber, date: receipt.createdAt, type: receipt.paymentMethod, label: receipt.customerName,
      amount: receipt.total, actor: receipt.cashierName, receipt,
    })),
    ...expenses.map(item => ({ id: item.id, date: item.createdAt, type: 'expense' as const,
      label: item.title + ' · ' + item.category, amount: item.amount })),
    ...auditLogs.flatMap(entry => entry.customerRepayment && Number.isFinite(entry.customerRepayment.amount)
      ? [{ id: entry.id, date: entry.timestamp, type: 'repayment' as const,
        label: typeNames.repayment, amount: entry.customerRepayment.amount, actor: entry.user }] : []),
    ...demoRefunds.filter(item => item.refundMethod === 'cash').map(item => ({
      id: item.id, date: item.createdAt, type: 'refund' as const, label: item.receiptNo, amount: item.refundAmount,
    })),
  ];
  const term = search.trim().toLowerCase();
  const visible = rows.filter(row => (filter === 'all' || (filter === 'in' ? !isOut(row) && row.type !== 'debt'
    : filter === 'out' ? isOut(row) : row.type === filter))
    && (period === 'all' || Date.parse(row.date) >= Date.now() - Number(period) * 86_400_000)
    && (!term || [row.id, row.label, row.actor ?? ''].some(text => text.toLowerCase().includes(term))))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const incoming = visible.reduce((sum, row) => sum + (!isOut(row) && row.type !== 'debt' ? row.amount : 0), 0);
  const outgoing = visible.reduce((sum, row) => sum + (isOut(row) ? row.amount : 0), 0);
  const filters = movement ? [['all', 'هەموو'], ['in', 'پارەی هاتوو'], ['out', 'پارەی چوو']]
    : [['all', 'هەموو'], ['expense', 'خەرجی'], ['cash', 'فرۆشتنی نەختینە'], ['debt', 'فرۆشتنی قەرز']];
  return <FinanceFrame screen={screen}
    fields={<div className="stock-workflow-filters">
      <div className="stock-036-filters finance-fields">
        <label>ماوەی کات<select aria-label="ماوەی کات" value={period} onChange={event => setPeriod(event.target.value)}>
          <option value="all">هەموو بەروارەکان</option><option value="7">7 ڕۆژ</option><option value="30">30 ڕۆژ</option>
        </select></label>
        <label>گەڕان<input type="search" placeholder="ناسنامە، کڕیار یان هۆکار" value={search} onChange={event => setSearch(event.target.value)} /></label>
      </div>
      <div className="stock-workflow-tabs">{filters.map(([key, label]) =>
        <button type="button" key={key} aria-pressed={key === filter} onClick={() => setFilter(key)}>{label}</button>)}</div>
    </div>}
    totals={[[ 'پارەی هاتووی پیشاندراو', iq(incoming)], ['پارەی چووی پیشاندراو', iq(outgoing)],
      [movement ? 'باقی سندووقی ئێستا' : 'جیاوازیی پارەی پیشاندراو', iq(movement ? shift.expectedCash : incoming - outgoing)]]}
    actions={<>
      <button className="stock-036-primary" type="button" onClick={() => open(movement ? '069' : '068')}>
        {movement ? 'تۆمارکردنی خەرجی' : 'بینینی جووڵەی سندووق'}
      </button>
      <button type="button" onClick={() => open('066')}>پوختەی سندووق</button>
    </>}
    notice="پوختەی پارەی هاتوو و چوو بەپێی تۆمارە بەردەستەکان و پاڵاوتنەکان هەژمار دەکرێت.">
    <CanvaStockTable columns={['ژمارە', 'بەروار', 'جۆر و هۆکار', 'بڕ', 'کاشێر']}>
      {visible.map(row => <tr key={row.type + ':' + row.id}>
        <td>{row.receipt ? <button type="button" className="stock-036-product"
          onClick={() => setActiveReceiptForModal(row.receipt ?? null)}><bdi>{row.id}</bdi></button> : <bdi>{row.id}</bdi>}</td>
        <td><bdi>{formatDateTime(row.date)}</bdi></td>
        <td>{typeNames[row.type]}{row.label && row.label !== typeNames[row.type] ? ' · ' + row.label : ''}</td>
        <td>{iq(isOut(row) ? -row.amount : row.amount)}</td><td>{row.actor ?? '—'}</td>
      </tr>)}
      {!visible.length && empty(5)}
    </CanvaStockTable>
  </FinanceFrame>;
}

export function CanvaFinanceWorkspace() {
  const { activeSectionId, subtab, navigateTo } = useApp();
  function open(next: Screen) {
    const [tab, section] = routes[next];
    navigateTo('shifts', tab, section);
  }
  if (subtab === 'reconcile') return <FinanceShift key="070" screen="070" open={open} />;
  if (activeSectionId === 'shift-clock' || subtab === 'shifts') return <FinanceShift key="067" screen="067" open={open} />;
  if (activeSectionId === 'cash-movements' || subtab === 'movements') return <FinanceHistory key="068" screen="068" open={open} />;
  if (activeSectionId === 'expense-fall' || subtab === 'expenses') return <FinanceExpense open={open} />;
  if (activeSectionId === 'income-rise' || subtab === 'income') return <FinanceHistory key="071" screen="071" open={open} />;
  return <FinanceOverview open={open} />;
}
