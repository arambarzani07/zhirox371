import React from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';

export const ReportsAnalyticsView: React.FC = () => {
  const { receipts, products, currentShift } = useApp();

  const totalRevenue = receipts.reduce((sum, r) => sum + r.total, 0);
  const totalDiscount = receipts.reduce((sum, r) => sum + r.discount, 0);
  const cashSalesTotal = receipts.filter(r => r.paymentMethod === 'cash').reduce((sum, r) => sum + r.total, 0);
  const debtSalesTotal = receipts.filter(r => r.paymentMethod === 'debt').reduce((sum, r) => sum + r.total, 0);

  // Inventory valuation
  const inventoryRetailValuation = products.reduce((sum, p) => sum + p.stock * p.unit_sale_price_iqd, 0);
  const inventoryCostValuation = products.reduce((sum, p) => sum + p.stock * (p.unit_purchase_price_iqd || 0), 0);
  const expectedInventoryProfit = inventoryRetailValuation - inventoryCostValuation;

  // Top products sold
  const productSalesMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  receipts.forEach(r => {
    r.items.forEach(it => {
      if (!productSalesMap[it.productId]) {
        productSalesMap[it.productId] = { name: it.name, qty: 0, revenue: 0 };
      }
      productSalesMap[it.productId].qty += it.qty;
      productSalesMap[it.productId].revenue += it.total;
    });
  });

  const topProducts = Object.values(productSalesMap).sort((a, b) => b.qty - a.qty);

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 16px', color: '#0f172a' }}>
        ڕاپۆرتە داراییەکان و شیکاری فرۆشتن
      </h1>

      {/* Top Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '14px',
          marginBottom: '20px'
        }}
      >
        <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e40af' }}>کۆی داهاتی فرۆشتن</div>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#1e3a8a', direction: 'ltr', margin: '4px 0' }}>
            {money(totalRevenue)}
          </div>
          <div style={{ fontSize: '11px', color: '#3b82f6' }}>{receipts.length} پسووڵەی تەواوکراو</div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534' }}>فرۆشتنی نەختینە (Cash)</div>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#15803d', direction: 'ltr', margin: '4px 0' }}>
            {money(cashSalesTotal)}
          </div>
          <div style={{ fontSize: '11px', color: '#22c55e' }}>
            {totalRevenue > 0 ? ((cashSalesTotal / totalRevenue) * 100).toFixed(0) : '0'}% لە کۆی فرۆشتن
          </div>
        </div>

        <div style={{ background: '#faf5ff', border: '1.5px solid #e9d5ff', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#6b21a8' }}>فرۆشتن بە قەرز (Debt)</div>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#7e22ce', direction: 'ltr', margin: '4px 0' }}>
            {money(debtSalesTotal)}
          </div>
          <div style={{ fontSize: '11px', color: '#a855f7' }}>
            {totalRevenue > 0 ? ((debtSalesTotal / totalRevenue) * 100).toFixed(0) : '0'}% لە کۆی فرۆشتن
          </div>
        </div>

        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#92400e' }}>سەرمایەی هەبووی کۆگا</div>
          <div style={{ fontSize: '28px', fontWeight: 950, color: '#b45309', direction: 'ltr', margin: '4px 0' }}>
            {money(inventoryRetailValuation)}
          </div>
          <div style={{ fontSize: '11px', color: '#d97706' }}>تێچووی کڕین: {money(inventoryCostValuation)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(300px, 1fr)', gap: '18px' }}>
        {/* Top Selling Products */}
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#172b45', margin: '0 0 14px' }}>
            پڕفرۆشترین کاڵاکان
          </h2>
          {topProducts.length === 0 ? (
            <div className="blank">هێشتا لەم شێفتەدا فرۆشتن تۆمارنەکراوە</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>ناوی کاڵا</th>
                  <th>بڕی فرۆشراو</th>
                  <th>کۆی داهات (IQD)</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.slice(0, 8).map((tp, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{tp.name}</strong>
                    </td>
                    <td style={{ fontWeight: 900, color: '#1e3a8a' }}>{tp.qty}</td>
                    <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(tp.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Valuation & Performance Breakdown */}
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#172b45', margin: '0 0 14px' }}>
            شیکاری قازانج و سەرمایە
          </h2>

          <div style={{ display: 'grid', gap: '12px' }}>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>داشکاندنی بەخشراو:</div>
              <strong style={{ fontSize: '16px', color: '#b91c1c', direction: 'ltr', display: 'block' }}>
                {money(totalDiscount)}
              </strong>
            </div>

            <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '12px', color: '#166534' }}>قازانجی خەمڵێنراوی کۆگا لەسەر هەموو کاڵاکان:</div>
              <strong style={{ fontSize: '18px', color: '#15803d', direction: 'ltr', display: 'block' }}>
                {money(expectedInventoryProfit)}
              </strong>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>تێکڕای نرخی هەر پسووڵەیەک:</div>
              <strong style={{ fontSize: '16px', color: '#1e3a8a', direction: 'ltr', display: 'block' }}>
                {receipts.length > 0 ? money(Math.round(totalRevenue / receipts.length)) : '0 IQD'}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
