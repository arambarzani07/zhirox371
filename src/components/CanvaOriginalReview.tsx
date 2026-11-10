import React, { useState } from 'react';
import original from '../../design/canva-original-screen-map.json';

type OriginalScreen = { number: number; id: string; title: string; canva: string };
const screens = original.screens as OriginalScreen[];
const screenFromUrl = () => {
  const number = Number(new URLSearchParams(window.location.search).get('canva-source') || '1');
  return Math.min(screens.length, Math.max(1, Number.isInteger(number) ? number : 1));
};

/**
 * Source-of-truth visual comparator for the original 148 Canva screens.
 * It embeds the original hosted Canva DESIGN. It is NOT a local source clone,
 * a functional React implementation, a POS, or an offline-ready interface.
 * Keep this opt-in route separate from the locked cashier Home.
 */
export const CanvaOriginalReview: React.FC = () => {
  const [number, setNumber] = useState(screenFromUrl);
  const source = screens[number - 1];
  const goto = (next: number) => {
    if (!Number.isInteger(next) || next < 1 || next > screens.length) return;
    setNumber(next);
    const url = new URL(window.location.href);
    url.searchParams.set('canva-source', String(next).padStart(3, '0'));
    window.history.replaceState({}, '', url.toString());
  };
  return (
    <main data-canva-original-review="true" dir="rtl" style={{
      minHeight: '100vh', background: '#eef3f8', color: '#172b45',
      fontFamily: '"Noto Kufi Arabic", Tahoma, sans-serif',
      padding: '20px 24px', boxSizing: 'border-box'
    }}>
      <header style={{ maxWidth: 1500, margin: '0 auto 14px', display: 'flex',
        flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>سوپەرمارکێتی کانی چنار</div>
          <div style={{ fontSize: 12, marginTop: 3 }}>
            پێشبینینی دیزاینی ئەسڵی Canva ـ بۆ بەراوردکردن، نەک کاشێری کارا
          </div>
        </div>
        <strong style={{ fontSize: 18 }}>ZHIROX</strong>
      </header>
      <nav aria-label="گەشتکردنی 148 شاشەی دیزاینی ئەسڵی"
        style={{ display: 'flex', maxWidth: 1500, gap: 8, margin: '0 auto 12px', flexWrap: 'wrap' }}>
        <button onClick={() => goto(number - 1)} disabled={number <= 1}>پێشوو</button>
        <select aria-label="هەڵبژاردنی شاشە" value={number}
          onChange={e => goto(Number(e.target.value))}
          style={{ minWidth: 180, padding: 8, background: '#fff' }}>
          {screens.map(s => <option key={s.id} value={s.number}>
            {String(s.number).padStart(3, '0')} — {s.title.replace(/^ZHIROX\s*\|\s*\d{3}\s*[—-]\s*/, '')}
          </option>)}
        </select>
        <button onClick={() => goto(number + 1)} disabled={number >= screens.length}>داهاتوو</button>
        <a href={source.canva + '/view'} target="_blank" rel="noreferrer noopener"
           style={{ alignSelf: 'center', marginInlineStart: 'auto' }}>کردنەوەی دیزاینی ئەسڵی لە Canva</a>
      </nav>
      <section style={{ width: '100%', maxWidth: 1500, margin: 'auto', aspectRatio: '16 / 9',
        background: '#fff', boxShadow: '0 4px 18px #14233e22', overflow: 'hidden' }}
        aria-label="پیشاندانی دیزاینی ئەسڵی">
        <iframe key={source.id} title={'Canva ZHIROX ' + String(source.number).padStart(3, '0')}
          src={source.canva + '/view?embed'} loading="eager"
          style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          allowFullScreen />
      </section>
      <p style={{ maxWidth: 1500, margin: '8px auto', fontSize: 11, color: '#536781' }}>
        تێبینی: شاشەکان لە Canva نیشان دەدرێن. کۆدی کاراکردنیان دەبێت بە جیا لە React جێبەجێ و تاقی بکرێت.
      </p>
    </main>
  );
};
