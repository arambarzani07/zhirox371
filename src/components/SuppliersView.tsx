import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';

export const SuppliersView: React.FC = () => {
  const { suppliers, addSupplier, subtab } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [balanceDebt, setBalanceDebt] = useState('0');

  const totalOwedToSuppliers = suppliers.reduce((sum, s) => sum + s.balanceDebt, 0);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    addSupplier({
      name: name.trim(),
      phone: phone.trim() || '—',
      address: address.trim() || '—',
      balanceDebt: parseInt(balanceDebt) || 0
    });

    setName('');
    setPhone('');
    setAddress('');
    setBalanceDebt('0');
    setShowAddModal(false);
  };

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: '#0f172a' }}>
          دابینکەران و کۆمپانیاکانی کڕین
        </h1>
        <button
          type="button"
          className="primary"
          onClick={() => setShowAddModal(true)}
          style={{ height: '40px', fontSize: '13px' }}
        >
          ➕ زیادکردنی دابینکەری نوێ
        </button>
      </div>

      {/* Supplier Metrics */}
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
            background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
            border: '1.5px solid #99f6e4',
            borderRadius: '16px',
            padding: '20px'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#115e59' }}>
            کۆی گشتی قەرزی سوپەرمارکێت بۆ دابینکەران:
          </div>
          <div style={{ fontSize: '32px', fontWeight: 950, color: '#134e4a', direction: 'ltr', margin: '6px 0' }}>
            {money(totalOwedToSuppliers)}
          </div>
          <div style={{ fontSize: '12px', color: '#0f766e' }}>
            {suppliers.length} کۆمپانیای هاوبەش تۆمارکراون
          </div>
        </div>
      </div>

      <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45', marginBottom: '16px' }}>
          لیستی کۆمپانیا و دابینکەران
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>ناوی دابینکەر / کۆمپانیا</th>
              <th>ژمارەی پەیوەندی</th>
              <th>ناونیشان</th>
              <th>حسابی ماوە (قەرزی دابینکەر)</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map(s => (
              <tr key={s.id}>
                <td>
                  <strong style={{ fontSize: '14px', color: '#0f172a' }}>{s.name}</strong>
                </td>
                <td style={{ direction: 'ltr' }}>{s.phone}</td>
                <td>{s.address || '—'}</td>
                <td>
                  <strong
                    style={{
                      direction: 'ltr',
                      display: 'inline-block',
                      fontSize: '15px',
                      color: s.balanceDebt > 0 ? '#b91c1c' : '#15803d'
                    }}
                  >
                    {money(s.balanceDebt)}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
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
            <h3 style={{ margin: '0 0 16px', fontSize: '17px' }}>تۆمارکردنی دابینکەری نوێ</h3>
            <form onSubmit={handleAddSubmit} style={{ display: 'grid', gap: '12px' }}>
              <label className="form-col">
                ناوی کۆمپانیا یان دابینکەر *
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="بۆ نموونە: کۆمپانیای دابەشکردنی هەڵەبجە..."
                />
              </label>

              <label className="form-col">
                ژمارەی تەلەفۆن
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  dir="ltr"
                />
              </label>

              <label className="form-col">
                ناونیشان / شوێن
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="شار، ناوچە، شەقام..."
                />
              </label>

              <label className="form-col">
                قەرزی سەرەتایی (ئەگەر مابێت)
                <input
                  type="number"
                  value={balanceDebt}
                  onChange={e => setBalanceDebt(e.target.value)}
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  تۆمارکردن
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowAddModal(false)}
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
