import {CanvaSupplierRecords} from './CanvaSupplierRecords';
import {CanvaPurchaseOrder048} from './CanvaPurchaseOrder048';
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
 "return-arrow":"operational","purchase-order":"operational",
 "profit-chart":"operational","ai-insights":"operational","sales-trend":"operational","stock-chart":"operational",
 "manage-users":"operational","access-key":"operational","system-controls":"operational",
 "new-offer":"operational","discount-percent":"operational","coupon-ticket":"operational","promotion-speaker":"operational",
 "print-template":"operational",
 "attendance":"operational","work-timer":"operational","staff-review":"operational","shift-clock":"finance",
 "approval-file":"operational"
};
type ScreenData={headers:string[];rows:(string|number)[][];ready:boolean;metric?:string};
const date=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString("en-GB"):"—";
const fmt=(n:number)=>n.toLocaleString("en-US");
const empty=(columns:string[]):ScreenData=>({headers:columns,rows:[],ready:false});

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
   <h1>بەش نەدۆزرایەوە</h1>
 </section>;
 const {products,customers,suppliers,receipts,expenses,auditLogs,currentShift}=state;
 const mode=supported[sectionId];
 let data:ScreenData|undefined;
 switch(sectionId){
   case "payment-notes":
     data={headers:["پسووڵە","جۆری پارەدان","بڕ","بەروار"],rows:receipts.map(r=>[r.receiptNumber,r.paymentMethod==="cash"?"نەختینە":"قەرز",fmt(r.total),date(r.createdAt)]),ready:true};
     break;
   case "purchase-history":
     data={headers:["پسووڵە","کڕیار","کۆی گشتی","بەروار"],
       rows:receipts.map(r=>[r.receiptNumber,r.customerName||"—",fmt(r.total),date(r.createdAt)]),ready:true};
     break;
   case "customer-repayment":
     data={headers:["ناوی کڕیار","قەرزی ماوە","ژمارەی پەیوەندی"],
       rows:customers.filter(c=>c.balanceDebt>0).map(c=>[c.name,fmt(c.balanceDebt),c.phone]),ready:true};
     break;
   case "supplier-accounts":
     data={headers:["دابینکەر","قەرزی ماوە","پەیوەندی"],
       rows:suppliers.map(s=>[s.name,fmt(s.balanceDebt),s.phone]),ready:true};
     break;
   case "income-rise":
     data={headers:["ژمارەی پسووڵە","بڕ","جۆر","بەروار"],
       rows:receipts.map(r=>[r.receiptNumber,fmt(r.total),r.paymentMethod==="cash"?"نەختینە":"قەرز",date(r.createdAt)]),ready:true,
       metric:fmt(receipts.reduce((n,r)=>n+r.total,0))+" IQD"};
     break;
   case "cash-movements":
     data={headers:["ناونیشان","بڕی خەرجی","پۆل","بەروار"],
       rows:expenses.map(e=>[e.title,fmt(e.amount),e.category,date(e.createdAt)]),ready:true};
     break;
   case "sales-trend":
     data={headers:["پسووڵە","جۆری پارەدان","کۆ","بەروار"],
       rows:receipts.map(r=>[r.receiptNumber,r.paymentMethod==="cash"?"نەختینە":"قەرز",fmt(r.total),date(r.createdAt)]),ready:true,
       metric:fmt(receipts.reduce((n,r)=>n+r.total,0))+" IQD"};
     break;
   case "stock-chart":
     data={headers:["ناوی کاڵا","کۆگا","یەکە"],
       rows:products.map(p=>[p.name,fmt(p.stock),p.base_unit==="kg"?"کیلۆگرام":"دانە"]),ready:true};
     break;
   case "label-barcode":
     data={headers:["ناوی کاڵا","بارکۆدی یەکە","بارکۆدی کارتۆن"],
       rows:products.map(p=>[p.name,p.unit_barcode,p.carton?.barcode||"—"]),ready:true};
     break;
   case "shift-clock":
     data={headers:["کاشێر","کردنەوە","داخستن","دۆخ"],
       rows:[[currentShift.cashierName,date(currentShift.openedAt),date(currentShift.closedAt),currentShift.status==="open"?"کراوە":"داخراو"]],ready:true};
     break;
   case "alert-bell":
     data={headers:["ناوی کاڵا","بڕی کۆگا","کەمترین بڕ"],
       rows:products.filter(p=>p.stock<=(p.min_stock??10))
         .map(p=>[p.name,fmt(p.stock),fmt(p.min_stock??10)]),ready:true};
     break;
   case "change-history":
     data={headers:["کردار","بەکارهێنەر","بەروار","وردەکاری"],
       rows:auditLogs.map(a=>[a.action,a.user,date(a.timestamp),a.details]),ready:true};
     break;
   default:
     if(!mode)data=empty(["ژمارە","ناو","دۆخ"]);
 }
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
   case "operational":return sectionId==="purchase-order"
     ?state.subtab==="invoice"?<CanvaSupplierRecords key="050" screen="050"/>
      :state.subtab==="supplier-return"?<CanvaSupplierRecords key="051" screen="051"/>
      :state.subtab==="receiving-preview"?<CanvaPurchaseReceiving049/>
      :state.subtab==="order"?<CanvaPurchaseOrder048/>:<CanvaPurchaseRequest047 key={sectionId}/>
     :<OperationalSubmodulesView key={sectionId} sectionId={sectionId}/>;
   default:return null;
  }
 })();
 return <section className="section-workspace" data-section-id={sectionId} data-section-title={found.label}
    data-module-id={found.moduleId} dir="rtl">
   <CanvaWorkspaceHeader title={found.label} category={found.moduleTitle} actions={
     found.moduleId === 7 && (
       <button id="settings-voice-studio-btn" type="button" className="secondary"
         onClick={() => setShowSettingsVoiceModal(true)}>ستۆدیۆی دەنگی کوردی و AI</button>
     )
   }/>
   {component?<div className="section-workspace__live">{component}</div>:
     <div className="section-workspace__table" role="region" aria-label={found.label}>
       {data?.metric&&<strong className="section-workspace__metric">{data.metric}</strong>}
       <table><thead><tr>{data?.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
         <tbody>{data?.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}
         {(!data||data.rows.length===0)&&<tr><td className="section-workspace__empty" colSpan={data?.headers.length??1}>
           {data?.ready?"هیچ تۆمارێک نییە":"هێشتا بەردەست نییە"}
         </td></tr>}</tbody>
       </table>
     </div>}
   {showSettingsVoiceModal && (
     <KurdishVoiceAssistantModal onClose={() => setShowSettingsVoiceModal(false)} />
   )}
 </section>;
};
