import React from 'react';
import {useApp} from '../context/AppContext';
import {NavView} from '../types';

// Shared across every React module. Visual-only navigation; no financial state
// writes, role changes or hidden cloud dependencies.
const links: {label:string;view:NavView;subtab?:string}[]=[
 {label:'کاشێر',view:'pos'},
 {label:'کاڵاکان',view:'products',subtab:'list'},
 {label:'کۆگا',view:'stock',subtab:'overview'},
 {label:'کڕیاران',view:'customers',subtab:'list'},
 {label:'دابینکەران',view:'suppliers',subtab:'list'},
 {label:'دارایی',view:'finance'},
 {label:'ڕاپۆرت',view:'reports'},
 {label:'لیبڵ',view:'labels'},
 {label:'ڕێکخستن',view:'qa'}
];
export const Header:React.FC=()=>{
 const {currentView,navigateTo,cart}=useApp();
 const selected=(view:NavView)=>view===currentView ||
    (view==='finance'&&currentView==='shifts') ||
    (view==='qa'&&['settings','audit','offers'].includes(currentView));
 return <header className="system-header">
   <button type="button" className="brand" onClick={()=>navigateTo('home')}
     aria-label="سەرەتا" title="سەرەتا"><i aria-hidden="true">◈</i><span>ZHIROX</span></button>
   <nav className="system-nav" aria-label="بەشەکانی سیستەم">
    {links.map(link=><button type="button" key={link.view}
       className={`ws-link ${selected(link.view)?'active':''}`}
       aria-current={selected(link.view)?'page':undefined}
       onClick={()=>navigateTo(link.view,link.subtab)}>
       {link.label}
       {link.view==='pos'&&cart.length>0&&<span className="system-counter">{cart.length}</span>}
     </button>)}
   </nav>
   <button type="button" className="home" onClick={()=>navigateTo('home')}
    title="سەرەتا" aria-label="سەرەتا">⌂</button>
 </header>;
};
