import React,{useEffect,useState} from "react";
import {MODULE_SPECS,CardIcon} from "./CardIcon";
import {LocalCashierV32} from "./LocalCashierV32";
import "../offlineDesktopShellV57.css";

// V57 ISOLATED PRE-INSTALLATION SHELL.
// Copy the approved Home geometry (12 modules / 48 submodules) without
// importing AppProvider, Demo cashier, Demo receipt or any cloud service.
// The original locked Home files and React HomeScreen stay UNMODIFIED.
// In this stage the only enabled functionality is the V36 isolated local cashier.
// All other routes fail closed rather than opening fake/demo finance screens.
export const V57_APPROVED_MODULE_COUNT=12;
export const V57_APPROVED_SUBMODULE_COUNT=48;
const allowed=(module:number,sub:number)=>module===0&&(sub===0||sub===1);

if(MODULE_SPECS.length!==V57_APPROVED_MODULE_COUNT||
   MODULE_SPECS.some(m=>m.submodules.length!==4)||
   MODULE_SPECS.reduce((total,m)=>total+m.submodules.length,0)!==V57_APPROVED_SUBMODULE_COUNT)
 throw Error("v57_locked_home_structure_mismatch");

export const OfflineDesktopShellV57:React.FC=()=>{
 const [screen,setScreen]=useState<"home"|"cashier">("home");
 const [open,setOpen]=useState(-1);
 useEffect(()=>{
   const onKey=(e:KeyboardEvent)=>{
     if(e.key==="Escape"){
       if(screen!=="home"){e.preventDefault();setScreen("home");setOpen(-1);}
       else if(open!==-1){e.preventDefault();setOpen(-1);}
     }else if(e.key==="F1"&&screen==="home"){
       e.preventDefault();setOpen(-1);setScreen("cashier");
     }
   };
   window.addEventListener("keydown",onKey);
   return ()=>window.removeEventListener("keydown",onKey);
 },[screen,open]);
 const returnHome=()=>{setScreen("home");setOpen(-1);};
 return (
  <div className="v57-app" dir="rtl" data-local-v36-pilot="true"
       data-v57-locked-home="true" data-offline-only="true">
   <div className="market-banner">سوپەرمارکێتی کانی چنار</div>
   <div className="v57-desktop">
     <header className="v57-header">
       <strong>سیستەمی کاشێر</strong>
       <button type="button" onClick={returnHome} aria-label="سەرەتا">⌂ سەرەتا</button>
     </header>
     <main className="v57-content" id="v57-main">
      {screen==="cashier"?
       <div data-v57-screen="cashier">
        <LocalCashierV32/>
       </div>:
       <div className="v57-home" data-v57-screen="home">
        <h1>بەشە سەرەکییەکان</h1>
        <div className="v57-module-rows">
        {[0,1,2].map(r=>(
          <div className="v57-row-block" key={r}>
            <div className="v57-row" role="group" aria-label={"ڕیزی "+(r+1)}>
            {MODULE_SPECS.slice(r*4,r*4+4).map((module,i)=>{
              const index=r*4+i,selected=index===open;
              return <button className="v57-module" type="button" key={module.id}
                  data-module={index} aria-expanded={selected}
                  aria-controls={"v57-drawer-"+index}
                  style={{"--color":module.color,"--light":module.lightBg} as React.CSSProperties}
                  onClick={()=>setOpen(prev=>prev===index?-1:index)}>
                <span className="v57-icon"><CardIcon id={module.iconName} size={29}/></span>
                <span className="v57-module-foot">
                  <span className="v57-module-name">{module.title}</span>
                  <span className="v57-chevron" aria-hidden="true">⌄</span>
                </span>
              </button>;
            })}
            </div>
            {open>=r*4&&open<(r+1)*4&&(()=>{
              const module=MODULE_SPECS[open];
              return <div id={"v57-drawer-"+open} className="v57-drawer" role="region"
                          aria-label={module.title}>
                <div className="v57-drawer-head">
                  <strong>{module.title}</strong>
                  <button type="button" className="v57-close" onClick={()=>setOpen(-1)}
                          aria-label="داخستن">✕</button>
                </div>
                <div className="v57-subgrid">
                {module.submodules.map((sub,j)=>{
                  const enabled=allowed(open,j);
                  return <button key={sub.iconName} type="button"
                     className="v57-sub" data-sub={j}
                     disabled={!enabled} aria-disabled={!enabled}
                     title={enabled?sub.label:"ئەم بەشە هێشتا بە PostgreSQL ـی ناوخۆیی پەیوەست نەکراوە"}
                     onClick={()=>{
                       if(!enabled)return;
                       setOpen(-1);setScreen("cashier");
                     }}>
                    <span className="v57-subicon"
                      style={{color:module.color,background:module.lightBg}}>
                      <CardIcon id={sub.iconName} size={23}/>
                    </span>
                    <span className="v57-subfoot">
                      <span>{sub.label}</span><span aria-hidden="true">↖</span>
                    </span>
                  </button>;
                })}
                </div>
              </div>;
            })()}
          </div>
        ))}
        </div>
       </div>
      }
     </main>
   </div>
  </div>
 );
};
