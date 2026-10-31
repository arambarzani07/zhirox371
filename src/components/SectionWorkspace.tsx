import React from "react";
import {useApp} from "../context/AppContext";
import {MODULE_SPECS,CardIcon} from "./CardIcon";
import {CashierPos} from "./CashierPos";
import {LocalCashierV32} from "./LocalCashierV32";
import {ProductCatalogView} from "./ProductCatalogView";
import {InventoryStockView} from "./InventoryStockView";
import {CustomersLedgerView} from "./CustomersLedgerView";
import {SuppliersView} from "./SuppliersView";
import {FinanceShiftView} from "./FinanceShiftView";
import {LabelsPrintView} from "./LabelsPrintView";
import {DiagnosticsQaView} from "./DiagnosticsQaView";
import {localCashierV32} from "../localCashierModeV32";
import "./sectionWorkspace.css";

// Every semantic submodule has a permanent, unique screen. Connected demo
// workflows reuse their existing components; unsupported workflows render
// scoped read-only/empty states, not artificial sales, records or buttons.
// This is a UI change, not an authorization to mutate production data.
const supported:Record<string,string>={
 "barcode-scan":"cashier", "receipt":"cashier",
 "add-box":"products","product-list":"products","price-tags":"products","barcode-bars":"products",
 "stock-stack":"stock","low-stock":"stock","expiry":"stock","stock-transfer":"stock",
 "single-customer":"customers","debt-book":"customers",
 "supplier-building":"suppliers","receive-goods":"stock",
 "cash-drawer":"finance","expense-fall":"finance",
 "price-label":"labels","batch-print":"labels",
 "connected-devices":"diagnostics","transaction-check":"diagnostics"
};
type ScreenData={headers:string[];rows:(string|number)[][];ready:boolean;metric?:string};
const date=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString("en-GB"):"—";
const fmt=(n:number)=>n.toLocaleString("en-US");
const empty=(columns:string[]):ScreenData=>({headers:columns,rows:[],ready:false});

export const SectionWorkspace:React.FC<{sectionId:string}>=({sectionId})=>{
 const state=useApp();
 const found=MODULE_SPECS.flatMap(m=>m.submodules.map(s=>({...s,moduleId:m.id,moduleTitle:m.title})))
   .find(s=>s.iconName===sectionId);
 if(!found) return <section className="section-workspace" data-section-id="unknown">
   <h1>بەش نەدۆزرایەوە</h1>
 </section>;
 const {products,customers,suppliers,receipts,expenses,stockMovements,auditLogs,currentShift}=state;
 const mode=supported[sectionId];
 let data:ScreenData|undefined;
 switch(sectionId){
   case "payment-notes":
     data={headers:["پسووڵە","جۆری پارەدان","بڕ","بەروار"],rows:receipts.map(r=>[r.receiptNumber,r.paymentMethod==="cash"?"نەختینە":"قەرز",fmt(r.total),date(r.createdAt)]),ready:true};
     break;
   case "return-arrow": data=empty(["پسووڵە","ناوی کاڵا","بڕ","دۆخ"]);break;
   case "purchase-history":
     data={headers:["پسووڵە","کڕیار","کۆی گشتی","بەروار"],
       rows:receipts.map(r=>[r.receiptNumber,r.customerName||"—",fmt(r.total),date(r.createdAt)]),ready:true};
     break;
   case "customer-repayment":
     data={headers:["ناوی کڕیار","قەرزی ماوە","ژمارەی پەیوەندی"],
       rows:customers.filter(c=>c.balanceDebt>0).map(c=>[c.name,fmt(c.balanceDebt),c.phone]),ready:true};
     break;
   case "purchase-order":data=empty(["ژمارەی داواکاری","دابینکەر","بەروار","دۆخ"]);break;
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
   case "profit-chart":data=empty(["بەروار","فرۆشتن","تێچوو","قازانجی ڕاستەقینە"]);break;
   case "stock-chart":
     data={headers:["ناوی کاڵا","کۆگا","یەکە"],
       rows:products.map(p=>[p.name,fmt(p.stock),p.base_unit==="kg"?"کیلۆگرام":"دانە"]),ready:true};
     break;
   case "ai-insights":data=empty(["شیکاری","دەرئەنجام","بەروار"]);break;
   case "manage-users":data=empty(["ناوی بەکارهێنەر","ڕۆڵ","دۆخ"]);break;
   case "access-key":data=empty(["ڕۆڵ","دەسەڵات","دۆخ"]);break;
   case "system-controls":data=empty(["ڕێکخستن","نرخ","دۆخ"]);break;
   case "new-offer":data=empty(["ناوی ئافەر","کاڵاکان","بەروار","دۆخ"]);break;
   case "discount-percent":data=empty(["ناوی کاڵا","ڕێژەی داشکاندن","بەروار"]);break;
   case "coupon-ticket":data=empty(["کۆدی کوپۆن","بڕ","بەسەرچوون"]);break;
   case "promotion-speaker":data=empty(["ناوی کەمپەین","دەستپێک","کۆتایی","دۆخ"]);break;
   case "label-barcode":
     data={headers:["ناوی کاڵا","بارکۆدی یەکە","بارکۆدی کارتۆن"],
       rows:products.map(p=>[p.name,p.unit_barcode,p.carton?.barcode||"—"]),ready:true};
     break;
   case "print-template":data=empty(["ناوی قاڵب","جۆری چاپ","قەبارە"]);break;
   case "shift-clock":
     data={headers:["کاشێر","کردنەوە","داخستن","دۆخ"],
       rows:[[currentShift.cashierName,date(currentShift.openedAt),date(currentShift.closedAt),currentShift.status==="open"?"کراوە":"داخراو"]],ready:true};
     break;
   case "attendance":data=empty(["کارمەند","بەروار","هاتن","چوون"]);break;
   case "work-timer":data=empty(["کارمەند","دەستپێک","کۆتایی","کۆی کات"]);break;
   case "staff-review":data=empty(["کارمەند","بەروار","هەڵسەنگاندن"]);break;
   case "alert-bell":
     data={headers:["ناوی کاڵا","بڕی کۆگا","کەمترین بڕ"],
       rows:products.filter(p=>p.stock<=(p.min_stock??10))
         .map(p=>[p.name,fmt(p.stock),fmt(p.min_stock??10)]),ready:true};
     break;
   case "approval-file":data=empty(["داواکەر","جۆری داوا","بەروار","دۆخ"]);break;
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
   case "customers":return <CustomersLedgerView key={sectionId}/>;
   case "suppliers":return <SuppliersView key={sectionId}/>;
   case "finance":return <FinanceShiftView key={sectionId}/>;
   case "labels":return <LabelsPrintView key={sectionId}/>;
   case "diagnostics":return <DiagnosticsQaView key={sectionId}/>;
   default:return null;
  }
 })();
 return <section className="section-workspace" data-section-id={sectionId} data-section-title={found.label}
    data-module-id={found.moduleId} dir="rtl">
   <div className="section-workspace__header">
     <span className="section-workspace__icon"><CardIcon id={sectionId} size={25}/></span>
     <h1>{found.label}</h1>
     {data&&!data.ready&&<span className="section-workspace__pending">هێشتا چالاک نییە</span>}
   </div>
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
 </section>;
};
