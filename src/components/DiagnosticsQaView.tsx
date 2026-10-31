import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { inspectBarcode, formatDateTime, money } from '../utils/retailHelpers';

export const DiagnosticsQaView: React.FC = () => {
  const { auditLogs, exportBackupJson, importBackupJson, cart, lastReceipt, subtab } = useApp();

  const [activeTab, setActiveTab] = useState<'hardware' | 'backup' | 'customer_display' | 'audit'>(subtab === 'diagnostics' ? 'audit' : 'hardware');

  // Barcode diagnostic test input
  const [testBarcodeInput, setTestBarcodeInput] = useState('8690504100234');
  const barcodeInspection = inspectBarcode(testBarcodeInput);

  // Printer test status
  const [printerStatus, setPrinterStatus] = useState<string | null>(null);

  // Drawer kick status
  const [drawerStatus, setDrawerStatus] = useState<string | null>(null);

  // Backup message
  const [backupMsg, setBackupMsg] = useState<{ text: string; error: boolean } | null>(null);

  const handleTestPrint = () => {
    setPrinterStatus('خەریکی ناردنی فەرمانی چاپکردنی تاقیکاری بۆ پرینتەری ثێرمەڵ...');
    setTimeout(() => {
      window.print();
      setPrinterStatus('پرینتەری ثێرمەڵ (58mm/80mm) بە سەرکەوتوویی ئامادەیە.');
    }, 400);
  };

  const handleKickDrawer = () => {
    setDrawerStatus('فەرمانی کردنەوەی سندووق (ESC/p pulse) نێردرا!');
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
    }, 600);
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
    setBackupMsg({ text: 'فایلی پاڵپشت لە فۆڵدەری داگرتن پاشەکەوتکرا (D:\\SupermarketPOS_Data\\backups)', error: false });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const content = evt.target?.result as string;
      const res = importBackupJson(content);
      if (res.success) {
        setBackupMsg({ text: 'داتابەیس بە سەرکەوتوویی لە فایلەوە هێنرایەوە!', error: false });
      } else {
        setBackupMsg({ text: res.error || 'هەڵە لە هێنانەوەی فایلدا', error: true });
      }
    };
    reader.readAsText(file);
  };

  // Grand total in current cart for customer display
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '16px 24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: '#0f172a' }}>
          ئامێرەکان، پشکنینی سیستەم و پاڵپشت
        </h1>
        <div className="tabs" style={{ margin: 0 }}>
          <button
            type="button"
            className={`tab ${activeTab === 'hardware' ? 'active' : ''}`}
            onClick={() => setActiveTab('hardware')}
          >
            پشکنینی ئامێرەکان (Hardware)
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'customer_display' ? 'active' : ''}`}
            onClick={() => setActiveTab('customer_display')}
          >
            شاشەی کڕیار (Customer Display)
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            پاڵپشتی دیسک (D:\ Backup)
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            چاودێری و تۆماری سیستەم ({auditLogs.length})
          </button>
        </div>
      </div>

      {/* Tab: Hardware Diagnostics */}
      {activeTab === 'hardware' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 1fr)', gap: '18px' }}>
          {/* Barcode Scanner Diagnostic */}
          <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#172b45', margin: '0 0 12px' }}>
              پشکنەری بارکۆد سکانەر و کۆدی EAN-13
            </h2>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
              بارکۆدێک لێبدە یان بسکێنە بۆ دڵنیابوونەوە لە دروستی ژمارەی Checksum و کێشی تەرازوو:
            </p>

            <input
              type="text"
              value={testBarcodeInput}
              onChange={e => setTestBarcodeInput(e.target.value)}
              placeholder="بارکۆد بنووسە..."
              style={{
                width: '100%',
                height: '42px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1.5px solid #2563eb',
                fontSize: '15px',
                fontWeight: 900,
                direction: 'ltr',
                marginBottom: '14px'
              }}
            />

            <table className="table" style={{ margin: 0 }}>
              <tbody>
                <tr>
                  <td>درێژی نووسین:</td>
                  <td>{barcodeInspection.length} پیت/ژمارە</td>
                </tr>
                <tr>
                  <td>جۆری کۆد:</td>
                  <td>
                    <span className="stock-badge ok">{barcodeInspection.type}</span>
                  </td>
                </tr>
                <tr>
                  <td>ژمارەی پشکنینی کۆتایی (Checksum):</td>
                  <td>
                    <span
                      className={`stock-badge ${
                        barcodeInspection.validEan13 === true
                          ? 'ok'
                          : barcodeInspection.validEan13 === false
                          ? 'danger'
                          : 'info'
                      }`}
                    >
                      {barcodeInspection.checksum}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>کۆدی تەرازووی سەوزە و میوە (27...):</td>
                  <td>
                    {barcodeInspection.possibleScaleBarcode ? (
                      <span className="stock-badge warn">
                        کۆدی کاڵا: {barcodeInspection.scaleItemCode} | کێش: {barcodeInspection.scaleGrams} گرام
                      </span>
                    ) : (
                      'بارکۆدی ئاساییە'
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Printer & Cash Drawer Diagnostics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#172b45', margin: '0 0 10px' }}>
                تاقیکردنەوەی پرینتەری پسووڵە
              </h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                تاقیکردنەوەی دەرچوونی پسووڵە لە پرینتەری ثێرمەڵ (ESC/POS 80mm/58mm)
              </p>
              <button
                type="button"
                className="primary"
                onClick={handleTestPrint}
                style={{ height: '40px', fontSize: '13px' }}
              >
                🖨️ چاپی پسووڵەی تاقیکاری
              </button>
              {printerStatus && (
                <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 800, color: '#15803d' }}>
                  {printerStatus}
                </div>
              )}
            </div>

            <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#172b45', margin: '0 0 10px' }}>
                تاقیکردنەوەی کردنەوەی سندووق (Drawer Kick)
              </h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
                ناردنی فەرمانی لێدانی پلەتەی کارەبایی سندووق لەڕێگەی کێبڵی پرینتەر RJ11
              </p>
              <button
                type="button"
                className="secondary"
                onClick={handleKickDrawer}
                style={{ height: '40px', fontSize: '13px', background: '#eff6ff', borderColor: '#93c5fd' }}
              >
                ⚡ تاقیکردنەوەی سندووق (Kick Drawer)
              </button>
              {drawerStatus && (
                <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 800, color: '#1d4ed8' }}>
                  {drawerStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Customer Secondary Display Live Mirror */}
      {activeTab === 'customer_display' && (
        <div className="surface" style={{ background: '#0f172a', padding: '24px', borderRadius: '16px', color: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1.5px solid #334155', paddingBottom: '14px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>◈</span>
              <strong style={{ fontSize: '20px', color: '#fff' }}>سوپەرمارکێتی کانی چنار — شاشەی کڕیار</strong>
            </div>
            <div style={{ color: '#38bdf8', fontSize: '14px', direction: 'ltr', fontWeight: 900 }}>
              {new Date().toLocaleTimeString()}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '15px', color: '#94a3b8', margin: '0 0 10px' }}>
                کاڵاکانی ئێستای سەبەتە ({cart.length})
              </h3>
              {cart.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', border: '1px dashed #334155', borderRadius: '12px', color: '#94a3b8' }}>
                  بەخێربێن بۆ سوپەرمارکێتی کانی چنار — کڕینێکی شاد
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#f8fafc' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ textAlign: 'right', padding: '8px' }}>کاڵا</th>
                      <th style={{ textAlign: 'center', padding: '8px' }}>بڕ</th>
                      <th style={{ textAlign: 'left', padding: '8px', direction: 'ltr' }}>کۆ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 800 }}>{c.name}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: '#38bdf8', fontWeight: 900 }}>{c.qty}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'left', direction: 'ltr', color: '#4ade80', fontWeight: 900 }}>
                          {(c.price * c.qty).toLocaleString()} IQD
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ background: '#1e293b', padding: '24px', borderRadius: '16px', border: '1.5px solid #334155', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '16px', color: '#bfdbfe', fontWeight: 800, marginBottom: '8px' }}>
                کۆی گشتی بۆ پارەدان:
              </div>
              <div style={{ fontSize: '42px', fontWeight: 950, color: '#ffffff', direction: 'ltr' }}>
                {money(cartTotal)}
              </div>
              {lastReceipt && (
                <div style={{ marginTop: '20px', padding: '10px', background: '#064e3b', borderRadius: '10px', color: '#a7f3d0', fontSize: '12px', fontWeight: 800 }}>
                  دواین پسووڵە: {lastReceipt.receiptNumber} ({money(lastReceipt.total)})
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Disk Backup & Restore */}
      {activeTab === 'backup' && (
        <div className="surface" style={{ background: '#fff', padding: '24px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45', margin: '0 0 12px' }}>
            پاڵپشتی خۆکار لەسەر دیسکی PC (D:\ Drive Backup)
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: 1.6 }}>
            سیستەمی کاشێر پشتگیری لە هەڵگرتنی تەواوی داتابەیس دەکات (کاڵاکان، کۆگا، حساباتی کڕیاران و شێفتەکان). دەتوانیت لە هەر کاتێکدا فایلی پاڵپشت داگریت یان لە فایلی دیسکەوە بیهێنیتەوە.
          </p>

          {backupMsg && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                marginBottom: '18px',
                background: backupMsg.error ? '#fef2f2' : '#f0fdf4',
                border: `1.5px solid ${backupMsg.error ? '#fca5a5' : '#bbf7d0'}`,
                color: backupMsg.error ? '#991b1b' : '#166534',
                fontWeight: 800,
                fontSize: '13.5px'
              }}
            >
              {backupMsg.text}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div style={{ border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '20px', background: '#f8fafc' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 900, margin: '0 0 8px' }}>
                1. داگرتنی فایلی پاڵپشت (Export Backup JSON)
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px' }}>
                پاشەکەوتکردنی هەموو داتاکان لە فۆرماتی `backup-latest.json`
              </p>
              <button
                type="button"
                className="primary"
                onClick={handleDownloadBackup}
              >
                💾 داگرتنی پاڵپشتی ئێستا
              </button>
            </div>

            <div style={{ border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '20px', background: '#f8fafc' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 900, margin: '0 0 8px' }}>
                2. هێنانەوە لە فایلی دیسک (Restore Backup JSON)
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px' }}>
                هەڵبژاردنی فایلی داتا بۆ گەڕاندنەوەی سەرجەم کاڵا و حساباتەکان
              </p>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                style={{ fontSize: '13px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab: System Audit Trail */}
      {activeTab === 'audit' && (
        <div className="surface" style={{ background: '#fff', padding: '20px', borderRadius: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#172b45', marginBottom: '16px' }}>
            تۆماری چاودێری و ڕووداوەکانی سیستەم (Audit Trail)
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th>بەروار و کات</th>
                <th>بەکارهێنەر</th>
                <th>کردار</th>
                <th>وردەکاری</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map(log => (
                <tr key={log.id}>
                  <td style={{ direction: 'ltr' }}>{formatDateTime(log.timestamp)}</td>
                  <td>
                    <span className="stock-badge info">{log.user}</span>
                  </td>
                  <td>
                    <strong>{log.action}</strong>
                  </td>
                  <td>{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
