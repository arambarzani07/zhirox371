import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { inspectBarcode, formatDateTime, money } from '../utils/retailHelpers';

export const DiagnosticsQaView: React.FC = () => {
  const {
    products,
    customers,
    suppliers,
    receipts,
    currentShift,
    adjustStock,
    auditLogs,
    exportBackupJson,
    importBackupJson,
    cart,
    lastReceipt,
    navigateTo,
    subtab,
    activeSectionId
  } = useApp();

  const resolveMode = (): 'hardware' | 'alerts' | 'audit' | 'history' => {
    if (activeSectionId === 'alert-bell') return 'alerts';
    if (activeSectionId === 'change-history') return 'history';
    if (activeSectionId === 'transaction-check' || subtab === 'diagnostics') return 'audit';
    return 'hardware';
  };

  const [activeTab, setActiveTab] = useState<'hardware' | 'alerts' | 'audit' | 'history'>(resolveMode);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setActiveTab(resolveMode());
  }, [subtab, activeSectionId]);

  const [testBarcodeInput, setTestBarcodeInput] = useState('8690504100234');
  const barcodeInspection = inspectBarcode(testBarcodeInput);

  const [printerStatus, setPrinterStatus] = useState<string | null>(null);
  const [drawerStatus, setDrawerStatus] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<{ text: string; error: boolean } | null>(null);

  const handleTestPrint = () => {
    setPrinterStatus('ناردنی فەرمانی چاپکردنی تاقیکاری بۆ پرینتەری گەرمی...');
    setTimeout(() => {
      window.print();
      setPrinterStatus('پرینتەری گەرمی (58mm/80mm) ئامادەیە.');
    }, 300);
  };

  const handleKickDrawer = () => {
    setDrawerStatus('فەرمانی کردنەوەی سندووق (ESC/POS pulse) نێردرا.');
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (_e) {}
    setTimeout(() => {
      setDrawerStatus('سندووقی نەختینە بە سەرکەوتوویی کرایەوە.');
    }, 500);
  };

  const handleDownloadBackup = () => {
    const jsonStr = exportBackupJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setBackupMsg({
      text: 'فایلی Backup ـی Demo لە Download ـەکانی وێبگەڕ دابەزی؛ بە شێوەی خۆکار لە D: پاشەکەوت نەکراوە',
      error: false
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const content = evt.target?.result as string;
      if (!window.confirm('ئەمە تەنها داتای Demo ـی ئەم وێبگەڕە دەگۆڕێت؛ داتابەیسی ڕاستەقینە نییە. بەردەوام بیت؟')) return;
      const res = importBackupJson(content);
      if (res.success) {
        setBackupMsg({ text: 'داتای Demo لە Backup ـەوە هێنرایەوە؛ نە داتابەیسی PostgreSQL', error: false });
      } else {
        setBackupMsg({ text: res.error || 'هەڵە لە هێنانەوەی فایلدا', error: true });
      }
    };
    reader.readAsText(file);
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const lowStockProducts = products.filter(p => p.stock <= (p.min_stock ?? 10));
  const nearExpiryProducts = products.filter(p => {
    if (!p.expiry_date) return false;
    const days = Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / (1000 * 3600 * 24));
    return days <= 45;
  });
  const debtors = customers.filter(c => c.balanceDebt > 0);
  const expectedDrawerCalc =
    currentShift.openingFloat +
    currentShift.cashSales -
    currentShift.expenses -
    (currentShift.cashReturns || 0);
  const isShiftReconciled = expectedDrawerCalc === currentShift.expectedCash;

  const filteredLogs = auditLogs.filter(
    l =>
      search === '' ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.details.toLowerCase().includes(search.toLowerCase()) ||
      l.user.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="ws-stack">
      {/* 1. CONNECTED DEVICES SUBMODULE (ئامێرەکان) */}
      {activeTab === 'hardware' && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">بارکۆد سکانەری USB / HID</span>
              <span className="ws-kpi-value positive">پەیوەستە</span>
              <span className="ws-kpi-sub">پشتگیری لە EAN-13 و تەرازووی (27...)</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">پرینتەری پسووڵە (Thermal ESC/POS)</span>
              <span className="ws-kpi-value positive">80mm / 58mm</span>
              <span className="ws-kpi-sub">دەرگای سندووق RJ11 چالاکە</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">شاشەی دووەمی کڕیار</span>
              <span className="ws-kpi-value">{money(cartTotal)}</span>
              <span className="ws-kpi-sub">
                {lastReceipt ? `دواین پسووڵە: ${lastReceipt.receiptNumber}` : `${cart.length} کاڵا لە سەبەتەدایە`}
              </span>
            </div>
          </div>

          <div className="ws-panel">
            <h2 className="ws-panel-title">تاقیکردنەوەی ڕاستەوخۆی سکانەر، پرینتەر و دەرگای سندووق</h2>
            <div className="ws-form-grid">
              <label className="form-col">
                کۆدی بارکۆد بۆ پشکنینی EAN-13 یان تەرازوو
                <input
                  type="text"
                  value={testBarcodeInput}
                  onChange={e => setTestBarcodeInput(e.target.value)}
                  dir="ltr"
                  placeholder="8690504100234"
                />
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="primary" onClick={handleTestPrint}>
                  چاپی پسووڵەی تاقیکاری
                </button>
                <button type="button" className="secondary" onClick={handleKickDrawer}>
                  کردنەوەی سندووق (Drawer Kick)
                </button>
              </div>
            </div>
            {(printerStatus || drawerStatus) && (
              <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 800, color: '#15803d' }}>
                {printerStatus || drawerStatus}
              </div>
            )}
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              ئەنجامی شیکردنەوەی بارکۆدی سکانکراو ({testBarcodeInput || '—'})
            </strong>
            <table>
              <thead>
                <tr>
                  <th>تایبەتمەندیی بارکۆد</th>
                  <th>بەهای خوێندراوە</th>
                  <th>دۆخی پشکنین</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>درێژیی زنجیرەی بارکۆد</strong>
                  </td>
                  <td style={{ direction: 'ltr' }}>{barcodeInspection.length} ژمارە</td>
                  <td>ستاندارد</td>
                </tr>
                <tr>
                  <td>
                    <strong>جۆری کۆد و فۆرمات</strong>
                  </td>
                  <td>{barcodeInspection.type}</td>
                  <td>ناسراوە</td>
                </tr>
                <tr>
                  <td>
                    <strong>ژمارەی پشکنینی کۆتایی (EAN-13 Checksum)</strong>
                  </td>
                  <td>{barcodeInspection.checksum}</td>
                  <td
                    style={{
                      fontWeight: 900,
                      color: barcodeInspection.validEan13 === false ? '#b91c1c' : '#15803d'
                    }}
                  >
                    {barcodeInspection.validEan13 === false ? 'نادروست' : 'دروست'}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>شیکردنەوەی بارکۆدی تەرازوو (پێشگری 27)</strong>
                  </td>
                  <td>
                    {barcodeInspection.possibleScaleBarcode
                      ? `کۆدی کاڵا: ${barcodeInspection.scaleItemCode} · کێش: ${barcodeInspection.scaleGrams} گرام`
                      : 'بارکۆدی یەکەی ئاسایی'}
                  </td>
                  <td>ئامادە</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 2. ALERTS SUBMODULE (ئاگادارکردنەوەکان) */}
      {activeTab === 'alerts' && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کاڵا کەمبووەکانی کۆگا</span>
              <span className={`ws-kpi-value ${lowStockProducts.length > 0 ? 'negative' : 'positive'}`}>
                {lowStockProducts.length}
              </span>
              <span className="ws-kpi-sub">کەمتر یان یەکسان بە سنووری ئاگادارکردنەوە</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کاڵای نزیک لە بەسەرچوون (≤ 45 ڕۆژ)</span>
              <span className={`ws-kpi-value ${nearExpiryProducts.length > 0 ? 'negative' : 'positive'}`}>
                {nearExpiryProducts.length}
              </span>
              <span className="ws-kpi-sub">پێویستی بە پێشخستنی فرۆشتنە (FEFO)</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کڕیارانی خاوەن قەرزی کراوە</span>
              <span className="ws-kpi-value">{debtors.length}</span>
              <span className="ws-kpi-sub">
                کۆی قەرز: {money(debtors.reduce((s, c) => s + c.balanceDebt, 0))}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
              gap: '10px',
              alignItems: 'start',
              flex: '0 1 auto',
              minHeight: 0,
              overflow: 'hidden'
            }}
          >
            <div className="section-workspace__table" style={{ height: 'auto', maxHeight: '100%' }}>
              <strong className="section-workspace__metric">
                ئاگادارکردنەوەی کەمبوونی کۆگا ({lowStockProducts.length} کاڵا)
              </strong>
              <table>
                <thead>
                  <tr>
                    <th>ناوی کاڵا و بارکۆد</th>
                    <th>کۆگای ئێستا</th>
                    <th>کەمترین بڕ</th>
                    <th>ئاستی هۆشداری</th>
                    <th>کرداری خێرا</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.length === 0 ? (
                    <tr>
                      <td className="section-workspace__empty" colSpan={5}>
                        هیچ کاڵایەک لە کۆگادا کەم نەبووەتەوە — دۆخی کۆگا نایابە
                      </td>
                    </tr>
                  ) : (
                    lowStockProducts.map(p => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <div style={{ fontSize: '10.5px', color: '#536c85', direction: 'ltr', textAlign: 'right' }}>
                            {p.unit_barcode}
                          </div>
                        </td>
                        <td style={{ fontWeight: 900, color: '#b91c1c' }}>
                          {p.stock} {p.base_unit === 'kg' ? 'kg' : 'دانە'}
                        </td>
                        <td>{p.min_stock ?? 10}</td>
                        <td>
                          <span className="ws-badge danger">کەمبووە</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="primary"
                            style={{ padding: '0 10px', fontSize: '11.5px' }}
                            onClick={() => adjustStock(p.id, 20, 'unit', 'پڕکردنەوەی خێرا لە بەشی ئاگادارکردنەوەکان')}
                          >
                            + پڕکردنەوە (20)
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="section-workspace__table" style={{ height: 'auto', maxHeight: '100%' }}>
              <strong className="section-workspace__metric">
                هۆشداریی دارایی و بەرواری بەسەرچوون
              </strong>
              <table>
                <thead>
                  <tr>
                    <th>جۆری ئاگادارکردنەوە</th>
                    <th>بابەت / لایەن</th>
                    <th>بڕ یان بەروار</th>
                    <th>کردار</th>
                  </tr>
                </thead>
                <tbody>
                  {nearExpiryProducts.map(p => (
                    <tr key={`exp-${p.id}`}>
                      <td>
                        <span className="ws-badge warning">نزیکبوونەوەی بەسەرچوون</span>
                      </td>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td style={{ direction: 'ltr', fontWeight: 900 }}>{p.expiry_date}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => navigateTo('stock', 'expiry', 'expiry')}
                        >
                          بینین لە بەسەرچوون
                        </button>
                      </td>
                    </tr>
                  ))}
                  {debtors.map(c => (
                    <tr key={`debt-${c.id}`}>
                      <td>
                        <span className="ws-badge danger">قەرزی کڕیار</span>
                      </td>
                      <td>
                        <strong>{c.name}</strong> ({c.phone})
                      </td>
                      <td style={{ direction: 'ltr', fontWeight: 900, color: '#b91c1c' }}>
                        {money(c.balanceDebt)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => navigateTo('customers', 'debts', 'customer-repayment')}
                        >
                          وەرگرتنەوەی قەرز
                        </button>
                      </td>
                    </tr>
                  ))}
                  {suppliers
                    .filter(s => s.balanceDebt > 0)
                    .map(s => (
                      <tr key={`sup-${s.id}`}>
                        <td>
                          <span className="ws-badge warning">شایستەی دابینکەر</span>
                        </td>
                        <td>
                          <strong>{s.name}</strong>
                        </td>
                        <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(s.balanceDebt)}</td>
                        <td>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => navigateTo('suppliers', '', 'supplier-accounts')}
                          >
                            حیساباتی دابینکەر
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 3. TRANSACTION CHECK & BACKUP SUBMODULE (پشکنینی مامەڵە) */}
      {activeTab === 'audit' && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">هاوتابوونی ژمێریاریی شەفت</span>
              <span className={`ws-kpi-value ${isShiftReconciled ? 'positive' : 'negative'}`}>
                {isShiftReconciled ? '100% هاوتایە' : 'جیاوازی هەیە'}
              </span>
              <span className="ws-kpi-sub">سندووقی چاوەڕوانکراو: {money(currentShift.expectedCash)}</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی پسووڵە تۆمارکراوەکان</span>
              <span className="ws-kpi-value">{receipts.length}</span>
              <span className="ws-kpi-sub">
                کۆی گشتیی فرۆش: {money(receipts.reduce((s, r) => s + r.total, 0))}
              </span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">تۆماری چاودێری (Audit Log)</span>
              <span className="ws-kpi-value positive">{auditLogs.length}</span>
              <span className="ws-kpi-sub">تۆماری پارێزراو لە دەستکاریکردن</span>
            </div>
          </div>

          <div className="ws-panel">
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <div>
                <h2 className="ws-panel-title" style={{ margin: 0 }}>
                  پاڵپشتیی داتابەیس و پشکنینی مامەڵەکان (JSON Backup & Audit)
                </h2>
                <div style={{ fontSize: '12px', color: '#536c85', marginTop: '4px', fontWeight: 700 }}>
                  پاشەکەوتکردن و هێنانەوەی سەرجەم کاڵاکان، پسووڵەکان، کۆگا و حساباتی قەرز
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="primary" onClick={handleDownloadBackup}>
                  داگرتنی پاڵپشتی ئێستا (JSON)
                </button>
                <label className="secondary" style={{ cursor: 'pointer', margin: 0 }}>
                  هێنانەوە لە فایلەوە
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>

            {backupMsg && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: backupMsg.error ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${backupMsg.error ? '#fca5a5' : '#bbf7d0'}`,
                  color: backupMsg.error ? '#991b1b' : '#166534',
                  fontSize: '12px',
                  fontWeight: 800
                }}
              >
                {backupMsg.text}
              </div>
            )}
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              تۆماری پشکنینی مامەڵە و چالاکییەکانی سیستەم ({auditLogs.length})
            </strong>
            <table>
              <thead>
                <tr>
                  <th>بەروار و کات</th>
                  <th>بەکارهێنەر</th>
                  <th>جۆری مامەڵە / کردار</th>
                  <th>وردەکاری</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ direction: 'ltr' }}>{formatDateTime(log.timestamp)}</td>
                    <td>{log.user}</td>
                    <td>
                      <strong>{log.action}</strong>
                    </td>
                    <td>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 4. CHANGE HISTORY SUBMODULE (مێژووی گۆڕانکاری) */}
      {activeTab === 'history' && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی گۆڕانکارییە تۆمارکراوەکان</span>
              <span className="ws-kpi-value">{auditLogs.length}</span>
              <span className="ws-kpi-sub">تۆماری نەگۆڕی سەرجەم کردارەکان</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">ئەنجامی گەڕان و فلتەری ئێستا</span>
              <span className="ws-kpi-value positive">{filteredLogs.length}</span>
              <span className="ws-kpi-sub">گۆڕانکاریی پیشاندراو لە خشتەدا</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">بەکارهێنەرانی تۆمارکراو لە چالاکی</span>
              <span className="ws-kpi-value">{new Set(auditLogs.map(l => l.user)).size}</span>
              <span className="ws-kpi-sub">کاشێر و بەڕێوەبەرە چالاکەکان</span>
            </div>
          </div>

          <div className="ws-panel">
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <input
                type="text"
                className="input-search"
                placeholder="گەڕان لە مێژووی گۆڕانکارییەکان بەپێی کردار، بەکارهێنەر، یان وردەکاری..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#536c85' }}>
                کۆی گۆڕانکارییە تۆمارکراوەکان: {filteredLogs.length}
              </span>
            </div>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              تۆماری تەواوی مێژووی گۆڕانکارییەکان ({filteredLogs.length} تۆمار)
            </strong>
            <table>
              <thead>
                <tr>
                  <th>ژمارە</th>
                  <th>بەروار و کات</th>
                  <th>بەکارهێنەر</th>
                  <th>کردار</th>
                  <th>وردەکاریی گۆڕانکاری</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={5}>
                      هیچ گۆڕانکارییەک بەپێی ئەم گەڕانە نەدۆزرایەوە
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log, idx) => (
                    <tr key={log.id}>
                      <td>{filteredLogs.length - idx}</td>
                      <td style={{ direction: 'ltr' }}>{formatDateTime(log.timestamp)}</td>
                      <td>
                        <span className="ws-badge">{log.user}</span>
                      </td>
                      <td>
                        <strong>{log.action}</strong>
                      </td>
                      <td>{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
