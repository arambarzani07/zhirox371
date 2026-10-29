import React, { useState, useId } from 'react';
import { useApp } from '../context/AppContext';
import { Product, SaleMode, BaseUnit } from '../types';
import { money, generateNextBarcode, parseCsvRows } from '../utils/retailHelpers';

export const ProductCatalogView: React.FC = () => {
  const { products, addProduct, updateProduct, deleteProduct, subtab } = useApp();

  const [activeTab, setActiveTab] = useState<'new' | 'list' | 'prices' | 'barcodes'>(
    (subtab as any) || 'list'
  );

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [plu, setPlu] = useState('');
  const [saleMode, setSaleMode] = useState<SaleMode>('unit');
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('unit');
  const [unitBarcode, setUnitBarcode] = useState('');
  const [unitBuyPrice, setUnitBuyPrice] = useState<string>('');
  const [unitSellPrice, setUnitSellPrice] = useState<string>('');
  const [extraBarcodes, setExtraBarcodes] = useState('');

  // Carton fields
  const [cartonName, setCartonName] = useState('');
  const [cartonBarcode, setCartonBarcode] = useState('');
  const [unitsPerCarton, setUnitsPerCarton] = useState<string>('24');
  const [cartonBuyPrice, setCartonBuyPrice] = useState<string>('');
  const [cartonSellPrice, setCartonSellPrice] = useState<string>('');
  const [extraCartonBarcodes, setExtraCartonBarcodes] = useState('');

  // Initial stock
  const [initialStock, setInitialStock] = useState<string>('50');

  // CSV Import state
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

  // Form message
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Label preview item
  const [selectedForLabel, setSelectedForLabel] = useState<Product | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSku('');
    setPlu('');
    setSaleMode('unit');
    setBaseUnit('unit');
    setUnitBarcode(generateNextBarcode('20'));
    setUnitBuyPrice('');
    setUnitSellPrice('');
    setExtraBarcodes('');
    setCartonName('');
    setCartonBarcode('');
    setUnitsPerCarton('24');
    setCartonBuyPrice('');
    setCartonSellPrice('');
    setExtraCartonBarcodes('');
    setInitialStock('50');
    setMessage(null);
  };

  const handleStartEdit = (p: Product) => {
    setEditingId(p.id);
    setName(p.name);
    setSku(p.sku || '');
    setPlu(p.plu || '');
    setSaleMode(p.sale_mode);
    setBaseUnit(p.base_unit);
    setUnitBarcode(p.unit_barcode);
    setUnitBuyPrice(p.unit_purchase_price_iqd !== null ? String(p.unit_purchase_price_iqd) : '');
    setUnitSellPrice(String(p.unit_sale_price_iqd));
    setExtraBarcodes(p.unit_alias_barcodes.join('\n'));

    if (p.carton) {
      setCartonName(p.carton.name || '');
      setCartonBarcode(p.carton.barcode);
      setUnitsPerCarton(String(p.carton.units_per_carton));
      setCartonBuyPrice(p.carton.purchase_price_iqd !== null ? String(p.carton.purchase_price_iqd) : '');
      setCartonSellPrice(String(p.carton.sale_price_iqd));
      setExtraCartonBarcodes(p.carton.alias_barcodes.join('\n'));
    } else {
      setCartonName('');
      setCartonBarcode('');
      setUnitsPerCarton('24');
      setCartonBuyPrice('');
      setCartonSellPrice('');
      setExtraCartonBarcodes('');
    }

    setInitialStock(String(p.stock));
    setActiveTab('new');
    setMessage(null);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ text: 'تکایە ناوی کاڵا بنووسە', error: true });
      return;
    }
    const sellPrice = parseInt(unitSellPrice);
    if (!Number.isSafeInteger(sellPrice) || sellPrice < 0) {
      setMessage({ text: 'نرخی فرۆشتن نادروستە', error: true });
      return;
    }
    if (!unitBarcode.trim()) {
      setMessage({ text: 'بارکۆدی کاڵا پێویستە', error: true });
      return;
    }

    const buyPrice = unitBuyPrice ? parseInt(unitBuyPrice) : null;
    const aliases = extraBarcodes
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);

    let cartonObj = null;
    if (saleMode === 'carton' || saleMode === 'both') {
      if (!cartonBarcode.trim() || !cartonSellPrice) {
        setMessage({ text: 'بارکۆد و نرخی فرۆشتنی کارتۆن پێویستە', error: true });
        return;
      }
      cartonObj = {
        name: cartonName.trim() || `کارتۆنی ${name.trim()}`,
        barcode: cartonBarcode.trim(),
        alias_barcodes: extraCartonBarcodes.split('\n').map(x => x.trim()).filter(Boolean),
        units_per_carton: parseInt(unitsPerCarton) || 24,
        purchase_price_iqd: cartonBuyPrice ? parseInt(cartonBuyPrice) : null,
        sale_price_iqd: parseInt(cartonSellPrice) || 0
      };
    }

    if (editingId) {
      updateProduct(editingId, {
        name: name.trim(),
        sku: sku.trim() || null,
        plu: plu.trim() || null,
        sale_mode: saleMode,
        base_unit: baseUnit,
        unit_barcode: unitBarcode.trim(),
        unit_purchase_price_iqd: buyPrice,
        unit_sale_price_iqd: sellPrice,
        unit_alias_barcodes: aliases,
        carton: cartonObj
      });
      setMessage({ text: 'کاڵاکە بە سەرکەوتوویی نوێکرایەوە', error: false });
    } else {
      addProduct({
        name: name.trim(),
        sku: sku.trim() || null,
        plu: plu.trim() || null,
        sale_mode: saleMode,
        base_unit: baseUnit,
        unit_barcode: unitBarcode.trim(),
        unit_purchase_price_iqd: buyPrice,
        unit_sale_price_iqd: sellPrice,
        unit_alias_barcodes: aliases,
        carton: cartonObj,
        stock: Math.max(0, parseFloat(initialStock) || 0),
        min_stock: 10,
        category: 'گشتی'
      });
      setMessage({ text: 'کاڵای نوێ بە سەرکەوتوویی تۆمارکرا', error: false });
      resetForm();
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    const headers = ['ناوی کاڵا', 'بارکۆد', 'نرخی فرۆشتن (IQD)', 'نرخی کڕین (IQD)', 'کۆگا', 'یەکە'];
    const rows = products.map(p => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.unit_barcode}"`,
      p.unit_sale_price_iqd,
      p.unit_purchase_price_iqd || '',
      p.stock,
      p.base_unit
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `KaniChnar_Products_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Import execution
  const handleImportSubmit = () => {
    if (!importText.trim()) return;
    const parsed = parseCsvRows(importText);
    let count = 0;
    parsed.forEach(item => {
      addProduct({
        name: item.name,
        sku: null,
        plu: null,
        sale_mode: 'unit',
        base_unit: 'unit',
        unit_barcode: item.barcode,
        unit_purchase_price_iqd: Math.round(item.price * 0.8),
        unit_sale_price_iqd: item.price,
        unit_alias_barcodes: [],
        carton: null,
        stock: 50,
        min_stock: 10,
        category: 'هاوردەکراو'
      });
      count++;
    });
    setImportText('');
    setShowImport(false);
    setMessage({ text: `${count} کاڵا بە سەرکەوتوویی هاوردەکران!`, error: false });
  };

  // Filtered Products
  const filteredProducts = products.filter(p => {
    const matchSearch =
      searchTerm === '' ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.unit_barcode.includes(searchTerm) ||
      (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.carton && p.carton.barcode.includes(searchTerm));

    if (!matchSearch) return false;

    if (stockFilter === 'low') return p.stock <= 5 && p.stock > 0;
    if (stockFilter === 'out') return p.stock <= 0;
    return true;
  });

  // Calculate profit margin helper
  const sellNum = parseInt(unitSellPrice) || 0;
  const buyNum = parseInt(unitBuyPrice) || 0;
  const unitProfitIqd = sellNum - buyNum;
  const unitProfitMargin = buyNum > 0 ? ((unitProfitIqd / buyNum) * 100).toFixed(1) : null;

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: '#0f172a' }}>
          بەڕێوەبردنی کاڵاکان و بارکۆد
        </h1>
        <div className="tabs" style={{ margin: 0 }}>
          <button
            type="button"
            className={`tab ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => {
              if (activeTab !== 'new') resetForm();
              setActiveTab('new');
            }}
          >
            {editingId ? 'دەستکاریکردنی کاڵا' : 'کاڵای نوێ'}
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            لیستی کاڵاکان ({products.length})
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'prices' ? 'active' : ''}`}
            onClick={() => setActiveTab('prices')}
          >
            نرخ و قازانجەکان
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'barcodes' ? 'active' : ''}`}
            onClick={() => setActiveTab('barcodes')}
          >
            بارکۆد و کێشەکان
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            marginBottom: '14px',
            background: message.error ? '#fef2f2' : '#f0fdf4',
            border: `1.5px solid ${message.error ? '#fca5a5' : '#bbf7d0'}`,
            color: message.error ? '#991b1b' : '#166534',
            fontWeight: 800,
            fontSize: '13px'
          }}
        >
          {message.text}
        </div>
      )}

      {/* Tab: New / Edit Product Form */}
      {activeTab === 'new' && (
        <div className="surface" style={{ background: '#fff', padding: '24px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 16px', color: '#172b45' }}>
            {editingId ? 'دەستکاریکردنی زانیارییەکانی کاڵا' : 'تۆمارکردنی کاڵای نوێ'}
          </h2>

          <form onSubmit={handleSaveProduct}>
            <div className="catalog-fields">
              <div className="catalog-top-grid">
                {/* Product Identity */}
                <section className="catalog-group">
                  <h3>ناسنامەی سەرەکی کاڵا</h3>
                  <div className="catalog-row">
                    <label className="form-col">
                      ناوی کاڵا *
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                        placeholder="بۆ نموونە: ئاوی کانی چنار 500ml"
                      />
                    </label>
                    <label className="form-col">
                      کۆدی ناوخۆیی (SKU)
                      <input
                        type="text"
                        value={sku}
                        onChange={e => setSku(e.target.value)}
                        placeholder="WTR-500"
                      />
                    </label>
                    <label className="form-col">
                      کۆدی تەرازوو (PLU)
                      <input
                        type="text"
                        value={plu}
                        onChange={e => setPlu(e.target.value)}
                        placeholder="0001"
                      />
                    </label>
                  </div>
                </section>

                {/* Sale Mode */}
                <section className="catalog-group">
                  <h3>شێوازی فرۆشتن</h3>
                  <div className="catalog-modes" style={{ paddingTop: '10px' }}>
                    <label>
                      <input
                        type="radio"
                        name="sm"
                        checked={saleMode === 'unit'}
                        onChange={() => setSaleMode('unit')}
                      />
                      دانە
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="sm"
                        checked={saleMode === 'carton'}
                        onChange={() => setSaleMode('carton')}
                      />
                      کارتۆن
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="sm"
                        checked={saleMode === 'both'}
                        onChange={() => setSaleMode('both')}
                      />
                      هەردووکیان
                    </label>
                  </div>
                </section>
              </div>

              {/* Unit & Carton Grids */}
              <div className="catalog-pack-grid">
                {/* Unit Details */}
                <section className="catalog-group">
                  <h3>نرخ و یەکەی کاڵا</h3>
                  <div className="catalog-row">
                    <label className="form-col">
                      یەکەی بنەڕەتی
                      <select
                        value={baseUnit}
                        onChange={e => setBaseUnit(e.target.value as BaseUnit)}
                      >
                        <option value="unit">دانە (Piece)</option>
                        <option value="kg">کیلۆگرام (kg)</option>
                      </select>
                    </label>
                  </div>
                  <div className="catalog-row">
                    <label className="form-col">
                      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>بارکۆدی سەرەکی *</span>
                        <button
                          type="button"
                          onClick={() => setUnitBarcode(generateNextBarcode('20'))}
                          className="catalog-table-btn"
                          style={{ height: '22px', fontSize: '11px', padding: '0 6px' }}
                        >
                          ⚡ خۆکار
                        </button>
                      </span>
                      <input
                        type="text"
                        value={unitBarcode}
                        onChange={e => setUnitBarcode(e.target.value)}
                        required
                        placeholder="بارکۆد..."
                      />
                    </label>

                    <label className="form-col">
                      نرخی کڕین (IQD)
                      <input
                        type="number"
                        value={unitBuyPrice}
                        onChange={e => setUnitBuyPrice(e.target.value)}
                        placeholder="2,000"
                      />
                    </label>

                    <label className="form-col">
                      نرخی فرۆشتن (IQD) *
                      <input
                        type="number"
                        value={unitSellPrice}
                        onChange={e => setUnitSellPrice(e.target.value)}
                        required
                        placeholder="2,500"
                      />
                    </label>
                  </div>

                  {buyNum > 0 && sellNum > 0 && (
                    <div
                      style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        fontWeight: 900,
                        color: unitProfitIqd >= 0 ? '#0f766e' : '#b91c1c'
                      }}
                    >
                      قازانجی خەمڵێنراو: {money(unitProfitIqd)} ({unitProfitMargin}%)
                    </div>
                  )}

                  {!editingId && (
                    <div className="catalog-row" style={{ marginTop: '10px' }}>
                      <label className="form-col">
                        بڕی کۆگای سەرەتایی
                        <input
                          type="number"
                          value={initialStock}
                          onChange={e => setInitialStock(e.target.value)}
                        />
                      </label>
                    </div>
                  )}

                  <div className="catalog-row" style={{ marginTop: '10px' }}>
                    <label className="form-col">
                      فرەبارکۆدی دانە (ئەگەر چەند بارکۆدێکی جیاوازی هەبێت)
                      <textarea
                        value={extraBarcodes}
                        onChange={e => setExtraBarcodes(e.target.value)}
                        placeholder="لە هەر دێڕێکدا بارکۆدێکی زیادە بنووسە"
                      />
                    </label>
                  </div>
                </section>

                {/* Carton Details (if enabled) */}
                {(saleMode === 'carton' || saleMode === 'both') && (
                  <section className="catalog-group">
                    <h3>زانیارییەکانی کارتۆن / بەستە</h3>
                    <div className="catalog-row">
                      <label className="form-col">
                        ناوی کارتۆن
                        <input
                          type="text"
                          value={cartonName}
                          onChange={e => setCartonName(e.target.value)}
                          placeholder="کارتۆنی 24 دانەیی"
                        />
                      </label>
                      <label className="form-col">
                        <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>بارکۆدی کارتۆن *</span>
                          <button
                            type="button"
                            onClick={() => setCartonBarcode(generateNextBarcode('21'))}
                            className="catalog-table-btn"
                            style={{ height: '22px', fontSize: '11px', padding: '0 6px' }}
                          >
                            ⚡ خۆکار
                          </button>
                        </span>
                        <input
                          type="text"
                          value={cartonBarcode}
                          onChange={e => setCartonBarcode(e.target.value)}
                          placeholder="بارکۆدی سەر کارتۆن"
                        />
                      </label>
                      <label className="form-col">
                        دانە لە کارتۆندا *
                        <input
                          type="number"
                          value={unitsPerCarton}
                          onChange={e => setUnitsPerCarton(e.target.value)}
                          min="2"
                        />
                      </label>
                      <label className="form-col">
                        نرخی کڕینی کارتۆن (IQD)
                        <input
                          type="number"
                          value={cartonBuyPrice}
                          onChange={e => setCartonBuyPrice(e.target.value)}
                        />
                      </label>
                      <label className="form-col">
                        نرخی فرۆشتنی کارتۆن (IQD) *
                        <input
                          type="number"
                          value={cartonSellPrice}
                          onChange={e => setCartonSellPrice(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="catalog-row" style={{ marginTop: '10px' }}>
                      <label className="form-col">
                        فرەبارکۆدی زیادەی کارتۆن
                        <textarea
                          value={extraCartonBarcodes}
                          onChange={e => setExtraCartonBarcodes(e.target.value)}
                          placeholder="بارکۆدە زیادەکانی کارتۆن"
                        />
                      </label>
                    </div>
                  </section>
                )}
              </div>
            </div>

            <div className="catalog-buttons" style={{ marginTop: '16px' }}>
              <button type="submit" className="primary">
                {editingId ? '💾 پاشەکەوتکردنی گۆڕانکارییەکان' : '➕ زیادکردنی کاڵا'}
              </button>
              {editingId && (
                <button type="button" className="secondary" onClick={resetForm}>
                  هەڵوەشاندنەوە
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Tab: Product List */}
      {activeTab === 'list' && (
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <div className="toolbar">
            <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45' }}>
              لیستی کاڵاکانی سوپەرمارکێت
            </h2>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="input-search"
                style={{ minWidth: '150px' }}
                value={stockFilter}
                onChange={e => setStockFilter(e.target.value as any)}
              >
                <option value="all">هەموو کاڵاکان</option>
                <option value="low">کەمبووە (≤ 5)</option>
                <option value="out">تەواوبوو (0)</option>
              </select>

              <button
                type="button"
                className="secondary"
                onClick={() => setShowImport(!showImport)}
              >
                📂 هاوردەکردن (CSV)
              </button>

              <button type="button" className="secondary" onClick={handleExportCsv}>
                ⬇ هەناردەکردن (CSV)
              </button>

              <input
                type="text"
                className="input-search"
                placeholder="گەڕان بە ناو، بارکۆد، SKU..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Import Panel */}
          {showImport && (
            <div
              style={{
                background: '#f8fafc',
                border: '1.5px dashed #94a3b8',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ fontSize: '14px', margin: '0 0 6px', color: '#0f172a', fontWeight: 900 }}>
                هاوردەکردنی بەکۆمەڵی کاڵاکان بە CSV یان دەق
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px' }}>
                شێواز لە هەر دێڕێکدا: ناوی کاڵا, بارکۆد, نرخی فرۆشتن
              </p>
              <textarea
                rows={4}
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={'ئاوی کانی چنار 500ml, 2000000000018, 250\nڕۆنی زەیتی زێڕین, 8690504100234, 3250'}
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  padding: '8px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px'
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="primary"
                  onClick={handleImportSubmit}
                  style={{ height: '36px', fontSize: '12px' }}
                >
                  دەستپێکردنی هاوردەکردن
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowImport(false)}
                  style={{ height: '36px', fontSize: '12px' }}
                >
                  داخستن
                </button>
              </div>
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="blank">هیچ کاڵایەک نەدۆزرایەوە بەپێی ئەم فلتەرە</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ناوی کاڵا</th>
                  <th>بارکۆد</th>
                  <th>یەکە</th>
                  <th>نرخی فرۆشتن</th>
                  <th>نرخی کڕین</th>
                  <th>کۆگا</th>
                  <th>کارتۆن</th>
                  <th>کردارەکان</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 900, color: '#0f172a' }}>{p.name}</div>
                      {p.sku && <div style={{ fontSize: '11px', color: '#64748b' }}>کۆد: {p.sku}</div>}
                    </td>
                    <td>
                      <code style={{ direction: 'ltr', display: 'inline-block', fontWeight: 800 }}>
                        {p.unit_barcode}
                      </code>
                    </td>
                    <td>
                      <span className="stock-badge">{p.base_unit === 'kg' ? 'کگم (kg)' : 'دانە'}</span>
                    </td>
                    <td>
                      <strong style={{ direction: 'ltr', display: 'inline-block', color: '#1e3a8a' }}>
                        {money(p.unit_sale_price_iqd)}
                      </strong>
                    </td>
                    <td>
                      <span style={{ direction: 'ltr', display: 'inline-block', color: '#64748b' }}>
                        {p.unit_purchase_price_iqd ? money(p.unit_purchase_price_iqd) : '—'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`stock-badge ${
                          p.stock <= 0 ? 'danger' : p.stock <= 10 ? 'warn' : 'ok'
                        }`}
                      >
                        {p.stock} {p.base_unit === 'kg' ? 'kg' : 'دانە'}
                      </span>
                    </td>
                    <td>
                      {p.carton ? (
                        <span style={{ fontSize: '12px' }}>
                          {p.carton.units_per_carton} دانە ({money(p.carton.sale_price_iqd)})
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="catalog-table-btn"
                          onClick={() => handleStartEdit(p)}
                        >
                          دەستکاری
                        </button>
                        <button
                          type="button"
                          className="catalog-table-btn"
                          onClick={() => setSelectedForLabel(p)}
                        >
                          لیبڵ
                        </button>
                        <button
                          type="button"
                          className="catalog-table-btn"
                          onClick={() => {
                            if (confirm(`دڵنیایت لە سڕینەوەی ${p.name}؟`)) {
                              deleteProduct(p.id);
                            }
                          }}
                          style={{ color: '#dc2626' }}
                        >
                          سڕینەوە
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Pricing & Profit Analysis */}
      {activeTab === 'prices' && (
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45', marginBottom: '16px' }}>
            شیکاری نرخەکان و قازانجی ڕێژەیی
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th>کاڵا</th>
                <th>نرخی کڕین (تێچوو)</th>
                <th>نرخی فرۆشتن</th>
                <th>قازانج (IQD)</th>
                <th>ڕێژەی قازانج (%)</th>
                <th>کارتۆن</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const buy = p.unit_purchase_price_iqd || 0;
                const sell = p.unit_sale_price_iqd;
                const profit = sell - buy;
                const margin = buy > 0 ? ((profit / buy) * 100).toFixed(1) : '100';

                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td style={{ direction: 'ltr' }}>{buy > 0 ? money(buy) : '—'}</td>
                    <td style={{ direction: 'ltr', fontWeight: 900, color: '#1e3a8a' }}>{money(sell)}</td>
                    <td style={{ direction: 'ltr', fontWeight: 900, color: profit >= 0 ? '#15803d' : '#b91c1c' }}>
                      {money(profit)}
                    </td>
                    <td>
                      <span className={`stock-badge ${Number(margin) >= 20 ? 'ok' : 'info'}`}>
                        {margin}%
                      </span>
                    </td>
                    <td>
                      {p.carton ? (
                        <span style={{ fontSize: '12px' }}>
                          فرۆشتن: {money(p.carton.sale_price_iqd)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Barcodes & Scale Codes */}
      {activeTab === 'barcodes' && (
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45', marginBottom: '16px' }}>
            بەڕێوەبردنی بارکۆدەکان و کۆدی تەرازوو
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th>ناوی کاڵا</th>
                <th>بارکۆدی سەرەکی</th>
                <th>کۆدی تەرازوو (PLU)</th>
                <th>بارکۆدی کارتۆن</th>
                <th>فرەبارکۆدەکان</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>
                    <code style={{ direction: 'ltr', display: 'inline-block', fontWeight: 900 }}>
                      {p.unit_barcode}
                    </code>
                  </td>
                  <td>
                    {p.plu ? (
                      <span className="stock-badge info">{p.plu}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {p.carton ? (
                      <code style={{ direction: 'ltr', display: 'inline-block' }}>{p.carton.barcode}</code>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {p.unit_alias_barcodes.length > 0 ? (
                      <span style={{ fontSize: '12px' }}>{p.unit_alias_barcodes.join(', ')}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Shelf Label Preview Modal */}
      {selectedForLabel && (
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
              maxWidth: '380px',
              width: '100%',
              textAlign: 'center'
            }}
          >
            <h3 style={{ margin: '0 0 12px' }}>چاپی لیبڵی ڕەفە</h3>
            <div
              style={{
                border: '2px solid #0f172a',
                borderRadius: '10px',
                padding: '16px',
                background: '#fff',
                margin: '12px auto'
              }}
            >
              <div style={{ fontSize: '11px', color: '#64748b' }}>سوپەرمارکێتی کانی چنار</div>
              <strong style={{ fontSize: '16px', display: 'block', margin: '4px 0' }}>
                {selectedForLabel.name}
              </strong>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 900,
                  color: '#1e3a8a',
                  direction: 'ltr',
                  margin: '8px 0'
                }}
              >
                {money(selectedForLabel.unit_sale_price_iqd)}
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  letterSpacing: '3px',
                  fontSize: '14px',
                  fontWeight: 900
                }}
              >
                ||| {selectedForLabel.unit_barcode} |||
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
              <button
                type="button"
                className="primary"
                onClick={() => window.print()}
              >
                🖨️ چاپ
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setSelectedForLabel(null)}
              >
                داخستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
