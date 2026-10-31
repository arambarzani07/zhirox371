import React from "react";
import {useApp} from "../context/AppContext";
import {NavView} from "../types";

// One continuous horizontal strip directly beneath the supermarket name.
// All supported module views stay reachable without Home cards or drawers.
const links:{label:string;view:NavView;subtab?:string}[]=[
 {label:"کاشێر",view:"pos"},
 {label:"کاڵاکان",view:"products",subtab:"list"},
 {label:"کۆگا",view:"stock",subtab:"overview"},
 {label:"کڕیاران",view:"customers"},
 {label:"دابینکەران",view:"suppliers"},
 {label:"دارایی",view:"finance"},
 {label:"ڕاپۆرت",view:"reports"},
 {label:"ڕێکخستن",view:"settings"},
 {label:"ئافەر",view:"offers"},
 {label:"لیبڵ",view:"labels"},
 {label:"شێفت",view:"shifts"},
 {label:"چاودێری",view:"audit"}
];
export const Header:React.FC<{localPilot?:boolean}>=({localPilot=false})=>{
 const {currentView,navigateTo,cart}=useApp();
 const active=(view:NavView)=>currentView===view;
 return <header className={`system-header system-strip-only ${localPilot?"system-local-only":""}`}>
    <nav className="system-nav" aria-label="بەشەکانی سیستەم">
      <button type="button" className={`ws-link ${currentView==="home"?"active":""}`}
        aria-current={currentView==="home"?"page":undefined}
        onClick={()=>navigateTo("home")}>سەرەتا</button>
      {links.map(({view,label,subtab})=><button key={view} type="button"
        className={`ws-link ${active(view)?"active":""}`}
        disabled={localPilot&&view!=="pos"} aria-disabled={localPilot&&view!=="pos"}
        aria-current={active(view)?"page":undefined}
        onClick={()=>navigateTo(view,subtab)}>
         {label}
         {view==="pos"&&cart.length>0&&<span className="system-counter">{cart.length}</span>}
      </button>)}
    </nav>
  </header>;
};
