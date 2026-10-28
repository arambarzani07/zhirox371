"use strict";
(()=>{
 const groups=[
  ['cash','کاشێر و فرۆشتن','./operations.html?view=cash'],
  ['products','کاڵاکان','./workspace.html?view=list'],
  ['stock','کۆگا','./operations.html?view=stock'],
  ['customers','کڕیاران و حسابەکان','./operations.html?view=customers'],
  ['suppliers','کڕین و دابینکەران','./operations.html?view=suppliers'],
  ['finance','دارایی','./operations.html?view=finance'],
  ['reports','ڕاپۆرت و شیکاری','./operations.html?view=reports'],
  ['staff','ڕێکخستنەکان','./operations.html?view=staff'],
  ['offers','ئافەر و داشکاندن','./operations.html?view=offers'],
  ['labels','لیبڵ و چاپکردن','./workspace.html?view=prices&section=labels'],
  ['shift','شێفت و کارمەندان','./operations.html?view=shift'],
  ['audit','چاودێری و مۆڵەتەکان','./operations.html?view=audit']
 ];
 const children=[['فرۆشتنی نوێ','پسووڵەکان','پارەدان','گەڕاندنەوە'],['کاڵای نوێ','لیستی کاڵاکان','نرخەکان','بارکۆدەکان'],['دۆخی کۆگا','کاڵای کەم','بەسەرچوون','هاتووچۆ'],['کڕیاران','قەرزەکان','مێژووی کڕین','پارەدانەکان'],['داواکاری','دابینکەران','وەرگرتنی کاڵا','حسابەکان'],['سندووق','داهات','خەرجی','جووڵەی پارە'],['فرۆشتن','قازانج','ڕاپۆرتی کۆگا','شیکاریی زیرەک'],['بەکارهێنەران','دەسەڵاتەکان','ئامێرەکان','سیستەم'],['ئافەری نوێ','داشکاندن','کوپۆن','کەمپەین'],['لیبڵی نرخ','بارکۆد','چاپی کۆمەڵەیی','قاڵبی چاپ'],['شێفتەکان','ئامادەبوون','کاتی کار','هەڵسەنگاندن'],['ئاگادارییەکان','داوای مۆڵەت','گۆڕانکارییەکان','پشکنینی مامەڵە']];
 const param=new URLSearchParams(location.search),main=document.querySelector('main');
 const icons=window.RetailCardIcons;
 const action=(text,href)=>{const a=document.createElement('a');a.textContent=text;a.href=href;return a;};
 // Home visuals stay untouched. Route previously empty destinations into the same shell.
 if(main?.id==='app'){
  main.addEventListener('click',e=>{
   const sub=e.target.closest('[data-sub]'),selected=main.querySelector('[data-module][aria-expanded="true"]');
   if(!sub||!selected)return;
   const m=Number(selected.dataset.module),s=Number(sub.dataset.sub);let url=null;
   if(m===9&&s===0)url='./workspace.html?view=prices&section=labels';
   if(m===9&&s===1)url='./workspace.html?view=barcodes&section=labels';
   if((m===9&&s===2)||(m===10&&s>0)||(m===11&&s<2))url='./modules.html?group='+m+'&sub='+s;
   if(url){e.preventDefault();e.stopImmediatePropagation();window.location.assign(url);}
  },true);return;
 }
 if(!main)return;
 document.body.classList.add('system-ui');
 let nav=document.getElementById('tabs');const operations=!!nav;
 const originals=operations?new Map([...nav.querySelectorAll('[data-tab]')].map(b=>[b.dataset.tab,b])):new Map();
 const cashier=document.createElement('nav');cashier.className='system-cash-subtabs';cashier.setAttribute('aria-label','بەشەکانی کاشێر');
 if(operations){
  const sale=document.createElement('button');sale.type='button';sale.textContent='فرۆشتنی نوێ';sale.dataset.shellCash='';sale.onclick=()=>originals.get('cash').click();cashier.append(sale);
  for(const key of ['receipts','payments','returns'])cashier.append(originals.get(key));
  nav.replaceChildren();nav.after(cashier);
 }else{nav=document.createElement('nav');const title=main.querySelector('h1');if(title)title.after(nav);else main.prepend(nav);}
 nav.classList.add('system-nav');nav.setAttribute('aria-label','بەشە سەرەکییەکان');
 for(const [i,[key,label,url]] of groups.entries()){
  const b=originals.get(key)||action(label,url);b.dataset.systemGroup=key;
  b.replaceChildren();if(icons){const span=document.createElement('span');span.className='system-nav-icon';span.innerHTML=icons.svg(icons.main[i]);b.append(span);}const text=document.createElement('span');text.textContent=label;b.append(text);nav.append(b);
 }
 // Existing header links remain in the DOM for compatibility; the unified nav replaces them visually.
 document.querySelectorAll('header .ws-link').forEach(x=>x.classList.add('system-old-link'));
 const heading=main.querySelector('h1');
 function select(key){
  const group=['receipts','payments','returns'].includes(key)?'cash':key;
  for(const b of nav.children){const active=b.dataset.systemGroup===group;b.classList.toggle('system-current',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  if(operations){cashier.hidden=group!=='cash';for(const b of cashier.children)b.classList.toggle('active',b.dataset.tab===key||(key==='cash'&&b.hasAttribute('data-shell-cash')));}
  const g=groups.find(x=>x[0]===group);if(heading&&g)heading.textContent=g[1];
  for(const h of main.querySelectorAll('section:not([hidden]) > h2'))h.classList.toggle('system-repeat-heading',!!heading&&h.textContent.trim()===heading.textContent.trim());
 }
 window.RetailSystemShell=Object.freeze({select,groups,children});
 if(operations)select('cash');else if(document.getElementById('products-panel'))select(param.get('section')==='labels'?'labels':'products');else select(document.title.includes('ئامێر')?'staff':'audit');
 // Shared behavior and status presentation across every form, without changing data operations.
 for(const el of main.querySelectorAll('input[type=number]'))el.inputMode=el.step?.includes('.')?'decimal':'numeric';
 document.addEventListener('click',e=>{if(e.target.closest('button[type="submit"],.primary'))document.querySelectorAll('.msg:not(:empty),.message:not(:empty)').forEach(x=>x.setAttribute('role','status'));});
 if(document.getElementById('module-detail')){
  const m=Number(param.get('group')),s=Number(param.get('sub'));const valid=Number.isInteger(m)&&Number.isInteger(s)&&groups[m]&&children[m]?.[s];
  const detail=document.getElementById('module-detail');
  if(valid){select(groups[m][0]);document.getElementById('module-title').textContent=children[m][s];
   detail.textContent='ئەم بەشە هێشتا جێبەجێ نەکراوە.';
   const next=document.getElementById('module-next');next.append(action(m===9?'پشکنین و چاپی لیبڵ':m===10?'شێفتەکان':'تۆماری گۆڕانکارییەکان',m===9?'./workspace.html?view=prices&section=labels':m===10?'./operations.html?view=shift':'./operations.html?view=audit'));
  }else{document.getElementById('module-title').textContent='بەش نەدۆزرایەوە';detail.textContent='بگەڕێوە بۆ سەرەتا.';}
 }
})();
