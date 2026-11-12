import React from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';
import { demoCostCoverageV109,demoInventoryCostCoverageV109 } from '../utils/demoCostCoverageV109';
import { KurdishVoiceAnnouncer } from '../utils/kurdishVoiceEngine';

export const ReportsAnalyticsView: React.FC = () => {
  const { receipts, products, exportBackupJson } = useApp();

  const totalRevenue = receipts.reduce((sum, r) => sum + r.total, 0);
  const totalDiscount = receipts.reduce((sum, r) => sum + r.discount, 0);
  const cashSalesTotal = receipts.filter(r => r.paymentMethod === 'cash').reduce((sum, r) => sum + r.total, 0);
  const debtSalesTotal = receipts.filter(r => r.paymentMethod === 'debt').reduce((sum, r) => sum + r.total, 0);

  // Browser DEMO cost coverage; never invent a cost as 75% of sale price.
  const salesCosts=demoCostCoverageV109(products,receipts);
  const grossProfit=salesCosts.complete?totalRevenue-salesCosts.knownCost:null;
  const grossMarginPct=grossProfit===null?null:
    (totalRevenue>0?((grossProfit/totalRevenue)*100).toFixed(1):'0.0');

  // Inventory with unknown acquisition cost cannot yield a valid profit.
  const inventoryRetailValuation=products.reduce((sum,p)=>sum+p.stock*p.unit_sale_price_iqd,0);
  const inventoryCosts=demoInventoryCostCoverageV109(products);
  const inventoryCostValuation=inventoryCosts.complete?inventoryCosts.knownCost:null;

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

  const handleDownloadBackup = () => {
    const jsonStr = exportBackupJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kanichnar-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    KurdishVoiceAnnouncer.announceBackupSuccess();
  };

  const metrics = [
    { title: 'کۆی فرۆشتن', value: money(totalRevenue), detail: `${receipts.length} پسووڵە` },
    { title: 'فرۆشتنی نەختینە', value: money(cashSalesTotal) },
    { title: 'فرۆشتنی قەرز', value: money(debtSalesTotal) },
    { title: 'قازانجی گشتی', value: grossProfit === null ? 'نادیار' : money(grossProfit) },
  ];

  const breakdown = [
    { title: 'ڕێژەی قازانج', value: grossMarginPct === null ? 'نادیار' : `${grossMarginPct}%` },
    { title: 'تێچووی کاڵای فرۆشراو', value: salesCosts.complete ? money(salesCosts.knownCost) : 'نادیار' },
    { title: 'داشکاندن', value: money(totalDiscount) },
    { title: 'تێکڕای پسووڵە', value: money(receipts.length > 0 ? Math.round(totalRevenue / receipts.length) : 0) },
    { title: 'بەهای فرۆشتنی کاڵای کۆگا', value: money(inventoryRetailValuation) },
    { title: 'تێچووی کڕینی کاڵای کۆگا', value: inventoryCostValuation === null ? 'نادیار' : money(inventoryCostValuation) },
  ];

  return (
    <section className="ws-stack canva-standard-view canva-detail">
      <div className="ws-kpi-grid">
        {metrics.map(metric => <div className="ws-kpi-card" key={metric.title}>
          <span className="ws-kpi-label">{metric.title}</span>
          <strong className="ws-kpi-value">{metric.value}</strong>
          {metric.detail && <span className="ws-kpi-sub">{metric.detail}</span>}
        </div>)}
      </div>
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>پڕفرۆشترین کاڵاکان</h2>
          <div className="section-workspace__table">
            <table>
              <thead><tr><th>ژمارە</th><th>ناوی کاڵا</th><th>بڕی فرۆشراو</th><th>کۆی داهات</th></tr></thead>
              <tbody>
                {topProducts.slice(0, 10).map((product, index) => <tr key={index}>
                  <td>{index + 1}</td><td>{product.name}</td><td>{product.qty}</td><td><bdi>{money(product.revenue)}</bdi></td>
                </tr>)}
                {topProducts.length === 0 && <tr><td colSpan={4} className="section-workspace__empty">هیچ فرۆشتنێک تۆمار نەکراوە</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="canva-detail__panel">
          <h2>پوختەی ڕاپۆرت</h2>
          <dl className="canva-detail__summary">
            {breakdown.map(row => <div key={row.title}><dt>{row.title}</dt><dd><bdi>{row.value}</bdi></dd></div>)}
          </dl>
          <div className="canva-detail__actions">
            <button type="button" className="secondary" onClick={handleDownloadBackup}>داگرتنی یەدەگ</button>
            <button type="button" className="primary" onClick={() => window.print()}>چاپی ڕاپۆرت</button>
          </div>
        </aside>
      </div>
    </section>
  );
};
