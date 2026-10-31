import React,{useEffect,useState} from "react";
import {useApp} from "../context/AppContext";
import {MODULE_SPECS,CardIcon} from "./CardIcon";
import {NavView} from "../types";

// Two visible RTL navigation columns. The top ribbon remains intact.
// Business logic, API and permissions are owned by their respective screens.
export const SystemNavigator:React.FC<{localPilot?:boolean}>=({localPilot=false})=>{
 const {currentView,subtab,navigateTo}=useApp();
 const [moduleId,setModuleId]=useState(0);
 const [pickedSub,setPickedSub]=useState<string|null>(null);

 useEffect(()=>{
   if(currentView==="home"){setPickedSub(null);return;}
   // A top-ribbon / keyboard navigation can change views independently of
   // these columns. Prefer the selected module when it contains the route;
   // otherwise choose the first module that exposes the current view.
   const chosen=MODULE_SPECS.find(m=>m.id===moduleId);
   const same=chosen?.submodules.some(s=>s.targetView===currentView);
   const match=same?chosen:MODULE_SPECS.find(m=>m.submodules.some(s=>s.targetView===currentView));
   if(!match)return;
   if(match.id!==moduleId)setModuleId(match.id);
   const sub=match.submodules.find(s=>s.targetView===currentView&&s.targetSubtab===subtab)
     ??match.submodules.find(s=>s.targetView===currentView);
   if(sub)setPickedSub(sub.iconName);
 // Changing the first-column browse selection must not bounce back to a
 // previously opened route. Sync only for actual route/subtab changes.
 },[currentView,subtab]);

 const module=MODULE_SPECS.find(m=>m.id===moduleId)??MODULE_SPECS[0];
 const changeModule=(id:number)=>{setModuleId(id);setPickedSub(null);};
 const changeSub=(sub:typeof module.submodules[number])=>{
   if(localPilot&&!(module.id===0&&(sub.iconName==="barcode-scan"||sub.iconName==="receipt")))return;
   setPickedSub(sub.iconName);
   navigateTo(sub.targetView as NavView,sub.targetSubtab);
 };
 return <>
  <aside className="system-module-column" aria-label="ستوونی یەکەم ـ بەشەکان">
   <nav className="system-module-list" aria-label="بەشە سەرەکییەکان">
    {MODULE_SPECS.map(m=><button key={m.id} type="button"
      className={`system-module-link ${m.id===module.id?"selected":""}`}
      aria-current={m.id===module.id?"true":undefined}
      data-module-id={m.id}
      onClick={()=>changeModule(m.id)}>
      <CardIcon id={m.iconName} size={19}/>
      <span>{m.title}</span>
      <span aria-hidden="true" className="system-module-arrow">‹</span>
    </button>)}
   </nav>
  </aside>
  <aside className="system-submodule-column" aria-label="ستوونی دووەم ـ ژێربەشەکان">
   <div className="system-submodule-heading">{module.title}</div>
   <nav className="system-submodule-list" aria-label="ژێربەشەکان">
    {module.submodules.map(sub=>{
      const enabled=!localPilot||(module.id===0&&(sub.iconName==="barcode-scan"||sub.iconName==="receipt"));
      const selected=pickedSub===sub.iconName&&currentView===sub.targetView;
      return <button key={sub.iconName} type="button"
       className={`system-submodule-link ${selected?"selected":""}`}
       data-sub-icon={sub.iconName}
       aria-current={selected?"page":undefined}
       disabled={!enabled} aria-disabled={!enabled}
       onClick={()=>changeSub(sub)}>
        <CardIcon id={sub.iconName} size={18}/>
        <span>{sub.label}</span>
        {selected&&<span className="system-selected-check" aria-hidden="true">✓</span>}
       </button>;
    })}
   </nav>
  </aside>
 </>;
};
