import React from "react";
import {LocalPostgresPilotV24} from "./LocalPostgresPilotV24";
import "../cashierCleanV1.css";

// The badge is always visible: the isolated PostgreSQL cashier is a trial.
// No financial API, inventory or transaction implementation is changed here.
export const LocalCashierV32:React.FC=()=>(
  <section className="pos-clean" dir="rtl" aria-label="کاشێری PostgreSQL ـی ناوخۆیی V32">
    <div className="pos-clean__top">
      <h1 aria-label="کاشێر و فرۆشتن — PostgreSQL">کاشێر</h1>
      <span className="pos-clean__trial" role="status">تاقیکردنەوە</span>
    </div>
    <LocalPostgresPilotV24 standalone/>
  </section>
);
