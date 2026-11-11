import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';
import { matchesUnitPriceQuery027 } from '../utils/unitPrices027';
import { CanvaStockOverview036 } from './CanvaStockOverview036';
import { CanvaStockHistory037 } from './CanvaStockHistory037';
import { CanvaStockWatch } from './CanvaStockWatch';
import { CanvaStockCount040 } from './CanvaStockCount040';
import { CanvaStockReceiving041 } from './CanvaStockReceiving041';
import { CanvaStockTransfer042 } from './CanvaStockTransfer042';

export const InventoryStockView: React.FC = () => {
  const { products, adjustStock, subtab, activeSectionId, navigateTo } =
    useApp();

  const resolveMode = (): 'overview' | 'low' | 'expiry' | 'receive' | 'movements' | 'transfer' | 'count' => {
    if (subtab === 'count') return 'count';
    if (activeSectionId === 'low-stock' || subtab === 'low') return 'low';
    if (activeSectionId === 'expiry' || subtab === 'expiry') return 'expiry';
    if (activeSectionId === 'stock-transfer') return subtab === 'transfer' ? 'transfer' : 'movements';
    if (activeSectionId === 'receive-goods' || subtab === 'receive') return 'receive';
    return 'overview';
  };

  const activeTab = resolveMode();
  const [search, setSearch] = useState('');

  // Stock Adjustment Modal
  const [adjustingProd, setAdjustingProd] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>('1');
  const [adjustMode, setAdjustMode] = useState<'unit' | 'carton'>('unit');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustReason, setAdjustReason] = useState('ژماردنی خولی کۆگا');

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

  const lowStockCount = products.filter(p => p.stock <= (p.min_stock ?? 10)).length;

  return (
    <div className="ws-stack stock-036-shell">
      {activeTab === 'count' && <CanvaStockCount040 />}

      {activeTab === 'receive' && <CanvaStockReceiving041 />}

      {activeTab === 'movements' && <CanvaStockHistory037 />}

      {activeTab === 'transfer' && <CanvaStockTransfer042 />}

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
