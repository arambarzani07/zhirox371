import React,{useEffect,useState} from "react";
import {useApp} from "../context/AppContext";
import {MODULE_SPECS} from "./CardIcon";
import {NavView} from "../types";

// Full-screen PC navigation: main modules on the first horizontal line,
// their four submodules on the second horizontal line. No cards or sidebars.
// Navigation changes presentation only; cashier roles and data paths stay intact.
export const Header:React.FC<{localPilot?:boolean}>=({localPilot=false})=>{
 const {currentView,subtab,activeSectionId,navigateTo,cart}=useApp();
 const [moduleId,setModuleId]=useState<number|null>(null);
 const [pickedSub,setPickedSub]=useState<string|null>(null);

 useEffect(()=>{
   if(currentView==="home"){setModuleId(null);setPickedSub(null);return;}
   const explicit=activeSectionId && MODULE_SPECS.find(m=>m.submodules.some(s=>s.iconName===activeSectionId));
   if(explicit){
     setModuleId(explicit.id);
     setPickedSub(activeSectionId);
     return;
   }
   const current=MODULE_SPECS.find(m=>m.id===moduleId);
   const matching=current?.submodules.find(s=>s.targetView===currentView&&s.targetSubtab===subtab);
   const module=matching?current:MODULE_SPECS.find(m=>m.submodules.some(s=>s.targetView===currentView&&s.targetSubtab===subtab))
     ??(current?.submodules.some(s=>s.targetView===currentView)?current:MODULE_SPECS.find(m=>m.submodules.some(s=>s.targetView===currentView)));
   if(!module)return;
   setModuleId(module.id);
   const chosen=module.submodules.find(s=>s.targetView===currentView&&s.targetSubtab===subtab)
     ??module.submodules.find(s=>s.targetView===currentView);
   if(chosen)setPickedSub(chosen.iconName);
 },[currentView,subtab,activeSectionId]);

 const chosen=MODULE_SPECS.find(m=>m.id===moduleId);
 const selectMain=(id:number)=>{
   const module=MODULE_SPECS.find(m=>m.id===id);
   if(!module)return;
   setModuleId(id);
   const first=module.submodules[0];
   setPickedSub(localPilot&&id!==0?null:first.iconName);
   // In the isolated PG trial, disconnected modules are browse-only;
   // selecting a module never enables its blocked subroutes.
   if(!localPilot||id===0)navigateTo(first.targetView as NavView,first.targetSubtab,first.iconName);
 };
 const selectSub=(sub:typeof MODULE_SPECS[number]["submodules"][number])=>{
   if(!chosen)return;
   const enabled=!localPilot||(chosen.id===0&&(sub.iconName==="barcode-scan"||sub.iconName==="receipt"));
   if(!enabled)return;
   setPickedSub(sub.iconName);
   navigateTo(sub.targetView as NavView,sub.targetSubtab,sub.iconName);
 };
 return <header className={`system-header system-strip-only system-double-strip ${chosen?"has-subnav":""} ${localPilot?"system-local-only":""}`}>
   <nav className="system-nav system-primary-nav" aria-label="بەشە سەرەکییەکان">
     <button type="button" className={`ws-link ${currentView==="home"&&moduleId===null?"active":""}`}
       aria-current={currentView==="home"&&moduleId===null?"page":undefined}
       onClick={()=>{setModuleId(null);setPickedSub(null);navigateTo("home");}}>سەرەتا</button>
     {MODULE_SPECS.map(module=><button type="button" key={module.id}
       data-module-id={module.id}
       className={`ws-link ${moduleId===module.id?"active":""}`}
       aria-current={moduleId===module.id?"true":undefined}
       aria-expanded={moduleId===module.id}
       onClick={()=>selectMain(module.id)}>
       {module.title}
       {module.id===0&&cart.length>0&&<span className="system-counter">{cart.length}</span>}
     </button>)}
   </nav>
   <nav className="system-subnav" aria-label="ژێربەشەکان" data-subnav="horizontal">
     {chosen?.submodules.map(sub=>{
       const enabled=!localPilot||(chosen.id===0&&(sub.iconName==="barcode-scan"||sub.iconName==="receipt"));
       const selected=pickedSub===sub.iconName;
       return <button type="button" key={sub.iconName}
         data-sub-icon={sub.iconName}
         className={`system-subnav-link ${selected?"selected":""}`}
         aria-current={selected?"page":undefined}
         disabled={!enabled} aria-disabled={!enabled}
         onClick={()=>selectSub(sub)}>{sub.label}{selected&&<span className="system-subnav-check" aria-hidden="true">✓</span>}</button>;
     })}
   </nav>
 </header>;
};
