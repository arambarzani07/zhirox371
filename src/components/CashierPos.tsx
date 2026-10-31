import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';
import { PaymentMethod, Product } from '../types';
import { LocalPostgresPilotV24 } from './LocalPostgresPilotV24';
import { pilotEnabled } from '../localPilotV24';

export const CashierPos: React.FC = () => {
  const {
    products,
    cart,
    addToCart,
    updateCartQty,
    removeFromCart,
    clearCart,
    parkedCart,
    parkCart,
    restoreParkedCart,
    customers,
    completeCheckout,
    receipts,
    setActiveReceiptForModal,
    subtab
  } = useApp();

  const [barcodeInput, setBarcodeInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [tenderedCash, setTenderedCash] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'checkout' | 'receipts'>(subtab === 'receipts' ? 'receipts' : 'checkout');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Focus input automatically on mount
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, [activeTab]);

  // Subtotal & Grand total calculations
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const grandTotal = Math.max(0, subtotal - discountAmount);

  // If tendered cash is less than grand total when grand total increases, keep track
  useEffect(() => {
    if (tenderedCash === 0 || tenderedCash < grandTotal) {
      setTenderedCash(grandTotal);
    }
  }, [grandTotal]);

  const changeDue = Math.max(0, tenderedCash - grandTotal);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    const res = addToCart(code);
    if (res.success) {
      setFeedbackMsg({ text: 'کاڵا بە سەرکەوتوویی زیادکرا', error: false });
      setBarcodeInput('');
    } else {
      setFeedbackMsg({ text: res.message || 'بارکۆدەکە نەدۆزرایەوە', error: true });
    }
    barcodeInputRef.current?.focus();
  };

  const handleQuickAdd = (p: Product) => {
    const res = addToCart(p);
    if (!res.success) {
      setFeedbackMsg({ text: res.message || 'هەڵە لە زیادکردندا', error: true });
    } else {
      setFeedbackMsg({ text: `${p.name} زیادکرا`, error: false });
    }
    barcodeInputRef.current?.focus();
  };

  const handleFinishSale = () => {
    if (cart.length === 0) {
      setFeedbackMsg({ text: 'سەبەتە بەتاڵە! تکایە کاڵا زیادبکە.', error: true });
      return;
    }

    if (paymentMethod === 'debt' && !selectedCustomerId) {
      setFeedbackMsg({ text: 'تکایە کڕیارێک دیاریبکە بۆ فرۆشتنی قەرز!', error: true });
      return;
    }

    const selectedCust = customers.find(c => c.id === selectedCustomerId);

    const res = completeCheckout({
      paymentMethod,
      customerId: selectedCustomerId || null,
      customerName: selectedCust ? selectedCust.name : (paymentMethod === 'debt' ? 'کڕیاری قەرز' : 'کڕیاری نەختینە'),
      paidAmount: paymentMethod === 'cash' ? tenderedCash : 0,
      discountPercent,
      discountAmount
    });

    if (res.success) {
      setFeedbackMsg({ text: 'مامەڵەکە تەواوبوو، پسووڵە دەرچوو!', error: false });
      setDiscountPercent(0);
      setTenderedCash(0);
    } else {
      setFeedbackMsg({ text: res.error || 'هەڵە لە تەواوکردنی مامەڵەدا!', error: true });
    }
  };

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleFinishSale();
      } else if (e.key === 'F7') {
        e.preventDefault();
        parkCart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, paymentMethod, selectedCustomerId, tenderedCash, discountPercent]);

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <div role="status" aria-label="دۆخی تاقیکردنەوەی کاشێر" style={{padding:'9px 14px',marginBottom:'12px',border:'1px solid #a85d16',borderRadius:'8px',background:'#fff7ed',color:'#7c2d12',fontSize:'13px',fontWeight:850,textAlign:'center'}}>
        تاقیکردنەوە — داتای ئەم کاشێرە لە وێبگەڕ پاشەکەوت دەکرێت؛ فرۆشتنی ڕاستەقینە نییە
      </div>
      {pilotEnabled && <LocalPostgresPilotV24 />}
      {/* Top POS Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: '#0f172a' }}>
            کاشێر و فرۆشتنی خێرا
          </h1>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className={`stock-subtab ${activeTab === 'checkout' ? 'active' : ''}`}
              onClick={() => setActiveTab('checkout')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 900,
                cursor: 'pointer',
                background: activeTab === 'checkout' ? '#1e3a8a' : '#f8fafc',
                color: activeTab === 'checkout' ? '#ffffff' : '#1e293b'
              }}
            >
              فرۆشتنی نوێ
            </button>
            <button
              type="button"
              className={`stock-subtab ${activeTab === 'receipts' ? 'active' : ''}`}
              onClick={() => setActiveTab('receipts')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 900,
                cursor: 'pointer',
                background: activeTab === 'receipts' ? '#1e3a8a' : '#f8fafc',
                color: activeTab === 'receipts' ? '#ffffff' : '#1e293b'
              }}
            >
              پسووڵەکانی ئەمڕۆ ({receipts.length})
            </button>
          </div>
        </div>

        {/* Parked Cart Notification */}
        {parkedCart && (
          <div
            style={{
              background: '#fef3c7',
              border: '1.5px solid #f59e0b',
              borderRadius: '10px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              fontWeight: 800,
              color: '#92400e'
            }}
          >
            <span>سەبەتەیەکی پارێزراو هەیە ({parkedCart.length} کاڵا)</span>
            <button
              type="button"
              onClick={restoreParkedCart}
              style={{
                background: '#d97706',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              گەڕاندنەوەی سەبەتە
            </button>
          </div>
        )}
      </div>

      {activeTab === 'receipts' ? (
        /* Receipts Management Screen */
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 16px', color: '#172b45' }}>
            مێژووی پسووڵە فرۆشراوەکان
          </h2>
          {receipts.length === 0 ? (
            <div className="blank">هیچ پسووڵەیەک لەم شێفتەدا هێشتا دەرنەکراوە</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ژمارەی پسووڵە</th>
                  <th>کاتی فرۆشتن</th>
                  <th>کڕیار</th>
                  <th>شێواز</th>
                  <th>ژ. کاڵا</th>
                  <th>کۆی گشتی</th>
                  <th>کردارەکان</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(rcp => (
                  <tr key={rcp.id}>
                    <td>
                      <strong style={{ direction: 'ltr', display: 'inline-block' }}>{rcp.receiptNumber}</strong>
                    </td>
                    <td style={{ direction: 'ltr' }}>{new Date(rcp.createdAt).toLocaleTimeString()}</td>
                    <td>{rcp.customerName}</td>
                    <td>
                      <span
                        className={`stock-badge ${rcp.paymentMethod === 'cash' ? 'ok' : 'warn'}`}
                      >
                        {rcp.paymentMethod === 'cash' ? 'نەختینە' : 'قەرز'}
                      </span>
                    </td>
                    <td>{rcp.items.length}</td>
                    <td>
                      <strong style={{ direction: 'ltr', display: 'inline-block', color: '#1e3a8a' }}>
                        {money(rcp.total)}
                      </strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="catalog-table-btn"
                        onClick={() => setActiveReceiptForModal(rcp)}
                        style={{ cursor: 'pointer' }}
                      >
                        🖨️ دووبارە چاپکردن
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* POS Cashier Main 2-Column Interface */
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(340px, 1fr)', gap: '18px' }}>
          {/* Left Side: Barcode Scanner & Basket Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Barcode Scan Box */}
            <div
              style={{
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
            >
              <form onSubmit={handleScanSubmit} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    placeholder="بارکۆد بسکێنە یان کۆدی کاڵا لێبدە..."
                    autoComplete="off"
                    style={{
                      width: '100%',
                      height: '46px',
                      borderRadius: '11px',
                      border: '2px solid #2563eb',
                      padding: '0 16px',
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#0f172a',
                      background: '#f8fafc'
                    }}
                  />
                </div>
                <button
                  type="submit"
                  className="primary"
                  style={{ minWidth: '110px', height: '46px', fontSize: '14px' }}
                >
                  ⚡ زیادکردن
                </button>
              </form>

              {/* Feedback messages */}
              {feedbackMsg && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    color: feedbackMsg.error ? '#dc2626' : '#16a34a'
                  }}
                >
                  {feedbackMsg.text}
                </div>
              )}
            </div>

            {/* Quick Fast-Pick Products Bar */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '12px 16px'
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>
                کاڵا خێراکان (کلیک بکە بۆ زیادکردنی دەستبەجێ):
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  overflowX: 'auto',
                  paddingBottom: '4px'
                }}
              >
                {products.slice(0, 7).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleQuickAdd(p)}
                    style={{
                      padding: '8px 12px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '9px',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#0f172a',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                  >
                    <span>{p.name.length > 20 ? p.name.slice(0, 19) + '…' : p.name}</span>
                    <strong style={{ direction: 'ltr', color: '#1e3a8a', fontSize: '11px' }}>
                      {money(p.unit_sale_price_iqd)}
                    </strong>
                  </button>
                ))}
              </div>
            </div>

            {/* Cart Basket Items Table */}
            <div
              id="cart-list"
              style={{
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '16px',
                padding: '16px',
                minHeight: '340px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px'
                }}
              >
                <strong style={{ fontSize: '15px', color: '#0f172a', fontWeight: 900 }}>
                  سەبەتەی کاڵاکان ({cart.length} جۆر کاڵا)
                </strong>
                {cart.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={parkCart}
                      style={{
                        padding: '4px 10px',
                        background: '#fef3c7',
                        border: '1px solid #f59e0b',
                        borderRadius: '6px',
                        color: '#92400e',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      پاراستنی سەبەتە (F7)
                    </button>
                    <button
                      type="button"
                      onClick={clearCart}
                      style={{
                        padding: '4px 10px',
                        background: '#fee2e2',
                        border: '1px solid #fca5a5',
                        borderRadius: '6px',
                        color: '#991b1b',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      پاککردنەوە
                    </button>
                  </div>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="blank" style={{ marginTop: '24px' }}>
                  سەبەتە بەتاڵە — بارکۆد بسکێنە یان لە کاڵا خێراکان هەڵبژێرە
                </div>
              ) : (
                <table className="cash-basket-grid" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '32px' }}>#</th>
                      <th>کاڵا</th>
                      <th style={{ width: '75px' }}>شێواز</th>
                      <th style={{ width: '90px' }}>نرخ</th>
                      <th style={{ width: '130px' }}>بڕ</th>
                      <th style={{ width: '105px' }}>کۆ (IQD)</th>
                      <th style={{ width: '45px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((line, idx) => (
                      <tr key={line.id}>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 900, color: '#0f172a' }}>{line.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', direction: 'ltr', textAlign: 'right' }}>
                            {line.barcode}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="stock-badge"
                            style={{ fontSize: '10px', padding: '2px 6px' }}
                          >
                            {line.isScale ? 'کێش/kg' : line.mode === 'carton' ? 'کارتۆن' : 'دانە'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', direction: 'ltr', fontWeight: 800 }}>
                          {line.price.toLocaleString()}
                        </td>
                        <td>
                          <div className="basket-quantity-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              disabled={line.isScale}
                              onClick={() => updateCartQty(idx, line.qty - 1)}
                              style={{
                                width: '32px',
                                height: '32px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                background: '#f8fafc',
                                fontWeight: 900,
                                cursor: line.isScale ? 'not-allowed' : 'pointer'
                              }}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              disabled={line.isScale}
                              value={line.qty}
                              min="1"
                              max="1000"
                              onChange={e => updateCartQty(idx, parseInt(e.target.value) || 1)}
                              style={{
                                width: '48px',
                                height: '32px',
                                textAlign: 'center',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontWeight: 900,
                                fontSize: '13px'
                              }}
                            />
                            <button
                              type="button"
                              disabled={line.isScale}
                              onClick={() => updateCartQty(idx, line.qty + 1)}
                              style={{
                                width: '32px',
                                height: '32px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                background: '#f8fafc',
                                fontWeight: 900,
                                cursor: line.isScale ? 'not-allowed' : 'pointer'
                              }}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', direction: 'ltr', fontWeight: 900, color: '#1e3a8a' }}>
                          {(line.price * line.qty).toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeFromCart(idx)}
                            style={{
                              border: 'none',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              borderRadius: '6px',
                              width: '28px',
                              height: '28px',
                              cursor: 'pointer',
                              fontWeight: 900
                            }}
                            title="سڕینەوە"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right Side: Totals, Discounts, Tender & Checkout Actions */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              borderRadius: '16px',
              padding: '20px'
            }}
          >
            {/* Grand Totals Display */}
            <div className="totals" style={{ margin: 0 }}>
              <div>
                <div style={{ fontSize: '13px', color: '#1e40af' }}>کۆی گشتی فرۆشتن:</div>
                <strong style={{ fontSize: '30px' }}>{money(grandTotal)}</strong>
              </div>
              {discountAmount > 0 && (
                <div style={{ fontSize: '12px', color: '#b91c1c', textAlign: 'left' }}>
                  داشکاندن: -{money(discountAmount)}
                </div>
              )}
            </div>

            {/* Quick Discount Buttons */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                داشکاندنی خێرا:
              </div>
              <div className="quick-discount-row">
                {[0, 5, 10, 15].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    className="quick-discount-btn"
                    onClick={() => setDiscountPercent(pct)}
                    style={{
                      background: discountPercent === pct ? '#2563eb' : '#f8fafc',
                      color: discountPercent === pct ? '#ffffff' : '#334155',
                      fontWeight: 900
                    }}
                  >
                    {pct === 0 ? 'بێ داشکاندن' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                شێوازی پارەدان:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  style={{
                    height: '42px',
                    borderRadius: '10px',
                    border: paymentMethod === 'cash' ? '2px solid #16a34a' : '1.5px solid #cbd5e1',
                    background: paymentMethod === 'cash' ? '#dcfce7' : '#f8fafc',
                    color: paymentMethod === 'cash' ? '#15803d' : '#334155',
                    fontSize: '13.5px',
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  💵 نەختینە (Cash)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('debt')}
                  style={{
                    height: '42px',
                    borderRadius: '10px',
                    border: paymentMethod === 'debt' ? '2px solid #9333ea' : '1.5px solid #cbd5e1',
                    background: paymentMethod === 'debt' ? '#f3e8ff' : '#f8fafc',
                    color: paymentMethod === 'debt' ? '#7e22ce' : '#334155',
                    fontSize: '13.5px',
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  📒 قەرز (Debt)
                </button>
              </div>
            </div>

            {/* If Debt: Customer Dropdown */}
            {paymentMethod === 'debt' ? (
              <div style={{ background: '#faf5ff', border: '1.5px solid #d8b4fe', borderRadius: '12px', padding: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#6b21a8', display: 'block', marginBottom: '6px' }}>
                  دیاریکردنی کڕیار:
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={e => setSelectedCustomerId(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '8px',
                    border: '1px solid #c084fc',
                    padding: '0 10px',
                    fontSize: '13px',
                    fontWeight: 800
                  }}
                >
                  <option value="">-- کڕیارێک هەڵبژێرە --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (قەرزی ئێستا: {money(c.balanceDebt)})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              /* If Cash: Quick Cash Keypad & Tender Input */
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                  پارەی دراو (IQD):
                </div>
                <div className="quick-cash-row">
                  {[250, 500, 1000, 5000, 10000, 25000, 50000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      className="quick-cash-btn"
                      onClick={() => setTenderedCash(prev => prev + amt)}
                    >
                      +{amt >= 1000 ? `${amt / 1000}k` : amt}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                  <input
                    type="number"
                    value={tenderedCash || ''}
                    onChange={e => setTenderedCash(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="بڕی پارەی دراو..."
                    style={{
                      flex: 1,
                      height: '42px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      padding: '0 12px',
                      fontSize: '15px',
                      fontWeight: 900,
                      direction: 'ltr',
                      color: '#0f172a'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setTenderedCash(grandTotal)}
                    style={{
                      height: '42px',
                      padding: '0 12px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    تەواو (ڕێک)
                  </button>
                </div>

                {/* Change Due Display */}
                <div className="due" style={{ marginTop: '10px' }}>
                  <span>بڕی پارەی گەڕاوە:</span>
                  <strong style={{ color: changeDue > 0 ? '#16a34a' : '#0f172a' }}>
                    {money(changeDue)}
                  </strong>
                </div>
              </div>
            )}

            {/* Big Finish Button */}
            <div className="footer-actions" style={{ marginTop: 'auto' }}>
              <button
                id="finish-sale"
                type="button"
                onClick={handleFinishSale}
                disabled={cart.length === 0}
              >
                <span>🖨️ تەواوکردنی فرۆشتن و چاپ (F4)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
