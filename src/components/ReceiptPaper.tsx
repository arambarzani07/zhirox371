import type { CSSProperties } from 'react';
import type { Receipt } from '../types';
import { formatDateTime, money } from '../utils/retailHelpers';

export function ReceiptPaper({ id, receipt, style }: { id: string; receipt: Receipt; style?: CSSProperties }) {
  return (
    <article id={id} className="canva-thermal-paper" data-demo-receipt="true"
      style={style} dir="rtl" aria-label="پسووڵەی تاقیکردنەوە">
      <h2 style={{ textAlign: 'center', fontSize: 13, margin: '0 0 4px' }}>
        سوپەرمارکێتی کانی چنار
      </h2>
      <div data-demo-watermark="true" style={{ border: '2px solid #000', textAlign: 'center', padding: 4,
        fontWeight: 900, marginBottom: 6 }}>
        تاقیکردنەوە — بەڵگەی فرۆشتنی ڕاستەقینە نییە
      </div>
      <div>ژمارەی پسووڵە: <b dir="ltr">{receipt.receiptNumber}</b></div>
      <div>بەروار: <span dir="ltr">{formatDateTime(receipt.createdAt)}</span></div>
      <div>کاشێر: {receipt.cashierName}</div>
      <div>کڕیار: {receipt.customerName}</div>
      <table style={{ marginTop: 7, fontSize: 9, textAlign: 'center' }}>
        <thead>
          <tr>
            <th>ژمارە</th><th>ناوی کاڵا</th><th>یەکە</th>
            <th>نرخ</th><th>بڕ</th><th>کۆ</th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td style={{ textAlign: 'right' }}>{item.name}</td>
              <td>{item.isScale ? 'کیلۆ' : item.mode === 'carton' ? 'کارتۆن' : 'دانە'}</td>
              <td dir="ltr">{item.price.toLocaleString('en-US')}</td>
              <td dir="ltr">{item.isScale ? item.qty.toFixed(3) : item.qty}</td>
              <td dir="ltr">{item.total.toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
        <span>کۆی گشتی</span><strong dir="ltr">{money(receipt.total)}</strong>
      </div>
      {receipt.discount > 0 && <div>داشکاندن: {money(receipt.discount)}</div>}
      <div>جۆری پارەدان: {receipt.paymentMethod === 'cash' ? 'نەختینە' : 'قەرز'}</div>
      {receipt.paymentMethod === 'cash' && (
        <>
          <div>پارەی وەرگیراو: {money(receipt.paidAmount)}</div>
          <div>پارەی گەڕاوە: {money(receipt.changeAmount)}</div>
        </>
      )}
      <div style={{ textAlign: 'center', marginTop: 8 }}>کوردستان</div>
    </article>
  );
}
