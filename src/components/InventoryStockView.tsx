import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { money, formatDateTime } from '../utils/retailHelpers';

export const InventoryStockView: React.FC = () => {
  const { products, suppliers, receiveStock, adjustStock, stockMovements, subtab } = useApp();

  const [activeTab, setActiveTab] = useState<'overview' | 'low' | 'expiry' | 'receive' | 'movements'>(
    (subtab as any) || 'overview'
  );

  const [search, setSearch] = useState('');

  // Stock Receiving Form
  const [selectedProdId, setSelectedProdId] = useState('');
  const [receiveMode, setReceiveMode] = useState<'unit' | 'carton'>('carton');
  const [receiveQty, setReceiveQty] = useState<string>('5');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [receiveMsg, setReceiveMsg] = useState<{ text: string; error: boolean } | null>(null);

  // Stock Adjustment Modal
  const [adjustingProd, setAdjustingProd] = useState<any | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>('1');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustReason, setAdjustReason] = useState('ژماردنی خولی کۆگا');

  const handleReceiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProdId) {
      setReceiveMsg({ text: 'تکایە کاڵا دیاریبکە', error: true });
      return;
    }
    const q = parseInt(receiveQty);
    if (!Number.isSafeInteger(q) || q <= 0) {
      setReceiveMsg({ text: 'بڕی وەرگیراو نادروستە', error: true });
      return;
    }

    receiveStock(selectedProdId, q, receiveMode, selectedSupplierId || undefined, invoiceNo || undefined);
    const p = products.find(x => x.id === selectedProdId);
    setReceiveMsg({
      text: `بڕی ${q} ${receiveMode === 'carton' ? 'کارتۆن' : 'دانە'} لە ${p?.name} بە سەرکەوتوویی وەرگیرا`,
      error: false
    });
    setReceiveQty('5');
    setInvoiceNo('');
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProd) return;
    const delta = parseInt(adjustDelta) * (adjustType === 'add' ? 1 : -1);
    adjustStock(adjustingProd.id, delta, 'unit', adjustReason);
    setAdjustingProd(null);
  };

  // Filtered products
  const filteredProducts = products.filter(p => {
    const match = p.name.toLowerCase().includes(search.toLowerCase()) || p.unit_barcode.includes(search);
    if (!match) return false;
    if (activeTab === 'low') return p.stock <= (p.min_stock || 10);
    if (activeTab === 'expiry') return Boolean(p.expiry_date);
    return true;
  });

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: '#0f172a' }}>
          بەڕێوەبردنی کۆگا و وەرگرتنی کاڵا
        </h1>
        <div className="tabs" style={{ margin: 0 }}>
          <button
            type="button"
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            دۆخی گشتی کۆگا
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'low' ? 'active' : ''}`}
            onClick={() => setActiveTab('low')}
          >
            کاڵای کەمبوونەوە
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'expiry' ? 'active' : ''}`}
            onClick={() => setActiveTab('expiry')}
          >
            بەسەرچوون
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'receive' ? 'active' : ''}`}
            onClick={() => setActiveTab('receive')}
          >
            وەرگرتنی کاڵا (کڕین)
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'movements' ? 'active' : ''}`}
            onClick={() => setActiveTab('movements')}
          >
            مێژووی هاتووچۆ ({stockMovements.length})
          </button>
        </div>
      </div>

      {/* Tab: Receive Stock (وەرگرتنی کاڵا) */}
      {activeTab === 'receive' && (
        <div className="surface" style={{ background: '#fff', padding: '24px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45', marginBottom: '16px' }}>
            فۆڕمی وەرگرتنی کاڵا لە دابینکەر
          </h2>

          {receiveMsg && (
            <div
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                marginBottom: '16px',
                background: receiveMsg.error ? '#fef2f2' : '#f0fdf4',
                border: `1.5px solid ${receiveMsg.error ? '#fca5a5' : '#bbf7d0'}`,
                color: receiveMsg.error ? '#991b1b' : '#166534',
                fontWeight: 800,
                fontSize: '13px'
              }}
            >
              {receiveMsg.text}
            </div>
          )}

          <form onSubmit={handleReceiveSubmit} style={{ display: 'grid', gap: '16px', maxWidth: '750px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label className="form-col">
                دیاریکردنی دابینکەر
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                >
                  <option value="">-- هەڵبژاردنی کۆمپانیا/دابینکەر --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-col">
                ژمارەی پسووڵەی کڕین
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  placeholder="بۆ نموونە: INV-9842"
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '12px' }}>
              <label className="form-col">
                کاڵا *
                <select
                  value={selectedProdId}
                  onChange={e => {
                    setSelectedProdId(e.target.value);
                    const p = products.find(x => x.id === e.target.value);
                    if (p && !p.carton) setReceiveMode('unit');
                  }}
                  required
                >
                  <option value="">-- کاڵا هەڵبژێرە --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (کۆگای ئێستا: {p.stock})
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-col">
                شێوازی وەرگرتن
                <select
                  value={receiveMode}
                  onChange={e => setReceiveMode(e.target.value as any)}
                >
                  <option value="carton">کارتۆن</option>
                  <option value="unit">دانە / کگم</option>
                </select>
              </label>

              <label className="form-col">
                بڕی وەرگیراو *
                <input
                  type="number"
                  min="1"
                  value={receiveQty}
                  onChange={e => setReceiveQty(e.target.value)}
                  required
                />
              </label>
            </div>

            <button type="submit" className="primary" style={{ width: '200px' }}>
              📥 پاشەکەوتکردنی وەرگرتن
            </button>
          </form>
        </div>
      )}

      {/* Tab: Stock Movements Log */}
      {activeTab === 'movements' && (
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45', marginBottom: '16px' }}>
            تۆماری هاتووچۆی کاڵاکان لە کۆگا
          </h2>
          {stockMovements.length === 0 ? (
            <div className="blank">هیچ جووڵەیەکی کۆگا تۆمارنەکراوە</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>بەروار و کات</th>
                  <th>ناوی کاڵا</th>
                  <th>جۆری جووڵە</th>
                  <th>بڕ</th>
                  <th>کۆگای پێشوو</th>
                  <th>کۆگای نوێ</th>
                  <th>ئاماژە</th>
                </tr>
              </thead>
              <tbody>
                {stockMovements.map(m => (
                  <tr key={m.id}>
                    <td style={{ direction: 'ltr' }}>{formatDateTime(m.createdAt)}</td>
                    <td>
                      <strong>{m.productName}</strong>
                    </td>
                    <td>
                      <span
                        className={`stock-badge ${
                          m.type === 'receive' ? 'ok' : m.type === 'sale' ? 'info' : 'warn'
                        }`}
                      >
                        {m.type === 'receive'
                          ? 'وەرگرتن (کڕین)'
                          : m.type === 'sale'
                          ? 'فرۆشتن'
                          : m.type === 'return'
                          ? 'گەڕاندنەوە'
                          : 'ڕێکخستنی کۆگا'}
                      </span>
                    </td>
                    <td style={{ direction: 'ltr', fontWeight: 900 }}>
                      <span style={{ color: m.quantityDelta > 0 ? '#15803d' : '#b91c1c' }}>
                        {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                      </span>
                    </td>
                    <td>{m.previousStock}</td>
                    <td>
                      <strong>{m.newStock}</strong>
                    </td>
                    <td>{m.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tabs: Overview, Low Stock, Expiry */}
      {(activeTab === 'overview' || activeTab === 'low' || activeTab === 'expiry') && (
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <div className="toolbar">
            <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45' }}>
              {activeTab === 'low'
                ? 'کاڵا کەمبووەکانی کۆگا (پێویستی بە داواکردنەوە)'
                : activeTab === 'expiry'
                ? 'چاودێری بەرواری بەسەرچوونی کاڵاکان'
                : 'دۆخی یەکە و کارتۆنی کاڵاکان'}
            </h2>

            <input
              type="text"
              className="input-search"
              placeholder="گەڕان لە کۆگا..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>ناوی کاڵا</th>
                <th>بارکۆد</th>
                <th>بڕی بەردەست</th>
                <th>یەکە</th>
                <th>بەرامبەری بە کارتۆن</th>
                {activeTab === 'expiry' && <th>بەرواری بەسەرچوون</th>}
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const cartonEquiv = p.carton
                  ? (p.stock / p.carton.units_per_carton).toFixed(1)
                  : null;

                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td>
                      <code style={{ direction: 'ltr', display: 'inline-block' }}>{p.unit_barcode}</code>
                    </td>
                    <td>
                      <span
                        className={`stock-badge ${
                          p.stock <= 0 ? 'danger' : p.stock <= (p.min_stock || 10) ? 'warn' : 'ok'
                        }`}
                      >
                        {p.stock}
                      </span>
                    </td>
                    <td>{p.base_unit === 'kg' ? 'کگم (kg)' : 'دانە'}</td>
                    <td>
                      {cartonEquiv ? (
                        <span>
                          {cartonEquiv} کارتۆن ({p.carton?.units_per_carton} لە دانەیەک)
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    {activeTab === 'expiry' && (
                      <td>
                        <strong style={{ color: '#d97706', direction: 'ltr', display: 'inline-block' }}>
                          {p.expiry_date || 'تۆمارنەکراوە'}
                        </strong>
                      </td>
                    )}
                    <td>
                      <button
                        type="button"
                        className="catalog-table-btn"
                        onClick={() => setAdjustingProd(p)}
                      >
                        ڕێکخستنی بڕ (+/−)
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustingProd && (
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
            <h3 style={{ margin: '0 0 10px', fontSize: '16px' }}>ڕێکخستنی کۆگای: {adjustingProd.name}</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
              کۆگای ئێستا: <strong>{adjustingProd.stock}</strong>
            </p>

            <form onSubmit={handleAdjustSubmit} style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setAdjustType('add')}
                  style={{
                    height: '38px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: adjustType === 'add' ? '#dcfce7' : '#f8fafc',
                    color: adjustType === 'add' ? '#15803d' : '#334155',
                    fontWeight: 900
                  }}
                >
                  ➕ زیادکردن
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('subtract')}
                  style={{
                    height: '38px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: adjustType === 'subtract' ? '#fee2e2' : '#f8fafc',
                    color: adjustType === 'subtract' ? '#b91c1c' : '#334155',
                    fontWeight: 900
                  }}
                >
                  ➖ کەمکردنەوە
                </button>
              </div>

              <label className="form-col">
                بڕ
                <input
                  type="number"
                  min="1"
                  value={adjustDelta}
                  onChange={e => setAdjustDelta(e.target.value)}
                  required
                />
              </label>

              <label className="form-col">
                هۆکاری گۆڕانکاری
                <input
                  type="text"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="بۆ نموونە: ژماردنی کۆگا، شکاو..."
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  تۆمارکردن
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setAdjustingProd(null)}
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
