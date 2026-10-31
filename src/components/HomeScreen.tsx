import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MODULE_SPECS, CardIcon } from './CardIcon';
import { NavView } from '../types';

export const HomeScreen: React.FC = () => {
  const { navigateTo } = useApp();
  const [openModuleIndex, setOpenModuleIndex] = useState<number>(-1);

  const handleCardClick = (index: number) => {
    setOpenModuleIndex(prev => (prev === index ? -1 : index));
  };

  const handleSubcardClick = (targetView: string, targetSubtab?: string) => {
    navigateTo(targetView as NavView, targetSubtab);
  };

  return (
    <div className="locked-home" style={{ maxWidth: '1500px', margin: '0 auto' }}>
      <h1
        style={{
          fontSize: '23px',
          margin: '0 0 27px',
          fontWeight: 900,
          color: '#172b45'
        }}
      >
        بەشە سەرەکییەکان
      </h1>

      <div style={{ display: 'grid', gap: '15px' }}>
        {[0, 1, 2].map(rowIndex => {
          const rowSpecs = MODULE_SPECS.slice(rowIndex * 4, rowIndex * 4 + 4);
          const isRowOpen = openModuleIndex >= rowIndex * 4 && openModuleIndex < rowIndex * 4 + 4;
          const activeModule = isRowOpen ? MODULE_SPECS[openModuleIndex] : null;

          return (
            <div
              key={rowIndex}
              className="row"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: '15px',
                position: 'relative',
                zIndex: isRowOpen ? 20 : 1
              }}
            >
                {rowSpecs.map((spec, colIndex) => {
                  const moduleIndex = rowIndex * 4 + colIndex;
                  const isOpen = openModuleIndex === moduleIndex;

                  return (
                    <button
                      key={spec.id}
                      type="button"
                      className="module"
                      data-module={moduleIndex}
                      aria-expanded={isOpen}
                      onClick={() => handleCardClick(moduleIndex)}
                      style={
                        {
                          '--color': spec.color,
                          '--light': spec.lightBg,
                          minHeight: '153px',
                          border: isOpen ? `1px solid ${spec.color}` : '1px solid #e2e8ef',
                          background: '#fff',
                          borderRadius: '16px',
                          padding: '19px',
                          textAlign: 'right',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          alignItems: 'start',
                          color: '#26374e',
                          boxShadow: isOpen ? '0 7px 19px #20415b12' : '0 5px 17px #1b385008',
                          cursor: 'pointer',
                          transition: 'none'
                        } as React.CSSProperties
                      }
                    >
                      <span
                        className="icon"
                        style={{
                          width: '49px',
                          height: '49px',
                          borderRadius: '13px',
                          background: spec.lightBg,
                          color: spec.color,
                          display: 'grid',
                          placeItems: 'center'
                        }}
                      >
                        <CardIcon id={spec.iconName} size={29} />
                      </span>

                      <span
                        className="end"
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px'
                        }}
                      >
                        <span
                          className="name"
                          style={{
                            fontSize: '15px',
                            fontWeight: 900,
                            color: '#172b45'
                          }}
                        >
                          {spec.title}
                        </span>
                        <span
                          className="chev"
                          style={{
                            color: isOpen ? spec.color : '#8798ad',
                            fontSize: '18px',
                            fontWeight: 900,
                            transform: isOpen ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.15s'
                          }}
                        >
                          ⌄
                        </span>
                      </span>
                    </button>
                  );
                })}

              {/* Anchored to this row: opening subcards must never move the other cards. */}
              {isRowOpen && activeModule && (
                <div
                  className="drawer"
                  role="region"
                  aria-label={activeModule.title}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #dce4ef',
                    borderRadius: '15px',
                    padding: '19px',
                    boxShadow: '0 8px 24px rgba(32,57,84,0.08)',
                    margin: 0,
                    position: 'absolute',
                    top: 'calc(100% + 2px)',
                    insetInline: 0,
                    width: '100%',
                    zIndex: 12,
                    maxHeight: 'min(265px, 52dvh)',
                    overflowY: 'auto',
                    animation: 'none',
                    transition: 'none'
                  }}
                >
                  <div
                    className="drawerhead"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px'
                    }}
                  >
                    <strong style={{ fontSize: '16px', fontWeight: 900, color: '#172b45' }}>
                      {activeModule.title}
                    </strong>
                    <button
                      className="close"
                      type="button"
                      aria-label="داخستن"
                      onClick={() => setOpenModuleIndex(-1)}
                      style={{
                        border: 'none',
                        background: '#f1f5f9',
                        color: '#64748b',
                        borderRadius: '8px',
                        width: '32px',
                        height: '32px',
                        fontSize: '15px',
                        fontWeight: 900,
                        cursor: 'pointer'
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <div
                    className="subgrid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                      gap: '12px'
                    }}
                  >
                    {activeModule.submodules.map((sub, j) => (
                      <button
                        key={j}
                        type="button"
                        className="sub"
                        onClick={() => handleSubcardClick(sub.targetView, sub.targetSubtab)}
                        style={
                          {
                            '--color': activeModule.color,
                            '--light': activeModule.lightBg,
                            minHeight: '112px',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '12px',
                            background: '#f8fafc',
                            padding: '14px',
                            textAlign: 'right',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                            transition: 'all 0.12s'
                          } as React.CSSProperties
                        }
                      >
                        <span
                          className="sub-icon"
                          style={{
                            display: 'grid',
                            placeItems: 'center',
                            width: '39px',
                            height: '39px',
                            background: activeModule.lightBg,
                            borderRadius: '10px',
                            color: activeModule.color
                          }}
                        >
                          <CardIcon id={sub.iconName} size={23} />
                        </span>

                        <span
                          className="sub-footer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            width: '100%'
                          }}
                        >
                          <span
                            className="sub-name"
                            style={{
                              fontSize: '13.5px',
                              fontWeight: 900,
                              color: '#172b45',
                              lineHeight: 1.5
                            }}
                          >
                            {sub.label}
                          </span>
                          <span
                            className="sub-arrow"
                            style={{
                              color: '#64748b',
                              fontSize: '15px',
                              fontWeight: 900
                            }}
                          >
                            ↖
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
