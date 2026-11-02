import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';
import { formatDateTime, money } from '../utils/retailHelpers';

export const InventoryStockView: React.FC = () => {
  const { products, suppliers, receiveStock, adjustStock, updateProduct, stockMovements, subtab, activeSectionId } =
    useApp();

  const resolveMode = (): 'overview' | 'low' | 'expiry' | 'receive' | 'movements' => {
    if (activeSectionId === 'low-stock' || subtab === 'low') return 'low';
    if (activeSectionId === 'expiry' || subtab === 'expiry') return 'expiry';
    if (activeSectionId === 'stock-transfer') return 'movements';
    if (activeSectionId === 'receive-goods' || subtab === 'receive') return 'receive';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'low' | 'expiry' | 'receive' | 'movements'>(resolveMode);

  useEffect(() => {
    setActiveTab(resolveMode());
  }, [subtab, activeSectionId]);

  const [search, setSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<'all' | 'receive' | 'sale' | 'return' | 'adjust'>('all');

  // Stock Receiving Form
  const [selectedProdId, setSelectedProdId] = useState(products[0]?.id || '');
  const [receiveMode, setReceiveMode] = useState<'unit' | 'carton'>('unit');
  const [receiveQty, setReceiveQty] = useState<string>('5');
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id || '');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [receiveMsg, setReceiveMsg] = useState<{ text: string; error: boolean } | null>(null);

  // Stock Transfer Form (in 'movements' tab)
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferProdId, setTransferProdId] = useState(products[0]?.id || '');
  const [transferDirection, setTransferDirection] = useState<'in' | 'out'>('in');
  const [transferMode, setTransferMode] = useState<'unit' | 'carton'>('unit');
  const [transferQty, setTransferQty] = useState<string>('10');
  const [transferNote, setTransferNote] = useState('گواستنەوە لە کۆگای سەرەکی بۆ ڕەفەی فرۆشگا');
  const [transferMsg, setTransferMsg] = useState<string | null>(null);
  const transferPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTransferForm) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (transferPopoverRef.current && !transferPopoverRef.current.contains(e.target as Node)) {
        setShowTransferForm(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTransferForm(false);
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTransferForm]);

  // Inline Expiry Date Editor
  const [editingExpiryId, setEditingExpiryId] = useState<string | null>(null);
  const [newExpiryValue, setNewExpiryValue] = useState<string>('');

  // Stock Adjustment Modal
  const [adjustingProd, setAdjustingProd] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>('1');
  const [adjustMode, setAdjustMode] = useState<'unit' | 'carton'>('unit');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustReason, setAdjustReason] = useState('ژماردنی خولی کۆگا');

  const selectedReceiveProd = products.find(x => x.id === selectedProdId);
  const receiveUnitCost =
    receiveMode === 'carton' && selectedReceiveProd?.carton?.purchase_price_iqd
      ? selectedReceiveProd.carton.purchase_price_iqd
      : selectedReceiveProd?.unit_purchase_price_iqd || 0;
  const totalReceiveInvoiceCost = receiveUnitCost * (parseFloat(receiveQty) || 0);

  const handleReceiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProdId) {
      setReceiveMsg({ text: 'تکایە کاڵا دیاریبکە', error: true });
      return;
    }
    const q = parseFloat(receiveQty);
    if (!Number.isFinite(q) || q <= 0) {
      setReceiveMsg({ text: 'بڕی وەرگیراو نادروستە', error: true });
      return;
    }

    receiveStock(selectedProdId, q, receiveMode, selectedSupplierId || undefined, invoiceNo || undefined);
    const p = products.find(x => x.id === selectedProdId);
    setReceiveMsg({
      text: `بڕی ${q} ${receiveMode === 'carton' ? 'کارتۆن' : 'دانە'} لە «${p?.name}» بە سەرکەوتوویی وەرگیرا و خرایە سەر کۆگا`,
      error: false
    });
    setReceiveQty('5');
    setInvoiceNo('');
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferProdId) return;
    const q = parseFloat(transferQty);
    if (!Number.isFinite(q) || q <= 0) return;
    const signedDelta = q * (transferDirection === 'in' ? 1 : -1);
    const p = products.find(x => x.id === transferProdId);
    adjustStock(
      transferProdId,
      signedDelta,
      transferMode,
      transferNote.trim() || 'گواستنەوەی ناوخۆیی کۆگا'
    );
    setTransferMsg(
      `گواستنەوەی ${q} ${transferMode === 'carton' ? 'کارتۆن' : 'یەکە'} لە «${p?.name || ''}» تۆمارکرا`
    );
    setTransferQty('10');
    setShowTransferForm(false);
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProd) return;
    const raw = parseFloat(adjustDelta);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const delta = raw * (adjustType === 'add' ? 1 : -1);
    adjustStock(adjustingProd.id, delta, adjustMode, adjustReason.trim() || 'ژماردنی کۆگا');
    setAdjustingProd(null);
  };

  const filteredProducts = products
    .filter(p => {
      const match = p.name.toLowerCase().includes(search.toLowerCase()) || p.unit_barcode.includes(search);
      if (!match) return false;
      if (activeTab === 'low') return p.stock <= (p.min_stock || 10);
      if (activeTab === 'expiry') return Boolean(p.expiry_date);
      return true;
    })
    .sort((a, b) => {
      if (activeTab === 'expiry') {
        return (a.expiry_date || '9999-12-31').localeCompare(b.expiry_date || '9999-12-31');
      }
      if (activeTab === 'low') {
        return a.stock - b.stock;
      }
      return 0;
    });

  const filteredMovements = stockMovements.filter(m => {
    const matchSearch =
      search === '' ||
      m.productName.toLowerCase().includes(search.toLowerCase()) ||
      m.reference.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (movementTypeFilter !== 'all' && m.type !== movementTypeFilter) return false;
    return true;
  });

  const totalUnitsInStock = products.reduce((s, p) => s + p.stock, 0);
  const lowStockCount = products.filter(p => p.stock <= (p.min_stock || 10)).length;
  const expiryTrackedCount = products.filter(p => Boolean(p.expiry_date)).length;

  const getDaysUntilExpiry = (dateStr?: string | null): number | null => {
    if (!dateStr) return null;
    const target = new Date(dateStr).getTime();
    if (Number.isNaN(target)) return null;
    return Math.ceil((target - Date.now()) / (1000 * 3600 * 24));
  };

  return (
    <div className="ws-stack">
      {/* 1. RECEIVE GOODS SUBMODULE (وەرگرتنی کاڵا) */}
      {activeTab === 'receive' && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی جووڵەی وەرگرتن لە دابینکەران</span>
              <span className="ws-kpi-value positive">
                {stockMovements.filter(m => m.type === 'receive').length} وەسڵ
              </span>
              <span className="ws-kpi-sub">هاوردەی کاڵا بۆ ناو کۆگای مارکێت</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">تێچووی چاوەڕوانکراوی وەسڵی ئێستا</span>
              <span className="ws-kpi-value">{money(totalReceiveInvoiceCost)}</span>
              <span className="ws-kpi-sub">ڕاستەوخۆ دەچێتە سەر حیسابی دابینکەر</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی یەکەکانی ناو کۆگا</span>
              <span className="ws-kpi-value">{totalUnitsInStock.toLocaleString('en-US')}</span>
              <span className="ws-kpi-sub">لە سەرجەم کاڵاکانی فرۆشگا</span>
            </div>
          </div>

          <div className="ws-panel">
            <h2 className="ws-panel-title">تۆمارکردنی وەرگرتنی کاڵا لە دابینکەر بۆ ناو کۆگا</h2>
            {receiveMsg && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  background: receiveMsg.error ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${receiveMsg.error ? '#fca5a5' : '#bbf7d0'}`,
                  color: receiveMsg.error ? '#991b1b' : '#166534',
                  fontWeight: 800,
                  fontSize: '12px'
                }}
              >
                {receiveMsg.text}
              </div>
            )}

            <form onSubmit={handleReceiveSubmit} className="ws-form-grid">
              <label className="form-col">
                دابینکەر / کۆمپانیا
                <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)}>
                  <option value="">-- هەڵبژاردنی دابینکەر (کڕینی نەختینە) --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (قەرز: {money(s.balanceDebt)})
                    </option>
                  ))}
                </select>
              </label>

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
                      {p.name} (کۆگا: {p.stock})
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-col">
                شێوازی وەرگرتن
                <select
                  value={receiveMode}
                  onChange={e => setReceiveMode(e.target.value as 'unit' | 'carton')}
                >
                  <option value="unit">دانە / کگم ({money(selectedReceiveProd?.unit_purchase_price_iqd || 0)})</option>
                  <option value="carton" disabled={!selectedReceiveProd?.carton}>
                    {selectedReceiveProd?.carton
                      ? `کارتۆن (${selectedReceiveProd.carton.units_per_carton} دانە · ${money(selectedReceiveProd.carton.purchase_price_iqd || 0)})`
                      : 'کارتۆن (بەردەست نییە)'}
                  </option>
                </select>
              </label>

              <label className="form-col">
                بڕی وەرگیراو *
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={receiveQty}
                  onChange={e => setReceiveQty(e.target.value)}
                  required
                />
              </label>

              <label className="form-col">
                ژمارەی وەسڵی کڕین
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  dir="ltr"
                  placeholder="INV-9842"
                />
              </label>

              <button type="submit" className="primary">
                پاشەکەوتکردنی وەرگرتن ({money(totalReceiveInvoiceCost)})
              </button>
            </form>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              تۆماری وەرگرتن و جووڵەکانی کۆگا ({stockMovements.length} جووڵە)
            </strong>
            <table>
              <thead>
                <tr>
                  <th>بەروار و کات</th>
                  <th>ناوی کاڵا</th>
                  <th>جۆری جووڵە</th>
                  <th>بڕی زیادبوو / کەمبوو</th>
                  <th>کۆگای پێشوو</th>
                  <th>کۆگای نوێ</th>
                  <th>ئاماژە</th>
                </tr>
              </thead>
              <tbody>
                {stockMovements.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={7}>
                      هیچ وەرگرتنێکی نوێ تۆمارنەکراوە
                    </td>
                  </tr>
                ) : (
                  stockMovements.map(m => (
                    <tr key={m.id}>
                      <td style={{ direction: 'ltr' }}>{formatDateTime(m.createdAt)}</td>
                      <td>
                        <strong>{m.productName}</strong>
                      </td>
                      <td>
                        <span
                          className={`ws-badge ${
                            m.type === 'receive' || m.type === 'return'
                              ? 'success'
                              : m.type === 'sale'
                              ? 'warning'
                              : ''
                          }`}
                        >
                          {m.type === 'receive'
                            ? 'وەرگرتن (کڕین)'
                            : m.type === 'sale'
                            ? 'فرۆشتن'
                            : m.type === 'return'
                            ? 'گەڕاندنەوە'
                            : 'گواستنەوە / ڕێکخستن'}
                        </span>
                      </td>
                      <td
                        style={{
                          direction: 'ltr',
                          fontWeight: 900,
                          color: m.quantityDelta > 0 ? '#15803d' : '#b91c1c'
                        }}
                      >
                        {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                      </td>
                      <td>{m.previousStock}</td>
                      <td>
                        <strong>{m.newStock}</strong>
                      </td>
                      <td>{m.reference}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 2. STOCK MOVEMENTS & TRANSFERS SUBMODULE (گواستنەوەی کۆگا) */}
      {activeTab === 'movements' && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی گشتیی جووڵەکانی کۆگا</span>
              <span className="ws-kpi-value">{stockMovements.length}</span>
              <span className="ws-kpi-sub">وەرگرتن، فرۆشتن، گەڕاندنەوە و گواستنەوە</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">یەکەی هاتوو بۆ ناو کۆگا (+)</span>
              <span className="ws-kpi-value positive">
                +{stockMovements.filter(m => m.quantityDelta > 0).reduce((s, m) => s + m.quantityDelta, 0)}
              </span>
              <span className="ws-kpi-sub">کۆی زیادبوونی بڕی بەردەست</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">یەکەی دەرچوو لە کۆگا (−)</span>
              <span className="ws-kpi-value negative">
                {stockMovements.filter(m => m.quantityDelta < 0).reduce((s, m) => s + m.quantityDelta, 0)}
              </span>
              <span className="ws-kpi-sub">کۆی فرۆشراو و دەرچوو لە کۆگا</span>
            </div>
          </div>

          <div ref={transferPopoverRef} className="ws-panel" style={{ position: 'relative' }}>
            {transferMsg && (
              <div
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: '12px',
                  fontWeight: 800,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{transferMsg}</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setTransferMsg(null)}
                  style={{ height: '22px', padding: '0 8px', fontSize: '10px' }}
                >
                  داخستن
                </button>
              </div>
            )}

            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {(
                  [
                    ['all', 'هەموو جووڵەکان'],
                    ['receive', 'وەرگرتن'],
                    ['sale', 'فرۆشتن'],
                    ['return', 'گەڕاندنەوە'],
                    ['adjust', 'گواستنەوە / ڕێکخستن']
                  ] as const
                ).map(([typeKey, label]) => (
                  <button
                    key={typeKey}
                    type="button"
                    className={movementTypeFilter === typeKey ? 'primary' : 'secondary'}
                    onClick={() => setMovementTypeFilter(typeKey)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input-search"
                  placeholder="گەڕان بە ناوی کاڵا یان ئاماژە..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <button
                  type="button"
                  className="primary"
                  onClick={() => setShowTransferForm(!showTransferForm)}
                >
                  {showTransferForm ? 'داخستنی فۆڕم ▲' : '+ تۆمارکردنی گواستنەوەی نوێ ▼'}
                </button>
              </div>
            </div>

            {showTransferForm && (
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
                <h2 className="ws-panel-title">
                  تۆمارکردنی گواستنەوەی کاڵا لە نێوان کۆگای سەرەکی و ڕەفەی فرۆشگا
                </h2>
                <form onSubmit={handleTransferSubmit} className="ws-form-grid">
                  <label className="form-col">
                    کاڵا *
                    <select
                      value={transferProdId}
                      onChange={e => {
                        setTransferProdId(e.target.value);
                        const p = products.find(x => x.id === e.target.value);
                        if (p && !p.carton) setTransferMode('unit');
                      }}
                    >
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} (کۆگا: {p.stock})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-col">
                    ئاڕاستەی گواستنەوە
                    <select value={transferDirection} onChange={e => setTransferDirection(e.target.value as 'in' | 'out')}>
                      <option value="in">زیادکردن بۆ ڕەفەی فرۆشگا (+)</option>
                      <option value="out">کەمکردنەوە / گەڕاندنەوە بۆ کۆگای دەرەکی (−)</option>
                    </select>
                  </label>

                  <label className="form-col">
                    یەکەی گواستنەوە
                    <select value={transferMode} onChange={e => setTransferMode(e.target.value as 'unit' | 'carton')}>
                      <option value="unit">دانە / کگم</option>
                      <option
                        value="carton"
                        disabled={!products.find(x => x.id === transferProdId)?.carton}
                      >
                        کارتۆن
                      </option>
                    </select>
                  </label>

                  <label className="form-col">
                    بڕ *
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={transferQty}
                      onChange={e => setTransferQty(e.target.value)}
                      required
                    />
                  </label>

                  <label className="form-col">
                    ئاماژە / شوێنی گواستنەوە
                    <input
                      type="text"
                      value={transferNote}
                      onChange={e => setTransferNote(e.target.value)}
                      placeholder="گواستنەوە لە کۆگای سەرەکی بۆ ڕەفە..."
                    />
                  </label>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="submit" className="primary">
                      تۆمارکردنی گواستنەوە
                    </button>
                    <button type="button" className="secondary" onClick={() => setShowTransferForm(false)}>
                      داخستن
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              تۆماری جووڵە و گواستنەوەکانی کۆگا ({filteredMovements.length} جووڵە)
            </strong>
            <table>
              <thead>
                <tr>
                  <th>بەروار و کات</th>
                  <th>ناوی کاڵا</th>
                  <th>جۆری جووڵە</th>
                  <th>بڕ</th>
                  <th>کۆگای پێشوو</th>
                  <th>کۆگای نوێ</th>
                  <th>ئاماژە / هۆکار</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={7}>
                      هیچ جووڵەیەکی کۆگا بەپێی ئەم پاڵاوتنە نەدۆزرایەوە
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map(m => (
                    <tr key={m.id}>
                      <td style={{ direction: 'ltr' }}>{formatDateTime(m.createdAt)}</td>
                      <td>
                        <strong>{m.productName}</strong>
                      </td>
                      <td>
                        <span
                          className={`ws-badge ${
                            m.type === 'receive' || m.type === 'return'
                              ? 'success'
                              : m.type === 'sale'
                              ? 'warning'
                              : ''
                          }`}
                        >
                          {m.type === 'receive'
                            ? 'وەرگرتن (کڕین)'
                            : m.type === 'sale'
                            ? 'فرۆشتن'
                            : m.type === 'return'
                            ? 'گەڕاندنەوە'
                            : 'گواستنەوە / ڕێکخستن'}
                        </span>
                      </td>
                      <td
                        style={{
                          direction: 'ltr',
                          fontWeight: 900,
                          color: m.quantityDelta > 0 ? '#15803d' : '#b91c1c'
                        }}
                      >
                        {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                      </td>
                      <td>{m.previousStock}</td>
                      <td>
                        <strong>{m.newStock}</strong>
                      </td>
                      <td>{m.reference}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 3. OVERVIEW, LOW STOCK, OR EXPIRY SUBMODULES */}
      {(activeTab === 'overview' || activeTab === 'low' || activeTab === 'expiry') && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی یەکەکانی ناو کۆگا</span>
              <span className="ws-kpi-value">{totalUnitsInStock.toLocaleString('en-US')}</span>
              <span className="ws-kpi-sub">لە سەرجەم کاڵا چالاکەکانی فرۆشگا</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کاڵا کەمبووەکان</span>
              <span className={`ws-kpi-value ${lowStockCount > 0 ? 'negative' : 'positive'}`}>
                {lowStockCount}
              </span>
              <span className="ws-kpi-sub">پێویستی بە داواکردنەوەی کڕینە</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کاڵای خاوەن بەرواری بەسەرچوون (FEFO)</span>
              <span className="ws-kpi-value">{expiryTrackedCount}</span>
              <span className="ws-kpi-sub">چاودێریکراو بەپێی نزیکترین بەروار</span>
            </div>
          </div>

          <div className="ws-panel">
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <span style={{ fontWeight: 900, fontSize: '13px', color: '#1d3450' }}>
                {activeTab === 'low'
                  ? 'لیستی کاڵا کەمبووەکانی کۆگا (کۆگا ≤ کەمترین بڕ)'
                  : activeTab === 'expiry'
                  ? 'چاودێری بەرواری بەسەرچوونی کاڵاکان (ڕیزبەندکراو بەپێی FEFO)'
                  : 'باڵانسی یەکە و کارتۆنی کاڵاکانی ناو کۆگا'}
              </span>
              <input
                type="text"
                className="input-search"
                placeholder="گەڕان لە کۆگا بە ناو یان بارکۆد..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              {activeTab === 'low'
                ? `کاڵا کەمبووەکان لە کۆگا (${filteredProducts.length} کاڵا)`
                : activeTab === 'expiry'
                ? `کاڵاکانی خاوەن بەرواری بەسەرچوون (${filteredProducts.length} کاڵا)`
                : `لیستی بڕی بەردەستی کاڵاکان (${filteredProducts.length} کاڵا)`}
            </strong>
            <table>
              <thead>
                <tr>
                  <th>ناوی کاڵا</th>
                  <th>بارکۆد</th>
                  <th>بڕی بەردەست</th>
                  <th>کەمترین بڕ</th>
                  <th>یەکە</th>
                  <th>هاوتای کارتۆن</th>
                  {activeTab === 'expiry' && <th>بەرواری بەسەرچوون</th>}
                  {activeTab === 'expiry' && <th>ماوەی ماوە</th>}
                  <th>کردار</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={activeTab === 'expiry' ? 9 : 7}>
                      هیچ کاڵایەک لەم پۆلەدا نەدۆزرایەوە
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(p => {
                    const cartonEquiv = p.carton
                      ? (p.stock / p.carton.units_per_carton).toFixed(1)
                      : null;
                    const daysLeft = getDaysUntilExpiry(p.expiry_date);

                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td style={{ direction: 'ltr', fontWeight: 800 }}>{p.unit_barcode}</td>
                        <td
                          style={{
                            fontWeight: 900,
                            color: p.stock <= 0 ? '#b91c1c' : p.stock <= (p.min_stock || 10) ? '#b45309' : '#15803d'
                          }}
                        >
                          {p.stock}
                        </td>
                        <td>{p.min_stock || 10}</td>
                        <td>{p.base_unit === 'kg' ? 'کیلۆگرام' : 'دانە'}</td>
                        <td>
                          {cartonEquiv
                            ? `${cartonEquiv} کارتۆن (${p.carton?.units_per_carton} دانە)`
                            : '—'}
                        </td>
                        {activeTab === 'expiry' && (
                          <td style={{ direction: 'ltr', fontWeight: 900 }}>
                            {editingExpiryId === p.id ? (
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <input
                                  type="date"
                                  value={newExpiryValue}
                                  onChange={e => setNewExpiryValue(e.target.value)}
                                  style={{ padding: '3px 6px' }}
                                />
                                <button
                                  type="button"
                                  className="primary"
                                  onClick={() => {
                                    if (newExpiryValue) {
                                      updateProduct(p.id, { expiry_date: newExpiryValue });
                                    }
                                    setEditingExpiryId(null);
                                  }}
                                >
                                  پاشەکەوت
                                </button>
                              </div>
                            ) : (
                              p.expiry_date || '—'
                            )}
                          </td>
                        )}
                        {activeTab === 'expiry' && (
                          <td>
                            {daysLeft !== null ? (
                              <span
                                className={`ws-badge ${
                                  daysLeft <= 0 ? 'danger' : daysLeft <= 30 ? 'warning' : 'success'
                                }`}
                              >
                                {daysLeft <= 0
                                  ? 'بەسەرچووە'
                                  : daysLeft <= 30
                                  ? `${daysLeft} ڕۆژ ماوە (نزیک)`
                                  : `${daysLeft} ڕۆژ ماوە`}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        )}
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {activeTab === 'low' && (
                              <button
                                type="button"
                                className="primary"
                                onClick={() =>
                                  adjustStock(p.id, 20, 'unit', 'پڕکردنەوەی خێرای کاڵای کەمبوو')
                                }
                              >
                                + پڕکردنەوە (20)
                              </button>
                            )}
                            {activeTab === 'expiry' && (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                  setEditingExpiryId(p.id);
                                  setNewExpiryValue(p.expiry_date || '2027-01-01');
                                }}
                              >
                                نوێکردنەوەی بەروار
                              </button>
                            )}
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setAdjustingProd(p);
                                setAdjustMode('unit');
                                setAdjustDelta('1');
                              }}
                            >
                              ڕێکخستنی بڕ (+/−)
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

      {/* Adjust Stock Modal */}
      {adjustingProd && (
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
              ڕێکخستنی بڕی کۆگا: {adjustingProd.name}
            </h3>
            <p style={{ fontSize: '12px', color: '#536c85', margin: '0 0 14px' }}>
              بڕی ئێستا لە کۆگا: <strong>{adjustingProd.stock}</strong>{' '}
              {adjustingProd.base_unit === 'kg' ? 'کیلۆگرام' : 'دانە'}
            </p>

            <form onSubmit={handleAdjustSubmit} style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className={adjustType === 'add' ? 'primary' : 'secondary'}
                  onClick={() => setAdjustType('add')}
                >
                  زیادکردن (+)
                </button>
                <button
                  type="button"
                  className={adjustType === 'subtract' ? 'primary' : 'secondary'}
                  onClick={() => setAdjustType('subtract')}
                >
                  کەمکردنەوە (−)
                </button>
              </div>

              <label className="form-col">
                یەکەی گۆڕانکاری
                <select value={adjustMode} onChange={e => setAdjustMode(e.target.value as 'unit' | 'carton')}>
                  <option value="unit">{adjustingProd.base_unit === 'kg' ? 'کیلۆگرام' : 'دانە'}</option>
                  <option value="carton" disabled={!adjustingProd.carton}>
                    {adjustingProd.carton
                      ? `کارتۆن (${adjustingProd.carton.units_per_carton} دانە)`
                      : 'کارتۆن (بەردەست نییە)'}
                  </option>
                </select>
              </label>

              <label className="form-col">
                بڕی گۆڕانکاری
                <input
                  type="number"
                  min="0.1"
                  step="any"
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
                  placeholder="ژماردنی کۆگا، تەلەفبوون..."
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button type="submit" className="primary" style={{ flex: 1 }}>
                  تۆمارکردن
                </button>
                <button type="button" className="secondary" onClick={() => setAdjustingProd(null)}>
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
