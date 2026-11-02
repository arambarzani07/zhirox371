import React, { useState } from 'react';
import { Receipt } from '../types';
import { money, formatDateTime } from '../utils/retailHelpers';

interface Props {
  receipt: Receipt;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<Props> = ({ receipt, onClose }) => {
  const [paperWidth, setPaperWidth] = useState<'58' | '80'>('80');
  const [storeName, setStoreName] = useState('سوپەرمارکێتی کانی چنار');
  const [storeAddress, setStoreAddress] = useState('سلێمانی — شەقامی کانی چنار');
  const [storePhone, setStorePhone] = useState('0750 123 4567');
  const [policyNote, setPolicyNote] = useState('کاڵای فرۆشراو لەماوەی 24 کاتژمێردا دەگۆڕدرێتەوە بە هەبوونی پسووڵە');
  const [showSettings, setShowSettings] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="thermal-receipt-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="thermal-receipt-modal-box"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header & Options */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1.5px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 900, fontSize: '15px', color: '#0f172a' }}>
              چاپی پسووڵەی فرۆشتن
            </span>
            <span
              style={{
                background: '#e0e7ff',
                color: '#3730a3',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 900
              }}
            >
              {receipt.receiptNumber}
            </span>
          </div>

          <div className="thermal-receipt-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              style={{
                background: showSettings ? '#e0e7ff' : '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 800,
                color: showSettings ? '#3730a3' : '#475569',
                cursor: 'pointer'
              }}
            >
              ⚙️ {showSettings ? 'داخستنی ڕێکخستن' : 'زانیارییەکانی پسووڵە'}
            </button>

            <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
              پانی:
              <select
                value={paperWidth}
                onChange={e => setPaperWidth(e.target.value as '58' | '80')}
                style={{
                  marginInlineStart: '6px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px',
                  fontWeight: 800
                }}
              >
                <option value="80">80mm (ستاندارد)</option>
                <option value="58">58mm (بچووک)</option>
              </select>
            </label>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
              }}
            >
              🖨️ چاپکردن
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 900,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              داخستن
            </button>
          </div>
        </div>

        {/* Collapsible Receipt Store Settings */}
        {showSettings && (
          <div
            className="thermal-receipt-controls"
            style={{
              padding: '12px 18px',
              background: '#f1f5f9',
              borderBottom: '1px solid #e2e8f0',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
              fontSize: '12px'
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 800, color: '#334155' }}>
              ناوی مارکێت:
              <input
                type="text"
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 800, color: '#334155' }}>
              ناونیشان و لقی مارکێت:
              <input
                type="text"
                value={storeAddress}
                onChange={e => setStoreAddress(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 800, color: '#334155' }}>
              ژمارەی تەلەفۆن:
              <input
                type="text"
                value={storePhone}
                onChange={e => setStorePhone(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', direction: 'ltr' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontWeight: 800, color: '#334155' }}>
              مەرجی گەڕاندنەوە لە خوارەوە:
              <input
                type="text"
                value={policyNote}
                onChange={e => setPolicyNote(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
            </label>
          </div>
        )}

        {/* Printable Receipt Paper Container */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            background: '#f1f5f9',
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          <div
            id="thermal-receipt-ticket"
            style={{
              width: paperWidth === '58' ? '58mm' : '80mm',
              maxWidth: '100%',
              background: '#ffffff',
              padding: paperWidth === '58' ? '3mm' : '5mm',
              boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
              color: '#000000',
              fontFamily: 'Tahoma, "Segoe UI", Arial, sans-serif',
              fontSize: paperWidth === '58' ? '9.5px' : '11px',
              lineHeight: 1.5,
              direction: 'rtl'
            }}
          >
            {/* Supermarket Header */}
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <h2
                style={{
                  fontSize: paperWidth === '58' ? '13px' : '16px',
                  fontWeight: 900,
                  margin: '0 0 4px'
                }}
              >
                {storeName}
              </h2>
              <div style={{ fontSize: '10px', fontWeight: 800, margin: '2px 0' }}>
                پسووڵەی تاقیکردنەوە
              </div>
              <div data-demo-watermark="true" style={{fontSize:'10px',fontWeight:900,textAlign:'center',border:'2px solid #111',padding:'3px',margin:'6px 0'}}>
                تاقیکردنەوە — بەڵگەی فرۆشتنی ڕاستەقینە نییە
              </div>
              <div style={{ fontSize: '9px', margin: '2px 0' }}>
                ناونیشان: {storeAddress}
              </div>
              <div style={{ fontSize: '9px', margin: '2px 0' }} dir="rtl">
                تەلەفۆن: <span style={{ direction: 'ltr', display: 'inline-block' }}>{storePhone}</span>
              </div>
            </div>

            <div style={{ borderBottom: '1px dashed #444', margin: '8px 0' }} />

            {/* Receipt Meta */}
            <div style={{ fontSize: '9px', display: 'grid', gap: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ژ. پسووڵە:</span>
                <strong style={{ direction: 'ltr' }}>{receipt.receiptNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>بەروار:</span>
                <span style={{ direction: 'ltr' }}>{formatDateTime(receipt.createdAt)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>کاشێر:</span>
                <strong>{receipt.cashierName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>کڕیار:</span>
                <strong>{receipt.customerName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>شێوازی پارەدان:</span>
                <strong>{receipt.paymentMethod === 'cash' ? 'نەختینە (Cash)' : 'قەرز (Debt)'}</strong>
              </div>
            </div>

            <div style={{ borderBottom: '1px dashed #444', margin: '8px 0' }} />

            {/* Items Table */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: paperWidth === '58' ? '8.5px' : '10px',
                lineHeight: 1.4,
                margin: '6px 0',
                border: '1px solid #333'
              }}
            >
              <thead>
                <tr style={{ background: '#f5f5f5', borderBottom: '1.5px solid #222' }}>
                  <th style={{ padding: '3px 2px', textAlign: 'center', border: '1px solid #333', width: '18px' }}>#</th>
                  <th style={{ padding: '3px 4px', textAlign: 'right', border: '1px solid #333' }}>کاڵا</th>
                  <th style={{ padding: '3px 2px', textAlign: 'center', border: '1px solid #333', width: '28px' }}>بڕ</th>
                  <th style={{ padding: '3px 2px', textAlign: 'left', border: '1px solid #333', direction: 'ltr' }}>نرخ</th>
                  <th style={{ padding: '3px 2px', textAlign: 'left', border: '1px solid #333', direction: 'ltr' }}>کۆ</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #333' }}>
                    <td style={{ padding: '3px 2px', textAlign: 'center', border: '1px solid #333' }}>{idx + 1}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right', border: '1px solid #333', fontWeight: 700 }}>
                      {item.name}
                      {item.mode === 'carton' && (
                        <span style={{ fontSize: '7.5px', color: '#555', display: 'block' }}>
                          (کارتۆن)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '3px 2px', textAlign: 'center', border: '1px solid #333', fontWeight: 900 }}>
                      {item.qty}
                    </td>
                    <td style={{ padding: '3px 2px', textAlign: 'left', border: '1px solid #333', direction: 'ltr' }}>
                      {item.price.toLocaleString()}
                    </td>
                    <td style={{ padding: '3px 2px', textAlign: 'left', border: '1px solid #333', direction: 'ltr', fontWeight: 900 }}>
                      {item.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Financial Summary */}
            <div style={{ fontSize: paperWidth === '58' ? '9.5px' : '11px', display: 'grid', gap: '4px', margin: '6px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>کۆی کاڵاکان:</span>
                <span style={{ direction: 'ltr' }}>{money(receipt.subtotal)}</span>
              </div>
              {receipt.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
                  <span>داشکاندن ({receipt.discountPercent}%):</span>
                  <span style={{ direction: 'ltr' }}>-{money(receipt.discount)}</span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1.5px solid #000',
                  borderBottom: '1.5px solid #000',
                  padding: '4px 0',
                  fontWeight: 900,
                  fontSize: paperWidth === '58' ? '12px' : '14px'
                }}
              >
                <span>کۆی گشتی:</span>
                <span style={{ direction: 'ltr' }}>{money(receipt.total)}</span>
              </div>

              {receipt.paymentMethod === 'cash' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
                    <span>پارەی وەرگیراو:</span>
                    <span style={{ direction: 'ltr' }}>{money(receipt.paidAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
                    <span>بڕی گەڕاوە:</span>
                    <strong style={{ direction: 'ltr' }}>{money(receipt.changeAmount)}</strong>
                  </div>
                </>
              )}
            </div>

            <div style={{ borderBottom: '1px dashed #444', margin: '8px 0' }} />

            {/* Receipt Footer */}
            <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '6px' }}>
              <div style={{ fontWeight: 800 }}>سوپاس بۆ سەردانەکەتان</div>
              <div style={{ fontSize: '8px', color: '#555', marginTop: '2px' }}>
                {policyNote}
              </div>
              {/* Simulated Thermal Barcode */}
              <div style={{ margin: '8px auto 4px', display: 'flex', justifyContent: 'center', gap: '2px', height: '26px', alignItems: 'flex-end' }}>
                {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 3, 4, 2, 1, 3, 2, 1, 2].map((w, i) => (
                  <span key={i} style={{ display: 'inline-block', width: `${w}px`, height: '100%', background: '#000' }} />
                ))}
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  letterSpacing: '2px',
                  fontWeight: 900,
                  fontSize: '11px',
                  marginTop: '4px'
                }}
              >
                * {receipt.receiptNumber} *
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
