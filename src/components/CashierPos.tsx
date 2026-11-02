import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { money, formatDateTime } from '../utils/retailHelpers';
import { PaymentMethod, Product } from '../types';
import { LocalPostgresPilotV24 } from './LocalPostgresPilotV24';
import { pilotEnabled } from '../localPilotV24';
import { KurdishVoiceAnnouncer } from '../utils/kurdishVoiceEngine';

function playPosAudio(type: 'beep' | 'error' | 'chime') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'beep') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1250, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } else if (type === 'chime') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
    }
  } catch (_e) {}
}

function toggleFullscreen() {
  try {
    const doc = document as any;
    const docEl = document.documentElement as any;

    if (!docEl) return;

    const fullscreenElement =
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement;

    if (!fullscreenElement) {
      const requestFS =
        docEl.requestFullscreen ||
        docEl.webkitRequestFullscreen ||
        docEl.webkitEnterFullscreen ||
        docEl.mozRequestFullScreen ||
        docEl.msRequestFullscreen;

      if (typeof requestFS === 'function') {
        const res = requestFS.call(docEl);
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    } else {
      const exitFS =
        doc.exitFullscreen ||
        doc.webkitExitFullscreen ||
        doc.mozCancelFullScreen ||
        doc.msExitFullscreen;

      if (typeof exitFS === 'function') {
        const res = exitFS.call(doc);
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      }
    }
  } catch (_e) {}
}

export const CashierPos: React.FC = () => {
  const {
    products,
    cart,
    addToCart,
    updateCartQty,
    toggleCartLineMode,
    removeFromCart,
    clearCart,
    parkedCart,
    parkedCarts,
    parkCart,
    restoreParkedCart,
    removeParkedCart,
    customers,
    addCustomer,
    recordDebtRepayment,
    currentShift,
    openNewShift,
    completeCheckout,
    receipts,
    setActiveReceiptForModal,
    navigateTo,
    subtab,
    activeSectionId
  } = useApp();

  const resolveMode = (): 'checkout' | 'receipts' | 'payments' => {
    if (activeSectionId === 'receipt' || subtab === 'receipts') return 'receipts';
    if (activeSectionId === 'payment-notes' || subtab === 'payments') return 'payments';
    return 'checkout';
  };

  const [activeTab, setActiveTab] = useState<'checkout' | 'receipts' | 'payments'>(resolveMode);

  useEffect(() => {
    setActiveTab(resolveMode());
  }, [subtab, activeSectionId]);

  const [barcodeInput, setBarcodeInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [directDiscountIqd, setDirectDiscountIqd] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [showNewCustomerInline, setShowNewCustomerInline] = useState<boolean>(false);
  const [newCustomerName, setNewCustomerName] = useState<string>('');
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>('');
  const [newCustomerLimit, setNewCustomerLimit] = useState<string>('250000');
  const [showParkedList, setShowParkedList] = useState<boolean>(false);
  const [tenderedCash, setTenderedCash] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showQuickProducts, setShowQuickProducts] = useState(false);

  // Receipts & Payments search/filter state
  const [receiptSearch, setReceiptSearch] = useState('');
  const [receiptMethodFilter, setReceiptMethodFilter] = useState<'all' | 'cash' | 'debt'>('all');

  // Quick debt collection in Payments tab
  const [repayCustomerId, setRepayCustomerId] = useState<string>(
    customers.find(c => c.balanceDebt > 0)?.id || customers[0]?.id || ''
  );
  const [repayAmount, setRepayAmount] = useState<string>('15000');
  const [repayMsg, setRepayMsg] = useState<{ text: string; error: boolean } | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === 'checkout') {
      barcodeInputRef.current?.focus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (cart.length === 0) {
      setDiscountPercent(0);
      setDirectDiscountIqd(0);
    }
  }, [cart.length]);

  // Subtotal & Grand total calculations (percentage + direct IQD discount)
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountFromPercent = Math.round((subtotal * discountPercent) / 100);
  const discountAmount = Math.min(subtotal, discountFromPercent + Math.max(0, directDiscountIqd));
  const grandTotal = Math.max(0, subtotal - discountAmount);
  const remainderAfterPercent = Math.max(0, subtotal - discountFromPercent);
  const roundDownChangeIqd = remainderAfterPercent > 1000 ? remainderAfterPercent % 1000 : 0;

  useEffect(() => {
    setTenderedCash(grandTotal);
  }, [grandTotal]);

  const changeDue = Math.max(0, tenderedCash - grandTotal);
  const cashShortfall = paymentMethod === 'cash' && tenderedCash < grandTotal ? grandTotal - tenderedCash : 0;

  const [highlightedSearchIdx, setHighlightedSearchIdx] = useState<number>(0);

  // Parse optional N* multiplier from barcodeInput (e.g. "12*2000000000018" or "5*برنج")
  const parseScanMultiplier = (raw: string): { qty: number; cleanQuery: string; hasMultiplier: boolean } => {
    const trimmed = raw.trim();
    const m = trimmed.match(/^(\d{1,3})\*(.*)$/);
    if (m) {
      const q = Math.max(1, parseInt(m[1], 10) || 1);
      return { qty: q, cleanQuery: m[2].trim(), hasMultiplier: true };
    }
    return { qty: 1, cleanQuery: trimmed, hasMultiplier: false };
  };

  const parsedScan = parseScanMultiplier(barcodeInput);
  const liveSearchQuery = parsedScan.cleanQuery.toLowerCase();
  const liveSearchResults = liveSearchQuery
    ? products.filter(p => {
        return (
          p.name.toLowerCase().includes(liveSearchQuery) ||
          (p.category || '').toLowerCase().includes(liveSearchQuery) ||
          p.unit_barcode.toLowerCase().includes(liveSearchQuery) ||
          (p.carton?.barcode || '').toLowerCase().includes(liveSearchQuery) ||
          (p.sku || '').toLowerCase().includes(liveSearchQuery) ||
          (p.plu || '').toLowerCase().includes(liveSearchQuery)
        );
      })
    : [];

  const isExactBarcodeOrScaleMatch = (code: string): boolean => {
    const trimmed = code.trim();
    if (!trimmed) return false;
    // Scale barcode 13 digits starting with 27 or 28
    if (/^(27|28)[0-9]{11}$/.test(trimmed)) {
      return true;
    }
    return products.some(
      p =>
        p.unit_barcode === trimmed ||
        p.carton?.barcode === trimmed ||
        p.unit_alias_barcodes?.includes(trimmed) ||
        p.carton?.alias_barcodes?.includes(trimmed)
    );
  };

  const handleBarcodeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const { qty, cleanQuery } = parseScanMultiplier(rawVal);

    if (cleanQuery && isExactBarcodeOrScaleMatch(cleanQuery)) {
      const res = addToCart(cleanQuery, undefined, qty);
      if (res.success) {
        if (soundEnabled) playPosAudio('beep');
        setFeedbackMsg({
          text: qty > 1 ? `${qty} یەکە بە سەرکەوتوویی زیادکرا بۆ سەبەتە` : 'کاڵا بە سەرکەوتوویی زیادکرا بۆ سەبەتە',
          error: false
        });
      } else {
        if (soundEnabled) playPosAudio('error');
        KurdishVoiceAnnouncer.announceBarcodeNotFound();
        setFeedbackMsg({ text: res.message || 'بارکۆد نەدۆزرایەوە', error: true });
      }
      setBarcodeInput('');
      setHighlightedSearchIdx(0);
      setShowQuickProducts(false);
      barcodeInputRef.current?.focus();
      return;
    }

    setBarcodeInput(rawVal);
    setHighlightedSearchIdx(0);
    if (rawVal.trim().length > 0 && showQuickProducts) {
      setShowQuickProducts(false);
    }
  };

  const handleSelectSearchProduct = (p: Product, mode: 'unit' | 'carton' = 'unit') => {
    const qtyToAdd = parsedScan.qty;
    const res = addToCart(p, mode, qtyToAdd);
    if (!res.success) {
      if (soundEnabled) playPosAudio('error');
      setFeedbackMsg({ text: res.message || 'هەڵە لە زیادکردندا', error: true });
    } else {
      if (soundEnabled) playPosAudio('beep');
      setFeedbackMsg({
        text: `${qtyToAdd > 1 ? `${qtyToAdd} × ` : ''}${p.name} (${mode === 'carton' ? 'کارتۆن' : 'دانە'}) زیادکرا بۆ سەبەتە`,
        error: false
      });
    }
    setBarcodeInput('');
    setHighlightedSearchIdx(0);
    barcodeInputRef.current?.focus();
  };

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (barcodeInput) {
        e.preventDefault();
        setBarcodeInput('');
        setHighlightedSearchIdx(0);
      }
      return;
    }
    if (liveSearchResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedSearchIdx(prev => (prev + 1) % liveSearchResults.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedSearchIdx(prev => (prev - 1 + liveSearchResults.length) % liveSearchResults.length);
      }
    }
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { qty, cleanQuery } = parseScanMultiplier(barcodeInput);
    if (!cleanQuery) return;

    if (!isExactBarcodeOrScaleMatch(cleanQuery) && liveSearchResults.length > 0) {
      const targetProd = liveSearchResults[highlightedSearchIdx] || liveSearchResults[0];
      handleSelectSearchProduct(targetProd, 'unit');
      return;
    }

    const res = addToCart(cleanQuery, undefined, qty);
    if (res.success) {
      if (soundEnabled) playPosAudio('beep');
      setFeedbackMsg({
        text: qty > 1 ? `${qty} یەکە بە سەرکەوتوویی زیادکرا بۆ سەبەتە` : 'کاڵا بە سەرکەوتوویی زیادکرا بۆ سەبەتە',
        error: false
      });
      setBarcodeInput('');
      setHighlightedSearchIdx(0);
    } else {
      if (soundEnabled) playPosAudio('error');
      KurdishVoiceAnnouncer.announceBarcodeNotFound();
      setFeedbackMsg({ text: res.message || 'بارکۆد یان ناوی کاڵا نەدۆزرایەوە', error: true });
      setBarcodeInput('');
      setHighlightedSearchIdx(0);
    }
    barcodeInputRef.current?.focus();
  };

  const handleCreateQuickCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim()) return;
    const created = addCustomer({
      name: newCustomerName.trim(),
      phone: newCustomerPhone.trim() || '07500000000',
      balanceDebt: 0,
      creditLimit: Math.max(0, parseInt(newCustomerLimit, 10) || 250000),
      note: 'تۆمارکراو ڕاستەوخۆ لە شاشەی کاشێر'
    });
    setSelectedCustomerId(created.id);
    setCustomerSearchQuery('');
    setNewCustomerName('');
    setNewCustomerPhone('');
    setShowNewCustomerInline(false);
    setFeedbackMsg({ text: `کڕیاری نوێ «${created.name}» تۆمارکرا و هەڵبژێردرا`, error: false });
  };

  const handleQuickAdd = (p: Product) => {
    const res = addToCart(p);
    if (!res.success) {
      if (soundEnabled) playPosAudio('error');
      setFeedbackMsg({ text: res.message || 'هەڵە لە زیادکردندا', error: true });
    } else {
      if (soundEnabled) playPosAudio('beep');
      setFeedbackMsg({ text: `${p.name} زیادکرا`, error: false });
    }
    barcodeInputRef.current?.focus();
  };

  const handleQtyChange = (idx: number, nextQty: number) => {
    const res = updateCartQty(idx, nextQty);
    if (!res.success && res.message) {
      setFeedbackMsg({ text: res.message, error: true });
    } else {
      setFeedbackMsg(null);
    }
  };

  const handleToggleMode = (idx: number) => {
    const res = toggleCartLineMode(idx);
    if (!res.success && res.message) {
      setFeedbackMsg({ text: res.message, error: true });
    } else {
      setFeedbackMsg({ text: 'یەکەی فرۆشتنی کاڵا گۆڕدرا (دانە ⇄ کارتۆن)', error: false });
    }
  };

  const handleFinishSale = () => {
    if (cart.length === 0) {
      if (soundEnabled) playPosAudio('error');
      setFeedbackMsg({ text: 'سەبەتە بەتاڵە! تکایە سەرەتا کاڵا زیادبکە.', error: true });
      return;
    }

    if (currentShift.status !== 'open') {
      if (soundEnabled) playPosAudio('error');
      setFeedbackMsg({ text: 'شێفتی کاشێر داخراوە! تکایە سەرەتا شێفتێکی نوێ بکەرەوە.', error: true });
      return;
    }

    if (paymentMethod === 'debt' && !selectedCustomerId) {
      if (soundEnabled) playPosAudio('error');
      setFeedbackMsg({ text: 'تکایە کڕیارێک هەڵبژێرە بۆ تۆمارکردنی فرۆشتن بە قەرز!', error: true });
      return;
    }

    if (paymentMethod === 'cash' && tenderedCash < grandTotal) {
      if (soundEnabled) playPosAudio('error');
      setFeedbackMsg({
        text: `بڕی پارەی دراو (${money(tenderedCash)}) کەمترە لە کۆی پسووڵە (${money(grandTotal)})!`,
        error: true
      });
      return;
    }

    const selectedCust = customers.find(c => c.id === selectedCustomerId);

    const res = completeCheckout({
      paymentMethod,
      customerId: selectedCustomerId || null,
      customerName: selectedCust ? selectedCust.name : paymentMethod === 'debt' ? 'کڕیاری قەرز' : 'کڕیاری نەختینە',
      paidAmount: paymentMethod === 'cash' ? tenderedCash : 0,
      discountPercent,
      discountAmount
    });

    if (res.success) {
      if (soundEnabled) playPosAudio('chime');
      KurdishVoiceAnnouncer.announceCheckout(grandTotal);
      setFeedbackMsg({ text: `فرۆشتن تەواوبوو — پسووڵەی ${res.receipt?.receiptNumber} ئامادەیە`, error: false });
      setDiscountPercent(0);
      setDirectDiscountIqd(0);
      setTenderedCash(0);
    } else {
      if (soundEnabled) playPosAudio('error');
      setFeedbackMsg({ text: res.error || 'هەڵە لە تەواوکردنی مامەڵەدا!', error: true });
    }
  };

  // Keep latest handler ref for keyboard shortcuts without stale closures
  const finishSaleRef = useRef(handleFinishSale);
  finishSaleRef.current = handleFinishSale;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'checkout') return;
      if (e.key === 'F1') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        finishSaleRef.current();
      } else if (e.key === 'F7') {
        e.preventDefault();
        if (cart.length > 0) {
          parkCart();
          setFeedbackMsg({ text: 'سەبەتەکە بە کاتی هەڵگیرا (F7)', error: false });
        } else if (parkedCart) {
          restoreParkedCart();
          setFeedbackMsg({ text: 'سەبەتەی هەڵگیراو گەڕێنرایەوە', error: false });
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        setPaymentMethod('cash');
      } else if (e.key === 'F9') {
        e.preventDefault();
        setPaymentMethod('debt');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, cart, parkedCart, parkCart, restoreParkedCart, soundEnabled]);

  const filteredReceipts = receipts.filter(rcp => {
    const matchSearch =
      receiptSearch === '' ||
      rcp.receiptNumber.toLowerCase().includes(receiptSearch.toLowerCase()) ||
      rcp.customerName.toLowerCase().includes(receiptSearch.toLowerCase()) ||
      rcp.items.some(i => i.name.toLowerCase().includes(receiptSearch.toLowerCase()));
    if (!matchSearch) return false;
    if (receiptMethodFilter !== 'all' && rcp.paymentMethod !== receiptMethodFilter) return false;
    return true;
  });

  const cashReceiptsTotal = receipts
    .filter(r => r.paymentMethod === 'cash')
    .reduce((sum, r) => sum + r.total, 0);
  const debtReceiptsTotal = receipts
    .filter(r => r.paymentMethod === 'debt')
    .reduce((sum, r) => sum + r.total, 0);
  const totalCustomerDebt = customers.reduce((sum, c) => sum + c.balanceDebt, 0);

  const handleQuickDebtRepay = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find(c => c.id === repayCustomerId);
    const amt = parseInt(repayAmount, 10);
    if (!cust) {
      setRepayMsg({ text: 'تکایە کڕیار دیاریبکە', error: true });
      return;
    }
    if (!Number.isSafeInteger(amt) || amt <= 0) {
      setRepayMsg({ text: 'بڕی پارەی وەرگیراو نادروستە', error: true });
      return;
    }
    if (amt > cust.balanceDebt) {
      setRepayMsg({
        text: `بڕی داواکراو زیاترە لە قەرزی تۆمارکراوی ${cust.name} (${money(cust.balanceDebt)})`,
        error: true
      });
      return;
    }
    recordDebtRepayment(cust.id, amt);
    setRepayMsg({
      text: `بڕی ${money(amt)} لە قەرزی ${cust.name} وەرگیرایەوە و خرایە ناو سندووق`,
      error: false
    });
  };

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="ws-stack">
      <div role="status" aria-label="دۆخی تاقیکردنەوەی کاشێر" style={{ padding: '6px 12px', border: '1px solid #a85d16', borderRadius: '7px', background: '#fff7ed', color: '#7c2d12', fontSize: '11.5px', fontWeight: 850, textAlign: 'center' }}>
        تاقیکردنەوە — داتای ئەم کاشێرە لە وێبگەڕ پاشەکەوت دەکرێت؛ فرۆشتنی ڕاستەقینە نییە
      </div>

      {pilotEnabled && <LocalPostgresPilotV24 />}

      {/* SUBSECTION 1.2: RECEIPTS (پسووڵە) */}
      {activeTab === 'receipts' && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی پسووڵە دەرچووەکان</span>
              <span className="ws-kpi-value">{receipts.length}</span>
              <span className="ws-kpi-sub">لەم شێفتەدا تۆمارکراون</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی پسووڵەکانی نەختینە (Cash)</span>
              <span className="ws-kpi-value positive">{money(cashReceiptsTotal)}</span>
              <span className="ws-kpi-sub">
                {receipts.filter(r => r.paymentMethod === 'cash').length} پسووڵەی نەختینە
              </span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی پسووڵەکانی قەرز (Debt)</span>
              <span className="ws-kpi-value">{money(debtReceiptsTotal)}</span>
              <span className="ws-kpi-sub">
                {receipts.filter(r => r.paymentMethod === 'debt').length} پسووڵەی قەرز
              </span>
            </div>
          </div>

          <div className="ws-panel">
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className={receiptMethodFilter === 'all' ? 'primary' : 'secondary'}
                  onClick={() => setReceiptMethodFilter('all')}
                >
                  هەموو پسووڵەکان ({receipts.length})
                </button>
                <button
                  type="button"
                  className={receiptMethodFilter === 'cash' ? 'primary' : 'secondary'}
                  onClick={() => setReceiptMethodFilter('cash')}
                >
                  نەختینە ({receipts.filter(r => r.paymentMethod === 'cash').length})
                </button>
                <button
                  type="button"
                  className={receiptMethodFilter === 'debt' ? 'primary' : 'secondary'}
                  onClick={() => setReceiptMethodFilter('debt')}
                >
                  قەرز ({receipts.filter(r => r.paymentMethod === 'debt').length})
                </button>
              </div>

              <input
                type="text"
                className="input-search"
                placeholder="گەڕان بە ژمارەی پسووڵە، کڕیار، یان کاڵا..."
                value={receiptSearch}
                onChange={e => setReceiptSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="section-workspace__table">
            <table>
              <thead>
                <tr>
                  <th>ژمارەی پسووڵە</th>
                  <th>بەروار و کات</th>
                  <th>کڕیار</th>
                  <th>شێوازی پارەدان</th>
                  <th>بڕگەکان</th>
                  <th>داشکاندن</th>
                  <th>کۆی گشتی</th>
                  <th>کردارەکان</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={8}>
                      هیچ پسووڵەیەک نەدۆزرایەوە
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map(rcp => (
                    <tr key={rcp.id}>
                      <td style={{ direction: 'ltr', fontWeight: 900 }}>{rcp.receiptNumber}</td>
                      <td style={{ direction: 'ltr' }}>{formatDateTime(rcp.createdAt)}</td>
                      <td>
                        <strong>{rcp.customerName}</strong>
                      </td>
                      <td
                        style={{
                          fontWeight: 900,
                          color: rcp.paymentMethod === 'cash' ? '#15803d' : '#b45309'
                        }}
                      >
                        {rcp.paymentMethod === 'cash' ? 'نەختینە (Cash)' : 'قەرز (Debt)'}
                      </td>
                      <td>
                        {rcp.items.length} جۆر ({rcp.items.reduce((s, i) => s + i.qty, 0)} یەکە)
                      </td>
                      <td style={{ direction: 'ltr' }}>
                        {rcp.discount > 0 ? `-${money(rcp.discount)}` : '—'}
                      </td>
                      <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(rcp.total)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="primary"
                            style={{ height: '32px', padding: '0 12px', fontSize: '11.5px' }}
                            onClick={() => setActiveReceiptForModal(rcp)}
                          >
                            چاپ و بینین
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            style={{ height: '32px', padding: '0 10px', fontSize: '11.5px' }}
                            onClick={() => navigateTo('pos', 'returns', 'return-arrow')}
                          >
                            گەڕاندنەوە
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* SUBSECTION 1.4: PAYMENTS (پارەدان) */}
      {activeTab === 'payments' && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی پارەی نەختینەی وەرگیراو لە شێفت</span>
              <span className="ws-kpi-value positive">{money(currentShift.cashSales)}</span>
              <span className="ws-kpi-sub">فرۆشتنی نەختینە + دانەوەی قەرزی کڕیاران</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی فرۆشتنی قەرز لە شێفت</span>
              <span className="ws-kpi-value">{money(currentShift.debtSales)}</span>
              <span className="ws-kpi-sub">تۆمارکراو لەسەر دەفتەری کڕیاران</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی قەرزی ماوە لای کڕیاران</span>
              <span className={`ws-kpi-value ${totalCustomerDebt > 0 ? 'negative' : 'positive'}`}>
                {money(totalCustomerDebt)}
              </span>
              <span className="ws-kpi-sub">
                {customers.filter(c => c.balanceDebt > 0).length} کڕیار باڵانسی قەرزیان هەیە
              </span>
            </div>
          </div>

          <div className="ws-panel">
            <h2 className="ws-panel-title">وەرگرتنەوەی خێرای قەرزی کڕیار بۆ ناو سندووقی کاشێر</h2>
            {repayMsg && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  marginBottom: '10px',
                  background: repayMsg.error ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${repayMsg.error ? '#fca5a5' : '#bbf7d0'}`,
                  color: repayMsg.error ? '#991b1b' : '#166534',
                  fontSize: '12px',
                  fontWeight: 800
                }}
              >
                {repayMsg.text}
              </div>
            )}
            <form onSubmit={handleQuickDebtRepay} className="ws-form-grid">
              <label className="form-col">
                هەڵبژاردنی کڕیار
                <select
                  value={repayCustomerId}
                  onChange={e => {
                    setRepayCustomerId(e.target.value);
                    const c = customers.find(x => x.id === e.target.value);
                    if (c && c.balanceDebt > 0) setRepayAmount(String(c.balanceDebt));
                  }}
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (قەرزی ئێستا: {money(c.balanceDebt)})
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-col">
                بڕی پارەی وەرگیراو (IQD) *
                <input
                  type="number"
                  min="250"
                  step="250"
                  value={repayAmount}
                  onChange={e => setRepayAmount(e.target.value)}
                  required
                />
              </label>

              <button type="submit" className="primary">
                تۆمارکردنی پارەدان لە سندووق
              </button>
            </form>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              تۆماری پارەدانی پسووڵەکان ({receipts.length} مامەڵە)
            </strong>
            <table>
              <thead>
                <tr>
                  <th>پسووڵە</th>
                  <th>کڕیار</th>
                  <th>جۆری پارەدان</th>
                  <th>کۆی پسووڵە</th>
                  <th>پارەی دراو</th>
                  <th>باقی گەڕاوە</th>
                  <th>بەروار و کات</th>
                  <th>کردار</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id}>
                    <td style={{ direction: 'ltr', fontWeight: 900 }}>{r.receiptNumber}</td>
                    <td>
                      <strong>{r.customerName}</strong>
                    </td>
                    <td
                      style={{
                        fontWeight: 900,
                        color: r.paymentMethod === 'cash' ? '#15803d' : '#b45309'
                      }}
                    >
                      {r.paymentMethod === 'cash' ? 'نەختینە (Cash)' : 'قەرز (Debt)'}
                    </td>
                    <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(r.total)}</td>
                    <td style={{ direction: 'ltr' }}>{money(r.paidAmount)}</td>
                    <td style={{ direction: 'ltr' }}>{money(r.changeAmount)}</td>
                    <td style={{ direction: 'ltr' }}>{formatDateTime(r.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setActiveReceiptForModal(r)}
                      >
                        بینینی پسووڵە
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* SUBSECTION 1.1: FAST POS CHECKOUT (فرۆشتنی خێرا) */}
      {activeTab === 'checkout' && (
        <>
          {currentShift.status !== 'open' && (
            <div
              className="ws-pos-banner"
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                color: '#991b1b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                fontWeight: 850,
                fontSize: '13px'
              }}
            >
              <span>شێفتی ئێستا داخراوە — بۆ تۆمارکردنی فرۆشتن سەرەتا شێفتی نوێ بکەرەوە.</span>
              <button
                type="button"
                className="primary"
                onClick={() => openNewShift(currentShift.cashierName || 'ئارام بارزانی', 250000)}
              >
                کردنەوەی شێفتی نوێ (250,000 IQD)
              </button>
            </div>
          )}


          <div
            className="ws-pos-layout"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2.05fr) minmax(275px, 0.95fr)',
              gap: '10px',
              alignItems: 'start',
              flex: '0 1 auto',
              minHeight: 0,
              overflow: 'hidden'
            }}
          >
            {/* Right/Main Column in RTL: Scanner + Quick Products + Basket Table */}
            <div className="ws-stack" style={{ gap: '8px', height: 'auto', flex: '0 1 auto', minHeight: 0, overflow: 'visible' }}>
              <div className="ws-panel" style={{ padding: '10px 12px', position: 'relative' }}>
                <form
                  onSubmit={handleScanSubmit}
                  className="ws-pos-scan-form"
                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                  <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={barcodeInput}
                      onChange={handleBarcodeInputChange}
                      onKeyDown={handleScanKeyDown}
                      placeholder="بارکۆد بسکێنە، ژمارە*بارکۆد (نمونە 5*...) یان بە ناوی کاڵا بگەڕێ (F1)..."
                      autoComplete="off"
                      style={{
                        width: '100%',
                        height: '36px',
                        borderRadius: '8px',
                        border: '1.5px solid #203e66',
                        padding: barcodeInput ? '0 12px 0 92px' : '0 12px',
                        fontSize: '13px',
                        fontWeight: 800,
                        color: '#1d3450',
                        background: '#f9fbfd'
                      }}
                    />
                    {parsedScan.hasMultiplier && (
                      <span
                        style={{
                          position: 'absolute',
                          left: barcodeInput ? '34px' : '8px',
                          background: '#203e66',
                          color: '#ffffff',
                          borderRadius: '5px',
                          padding: '2px 6px',
                          fontSize: '10.5px',
                          fontWeight: 900,
                          direction: 'ltr'
                        }}
                      >
                        ×{parsedScan.qty}
                      </span>
                    )}
                    {barcodeInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setBarcodeInput('');
                          setHighlightedSearchIdx(0);
                          barcodeInputRef.current?.focus();
                        }}
                        title="پاککردنەوەی گەڕان"
                        style={{
                          position: 'absolute',
                          left: '6px',
                          height: '24px',
                          minHeight: '24px',
                          width: '24px',
                          padding: 0,
                          borderRadius: '6px',
                          border: '1px solid #cbd6e2',
                          background: '#ffffff',
                          color: '#475569',
                          fontSize: '11px',
                          fontWeight: 900,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className={showQuickProducts ? 'primary' : 'secondary'}
                    onClick={() => setShowQuickProducts(prev => !prev)}
                    aria-expanded={showQuickProducts}
                    style={{
                      height: '36px',
                      padding: '0 12px',
                      fontSize: '12px',
                      fontWeight: 850,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>⚡ کاڵا خێراکان</span>
                    <span style={{ fontSize: '10px', opacity: 0.85 }}>{showQuickProducts ? '▲' : '▼'}</span>
                  </button>
                </form>

                {feedbackMsg && (
                  <div
                    style={{
                      marginTop: '5px',
                      fontSize: '11.5px',
                      fontWeight: 850,
                      color: feedbackMsg.error ? '#b91c1c' : '#15803d'
                    }}
                  >
                    {feedbackMsg.text}
                  </div>
                )}

                {liveSearchQuery.length > 0 && (
                  <div
                    id="pos-live-search-dropdown"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      insetInline: 0,
                      zIndex: 42,
                      background: '#ffffff',
                      border: '1.5px solid #203e66',
                      borderRadius: '11px',
                      padding: '10px 12px',
                      boxShadow: '0 14px 34px rgba(29, 52, 80, 0.18)',
                      maxHeight: '285px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingBottom: '6px',
                        borderBottom: '1px solid #e8eef5',
                        fontSize: '11.5px',
                        fontWeight: 850,
                        color: '#1d3450'
                      }}
                    >
                      <span>
                        ئەنجامی گەڕان بە ناوی کاڵا یان بارکۆد ({liveSearchResults.length})
                        {parsedScan.hasMultiplier ? ` — بڕی هەڵبژێردراو: ×${parsedScan.qty}` : ''}
                      </span>
                      <span style={{ fontSize: '10.5px', color: '#5c6c80', fontWeight: 700 }}>
                        کرتە لەسەر کاڵا یان دوگمەی Enter بۆ زیادکردن بۆ سەبەتە
                      </span>
                    </div>

                    {liveSearchResults.length === 0 ? (
                      <div
                        style={{
                          padding: '12px',
                          textAlign: 'center',
                          fontSize: '12px',
                          fontWeight: 800,
                          color: '#b91c1c',
                          background: '#fef2f2',
                          borderRadius: '8px'
                        }}
                      >
                        هیچ کاڵایەک بە ناوی یان بارکۆدی «{parsedScan.cleanQuery}» نەدۆزرایەوە
                      </div>
                    ) : (
                      <div
                        style={{
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '5px',
                          paddingLeft: '2px'
                        }}
                      >
                        {liveSearchResults.slice(0, 12).map((p, idx) => {
                          const isHighlighted = idx === highlightedSearchIdx;
                          const lowThreshold = p.min_stock || 10;
                          const isCriticalStock = p.stock <= 5;
                          const isLowStock = !isCriticalStock && p.stock <= lowThreshold;
                          return (
                            <div
                              key={p.id}
                              onClick={() => handleSelectSearchProduct(p, 'unit')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                padding: '7px 10px',
                                borderRadius: '8px',
                                border: isHighlighted ? '1.5px solid #203e66' : '1px solid #d5e0ec',
                                background: isHighlighted ? '#eef4fb' : '#f8fafc',
                                cursor: 'pointer'
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#1d3450' }}>
                                    {p.name}
                                  </span>
                                  {p.category && (
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        padding: '1px 6px',
                                        borderRadius: '5px',
                                        background: '#e2ecf7',
                                        color: '#203e66'
                                      }}
                                    >
                                      {p.category}
                                    </span>
                                  )}
                                  {isCriticalStock && (
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 900,
                                        padding: '1px 6px',
                                        borderRadius: '5px',
                                        background: '#fee2e2',
                                        color: '#b91c1c'
                                      }}
                                    >
                                      ⚠ کۆگا کەمە ({p.stock})
                                    </span>
                                  )}
                                  {isLowStock && (
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 850,
                                        padding: '1px 6px',
                                        borderRadius: '5px',
                                        background: '#fef3c7',
                                        color: '#92400e'
                                      }}
                                    >
                                      ئاگاداری کۆگا ({p.stock})
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10.5px', color: '#5c6c80', fontWeight: 700 }}>
                                  <span style={{ fontFamily: 'monospace' }}>بارکۆد: {p.unit_barcode}</span>
                                  <span>
                                    کۆگا: {p.stock} {p.base_unit === 'kg' ? 'کگم' : 'دانە'}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                {p.carton && (
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleSelectSearchProduct(p, 'carton');
                                    }}
                                    style={{
                                      height: '28px',
                                      minHeight: '28px',
                                      padding: '0 8px',
                                      fontSize: '11px',
                                      fontWeight: 850
                                    }}
                                  >
                                    + {parsedScan.qty > 1 ? `${parsedScan.qty} ` : ''}کارتۆن ({money(p.carton.sale_price_iqd)})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="primary"
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleSelectSearchProduct(p, 'unit');
                                  }}
                                  style={{
                                    height: '28px',
                                    minHeight: '28px',
                                    padding: '0 10px',
                                    fontSize: '11.5px',
                                    fontWeight: 850
                                  }}
                                >
                                  + {parsedScan.qty > 1 ? `${parsedScan.qty} دانە ` : 'زیادکردن '}({money(p.unit_sale_price_iqd)})
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {showQuickProducts && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      insetInline: 0,
                      zIndex: 35,
                      background: '#ffffff',
                      border: '1.5px solid #203e66',
                      borderRadius: '11px',
                      padding: '12px 14px',
                      boxShadow: '0 12px 32px rgba(29, 52, 80, 0.16)'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                        paddingBottom: '6px',
                        borderBottom: '1px solid #e8eef5'
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 900, color: '#1d3450' }}>
                        هەڵبژاردنی خێرای کاڵاکان (کرتە بکە بۆ زیادکردنی دەستبەجێ):
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setShowQuickProducts(false)}
                        style={{ height: '26px', minHeight: '26px', padding: '0 9px', fontSize: '11px' }}
                      >
                        ✕ داخستن
                      </button>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gap: '7px'
                      }}
                    >
                      {products.slice(0, 8).map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleQuickAdd(p)}
                          style={{
                            padding: '8px 10px',
                            background: '#f5f8fb',
                            border: '1px solid #cbd6e2',
                            borderRadius: '8px',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            color: '#1d3450',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: '2px',
                            textAlign: 'right',
                            height: 'auto',
                            minHeight: '48px'
                          }}
                        >
                          <span
                            style={{
                              width: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {p.name}
                          </span>
                          <strong style={{ direction: 'ltr', color: '#203e66', fontSize: '11px' }}>
                            {money(p.unit_sale_price_iqd)}
                          </strong>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Basket Table */}
              <div
                className="section-workspace__table"
                id="cart-list"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: '0 1 auto',
                  height: 'auto',
                  minHeight: 0,
                  overflow: 'visible',
                  maxHeight: 'none'
                }}
              >
                <div
                  className="ws-pos-basket-bar"
                  style={{
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '8px 14px',
                    borderBottom: '1px solid #e4ebf1',
                    background: '#f9fbfd'
                  }}
                >
                  <strong style={{ fontSize: '13px', color: '#1d3450', fontWeight: 900 }}>
                    سەبەتەی کڕین ({cart.length} جۆر کاڵا ·{' '}
                    {cart.reduce((s, l) => s + l.qty, 0)} یەکە)
                  </strong>
                  <div style={{ display: 'flex', gap: '6px', position: 'relative' }}>
                    {parkedCarts.length > 0 && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setShowParkedList(prev => !prev)}
                        style={{
                          height: '28px',
                          fontSize: '11.5px',
                          padding: '0 10px',
                          background: '#fff8e9',
                          borderColor: '#e7d5b4',
                          color: '#92400e',
                          fontWeight: 900
                        }}
                      >
                        سەبەتە هەڵگیراوەکان ({parkedCarts.length}) {showParkedList ? '▲' : '▼'}
                      </button>
                    )}
                    {cart.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            parkCart();
                            setFeedbackMsg({ text: 'سەبەتەکە بە کاتی هەڵگیرا (F7)', error: false });
                          }}
                          style={{ height: '28px', fontSize: '11.5px', padding: '0 10px' }}
                        >
                          هەڵگرتنی سەبەتە (F7)
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={clearCart}
                          style={{ height: '28px', fontSize: '11.5px', padding: '0 10px', color: '#b91c1c' }}
                        >
                          پاککردنەوەی سەبەتە
                        </button>
                      </>
                    )}

                    {showParkedList && parkedCarts.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 6px)',
                          left: 0,
                          zIndex: 38,
                          minWidth: '290px',
                          background: '#ffffff',
                          border: '1.5px solid #203e66',
                          borderRadius: '10px',
                          padding: '8px 10px',
                          boxShadow: '0 12px 28px rgba(29, 52, 80, 0.18)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', fontWeight: 900, color: '#1d3450', borderBottom: '1px solid #e8eef5', paddingBottom: '4px' }}>
                          <span>لیستی سەبەتە هەڵگیراوەکان ({parkedCarts.length})</span>
                          <button type="button" className="secondary" onClick={() => setShowParkedList(false)} style={{ height: '22px', minHeight: '22px', padding: '0 6px', fontSize: '10px' }}>✕</button>
                        </div>
                        {parkedCarts.map(pc => (
                          <div
                            key={pc.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              padding: '6px 8px',
                              background: '#f8fafc',
                              border: '1px solid #d5e0ec',
                              borderRadius: '7px',
                              fontSize: '11px'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 900, color: '#1d3450' }}>{pc.label} ({pc.items.length} جۆر)</div>
                              <div style={{ color: '#203e66', fontWeight: 800, direction: 'ltr', textAlign: 'right' }}>{money(pc.totalIqd)}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                className="primary"
                                onClick={() => {
                                  restoreParkedCart(pc.id);
                                  setShowParkedList(false);
                                  setFeedbackMsg({ text: `${pc.label} گەڕێنرایەوە ناو سەبەتە`, error: false });
                                }}
                                style={{ height: '24px', minHeight: '24px', padding: '0 8px', fontSize: '10.5px' }}
                              >
                                گەڕاندنەوە
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => removeParkedCart(pc.id)}
                                style={{ height: '24px', minHeight: '24px', width: '24px', padding: 0, color: '#b91c1c' }}
                                title="سڕینەوەی سەبەتەی هەڵگیراو"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Independent Inner Scrollable Cart Table Container */}
                <div style={{ flex: '0 1 auto', height: 'auto', maxHeight: '340px', minHeight: 0, overflowY: 'auto', overflowX: 'auto' }}>
                  <table style={{ width: '100%', margin: 0, borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f5f8fb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <tr>
                        <th style={{ width: '28px' }}>#</th>
                        <th style={{ minWidth: '120px' }}>ناوی کاڵا و بارکۆد</th>
                        <th style={{ width: '80px' }}>یەکە / کارتۆن</th>
                        <th style={{ width: '72px' }}>نرخی یەکە</th>
                        <th style={{ width: '102px' }}>بڕ</th>
                        <th style={{ width: '80px' }}>کۆ (IQD)</th>
                        <th style={{ width: '46px', textAlign: 'center' }}>سڕینەوە</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.length === 0 ? (
                        <tr>
                          <td className="section-workspace__empty" colSpan={7} style={{ padding: '22px 14px' }}>
                            سەبەتە بەتاڵە — بارکۆد بسکێنە یان لە کاڵا خێراکان هەڵبژێرە
                          </td>
                        </tr>
                      ) : (
                        cart.map((line, idx) => {
                          const prod = products.find(p => p.id === line.productId);
                          const canToggleCarton = Boolean(prod?.carton) && !line.isScale;
                          const isLowStockInCart = prod && prod.stock <= (prod.min_stock || 10);
                          return (
                            <tr key={line.id}>
                              <td>
                                <strong>{idx + 1}</strong>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 900, color: '#1d3450' }}>{line.name}</span>
                                  {isLowStockInCart && (
                                    <span
                                      style={{
                                        fontSize: '9.5px',
                                        fontWeight: 850,
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        background: prod.stock <= 5 ? '#fee2e2' : '#fef3c7',
                                        color: prod.stock <= 5 ? '#b91c1c' : '#92400e'
                                      }}
                                    >
                                      کۆگا: {prod.stock}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#536c85', direction: 'ltr', textAlign: 'right' }}>
                                  {line.barcode}
                                </div>
                              </td>
                              <td>
                                {canToggleCarton ? (
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => handleToggleMode(idx)}
                                    style={{ height: '25px', padding: '0 6px', fontSize: '10.5px' }}
                                    title="گۆڕین لە نێوان دانە و کارتۆن"
                                  >
                                    {line.mode === 'carton' ? 'کارتۆن ⇄' : 'دانە ⇄'}
                                  </button>
                                ) : (
                                  <span>{line.isScale ? 'کێش (kg)' : line.mode === 'carton' ? 'کارتۆن' : 'دانە'}</span>
                                )}
                              </td>
                              <td style={{ direction: 'ltr', fontWeight: 800 }}>
                                {line.price.toLocaleString('en-US')}
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={line.isScale}
                                    onClick={() => handleQtyChange(idx, line.qty - 1)}
                                    style={{ width: '25px', height: '26px', padding: 0 }}
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    disabled={line.isScale}
                                    value={line.qty}
                                    min="1"
                                    max="1000"
                                    onChange={e => handleQtyChange(idx, parseInt(e.target.value, 10) || 1)}
                                    style={{
                                      width: '42px',
                                      height: '26px',
                                      textAlign: 'center',
                                      borderRadius: '6px',
                                      border: '1px solid #cbd6e2',
                                      fontWeight: 900,
                                      fontSize: '11.5px'
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={line.isScale}
                                    onClick={() => handleQtyChange(idx, line.qty + 1)}
                                    style={{ width: '25px', height: '26px', padding: 0 }}
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td style={{ direction: 'ltr', fontWeight: 900 }}>
                                {(line.price * line.qty).toLocaleString('en-US')}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() => removeFromCart(idx)}
                                  style={{
                                    width: '26px',
                                    height: '26px',
                                    padding: 0,
                                    color: '#b91c1c'
                                  }}
                                  title="لابردن لە سەبەتە"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Left Column in RTL: Checkout Summary, Discount, Payment Method, Cash Tender */}
            <div className="ws-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: '8px', padding: '10px 12px', height: 'auto', alignSelf: 'start', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div
                style={{
                  background: '#f5f8fb',
                  border: '1.5px solid #cbd6e2',
                  borderRadius: '10px',
                  padding: '8px 12px'
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#536c85' }}>
                  کۆی گشتیی شایستەی پارەدان:
                </div>
                <div
                  style={{
                    fontSize: '25px',
                    fontWeight: 950,
                    color: '#1d3450',
                    direction: 'ltr',
                    textAlign: 'right',
                    marginTop: '1px'
                  }}
                >
                  {money(grandTotal)}
                </div>
                {discountAmount > 0 && (
                  <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                    کۆی پێش داشکاندن: {money(subtotal)} · داشکاندن: −{money(discountAmount)}
                  </div>
                )}
              </div>

              {/* Quick Discount Selector (% + Direct IQD + Round-down small change) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#243b55' }}>
                  داشکاندن لەسەر سەبەتە (% یان بڕی دینار):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                  {[0, 5, 10, 15].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      className={discountPercent === pct && directDiscountIqd === 0 ? 'primary' : 'secondary'}
                      onClick={() => {
                        setDiscountPercent(pct);
                        if (pct === 0) setDirectDiscountIqd(0);
                      }}
                      style={{ height: '27px', padding: 0, fontSize: '11.5px' }}
                    >
                      {pct === 0 ? '0%' : `${pct}%`}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0"
                    step="250"
                    value={directDiscountIqd || ''}
                    onChange={e => setDirectDiscountIqd(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    placeholder="داشکاندن بە دینار (IQD)..."
                    style={{
                      flex: 1,
                      height: '28px',
                      borderRadius: '6px',
                      border: '1px solid #cbd6e2',
                      padding: '0 8px',
                      fontSize: '11px',
                      fontWeight: 800,
                      direction: 'ltr',
                      color: '#1d3450'
                    }}
                  />
                  {roundDownChangeIqd > 0 && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setDirectDiscountIqd(roundDownChangeIqd)}
                      title="لێدەرکردنی وردە بۆ ڕێککردنی کۆی پسووڵە"
                      style={{ height: '28px', padding: '0 8px', fontSize: '10.5px', fontWeight: 850, whiteSpace: 'nowrap' }}
                    >
                      ڕێککردنی وردە (−{roundDownChangeIqd})
                    </button>
                  )}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#243b55', marginBottom: '3px' }}>
                  شێوازی پارەدان:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button
                    type="button"
                    className={paymentMethod === 'cash' ? 'primary' : 'secondary'}
                    onClick={() => setPaymentMethod('cash')}
                    style={{ height: '30px', fontSize: '11.5px' }}
                  >
                    نەختینە (Cash)
                  </button>
                  <button
                    type="button"
                    className={paymentMethod === 'debt' ? 'primary' : 'secondary'}
                    onClick={() => setPaymentMethod('debt')}
                    style={{ height: '30px', fontSize: '11.5px' }}
                  >
                    قەرز (Debt)
                  </button>
                </div>
              </div>

              {paymentMethod === 'debt' ? (
                <div
                  style={{
                    background: '#f9fbfd',
                    border: '1px solid #cbd6e2',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 850, color: '#1d3450' }}>
                      دیاریکردنی کڕیار بۆ قەرز *
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setShowNewCustomerInline(prev => !prev)}
                      style={{ height: '24px', minHeight: '24px', padding: '0 8px', fontSize: '10.5px', fontWeight: 850 }}
                    >
                      {showNewCustomerInline ? '✕ داخستن' : '+ کڕیاری نوێ'}
                    </button>
                  </div>

                  {showNewCustomerInline ? (
                    <form onSubmit={handleCreateQuickCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '5px', background: '#ffffff', padding: '7px', borderRadius: '7px', border: '1px solid #d5e0ec' }}>
                      <input
                        type="text"
                        value={newCustomerName}
                        onChange={e => setNewCustomerName(e.target.value)}
                        placeholder="ناوی سیانی کڕیار *"
                        required
                        style={{ height: '28px', fontSize: '11.5px', padding: '0 8px' }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                        <input
                          type="text"
                          value={newCustomerPhone}
                          onChange={e => setNewCustomerPhone(e.target.value)}
                          placeholder="مۆبایل (0750...)"
                          style={{ height: '28px', fontSize: '11px', padding: '0 8px', direction: 'ltr' }}
                        />
                        <input
                          type="number"
                          value={newCustomerLimit}
                          onChange={e => setNewCustomerLimit(e.target.value)}
                          placeholder="سنووری قەرز"
                          style={{ height: '28px', fontSize: '11px', padding: '0 8px', direction: 'ltr' }}
                        />
                      </div>
                      <button type="submit" className="primary" style={{ height: '28px', fontSize: '11px' }}>
                        تۆمارکردن و هەڵبژاردنی کڕیار
                      </button>
                    </form>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={customerSearchQuery}
                        onChange={e => {
                          const q = e.target.value;
                          setCustomerSearchQuery(q);
                          const matches = customers.filter(
                            c => c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q)
                          );
                          if (matches.length === 1) {
                            setSelectedCustomerId(matches[0].id);
                          }
                        }}
                        placeholder="گەڕان بە ناو یان ژمارە مۆبایلی کڕیار..."
                        style={{ height: '28px', fontSize: '11px', padding: '0 8px', borderRadius: '6px', border: '1px solid #cbd6e2' }}
                      />
                      <select
                        value={selectedCustomerId}
                        onChange={e => setSelectedCustomerId(e.target.value)}
                        style={{ height: '30px', fontSize: '11.5px' }}
                      >
                        <option value="">-- کڕیارێک هەڵبژێرە --</option>
                        {customers
                          .filter(
                            c =>
                              !customerSearchQuery.trim() ||
                              c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                              c.phone.includes(customerSearchQuery.trim())
                          )
                          .map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.phone}) — قەرز: {money(c.balanceDebt)}
                            </option>
                          ))}
                      </select>
                    </>
                  )}

                  {selectedCustomerObj && (
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#536c85', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div>
                        قەرزی نوێ دوای پسووڵە:{' '}
                        <strong style={{ color: '#b91c1c', direction: 'ltr', display: 'inline-block' }}>
                          {money(selectedCustomerObj.balanceDebt + grandTotal)}
                        </strong>
                        {selectedCustomerObj.creditLimit ? ` / سنوور: ${money(selectedCustomerObj.creditLimit)}` : ''}
                      </div>
                      {(selectedCustomerObj.creditLimit || 0) > 0 &&
                        selectedCustomerObj.balanceDebt + grandTotal > (selectedCustomerObj.creditLimit || 0) && (
                          <div style={{ color: '#b91c1c', fontWeight: 900 }}>
                            ⚠ ئاگاداربە: کۆی قەرز تێپەڕیوە لە سنووری ڕێگەپێدراوی کڕیار!
                          </div>
                        )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#243b55', marginBottom: '3px' }}>
                    بڕی پارەی وەرگیراو لە کڕیار (IQD):
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '5px',
                      marginBottom: '5px'
                    }}
                  >
                    {[1000, 5000, 10000, 25000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        className="secondary"
                        onClick={() => setTenderedCash(prev => prev + amt)}
                        style={{ height: '26px', padding: 0, direction: 'ltr', fontSize: '11px' }}
                      >
                        +{amt / 1000}k
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      step="250"
                      value={tenderedCash || ''}
                      onChange={e => setTenderedCash(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      placeholder="بڕی پارەی وەرگیراو..."
                      style={{
                        flex: 1,
                        height: '32px',
                        borderRadius: '7px',
                        border: `1px solid ${cashShortfall > 0 ? '#b91c1c' : '#cbd6e2'}`,
                        padding: '0 10px',
                        fontSize: '12.5px',
                        fontWeight: 900,
                        direction: 'ltr',
                        color: '#1d3450'
                      }}
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setTenderedCash(grandTotal)}
                      style={{ height: '32px', fontSize: '11px', padding: '0 10px' }}
                    >
                      بڕی ڕێک
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: '5px',
                      padding: '6px 10px',
                      borderRadius: '7px',
                      background: cashShortfall > 0 ? '#fef2f2' : '#f5f8fb',
                      border: `1px solid ${cashShortfall > 0 ? '#fca5a5' : '#dde6f0'}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      fontWeight: 850
                    }}
                  >
                    {cashShortfall > 0 ? (
                      <>
                        <span style={{ color: '#991b1b' }}>کورتهێنانی پارەی دراو:</span>
                        <strong style={{ color: '#b91c1c', direction: 'ltr' }}>
                          −{money(cashShortfall)}
                        </strong>
                      </>
                    ) : (
                      <>
                        <span style={{ color: '#536c85' }}>باقی گەڕاوە بۆ کڕیار:</span>
                        <strong style={{ color: changeDue > 0 ? '#15803d' : '#1d3450', direction: 'ltr' }}>
                          {money(changeDue)}
                        </strong>
                      </>
                    )}
                  </div>
                </div>
              )}

              <button
                id="finish-sale"
                type="button"
                className="primary"
                onClick={handleFinishSale}
                disabled={cart.length === 0 || currentShift.status !== 'open'}
                style={{
                  height: '36px',
                  width: '100%',
                  fontSize: '12.5px',
                  opacity: cart.length === 0 || currentShift.status !== 'open' ? 0.55 : 1
                }}
              >
                تەواوکردنی فرۆشتن و چاپی پسووڵە (F4)
              </button>
            </div>
          </div>

          {/* Docked Hotkey Navigation Bar */}
          <div
            className="pos-hotkeys-dock"
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              padding: '5px 12px',
              background: '#ffffff',
              border: '1px solid #dde6f0',
              borderRadius: '10px',
              marginTop: 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#536c85' }}>کلیلە خێراکانی کیبۆرد:</span>
              <span className="ws-hotkey-badge"><kbd>F1</kbd> بارکۆد</span>
              <span className="ws-hotkey-badge"><kbd>F4</kbd> تەواوکردن و چاپ</span>
              <span className="ws-hotkey-badge"><kbd>F7</kbd> هەڵگرتنی سەبەتە</span>
              <span className="ws-hotkey-badge"><kbd>F8</kbd> نەختینە</span>
              <span className="ws-hotkey-badge"><kbd>F9</kbd> قەرز</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="secondary"
                style={{ height: '28px', padding: '0 10px', fontSize: '11px', fontWeight: 800 }}
              >
                {soundEnabled ? '🔔 دەنگ: چالاکە' : '🔕 دەنگ: بێدەنگ'}
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="secondary"
                style={{ height: '28px', padding: '0 10px', fontSize: '11px', fontWeight: 800 }}
                title="شاشەی تەواو (F11)"
              >
                🖥️ شاشەی تەواو
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
