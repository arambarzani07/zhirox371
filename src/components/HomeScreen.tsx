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
  // Exact right-to-left order of the approved 1920×1080 Canva Home (001).
  // Underlying module IDs/route targets are never re-keyed or reassigned.
  const canvaHomeModules = [0, 1, 2, 4, 3, 5, 10, 8, 6, 11, 9, 7]
    .map(index => MODULE_SPECS[index]);

  const handleSubcardClick = (targetView: string, targetSubtab: string | undefined, sectionId: string) => {
    navigateTo(targetView as NavView, targetSubtab, sectionId);
  };

  return (
    <section className="home-screen locked-home canva-home-001" data-canva-screen="001" dir="rtl" aria-label="بەشە سەرەکییەکان" style={{ maxWidth: 1760, margin: '0 auto', position: 'relative', padding: '28px 28px 24px' }}>
      <h1 className="canva-home-title" style={{ fontSize: 30, margin: '0 0 24px', fontWeight: 900, color: '#172b45', textAlign: 'right' }}>بەشە سەرەکییەکان</h1>
      {[0, 1, 2].map(rowIndex => {
        const start = rowIndex * 4;
        const openInRow = openModuleIndex >= start && openModuleIndex < start + 4;
        const activeModule = openInRow ? canvaHomeModules[openModuleIndex] : null;
        const openUpwards = rowIndex === 2;
        return (
          <div key={rowIndex} style={{ position: 'relative', marginBottom: rowIndex === 2 ? 0 : 22 }}>
            <div className="row locked-home-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 20, marginBottom: 0 }}>
              {canvaHomeModules.slice(start, start + 4).map((spec, colIndex) => {
                const index = start + colIndex;
                const isOpen = openModuleIndex === index;
                return (
                  <button key={spec.id} type="button" className="module canva-home-card" data-module={index} data-canva-card={String(index + 1).padStart(2, '0')}
                    aria-expanded={isOpen} aria-controls={isOpen ? 'locked-home-subcards' : undefined}
                    onClick={() => setOpenModuleIndex(prev => prev === index ? -1 : index)}
                    style={{
                      '--color': spec.color, '--light': spec.lightBg,
                      minHeight: 184, border: isOpen ? `1.5px solid ${spec.color}` : '1px solid #dfe5ef',
                      background: '#fff', borderRadius: 14, padding: '18px 20px',
                      textAlign: 'right', display: 'flex', flexDirection: 'column',
                      justifyContent: 'space-between', alignItems: 'start',
                      color: '#26374e', boxShadow: isOpen ? '0 7px 19px #20415b12' : '0 2px 9px #1b385008',
                      cursor: 'pointer'
                    } as React.CSSProperties}>
                    <span className="canva-home-card-top" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <strong className="canva-home-card-number" style={{ fontSize: 23, color: '#172b45', fontWeight: 900, direction: 'ltr' }}>{String(index + 1).padStart(2, '0')}</strong>
                      <span className="icon" style={{ width: 45, height: 45, borderRadius: 12, background: spec.lightBg, color: spec.color, display: 'grid', placeItems: 'center' }}>
                        <CardIcon id={spec.iconName} size={26} />
                      </span>
                    </span>
                    <span className="end" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="name" style={{ fontSize: 19, fontWeight: 900, color: '#172b45', textAlign: 'right' }}>{spec.title}</span>
                      <span className="chev" style={{ fontSize: 16, fontWeight: 900, color: isOpen ? spec.color : '#8798ad', transform: isOpen ? 'rotate(180deg)' : undefined }}>⌄</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {activeModule && (
              <div className="drawer" id="locked-home-subcards" role="region" aria-label={activeModule.title}
                style={{
                  '--color': activeModule.color, '--light': activeModule.lightBg,
                  position: 'absolute',
                  top: openUpwards ? 'auto' : 'calc(100% + 4px)',
                  bottom: openUpwards ? 'calc(100% + 4px)' : 'auto',
                  right: 0, left: 0, zIndex: 25,
                  background: '#fff', border: `1.5px solid ${activeModule.color}`, borderRadius: 14,
                  padding: '15px 17px', margin: 0, boxShadow: '0 12px 30px rgba(20,42,68,.18)',
                  animation: 'none', transform: 'none', transition: 'none'
                } as React.CSSProperties}>
                <div className="drawerhead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <strong style={{ fontSize: 14.5, fontWeight: 900, color: '#172b45' }}>{activeModule.title}</strong>
                  <button className="close" aria-label="داخستن" type="button" onClick={() => setOpenModuleIndex(-1)}
                    style={{ border: 0, background: '#f2f5f8', color: '#64758d', borderRadius: 8, width: 30, height: 30 }}>✕</button>
                </div>
                <div className="subgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
                  {activeModule.submodules.map((sub, index) => (
                    <button className="sub" key={index} type="button"
                      onClick={() => handleSubcardClick(sub.targetView, sub.targetSubtab, sub.iconName)}
                      style={{ minHeight: 96, border: '1px solid #e5eaf1', borderRadius: 10,
                        background: '#f9fafc', color: '#273a54', padding: 12, textAlign: 'right',
                        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                        justifyContent: 'space-between', fontSize: 12.5, fontWeight: 900 }}>
                      <span className="sub-icon" style={{ background: activeModule.lightBg, color: activeModule.color, width: 35, height: 35, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
                        <CardIcon id={sub.iconName} size={21} />
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
