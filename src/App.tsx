import React, { useEffect } from 'react';
import { useApp } from './context/AppContext';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { CashierPos } from './components/CashierPos';
import { LocalCashierV32 } from './components/LocalCashierV32';
import { localCashierV32 } from './localCashierModeV32';
import { ProductCatalogView } from './components/ProductCatalogView';
import { InventoryStockView } from './components/InventoryStockView';
import { CustomersLedgerView } from './components/CustomersLedgerView';
import { SuppliersView } from './components/SuppliersView';
import { FinanceShiftView } from './components/FinanceShiftView';
import { ReportsAnalyticsView } from './components/ReportsAnalyticsView';
import { LabelsPrintView } from './components/LabelsPrintView';
import { DiagnosticsQaView } from './components/DiagnosticsQaView';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';

export const App: React.FC = () => {
  const { currentView, navigateTo, activeReceiptForModal, setActiveReceiptForModal } = useApp();

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
      <div className="market-banner">سوپەرمارکێتی کانی چنار</div>
      <div className="viewport">
        <div className="desktop">
          <Header />
          <main id="app">
            {currentView === 'home' && <HomeScreen />}
            {currentView === 'pos' && (localCashierV32 ? <LocalCashierV32 /> : <CashierPos />)}
            {currentView === 'products' && <ProductCatalogView />}
            {currentView === 'stock' && <InventoryStockView />}
            {currentView === 'customers' && <CustomersLedgerView />}
            {currentView === 'suppliers' && <SuppliersView />}
            {(currentView === 'finance' || currentView === 'shifts') && <FinanceShiftView />}
            {currentView === 'reports' && <ReportsAnalyticsView />}
            {currentView === 'labels' && <LabelsPrintView />}
            {(currentView === 'qa' || currentView === 'settings' || currentView === 'audit' || currentView === 'offers') && (
              <DiagnosticsQaView />
            )}
          </main>
        </div>
      </div>

      {activeReceiptForModal && (
        <ThermalReceiptModal
          receipt={activeReceiptForModal}
          onClose={() => setActiveReceiptForModal(null)}
        />
      )}
    </>
  );
};
