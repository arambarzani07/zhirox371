import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Two disjoint entrypoints. The V36 bundle is an *isolated trial* and never
// mounts AppProvider, browser-local finance, demo products or fake receipts.
// Normal preview continues unchanged; official builds remain blocked by Vite.
const root=ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
if(import.meta.env.PROD&&import.meta.env.VITE_V36_ISOLATED_LAN_PILOT==="true"){
  if(import.meta.env.VITE_V57_ISOLATED_DESKTOP_SHELL==="true"){
    import('./components/OfflineDesktopShellV57').then(({OfflineDesktopShellV57})=>{
      root.render(<React.StrictMode><OfflineDesktopShellV57/></React.StrictMode>);
    }).catch(()=>{
      root.render(<div role="alert" dir="rtl">ژینگەی تاقیکردنەوەی ئۆفلاین بەردەست نییە؛ فرۆشتن ڕاگیرا.</div>);
    });
  }else{
  import('./components/LocalCashierV32').then(({LocalCashierV32})=>{
    root.render(<React.StrictMode>
      <div className="market-banner">سوپەرمارکێتی کانی چنار</div>
      <main className="viewport" dir="rtl" data-local-v36-pilot="true">
        <LocalCashierV32/>
      </main>
    </React.StrictMode>);
  }).catch(()=>{
    root.render(<div role="alert" dir="rtl">ژینگەی تاقیکردنەوەی ناوخۆیی بەردەست نییە؛ فرۆشتن ڕاگیرا.</div>);
  });
  }
}else{
  Promise.all([import('./App'),import('./context/AppContext')])
    .then(([{App},{AppProvider}])=>{
      root.render(<React.StrictMode><AppProvider><App/></AppProvider></React.StrictMode>);
    }).catch(()=>{
      root.render(<div role="alert" dir="rtl">ڕووکاری Demo بارنەبوو.</div>);
    });
}
