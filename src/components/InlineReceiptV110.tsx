import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Receipt } from '../types';
import { money } from '../utils/retailHelpers';
import { ReceiptPaper } from './ReceiptPaper';

type Props = {
  receipt: Receipt;
  onReprint: () => void;
  onDismiss: () => void;
};

/**
 * A cashier-side confirmation and printable DEMO receipt.
 * The print sheet is portalled beside #root, so printing doesn't navigate,
 * launch a POS modal, or accidentally print the application dashboard.
 * This is NOT the isolated PostgreSQL / ESC-POS hardware print queue.
 */
export const InlineReceiptV110: React.FC<Props> = ({ receipt, onReprint, onDismiss }) => {
  const [paperWidth, setPaperWidth] = useState<'58' | '80'>('80');
  const paperStyle = { '--zhirox-receipt-width': paperWidth + 'mm' } as React.CSSProperties;

  return (
    <>
      <section
        className="zhirox-inline-receipt-confirmation"
        data-inline-checkout-confirmation="true"
        aria-label="پسووڵەی دوایین فرۆشتن"
        style={{ border: '1px solid #a8c5ad', background: '#f5fbf6',
          borderRadius: 8, padding: '8px 10px', display: 'grid', gap: 6 }}
      >
        <strong style={{ color: '#14532d', fontSize: 12 }}>تۆمارکرا: {receipt.receiptNumber}</strong>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 850, fontSize: 11 }}>{money(receipt.total)}</span>
          <label style={{ fontSize: 11, fontWeight: 750 }}>
            پانی کاغەز
            <select
              value={paperWidth}
              onChange={e => setPaperWidth(e.target.value as '58' | '80')}
              aria-label="پانی کاغەزی چاپ"
              style={{ marginInlineStart: 5, height: 27, background: '#fff' }}
            >
              <option value="80">80mm</option>
              <option value="58">58mm</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="secondary" onClick={onReprint}
            style={{ flex: 1, fontSize: 11, height: 30 }}>دووبارە چاپ</button>
          <button type="button" className="secondary" onClick={onDismiss}
            style={{ fontSize: 11, height: 30 }}>داخستن</button>
        </div>
      </section>
      {createPortal(
        <>
          <style>{`
            @media screen { #zhirox-inline-print-ticket { display: none !important; } }
            @media print {
              @page { margin: 0; }
              html, body { margin: 0 !important; padding: 0 !important; }
              body:not(:has(.canva-receipt-print)) > *:not(#zhirox-inline-print-ticket):not(style) { display: none !important; }
              body:has(.canva-receipt-print) > #zhirox-inline-print-ticket { display: none !important; }
              #zhirox-inline-print-ticket {
                display: block !important; width: var(--zhirox-receipt-width);
                max-width: var(--zhirox-receipt-width); margin: 0 !important;
                padding: 2mm !important; box-sizing: border-box !important;
                color: #000 !important; background: #fff !important;
                font-family: Tahoma, Arial, sans-serif !important;
                font-size: 9px !important; direction: rtl !important;
                break-inside: avoid; page-break-inside: avoid;
              }
              #zhirox-inline-print-ticket table { width: 100%; table-layout: fixed; border-collapse: collapse; }
              #zhirox-inline-print-ticket th, #zhirox-inline-print-ticket td {
                border: 1px solid #000; padding: 2px 1px; overflow-wrap: anywhere;
              }
            }
          `}</style>
          <ReceiptPaper id="zhirox-inline-print-ticket" receipt={receipt} style={paperStyle} />
        </>,
        document.body
      )}
    </>
  );
};
