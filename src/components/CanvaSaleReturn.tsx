import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';

export function CanvaSaleReturn() {
  const { receipts, products, subtab, navigateTo, recordSaleReturn, demoRefunds } = useApp();
  const initialReceipt = receipts.find(receipt => receipt.receiptNumber === subtab) ?? receipts[0];
  const [returnReceiptNo, setReturnReceiptNo] = useState(initialReceipt?.receiptNumber ?? '');
  const [selectedProductId, setSelectedProductId] = useState(initialReceipt?.items[0]?.productId ?? '');
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [returnQty, setReturnQty] = useState('1');
  const [returnRestock, setReturnRestock] = useState(true);
  const [returnRefundMethod, setReturnRefundMethod] = useState<'cash' | 'debt'>(initialReceipt?.paymentMethod ?? 'cash');
  const [returnReason, setReturnReason] = useState('داواکاریی کڕیار — کاڵای سالم');
  const [returnMsg, setReturnMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const receiptOptions = receipts.filter(receipt =>
    receipt.receiptNumber === returnReceiptNo || receipt.receiptNumber.toLowerCase().includes(search) ||
    receipt.items.some(item => item.barcode.includes(search))
  );
  const matchedReceipt = receipts.find(receipt => receipt.receiptNumber === returnReceiptNo);
  const line = selectedLineIndex === null
    ? matchedReceipt?.items.find(item => item.productId === selectedProductId)
    : matchedReceipt?.items[selectedLineIndex];
  const quantity = Number(returnQty);
  const amount = line && Number.isFinite(quantity) && quantity > 0 ? line.price * quantity : 0;
  const totalReturnedIqd = demoRefunds.reduce((sum, refund) => sum + refund.refundAmount, 0);

  const handleReturnSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const prod = products.find(p => p.id === selectedProductId);
    const qtyNum = Number(returnQty);
    if (!matchedReceipt || !prod || !Number.isFinite(qtyNum) || qtyNum <= 0) {
      setReturnMsg({ text: 'پسووڵە، کاڵا یان بڕی گەڕاندنەوە نادروستە', error: true });
      return;
    }
    if (!line || line.productId !== prod.id) {
      setReturnMsg({ text: 'ئەم کاڵایە لە پسووڵەی هەڵبژێردراو نییە', error: true });
      return;
    }
    const refundAmount = line.price * qtyNum;

    const res = recordSaleReturn({
      receiptNo: returnReceiptNo.trim(),
      productId: prod.id,
      qty: qtyNum,
      mode: line.mode,
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

  return (
    <section className="canva-detail canva-refund canva-standard-view" data-canva-screen="004">
      <label className="canva-detail__panel canva-refund__search">
        دۆزینەوەی پسووڵە
        <input type="search" placeholder="ژمارەی پسووڵە یان بارکۆد"
          value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>کاڵاکانی پسووڵە</h2>
          <div className="section-workspace__table">
            <table>
              <thead><tr><th>ژمارە</th><th>ناوی کاڵا</th><th>یەکە</th><th>نرخ</th><th>بڕ</th><th>کۆ</th></tr></thead>
              <tbody>
                {matchedReceipt?.items.map((item, index) => (
                  <tr key={index} data-selected={item === line}>
                    <td>{index + 1}</td>
                    <td><button type="button" className="secondary" aria-pressed={item === line} onClick={() => {
                      setSelectedProductId(item.productId);
                      setSelectedLineIndex(index);
                    }}>{item.name}</button></td>
                    <td>{item.isScale ? 'کیلۆ' : item.mode === 'carton' ? 'کارتۆن' : 'دانە'}</td>
                    <td><bdi>{money(item.price)}</bdi></td>
                    <td>{item.qty}</td><td><bdi>{money(item.total)}</bdi></td>
                  </tr>
                ))}
                {!matchedReceipt && <tr><td colSpan={6} className="section-workspace__empty">پسووڵەیەک هەڵبژێرە</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="canva-detail__panel">
          <h2>پوختەی گەڕاندنەوە</h2>
          <form onSubmit={handleReturnSubmit} className="ws-form-grid">
            <label className="form-col">
              ژمارەی پسووڵەی فرۆشتن
              <select
                value={returnReceiptNo}
                onChange={e => {
                  const nextNo = e.target.value;
                  setReturnReceiptNo(nextNo);
                  setReturnMsg(null);
                  const rcp = receipts.find(r => r.receiptNumber === nextNo);
                  setSelectedLineIndex(null);
                  setReturnRefundMethod(rcp?.paymentMethod ?? 'cash');
                  setSelectedProductId(rcp?.items[0]?.productId ?? '');
                }}
              >
                <option value="">پسووڵە هەڵبژێرە</option>
                {receiptOptions.map(r => (
                  <option key={r.id} value={r.receiptNumber}>
                    {r.receiptNumber} — {r.customerName} ({money(r.total)})
                  </option>
                ))}
              </select>
            </label>

            <label className="form-col">
              کاڵای گەڕاوە
              <select value={selectedProductId} onChange={e => {
                setSelectedProductId(e.target.value);
                setSelectedLineIndex(null);
              }}>
                <option value="">کاڵا هەڵبژێرە</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
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

            <dl className="canva-detail__summary canva-refund__full-row">
              <div><dt>کۆی گەڕاندنەوە</dt><dd><bdi>{money(amount)}</bdi></dd></div>
            </dl>
            {returnMsg && <p className="canva-refund__message canva-refund__full-row"
              role={returnMsg.error ? 'alert' : 'status'}>{returnMsg.text}</p>}
            <div className="canva-detail__actions canva-refund__full-row">
              <button type="submit" className="primary">تۆمارکردنی گەڕاندنەوە</button>
              <button type="button" className="secondary" onClick={() => navigateTo('pos')}>هەڵوەشاندنەوە</button>
            </div>
          </form>
        </aside>
      </div>
      <details className="canva-detail__history">
        <summary>
            مێژووی گەڕاندنەوەی کاڵاکان ({demoRefunds.length} مامەڵە · کۆ: {money(totalReturnedIqd)})
        </summary>
        <div className="section-workspace__table">
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
      </details>
    </section>
  );
}
