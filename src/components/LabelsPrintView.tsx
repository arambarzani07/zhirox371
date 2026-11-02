import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';

export const LabelsPrintView: React.FC = () => {
  const { products, activeSectionId } = useApp();

  const isBarcodeMode = activeSectionId === 'label-barcode';
  const isBatchMode = activeSectionId === 'batch-print';

  const [selectedIds, setSelectedIds] = useState<string[]>(products.map(p => p.id));
  const [copiesByProd, setCopiesByProd] = useState<Record<string, number>>(() =>
    Object.fromEntries(products.map(p => [p.id, 1]))
  );
  const [labelSize, setLabelSize] = useState<'normal' | 'compact'>('normal');
  const [search, setSearch] = useState('');
  const [includeCartonBarcode, setIncludeCartonBarcode] = useState(true);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const selectAll = () => setSelectedIds(products.map(p => p.id));
  const clearSelection = () => setSelectedIds([]);

  const setCopies = (id: string, qty: number) => {
    setCopiesByProd(prev => ({ ...prev, [id]: Math.max(1, Math.min(50, qty || 1)) }));
  };

  const filteredProducts = products.filter(
    p =>
      search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.unit_barcode.includes(search) ||
      (p.carton && p.carton.barcode.includes(search))
  );

  const selectedProducts = filteredProducts.filter(p => selectedIds.includes(p.id));
  const totalStickersCount = selectedProducts.reduce((sum, p) => sum + (copiesByProd[p.id] || 1), 0);

  return (
    <div className="ws-stack">
      <div className="ws-kpi-grid">
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">کاڵا هەڵبژێردراوەکان بۆ چاپ</span>
          <span className="ws-kpi-value">{selectedProducts.length}</span>
          <span className="ws-kpi-sub">لە کۆی {products.length} کاڵای ناو کەتەلۆگ</span>
        </div>
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">کۆی ژمارەی لیبڵ و ستیکەری ئامادە</span>
          <span className="ws-kpi-value positive">{totalStickersCount}</span>
          <span className="ws-kpi-sub">لیبڵی ئامادە بۆ ناردن بۆ پرینتەر</span>
        </div>
        <div className="ws-kpi-card">
          <span className="ws-kpi-label">قەبارە و فۆرماتی کاغەز</span>
          <span className="ws-kpi-value">{labelSize === 'normal' ? '38×25mm' : '30×20mm'}</span>
          <span className="ws-kpi-sub">
            {isBarcodeMode ? 'ستیکەری بارکۆدی EAN-13 و کارتۆن' : 'لیبڵی نرخی ڕەفەی سوپەرمارکێت'}
          </span>
        </div>
      </div>

      <div className="ws-panel">
        <div className="ws-toolbar" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input-search"
              placeholder="گەڕان بە ناوی کاڵا یان بارکۆد..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="input-search"
              style={{ width: '215px' }}
              value={labelSize}
              onChange={e => setLabelSize(e.target.value as 'normal' | 'compact')}
            >
              <option value="normal">قەبارەی ستانداردی ڕەفە (38×25mm)</option>
              <option value="compact">قەبارەی بچووک (30×20mm)</option>
            </select>
            {isBarcodeMode && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800 }}>
                <input
                  type="checkbox"
                  checked={includeCartonBarcode}
                  onChange={e => setIncludeCartonBarcode(e.target.checked)}
                />
                پیشاندانی بارکۆدی کارتۆن
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
              چاپکردن ({totalStickersCount} لیبڵ)
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isBatchMode || isBarcodeMode ? 'minmax(0, 1.15fr) minmax(0, 1fr)' : '1fr',
          gap: '10px',
          alignItems: 'start',
          flex: '0 1 auto',
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        {/* In Batch Mode or Barcode Mode: show selection & copy count table */}
        {(isBatchMode || isBarcodeMode) && (
          <div className="section-workspace__table" style={{ height: 'auto', maxHeight: '100%' }}>
            <strong className="section-workspace__metric">
              {isBarcodeMode
                ? `خشتەی بارکۆدی یەکە و کارتۆن بۆ چاپ (${filteredProducts.length} کاڵا)`
                : `ڕێکخستنی ژمارەی نوسخەی چاپی بەکۆمەڵ (${selectedProducts.length} هەڵبژێردراو)`}
            </strong>
            <table>
              <thead>
                <tr>
                  <th>هەڵبژاردن</th>
                  <th>ناوی کاڵا</th>
                  <th>بارکۆدی یەکە</th>
                  <th>بارکۆدی کارتۆن</th>
                  <th>نرخی تاک</th>
                  <th>ژمارەی کۆپی</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => {
                  const checked = selectedIds.includes(p.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </td>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td style={{ direction: 'ltr', fontWeight: 900 }}>{p.unit_barcode}</td>
                      <td style={{ direction: 'ltr' }}>{p.carton ? p.carton.barcode : '—'}</td>
                      <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(p.unit_sale_price_iqd)}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={copiesByProd[p.id] || 1}
                          onChange={e => setCopies(p.id, parseInt(e.target.value, 10))}
                          style={{ width: '72px', padding: '4px 6px' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Printable Shelf Labels Grid */}
        <div
          id="shelf-labels-container"
          className="ws-panel"
          style={{
            height: 'auto',
            maxHeight: '100%',
            boxSizing: 'border-box',
            overflowY: 'auto',
            display: 'grid',
            alignContent: 'start',
            gridTemplateColumns:
              labelSize === 'normal'
                ? 'repeat(auto-fill, minmax(205px, 1fr))'
                : 'repeat(auto-fill, minmax(165px, 1fr))',
            gap: '10px'
          }}
        >
          {selectedProducts.length === 0 ? (
            <div className="blank" style={{ gridColumn: '1 / -1' }}>
              هیچ کاڵایەک هەڵنەبژێردراوە بۆ چاپکردن — کرتە لە «دیاریکردنی هەموو» بکە
            </div>
          ) : (
            selectedProducts.map(p => (
              <div
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                style={{
                  border: '1.5px solid #1d3450',
                  borderRadius: '10px',
                  padding: labelSize === 'normal' ? '12px 10px' : '9px 8px',
                  textAlign: 'center',
                  background: '#ffffff',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '10px', color: '#536c85', fontWeight: 800 }}>
                  سوپەرمارکێتی کانی چنار {(copiesByProd[p.id] || 1) > 1 ? `×${copiesByProd[p.id]}` : ''}
                </div>
                <strong
                  style={{
                    fontSize: labelSize === 'normal' ? '13.5px' : '12px',
                    display: 'block',
                    margin: '4px 0',
                    color: '#1d3450',
                    lineHeight: 1.35
                  }}
                >
                  {p.name}
                </strong>
                <div
                  style={{
                    fontSize: labelSize === 'normal' ? '20px' : '17px',
                    fontWeight: 900,
                    color: '#1d3450',
                    direction: 'ltr',
                    margin: '4px 0'
                  }}
                >
                  {money(p.unit_sale_price_iqd)}
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    letterSpacing: '1.5px',
                    fontSize: '11px',
                    fontWeight: 900,
                    direction: 'ltr',
                    color: '#334155'
                  }}
                >
                  ||||| {p.unit_barcode} |||||
                </div>
                {isBarcodeMode && includeCartonBarcode && p.carton && (
                  <div
                    style={{
                      marginTop: '6px',
                      paddingTop: '4px',
                      borderTop: '1px dashed #cbd5e1',
                      fontSize: '10px',
                      fontWeight: 800,
                      direction: 'ltr',
                      color: '#475569'
                    }}
                  >
                    CTN: {p.carton.barcode} ({money(p.carton.sale_price_iqd)})
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
