import React,{useEffect,useState} from "react";
import {MODULE_SPECS,CardIcon} from "./CardIcon";
import {LocalCashierV32} from "./LocalCashierV32";
import "../offlineDesktopShellV57.css";
import "../systemDesignV2.css";

// Isolated offline LAN PostgreSQL trial. Module titles may be explored in
// the two navigation columns, but unsupported submodules are NEVER executed.
const allowed=(moduleId:number,iconName:string)=>
 moduleId===0&&(iconName==="barcode-scan"||iconName==="receipt");

export const OfflineDesktopShellV57:React.FC=()=>{
 const [screen,setScreen]=useState<"home"|"cashier">("home");
 const [moduleId,setModuleId]=useState(0);
 const [selectedSub,setSelectedSub]=useState<string|null>(null);
 const returnHome=()=>{setScreen("home");setSelectedSub(null);};
 const showCashier=(icon="barcode-scan")=>{
   setModuleId(0);setSelectedSub(icon);setScreen("cashier");
 };
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==="Escape"&&screen!=="home"){event.preventDefault();returnHome();}
   if(event.key==="F1"&&screen==="home"){event.preventDefault();showCashier();}
  };
  window.addEventListener("keydown",onKey);
  return ()=>window.removeEventListener("keydown",onKey);
 },[screen]);
 const module=MODULE_SPECS.find(m=>m.id===moduleId)??MODULE_SPECS[0];
 return <div className="v57-app" dir="rtl" data-local-v36-pilot="true"
   data-v57-home="true" data-offline-only="true">
  <div className="market-banner">سوپەرمارکێتی کانی چنار</div>
  <div className="v57-desktop">
   <header className="v57-header v57-strip-header">
    <nav className="system-nav" aria-label="بەشەکانی سیستەم" data-v57-navigation="true">
      <button type="button" className={screen==="home"?"active":""}
       aria-current={screen==="home"?"page":undefined}
       onClick={returnHome}>سەرەتا</button>
      {MODULE_SPECS.map(m=>{
       const enabled=m.submodules.some(sub=>allowed(m.id,sub.iconName));
       const selected=m.id===0&&screen==="cashier";
       return <button type="button" key={m.id} data-module-id={m.id}
         className={selected?"active":""}
         disabled={!enabled} aria-disabled={!enabled}
         aria-current={selected?"page":undefined}
         onClick={()=>{if(enabled)showCashier();}}>{m.title}</button>;
      })}
    </nav>
   </header>
   <main className="v57-content v57-three-columns" id="v57-main">
    <aside className="system-module-column" aria-label="ستوونی یەکەم ـ بەشەکان">
     <nav className="system-module-list" aria-label="بەشە سەرەکییەکان">
      {MODULE_SPECS.map(m=><button type="button" key={m.id} data-module-id={m.id}
        className={`system-module-link ${module.id===m.id?"selected":""}`}
        aria-current={module.id===m.id?"true":undefined}
        onClick={()=>{setModuleId(m.id);returnHome();}}>
         <CardIcon id={m.iconName} size={19}/><span>{m.title}</span>
         <span className="system-module-arrow" aria-hidden="true">‹</span>
      </button>)}
     </nav>
    </aside>
    <aside className="system-submodule-column" aria-label="ستوونی دووەم ـ ژێربەشەکان">
     <div className="system-submodule-heading">{module.title}</div>
     <nav className="system-submodule-list" aria-label="ژێربەشەکان">
      {module.submodules.map(sub=>{
       const enabled=allowed(module.id,sub.iconName);
       const active=screen==="cashier"&&selectedSub===sub.iconName;
       return <button type="button" key={sub.iconName} data-sub-icon={sub.iconName}
         className={`system-submodule-link ${active?"selected":""}`}
         disabled={!enabled} aria-disabled={!enabled}
         aria-current={active?"page":undefined}
         onClick={()=>{if(enabled)showCashier(sub.iconName);}}>
           <CardIcon id={sub.iconName} size={18}/><span>{sub.label}</span>
           {active&&<span className="system-selected-check" aria-hidden="true">✓</span>}
       </button>;
      })}
     </nav>
    </aside>
    <div className="v57-workspace-column">
      {screen==="cashier"?<div data-v57-screen="cashier"><LocalCashierV32/></div>:
        <div className="v57-home v57-home-empty" data-v57-screen="home"/>}
    </div>
   </main>
  </div>
 </div>;
};
