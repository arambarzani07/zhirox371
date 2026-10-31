import React,{useState} from 'react';
import {useApp} from '../context/AppContext';
import {MODULE_SPECS,CardIcon} from './CardIcon';
import {NavView} from '../types';

// Home shares the same compact visual language as cashier and all other
// modules. Module specifications are still data, not an immutable design lock.
export const HomeScreen:React.FC=()=>{
 const {navigateTo}=useApp();
 const [open,setOpen]=useState(-1);
 const columnCount=4; // Presentational choice, editable at any time.
 return <div className="home-screen" dir="rtl">
   <h1>بەشە سەرەکییەکان</h1>
   <div className="system-module-rows">
    {Array.from({length:Math.ceil(MODULE_SPECS.length/columnCount)},(_,rowIndex)=>{
      const start=rowIndex*columnCount;
      const group=MODULE_SPECS.slice(start,start+columnCount);
      const expanded=open>=start&&open<start+columnCount;
      const selected=expanded?MODULE_SPECS[open]:undefined;
      return <div className="row" key={rowIndex}>
        {group.map((mod,offset)=>{
          const index=start+offset;
          return <button className="module" data-module={index} type="button" key={mod.id}
             style={{'--color':mod.color,'--light':mod.lightBg} as React.CSSProperties}
             aria-expanded={open===index} onClick={()=>setOpen(v=>v===index?-1:index)}>
            <span className="icon" style={{color:mod.color,background:mod.lightBg}}>
              <CardIcon id={mod.iconName} size={27}/>
            </span>
            <span className="end">
              <span className="name">{mod.title}</span>
              <span className="chev" aria-hidden="true">⌄</span>
            </span>
          </button>;
        })}
        {selected&&<div className="drawer" role="region" aria-label={selected.title}
          style={{'--color':selected.color,'--light':selected.lightBg} as React.CSSProperties}>
          <div className="drawerhead">
            <strong>{selected.title}</strong>
            <button className="close" aria-label="داخستن" title="داخستن" type="button"
             onClick={()=>setOpen(-1)}>✕</button>
          </div>
          <div className="subgrid">
            {selected.submodules.map((sub,i)=><button className="sub" type="button" key={sub.iconName+i}
             onClick={()=>navigateTo(sub.targetView as NavView,sub.targetSubtab)}>
              <span className="sub-icon" style={{color:selected.color,background:selected.lightBg}}>
                <CardIcon id={sub.iconName} size={21}/>
              </span>
              <span className="sub-footer"><span className="sub-name">{sub.label}</span></span>
            </button>)}
          </div>
        </div>}
      </div>;
    })}
   </div>
 </div>;
};
