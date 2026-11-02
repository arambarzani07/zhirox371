import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { money, formatDateTime } from '../utils/retailHelpers';
import { KurdishVoiceAnnouncer } from '../utils/kurdishVoiceEngine';

export const FinanceShiftView: React.FC = () => {
  const {
    currentShift,
    receipts,
    expenses,
    products,
    recordExpense,
    closeShift,
    openNewShift,
    setActiveReceiptForModal,
    subtab,
    activeSectionId
  } = useApp();

  const resolveMode = (): 'drawer' | 'expenses' | 'income' | 'movements' => {
    if (activeSectionId === 'expense-fall' || subtab === 'expenses') return 'expenses';
    if (activeSectionId === 'income-rise') return 'income';
    if (activeSectionId === 'cash-movements') return 'movements';
    return 'drawer';
  };

  const [activeTab, setActiveTab] = useState<'drawer' | 'expenses' | 'income' | 'movements'>(resolveMode);
  const [search, setSearch] = useState('');
  const [incomeFilter, setIncomeFilter] = useState<'all' | 'cash' | 'debt'>('all');

  useEffect(() => {
    setActiveTab(resolveMode());
  }, [subtab, activeSectionId]);

  // Expense form state
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('خەرجی ڕۆژانە');
  const [expenseNote, setExpenseNote] = useState('');

  // Close shift modal state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');

  // Z-Report modal state
  const [showZReportModal, setShowZReportModal] = useState(false);

  // Open shift modal state
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [newCashierName, setNewCashierName] = useState('ئارام بارزانی');
  const [newOpeningFloat, setNewOpeningFloat] = useState('250000');

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(expenseAmount, 10);
    if (!expenseTitle.trim() || !Number.isSafeInteger(amt) || amt <= 0) return;

    recordExpense(expenseTitle.trim(), amt, expenseCategory, expenseNote.trim());
    KurdishVoiceAnnouncer.announceExpenseAdded(amt);
    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseNote('');
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    const counted = parseInt(actualCashInput, 10);
    if (!Number.isSafeInteger(counted) || counted < 0) return;

    closeShift(counted);
    KurdishVoiceAnnouncer.announceShiftClosed(counted);
    setShowCloseModal(false);
  };

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const floatAmt = parseInt(newOpeningFloat, 10);
    if (!newCashierName.trim() || !Number.isSafeInteger(floatAmt) || floatAmt < 0) return;

    openNewShift(newCashierName.trim(), floatAmt);
    KurdishVoiceAnnouncer.announceShiftOpened(newCashierName.trim());
    setShowOpenModal(false);
  };

  const filteredIncomeReceipts = receipts.filter(r => {
    if (incomeFilter !== 'all' && r.paymentMethod !== incomeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.receiptNumber.toLowerCase().includes(q) ||
      (r.customerName && r.customerName.toLowerCase().includes(q))
    );
  });

  // Build unified cash movements list (opening float + cash receipts + expenses)
  const cashBookEntries = [
    ...receipts
      .filter(r => r.paymentMethod === 'cash')
      .map(r => ({
        id: `cb-rcp-${r.id}`,
        timestamp: r.createdAt,
        title: `فرۆشتنی نەختینە — پسووڵە ${r.receiptNumber}`,
        category: 'فرۆشتنی کاشێر',
        type: 'in' as const,
        amount: r.total,
        note: r.customerName || 'کڕیاری نەختینە'
      })),
    ...expenses.map(e => ({
      id: `cb-exp-${e.id}`,
      timestamp: e.createdAt,
      title: e.title,
      category: e.category,
      type: 'out' as const,
      amount: e.amount,
      note: e.note || 'خەرجی لە سندووق'
    })),
    {
      id: 'cb-open',
      timestamp: currentShift.openedAt,
      title: 'سەرمایەی سەرەتایی کاتی کردنەوەی شێفت (Opening Float)',
      category: 'سەرمایەی دەستپێک',
      type: 'in' as const,
      amount: currentShift.openingFloat,
      note: currentShift.cashierName
    }
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="ws-stack">
      {/* Unified Financial KPI Strip */}
      <div className="ws-kpi-grid">
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">پارەی چاوەڕوانکراوی سندووق</span>
          <span className="ws-kpi-value">{money(currentShift.expectedCash)}</span>
          <span className="ws-kpi-sub">سەرمایەی سەرەتا + فرۆشتن − خەرجی − گەڕاوە</span>
        </div>

        <div className="ws-kpi-card">
          <span className="ws-kpi-label">فرۆشتنی نەختینە (Cash)</span>
          <span className="ws-kpi-value positive">{money(currentShift.cashSales)}</span>
          <span className="ws-kpi-sub">پارەی وەرگیراوی کاشێر لە شێفتدا</span>
        </div>

        <div className="ws-kpi-card">
          <span className="ws-kpi-label">فرۆشتن بە قەرز (Debt)</span>
          <span className="ws-kpi-value">{money(currentShift.debtSales)}</span>
          <span className="ws-kpi-sub">تۆمارکراو لەسەر دەفتەری کڕیاران</span>
        </div>

        <div className="ws-kpi-card">
          <span className="ws-kpi-label">کۆی خەرجییەکانی شێفت</span>
          <span className="ws-kpi-value negative">{money(currentShift.expenses)}</span>
          <span className="ws-kpi-sub">دەرچوونی پارە لە سندووق ({expenses.length} پسووڵە)</span>
        </div>
      </div>

      {/* 1. CASH DRAWER SUBMODULE (سندووق) */}
      {activeTab === 'drawer' && (
        <>
          <div className="ws-panel">
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <div>
                <h2 className="ws-panel-title" style={{ margin: 0 }}>
                  دۆخی شێفتی ئێستا: {currentShift.status === 'open' ? 'کراوەیە (چالاک)' : 'داخراوە'}
                </h2>
                <div style={{ fontSize: '12px', color: '#536c85', marginTop: '4px', fontWeight: 700 }}>
                  کاشێری بەرپرس: <strong>{currentShift.cashierName}</strong> · کاتی کردنەوە:{' '}
                  <span style={{ direction: 'ltr', display: 'inline-block' }}>
                    {formatDateTime(currentShift.openedAt)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowZReportModal(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  🖨️ چاپی ڕاپۆرتی Z (کۆتایی شێفت)
                </button>
                {currentShift.status === 'open' ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setActualCashInput(String(currentShift.expectedCash));
                      setShowCloseModal(true);
                    }}
                  >
                    داخستنی شێفت و ژماردنی سندووق
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setShowOpenModal(true)}
                  >
                    کردنەوەی شێفتی نوێ
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              پوختەی ژمێریاریی سندووقی نەختینە
            </strong>
            <table>
              <thead>
                <tr>
                  <th>بڕگەی ژمێریاری</th>
                  <th>جۆری جووڵە</th>
                  <th>بڕی پارە (IQD)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>سەرمایەی سەرەتایی کاتی کردنەوەی شێفت (Opening Float)</strong>
                  </td>
                  <td>سەرمایەی دەستپێک</td>
                  <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(currentShift.openingFloat)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>فرۆشتنی نەختینەی تۆمارکراو لە شێفتدا</strong>
                  </td>
                  <td>هاتوو (+)</td>
                  <td style={{ direction: 'ltr', fontWeight: 900, color: '#15803d' }}>
                    +{money(currentShift.cashSales)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>خەرجی و پارەی دەرچوو لە سندووق</strong>
                  </td>
                  <td>دەرچوو (−)</td>
                  <td style={{ direction: 'ltr', fontWeight: 900, color: '#b91c1c' }}>
                    −{money(currentShift.expenses)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>گەڕاوەی نەختینە بۆ کڕیار (Returns)</strong>
                  </td>
                  <td>گەڕاوە (−)</td>
                  <td style={{ direction: 'ltr', fontWeight: 900, color: '#b91c1c' }}>
                    −{money(currentShift.cashReturns || 0)}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>باڵانسی کۆتایی چاوەڕوانکراو لە ناو سندووق</strong>
                  </td>
                  <td>کۆی چاوەڕوانکراو</td>
                  <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(currentShift.expectedCash)}</td>
                </tr>
                {currentShift.actualCash !== null && (
                  <tr>
                    <td>
                      <strong>پارەی حەقیقیی ژمێردراو لەلایەن کاشێر</strong>
                    </td>
                    <td>ژماردنی کۆتایی</td>
                    <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(currentShift.actualCash)}</td>
                  </tr>
                )}
                {currentShift.discrepancy !== null && (
                  <tr>
                    <td>
                      <strong>جیاوازیی سندووق (زیادە یان کورتهێنان)</strong>
                    </td>
                    <td>ئەنجامی بەراورد</td>
                    <td
                      style={{
                        direction: 'ltr',
                        fontWeight: 900,
                        color: currentShift.discrepancy === 0 ? '#15803d' : '#b91c1c'
                      }}
                    >
                      {currentShift.discrepancy >= 0
                        ? `+${currentShift.discrepancy.toLocaleString('en-US')}`
                        : currentShift.discrepancy.toLocaleString('en-US')}{' '}
                      IQD
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 2. EXPENSES SUBMODULE (خەرجی) */}
      {activeTab === 'expenses' && (
        <>
          <div className="ws-panel">
            <h2 className="ws-panel-title">تۆمارکردنی خەرجیی نوێ لەسەر سندووق</h2>
            <form onSubmit={handleExpenseSubmit} className="ws-form-grid">
              <label className="form-col">
                ناونیشانی خەرجی *
                <input
                  type="text"
                  value={expenseTitle}
                  onChange={e => setExpenseTitle(e.target.value)}
                  required
                  placeholder="نموونە: کڕینی پێداویستیی پاککردنەوە..."
                />
              </label>

              <label className="form-col">
                بڕی پارە (IQD) *
                <input
                  type="number"
                  min="250"
                  step="250"
                  value={expenseAmount}
                  onChange={e => setExpenseAmount(e.target.value)}
                  required
                  placeholder="5000"
                />
              </label>

              <label className="form-col">
                پۆلی خەرجی
                <select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)}>
                  <option value="خەرجی ڕۆژانە">خەرجی ڕۆژانە</option>
                  <option value="میوانداری">میوانداری</option>
                  <option value="کرێ و خزمەتگوزاری">کرێ و خزمەتگوزاری</option>
                  <option value="چاککردنەوە">چاککردنەوە و ئامێر</option>
                  <option value="حیساباتی دابینکەران">حیساباتی دابینکەران</option>
                </select>
              </label>

              <label className="form-col">
                تێبینی
                <input
                  type="text"
                  value={expenseNote}
                  onChange={e => setExpenseNote(e.target.value)}
                  placeholder="ژمارەی پسووڵە یان وردەکاری..."
                />
              </label>

              <button type="submit" className="primary">
                تۆمارکردنی خەرجی
              </button>
            </form>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              کۆی خەرجییەکانی تۆمارکراو: {money(currentShift.expenses)}
            </strong>
            <table>
              <thead>
                <tr>
                  <th>بەروار و کات</th>
                  <th>ناونیشانی خەرجی</th>
                  <th>پۆل</th>
                  <th>بڕ (IQD)</th>
                  <th>تێبینی</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={5}>
                      هیچ خەرجییەک لەم شێفتەدا تۆمارنەکراوە
                    </td>
                  </tr>
                ) : (
                  expenses.map(exp => (
                    <tr key={exp.id}>
                      <td style={{ direction: 'ltr' }}>{formatDateTime(exp.createdAt)}</td>
                      <td>
                        <strong>{exp.title}</strong>
                      </td>
                      <td>{exp.category}</td>
                      <td style={{ direction: 'ltr', fontWeight: 900, color: '#b91c1c' }}>
                        {money(exp.amount)}
                      </td>
                      <td>{exp.note || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 3. INCOME SUBMODULE (داهات) */}
      {activeTab === 'income' && (
        <>
          <div className="ws-panel">
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={incomeFilter === 'all' ? 'primary' : 'secondary'}
                  onClick={() => setIncomeFilter('all')}
                >
                  هەموو داهاتەکان ({receipts.length})
                </button>
                <button
                  type="button"
                  className={incomeFilter === 'cash' ? 'primary' : 'secondary'}
                  onClick={() => setIncomeFilter('cash')}
                >
                  نەختینە ({receipts.filter(r => r.paymentMethod === 'cash').length})
                </button>
                <button
                  type="button"
                  className={incomeFilter === 'debt' ? 'primary' : 'secondary'}
                  onClick={() => setIncomeFilter('debt')}
                >
                  فرۆشتن بە قەرز ({receipts.filter(r => r.paymentMethod === 'debt').length})
                </button>
              </div>
              <input
                type="text"
                className="input-search"
                placeholder="گەڕان لە داهات بە ژمارەی پسووڵە یان کڕیار..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              تۆماری داهاتی پسووڵەکان ({filteredIncomeReceipts.length} پسووڵە · کۆ:{' '}
              {money(filteredIncomeReceipts.reduce((s, r) => s + r.total, 0))})
            </strong>
            <table>
              <thead>
                <tr>
                  <th>ژمارەی پسووڵە</th>
                  <th>بەروار و کات</th>
                  <th>کڕیار</th>
                  <th>شێوازی پارەدان</th>
                  <th>کۆی داهات</th>
                  <th>قازانجی خەملێنراو</th>
                  <th>کردار</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncomeReceipts.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={7}>
                      هیچ پسووڵەیەکی داهات نەدۆزرایەوە
                    </td>
                  </tr>
                ) : (
                  filteredIncomeReceipts.map(r => {
                    const cost = r.items.reduce((acc, item) => {
                      const prod = products.find(p => p.id === item.productId);
                      const unitCost =
                        item.mode === 'carton' && prod?.carton?.purchase_price_iqd
                          ? prod.carton.purchase_price_iqd
                          : prod?.unit_purchase_price_iqd || Math.round(item.price * 0.8);
                      return acc + unitCost * item.qty;
                    }, 0);
                    const estProfit = r.total - cost;

                    return (
                      <tr key={r.id}>
                        <td style={{ direction: 'ltr', fontWeight: 900 }}>{r.receiptNumber}</td>
                        <td style={{ direction: 'ltr' }}>{formatDateTime(r.createdAt)}</td>
                        <td>
                          <strong>{r.customerName || 'کڕیاری نەختینە'}</strong>
                        </td>
                        <td>
                          <span className={`ws-badge ${r.paymentMethod === 'cash' ? 'success' : 'warning'}`}>
                            {r.paymentMethod === 'cash' ? 'نەختینە' : 'قەرز'}
                          </span>
                        </td>
                        <td style={{ direction: 'ltr', fontWeight: 900, color: '#15803d' }}>
                          {money(r.total)}
                        </td>
                        <td style={{ direction: 'ltr', fontWeight: 800, color: '#15803d' }}>
                          +{money(estProfit)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => setActiveReceiptForModal(r)}
                          >
                            بینینی پسووڵە
                          </button>
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

      {/* 4. CASH MOVEMENTS SUBMODULE (جووڵەی پارە) */}
      {activeTab === 'movements' && (
        <>
          <div className="ws-panel">
            <h2 className="ws-panel-title">تۆمارکردنی دەرچوونی خێرای پارە لە سندووق (جووڵەی نەختینە)</h2>
            <form onSubmit={handleExpenseSubmit} className="ws-form-grid">
              <label className="form-col">
                بەیان / هۆکاری جووڵەی پارە *
                <input
                  type="text"
                  value={expenseTitle}
                  onChange={e => setExpenseTitle(e.target.value)}
                  required
                  placeholder="نموونە: گواستنەوەی نەختینە بۆ قاسەی سەرەکی..."
                />
              </label>

              <label className="form-col">
                بڕی پارە (IQD) *
                <input
                  type="number"
                  min="250"
                  step="250"
                  value={expenseAmount}
                  onChange={e => setExpenseAmount(e.target.value)}
                  required
                  placeholder="25000"
                />
              </label>

              <label className="form-col">
                جۆری جووڵە
                <select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)}>
                  <option value="خەرجی ڕۆژانە">دەرچوون بۆ خەرجی ڕۆژانە (−)</option>
                  <option value="حیساباتی دابینکەران">دەرچوون بۆ دابینکەر (−)</option>
                  <option value="تەسلیمکردنی قاسە">تەسلیمکردن بە قاسەی سەرەکی (−)</option>
                </select>
              </label>

              <button type="submit" className="primary">
                تۆمارکردنی جووڵەی پارە
              </button>
            </form>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              دەفتەری جووڵەی نەختینەی شەفت ({cashBookEntries.length} مامەڵە · باڵانسی سندووق:{' '}
              <bdi>{money(currentShift.expectedCash)}</bdi>)
            </strong>
            <table>
              <thead>
                <tr>
                  <th>بەروار و کات</th>
                  <th>ناونیشانی جووڵەی پارە</th>
                  <th>پۆل</th>
                  <th>جۆر</th>
                  <th>بڕ (IQD)</th>
                  <th>ئاماژە / کەسی بەرپرس</th>
                </tr>
              </thead>
              <tbody>
                {cashBookEntries.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ direction: 'ltr' }}>{formatDateTime(entry.timestamp)}</td>
                    <td>
                      <strong>{entry.title}</strong>
                    </td>
                    <td>{entry.category}</td>
                    <td>
                      <span className={`ws-badge ${entry.type === 'in' ? 'success' : 'danger'}`}>
                        {entry.type === 'in' ? 'هاتوو (+)' : 'دەرچوو (−)'}
                      </span>
                    </td>
                    <td
                      style={{
                        direction: 'ltr',
                        fontWeight: 900,
                        color: entry.type === 'in' ? '#15803d' : '#b91c1c'
                      }}
                    >
                      {entry.type === 'in' ? `+${money(entry.amount)}` : `−${money(entry.amount)}`}
                    </td>
                    <td>{entry.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal: Close Shift */}
      {showCloseModal && (
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
              maxWidth: '420px',
              width: '100%',
              border: '1px solid #dde6f0'
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 900 }}>
              داخستنی شێفت و ژماردنی سندووق
            </h3>
            <p style={{ fontSize: '12px', color: '#536c85', margin: '0 0 14px' }}>
              پارەی چاوەڕوانکراو بەپێی سیستەم: <strong>{money(currentShift.expectedCash)}</strong>
            </p>

            <form onSubmit={handleCloseShift} style={{ display: 'grid', gap: '12px' }}>
              <label className="form-col">
                پارەی ژمێردراوی حەقیقی سندووق (IQD) *
                <input
                  type="number"
                  value={actualCashInput}
                  onChange={e => setActualCashInput(e.target.value)}
                  required
                  placeholder="بڕی پارەی ژمێردراو..."
                />
              </label>

              {actualCashInput && (
                <div style={{ fontSize: '12px', fontWeight: 800 }}>
                  جیاوازی:{' '}
                  <span
                    style={{
                      direction: 'ltr',
                      display: 'inline-block',
                      color:
                        parseInt(actualCashInput, 10) - currentShift.expectedCash >= 0
                          ? '#15803d'
                          : '#b91c1c'
                    }}
                  >
                    {(parseInt(actualCashInput, 10) - currentShift.expectedCash).toLocaleString('en-US')} IQD
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  تەواوکردن و داخستن
                </button>
                <button type="button" className="secondary" onClick={() => setShowCloseModal(false)}>
                  هەڵوەشاندنەوە
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Open New Shift */}
      {showOpenModal && (
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
              maxWidth: '420px',
              width: '100%',
              border: '1px solid #dde6f0'
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 900 }}>
              کردنەوەی شێفتی نوێ
            </h3>

            <form onSubmit={handleOpenShift} style={{ display: 'grid', gap: '12px' }}>
              <label className="form-col">
                ناوی کاشێر *
                <input
                  type="text"
                  value={newCashierName}
                  onChange={e => setNewCashierName(e.target.value)}
                  required
                />
              </label>

              <label className="form-col">
                سەرمایەی دەستپێکی سندووق (Opening Float) *
                <input
                  type="number"
                  value={newOpeningFloat}
                  onChange={e => setNewOpeningFloat(e.target.value)}
                  required
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  دەستپێکردنی شێفت
                </button>
                <button type="button" className="secondary" onClick={() => setShowOpenModal(false)}>
                  هەڵوەشاندنەوە
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Z-Report (Shift Closure) */}
      {showZReportModal && (
        <div
          className="thermal-receipt-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="thermal-receipt-modal-box"
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
              maxWidth: '480px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              className="thermal-receipt-controls"
              style={{
                padding: '14px 18px',
                borderBottom: '1.5px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                چاپی ڕاپۆرتی کۆتایی شێفت (Z-Report)
              </strong>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 16px',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  🖨️ چاپکردن
                </button>
                <button
                  type="button"
                  onClick={() => setShowZReportModal(false)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  داخستن
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                background: '#f1f5f9',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <div
                id="thermal-receipt-ticket"
                style={{
                  width: '80mm',
                  maxWidth: '100%',
                  background: '#ffffff',
                  padding: '5mm',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                  color: '#000000',
                  fontFamily: 'Tahoma, "Segoe UI", Arial, sans-serif',
                  fontSize: '11px',
                  lineHeight: 1.5,
                  direction: 'rtl'
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                  <h2 style={{ fontSize: '15px', fontWeight: 900, margin: '0 0 2px' }}>
                    سوپەرمارکێتی کانی چنار
                  </h2>
                  <div style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.5px' }}>
                    ڕاپۆرتی کۆتایی شێفتی کاشێر (Z-REPORT)
                  </div>
                  <div data-demo-watermark="true" style={{ fontSize: '9px', fontWeight: 800, border: '1px dashed #333', padding: '2px', margin: '4px 0' }}>
                    سیستەمی ژمێریاری ناوخۆیی — داخستنی خول
                  </div>
                </div>

                <div style={{ borderBottom: '1px dashed #444', margin: '6px 0' }} />

                <div style={{ fontSize: '9.5px', display: 'grid', gap: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>کاشێری بەرپرس:</span>
                    <strong>{currentShift.cashierName}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>کاتی دەستپێک:</span>
                    <span style={{ direction: 'ltr' }}>{formatDateTime(currentShift.openedAt)}</span>
                  </div>
                  {currentShift.closedAt && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>کاتی داخستن:</span>
                      <span style={{ direction: 'ltr' }}>{formatDateTime(currentShift.closedAt)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>دۆخی شێفت:</span>
                    <strong>{currentShift.status === 'open' ? 'شێفتی کراوە' : 'شێفتی داخراو'}</strong>
                  </div>
                </div>

                <div style={{ borderBottom: '1.5px solid #000', margin: '8px 0' }} />

                <div style={{ fontSize: '10.5px', display: 'grid', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>سەرمایەی دەستپێک (Float):</span>
                    <strong style={{ direction: 'ltr' }}>{money(currentShift.openingFloat)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d' }}>
                    <span>فرۆشتنی نەختینە (+):</span>
                    <strong style={{ direction: 'ltr' }}>+{money(currentShift.cashSales)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1d4ed8' }}>
                    <span>فرۆشتنی قەرز (تۆمارکراو):</span>
                    <strong style={{ direction: 'ltr' }}>{money(currentShift.debtSales)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, borderTop: '1px dotted #666', paddingTop: '3px' }}>
                    <span>کۆی فرۆشتنی گشتی:</span>
                    <strong style={{ direction: 'ltr' }}>{money(currentShift.cashSales + currentShift.debtSales)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
                    <span>خەرجی لە سندووق (−):</span>
                    <strong style={{ direction: 'ltr' }}>−{money(currentShift.expenses)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
                    <span>گەڕاوەی کاڵا (−):</span>
                    <strong style={{ direction: 'ltr' }}>−{money(currentShift.cashReturns || 0)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #000', paddingTop: '4px', fontWeight: 900, fontSize: '11.5px' }}>
                    <span>کاشی چاوەڕوانکراوی سندووق:</span>
                    <strong style={{ direction: 'ltr' }}>{money(currentShift.expectedCash)}</strong>
                  </div>
                  {currentShift.actualCash !== null && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '11.5px' }}>
                        <span>کاشی ژمێردراوی حەقیقی:</span>
                        <strong style={{ direction: 'ltr' }}>{money(currentShift.actualCash)}</strong>
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 900,
                        fontSize: '11px',
                        color: (currentShift.discrepancy || 0) === 0 ? '#15803d' : (currentShift.discrepancy || 0) > 0 ? '#15803d' : '#b91c1c',
                        background: '#f3f4f6',
                        padding: '3px 6px',
                        borderRadius: '4px'
                      }}>
                        <span>جیاوازی ژمێریاری (Variance):</span>
                        <strong style={{ direction: 'ltr' }}>
                          {(currentShift.discrepancy || 0) > 0 ? `+${money(currentShift.discrepancy || 0)} (زیادە)` : (currentShift.discrepancy || 0) < 0 ? `${money(currentShift.discrepancy || 0)} (کورتھێنان)` : '0 IQD (تەواو و بەرامبەر)'}
                        </strong>
                      </div>
                    </>
                  )}
                </div>

                <div style={{ borderBottom: '1px dashed #444', margin: '14px 0 10px' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px', fontSize: '9px', textAlign: 'center' }}>
                  <div>
                    <div style={{ borderBottom: '1px solid #666', height: '24px' }}></div>
                    <div style={{ marginTop: '4px' }}>واژۆی کاشێری بەرپرس</div>
                  </div>
                  <div>
                    <div style={{ borderBottom: '1px solid #666', height: '24px' }}></div>
                    <div style={{ marginTop: '4px' }}>واژۆی بەڕێوەبەری مارکێت</div>
                  </div>
                </div>

                <div style={{ textAlign: 'center', fontSize: '8px', color: '#666', marginTop: '12px' }}>
                  بەرهەمهێنراو لەلایەن سیستەمی Retail OS PC — کانی چنار
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
