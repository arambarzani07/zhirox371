import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';
import { formatDateTime } from '../utils/retailHelpers';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import { CanvaStockOverview036 } from './CanvaStockOverview036';
import { CanvaStockHistory037 } from './CanvaStockHistory037';
import { CanvaStockWatch } from './CanvaStockWatch';
import { CanvaStockCount040 } from './CanvaStockCount040';
import { CanvaStockReceiving041 } from './CanvaStockReceiving041';

export const InventoryStockView: React.FC = () => {
  const { products, adjustStock, stockMovements, subtab, activeSectionId, navigateTo } =
    useApp();

  const resolveMode = (): 'overview' | 'low' | 'expiry' | 'receive' | 'movements' | 'transfer' | 'count' => {
    if (subtab === 'count') return 'count';
    if (activeSectionId === 'low-stock' || subtab === 'low') return 'low';
    if (activeSectionId === 'expiry' || subtab === 'expiry') return 'expiry';
    if (activeSectionId === 'stock-transfer') return subtab === 'transfer' ? 'transfer' : 'movements';
    if (activeSectionId === 'receive-goods' || subtab === 'receive') return 'receive';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'low' | 'expiry' | 'receive' | 'movements' | 'transfer' | 'count'>(resolveMode);

  useEffect(() => {
    setActiveTab(resolveMode());
  }, [subtab, activeSectionId]);

  const [search, setSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<'all' | 'receive' | 'sale' | 'return' | 'adjust'>('all');

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

  // Stock Adjustment Modal
  const [adjustingProd, setAdjustingProd] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>('1');
  const [adjustMode, setAdjustMode] = useState<'unit' | 'carton'>('unit');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustReason, setAdjustReason] = useState('ژماردنی خولی کۆگا');

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

  const openStockAdjustment = (product: Product) => {
    setAdjustingProd(product);
    setAdjustMode('unit');
    setAdjustDelta('1');
  };

  const overviewQuery = search.trim().toLowerCase();
  const filteredProducts = overviewQuery
    ? products.filter(p => matchesUnitPriceQuery027(p, overviewQuery)
      || Boolean(p.category?.toLowerCase().includes(overviewQuery)))
    : products;

  const filteredMovements = stockMovements.filter(m => {
    const matchSearch =
      search === '' ||
      m.productName.toLowerCase().includes(search.toLowerCase()) ||
      m.reference.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (movementTypeFilter !== 'all' && m.type !== movementTypeFilter) return false;
    return true;
  });

  const lowStockCount = products.filter(p => p.stock <= (p.min_stock ?? 10)).length;
  const usesCanvaFrame = activeTab !== 'transfer';

  return (
    <div className={usesCanvaFrame ? 'ws-stack stock-036-shell' : 'ws-stack'}>
      {activeTab === 'count' && <CanvaStockCount040 />}

      {activeTab === 'receive' && <CanvaStockReceiving041 />}

      {activeTab === 'movements' && <CanvaStockHistory037 />}

      {activeTab === 'transfer' && (
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
              <button type="button" className="secondary"
                onClick={() => navigateTo('stock', 'receive', 'stock-transfer')}>گەڕانەوە بۆ جووڵەکان</button>
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

      {activeTab === 'overview' && (
        <CanvaStockOverview036 products={products} filteredProducts={filteredProducts}
          lowStockCount={lowStockCount} search={search} onSearch={setSearch}
          onAdjust={openStockAdjustment} onHome={() => navigateTo('home')}
          onCount={() => navigateTo('stock', 'count', 'stock-stack')}
          onMovements={() => navigateTo('stock', 'receive', 'stock-transfer')} />
      )}

      {(activeTab === 'low' || activeTab === 'expiry') && (
        <CanvaStockWatch key={activeTab} mode={activeTab} onAdjust={openStockAdjustment} />
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
              {activeTab === 'overview' && adjustingProd.carton && adjustingProd.carton.units_per_carton > 0 && (
                <> · {(adjustingProd.stock / adjustingProd.carton.units_per_carton).toFixed(1)} کارتۆن</>
              )}
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
