import { CanvaSaleReturn } from './CanvaSaleReturn';
import {CanvaSupplierRecords} from './CanvaSupplierRecords';
import {CanvaPurchaseOrder048} from './CanvaPurchaseOrder048';
import {CanvaPurchaseApprovals054} from './CanvaPurchaseApprovals054';
import {CanvaInvoiceDifferences055} from './CanvaInvoiceDifferences055';
import {CanvaPurchaseReceiving049} from './CanvaPurchaseReceiving049';
import React, { useEffect, useState } from "react";
import {useApp} from "../context/AppContext";
import {MODULE_SPECS} from "./CardIcon";
import {CashierPos} from "./CashierPos";
import {LocalCashierV32} from "./LocalCashierV32";
import {ProductCatalogView} from "./ProductCatalogView";
import {InventoryStockView} from "./InventoryStockView";
import {CanvaCustomerWorkspace} from "./CanvaCustomerWorkspace";
import {CanvaSupplierPayments053} from "./CanvaSupplierPayments053";
import {CanvaSuppliers046} from "./CanvaSuppliers046";
import {CanvaPurchaseRequest047} from "./CanvaPurchaseRequest047";
import {CanvaFinanceWorkspace} from "./CanvaFinanceWorkspace";
import {LabelsPrintView} from "./LabelsPrintView";
import {DiagnosticsQaView} from "./DiagnosticsQaView";
import {OperationalSubmodulesView} from "./OperationalSubmodulesView";
import {localCashierV32} from "../localCashierModeV32";
import {KurdishVoiceAnnouncer} from "../utils/kurdishVoiceEngine";
import {KurdishVoiceAssistantModal} from "./KurdishVoiceAssistantModal";
import {CanvaWorkspaceHeader} from "./CanvaWorkspace";

// Every semantic submodule has a permanent, unique screen. Connected demo
// workflows reuse their existing components; operational workflows render
// dedicated interactive Sorani RTL panels backed by AppContext state.
const supported:Record<string,string>={
 "barcode-scan":"cashier", "receipt":"cashier", "payment-notes":"cashier",
 "add-box":"products","product-list":"products","price-tags":"products","barcode-bars":"products",
 "stock-stack":"stock","low-stock":"stock","expiry":"stock","stock-transfer":"stock",
 "single-customer":"customers","debt-book":"customers","purchase-history":"customers","customer-repayment":"customers",
 "supplier-building":"suppliers","receive-goods":"stock","supplier-accounts":"suppliers",
 "cash-drawer":"finance","expense-fall":"finance","income-rise":"finance","cash-movements":"finance",
 "price-label":"labels","batch-print":"labels","label-barcode":"labels",
 "connected-devices":"diagnostics","transaction-check":"diagnostics","alert-bell":"diagnostics","change-history":"diagnostics",
 "return-arrow":"returns","purchase-order":"operational",
 "profit-chart":"operational","ai-insights":"operational","sales-trend":"operational","stock-chart":"operational",
 "manage-users":"operational","access-key":"operational","system-controls":"operational",
 "new-offer":"operational","discount-percent":"operational","coupon-ticket":"operational","promotion-speaker":"operational",
 "print-template":"operational",
 "attendance":"operational","work-timer":"operational","staff-review":"operational","shift-clock":"finance",
 "approval-file":"operational"
};
export const SectionWorkspace:React.FC<{sectionId:string}>=({sectionId})=>{
 const state=useApp();
 const [showSettingsVoiceModal, setShowSettingsVoiceModal] = useState(false);
 const found=MODULE_SPECS.flatMap(m=>m.submodules.map(s=>({...s,moduleId:m.id,moduleTitle:m.title})))
   .find(s=>s.iconName===sectionId);

 useEffect(() => {
   if (found?.label) {
     KurdishVoiceAnnouncer.announceSection(found.label);
   }
 }, [sectionId]);

 if(!found) return <section className="section-workspace" data-section-id="unknown">
   <CanvaWorkspaceHeader title="بەش نەدۆزرایەوە"/>
 </section>;
 const mode=supported[sectionId];
 const component=(()=>{
  switch(mode){
   case "cashier":return localCashierV32?<LocalCashierV32/>:<CashierPos key={sectionId}/>;
   case "products":return <ProductCatalogView key={sectionId}/>;
   case "stock":return <InventoryStockView key={sectionId}/>;
   case "customers":return <CanvaCustomerWorkspace key={sectionId}/>;
   case "suppliers":return sectionId==="supplier-building"?<CanvaSuppliers046 key={sectionId}/>:state.subtab==="payments"?<CanvaSupplierPayments053/>:<CanvaSupplierRecords screen="052"/>;
   case "finance":return <CanvaFinanceWorkspace key={sectionId}/>;
   case "labels":return <LabelsPrintView key={sectionId}/>;
   case "diagnostics":return <DiagnosticsQaView key={sectionId}/>;
   case "returns":return <CanvaSaleReturn/>;
   case "operational":return sectionId==="purchase-order"
     ?state.subtab==="invoice"?<CanvaSupplierRecords key="050" screen="050"/>
      :state.subtab==="supplier-return"?<CanvaSupplierRecords key="051" screen="051"/>
      :state.subtab==="receiving-preview"?<CanvaPurchaseReceiving049/>
      :state.subtab==="invoice-differences"?<CanvaInvoiceDifferences055/>
      :state.subtab==="purchase-approvals"?<CanvaPurchaseApprovals054/>
      :state.subtab==="order"?<CanvaPurchaseOrder048/>:<CanvaPurchaseRequest047 key={sectionId}/>
     :<OperationalSubmodulesView key={sectionId} sectionId={sectionId}/>;
   default:return null;
  }
 })();
 return <section className="section-workspace" data-section-id={sectionId} data-section-title={found.label}
    data-module-id={found.moduleId} dir="rtl">
   <CanvaWorkspaceHeader title={sectionId === "return-arrow" ? "گەڕاندنەوەی فرۆشتن" : found.label} category={found.moduleTitle} actions={
     found.moduleId === 7 && (
       <button id="settings-voice-studio-btn" type="button" className="secondary"
         onClick={() => setShowSettingsVoiceModal(true)}>ستۆدیۆی دەنگی کوردی و AI</button>
     )
   }/>
   <div className="section-workspace__live">{component}</div>
   {showSettingsVoiceModal && (
     <KurdishVoiceAssistantModal onClose={() => setShowSettingsVoiceModal(false)} />
   )}
 </section>;
};
