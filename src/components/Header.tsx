import React from 'react';
import { useApp } from '../context/AppContext';
import { money } from '../utils/retailHelpers';

export const Header: React.FC = () => {
  const { currentView, navigateTo, currentShift, cart } = useApp();

  // The owner-locked PC Home has only the original brand and Home control.
  // Operational quick links belong to feature pages, never the locked Home.
  if (currentView === 'home') {
    return (
      <header>
        <div className="brand"><i>◈</i><span>سیستەمی کاشێر</span></div>
        <button className="home" type="button" onClick={() => navigateTo('home')} title="سەرەتا" aria-label="سەرەتا">⌂</button>
      </header>
    );
  }

  return (
    <header>
      <div
        className="brand"
        onClick={() => navigateTo('home')}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <i>◈</i>
        <span>سیستەمی کاشێر</span>
      </div>

      <div className="right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          className={`ws-link ${currentView === 'pos' ? 'active' : ''}`}
          onClick={() => navigateTo('pos')}
          style={{
            position: 'relative',
            background: currentView === 'pos' ? '#1e3a8a' : undefined,
            color: currentView === 'pos' ? '#ffffff' : undefined
          }}
        >
          کاشێر (F1)
          {cart.length > 0 && (
            <span
              style={{
                marginInlineStart: '6px',
                background: '#ef4444',
                color: '#fff',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '11px',
                fontWeight: 900
              }}
            >
              {cart.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`ws-link ${currentView === 'stock' ? 'active' : ''}`}
          onClick={() => navigateTo('stock', 'overview')}
          style={{
            background: currentView === 'stock' ? '#1e3a8a' : undefined,
            color: currentView === 'stock' ? '#ffffff' : undefined
          }}
        >
          کۆگا (F3)
        </button>

        <button
          type="button"
          className={`ws-link ${currentView === 'products' ? 'active' : ''}`}
          onClick={() => navigateTo('products', 'list')}
          style={{
            background: currentView === 'products' ? '#1e3a8a' : undefined,
            color: currentView === 'products' ? '#ffffff' : undefined
          }}
        >
          کاڵاکان
        </button>

        <button
          type="button"
          className={`ws-link ${currentView === 'shifts' ? 'active' : ''}`}
          onClick={() => navigateTo('shifts')}
          style={{
            background: currentView === 'shifts' ? '#1e3a8a' : undefined,
            color: currentView === 'shifts' ? '#ffffff' : undefined
          }}
        >
          شێفت ({money(currentShift.expectedCash)})
        </button>

        <button
          type="button"
          className={`ws-link ${currentView === 'qa' ? 'active' : ''}`}
          onClick={() => navigateTo('qa')}
          title="ئامێرەکان و پشکنین"
          style={{
            background: currentView === 'qa' ? '#1e3a8a' : undefined,
            color: currentView === 'qa' ? '#ffffff' : undefined
          }}
        >
          ئامێرەکان
        </button>

        <span
          className="who"
          style={{
            background: '#f1f5f9',
            padding: '5px 10px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 800,
            color: '#1e293b'
          }}
        >
          {currentShift.cashierName}
        </span>

        <button
          className="home"
          type="button"
          onClick={() => navigateTo('home')}
          title="سەرەتا"
          aria-label="سەرەتا"
        >
          ⌂
        </button>
      </div>
    </header>
  );
};
