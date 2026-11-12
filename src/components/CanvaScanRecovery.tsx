import { useState } from 'react';
import type { ReactNode } from 'react';
import { CanvaWorkspaceHeader } from './CanvaWorkspace';

export function CanvaScanRecovery({ failedCode, error, onRetry, onSearch, onBack, children }: {
  failedCode: string;
  error?: string;
  onRetry: (code: string) => void;
  onSearch: () => void;
  onBack: () => void;
  children: ReactNode;
}) {
  const [code, setCode] = useState('');
  return (
    <section className="canva-detail canva-standard-view" data-canva-screen="014">
      <CanvaWorkspaceHeader title="چارەسەری هەڵەی سکانکردن" />
      {children}
      <div className="canva-detail__columns">
        <section className="canva-detail__panel">
          <h2>دۆخی بارکۆد</h2>
          <p role="alert">{error || 'کاڵایەک بۆ ئەم بارکۆدە نەدۆزرایەوە'}</p>
          <dl className="canva-detail__summary">
            <div><dt>بارکۆدی خوێندراو</dt><dd><bdi style={{ overflowWrap: 'anywhere' }}>{failedCode}</bdi></dd></div>
            {!error && <>
              <div><dt>ئەنجامی دۆزینەوە</dt><dd>0 کاڵا</dd></div>
              <div><dt>جۆری یەکە</dt><dd>نەناسراوە</dd></div>
            </>}
            <div><dt>دۆخی سەبەتە</dt><dd>بێ گۆڕان</dd></div>
          </dl>
        </section>
        <aside className="canva-detail__panel">
          <h2>دۆزینەوە و چارەسەر</h2>
          <form className="canva-detail" onSubmit={event => {
            event.preventDefault();
            if (code.trim()) onRetry(code);
          }}>
            <label className="form-col">دووبارە سکانکردن یان نووسینی بارکۆد
              <input type="text" placeholder="بارکۆد بنووسە" inputMode="numeric" autoComplete="off"
                autoFocus value={code} onChange={event => setCode(event.target.value)} />
            </label>
            <div className="canva-detail__actions">
              <button type="submit" className="primary" disabled={!code.trim()}>دووبارە گەڕان</button>
            </div>
          </form>
          <div className="canva-detail__actions">
            <button type="button" className="secondary" onClick={onSearch}>گەڕان بە ناوی کاڵا</button>
            <button type="button" className="secondary" onClick={onBack}>گەڕانەوە بۆ سەبەتە</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
