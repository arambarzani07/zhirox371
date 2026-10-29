import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';

export const LabelsPrintView: React.FC = () => {
  const { products } = useApp();
  const [selectedIds, setSelectedIds] = useState<string[]>(products.map(p => p.id));
  const [labelSize, setLabelSize] = useState<'normal' | 'compact'>('normal');

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const selectAll = () => setSelectedIds(products.map(p => p.id));
  const clearSelection = () => setSelectedIds([]);

  const selectedProducts = products.filter(p => selectedIds.includes(p.id));

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: '#0f172a' }}>
          چاپی لیبڵی نرخ و بارکۆدی ڕەفە
        </h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={labelSize}
            onChange={e => setLabelSize(e.target.value as any)}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 800 }}
          >
            <option value="normal">قەبارەی ئاسایی ڕەفە (Standard)</option>
            <option value="compact">قەبارەی بچووک (Compact)</option>
          </select>
          <button type="button" className="secondary" onClick={selectAll}>
            دیاریکردنی هەموو
          </button>
          <button type="button" className="secondary" onClick={clearSelection}>
            لابردنی هەموو
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => window.print()}
            disabled={selectedProducts.length === 0}
          >
            🖨️ چاپی کۆمەڵەیی ({selectedProducts.length})
          </button>
        </div>
      </div>

      {/* Printable Shelf Labels Grid */}
      <div
        id="shelf-labels-container"
        style={{
          display: 'grid',
          gridTemplateColumns:
            labelSize === 'normal'
              ? 'repeat(auto-fill, minmax(230px, 1fr))'
              : 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '14px',
          background: '#fff',
          padding: '24px',
          borderRadius: '16px',
          border: '1.5px solid #cbd5e1'
        }}
      >
        {selectedProducts.map(p => (
          <div
            key={p.id}
            onClick={() => toggleSelect(p.id)}
            style={{
              border: '2px solid #0f172a',
              borderRadius: '10px',
              padding: labelSize === 'normal' ? '14px 12px' : '10px 8px',
              textAlign: 'center',
              background: '#ffffff',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>
              سوپەرمارکێتی کانی چنار
            </div>
            <strong
              style={{
                fontSize: labelSize === 'normal' ? '15px' : '13px',
                display: 'block',
                margin: '4px 0 2px',
                color: '#0f172a',
                lineHeight: 1.3
              }}
            >
              {p.name}
            </strong>
            <div
              style={{
                fontSize: labelSize === 'normal' ? '26px' : '20px',
                fontWeight: 950,
                color: '#1e3a8a',
                direction: 'ltr',
                margin: '6px 0'
              }}
            >
              {money(p.unit_sale_price_iqd)}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                letterSpacing: '2px',
                fontSize: '11px',
                fontWeight: 900,
                direction: 'ltr',
                color: '#334155'
              }}
            >
              ||||| {p.unit_barcode} |||||
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
