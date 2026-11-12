import { useState } from 'react';
import type { ReactNode } from 'react';
import { money } from '../utils/retailHelpers';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';

const amountFields = [
  { key: 'cash', label: 'پارەی نەقد' },
  { key: 'bank', label: 'پارەی بانکی' },
  { key: 'debt', label: 'قەرزی ماوە' },
] as const;

function parseAmount(value: string) {
  const amount = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(amount) ? amount : null;
}

export function CanvaSplitPayment({ total, customerName, onBack, children }: {
  total: number;
  customerName?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState({ cash: '0', bank: '0', debt: '0' });
  const [checked, setChecked] = useState(false);
  const cash = parseAmount(draft.cash);
  const bank = parseAmount(draft.bank);
  const debt = parseAmount(draft.debt);
  const paid = cash !== null && bank !== null && Number.isSafeInteger(cash + bank) ? cash + bank : null;
  const allocated = paid !== null && debt !== null && Number.isSafeInteger(paid + debt) ? paid + debt : null;
  const remaining = allocated === null ? null : total - allocated;
  const valid = total > 0 && remaining === 0 && (debt === 0 || Boolean(customerName));
  const message = total <= 0 ? 'سەبەتە بەتاڵە.' :
    remaining === null ? 'بڕەکان بە ژمارەی تەواوی دینار بنووسە.' :
    remaining > 0 ? 'بەشێک لە کۆی پسووڵە هێشتا دابەش نەکراوە.' :
    remaining < 0 ? 'کۆی بڕەکان لە کۆی پسووڵە زیاترە.' :
    debt && !customerName ? 'بۆ بەشی قەرز، کڕیار لە شاشەی کاشێر هەڵبژێرە.' :
    'کۆی بڕەکان لەگەڵ کۆی پسووڵە یەک دەگرێتەوە.';

  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="009">
      <CanvaWorkspaceHeader title="پارەدانی دابەشکراو و بەشەکی" actions={
        <button type="button" className="secondary" onClick={onBack}>گەڕانەوە بۆ کاشێر</button>
      } />
      {children}
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>پوختەی پارەدان</h2>
          <dl className="canva-detail__summary">
            <div><dt>کۆی پسووڵە</dt><dd><bdi>{money(total)}</bdi></dd></div>
            <div><dt>نەقدی پێشنیارکراو</dt><dd><bdi>{cash === null ? '—' : money(cash)}</bdi></dd></div>
            <div><dt>پارەی بانکیی پێشنیارکراو</dt><dd><bdi>{bank === null ? '—' : money(bank)}</bdi></dd></div>
            <div><dt>قەرزی پێشنیارکراو</dt><dd><bdi>{debt === null ? '—' : money(debt)}</bdi></dd></div>
            <div><dt>{remaining !== null && remaining < 0 ? 'بڕی زیادە' : 'پارەی ماوە'}</dt>
              <dd><bdi>{remaining === null ? '—' : money(Math.abs(remaining))}</bdi></dd></div>
          </dl>
        </section>
        <section className="canva-detail__panel">
          <h2>دابەشکردنی پارەدان</h2>
          <form className="canva-detail" noValidate onSubmit={event => {
            event.preventDefault();
            setChecked(true);
          }}>
            {amountFields.map(({ key, label }) => (
              <label className="form-col" key={key}>{label}
                <input type="text" inputMode="numeric" value={draft[key]} onChange={event => {
                  setDraft({ ...draft, [key]: event.target.value });
                  setChecked(false);
                }} />
              </label>
            ))}
            <dl className="canva-detail__summary">
              <div><dt>پارەی بەشەکی</dt><dd><bdi>{paid === null ? '—' : money(paid)}</bdi></dd></div>
              <div><dt>کڕیار</dt><dd>{customerName || 'کڕیاری ئاسایی'}</dd></div>
            </dl>
            <div className="canva-detail__actions">
              <button type="submit" className="primary">پشکنینی بڕەکان</button>
            </div>
            <p>پێشبینینی پارەدانە. بڕەکان لەم شاشەیەدا تۆمار ناکرێن.</p>
            {checked && <p role={valid ? 'status' : 'alert'}>{message}</p>}
          </form>
        </section>
      </div>
    </section>
  );
}
