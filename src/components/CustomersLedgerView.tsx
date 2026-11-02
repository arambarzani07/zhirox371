import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { money, formatDateTime } from '../utils/retailHelpers';
import { Customer } from '../types';
import { KurdishVoiceAnnouncer } from '../utils/kurdishVoiceEngine';

export const CustomersLedgerView: React.FC = () => {
  const {
    customers,
    receipts,
    auditLogs,
    addCustomer,
    recordDebtRepayment,
    setActiveReceiptForModal,
    subtab,
    activeSectionId
  } = useApp();

  const resolveMode = (): 'customers' | 'debts' | 'history' | 'repayment' => {
    if (activeSectionId === 'purchase-history') return 'history';
    if (activeSectionId === 'customer-repayment') return 'repayment';
    if (activeSectionId === 'debt-book' || subtab === 'debts') return 'debts';
    return 'customers';
  };

  const [mode, setMode] = useState<'customers' | 'debts' | 'history' | 'repayment'>(resolveMode);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHistoryCustomerId, setSelectedHistoryCustomerId] = useState<string>('all');

  useEffect(() => {
    setMode(resolveMode());
  }, [subtab, activeSectionId]);

  // Add customer form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [initialDebt, setInitialDebt] = useState('0');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Inline repayment form in 'repayment' mode
  const [inlineRepayCustId, setInlineRepayCustId] = useState<string>('');
  const [inlineRepayAmt, setInlineRepayAmt] = useState<string>('');

  // Repayment modal
  const [repayingCust, setRepayingCust] = useState<Customer | null>(null);
  const [repayAmount, setRepayAmount] = useState<string>('');

  const totalOutstandingDebt = customers.reduce((sum, c) => sum + c.balanceDebt, 0);
  const debtors = customers.filter(c => c.balanceDebt > 0);
  const debtorsCount = debtors.length;

  useEffect(() => {
    if (debtors.length > 0 && !inlineRepayCustId) {
      setInlineRepayCustId(debtors[0].id);
      setInlineRepayAmt(String(debtors[0].balanceDebt));
    }
  }, [customers]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const added = addCustomer({
      name: name.trim(),
      phone: phone.trim() || '—',
      balanceDebt: Math.max(0, parseInt(initialDebt, 10) || 0),
      note: note.trim()
    });

    setName('');
    setPhone('');
    setNote('');
    setInitialDebt('0');
    setShowAddForm(false);
    setFeedback(`کڕیاری نوێ «${added.name}» بە سەرکەوتوویی تۆمارکرا`);
  };

  const handleRepaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayingCust) return;
    const amt = parseInt(repayAmount, 10);
    if (!Number.isSafeInteger(amt) || amt <= 0) return;

    recordDebtRepayment(repayingCust.id, amt);
    KurdishVoiceAnnouncer.announceDebtRepaid(repayingCust.name, amt);
    setFeedback(`بڕی ${money(amt)} لە قەرزی «${repayingCust.name}» وەرگیرایەوە و خرایە ناو سندووق`);
    setRepayingCust(null);
    setRepayAmount('');
  };

  const handleInlineRepaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = customers.find(c => c.id === inlineRepayCustId);
    const amt = parseInt(inlineRepayAmt, 10);
    if (!target || !Number.isSafeInteger(amt) || amt <= 0) return;
    const actualAmt = Math.min(amt, target.balanceDebt);
    recordDebtRepayment(target.id, actualAmt);
    KurdishVoiceAnnouncer.announceDebtRepaid(target.name, actualAmt);
    setFeedback(`بڕی ${money(actualAmt)} لە قەرزی «${target.name}» بە سەرکەوتوویی وەرگیرایەوە`);
    setInlineRepayAmt('');
  };

  const filteredCustomers = customers.filter(c => {
    const match = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm);
    if (!match) return false;
    if (mode === 'debts' || mode === 'repayment') return c.balanceDebt > 0;
    return true;
  });

  const filteredReceipts = receipts.filter(r => {
    if (selectedHistoryCustomerId !== 'all' && r.customerId !== selectedHistoryCustomerId) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      r.receiptNumber.toLowerCase().includes(q) ||
      (r.customerName && r.customerName.toLowerCase().includes(q)) ||
      r.items.some(i => i.name.toLowerCase().includes(q))
    );
  });

  const repaymentLogs = auditLogs.filter(a => a.action === 'دانەوەی قەرز');

  return (
    <div className="ws-stack">
      {/* Unified KPI Strip */}
      <div className="ws-kpi-grid">
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">کۆی گشتیی قەرز لای کڕیاران</span>
          <span className={`ws-kpi-value ${totalOutstandingDebt > 0 ? 'negative' : 'positive'}`}>
            {money(totalOutstandingDebt)}
          </span>
          <span className="ws-kpi-sub">باڵانسی ماوە لە دەفتەری قەرز</span>
        </div>
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">ژمارەی کڕیارانی قەرزدار</span>
          <span className="ws-kpi-value">{debtorsCount}</span>
          <span className="ws-kpi-sub">لە کۆی {customers.length} کڕیاری تۆمارکراو</span>
        </div>
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">کڕیارانی بێ قەرز (حسابی ساف)</span>
          <span className="ws-kpi-value positive">{customers.length - debtorsCount}</span>
          <span className="ws-kpi-sub">ئامادە بۆ مامەڵەی نوێ</span>
        </div>
      </div>

      {feedback && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontWeight: 800,
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{feedback}</span>
          <button
            type="button"
            className="secondary"
            onClick={() => setFeedback(null)}
            style={{ minHeight: '24px', padding: '0 8px', fontSize: '11px' }}
          >
            داخستن
          </button>
        </div>
      )}

      {/* SUBSECTION 4.3: PURCHASE HISTORY (مێژووی کڕین) */}
      {mode === 'history' && (
        <>
          <div className="ws-panel">
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  className="input-search"
                  style={{ width: '220px' }}
                  value={selectedHistoryCustomerId}
                  onChange={e => setSelectedHistoryCustomerId(e.target.value)}
                >
                  <option value="all">هەموو کڕیاران ({receipts.length} پسووڵە)</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="input-search"
                  placeholder="گەڕان بە ژمارەی پسووڵە، کڕیار، یان کاڵا..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#536c85' }}>
                کۆی گشتیی کڕینەکان: {money(filteredReceipts.reduce((s, r) => s + r.total, 0))}
              </span>
            </div>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              مێژووی کڕینی کڕیاران ({filteredReceipts.length} پسووڵە)
            </strong>
            <table>
              <thead>
                <tr>
                  <th>ژمارەی پسووڵە</th>
                  <th>بەروار و کات</th>
                  <th>ناوی کڕیار</th>
                  <th>کاڵاکانی ناو پسووڵە</th>
                  <th>شێوازی پارەدان</th>
                  <th>کۆی پسووڵە</th>
                  <th>کردار</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={7}>
                      هیچ پسووڵەیەکی کڕین نەدۆزرایەوە
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map(r => (
                    <tr key={r.id}>
                      <td style={{ direction: 'ltr', fontWeight: 900 }}>{r.receiptNumber}</td>
                      <td style={{ direction: 'ltr' }}>{formatDateTime(r.createdAt)}</td>
                      <td>
                        <strong>{r.customerName || 'کڕیاری نەختینە'}</strong>
                      </td>
                      <td>
                        {r.items.map(i => `${i.name} (${i.qty})`).join('، ')}
                      </td>
                      <td>
                        <span className={`ws-badge ${r.paymentMethod === 'cash' ? 'success' : 'warning'}`}>
                          {r.paymentMethod === 'cash' ? 'نەختینە' : 'قەرز'}
                        </span>
                      </td>
                      <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(r.total)}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setActiveReceiptForModal(r)}
                        >
                          بینین و چاپ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* SUBSECTION 4.4: CUSTOMER DEBT REPAYMENT (وەرگرتنەوەی قەرز) */}
      {mode === 'repayment' && (
        <>
          <div className="ws-panel">
            <h2 className="ws-panel-title">وەرگرتنەوەی ڕاستەوخۆی قەرزی کڕیار بۆ ناو سندووقی کاشێر</h2>
            <form onSubmit={handleInlineRepaySubmit} className="ws-form-grid">
              <label className="form-col">
                هەڵبژاردنی کڕیاری قەرزدار *
                <select
                  value={inlineRepayCustId}
                  onChange={e => {
                    setInlineRepayCustId(e.target.value);
                    const found = customers.find(c => c.id === e.target.value);
                    if (found) setInlineRepayAmt(String(found.balanceDebt));
                  }}
                >
                  {debtors.length === 0 ? (
                    <option value="">هیچ کڕیارێکی قەرزدار نەماوە</option>
                  ) : (
                    debtors.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} — قەرزی ئێستا: {money(c.balanceDebt)}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="form-col">
                بڕی پارەی وەرگیراو (IQD) *
                <input
                  type="number"
                  min="250"
                  step="250"
                  value={inlineRepayAmt}
                  onChange={e => setInlineRepayAmt(e.target.value)}
                  placeholder="25000"
                  required
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="submit" className="primary" disabled={debtors.length === 0}>
                  وەرگرتنەوەی قەرز و تۆمارکردن لە سندووق
                </button>
                {inlineRepayCustId && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const found = customers.find(c => c.id === inlineRepayCustId);
                      if (found) setInlineRepayAmt(String(found.balanceDebt));
                    }}
                  >
                    تەواوی قەرزەکە
                  </button>
                )}
              </div>
            </form>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: repaymentLogs.length > 0 ? 'minmax(0, 1.35fr) minmax(0, 1fr)' : '1fr',
              gap: '10px',
              alignItems: 'start',
              flex: '0 1 auto',
              minHeight: 0,
              overflow: 'hidden'
            }}
          >
            <div className="section-workspace__table" style={{ height: 'auto', maxHeight: '100%' }}>
              <strong className="section-workspace__metric">
                لیستی کڕیارانی قەرزدار ({debtors.length} کڕیار · کۆ: {money(totalOutstandingDebt)})
              </strong>
              <table>
                <thead>
                  <tr>
                    <th>ناوی کڕیار</th>
                    <th>ژمارەی مۆبایل</th>
                    <th>بڕی قەرزی ماوە</th>
                    <th>تێبینی</th>
                    <th>کرداری خێرا</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.length === 0 ? (
                    <tr>
                      <td className="section-workspace__empty" colSpan={5}>
                        سەرجەم کڕیاران بێ قەرزن (حسابی ساف)
                      </td>
                    </tr>
                  ) : (
                    debtors.map(c => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td style={{ direction: 'ltr' }}>{c.phone}</td>
                        <td style={{ direction: 'ltr', fontWeight: 900, color: '#b91c1c' }}>
                          {money(c.balanceDebt)}
                        </td>
                        <td>{c.note || '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="primary"
                            onClick={() => {
                              setRepayingCust(c);
                              setRepayAmount(String(c.balanceDebt));
                            }}
                          >
                            دانەوەی قەرز
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {repaymentLogs.length > 0 && (
              <div className="section-workspace__table" style={{ height: 'auto', maxHeight: '100%' }}>
                <strong className="section-workspace__metric">
                  تۆماری کۆتا وەرگرتنەوەکانی قەرز ({repaymentLogs.length} مامەڵە)
                </strong>
                <table>
                  <thead>
                    <tr>
                      <th>بەروار و کات</th>
                      <th>وەرگر (کاشێر)</th>
                      <th>وردەکاریی دانەوەی قەرز</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repaymentLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ direction: 'ltr' }}>{formatDateTime(log.timestamp)}</td>
                        <td>{log.user}</td>
                        <td>
                          <strong>{log.details}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* SUBSECTIONS 4.1 & 4.2: CUSTOMERS & DEBT BOOK */}
      {(mode === 'customers' || mode === 'debts') && (
        <>
          <div className="ws-panel" style={{ position: 'relative' }}>
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className={mode === 'customers' ? 'primary' : 'secondary'}
                  onClick={() => setMode('customers')}
                >
                  هەموو کڕیاران ({customers.length})
                </button>
                <button
                  type="button"
                  className={mode === 'debts' ? 'primary' : 'secondary'}
                  onClick={() => setMode('debts')}
                >
                  خاوەن قەرزەکان ({debtorsCount})
                </button>
                <input
                  type="text"
                  className="input-search"
                  placeholder="گەڕان بە ناوی کڕیار یان مۆبایل..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="primary"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? 'داخستنی فۆڕم ▲' : '+ تۆمارکردنی کڕیاری نوێ ▼'}
              </button>
            </div>

            {showAddForm && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  insetInline: 0,
                  zIndex: 40,
                  background: '#ffffff',
                  border: '2px solid #203e66',
                  borderRadius: '11px',
                  padding: '12px 14px',
                  boxShadow: '0 14px 32px rgba(15, 23, 42, 0.18)'
                }}
              >
                <h3 className="ws-panel-title">تۆمارکردنی کڕیاری نوێ لە دەفتەری کڕیاران</h3>
                <form onSubmit={handleAddSubmit} className="ws-form-grid">
                  <label className="form-col">
                    ناوی کڕیار *
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      placeholder="ناوی سیانی کڕیار..."
                    />
                  </label>
                  <label className="form-col">
                    ژمارەی مۆبایل
                    <input
                      type="text"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      dir="ltr"
                      placeholder="0750 000 0000"
                    />
                  </label>
                  <label className="form-col">
                    قەرزی سەرەتایی (IQD)
                    <input
                      type="number"
                      min="0"
                      value={initialDebt}
                      onChange={e => setInitialDebt(e.target.value)}
                    />
                  </label>
                  <label className="form-col">
                    تێبینی / ناونیشان
                    <input
                      type="text"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="گەڕەک، شوێنی کار..."
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="submit" className="primary">
                      پاشەکەوتکردن
                    </button>
                    <button type="button" className="secondary" onClick={() => setShowAddForm(false)}>
                      داخستن
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              {mode === 'debts'
                ? `دەفتەری قەرزی کڕیاران (${filteredCustomers.length} کڕیاری قەرزدار)`
                : `لیستی کڕیارانی تۆمارکراو (${filteredCustomers.length} کڕیار)`}
            </strong>
            <table>
              <thead>
                <tr>
                  <th>ناوی کڕیار</th>
                  <th>ژمارەی مۆبایل</th>
                  <th>ژمارەی پسووڵەکان</th>
                  <th>قەرزی ئێستا</th>
                  <th>تێبینی</th>
                  <th>کردار</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={6}>
                      هیچ کڕیارێک نەدۆزرایەوە
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map(c => {
                    const custReceiptsCount = receipts.filter(r => r.customerId === c.id).length;
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td style={{ direction: 'ltr' }}>{c.phone}</td>
                        <td>{custReceiptsCount} پسووڵە</td>
                        <td
                          style={{
                            direction: 'ltr',
                            fontWeight: 900,
                            color: c.balanceDebt > 0 ? '#b91c1c' : '#15803d'
                          }}
                        >
                          {money(c.balanceDebt)}
                        </td>
                        <td>{c.note || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {c.balanceDebt > 0 ? (
                              <button
                                type="button"
                                className="primary"
                                onClick={() => {
                                  setRepayingCust(c);
                                  setRepayAmount(String(c.balanceDebt));
                                }}
                              >
                                دانەوەی قەرز
                              </button>
                            ) : (
                              <span className="ws-badge success">حسابی ساف</span>
                            )}
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setSelectedHistoryCustomerId(c.id);
                                setMode('history');
                              }}
                            >
                              پسووڵەکان
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal: Debt Repayment */}
      {repayingCust && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '14px',
              padding: '22px',
              maxWidth: '400px',
              width: '100%',
              border: '1px solid #dde6f0'
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 900 }}>
              دانەوەی قەرزی: {repayingCust.name}
            </h3>
            <p style={{ fontSize: '12px', color: '#536c85', margin: '0 0 14px' }}>
              کۆی قەرزی تۆمارکراو: <strong>{money(repayingCust.balanceDebt)}</strong>
            </p>

            <form onSubmit={handleRepaySubmit} style={{ display: 'grid', gap: '12px' }}>
              <label className="form-col">
                بڕی پارەی وەرگیراو (IQD) *
                <input
                  type="number"
                  value={repayAmount}
                  onChange={e => setRepayAmount(e.target.value)}
                  max={repayingCust.balanceDebt}
                  min="250"
                  required
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  تۆمارکردن لە سندووق
                </button>
                <button type="button" className="secondary" onClick={() => setRepayingCust(null)}>
                  داخستن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
