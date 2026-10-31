import React from "react";
import {LocalPostgresPilotV24} from "./LocalPostgresPilotV24";
import "../cashierCleanV1.css";

// UI-only iteration. The local PostgreSQL service owns real prices,
// stock, transaction idempotency and receipt numbers. This screen stays
// explicitly labelled as a trial until financial/hardware acceptance.
export const LocalCashierV32:React.FC=()=>(
  <section className="pos-clean" dir="rtl" aria-label="کاشێری PostgreSQL ـی ناوخۆیی V32">
    <div className="pos-clean__top">
      <h1 aria-label="کاشێر و فرۆشتن — PostgreSQL">کاشێر</h1>
      <div className="pos-clean__top-actions">
        <span className="pos-clean__trial" role="status">تاقیکردنەوە</span>
      </div>
    </div>
    <details className="pos-clean__notes">
      <summary>زانیاریی دۆخی سیستەم</summary>
      <p>ئەم کاشێرە تەنها بۆ تاقیکردنەوەی PostgreSQL ـی ناوخۆییە.
      فرۆشتنی فەرمی و پارەدانی بانکی چالاک نییە؛
      هیچ داتای Demo یان ئەژماری ڕاستەقینە تێکەڵ ناکرێت.</p>
    </details>
    <LocalPostgresPilotV24 standalone/>
  </section>
);
