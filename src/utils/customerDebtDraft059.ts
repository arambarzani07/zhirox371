import type { Customer } from '../types';

/** Canva 059 deals exclusively with a tab-local, UNSUBMITTED debt draft.
 * It does not credit a customer, alter an accounting ledger, authorize the
 * cashier, send an approval request, or invent an official transaction ID.
 */
export interface CustomerDebtDraft059 {
  draftId: string;
  customerId: string;
  balanceAtSaveIqd: number;
  amountIqd: number;
  reference: string;
  note: string;
  savedAt: string;
  status: 'local-demo-draft';
}

export interface CustomerDebtCheck059 {
  valid: boolean;
  error: string;
  amountIqd: number | null;
  currentBalanceIqd: number | null;
  previewBalanceIqd: number | null;
  exceedsKnownLimit: boolean;
  limitKnown: boolean;
}

export const parseCustomerDebtAmount059 = (raw: string): number | null => {
  if (!/^[1-9][0-9]{0,11}$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value > 0 && value <= 1000000000
    ? value : null;
};

const safeText059 = (s: string, max: number): boolean =>
  s.length <= max && !/[\u0000-\u001f\u007f]/.test(s);

export const checkCustomerDebt059 = (
  customer: Customer | undefined,
  amountRaw: string,
  referenceRaw: string,
  noteRaw: string,
): CustomerDebtCheck059 => {
  const amountIqd = parseCustomerDebtAmount059(amountRaw);
  const currentBalanceIqd = customer && Number.isSafeInteger(customer.balanceDebt)
    && customer.balanceDebt >= 0 ? customer.balanceDebt : null;
  const previewBalanceIqd = amountIqd !== null && currentBalanceIqd !== null
    && Number.isSafeInteger(currentBalanceIqd + amountIqd)
    ? currentBalanceIqd + amountIqd : null;
  const limitKnown = !!customer && typeof customer.creditLimit === 'number'
    && Number.isSafeInteger(customer.creditLimit) && customer.creditLimit >= 0;
  const exceedsKnownLimit = limitKnown && previewBalanceIqd !== null &&
    previewBalanceIqd > customer!.creditLimit!;
  const reference = referenceRaw.trim();
  const note = noteRaw.trim();
  const error = !customer ? 'کڕیارێکی تۆمارکراو هەڵبژێرە'
    : currentBalanceIqd === null ? 'باقی قەرزی کڕیار پشتڕاست نەکراوە'
    : amountIqd === null ? 'بڕی قەرز دەبێت ژمارەی تەواوی IQD، گەورەتر لە سفر و تا 1,000,000,000 بێت'
    : previewBalanceIqd === null ? 'کۆی قەرز لە سنووری ژمارەی پارێزراو زیاترە'
    : !reference || reference.length > 80 || !safeText059(reference, 80)
      ? 'ژمارەی پسووڵە یان هۆکاری قەرز بە دروستی بنووسە (تا 80 پیت)'
    : !safeText059(note, 160)
      ? 'تێبینی دەبێت لە 160 پیت کەمتر بێت' : '';
  return {valid: !error, error, amountIqd,
    currentBalanceIqd, previewBalanceIqd, exceedsKnownLimit, limitKnown};
};

export const readCustomerDebtDraft059 = (
  raw: string | null, customers: readonly Customer[],
): CustomerDebtDraft059 | null => {
  if (!raw || raw.length > 5000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (row.status !== 'local-demo-draft'
      || typeof row.draftId !== 'string'
      || !/^DRAFT-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.draftId)
      || typeof row.customerId !== 'string'
      || typeof row.reference !== 'string'
      || typeof row.note !== 'string'
      || typeof row.savedAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T/.test(row.savedAt)
      || Number.isNaN(Date.parse(row.savedAt))
      || typeof row.balanceAtSaveIqd !== 'number'
      || typeof row.amountIqd !== 'number') return null;
    const customer = customers.find(c => c.id === row.customerId);
    const check = checkCustomerDebt059(customer, String(row.amountIqd),
      row.reference, row.note);
    // An altered underlying customer balance invalidates this preview.
    if (!check.valid || row.balanceAtSaveIqd !== check.currentBalanceIqd) return null;
    return {
      draftId: row.draftId,
      customerId: row.customerId,
      balanceAtSaveIqd: row.balanceAtSaveIqd,
      amountIqd: row.amountIqd,
      reference: row.reference,
      note: row.note,
      savedAt: row.savedAt,
      status: 'local-demo-draft',
    };
  } catch { return null; }
};

/** Approval is impossible via frontend role claims alone. */
export const canSubmitCustomerDebt059 = (_claimedRole?: string): false => false;
