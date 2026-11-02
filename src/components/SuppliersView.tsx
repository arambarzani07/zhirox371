import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Supplier } from '../types';
import { money, formatDateTime } from '../utils/retailHelpers';

export const SuppliersView: React.FC = () => {
  const { suppliers, addSupplier, recordSupplierPayment, auditLogs, navigateTo, activeSectionId } = useApp();

  const isAccountsMode = activeSectionId === 'supplier-accounts';

  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [balanceDebt, setBalanceDebt] = useState('0');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Inline payment in supplier-accounts mode
  const [selectedSupId, setSelectedSupId] = useState<string>(suppliers[0]?.id || '');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payFromDrawer, setPayFromDrawer] = useState<boolean>(true);
  const [payNote, setPayNote] = useState<string>('');

  // Modal payment in directory mode
  const [payingSup, setPayingSup] = useState<Supplier | null>(null);
  const [modalPayAmt, setModalPayAmt] = useState<string>('');
  const [modalFromDrawer, setModalFromDrawer] = useState<boolean>(true);

  const totalOwedToSuppliers = suppliers.reduce((sum, s) => sum + s.balanceDebt, 0);
  const activeCreditors = suppliers.filter(s => s.balanceDebt > 0);

  useEffect(() => {
    if (activeCreditors.length > 0 && !selectedSupId) {
      setSelectedSupId(activeCreditors[0].id);
      setPayAmount(String(activeCreditors[0].balanceDebt));
    }
  }, [suppliers]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const added = addSupplier({
      name: name.trim(),
      phone: phone.trim() || '—',
      address: address.trim() || '—',
      balanceDebt: Math.max(0, parseInt(balanceDebt, 10) || 0)
    });

    setName('');
    setPhone('');
    setAddress('');
    setBalanceDebt('0');
    setShowAddForm(false);
    setFeedback(`دابینکەری نوێ «${added.name}» بە سەرکەوتوویی تۆمارکرا`);
  };

  const handleInlinePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = suppliers.find(s => s.id === selectedSupId);
    const amt = parseInt(payAmount, 10);
    if (!target || !Number.isSafeInteger(amt) || amt <= 0) return;
    const actualAmt = Math.min(amt, target.balanceDebt);
    recordSupplierPayment(target.id, actualAmt, payFromDrawer, payNote.trim() || undefined);
    setFeedback(`بڕی ${money(actualAmt)} درا بە دابینکەر «${target.name}» و لە حیساباتی کەم کرایەوە`);
    setPayAmount('');
    setPayNote('');
  };

  const handleModalPaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingSup) return;
    const amt = parseInt(modalPayAmt, 10);
    if (!Number.isSafeInteger(amt) || amt <= 0) return;
    const actualAmt = Math.min(amt, payingSup.balanceDebt);
    recordSupplierPayment(payingSup.id, actualAmt, modalFromDrawer);
    setFeedback(`بڕی ${money(actualAmt)} درا بە «${payingSup.name}»`);
    setPayingSup(null);
    setModalPayAmt('');
  };

  const filteredSuppliers = suppliers.filter(
    s =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm) ||
      (s.address && s.address.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const supplierPaymentLogs = auditLogs.filter(
    a => a.action === 'پارەدان بە دابینکەر' || a.action === 'وەرگرتنی کاڵا'
  );

  return (
    <div className="ws-stack">
      <div className="ws-kpi-grid">
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">کۆی قەرزی مارکێت بۆ دابینکەران</span>
          <span className={`ws-kpi-value ${totalOwedToSuppliers > 0 ? 'negative' : 'positive'}`}>
            {money(totalOwedToSuppliers)}
          </span>
          <span className="ws-kpi-sub">شایستەی دارایی کۆمپانیاکانی دابەشکردن</span>
        </div>
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">کۆی کۆمپانیا و دابینکەران</span>
          <span className="ws-kpi-value">{suppliers.length}</span>
          <span className="ws-kpi-sub">دابینکەری تۆمارکراو لە سیستەمدا</span>
        </div>
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">دابینکەرانی خاوەن قەرز</span>
          <span className="ws-kpi-value">{activeCreditors.length}</span>
          <span className="ws-kpi-sub">وەسڵی کڕینی ماوە لەسەر مارکێت</span>
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

      {/* SUBSECTION 5.4: SUPPLIER ACCOUNTS & SETTLEMENT (حیساباتی دابینکەر) */}
      {isAccountsMode && (
        <div className="ws-panel">
          <h2 className="ws-panel-title">پاکتاوکردن و پارەدان بە حیساباتی دابینکەر</h2>
          <form onSubmit={handleInlinePaySubmit} className="ws-form-grid">
            <label className="form-col">
              کۆمپانیا / دابینکەر *
              <select
                value={selectedSupId}
                onChange={e => {
                  setSelectedSupId(e.target.value);
                  const found = suppliers.find(s => s.id === e.target.value);
                  if (found) setPayAmount(String(found.balanceDebt));
                }}
              >
                {activeCreditors.length === 0 ? (
                  <option value="">هیچ قەرزێکی دابینکەر نەماوە</option>
                ) : (
                  activeCreditors.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — قەرزی ماوە: {money(s.balanceDebt)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="form-col">
              بڕی پارەی دراو (IQD) *
              <input
                type="number"
                min="250"
                step="250"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder="100000"
                required
              />
            </label>

            <label className="form-col">
              سەرچاوەی پارەدان
              <select
                value={payFromDrawer ? 'drawer' : 'safe'}
                onChange={e => setPayFromDrawer(e.target.value === 'drawer')}
              >
                <option value="drawer">لە سندووقی نەختینەی کاشێر</option>
                <option value="safe">لە قاسەی سەرەکیی فرۆشگا</option>
              </select>
            </label>

            <label className="form-col">
              ژمارەی پسووڵە / تێبینی
              <input
                type="text"
                value={payNote}
                onChange={e => setPayNote(e.target.value)}
                placeholder="وەسڵی پاکتاو..."
              />
            </label>

            <button type="submit" className="primary" disabled={activeCreditors.length === 0}>
              تۆمارکردنی پارەدان بە دابینکەر
            </button>
          </form>
        </div>
      )}

      {!isAccountsMode && (
        <div className="ws-panel" style={{ position: 'relative' }}>
          <div className="ws-toolbar" style={{ marginBottom: 0 }}>
            <input
              type="text"
              className="input-search"
              placeholder="گەڕان بە ناوی کۆمپانیا، تەلەفۆن، ناونیشان..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => navigateTo('stock', 'receive', 'receive-goods')}
              >
                + وەرگرتنی کاڵا لە دابینکەر
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? 'داخستنی فۆڕم ▲' : '+ زیادکردنی دابینکەری نوێ ▼'}
              </button>
            </div>
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
              <h3 className="ws-panel-title">تۆمارکردنی کۆمپانیا یان دابینکەری نوێ</h3>
              <form onSubmit={handleAddSubmit} className="ws-form-grid">
                <label className="form-col">
                  ناوی کۆمپانیا یان دابینکەر *
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="نموونە: کۆمپانیای دابەشکردنی هەڵەبجە..."
                  />
                </label>
                <label className="form-col">
                  ژمارەی تەلەفۆن
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    dir="ltr"
                    placeholder="0770 000 0000"
                  />
                </label>
                <label className="form-col">
                  ناونیشان / شار
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="سلێمانی — ناوچەی پیشەسازی"
                  />
                </label>
                <label className="form-col">
                  باڵانسی قەرزی سەرەتایی (IQD)
                  <input
                    type="number"
                    min="0"
                    value={balanceDebt}
                    onChange={e => setBalanceDebt(e.target.value)}
                  />
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" className="primary">
                    تۆمارکردن
                  </button>
                  <button type="button" className="secondary" onClick={() => setShowAddForm(false)}>
                    داخستن
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            isAccountsMode && supplierPaymentLogs.length > 0 ? 'minmax(0, 1.35fr) minmax(0, 1fr)' : '1fr',
          gap: '10px',
          alignItems: 'start',
          flex: '0 1 auto',
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        <div className="section-workspace__table" style={{ height: 'auto', maxHeight: '100%' }}>
          <strong className="section-workspace__metric">
            {isAccountsMode
              ? `کەشفی حیساباتی دابینکەران (${filteredSuppliers.length} دابینکەر · کۆی قەرز: ${money(totalOwedToSuppliers)})`
              : `لیستی کۆمپانیا و دابینکەران (${filteredSuppliers.length} دابینکەر)`}
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی دابینکەر / کۆمپانیا</th>
                <th>ژمارەی پەیوەندی</th>
                <th>ناونیشان</th>
                <th>باڵانسی ماوە (قەرزی دابینکەر)</th>
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td className="section-workspace__empty" colSpan={5}>
                    هیچ دابینکەرێک نەدۆزرایەوە
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map(s => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td style={{ direction: 'ltr' }}>{s.phone}</td>
                    <td>{s.address || '—'}</td>
                    <td
                      style={{
                        direction: 'ltr',
                        fontWeight: 900,
                        color: s.balanceDebt > 0 ? '#b91c1c' : '#15803d'
                      }}
                    >
                      {money(s.balanceDebt)}
                    </td>
                    <td>
                      {s.balanceDebt > 0 ? (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            setPayingSup(s);
                            setModalPayAmt(String(s.balanceDebt));
                          }}
                        >
                          پارەدان بە دابینکەر
                        </button>
                      ) : (
                        <span className="ws-badge success">حسابی ساف</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {isAccountsMode && supplierPaymentLogs.length > 0 && (
          <div className="section-workspace__table" style={{ height: 'auto', maxHeight: '100%' }}>
            <strong className="section-workspace__metric">
              مێژووی مامەڵە و پارەدانەکانی دابینکەران ({supplierPaymentLogs.length})
            </strong>
            <table>
              <thead>
                <tr>
                  <th>بەروار و کات</th>
                  <th>جۆری مامەڵە</th>
                  <th>بەکارهێنەر</th>
                  <th>وردەکاری</th>
                </tr>
              </thead>
              <tbody>
                {supplierPaymentLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ direction: 'ltr' }}>{formatDateTime(log.timestamp)}</td>
                    <td>
                      <strong>{log.action}</strong>
                    </td>
                    <td>{log.user}</td>
                    <td>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Pay Supplier */}
      {payingSup && (
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
              maxWidth: '410px',
              width: '100%',
              border: '1px solid #dde6f0'
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 900 }}>
              پارەدان بە دابینکەر: {payingSup.name}
            </h3>
            <p style={{ fontSize: '12px', color: '#536c85', margin: '0 0 14px' }}>
              شایستەی ماوە لەسەر مارکێت: <strong>{money(payingSup.balanceDebt)}</strong>
            </p>

            <form onSubmit={handleModalPaySubmit} style={{ display: 'grid', gap: '12px' }}>
              <label className="form-col">
                بڕی پارەی دراو (IQD) *
                <input
                  type="number"
                  value={modalPayAmt}
                  onChange={e => setModalPayAmt(e.target.value)}
                  max={payingSup.balanceDebt}
                  min="250"
                  required
                />
              </label>

              <label className="form-col">
                سەرچاوەی پارەدان
                <select
                  value={modalFromDrawer ? 'drawer' : 'safe'}
                  onChange={e => setModalFromDrawer(e.target.value === 'drawer')}
                >
                  <option value="drawer">لە سندووقی نەختینەی کاشێر</option>
                  <option value="safe">لە قاسەی سەرەکیی فرۆشگا</option>
                </select>
              </label>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  تۆمارکردنی پارەدان
                </button>
                <button type="button" className="secondary" onClick={() => setPayingSup(null)}>
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
