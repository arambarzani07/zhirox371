import React,{useEffect,useState} from "react";
import {MODULE_SPECS} from "./CardIcon";
import {LocalCashierV32} from "./LocalCashierV32";
import "../offlineDesktopShellV57.css";
import "../systemDesignV2.css";

// Local offline trial: all module names can be explored, but only the
// two isolated PostgreSQL cashier destinations can be executed. No cloud.
const allowed=(moduleId:number,iconName:string)=>
 moduleId===0&&(iconName==="barcode-scan"||iconName==="receipt");

export const OfflineDesktopShellV57:React.FC=()=>{
 const [screen,setScreen]=useState<"home"|"cashier">("home");
 const [moduleId,setModuleId]=useState<number|null>(null);
 const [selectedSub,setSelectedSub]=useState<string|null>(null);
 const returnHome=()=>{setScreen("home");setModuleId(null);setSelectedSub(null);};
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
 const selected=MODULE_SPECS.find(m=>m.id===moduleId);
 const changeModule=(id:number)=>{
   setModuleId(id);setSelectedSub(null);
   // A disabled module remains a menu preview, never a usable checkout.
   if(screen!=="home")setScreen("home");
 };
 return <div className="v57-app" dir="rtl" data-local-v36-pilot="true"
    data-v57-home="true" data-offline-only="true">
   <div className="market-banner">سوپەرمارکێتی کانی چنار</div>
   <div className="v57-desktop">
    <header className="v57-header v57-strip-header v57-double-strip">
     <nav className="system-nav system-primary-nav" aria-label="بەشە سەرەکییەکان" data-v57-navigation="true">
      <button type="button" className={moduleId===null?"active":""}
         aria-current={moduleId===null?"page":undefined} onClick={returnHome}>سەرەتا</button>
      {MODULE_SPECS.map(m=><button type="button" key={m.id}
          data-module-id={m.id} className={moduleId===m.id?"active":""}
          aria-current={moduleId===m.id?"true":undefined}
          aria-expanded={moduleId===m.id} onClick={()=>changeModule(m.id)}>
          {m.title}
       </button>)}
     </nav>
     <nav className="system-subnav" aria-label="ژێربەشەکان" data-v57-subnav="horizontal">
       {selected?.submodules.map(sub=>{
         const enabled=allowed(selected.id,sub.iconName);
         const active=screen==="cashier"&&selectedSub===sub.iconName;
         return <button type="button" key={sub.iconName}
           className={`system-subnav-link ${active?"selected":""}`}
           data-sub-icon={sub.iconName}
           disabled={!enabled} aria-disabled={!enabled}
           aria-current={active?"page":undefined}
           onClick={()=>{if(enabled)showCashier(sub.iconName);}}>
             {sub.label}
         </button>;
       })}
     </nav>
    </header>
    <main className="v57-content v57-horizontal-workspace" id="v57-main">
      {screen==="cashier"?<div data-v57-screen="cashier"><LocalCashierV32/></div>:
        <div className="v57-home v57-home-empty" data-v57-screen="home"/>}
    </main>
   </div>
 </div>;
};
