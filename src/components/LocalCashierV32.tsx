import React from "react";
import {LocalPostgresPilotV24} from "./LocalPostgresPilotV24";

// This component intentionally does not import useApp, completeCheckout,
// Demo products or Demo receipts. It must fail CLOSED without the local API.
export const LocalCashierV32:React.FC=()=>(
 <section dir="rtl" aria-label="کاشێری PostgreSQL ـی ناوخۆیی V32"
  style={{maxWidth:1500,margin:"0 auto",padding:"16px 24px 32px"}}>
  <div role="status" style={{border:"2px solid #946200",
    background:"#fff8e8",borderRadius:9,padding:13,marginBottom:12,fontWeight:850}}>
    V32 — کاشێری PostgreSQL ـی ناوخۆیی، تەنها تاقیکردنەوە
    <div style={{fontWeight:500,marginTop:5}}>
      فرۆشتن لەم پەڕەیە تەنها لە داتابەیسی ناوخۆیی تاقی دەکرێتەوە.
      کاشێری Demo و پسووڵەکانی تێکەڵ ناکرێن. هێشتا بۆ بەکارهێنانی فەرمی ئامادە نییە.
    </div>
  </div>
  <h1 style={{fontSize:23,fontWeight:900,margin:"0 0 12px"}}>
   کاشێر و فرۆشتن — PostgreSQL
  </h1>
  <LocalPostgresPilotV24 standalone/>
 </section>
);
