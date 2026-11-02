import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';
import { demoCostCoverageV109 } from '../utils/demoCostCoverageV109';
import { KurdishVoiceAssistantModal } from './KurdishVoiceAssistantModal';

const SUBMODULE_STORAGE_KEY = 'kanichnar_retail_pos_v18_submodules';

interface ReturnRecord {
  id: string;
  receiptNo: string;
  productId: string;
  productName: string;
  qty: number;
  refundAmount: number;
  restocked: boolean;
  reason: string;
  createdAt: string;
}

interface PurchaseOrderRecord {
  id: string;
  orderNo: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  qty: number;
  unitCost: number;
  status: 'pending' | 'received';
  createdAt: string;
}

interface OfferRecord {
  id: string;
  title: string;
  productName: string;
  bundleQty: number;
  offerPrice: number;
  active: boolean;
  expiresOn: string;
}

interface CouponRecord {
  id: string;
  code: string;
  discountIqd: number;
  minBasketIqd: number;
  expiresOn: string;
  active: boolean;
}

interface CampaignRecord {
  id: string;
  name: string;
  targetGroup: string;
  startDate: string;
  endDate: string;
  active: boolean;
}

interface StaffUserRecord {
  id: string;
  username: string;
  fullName: string;
  role: 'خاوەن مارکێت' | 'بەڕێوەبەر' | 'کاشێر';
  active: boolean;
}

interface AttendanceRecord {
  id: string;
  staffName: string;
  role: string;
  date: string;
  checkIn: string;
  checkOut: string;
  hours: number;
  status: 'ئامادە' | 'تەواوبوو';
}

interface StaffReviewRecord {
  id: string;
  staffName: string;
  period: string;
  rating: string;
  cashAccuracy: string;
  note: string;
}

interface ApprovalRequestRecord {
  id: string;
  requester: string;
  requestType: string;
  targetDetail: string;
  createdAt: string;
  status: 'چاوەڕوانکراو' | 'پەسەندکراو' | 'ڕەتکراوەتەوە';
}

interface PrintTemplateRecord {
  id: string;
  name: string;
  paperType: string;
  dimensions: string;
  showBarcode: boolean;
  showLogo: boolean;
  active: boolean;
}

interface StoredSubmoduleState {
  returns: ReturnRecord[];
  purchaseOrders: PurchaseOrderRecord[];
  offers: OfferRecord[];
  coupons: CouponRecord[];
  campaigns: CampaignRecord[];
  users: StaffUserRecord[];
  attendance: AttendanceRecord[];
  reviews: StaffReviewRecord[];
  approvals: ApprovalRequestRecord[];
  templates: PrintTemplateRecord[];
  systemConfig: {
    storeName: string;
    receiptFooter: string;
    defaultMinStock: number;
    allowDebtCheckout: boolean;
    requireManagerForReturn: boolean;
  };
}

const DEFAULT_STATE: StoredSubmoduleState = {
  returns: [
    {
      id: 'ret-1',
      receiptNo: 'DEMO-RCP-0998',
      productId: 'prod-3',
      productName: 'برنجی کوردی کوردمەیدان 5kg',
      qty: 1,
      refundAmount: 12500,
      restocked: true,
      reason: 'گۆڕینی جۆری کاڵا لەلایەن کڕیار (شەفتی پێشوو — گەڕایەوە کۆگا)',
      createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString()
    }
  ],
  purchaseOrders: [
    {
      id: 'po-1',
      orderNo: 'PO-2026-01',
      supplierId: 'sup-1',
      supplierName: 'کۆمپانیای ئەلبورز بۆ دابەشکردنی خۆراک',
      productId: 'prod-3',
      productName: 'برنجی کوردی کوردمەیدان 5kg',
      qty: 20,
      unitCost: 10500,
      status: 'pending',
      createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString()
    }
  ],
  offers: [
    {
      id: 'off-1',
      title: 'ئافەری خێزانی — ٢ فەردە برنجی مەحموود',
      productName: 'برنجی بەسمەتی مەحموود 5 کیلۆ',
      bundleQty: 2,
      offerPrice: 21500,
      active: true,
      expiresOn: '2026-12-31'
    },
    {
      id: 'off-2',
      title: 'ئافەری ٣ بوتڵ زەیتی گوڵەبەڕۆژە',
      productName: 'زەیتی گوڵەبەڕۆژەی زێڕ 1 لیتر',
      bundleQty: 3,
      offerPrice: 6500,
      active: true,
      expiresOn: '2026-11-30'
    }
  ],
  coupons: [
    {
      id: 'cpn-1',
      code: 'KANI-5000',
      discountIqd: 5000,
      minBasketIqd: 50000,
      expiresOn: '2026-12-31',
      active: true
    },
    {
      id: 'cpn-2',
      code: 'VIP-2500',
      discountIqd: 2500,
      minBasketIqd: 25000,
      expiresOn: '2026-12-15',
      active: true
    }
  ],
  campaigns: [
    {
      id: 'cmp-1',
      name: 'داشکاندنی کۆتایی هەفتە — خۆراک و وشکەبار',
      targetGroup: 'خۆراکی سەرەکی',
      startDate: '2026-11-01',
      endDate: '2026-11-15',
      active: true
    },
    {
      id: 'cmp-2',
      name: 'کەمپەینی تایبەتی شیرەمەنی و پەنیر',
      targetGroup: 'شیرەمەنی',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      active: true
    }
  ],
  users: [
    { id: 'u-1', username: 'aram_owner', fullName: 'ئارام بارزانی', role: 'خاوەن مارکێت', active: true },
    { id: 'u-2', username: 'karwan_mgr', fullName: 'کاروان محەمەد', role: 'بەڕێوەبەر', active: true },
    { id: 'u-3', username: 'sara_cashier', fullName: 'سارا ئەحمەد', role: 'کاشێر', active: true }
  ],
  attendance: [
    {
      id: 'att-1',
      staffName: 'ئارام بارزانی',
      role: 'بەڕێوەبەر',
      date: new Date().toISOString().slice(0, 10),
      checkIn: '08:00',
      checkOut: '16:00',
      hours: 8,
      status: 'تەواوبوو'
    },
    {
      id: 'att-2',
      staffName: 'سارا ئەحمەد',
      role: 'کاشێر',
      date: new Date().toISOString().slice(0, 10),
      checkIn: '08:30',
      checkOut: '—',
      hours: 6.5,
      status: 'ئامادە'
    }
  ],
  reviews: [
    {
      id: 'rev-1',
      staffName: 'سارا ئەحمەد',
      period: '2026-10',
      rating: 'نایاب (98%)',
      cashAccuracy: 'بێ کورتهێنانی سندووق',
      note: 'وردبینی لە سکانی بارکۆد و ڕێزگرتنی کڕیاران'
    },
    {
      id: 'rev-2',
      staffName: 'کاروان محەمەد',
      period: '2026-10',
      rating: 'زۆر باش (95%)',
      cashAccuracy: 'ڕێکخستنی وردی کۆگا و LOT',
      note: 'سەرپەرشتیی وەرگرتنی کاڵای دابینکەران'
    }
  ],
  approvals: [
    {
      id: 'apr-1',
      requester: 'سارا ئەحمەد (کاشێر)',
      requestType: 'گەڕاندنەوەی کاڵا',
      targetDetail: 'پسووڵەی DEMO-RCP-1001 — ١ دانە برنجی مەحموود (11,500 IQD)',
      createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      status: 'پەسەندکراو'
    },
    {
      id: 'apr-2',
      requester: 'سارا ئەحمەد (کاشێر)',
      requestType: 'داشکاندنی تایبەت لەسەر سەبەتە',
      targetDetail: 'داشکاندنی 5% بۆ کڕیاری کۆگا (بڕی 3,500 IQD)',
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      status: 'چاوەڕوانکراو'
    }
  ],
  templates: [
    {
      id: 'tpl-80mm',
      name: 'پسووڵەی گەرمی ستاندارد 80mm',
      paperType: 'Thermal Roll 80mm',
      dimensions: '80mm × Auto',
      showBarcode: true,
      showLogo: true,
      active: true
    },
    {
      id: 'tpl-58mm',
      name: 'پسووڵەی گەرمی بچووک 58mm',
      paperType: 'Thermal Roll 58mm',
      dimensions: '58mm × Auto',
      showBarcode: true,
      showLogo: false,
      active: false
    },
    {
      id: 'tpl-shelf-38x25',
      name: 'لیبڵی نرخی ڕەفە و بارکۆد',
      paperType: 'Zebra / Xprinter Label',
      dimensions: '38mm × 25mm',
      showBarcode: true,
      showLogo: false,
      active: true
    }
  ],
  systemConfig: {
    storeName: 'سوپەرمارکێتی کانی چنار',
    receiptFooter: 'سوپاس بۆ سەردانەکەتان — سوپەرمارکێتی کانی چنار',
    defaultMinStock: 10,
    allowDebtCheckout: true,
    requireManagerForReturn: true
  }
};

export const OperationalSubmodulesView: React.FC<{ sectionId: string }> = ({ sectionId }) => {
  const {
    products,
    suppliers,
    customers,
    receipts,
    expenses,
    currentShift,
    closeShift,
    openNewShift,
    setActiveReceiptForModal,
    recordSaleReturn,
    demoRefunds,
    receiveStock,
    updateProduct,
    addAuditLog
  } = useApp();

  const [storeState, setStoreState] = useState<StoredSubmoduleState>(() => {
    try {
      const raw = localStorage.getItem(SUBMODULE_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_STATE, ...JSON.parse(raw) };
      }
    } catch (_e) {}
    return DEFAULT_STATE;
  });

  useEffect(() => {
    try {
      localStorage.setItem(SUBMODULE_STORAGE_KEY, JSON.stringify(storeState));
    } catch (_e) {}
  }, [storeState]);

  // Form states
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');
  const [returnReceiptNo, setReturnReceiptNo] = useState<string>(receipts[0]?.receiptNumber || '');
  const [returnQty, setReturnQty] = useState<string>('1');
  const [returnRestock, setReturnRestock] = useState<boolean>(true);
  const [returnRefundMethod, setReturnRefundMethod] = useState<'cash' | 'debt'>('cash');
  const [returnReason, setReturnReason] = useState<string>('داواکاریی کڕیار — کاڵای سالم');
  const [returnMsg, setReturnMsg] = useState<{ text: string; error: boolean } | null>(null);

  const [poQty, setPoQty] = useState<string>('10');
  const [poUnitCost, setPoUnitCost] = useState<string>('');
  const [poError,setPoError] = useState<string | null>(null);

  const [offerTitle, setOfferTitle] = useState<string>('');
  const [offerBundleQty, setOfferBundleQty] = useState<string>('2');
  const [offerPrice, setOfferPrice] = useState<string>('5000');
  const [offerExpiry, setOfferExpiry] = useState<string>('2026-12-31');

  const [discountPct, setDiscountPct] = useState<string>('10');

  const [couponCode, setCouponCode] = useState<string>('');
  const [couponAmount, setCouponAmount] = useState<string>('2500');
  const [couponMinBasket, setCouponMinBasket] = useState<string>('25000');

  const [campaignName, setCampaignName] = useState<string>('');
  const [campaignGroup, setCampaignGroup] = useState<string>('گشتی');
  const [campaignEnd, setCampaignEnd] = useState<string>('2026-12-31');

  const [newUsername, setNewUsername] = useState<string>('');
  const [newFullName, setNewFullName] = useState<string>('');
  const [newRole, setNewRole] = useState<'خاوەن مارکێت' | 'بەڕێوەبەر' | 'کاشێر'>('کاشێر');

  const [attStaffName, setAttStaffName] = useState<string>('سارا ئەحمەد');
  const [attRole, setAttRole] = useState<string>('کاشێر');
  const [attHours, setAttHours] = useState<string>('8');

  const [revStaffName, setRevStaffName] = useState<string>('سارا ئەحمەد');
  const [revRating, setRevRating] = useState<string>('نایاب (98%)');
  const [revNote, setRevNote] = useState<string>('');

  const [aprRequester, setAprRequester] = useState<string>('کاشێر');
  const [aprType, setAprType] = useState<string>('گۆڕینی نرخ / داشکاندن');
  const [aprDetail, setAprDetail] = useState<string>('');

  // 1. RETURN ARROW (گەڕاندنەوە)
  if (sectionId === 'return-arrow') {
    const matchedReceipt = receipts.find(r => r.receiptNumber === returnReceiptNo);

    const handleReturnSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const prod = products.find(p => p.id === selectedProductId);
      const qtyNum = Number(returnQty);
      if (!matchedReceipt || !prod || !Number.isFinite(qtyNum) || qtyNum <= 0) {
        setReturnMsg({ text: 'پسووڵە، کاڵا یان بڕی گەڕاندنەوە نادروستە', error: true });
        return;
      }
      const receiptLine = matchedReceipt.items.find(i => i.productId === prod.id);
      if (!receiptLine) {
        setReturnMsg({ text: 'ئەم کاڵایە لە پسووڵەی هەڵبژێردراو نییە', error: true });
        return;
      }
      const unitPrice = receiptLine.price;
      const lineMode = receiptLine.mode;
      const refundAmount = unitPrice * qtyNum;

      const res = recordSaleReturn({
        receiptNo: returnReceiptNo.trim(),
        productId: prod.id,
        qty: qtyNum,
        mode: lineMode,
        refundAmount,
        restock: returnRestock,
        refundMethod: returnRefundMethod,
        customerId: matchedReceipt.customerId,
        reason: returnReason.trim() || 'گەڕاندنەوەی کاڵا'
      });

      if (!res.success) {
        setReturnMsg({ text: res.message || 'هەڵە لە تۆمارکردنی گەڕاندنەوەدا', error: true });
        return;
      }

      setReturnQty('1');
      setReturnMsg({
        text: `گەڕاندنەوەی ${qtyNum} × ${prod.name} بە بڕی ${money(refundAmount)} بە سەرکەوتوویی تۆمارکرا`,
        error: false
      });
    };

    const totalReturnedIqd = demoRefunds.reduce((s, r) => s + r.refundAmount, 0);
    const totalRestockedUnits = demoRefunds.filter(r => r.restocked).reduce((s, r) => s + r.qty, 0);

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی پارەی گەڕێندراوە</span>
            <span className="ws-kpi-value negative">{money(totalReturnedIqd)}</span>
            <span className="ws-kpi-sub">لە کۆی {demoRefunds.length} مامەڵەی گەڕاندنەوە</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">یەکەی گەڕاوە بۆ کۆگا (سالم)</span>
            <span className="ws-kpi-value positive">{totalRestockedUnits}</span>
            <span className="ws-kpi-sub">زیادکراوەتەوە سەر باڵانسی کۆگا</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">باڵانسی چاوەڕوانکراوی سندووق</span>
            <span className="ws-kpi-value">{money(currentShift.expectedCash)}</span>
            <span className="ws-kpi-sub">دوای دەرکردنی گەڕاندنەوەی نەختینە</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">تۆمارکردنی گەڕاندنەوەی کاڵا و گێڕانەوەی پارە</h2>
          {returnMsg && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                marginBottom: '12px',
                background: returnMsg.error ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${returnMsg.error ? '#fca5a5' : '#bbf7d0'}`,
                color: returnMsg.error ? '#991b1b' : '#166534',
                fontSize: '12px',
                fontWeight: 800
              }}
            >
              {returnMsg.text}
            </div>
          )}

          <form onSubmit={handleReturnSubmit} className="ws-form-grid">
            <label className="form-col">
              ژمارەی پسووڵەی فرۆشتن
              <select
                value={returnReceiptNo}
                onChange={e => {
                  const nextNo = e.target.value;
                  setReturnReceiptNo(nextNo);
                  const rcp = receipts.find(r => r.receiptNumber === nextNo);
                  if (rcp) {
                    setReturnRefundMethod(rcp.paymentMethod === 'debt' ? 'debt' : 'cash');
                    if (rcp.items[0]?.productId) {
                      setSelectedProductId(rcp.items[0].productId);
                    }
                  }
                }}
              >
                {receipts.map(r => (
                  <option key={r.id} value={r.receiptNumber}>
                    {r.receiptNumber} — {r.customerName} ({money(r.total)})
                  </option>
                ))}
              </select>
            </label>

            <label className="form-col">
              کاڵای گەڕاوە
              <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({money(p.unit_sale_price_iqd)})
                  </option>
                ))}
              </select>
            </label>

            <label className="form-col">
              بڕی گەڕاوە
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={returnQty}
                onChange={e => setReturnQty(e.target.value)}
                required
              />
            </label>

            <label className="form-col">
              دۆخی کاڵا لە کاتی گەڕانەوە
              <select
                value={returnRestock ? 'restock' : 'damaged'}
                onChange={e => setReturnRestock(e.target.value === 'restock')}
              >
                <option value="restock">سالم — بگەڕێتەوە ناو کۆگا</option>
                <option value="damaged">خراپبوو — نەگەڕێتەوە کۆگا</option>
              </select>
            </label>

            <label className="form-col">
              شێوازی گێڕانەوەی پارە
              <select
                value={returnRefundMethod}
                onChange={e => setReturnRefundMethod(e.target.value as 'cash' | 'debt')}
              >
                <option value="cash">نەختینە لە سندووقی کاشێر</option>
                <option value="debt">کەمکردنەوە لە قەرزی کڕیار</option>
              </select>
            </label>

            <label className="form-col">
              هۆکاری گەڕاندنەوە
              <input
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                required
              />
            </label>

            <button type="submit" className="primary">
              تۆمارکردنی گەڕاندنەوە
            </button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            مێژووی گەڕاندنەوەی کاڵاکان ({demoRefunds.length} مامەڵە · کۆ: {money(totalReturnedIqd)})
          </strong>
          <table>
            <thead>
              <tr>
                <th>پسووڵە</th>
                <th>ناوی کاڵا</th>
                <th>بڕ</th>
                <th>بڕی پارەی گەڕاوە</th>
                <th>گەڕانەوە بۆ کۆگا</th>
                <th>هۆکار</th>
                <th>بەروار</th>
              </tr>
            </thead>
            <tbody>
              {demoRefunds.map(r => (
                <tr key={r.id}>
                  <td style={{ direction: 'ltr', fontWeight: 900 }}>{r.receiptNo}</td>
                  <td>
                    <strong>{r.productName}</strong>
                  </td>
                  <td>{r.qty}</td>
                  <td style={{ direction: 'ltr', fontWeight: 900, color: '#b91c1c' }}>
                    {money(r.refundAmount)}
                  </td>
                  <td style={{ fontWeight: 800, color: r.restocked ? '#15803d' : '#b45309' }}>
                    {r.restocked ? 'بەڵێ (سالم)' : 'نەخێر (خراپبوو)'}
                  </td>
                  <td>{r.reason}</td>
                  <td style={{ direction: 'ltr' }}>{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 2. PROFIT CHART (قازانج)
  if (sectionId === 'profit-chart') {
    const realizedRevenue=receipts.reduce((sum,r)=>sum+r.total,0);
    const salesCosts=demoCostCoverageV109(products,receipts);
    const realizedCost=salesCosts.complete?salesCosts.knownCost:null;
    const totalExpenses=expenses.reduce((s,e)=>s+e.amount,0);
    const grossProfit=realizedCost===null?null:realizedRevenue-realizedCost;
    const netProfit=grossProfit===null?null:grossProfit-totalExpenses;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی فرۆشتنی تۆمارکراو</span>
            <span className="ws-kpi-value">{money(realizedRevenue)}</span>
            <span className="ws-kpi-sub">کۆی داهاتی پسووڵەکانی فرۆشتن</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">تێچووی کڕینی کاڵای فرۆشراو (COGS)</span>
            <span className="ws-kpi-value">{realizedCost===null?'نادیار':money(realizedCost)}</span>
            <span className="ws-kpi-sub">لەسەر بنەمای نرخی کڕینی یەکە</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">قازانجی گشتی (پێش خەرجی)</span>
            <span className={`ws-kpi-value ${grossProfit!==null&&grossProfit >= 0 ? 'positive' : 'negative'}`}>
              {grossProfit===null?'نادیار':money(grossProfit)}
            </span>
            <span className="ws-kpi-sub">فرۆشتن − تێچووی کاڵا</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">قازانجی پوخت (دوای خەرجییەکان)</span>
            <span className={`ws-kpi-value ${netProfit!==null&&netProfit >= 0 ? 'positive' : 'negative'}`}>
              {netProfit===null?'نادیار':money(netProfit)}
            </span>
            <span className="ws-kpi-sub">دوای دەرکردنی سەرجەم خەرجییەکان</span>
          </div>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            شیکاریی قازانجی یەکە و کۆگا بۆ هەر کاڵایەک ({products.length} کاڵا)
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی کاڵا</th>
                <th>نرخی کڕین (تێچوو)</th>
                <th>نرخی فرۆشتن</th>
                <th>قازانجی هەر یەکەیەک</th>
                <th>ڕێژەی قازانج</th>
                <th>کۆگای ئێستا</th>
                <th>قازانجی چاوەڕوانکراوی کۆگا</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const rawCost=p.unit_purchase_price_iqd;
                const cost=typeof rawCost==='number'&&Number.isSafeInteger(rawCost)&&rawCost>0?
                  rawCost:null;
                const margin=cost===null?null:p.unit_sale_price_iqd-cost;
                const pct=margin!==null&&p.unit_sale_price_iqd>0?
                  Math.round((margin/p.unit_sale_price_iqd)*100):null;
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td style={{ direction: 'ltr' }}>{cost===null?'نادیار':money(cost)}</td>
                    <td style={{ direction: 'ltr' }}>{money(p.unit_sale_price_iqd)}</td>
                    <td style={{ direction: 'ltr', color: '#15803d', fontWeight: 900 }}>{margin===null?'نادیار':money(margin)}</td>
                    <td>{pct===null?'نادیار':pct+'%'}</td>
                    <td>{p.stock}</td>
                    <td style={{ direction: 'ltr', fontWeight: 900 }}>{margin===null?'نادیار':money(margin*p.stock)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 3. AI INSIGHTS / DETERMINISTIC RETAIL ANALYTICS (شیکاریی زیرەک)
  if (sectionId === 'ai-insights') {
    const insights = products.map(p => {
      const rawCost=p.unit_purchase_price_iqd;
      const cost=typeof rawCost==='number'&&Number.isSafeInteger(rawCost)&&rawCost>0?
        rawCost:null;
      const unitMargin=cost===null?null:p.unit_sale_price_iqd-cost;
      const minStock = p.min_stock ?? 10;
      const isLow = p.stock <= minStock;
      const statusText = isLow
        ? `پێویستی بە داواکردنەوەی خێرایە (کۆگا: ${p.stock} ≤ کەمترین: ${minStock})`
        : unitMargin===null
        ? 'نرخی کڕین نادیارە — قازانج هەژمار ناکرێت'
        : unitMargin >= 1000
        ? 'کاڵای پڕقازانج — بڕی کۆگا جێگیرە'
        : 'جوڵەی ئاسایی لە ڕەفەدا';
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        stock: p.stock,
        unitMargin,
        recommendation: statusText,
        priority: isLow ? 'بەرز (داواکاریی کڕین)' : 'ئاسایی'
      };
    });

    const highPriorityCount = insights.filter(i => i.priority.startsWith('بەرز')).length;
    const highMarginCount = insights.filter(i => i.unitMargin!==null&&i.unitMargin >= 1000).length;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کاڵاکانی شیکراوە لە کەتەلۆگ</span>
            <span className="ws-kpi-value">{products.length}</span>
            <span className="ws-kpi-sub">پشکنینی خۆکاری کۆگا و قازانج</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">هۆشداریی داواکردنەوەی خێرا</span>
            <span className={`ws-kpi-value ${highPriorityCount > 0 ? 'negative' : 'positive'}`}>
              {highPriorityCount}
            </span>
            <span className="ws-kpi-sub">کاڵای گەیشتوو بە سنووری کەمبوون</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کاڵای پڕقازانج (قازانج ≥ 1,000 IQD)</span>
            <span className="ws-kpi-value positive">{highMarginCount}</span>
            <span className="ws-kpi-sub">پێشنیارکراو بۆ نمایشی پێشەوەی ڕەفە</span>
          </div>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            {highPriorityCount} هۆشداریی کۆگا · {products.length} کاڵای شیکراوە
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی کاڵا</th>
                <th>بەش</th>
                <th>کۆگای بەردەست</th>
                <th>قازانجی یەکە</th>
                <th>ئاستی گرنگی</th>
                <th>شیکاری و پێشنیاری کارگێڕی</th>
              </tr>
            </thead>
            <tbody>
              {insights.map(item => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.category}</td>
                  <td>{item.stock}</td>
                  <td style={{ direction: 'ltr' }}>{item.unitMargin===null?'نادیار':money(item.unitMargin)}</td>
                  <td style={{ color: item.priority.startsWith('بەرز') ? '#b91c1c' : '#15803d', fontWeight: 900 }}>
                    {item.priority}
                  </td>
                  <td>{item.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 4. PURCHASE ORDER (داواکاریی کڕین)
  if (sectionId === 'purchase-order') {
    const handleCreatePo = (e: React.FormEvent) => {
      e.preventDefault();
      const sup = suppliers.find(s => s.id === selectedSupplierId) || suppliers[0];
      const prod = products.find(p => p.id === selectedProductId) || products[0];
      if (!sup || !prod) return;
      const qtyNum = Math.max(1, parseInt(poQty, 10) || 1);
      const costNum=Number(poUnitCost);
      if(!Number.isSafeInteger(costNum)||costNum<=0){
        setPoError('نرخی کڕین نادیارە؛ پێویستە بە شێوەی ڕاستەقینە بینووسیت');
        return;
      }
      setPoError(null);
      const next: PurchaseOrderRecord = {
        id: `po-${Date.now()}`,
        orderNo: `PO-${new Date().getFullYear()}-${String(storeState.purchaseOrders.length + 1).padStart(2, '0')}`,
        supplierId: sup.id,
        supplierName: sup.name,
        productId: prod.id,
        productName: prod.name,
        qty: qtyNum,
        unitCost: costNum,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      setStoreState(prev => ({ ...prev, purchaseOrders: [next, ...prev.purchaseOrders] }));
      addAuditLog('داواکاریی کڕین', `تۆمارکردنی داواکاری ${next.orderNo} بۆ ${sup.name} (${qtyNum} × ${prod.name})`);
    };

    const handleReceivePo = (po: PurchaseOrderRecord) => {
      if (po.status === 'received') return;
      receiveStock(po.productId, po.qty, 'unit', po.supplierId, po.orderNo);
      setStoreState(prev => ({
        ...prev,
        purchaseOrders: prev.purchaseOrders.map(item =>
          item.id === po.id ? { ...item, status: 'received' } : item
        )
      }));
    };

    const pendingPoCount = storeState.purchaseOrders.filter(p => p.status === 'pending').length;
    const totalPoCost = storeState.purchaseOrders.reduce((s, p) => s + p.qty * p.unitCost, 0);

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی داواکارییەکانی کڕین (PO)</span>
            <span className="ws-kpi-value">{storeState.purchaseOrders.length}</span>
            <span className="ws-kpi-sub">تۆمارکراو بۆ دابینکەران</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">داواکاریی چاوەڕوانی گەیشتن</span>
            <span className={`ws-kpi-value ${pendingPoCount > 0 ? 'negative' : 'positive'}`}>
              {pendingPoCount}
            </span>
            <span className="ws-kpi-sub">ئامادە بۆ وەرگرتن لە کۆگا</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی بەهای داواکارییەکان</span>
            <span className="ws-kpi-value">{money(totalPoCost)}</span>
            <span className="ws-kpi-sub">بەپێی نرخی کڕینی یەکە</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">دروستکردنی داواکاریی کڕین بۆ دابینکەر</h2>
          {poError&&<p role="alert" style={{color:'#991b1b',fontWeight:800}}>{poError}</p>}
          <form onSubmit={handleCreatePo} className="ws-form-grid">
            <label className="form-col">
              دابینکەر
              <select value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)}>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="form-col">
              کاڵا
              <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="form-col">
              بڕی داواکراو (دانە)
              <input type="number" min="1" value={poQty} onChange={e => setPoQty(e.target.value)} required />
            </label>
            <label className="form-col">
              نرخی کڕینی یەکە (IQD)
              <input type="number" min="0" value={poUnitCost} onChange={e => setPoUnitCost(e.target.value)} required />
            </label>
            <button type="submit" className="primary">تۆمارکردنی داواکاری</button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            لیستی داواکارییەکانی کڕین ({storeState.purchaseOrders.length} داواکاری · کۆ: {money(totalPoCost)})
          </strong>
          <table>
            <thead>
              <tr>
                <th>ژمارەی داواکاری</th>
                <th>دابینکەر</th>
                <th>کاڵا</th>
                <th>بڕ</th>
                <th>کۆی تێچوو</th>
                <th>بەروار</th>
                <th>دۆخ</th>
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {storeState.purchaseOrders.map(po => (
                <tr key={po.id}>
                  <td><strong>{po.orderNo}</strong></td>
                  <td>{po.supplierName}</td>
                  <td>{po.productName}</td>
                  <td>{po.qty}</td>
                  <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(po.qty * po.unitCost)}</td>
                  <td>{new Date(po.createdAt).toLocaleDateString('en-GB')}</td>
                  <td>
                    <span className={`ws-badge ${po.status === 'received' ? 'success' : 'warning'}`}>
                      {po.status === 'received' ? 'وەرگیراو لە کۆگا' : 'چاوەڕوانی گەیشتن'}
                    </span>
                  </td>
                  <td>
                    {po.status === 'pending' ? (
                      <button type="button" className="primary" onClick={() => handleReceivePo(po)}>
                        وەرگرتن بۆ کۆگا
                      </button>
                    ) : (
                      <span>✓ تەواوبوو</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 5. NEW OFFER (ئافەری نوێ)
  if (sectionId === 'new-offer') {
    const handleAddOffer = (e: React.FormEvent) => {
      e.preventDefault();
      const prod = products.find(p => p.id === selectedProductId) || products[0];
      if (!prod) return;
      const next: OfferRecord = {
        id: `off-${Date.now()}`,
        title: offerTitle.trim() || `ئافەری ${prod.name}`,
        productName: prod.name,
        bundleQty: Math.max(1, parseInt(offerBundleQty, 10) || 2),
        offerPrice: Math.max(250, parseInt(offerPrice, 10) || prod.unit_sale_price_iqd),
        active: true,
        expiresOn: offerExpiry
      };
      setStoreState(prev => ({ ...prev, offers: [next, ...prev.offers] }));
      setOfferTitle('');
      addAuditLog('ئافەری نوێ', `چالاککردنی ئافەر: ${next.title} بە ${money(next.offerPrice)}`);
    };

    const activeOffersCount = storeState.offers.filter(o => o.active).length;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی ئافەرە تۆمارکراوەکان</span>
            <span className="ws-kpi-value">{storeState.offers.length}</span>
            <span className="ws-kpi-sub">ئافەری فرۆشتنی کۆمەڵ و خێزانی</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">ئافەرە چالاکەکانی ئێستا</span>
            <span className="ws-kpi-value positive">{activeOffersCount}</span>
            <span className="ws-kpi-sub">بەردەست لەسەر شاشەی کاشێر</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">ئافەری ڕاگیراو</span>
            <span className="ws-kpi-value">{storeState.offers.length - activeOffersCount}</span>
            <span className="ws-kpi-sub">ئامادە بۆ دووبارە چالاککردنەوە</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">دروستکردنی ئافەری نوێ</h2>
          <form onSubmit={handleAddOffer} className="ws-form-grid">
            <label className="form-col">
              ناوی ئافەر
              <input value={offerTitle} onChange={e => setOfferTitle(e.target.value)} placeholder="نموونە: ئافەری تایبەتی هەفتە" required />
            </label>
            <label className="form-col">
              کاڵا
              <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="form-col">
              ژمارەی دانە لە ئافەردا
              <input type="number" min="1" value={offerBundleQty} onChange={e => setOfferBundleQty(e.target.value)} required />
            </label>
            <label className="form-col">
              نرخی ئافەر (IQD)
              <input type="number" min="250" step="250" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} required />
            </label>
            <label className="form-col">
              بەرواری کۆتایی
              <input type="date" value={offerExpiry} onChange={e => setOfferExpiry(e.target.value)} required />
            </label>
            <button type="submit" className="primary">زیادکردنی ئافەر</button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            لیستی ئافەرەکانی فرۆشگا ({storeState.offers.length} ئافەر · {activeOffersCount} چالاک)
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی ئافەر</th>
                <th>کاڵا</th>
                <th>بڕی دانە</th>
                <th>نرخی ئافەر</th>
                <th>بەسەرچوون</th>
                <th>دۆخ</th>
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {storeState.offers.map(o => (
                <tr key={o.id}>
                  <td><strong>{o.title}</strong></td>
                  <td>{o.productName}</td>
                  <td>{o.bundleQty} دانە</td>
                  <td style={{ direction: 'ltr', fontWeight: 900, color: '#15803d' }}>{money(o.offerPrice)}</td>
                  <td>{o.expiresOn}</td>
                  <td>
                    <span className={`ws-badge ${o.active ? 'success' : 'warning'}`}>
                      {o.active ? 'چالاک' : 'ڕاگیراو'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setStoreState(prev => ({
                          ...prev,
                          offers: prev.offers.map(x => (x.id === o.id ? { ...x, active: !x.active } : x))
                        }))
                      }
                    >
                      {o.active ? 'ڕاگرتن' : 'چالاککردن'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 6. DISCOUNT PERCENT (داشکاندن)
  if (sectionId === 'discount-percent') {
    const handleApplyProductDiscount = (e: React.FormEvent) => {
      e.preventDefault();
      const prod = products.find(p => p.id === selectedProductId);
      const pct = Math.min(90, Math.max(1, parseInt(discountPct, 10) || 5));
      if (!prod) return;
      const discounted = Math.max(250, Math.round((prod.unit_sale_price_iqd * (100 - pct)) / 100 / 250) * 250);
      updateProduct(prod.id, { unit_sale_price_iqd: discounted });
      addAuditLog('داشکاندنی ڕێژەیی', `داشکاندنی ${pct}% لەسەر ${prod.name}: نرخی نوێ ${money(discounted)}`);
    };

    const selectedDiscProd = products.find(p => p.id === selectedProductId) || products[0];
    const previewPct = Math.min(90, Math.max(1, parseInt(discountPct, 10) || 10));
    const previewNewPrice = selectedDiscProd
      ? Math.max(250, Math.round((selectedDiscProd.unit_sale_price_iqd * (100 - previewPct)) / 100 / 250) * 250)
      : 0;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کاڵاکانی ناو کەتەلۆگ</span>
            <span className="ws-kpi-value">{products.length}</span>
            <span className="ws-kpi-sub">ئامادە بۆ داشکاندنی ڕێژەیی خێرا</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">ڕێژەی داشکاندنی هەڵبژێردراو</span>
            <span className="ws-kpi-value positive">{previewPct}%</span>
            <span className="ws-kpi-sub">گردکردنەوەی خۆکار بۆ 250 دیناری عێراقی</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">نرخی پێشبینیکراوی کاڵای هەڵبژێردراو</span>
            <span className="ws-kpi-value">{money(previewNewPrice)}</span>
            <span className="ws-kpi-sub">{selectedDiscProd?.name || '—'}</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">جێبەجێکردنی داشکاندنی ڕێژەیی (%) لەسەر نرخی کاڵا</h2>
          <form onSubmit={handleApplyProductDiscount} className="ws-form-grid">
            <label className="form-col">
              هەڵبژاردنی کاڵا
              <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({money(p.unit_sale_price_iqd)})</option>
                ))}
              </select>
            </label>
            <label className="form-col">
              ڕێژەی داشکاندن (%)
              <input type="number" min="1" max="90" value={discountPct} onChange={e => setDiscountPct(e.target.value)} required />
            </label>
            <button type="submit" className="primary">جێبەجێکردنی داشکاندن</button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            خشتەی نرخی کاڵاکان و پێشبینیی داشکاندن ({products.length} کاڵا)
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی کاڵا</th>
                <th>بەش</th>
                <th>نرخی کڕین</th>
                <th>نرخی فرۆشتنی ئێستا</th>
                <th>نرخ دوای 10% داشکاندن</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.category}</td>
                  <td style={{ direction: 'ltr' }}>{money(p.unit_purchase_price_iqd || 0)}</td>
                  <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(p.unit_sale_price_iqd)}</td>
                  <td style={{ direction: 'ltr', color: '#15803d', fontWeight: 800 }}>
                    {money(Math.max(250, Math.round((p.unit_sale_price_iqd * 0.9) / 250) * 250))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 7. COUPON TICKET (کوپۆن)
  if (sectionId === 'coupon-ticket') {
    const handleAddCoupon = (e: React.FormEvent) => {
      e.preventDefault();
      if (!couponCode.trim()) return;
      const next: CouponRecord = {
        id: `cpn-${Date.now()}`,
        code: couponCode.trim().toUpperCase(),
        discountIqd: Math.max(250, parseInt(couponAmount, 10) || 2500),
        minBasketIqd: Math.max(0, parseInt(couponMinBasket, 10) || 25000),
        expiresOn: '2026-12-31',
        active: true
      };
      setStoreState(prev => ({ ...prev, coupons: [next, ...prev.coupons] }));
      setCouponCode('');
      addAuditLog('دروستکردنی کوپۆن', `کوپۆنی ${next.code} بە بڕی ${money(next.discountIqd)}`);
    };

    const activeCoupons = storeState.coupons.filter(c => c.active).length;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی کوپۆنەکان</span>
            <span className="ws-kpi-value">{storeState.coupons.length}</span>
            <span className="ws-kpi-sub">کۆدی داشکاندنی تایبەتی کڕیاران</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کوپۆنی چالاک</span>
            <span className="ws-kpi-value positive">{activeCoupons}</span>
            <span className="ws-kpi-sub">ئامادە بۆ بەکارهێنان لە کاشێر</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">بەرزترین داشکاندنی کوپۆن</span>
            <span className="ws-kpi-value">
              {money(Math.max(0, ...storeState.coupons.map(c => c.discountIqd)))}
            </span>
            <span className="ws-kpi-sub">بەپێی مەرجی کەمترین سەبەتە</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">دروستکردنی کۆدی کوپۆن</h2>
          <form onSubmit={handleAddCoupon} className="ws-form-grid">
            <label className="form-col">
              کۆدی کوپۆن
              <input value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="KANI-10000" dir="ltr" required />
            </label>
            <label className="form-col">
              بڕی داشکاندن (IQD)
              <input type="number" min="250" step="250" value={couponAmount} onChange={e => setCouponAmount(e.target.value)} required />
            </label>
            <label className="form-col">
              کەمترین کۆی سەبەتە (IQD)
              <input type="number" min="0" step="1000" value={couponMinBasket} onChange={e => setCouponMinBasket(e.target.value)} required />
            </label>
            <button type="submit" className="primary">زیادکردنی کوپۆن</button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            لیستی کۆدەکانی کوپۆن ({storeState.coupons.length} کوپۆن · {activeCoupons} چالاک)
          </strong>
          <table>
            <thead>
              <tr>
                <th>کۆدی کوپۆن</th>
                <th>بڕی داشکاندن</th>
                <th>کەمترین بڕی سەبەتە</th>
                <th>بەرواری بەسەرچوون</th>
                <th>دۆخ</th>
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {storeState.coupons.map(c => (
                <tr key={c.id}>
                  <td style={{ direction: 'ltr', fontWeight: 900 }}>{c.code}</td>
                  <td style={{ direction: 'ltr', color: '#15803d', fontWeight: 900 }}>{money(c.discountIqd)}</td>
                  <td style={{ direction: 'ltr' }}>{money(c.minBasketIqd)}</td>
                  <td>{c.expiresOn}</td>
                  <td>
                    <span className={`ws-badge ${c.active ? 'success' : 'warning'}`}>
                      {c.active ? 'چالاک' : 'ڕاگیراو'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setStoreState(prev => ({
                          ...prev,
                          coupons: prev.coupons.map(x => (x.id === c.id ? { ...x, active: !x.active } : x))
                        }))
                      }
                    >
                      {c.active ? 'ڕاگرتن' : 'چالاککردن'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 8. PROMOTION SPEAKER (کەمپەین)
  if (sectionId === 'promotion-speaker') {
    const handleAddCampaign = (e: React.FormEvent) => {
      e.preventDefault();
      if (!campaignName.trim()) return;
      const next: CampaignRecord = {
        id: `cmp-${Date.now()}`,
        name: campaignName.trim(),
        targetGroup: campaignGroup.trim() || 'گشتی',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: campaignEnd,
        active: true
      };
      setStoreState(prev => ({ ...prev, campaigns: [next, ...prev.campaigns] }));
      setCampaignName('');
      addAuditLog('کەمپەینی فرۆشتن', `دەستپێکردنی کەمپەین: ${next.name}`);
    };

    const activeCampaignsCount = storeState.campaigns.filter(c => c.active).length;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی کەمپەینەکانی بازاڕگەری</span>
            <span className="ws-kpi-value">{storeState.campaigns.length}</span>
            <span className="ws-kpi-sub">کەمپەینی وەرزی و بۆنەکان</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کەمپەینی چالاک</span>
            <span className="ws-kpi-value positive">{activeCampaignsCount}</span>
            <span className="ws-kpi-sub">لەسەر بەشەکانی مارکێت کارایە</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کەمپەینی تەواوبوو</span>
            <span className="ws-kpi-value">{storeState.campaigns.length - activeCampaignsCount}</span>
            <span className="ws-kpi-sub">ئەرشیفکراو لە سیستەمدا</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">ڕاگەیاندنی کەمپەینی بازاڕگەری</h2>
          <form onSubmit={handleAddCampaign} className="ws-form-grid">
            <label className="form-col">
              ناوی کەمپەین
              <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="نموونە: کەمپەینی مانگی ڕەمەزان" required />
            </label>
            <label className="form-col">
              بەشی ئامانج
              <input value={campaignGroup} onChange={e => setCampaignGroup(e.target.value)} required />
            </label>
            <label className="form-col">
              بەرواری کۆتایی
              <input type="date" value={campaignEnd} onChange={e => setCampaignEnd(e.target.value)} required />
            </label>
            <button type="submit" className="primary">زیادکردنی کەمپەین</button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            لیستی کەمپەینەکانی بازاڕگەری ({storeState.campaigns.length} کەمپەین)
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی کەمپەین</th>
                <th>بەشی کاڵاکان</th>
                <th>دەستپێک</th>
                <th>کۆتایی</th>
                <th>دۆخ</th>
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {storeState.campaigns.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.targetGroup}</td>
                  <td>{c.startDate}</td>
                  <td>{c.endDate}</td>
                  <td>
                    <span className={`ws-badge ${c.active ? 'success' : 'warning'}`}>
                      {c.active ? 'چالاک' : 'تەواوبوو'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setStoreState(prev => ({
                          ...prev,
                          campaigns: prev.campaigns.map(x => (x.id === c.id ? { ...x, active: !x.active } : x))
                        }))
                      }
                    >
                      {c.active ? 'ڕاگرتن' : 'چالاککردن'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 9. MANAGE USERS (بەکارهێنەران)
  if (sectionId === 'manage-users') {
    const handleAddUser = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newUsername.trim() || !newFullName.trim()) return;
      const next: StaffUserRecord = {
        id: `u-${Date.now()}`,
        username: newUsername.trim(),
        fullName: newFullName.trim(),
        role: newRole,
        active: true
      };
      setStoreState(prev => ({ ...prev, users: [...prev.users, next] }));
      setNewUsername('');
      setNewFullName('');
      addAuditLog('زیادکردنی بەکارهێنەر', `زیادکردنی هەژماری ${next.username} بە ڕۆڵی ${next.role}`);
    };

    const toggleUserActive = (id: string) => {
      setStoreState(prev => ({
        ...prev,
        users: prev.users.map(u => (u.id === id ? { ...u, active: !u.active } : u))
      }));
    };

    const activeUsersCount = storeState.users.filter(u => u.active).length;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی بەکارهێنەرانی سیستەم</span>
            <span className="ws-kpi-value">{storeState.users.length}</span>
            <span className="ws-kpi-sub">خاوەن مارکێت، بەڕێوەبەر و کاشێرەکان</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">هەژمارە چالاکەکان</span>
            <span className="ws-kpi-value positive">{activeUsersCount}</span>
            <span className="ws-kpi-sub">ڕێپێدراو بۆ چوونەژوورەوە</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کاشێرە تۆمارکراوەکان</span>
            <span className="ws-kpi-value">
              {storeState.users.filter(u => u.role === 'کاشێر').length}
            </span>
            <span className="ws-kpi-sub">بەستراو بە شەفتی سندووق</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">زیادکردنی بەکارهێنەری سیستەم</h2>
          <form onSubmit={handleAddUser} className="ws-form-grid">
            <label className="form-col">
              ناوی تەواو
              <input value={newFullName} onChange={e => setNewFullName(e.target.value)} placeholder="ناوی کارمەند" required />
            </label>
            <label className="form-col">
              ناوی هەژمار (Username)
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="cashier_02" dir="ltr" required />
            </label>
            <label className="form-col">
              ڕۆڵی دەسەڵات
              <select value={newRole} onChange={e => setNewRole(e.target.value as StaffUserRecord['role'])}>
                <option value="کاشێر">کاشێر</option>
                <option value="بەڕێوەبەر">بەڕێوەبەر</option>
                <option value="خاوەن مارکێت">خاوەن مارکێت</option>
              </select>
            </label>
            <button type="submit" className="primary">زیادکردنی هەژمار</button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            بەڕێوەبردنی هەژماری بەکارهێنەران ({storeState.users.length} بەکارهێنەر)
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی تەواو</th>
                <th>ناوی بەکارهێنەر</th>
                <th>ڕۆڵ</th>
                <th>دۆخ</th>
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {storeState.users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.fullName}</strong></td>
                  <td style={{ direction: 'ltr' }}>{u.username}</td>
                  <td>{u.role}</td>
                  <td>
                    <span className={`ws-badge ${u.active ? 'success' : 'warning'}`}>
                      {u.active ? 'چالاک' : 'ڕاگیراو'}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="secondary" onClick={() => toggleUserActive(u.id)}>
                      {u.active ? 'ڕاگرتن' : 'چالاککردنەوە'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 10. ACCESS KEY (دەسەڵاتەکان)
  if (sectionId === 'access-key') {
    const permissions = [
      { capability: 'فرۆشتنی نەختینە و سکانی بارکۆد', owner: 'ڕێپێدراو', manager: 'ڕێپێدراو', cashier: 'ڕێپێدراو' },
      { capability: 'گۆڕینی نرخی کاڵا و زیادکردنی بارکۆد', owner: 'ڕێپێدراو', manager: 'ڕێپێدراو', cashier: 'قەدەغەکراو (403)' },
      { capability: 'پەسەندکردنی گەڕاندنەوەی پارە (Refund)', owner: 'ڕێپێدراو', manager: 'ڕێپێدراو', cashier: 'پێویستی بە مۆڵەتە' },
      { capability: 'بینینی دەفتەری قەرزی کڕیاران و دابینکەران', owner: 'ڕێپێدراو', manager: 'ڕێپێدراو', cashier: 'قەدەغەکراو (403)' },
      { capability: 'وەرگرتنی وەسڵی کڕین و زیادکردنی LOT', owner: 'ڕێپێدراو', manager: 'ڕێپێدراو', cashier: 'قەدەغەکراو (403)' },
      { capability: 'تۆمارکردن و هەڵوەشاندنەوەی بڕوانامەی ئامێری mTLS (V100/V104)', owner: 'ڕێپێدراو', manager: 'قەدەغەکراو', cashier: 'قەدەغەکراو' }
    ];

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">ئاستەکانی دەسەڵات (RBAC)</span>
            <span className="ws-kpi-value">3 ڕۆڵ</span>
            <span className="ws-kpi-sub">خاوەن مارکێت · بەڕێوەبەر · کاشێر</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">یاساکانی کۆنترۆڵی دەسەڵات</span>
            <span className="ws-kpi-value positive">{permissions.length} یاسا</span>
            <span className="ws-kpi-sub">پاراستنی نرخ و دەفتەری قەرز</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">ئاستی پاراستنی تۆڕی ناوخۆیی</span>
            <span className="ws-kpi-value positive">TLS 1.3 mTLS</span>
            <span className="ws-kpi-sub">پشتڕاستکراو بە بڕوانامەی ئامێر</span>
          </div>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            خشتەی دەسەڵات و مۆڵەتەکانی بەکارهێنەران ({permissions.length} بوار)
          </strong>
          <table>
            <thead>
              <tr>
                <th>بوار و کرداری سیستەم</th>
                <th>خاوەن مارکێت (Owner)</th>
                <th>بەڕێوەبەر (Manager)</th>
                <th>کاشێر (Cashier)</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((perm, idx) => (
                <tr key={idx}>
                  <td><strong>{perm.capability}</strong></td>
                  <td style={{ color: '#15803d', fontWeight: 900 }}>{perm.owner}</td>
                  <td style={{ color: perm.manager === 'ڕێپێدراو' ? '#15803d' : '#b91c1c', fontWeight: 900 }}>{perm.manager}</td>
                  <td style={{ color: perm.cashier === 'ڕێپێدراو' ? '#15803d' : '#b45309', fontWeight: 900 }}>{perm.cashier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 11. SYSTEM CONTROLS (سیستەم)
  if (sectionId === 'system-controls') {
    const cfg = storeState.systemConfig;
    const updateCfg = (patch: Partial<StoredSubmoduleState['systemConfig']>) => {
      setStoreState(prev => ({
        ...prev,
        systemConfig: { ...prev.systemConfig, ...patch }
      }));
      addAuditLog('ڕێکخستنی سیستەم', 'نوێکردنەوەی ڕێکخستنە گشتییەکانی مارکێت');
    };

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">دراوی فەرمیی سیستەم</span>
            <span className="ws-kpi-value positive">IQD</span>
            <span className="ws-kpi-sub">دیناری عێراقی (بێ کەرتی دەیی)</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">فرۆشتن بە قەرز لە کاشێر</span>
            <span className={`ws-kpi-value ${cfg.allowDebtCheckout ? 'positive' : 'negative'}`}>
              {cfg.allowDebtCheckout ? 'ڕێپێدراو' : 'ڕاگیراو'}
            </span>
            <span className="ws-kpi-sub">بۆ کڕیارانی تۆمارکراو لە دەفتەری قەرز</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">سنووری بنەڕەتیی کەمبوونی کۆگا</span>
            <span className="ws-kpi-value">{cfg.defaultMinStock} دانە</span>
            <span className="ws-kpi-sub">بۆ هۆشداریی خۆکاری کۆگا</span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
            gap: '12px',
            alignItems: 'stretch',
            flex: '1 1 0',
            minHeight: 0,
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0, overflow: 'hidden' }}>
            <div className="ws-panel" style={{ flexShrink: 0 }}>
              <h2 className="ws-panel-title">ڕێکخستنە گشتییەکانی سیستەمی مارکێت</h2>
              <div className="ws-form-grid">
                <label className="form-col">
                  ناوی فرۆشگا لەسەر پسووڵە
                  <input value={cfg.storeName} onChange={e => updateCfg({ storeName: e.target.value })} />
                </label>
                <label className="form-col">
                  دەقی ژێرەوەی پسووڵەی گەرمی
                  <input value={cfg.receiptFooter} onChange={e => updateCfg({ receiptFooter: e.target.value })} />
                </label>
                <label className="form-col">
                  سنووری ئاگادارکردنەوەی کەمیی کۆگا
                  <input
                    type="number"
                    min="1"
                    value={cfg.defaultMinStock}
                    onChange={e => updateCfg({ defaultMinStock: Math.max(1, parseInt(e.target.value, 10) || 10) })}
                  />
                </label>
              </div>
            </div>

            <div className="section-workspace__table" style={{ flex: '1 1 0', minHeight: 0 }}>
              <strong className="section-workspace__metric">
                بڕگەکانی کۆنترۆڵ و سیاسەتی کارکردنی سیستەم
              </strong>
              <table>
                <thead>
                  <tr>
                    <th>بڕگەی ڕێکخستن</th>
                    <th>نرخی ئێستا</th>
                    <th>دۆخ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>دراوی بنەڕەتیی ژمێریاری</strong></td>
                    <td>دیناری عێراقی (IQD — بێ کەرتی دەیی)</td>
                    <td><span className="ws-badge success">چالاک و قفڵکراو</span></td>
                  </tr>
                  <tr>
                    <td><strong>کەتەلۆگی مارکێت (V103/V104 CSV)</strong></td>
                    <td>43,930 کاڵای پشتڕاستکراو بە پشکنینی SHA-256 و TLS 1.3 mTLS</td>
                    <td><span className="ws-badge success">تەنها-خوێندنەوە (Read-Only)</span></td>
                  </tr>
                  <tr>
                    <td><strong>فرۆشتن بە قەرز بۆ کڕیارانی تۆمارکراو</strong></td>
                    <td>{cfg.allowDebtCheckout ? 'ڕێپێدراو' : 'ڕاگیراو'}</td>
                    <td>
                      <button type="button" className="secondary" onClick={() => updateCfg({ allowDebtCheckout: !cfg.allowDebtCheckout })}>
                        گۆڕین
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>مەرجی ڕەزامەندیی بەڕێوەبەر بۆ گەڕاندنەوەی کاڵا</strong></td>
                    <td>{cfg.requireManagerForReturn ? 'پێویستە' : 'ناچالاک'}</td>
                    <td>
                      <button type="button" className="secondary" onClick={() => updateCfg({ requireManagerForReturn: !cfg.requireManagerForReturn })}>
                        گۆڕین
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <KurdishVoiceAssistantModal embedded />
          </div>
        </div>
      </div>
    );
  }

  // 12. PRINT TEMPLATE (قاڵبی چاپ)
  if (sectionId === 'print-template') {
    const toggleTemplate = (id: string) => {
      setStoreState(prev => ({
        ...prev,
        templates: prev.templates.map(t => (t.id === id ? { ...t, active: !t.active } : t))
      }));
    };

    const activeTemplates = storeState.templates.filter(t => t.active).length;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی قاڵبەکانی چاپ</span>
            <span className="ws-kpi-value">{storeState.templates.length}</span>
            <span className="ws-kpi-sub">پسووڵەی گەرمی و لیبڵی ڕەفە</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">قاڵبە چالاکەکان</span>
            <span className="ws-kpi-value positive">{activeTemplates}</span>
            <span className="ws-kpi-sub">ئامادە بۆ چاپکەری گەرمی و Zebra</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">ستانداردی بارکۆدی چاپ</span>
            <span className="ws-kpi-value">EAN-13 / Code128</span>
            <span className="ws-kpi-sub">گونجاو لەگەڵ سکانەری کاشێر</span>
          </div>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            لیستی قاڵبەکانی چاپکردنی پسووڵە و لیبڵ ({storeState.templates.length} قاڵب)
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی قاڵب</th>
                <th>جۆری چاپکەر</th>
                <th>قەبارەی کاغەز</th>
                <th>بارکۆد لەسەر چاپ</th>
                <th>دۆخ</th>
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {storeState.templates.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong></td>
                  <td>{t.paperType}</td>
                  <td style={{ direction: 'ltr' }}>{t.dimensions}</td>
                  <td>{t.showBarcode ? 'بەڵێ (Code-128 / EAN-13)' : 'نەخێر'}</td>
                  <td>
                    <span className={`ws-badge ${t.active ? 'success' : 'warning'}`}>
                      {t.active ? 'بنەڕەتی (چالاک)' : 'ناچالاک'}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="secondary" onClick={() => toggleTemplate(t.id)}>
                      {t.active ? 'ناچالاککردن' : 'هەڵبژاردن وەک بنەڕەتی'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 13. ATTENDANCE (ئامادەبوون) & 14. WORK TIMER (کاتی کار)
  if (sectionId === 'attendance' || sectionId === 'work-timer') {
    const handleCheckIn = (e: React.FormEvent) => {
      e.preventDefault();
      if (!attStaffName.trim()) return;
      const nowTime = new Date().toTimeString().slice(0, 5);
      const next: AttendanceRecord = {
        id: `att-${Date.now()}`,
        staffName: attStaffName.trim(),
        role: attRole.trim() || 'کاشێر',
        date: new Date().toISOString().slice(0, 10),
        checkIn: nowTime,
        checkOut: '—',
        hours: Math.max(1, parseFloat(attHours) || 8),
        status: 'ئامادە'
      };
      setStoreState(prev => ({ ...prev, attendance: [next, ...prev.attendance] }));
      addAuditLog('ئامادەبوونی کارمەند', `تۆمارکردنی هاتنی ${next.staffName} لە کاتژمێر ${nowTime}`);
    };

    const completeCheckOut = (id: string) => {
      const nowTime = new Date().toTimeString().slice(0, 5);
      setStoreState(prev => ({
        ...prev,
        attendance: prev.attendance.map(a =>
          a.id === id ? { ...a, checkOut: nowTime, status: 'تەواوبوو' } : a
        )
      }));
    };

    const totalHours = storeState.attendance.reduce((s, a) => s + a.hours, 0);
    const presentCount = storeState.attendance.filter(a => a.status === 'ئامادە').length;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی تۆمارەکانی دەوام</span>
            <span className="ws-kpi-value">{storeState.attendance.length}</span>
            <span className="ws-kpi-sub">هاتن و چوونی کارمەندان</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کارمەندانی ئامادە لە دەوامدا</span>
            <span className="ws-kpi-value positive">{presentCount}</span>
            <span className="ws-kpi-sub">لە ناو شەفتی ئێستای مارکێت</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی کاتژمێری تۆمارکراو</span>
            <span className="ws-kpi-value">{totalHours} کاتژمێر</span>
            <span className="ws-kpi-sub">سەرجەم شەفتە تۆمارکراوەکان</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">
            {sectionId === 'attendance' ? 'تۆمارکردنی هاتن و چوونی کارمەندان' : 'تۆمارکردنی کاتژمێری کارکردنی شێفت'}
          </h2>
          <form onSubmit={handleCheckIn} className="ws-form-grid">
            <label className="form-col">
              ناوی کارمەند
              <input value={attStaffName} onChange={e => setAttStaffName(e.target.value)} required />
            </label>
            <label className="form-col">
              ئەرک / ڕۆڵ
              <input value={attRole} onChange={e => setAttRole(e.target.value)} required />
            </label>
            <label className="form-col">
              کاتژمێری پلاندانراو
              <input type="number" step="0.5" min="1" max="16" value={attHours} onChange={e => setAttHours(e.target.value)} required />
            </label>
            <button type="submit" className="primary">تۆمارکردنی هاتن</button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">کۆی کاتژمێری تۆمارکراو: {totalHours} کاتژمێر</strong>
          <table>
            <thead>
              <tr>
                <th>کارمەند</th>
                <th>ئەرک</th>
                <th>بەروار</th>
                <th>کاتی هاتن</th>
                <th>کاتی چوون</th>
                <th>کۆی کاتژمێر</th>
                <th>دۆخ</th>
                <th>کردار</th>
              </tr>
            </thead>
            <tbody>
              {storeState.attendance.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.staffName}</strong></td>
                  <td>{a.role}</td>
                  <td>{a.date}</td>
                  <td style={{ direction: 'ltr' }}>{a.checkIn}</td>
                  <td style={{ direction: 'ltr' }}>{a.checkOut}</td>
                  <td>{a.hours} کاتژمێر</td>
                  <td>
                    <span className={`ws-badge ${a.status === 'ئامادە' ? 'success' : 'warning'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td>
                    {a.status === 'ئامادە' ? (
                      <button type="button" className="secondary" onClick={() => completeCheckOut(a.id)}>
                        تۆمارکردنی چوون
                      </button>
                    ) : (
                      <span>✓ تەواوبوو</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 15. STAFF REVIEW (هەڵسەنگاندن)
  if (sectionId === 'staff-review') {
    const handleAddReview = (e: React.FormEvent) => {
      e.preventDefault();
      if (!revStaffName.trim()) return;
      const next: StaffReviewRecord = {
        id: `rev-${Date.now()}`,
        staffName: revStaffName.trim(),
        period: new Date().toISOString().slice(0, 7),
        rating: revRating,
        cashAccuracy: 'هاوسەنگ و بێ جیاوازی',
        note: revNote.trim() || 'پابەندبوون بە ڕێنماییەکانی فرۆشگا'
      };
      setStoreState(prev => ({ ...prev, reviews: [next, ...prev.reviews] }));
      setRevNote('');
    };

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی هەڵسەنگاندنەکان</span>
            <span className="ws-kpi-value">{storeState.reviews.length}</span>
            <span className="ws-kpi-sub">چاودێریی ئەدای مانگانەی ستاف</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">ئاستی وردبینیی سندووق</span>
            <span className="ws-kpi-value positive">98.5%</span>
            <span className="ws-kpi-sub">بەپێی پاکتاوی شەفتی کاشێرەکان</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">دوایین خولی هەڵسەنگاندن</span>
            <span className="ws-kpi-value">{storeState.reviews[0]?.period || '2026-10'}</span>
            <span className="ws-kpi-sub">پەسەندکراو لەلایەن بەڕێوەبەر</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">تۆمارکردنی هەڵسەنگاندنی کارمەند</h2>
          <form onSubmit={handleAddReview} className="ws-form-grid">
            <label className="form-col">
              کارمەند
              <input value={revStaffName} onChange={e => setRevStaffName(e.target.value)} required />
            </label>
            <label className="form-col">
              ئاستی هەڵسەنگاندن
              <select value={revRating} onChange={e => setRevRating(e.target.value)}>
                <option value="نایاب (98%)">نایاب (98%)</option>
                <option value="زۆر باش (92%)">زۆر باش (92%)</option>
                <option value="باش (85%)">باش (85%)</option>
              </select>
            </label>
            <label className="form-col">
              تێبینیی بەڕێوەبەر
              <input value={revNote} onChange={e => setRevNote(e.target.value)} placeholder="وردبینی لە سندووق و خێرایی کار..." />
            </label>
            <button type="submit" className="primary">تۆمارکردن</button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            تۆماری هەڵسەنگاندنی کارمەندان ({storeState.reviews.length} تۆمار)
          </strong>
          <table>
            <thead>
              <tr>
                <th>کارمەند</th>
                <th>مانگ</th>
                <th>هەڵسەنگاندن</th>
                <th>وردبینیی سندووق</th>
                <th>تێبینی</th>
              </tr>
            </thead>
            <tbody>
              {storeState.reviews.map(r => (
                <tr key={r.id}>
                  <td><strong>{r.staffName}</strong></td>
                  <td style={{ direction: 'ltr' }}>{r.period}</td>
                  <td style={{ color: '#15803d', fontWeight: 900 }}>{r.rating}</td>
                  <td>{r.cashAccuracy}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 16. APPROVAL FILE (داوای مۆڵەت)
  if (sectionId === 'approval-file') {
    const handleAddApproval = (e: React.FormEvent) => {
      e.preventDefault();
      if (!aprDetail.trim()) return;
      const next: ApprovalRequestRecord = {
        id: `apr-${Date.now()}`,
        requester: aprRequester.trim(),
        requestType: aprType,
        targetDetail: aprDetail.trim(),
        createdAt: new Date().toISOString(),
        status: 'چاوەڕوانکراو'
      };
      setStoreState(prev => ({ ...prev, approvals: [next, ...prev.approvals] }));
      setAprDetail('');
    };

    const decideApproval = (id: string, decision: 'پەسەندکراو' | 'ڕەتکراوەتەوە') => {
      const target = storeState.approvals.find(a => a.id === id);
      setStoreState(prev => ({
        ...prev,
        approvals: prev.approvals.map(a => (a.id === id ? { ...a, status: decision } : a))
      }));
      if (target) {
        addAuditLog(`بڕیاری مۆڵەت (${decision})`, `${target.requestType}: ${target.targetDetail}`);
      }
    };

    const pendingApprovals = storeState.approvals.filter(a => a.status === 'چاوەڕوانکراو').length;
    const approvedCount = storeState.approvals.filter(a => a.status === 'پەسەندکراو').length;

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی داواکارییەکانی مۆڵەت</span>
            <span className="ws-kpi-value">{storeState.approvals.length}</span>
            <span className="ws-kpi-sub">گەڕاندنەوە، داشکاندن و مۆڵەتی تایبەت</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">داواکاریی چاوەڕوانکراو</span>
            <span className={`ws-kpi-value ${pendingApprovals > 0 ? 'negative' : 'positive'}`}>
              {pendingApprovals}
            </span>
            <span className="ws-kpi-sub">پێویستی بە بڕیاری بەڕێوەبەرە</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">داواکاریی پەسەندکراو</span>
            <span className="ws-kpi-value positive">{approvedCount}</span>
            <span className="ws-kpi-sub">تۆمارکراو لە مێژووی پشکنینی سیستەم</span>
          </div>
        </div>

        <div className="ws-panel">
          <h2 className="ws-panel-title">تۆمارکردنی داوای مۆڵەتی بەڕێوەبەر</h2>
          <form onSubmit={handleAddApproval} className="ws-form-grid">
            <label className="form-col">
              داواکەر
              <input value={aprRequester} onChange={e => setAprRequester(e.target.value)} required />
            </label>
            <label className="form-col">
              جۆری داواکاری
              <select value={aprType} onChange={e => setAprType(e.target.value)}>
                <option value="گۆڕینی نرخ / داشکاندن">گۆڕینی نرخ / داشکاندن</option>
                <option value="گەڕاندنەوەی کاڵا">گەڕاندنەوەی کاڵا</option>
                <option value="تێپەڕاندنی سنووری قەرز">تێپەڕاندنی سنووری قەرز</option>
              </select>
            </label>
            <label className="form-col">
              وردەکاری و بڕ
              <input value={aprDetail} onChange={e => setAprDetail(e.target.value)} placeholder="ژمارەی پسووڵە و بڕی پارە..." required />
            </label>
            <button type="submit" className="primary">ناردنی داواکاری</button>
          </form>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            لیستی داواکارییەکانی مۆڵەتی کارمەندان ({storeState.approvals.length} داواکاری)
          </strong>
          <table>
            <thead>
              <tr>
                <th>داواکەر</th>
                <th>جۆری داوا</th>
                <th>وردەکاری</th>
                <th>بەروار</th>
                <th>دۆخ</th>
                <th>بڕیاری بەڕێوەبەر</th>
              </tr>
            </thead>
            <tbody>
              {storeState.approvals.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.requester}</strong></td>
                  <td>{a.requestType}</td>
                  <td>{a.targetDetail}</td>
                  <td>{new Date(a.createdAt).toLocaleDateString('en-GB')}</td>
                  <td>
                    <span
                      className={`ws-badge ${
                        a.status === 'پەسەندکراو'
                          ? 'success'
                          : a.status === 'ڕەتکراوەتەوە'
                          ? 'danger'
                          : 'warning'
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td>
                    {a.status === 'چاوەڕوانکراو' ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" className="primary" onClick={() => decideApproval(a.id, 'پەسەندکراو')}>
                          پەسەندکردن
                        </button>
                        <button type="button" className="secondary" onClick={() => decideApproval(a.id, 'ڕەتکراوەتەوە')}>
                          ڕەتکردنەوە
                        </button>
                      </div>
                    ) : (
                      <span>{a.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 17. SALES TREND REPORT (ڕاپۆرتی فرۆشتن — Subsection 7.1)
  if (sectionId === 'sales-trend') {
    const totalSalesRevenue = receipts.reduce((sum, r) => sum + r.total, 0);
    const cashSalesRevenue = receipts
      .filter(r => r.paymentMethod === 'cash')
      .reduce((sum, r) => sum + r.total, 0);
    const debtSalesRevenue = receipts
      .filter(r => r.paymentMethod === 'debt')
      .reduce((sum, r) => sum + r.total, 0);
    const avgBasket = receipts.length > 0 ? Math.round(totalSalesRevenue / receipts.length) : 0;

    // Aggregate top sold items across receipts
    const soldByProduct = new Map<
      string,
      { name: string; totalQty: number; totalRevenue: number; invoiceCount: number }
    >();
    receipts.forEach(r => {
      r.items.forEach(item => {
        const prev = soldByProduct.get(item.productId) || {
          name: item.name,
          totalQty: 0,
          totalRevenue: 0,
          invoiceCount: 0
        };
        prev.totalQty += item.qty;
        prev.totalRevenue += item.total;
        prev.invoiceCount += 1;
        soldByProduct.set(item.productId, prev);
      });
    });
    const topSoldList = Array.from(soldByProduct.values()).sort(
      (a, b) => b.totalRevenue - a.totalRevenue
    );

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی گشتیی داهاتی فرۆشتن</span>
            <span className="ws-kpi-value positive">{money(totalSalesRevenue)}</span>
            <span className="ws-kpi-sub">نەختینە: {money(cashSalesRevenue)} · قەرز: {money(debtSalesRevenue)}</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">ژمارەی پسووڵە دەرچووەکان</span>
            <span className="ws-kpi-value">{receipts.length} پسووڵە</span>
            <span className="ws-kpi-sub">لە شەفتی چالاکی ئێستادا</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">تێکڕای بەهای سەبەتە (Average Basket)</span>
            <span className="ws-kpi-value">{money(avgBasket)}</span>
            <span className="ws-kpi-sub">ناوەندی کڕینی هەر کڕیارێک</span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.35fr)',
            gap: '10px',
            alignItems: 'start',
            flex: '0 1 auto',
            minHeight: 0,
            overflow: 'hidden'
          }}
        >
          <div className="section-workspace__table" style={{ height: 'auto', maxHeight: '100%' }}>
            <strong className="section-workspace__metric">
              پڕفرۆشترین کاڵاکان بەپێی داهاتی فرۆشتن ({topSoldList.length} کاڵا)
            </strong>
            <table>
              <thead>
                <tr>
                  <th>ناوی کاڵا</th>
                  <th>ژمارەی پسووڵە</th>
                  <th>کۆی بڕی فرۆشراو</th>
                  <th>کۆی داهاتی کاڵا</th>
                </tr>
              </thead>
              <tbody>
                {topSoldList.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{item.invoiceCount} پسووڵە</td>
                    <td style={{ fontWeight: 900 }}>{item.totalQty}</td>
                    <td style={{ direction: 'ltr', fontWeight: 900, color: '#15803d' }}>
                      {money(item.totalRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-workspace__table" style={{ height: 'auto', maxHeight: '100%' }}>
            <strong className="section-workspace__metric">
              ڕاپۆرتی وردی پسووڵەکانی فرۆشتن ({receipts.length} پسووڵە · کۆ: {money(totalSalesRevenue)})
            </strong>
            <table>
              <thead>
                <tr>
                  <th>ژمارەی پسووڵە</th>
                  <th>بەروار</th>
                  <th>کڕیار</th>
                  <th>جۆری پارەدان</th>
                  <th>کۆی پسووڵە</th>
                  <th>کردار</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id}>
                    <td style={{ direction: 'ltr', fontWeight: 900 }}>{r.receiptNumber}</td>
                    <td style={{ direction: 'ltr' }}>{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
                    <td>
                      <strong>{r.customerName || 'کڕیاری نەختینە'}</strong>
                    </td>
                    <td>
                      <span className={`ws-badge ${r.paymentMethod === 'cash' ? 'success' : 'warning'}`}>
                        {r.paymentMethod === 'cash' ? 'نەختینە' : 'قەرز'}
                      </span>
                    </td>
                    <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(r.total)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setActiveReceiptForModal(r)}
                      >
                        بینین و چاپ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // 18. STOCK CHART REPORT (ڕاپۆرتی کۆگا — Subsection 7.3)
  if (sectionId === 'stock-chart') {
    const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);
    const totalRetailVal = products.reduce((sum, p) => sum + p.stock * p.unit_sale_price_iqd, 0);
    const totalCostVal = products.reduce(
      (sum, p) => sum + p.stock * (p.unit_purchase_price_iqd || 0),
      0
    );

    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">کۆی یەکەکانی ناو کۆگا</span>
            <span className="ws-kpi-value">{totalUnits.toLocaleString('en-US')}</span>
            <span className="ws-kpi-sub">لە سەرجەم {products.length} کاڵاکانی فرۆشگا</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">بەهای کۆگا بە نرخی فرۆشتن</span>
            <span className="ws-kpi-value positive">{money(totalRetailVal)}</span>
            <span className="ws-kpi-sub">کۆی بەهای فرۆشتنی کاڵاکانی ناو کۆگا</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">بەهای کۆگا بە نرخی تێچوو (کڕین)</span>
            <span className="ws-kpi-value">{money(totalCostVal)}</span>
            <span className="ws-kpi-sub">
              قازانجی چاوەڕوانکراو: {money(totalRetailVal - totalCostVal)}
            </span>
          </div>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            ڕاپۆرتی بەها و باڵانسی کاڵاکانی کۆگا ({products.length} کاڵا)
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی کاڵا</th>
                <th>پۆل</th>
                <th>بڕی کۆگا</th>
                <th>یەکە</th>
                <th>نرخی تێچووی یەکە</th>
                <th>نرخی فرۆشتنی یەکە</th>
                <th>کۆی بەهای فرۆشتن لە کۆگا</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>{p.category || 'گشتی'}</td>
                  <td
                    style={{
                      fontWeight: 900,
                      color: p.stock <= (p.min_stock || 10) ? '#b91c1c' : '#15803d'
                    }}
                  >
                    {p.stock}
                  </td>
                  <td>{p.base_unit === 'kg' ? 'کیلۆگرام' : 'دانە'}</td>
                  <td style={{ direction: 'ltr' }}>{money(p.unit_purchase_price_iqd || 0)}</td>
                  <td style={{ direction: 'ltr', fontWeight: 800 }}>{money(p.unit_sale_price_iqd)}</td>
                  <td style={{ direction: 'ltr', fontWeight: 900, color: '#15803d' }}>
                    {money(p.stock * p.unit_sale_price_iqd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 19. SHIFT CLOCK (شەفتی کار — Subsection 10.1)
  if (sectionId === 'shift-clock') {
    return (
      <div className="ws-stack">
        <div className="ws-kpi-grid">
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">دۆخی شەفتی ئێستا</span>
            <span className={`ws-kpi-value ${currentShift.status === 'open' ? 'positive' : 'negative'}`}>
              {currentShift.status === 'open' ? 'کراوە (چالاک)' : 'داخراو'}
            </span>
            <span className="ws-kpi-sub">کاشێر: {currentShift.cashierName}</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">سەرمایەی دەستپێکی شەفت</span>
            <span className="ws-kpi-value">{money(currentShift.openingFloat)}</span>
            <span className="ws-kpi-sub">پارەی سەرەتای کردنەوەی سندووق</span>
          </div>
          <div className="ws-kpi-card">
            <span className="ws-kpi-label">باڵانسی چاوەڕوانکراوی سندووق</span>
            <span className="ws-kpi-value positive">{money(currentShift.expectedCash)}</span>
            <span className="ws-kpi-sub">دوای فرۆشتن و خەرجییەکانی شەفت</span>
          </div>
        </div>

        <div className="ws-panel">
          <div className="ws-toolbar" style={{ marginBottom: 0 }}>
            <div>
              <h2 className="ws-panel-title" style={{ margin: 0 }}>
                کۆنترۆڵی شەفتی کار و دەوامی کاشێرەکان
              </h2>
              <div style={{ fontSize: '12px', color: '#536c85', marginTop: '4px', fontWeight: 700 }}>
                کاتی دەستپێکی شەفت: {new Date(currentShift.openedAt).toLocaleString('en-GB')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {currentShift.status === 'open' ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => closeShift(currentShift.expectedCash)}
                >
                  داخستنی شەفتی ئێستا ({money(currentShift.expectedCash)})
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => openNewShift('ئارام (کاشێری سەرەکی)', 250000)}
                >
                  کردنەوەی شەفتی نوێ (250,000 IQD)
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="section-workspace__table">
          <strong className="section-workspace__metric">
            تۆماری شەفتەکانی کارکردنی کاشێر
          </strong>
          <table>
            <thead>
              <tr>
                <th>ناوی کاشێر</th>
                <th>کاتی کردنەوە</th>
                <th>کاتی داخستن</th>
                <th>سەرمایەی سەرەتا</th>
                <th>فرۆشتنی نەختینە</th>
                <th>باڵانسی چاوەڕوانکراو</th>
                <th>دۆخ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>{currentShift.cashierName}</strong>
                </td>
                <td style={{ direction: 'ltr' }}>{new Date(currentShift.openedAt).toLocaleDateString('en-GB')}</td>
                <td style={{ direction: 'ltr' }}>
                  {currentShift.closedAt ? new Date(currentShift.closedAt).toLocaleDateString('en-GB') : '—'}
                </td>
                <td style={{ direction: 'ltr' }}>{money(currentShift.openingFloat)}</td>
                <td style={{ direction: 'ltr', color: '#15803d', fontWeight: 900 }}>
                  {money(currentShift.cashSales)}
                </td>
                <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(currentShift.expectedCash)}</td>
                <td>
                  <span className={`ws-badge ${currentShift.status === 'open' ? 'success' : 'warning'}`}>
                    {currentShift.status === 'open' ? 'کراوە' : 'داخراو'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
};
