import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { money, formatDateTime } from '../utils/retailHelpers';

export const FinanceShiftView: React.FC = () => {
  const { currentShift, expenses, recordExpense, closeShift, openNewShift, subtab } = useApp();

  const [activeTab, setActiveTab] = useState<'drawer' | 'expenses' | 'shifts'>('drawer');

  // Expense modal state
  const [showExpenseModal, setShowExpenseModal] = useState(subtab === 'expenses');
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('خەرجی ڕۆژانە');
  const [expenseNote, setExpenseNote] = useState('');

  // Close shift modal state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');

  // Open shift modal state
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [newCashierName, setNewCashierName] = useState('ئارام بارزانی');
  const [newOpeningFloat, setNewOpeningFloat] = useState('250000');

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(expenseAmount);
    if (!expenseTitle.trim() || !Number.isSafeInteger(amt) || amt <= 0) return;

    recordExpense(expenseTitle.trim(), amt, expenseCategory, expenseNote.trim());
    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseNote('');
    setShowExpenseModal(false);
  };

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    const counted = parseInt(actualCashInput);
    if (!Number.isSafeInteger(counted) || counted < 0) return;

    closeShift(counted);
    setShowCloseModal(false);
  };

  const handleOpenShift = (e: React.FormEvent) => {
    e.preventDefault();
    const floatAmt = parseInt(newOpeningFloat);
    if (!newCashierName.trim() || !Number.isSafeInteger(floatAmt) || floatAmt < 0) return;

    openNewShift(newCashierName.trim(), floatAmt);
    setShowOpenModal(false);
  };

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: '#0f172a' }}>
          بەڕێوەبردنی دارایی، سندووق و شێفتەکان
        </h1>
        <div className="tabs" style={{ margin: 0 }}>
          <button
            type="button"
            className={`tab ${activeTab === 'drawer' ? 'active' : ''}`}
            onClick={() => setActiveTab('drawer')}
          >
            سندووقی ئێستا
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'expenses' ? 'active' : ''}`}
            onClick={() => setActiveTab('expenses')}
          >
            خەرجییەکان ({expenses.length})
          </button>
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '20px'
        }}
      >
        <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e40af' }}>پارەی چاوەڕوانکراوی سندووق</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#1e3a8a', direction: 'ltr', margin: '4px 0' }}>
            {money(currentShift.expectedCash)}
          </div>
          <div style={{ fontSize: '11px', color: '#3b82f6' }}>سەرمایەی سەرەتا + فرۆشتن − خەرجی</div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534' }}>فرۆشتنی نەختینە (Cash)</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#15803d', direction: 'ltr', margin: '4px 0' }}>
            {money(currentShift.cashSales)}
          </div>
          <div style={{ fontSize: '11px', color: '#22c55e' }}>پارەی وەرگیراوی کاشێر</div>
        </div>

        <div style={{ background: '#faf5ff', border: '1.5px solid #e9d5ff', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#6b21a8' }}>فرۆشتن بە قەرز (Debt)</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#7e22ce', direction: 'ltr', margin: '4px 0' }}>
            {money(currentShift.debtSales)}
          </div>
          <div style={{ fontSize: '11px', color: '#a855f7' }}>چووەتە سەر حساباتی کڕیاران</div>
        </div>

        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#991b1b' }}>کۆی خەرجییەکان</div>
          <div style={{ fontSize: '26px', fontWeight: 950, color: '#b91c1c', direction: 'ltr', margin: '4px 0' }}>
            {money(currentShift.expenses)}
          </div>
          <div style={{ fontSize: '11px', color: '#ef4444' }}>دەرچوونی پارە لە سندووق</div>
        </div>
      </div>

      {activeTab === 'drawer' ? (
        <div className="surface" style={{ background: '#fff', padding: '24px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45', margin: 0 }}>
                دۆخی شێفتی ئێستا: {currentShift.status === 'open' ? '🟢 کراوەیە' : '🔴 داخراوە'}
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
                کاشێری چالاک: <strong>{currentShift.cashierName}</strong> — کاتی دەستپێکردن: {formatDateTime(currentShift.openedAt)}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowExpenseModal(true)}
              >
                💸 تۆمارکردنی خەرجی
              </button>
              {currentShift.status === 'open' ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => setShowCloseModal(true)}
                  style={{ background: '#dc2626' }}
                >
                  🔒 داخستنی شێفت و ژماردنی سندووق
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => setShowOpenModal(true)}
                  style={{ background: '#16a34a' }}
                >
                  🔓 کردنەوەی شێفتی نوێ
                </button>
              )}
            </div>
          </div>

          <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a', margin: '0 0 14px' }}>
              وردەکاری حساباتی سندووق
            </h3>
            <table className="table" style={{ margin: 0 }}>
              <tbody>
                <tr>
                  <td>سەرمایەی سەرەتایی کاتی کردنەوە (Opening Float):</td>
                  <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(currentShift.openingFloat)}</td>
                </tr>
                <tr>
                  <td>فرۆشتنی نەختینەی تۆمارکراو (+):</td>
                  <td style={{ direction: 'ltr', fontWeight: 900, color: '#15803d' }}>+{money(currentShift.cashSales)}</td>
                </tr>
                <tr>
                  <td>خەرجی و پارەی دەرچوو (−):</td>
                  <td style={{ direction: 'ltr', fontWeight: 900, color: '#b91c1c' }}>−{money(currentShift.expenses)}</td>
                </tr>
                <tr style={{ background: '#eff6ff', fontSize: '15px' }}>
                  <td>
                    <strong>پارەی کۆتایی چاوەڕوانکراو لە سندووق:</strong>
                  </td>
                  <td style={{ direction: 'ltr', fontWeight: 950, color: '#1e3a8a' }}>
                    {money(currentShift.expectedCash)}
                  </td>
                </tr>
                {currentShift.actualCash !== null && (
                  <tr>
                    <td>پارەی حەقیقی ژمێردراو لەلایەن کاشێر:</td>
                    <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(currentShift.actualCash)}</td>
                  </tr>
                )}
                {currentShift.discrepancy !== null && (
                  <tr>
                    <td>جیاوازی (زیادە یان کەمی):</td>
                    <td
                      style={{
                        direction: 'ltr',
                        fontWeight: 900,
                        color: currentShift.discrepancy === 0 ? '#15803d' : '#b91c1c'
                      }}
                    >
                      {currentShift.discrepancy >= 0 ? `+${currentShift.discrepancy}` : currentShift.discrepancy} IQD
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Expenses Table */
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <div className="toolbar">
            <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45' }}>تۆماری خەرجییەکان</h2>
            <button
              type="button"
              className="primary"
              onClick={() => setShowExpenseModal(true)}
            >
              ➕ خەرجی نوێ
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="blank">هیچ خەرجییەک لەم شێفتەدا تۆمارنەکراوە</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>کات</th>
                  <th>ناونیشانی خەرجی</th>
                  <th>پۆل</th>
                  <th>بڕ (IQD)</th>
                  <th>تێبینی</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp.id}>
                    <td style={{ direction: 'ltr' }}>{formatDateTime(exp.createdAt)}</td>
                    <td>
                      <strong>{exp.title}</strong>
                    </td>
                    <td>
                      <span className="stock-badge">{exp.category}</span>
                    </td>
                    <td>
                      <strong style={{ direction: 'ltr', display: 'inline-block', color: '#b91c1c' }}>
                        {money(exp.amount)}
                      </strong>
                    </td>
                    <td>{exp.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Record Expense */}
      {showExpenseModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '420px',
              width: '100%'
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: '17px' }}>تۆمارکردنی خەرجی نوێ</h3>
            <form onSubmit={handleExpenseSubmit} style={{ display: 'grid', gap: '12px' }}>
              <label className="form-col">
                ناونیشانی خەرجی *
                <input
                  type="text"
                  value={expenseTitle}
                  onChange={e => setExpenseTitle(e.target.value)}
                  required
                  placeholder="بۆ نموونە: کڕینی پێداویستی پاککردنەوە..."
                />
              </label>

              <label className="form-col">
                بڕی پارە (IQD) *
                <input
                  type="number"
                  min="250"
                  value={expenseAmount}
                  onChange={e => setExpenseAmount(e.target.value)}
                  required
                  placeholder="5000"
                />
              </label>

              <label className="form-col">
                پۆلی خەرجی
                <select
                  value={expenseCategory}
                  onChange={e => setExpenseCategory(e.target.value)}
                >
                  <option value="خەرجی ڕۆژانە">خەرجی ڕۆژانە</option>
                  <option value="میوانداری">میوانداری</option>
                  <option value="کرێ و خزمەتگوزاری">کرێ و خزمەتگوزاری</option>
                  <option value="چاککردنەوە">چاککردنەوە و ئامێر</option>
                </select>
              </label>

              <label className="form-col">
                تێبینی
                <input
                  type="text"
                  value={expenseNote}
                  onChange={e => setExpenseNote(e.target.value)}
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  تۆمارکردن
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowExpenseModal(false)}
                >
                  داخستن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Close Shift */}
      {showCloseModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '440px',
              width: '100%'
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: '17px', color: '#991b1b' }}>
              داخستنی شێفت و ژماردنی سندووق
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px' }}>
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
                <div style={{ fontSize: '13px', fontWeight: 800 }}>
                  جیاوازی:{' '}
                  <span
                    style={{
                      direction: 'ltr',
                      display: 'inline-block',
                      color:
                        parseInt(actualCashInput) - currentShift.expectedCash >= 0
                          ? '#15803d'
                          : '#b91c1c'
                    }}
                  >
                    {(parseInt(actualCashInput) - currentShift.expectedCash).toLocaleString()} IQD
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button type="submit" className="primary" style={{ flex: 1, background: '#dc2626' }}>
                  تەواوکردن و داخستن
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowCloseModal(false)}
                >
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
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '440px',
              width: '100%'
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: '17px', color: '#15803d' }}>
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

              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button type="submit" className="primary" style={{ flex: 1, background: '#16a34a' }}>
                  دەستپێکردنی شێفت
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowOpenModal(false)}
                >
                  هەڵوەشاندنەوە
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
