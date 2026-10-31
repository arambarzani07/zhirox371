import React,{useEffect,useState} from "react";
import {MODULE_SPECS} from "./CardIcon";
import {LocalCashierV32} from "./LocalCashierV32";
import "../offlineDesktopShellV57.css";
import "../systemDesignV2.css";

// Isolated local PG pilot: appearance is editable, but unsupported financial
// routes remain disabled. Only barcode scan and receipt route IDs are safe.
const allowed=(moduleId:number,iconName:string)=>
 moduleId===0&&(iconName==="barcode-scan"||iconName==="receipt");

export const OfflineDesktopShellV57:React.FC=()=>{
 const [screen,setScreen]=useState<"home"|"cashier">("home");
 const returnHome=()=>setScreen("home");
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
    if(event.key==="Escape"&&screen!=="home"){event.preventDefault();returnHome();}
    if(event.key==="F1"&&screen==="home"){event.preventDefault();setScreen("cashier");}
  };
  window.addEventListener("keydown",onKey);
  return ()=>window.removeEventListener("keydown",onKey);
 },[screen]);

 return <div className="v57-app" dir="rtl" data-local-v36-pilot="true"
   data-v57-home="true" data-offline-only="true">
   <div className="market-banner">سوپەرمارکێتی کانی چنار</div>
   <div className="v57-desktop">
     <header className="v57-header v57-strip-header">
       <nav className="system-nav" aria-label="بەشەکانی سیستەم" data-v57-navigation="true">
         <button type="button" className={screen==="home"?"active":""}
          aria-current={screen==="home"?"page":undefined}
          onClick={returnHome}>سەرەتا</button>
         {MODULE_SPECS.map(module=>{
           const enabled=module.submodules.some(sub=>allowed(module.id,sub.iconName));
           const isCashier=module.id===0&&screen==="cashier";
           return <button type="button" key={module.id}
             className={isCashier?"active":""}
             data-module-id={module.id}
             disabled={!enabled} aria-disabled={!enabled}
             aria-current={isCashier?"page":undefined}
             onClick={()=>{if(enabled)setScreen("cashier");}}>
             {module.title}
           </button>;
         })}
       </nav>
     </header>
     <main className="v57-content" id="v57-main">
       {screen==="cashier"?
         <div data-v57-screen="cashier"><LocalCashierV32/></div>:
         <div className="v57-home v57-home-empty" data-v57-screen="home"/>}
     </main>
   </div>
 </div>;
};
