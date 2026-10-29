import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';
import { Customer } from '../types';

export const CustomersLedgerView: React.FC = () => {
  const { customers, addCustomer, recordDebtRepayment, subtab } = useApp();

  const [filterDebtOnly, setFilterDebtOnly] = useState(subtab === 'debts');
  const [searchTerm, setSearchTerm] = useState('');

  // Add customer form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [initialDebt, setInitialDebt] = useState('0');

  // Repayment modal
  const [repayingCust, setRepayingCust] = useState<Customer | null>(null);
  const [repayAmount, setRepayAmount] = useState<string>('');

  const totalOutstandingDebt = customers.reduce((sum, c) => sum + c.balanceDebt, 0);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addCustomer({
      name: name.trim(),
      phone: phone.trim() || '—',
      balanceDebt: parseInt(initialDebt) || 0,
      note: note.trim()
    });

    setName('');
    setPhone('');
    setNote('');
    setInitialDebt('0');
    setShowAddForm(false);
  };

  const handleRepaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayingCust) return;
    const amt = parseInt(repayAmount);
    if (!Number.isSafeInteger(amt) || amt <= 0) return;

    recordDebtRepayment(repayingCust.id, amt);
    setRepayingCust(null);
    setRepayAmount('');
  };

  const filteredCustomers = customers.filter(c => {
    const match = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm);
    if (!match) return false;
    if (filterDebtOnly) return c.balanceDebt > 0;
    return true;
  });

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: '#0f172a' }}>
          حسابات و قەرزەکانی کڕیاران
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="primary"
            onClick={() => setShowAddForm(true)}
            style={{ fontSize: '13px', height: '40px' }}
          >
            ➕ تۆمارکردنی کڕیاری نوێ
          </button>
        </div>
      </div>

      {/* Debt Summary Metric Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)',
            border: '1.5px solid #fbcfe8',
            borderRadius: '16px',
            padding: '20px'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#9d174d' }}>
            کۆی گشتی قەرز لای کڕیاران:
          </div>
          <div style={{ fontSize: '32px', fontWeight: 950, color: '#831843', direction: 'ltr', margin: '6px 0' }}>
            {money(totalOutstandingDebt)}
          </div>
          <div style={{ fontSize: '12px', color: '#be185d' }}>
            {customers.filter(c => c.balanceDebt > 0).length} کڕیار قەرزیان لەسەرە
          </div>
        </div>
      </div>

      {/* Main Customers Table Card */}
      <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
        <div className="toolbar">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className={`stock-subtab ${!filterDebtOnly ? 'active' : ''}`}
              onClick={() => setFilterDebtOnly(false)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 900,
                background: !filterDebtOnly ? '#1e3a8a' : '#f8fafc',
                color: !filterDebtOnly ? '#ffffff' : '#1e293b'
              }}
            >
              هەموو کڕیاران ({customers.length})
            </button>
            <button
              type="button"
              className={`stock-subtab ${filterDebtOnly ? 'active' : ''}`}
              onClick={() => setFilterDebtOnly(true)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 900,
                background: filterDebtOnly ? '#1e3a8a' : '#f8fafc',
                color: filterDebtOnly ? '#ffffff' : '#1e293b'
              }}
            >
              خاوەن قەرزەکان ({customers.filter(c => c.balanceDebt > 0).length})
            </button>
          </div>

          <input
            type="text"
            className="input-search"
            placeholder="گەڕان بە ناوی کڕیار، ژمارە تەلەفۆن..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="blank">هیچ کڕیارێک نەدۆزرایەوە</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ناوی کڕیار</th>
                <th>ژمارەی مۆبایل</th>
                <th>قەرزی ئێستا</th>
                <th>تێبینی</th>
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c => (
                <tr key={c.id}>
                  <td>
                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>{c.name}</strong>
                  </td>
                  <td style={{ direction: 'ltr' }}>{c.phone}</td>
                  <td>
                    <strong
                      style={{
                        direction: 'ltr',
                        display: 'inline-block',
                        fontSize: '15px',
                        color: c.balanceDebt > 0 ? '#b91c1c' : '#15803d'
                      }}
                    >
                      {money(c.balanceDebt)}
                    </strong>
                  </td>
                  <td>{c.note || '—'}</td>
                  <td>
                    {c.balanceDebt > 0 && (
                      <button
                        type="button"
                        className="catalog-table-btn"
                        onClick={() => {
                          setRepayingCust(c);
                          setRepayAmount(String(c.balanceDebt));
                        }}
                        style={{ background: '#dcfce7', borderColor: '#86efac', color: '#166534' }}
                      >
                        💵 دانەوەی قەرز
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Add Customer */}
      {showAddForm && (
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
              maxWidth: '460px',
              width: '100%'
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '17px' }}>تۆمارکردنی کڕیاری نوێ</h3>
            <form onSubmit={handleAddSubmit} style={{ display: 'grid', gap: '12px' }}>
              <label className="form-col">
                ناوی کڕیار *
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="ناوی چوارینەی کڕیار..."
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
                قەرزی سەرەتایی (ئەگەر هەبێت)
                <input
                  type="number"
                  value={initialDebt}
                  onChange={e => setInitialDebt(e.target.value)}
                />
              </label>

              <label className="form-col">
                تێبینی
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="ناونیشان، گەڕەک، تێبینی..."
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  تۆمارکردن
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowAddForm(false)}
                >
                  داخستن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Debt Repayment */}
      {repayingCust && (
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
            <h3 style={{ margin: '0 0 10px', fontSize: '17px' }}>دانەوەی قەرزی: {repayingCust.name}</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
              کۆی قەرزی تۆمارکراو: <strong>{money(repayingCust.balanceDebt)}</strong>
            </p>

            <form onSubmit={handleRepaySubmit} style={{ display: 'grid', gap: '12px' }}>
              <label className="form-col">
                بڕی پارەی دراوە (IQD) *
                <input
                  type="number"
                  value={repayAmount}
                  onChange={e => setRepayAmount(e.target.value)}
                  max={repayingCust.balanceDebt}
                  required
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  تۆمارکردن لە سندووق
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setRepayingCust(null)}
                >
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
