import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MODULE_SPECS, CardIcon } from './CardIcon';
import { NavView } from '../types';

/**
 * Owner-locked desktop Home, restored from design-lock/pc-home-v1/index.html.
 * Keep navigation wired to the current React routes; no POS or DB logic lives here.
 * The later owner-approved 60 local SVG icons and global market banner are retained.
 */
export const HomeScreen: React.FC = () => {
  const { navigateTo } = useApp();
  const [openModuleIndex, setOpenModuleIndex] = useState(-1);

  const handleSubcardClick = (targetView: string, targetSubtab?: string) => {
    navigateTo(targetView as NavView, targetSubtab);
  };

  return (
    <section className="locked-home" aria-label="بەشە سەرەکییەکان" style={{ maxWidth: 1500, margin: '0 auto', position: 'relative' }}>
      <h1 style={{ fontSize: 23, margin: '0 0 27px', fontWeight: 900, color: '#172b45' }}>بەشە سەرەکییەکان</h1>
      {[0, 1, 2].map(rowIndex => {
        const start = rowIndex * 4;
        const openInRow = openModuleIndex >= start && openModuleIndex < start + 4;
        const activeModule = openInRow ? MODULE_SPECS[openModuleIndex] : null;
        return (
          <div key={rowIndex} style={{ position: 'relative', marginBottom: 15 }}>
            <div className="row locked-home-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 15, marginBottom: 0 }}>
              {MODULE_SPECS.slice(start, start + 4).map((spec, colIndex) => {
                const index = start + colIndex;
                const isOpen = openModuleIndex === index;
                return (
                  <button key={spec.id} type="button" className="module" data-module={index}
                    aria-expanded={isOpen} aria-controls={isOpen ? 'locked-home-subcards' : undefined}
                    onClick={() => setOpenModuleIndex(prev => prev === index ? -1 : index)}
                    style={{
                      '--color': spec.color, '--light': spec.lightBg,
                      minHeight: 153, border: isOpen ? `1px solid ${spec.color}` : '1px solid #e2e8ef',
                      background: '#fff', borderRadius: 16, padding: 19,
                      textAlign: 'right', display: 'flex', flexDirection: 'column',
                      justifyContent: 'space-between', alignItems: 'start',
                      color: '#26374e', boxShadow: isOpen ? '0 7px 19px #20415b12' : '0 5px 17px #1b385008',
                      cursor: 'pointer'
                    } as React.CSSProperties}>
                    <span className="icon" style={{ width: 49, height: 49, borderRadius: 13, background: spec.lightBg, color: spec.color, display: 'grid', placeItems: 'center' }}>
                      <CardIcon id={spec.iconName} size={29} />
                    </span>
                    <span className="end" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="name" style={{ fontSize: 15, fontWeight: 900, color: '#172b45' }}>{spec.title}</span>
                      <span className="chev" style={{ fontSize: 20, fontWeight: 900, color: isOpen ? spec.color : '#8798ad', transform: isOpen ? 'rotate(180deg)' : undefined }}>⌄</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {activeModule && (
              <div className="drawer" id="locked-home-subcards" role="region" aria-label={activeModule.title}
                style={{
                  position: 'absolute', top: 'calc(100% + 2px)', right: 0, left: 0, zIndex: 20,
                  background: '#fff', border: '1px solid #e3e8ef', borderRadius: 15,
                  padding: 19, margin: 0, boxShadow: '0 8px 24px rgba(32,57,84,.12)',
                  animation: 'none', transform: 'none', transition: 'none'
                }}>
                <div className="drawerhead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 17 }}>
                  <strong style={{ fontSize: 15, fontWeight: 900, color: '#172b45' }}>{activeModule.title}</strong>
                  <button className="close" aria-label="داخستن" type="button" onClick={() => setOpenModuleIndex(-1)}
                    style={{ border: 0, background: '#f2f5f8', color: '#64758d', borderRadius: 8, width: 32, height: 32 }}>✕</button>
                </div>
                <div className="subgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
                  {activeModule.submodules.map((sub, index) => (
                    <button className="sub" key={index} type="button"
                      onClick={() => handleSubcardClick(sub.targetView, sub.targetSubtab)}
                      style={{ minHeight: 112, border: '1px solid #e5eaf1', borderRadius: 11,
                        background: '#f9fafc', color: '#273a54', padding: 14, textAlign: 'right',
                        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                        justifyContent: 'space-between', fontSize: 13, fontWeight: 900 }}>
                      <span className="sub-icon" style={{ background: activeModule.lightBg, color: activeModule.color, width: 39, height: 39, borderRadius: 10, display: 'grid', placeItems: 'center' }}>
                        <CardIcon id={sub.iconName} size={23} />
                      </span>
                      <span className="sub-footer" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <span className="sub-name">{sub.label}</span><span className="sub-arrow">↖</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};
