import React from "react";
import {LocalPostgresPilotV24} from "./LocalPostgresPilotV24";
import "../localCashierMinimalV58.css";

// Presentational shell only. The local PostgreSQL authority, receipt journal,
// checkout flow and fail-closed guards remain in LocalPostgresPilotV24.
export const LocalCashierV32:React.FC=()=>(
 <section className="local-cashier-v58" dir="rtl" aria-label="کاشێری PostgreSQL ـی ناوخۆیی V32">
  <div className="local-cashier-v58-top">
   <h1>کاشێر و فرۆشتن — PostgreSQL</h1>
   <span className="local-cashier-v58-stage" role="status">V32 · تاقیکردنەوە</span>
  </div>
  <details className="local-cashier-v58-disclosure">
   <summary>زانیاریی تاقیکردنەوە</summary>
   فرۆشتن لەم پەڕەیە تەنها لە داتابەیسی PostgreSQL ـی ناوخۆیی تاقی دەکرێتەوە.
   کاشێری Demo و پسووڵەکانی تێکەڵ ناکرێن. هێشتا بۆ بەکارهێنانی فەرمی ئامادە نییە.
  </details>
  <LocalPostgresPilotV24 standalone/>
 </section>
);
