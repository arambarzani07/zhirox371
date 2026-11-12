import { useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';
import {
  canSubmitCustomerDebt059, checkCustomerDebt059,
  readCustomerDebtDraft059, type CustomerDebtDraft059,
} from '../utils/customerDebtDraft059';
import { CanvaStockFrame } from './CanvaStockFrame';
import './canvaCustomerDebt059.css';

const storageKey = 'zhirox371_canva059_local_customer_debt_draft_session';
const displayMoney = (amount: number | null) =>
  amount === null ? '—' : money(amount);

/** Canva 059 draft entry. An unsubmitted browser-tab note is NOT a customer
 * balance change, real credit, cashier approval or booked ledger entry.
 */
export function CanvaCustomerDebt059({ initialId }: { initialId: string }) {
  const { customers, navigateTo } = useApp();
  const [restored] = useState<CustomerDebtDraft059 | null>(() => {
    try { return readCustomerDebtDraft059(sessionStorage.getItem(storageKey), customers); }
    catch { return null; }
  });
  const selectedDraft = restored && (!initialId || restored.customerId === initialId)
    ? restored : null;
  const [customerId, setCustomerId] = useState(initialId || selectedDraft?.customerId || '');
  const [amount, setAmount] = useState(selectedDraft ? String(selectedDraft.amountIqd) : '');
  const [reference, setReference] = useState(selectedDraft?.reference || '');
  const [note, setNote] = useState(selectedDraft?.note || '');
  const [saved, setSaved] = useState<CustomerDebtDraft059 | null>(selectedDraft);
  const [notice, setNotice] = useState('');
  const customer = customers.find(row => row.id === customerId);
  const checked = checkCustomerDebt059(customer, amount, reference, note);
  const oldBalance = checked.currentBalanceIqd;
  const previewBalance = checked.valid ? checked.previewBalanceIqd : null;
  const overLimit = checked.valid && checked.exceedsKnownLimit;
  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = customers.find(row => row.id === customerId);
    const validation = checkCustomerDebt059(current, amount, reference, note);
    if (!validation.valid || validation.currentBalanceIqd === null ||
      validation.amountIqd === null) {
      setNotice(validation.error || 'ڕەشنووس پاشەکەوت نەکرا');
      return;
    }
    const draft: CustomerDebtDraft059 = {
      draftId: saved?.customerId === customerId
        ? saved.draftId : 'DRAFT-' + crypto.randomUUID(),
      customerId,
      balanceAtSaveIqd: validation.currentBalanceIqd,
      amountIqd: validation.amountIqd,
      reference: reference.trim(),
      note: note.trim(),
      savedAt: new Date().toISOString(),
      status: 'local-demo-draft',
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
      setSaved(draft);
      setNotice('ڕەشنووسی ناوخۆیی پاشەکەوت کرا؛ هیچ قەرزێک زیاد نەکرا و هیچ داواکارییەک نەنێردرا.');
    } catch {
      setNotice('پاشەکەوتکردنی ڕەشنووسی ناوخۆیی سەرکەوتوو نەبوو.');
    }
  };
  const chooseCustomer = (id: string) => {
    setCustomerId(id);
    setAmount('');
    setReference('');
    setNote('');
    setSaved(null);
    setNotice('');
  };
  return <div className="ws-stack stock-036-shell canva-customer-shell customer-debt059-shell"
    data-demo-only="true">
    <CanvaStockFrame number="059" category="کڕیار و قەرز"
      title="زیادکردنی قەرز بۆ کڕیار"
      listTitle="تۆمارکردنی مامەڵەی قەرزی نوێ"
      summaryTitle="پوختەی قەرزی نوێ"
      onHome={() => navigateTo('home')}
      filters={<form id="customer-debt-059" className="stock-036-filters customer-form debt059-fields"
        onSubmit={saveDraft}>
        <label>ناوی کڕیار
          <select value={customerId} aria-label="هەڵبژاردنی کڕیار"
            onChange={event => chooseCustomer(event.target.value)}>
            <option value="">هەڵبژاردنی کڕیار</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.id}</option>)}
          </select>
        </label>
        <label>ناسنامە
          <input aria-label="ناسنامەی مامەڵە" type="text" readOnly
            value={saved?.customerId === customerId
              ? saved.draftId : 'خۆکار ـ ڕەشنووس'} />
        </label>
        <label>بڕی قەرز
          <input aria-label="بڕی قەرز" dir="ltr" inputMode="numeric" type="text"
            value={amount} maxLength={12} placeholder="0 IQD"
            aria-invalid={amount.length > 0 && checked.amountIqd === null}
            onChange={event => { setAmount(event.target.value); setNotice(''); }} />
        </label>
        <label>بەروار
          <input aria-label="بەرواری مامەڵە" type="text" readOnly
            value={saved?.customerId === customerId
              ? saved.savedAt.slice(0, 10) + ' — ڕەشنووس'
              : 'لە کاتی پاشەکەوتکردنی ڕەشنووس'} />
        </label>
        <label>پەیوەندی بە مامەڵە
          <input aria-label="ژمارەی پسووڵە یان هۆکاری قەرز"
            value={reference} maxLength={80}
            placeholder="ژمارەی پسووڵە یان هۆکاری قەرز"
            onChange={event => { setReference(event.target.value); setNotice(''); }} />
        </label>
        <label>وردەکاری
          <input aria-label="تێبینیی مامەڵە"
            value={note} maxLength={160}
            placeholder="تێبینیی مامەڵە ـ ئارەزوومەندانە"
            onChange={event => { setNote(event.target.value); setNotice(''); }} />
        </label>
      </form>}
      summary={<dl>
        <div><dt>باقی قەرزی پێشوو</dt><dd><bdi>{displayMoney(oldBalance)}</bdi></dd></div>
        <div><dt>قەرزی نوێ</dt><dd><bdi>{displayMoney(checked.valid ? checked.amountIqd : null)}</bdi></dd></div>
        <div><dt>باقی دوای تۆمارکردن</dt>
          <dd><bdi>{displayMoney(previewBalance)}</bdi></dd></div>
      </dl>}
      actions={<>
        <button type="button" className="stock-036-primary"
          disabled={!canSubmitCustomerDebt059()}
          title="پێویستی بە مۆڵەتی بەڕێوەبەر و سێرڤەری پشتڕاستکراو هەیە">
          ناردن بۆ پەسەندکردن
        </button>
        <button type="submit" form="customer-debt-059" disabled={!checked.valid}>
          پاشەکەوتکردنی ڕەشنووس
        </button>
        <button type="button" className="stock-workflow-link"
          onClick={() => navigateTo('customers', customerId ? 'debts:' + customerId : 'debts', 'debt-book')}>
          گەڕانەوە بۆ کەشفی حساب
        </button>
      </>}
      note={<span className="debt059-notice">
        <span>بڕی قەرز دەبێت لە سفر زیاتر بێت؛ مامەڵەی تۆمارکراو بە هەمان ناسنامە دووبارە زیاد ناکرێت.</span>
        <span>قەرزی زیاتر لە سنووری ڕێگەپێدراو پێویستی بە پەسەندی بەڕێوەبەر هەیە.</span>
        <span>{overLimit ? 'باقیی نوێ لە سنووری تۆمارکراوی قەرز زیاترە؛ پەسەندی بەڕێوەبەر پێویستە.'
          : checked.valid && !checked.limitKnown
            ? 'سنووری قەرزی کڕیار پشتڕاست نەکراوە؛ ناردنی فەرمی ناچالاکە.'
            : ''}</span>
        <span role="status">{notice || (amount && checked.error ? checked.error
          : 'ئەم شاشەیە تەنها ڕەشنووسی Demo ـە؛ باقی قەرزی ڕاستەقینە ناگۆڕێت.')}</span>
      </span>}
    >{null}</CanvaStockFrame>
  </div>;
}
