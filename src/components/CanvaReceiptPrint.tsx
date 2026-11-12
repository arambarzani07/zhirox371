import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Receipt } from '../types';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';
import { ReceiptPaper } from './ReceiptPaper';
import './canvaCashierAuxiliary.css';

export function CanvaReceiptPrint({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const [width, setWidth] = useState<'58' | '80'>('80');
  const paperStyle = { '--zhirox-receipt-width': width + 'mm' } as CSSProperties;

  return (
    <section className="canva-receipt-print canva-standard-view" data-canva-screen="010" dir="rtl">
      <CanvaWorkspaceHeader title="پێشبینین و دووبارە چاپ" onHome={onClose} />
      <div className="canva-detail__columns">
        <section className="canva-detail__panel canva-receipt-print__preview">
          <h2>پێشبینینی پسووڵە</h2>
          <ReceiptPaper id="thermal-receipt-ticket" receipt={receipt} style={paperStyle} />
        </section>
        <aside className="canva-detail__panel canva-receipt-print__controls">
          <h2>ڕێکخستنی چاپ</h2>
          <fieldset>
            <legend>قەبارەی کاغەز</legend>
            <div className="canva-receipt-print__sizes">
              {(['80', '58'] as const).map(size => (
                <label key={size}>
                  <input type="radio" name="receipt-paper-width" value={size} checked={width === size}
                    onChange={() => setWidth(size)} />
                  <bdi>{size} mm</bdi>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="canva-detail__actions">
            <button type="button" className="primary" onClick={() => window.print()}>دووبارە چاپ</button>
            <button type="button" className="secondary" onClick={onClose}>گەڕانەوە</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
