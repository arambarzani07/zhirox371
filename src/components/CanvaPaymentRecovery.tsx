import type { ReactNode } from 'react';
import { money } from '../utils/retailHelpers';

export function CanvaPaymentRecovery({ total, receiptNumber, confirmedAmount, status, message, header, children }: {
  total: number;
  receiptNumber?: number;
  confirmedAmount?: number;
  status: string;
  message: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="015">
      {header ?? <h2>چارەسەری هەڵەی پارەدان</h2>}
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h3 style={{ margin: 0 }}>دۆخی پارەدان</h3>
          <p role="status">{message}</p>
          <dl className="canva-detail__summary">
            <div><dt>ژمارەی پسووڵە</dt><dd><bdi>{receiptNumber ?? '—'}</bdi></dd></div>
            <div><dt>کۆی پارەدان</dt><dd><bdi>{money(total)}</bdi></dd></div>
            <div><dt>پارەی پشتڕاستکراوە</dt><dd><bdi>{confirmedAmount === undefined ? '—' : money(confirmedAmount)}</bdi></dd></div>
            <div><dt>دۆخی فرۆشتن</dt><dd>{status}</dd></div>
          </dl>
        </section>
        <aside className="canva-detail__panel">
          <h3 style={{ margin: 0 }}>ڕێگای چارەسەر</h3>
          {children}
        </aside>
      </div>
    </section>
  );
}
