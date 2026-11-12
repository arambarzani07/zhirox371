import React, { useEffect } from 'react';
import { useApp } from './context/AppContext';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { CanvaWorkspace } from './components/CanvaWorkspace';
import { SectionWorkspace } from './components/SectionWorkspace';
import { CashierPos } from './components/CashierPos';
import { LocalCashierV32 } from './components/LocalCashierV32';
import { localCashierV32 } from './localCashierModeV32';
import { ProductCatalogView } from './components/ProductCatalogView';
import { InventoryStockView } from './components/InventoryStockView';
import { CanvaCustomerWorkspace } from './components/CanvaCustomerWorkspace';
import { CanvaSuppliers046 } from './components/CanvaSuppliers046';
import { CanvaFinanceWorkspace } from './components/CanvaFinanceWorkspace';
import { ReportsAnalyticsView } from './components/ReportsAnalyticsView';
import { LabelsPrintView } from './components/LabelsPrintView';
import { DiagnosticsQaView } from './components/DiagnosticsQaView';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';

const workspaceTitles = {
  pos: 'فرۆشتن و کاشێر',
  products: 'کاڵا و نرخ',
  stock: 'کۆگا و بەسەرچوون',
  customers: 'کڕیار و قەرز',
  suppliers: 'کڕین و دابینکەران',
  finance: 'سندووق و دارایی',
  shifts: 'شیفتەکان',
  reports: 'ڕاپۆرت و شیکاری',
  labels: 'تامبەر و تۆڕ',
  qa: 'پشکنین',
  settings: 'ڕێکخستن و پاراستن',
  audit: 'مێژووی گۆڕانکاری',
  offers: 'ئۆفەر و پاداشت',
};

export const App: React.FC = () => {
  const { currentView, subtab, activeSectionId, navigateTo, activeReceiptForModal, setActiveReceiptForModal } = useApp();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeReceiptForModal) {
          setActiveReceiptForModal(null);
        } else if (currentView !== 'home') {
          navigateTo('home');
        }
      } else if (e.key === 'F1') {
        e.preventDefault();
        navigateTo('pos');
      } else if (e.key === 'F3') {
        e.preventDefault();
        navigateTo('stock');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, activeReceiptForModal, navigateTo, setActiveReceiptForModal]);

  return (
    <>
      <div className="market-banner zhirox-canva-masthead">
        <span className="zhirox-canva-store-name">سوپەرمارکێتی کانی چنار</span>
        <strong className="zhirox-canva-brand" dir="ltr">ZHIROX</strong>
      </div>
      <div className="viewport">
        <div className="desktop">
          <Header localPilot={localCashierV32} />
          <main id="app" className="system-two-rows">
            {currentView === 'home' && <HomeScreen />}
            {currentView !== 'home' && activeSectionId && <SectionWorkspace key={activeSectionId} sectionId={activeSectionId} />}
            {!activeSectionId && currentView !== 'home' && (
              <CanvaWorkspace title={workspaceTitles[currentView]}>
                {currentView === 'pos' && (localCashierV32 ? <LocalCashierV32 /> : <CashierPos />)}
                {currentView === 'products' && <ProductCatalogView key={subtab} />}
                {currentView === 'stock' && <InventoryStockView key={subtab} />}
                {currentView === 'customers' && <CanvaCustomerWorkspace key={subtab} />}
                {currentView === 'suppliers' && <CanvaSuppliers046 key={subtab} />}
                {(currentView === 'finance' || currentView === 'shifts') && <CanvaFinanceWorkspace key={subtab} />}
                {currentView === 'reports' && <ReportsAnalyticsView />}
                {currentView === 'labels' && <LabelsPrintView />}
                {(['qa', 'settings', 'audit', 'offers'] as const).some(view => view === currentView) && <DiagnosticsQaView />}
              </CanvaWorkspace>
            )}
          </main>
        </div>
      </div>

      {activeReceiptForModal && !(localCashierV32 && currentView === 'pos') && (
        <ThermalReceiptModal
          receipt={activeReceiptForModal}
          onClose={() => setActiveReceiptForModal(null)}
        />
      )}
    </>
  );
};
