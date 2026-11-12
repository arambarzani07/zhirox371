import {useState} from 'react';
import {useApp} from '../context/AppContext';
import {readPurchaseDraft047,getPurchaseUnits047} from '../utils/purchaseRequest047';
import {CanvaStockFrame,CanvaStockTable} from './CanvaStockFrame';
import {money} from '../utils/retailHelpers';

const requestKey='zhirox371_canva047_demo_purchase_draft_session';
const priceKey='zhirox371_canva048_demo_order_prices_session';
function loadPrices():Record<string,string>{
 try{const d=JSON.parse(sessionStorage.getItem(priceKey)||'{}');return d&&typeof d==='object'&&!Array.isArray(d)&&Object.values(d).every(v=>typeof v==='string')?d:{};}catch{return {};}
}
export function CanvaPurchaseOrder048(){
 const {products,suppliers,navigateTo}=useApp();
 const [lines]=useState(()=>{try{return readPurchaseDraft047(sessionStorage.getItem(requestKey),products,suppliers);}catch{return [];}});
 const [supplierId,setSupplierId]=useState(lines[0]?.supplierId||'');
 const [prices,setPrices]=useState(loadPrices);
 const [query,setQuery]=useState('');const [notice,setNotice]=useState('');
 const rows=lines.filter(l=>l.supplierId===supplierId).map(line=>{
  const product=products.find(p=>p.id===line.productId);
  const catalogCost=line.unit==='carton'?product?.carton?.purchase_price_iqd:
   line.unit==='bundle'||line.unit==='set'?product?.extra_packs?.find(p=>p.kind===line.unit)?.purchase_price_iqd:product?.unit_purchase_price_iqd;
  const raw=prices[line.key]??(catalogCost==null?'':String(catalogCost));
  const cost=Number(raw);const valid=/^\d+$/.test(raw)&&Number.isSafeInteger(cost)&&cost>0;
  const total=valid?Math.round(line.quantity*cost):null;
  return {line,raw,total,valid:valid&&Number.isSafeInteger(total)};
 });
 const total=rows.reduce((sum,r)=>sum+(r.total??0),0);
 const valid=rows.length>0&&rows.every(r=>r.valid)&&Number.isSafeInteger(total);
 const visible=rows.filter(r=>!query.trim()||[r.line.productName,r.line.barcode].some(x=>x.toLowerCase().includes(query.trim().toLowerCase())));
 const save=()=>{if(!valid)return;try{sessionStorage.setItem(priceKey,JSON.stringify({...prices,...Object.fromEntries(rows.map(r=>[r.line.key,r.raw]))}));setNotice('نرخەکانی ڕەشنووس لەم تابە پاشەکەوت کران');}catch{setNotice('پاشەکەوتکردن سەرکەوتوو نەبوو');}};
 return <div className="ws-stack stock-036-shell"><CanvaStockFrame number="048" category="کڕین و دابینکەران" title="فەرمانی کڕین" listTitle="ئامادەکردنی فەرمان بۆ دابینکەر" summaryTitle="پوختەی فەرمانی کڕین" onHome={()=>navigateTo('home')}
 filters={<div className="stock-workflow-filters"><div className="stock-036-filters purchase-order-fields"><label>دابینکەر<select value={supplierId} onChange={e=>{setSupplierId(e.target.value);setNotice('');}}><option value="">هەڵبژاردنی دابینکەر</option>{suppliers.filter(s=>lines.some(l=>l.supplierId===s.id)).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>ناسنامەی فەرمان<input readOnly value="" placeholder="هێشتا پەسەند نەکراوە" /></label></div><label>کاڵاکانی فەرمان<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="بارکۆد یان ناوی کاڵا" /></label></div>}
 summary={<dl><div><dt>کۆی فەرمان</dt><dd><bdi>{valid?money(total):'—'}</bdi></dd></div><div><dt>ژمارەی ڕیزەکان</dt><dd>{rows.length}</dd></div><div><dt>دۆخی فەرمان</dt><dd>ڕەشنووس</dd></div></dl>}
 actions={<><button className="stock-036-primary" disabled>ناردن بۆ پەسەندکردن</button><button className="stock-workflow-link" onClick={()=>navigateTo('suppliers','purchase-approvals','purchase-order')}>پشکنینی داواکارییەکانی کڕین</button><button disabled={!valid} onClick={save}>پاشەکەوتکردن</button><button className="stock-workflow-link" onClick={()=>navigateTo('suppliers','receiving-preview','purchase-order')}>پێداچوونەوەی وەرگرتن — ڕەشنووس</button><button className="stock-workflow-link" onClick={()=>navigateTo('suppliers','orders','purchase-order')}>گەڕانەوە بۆ داواکاری</button></>}
 note={<span role="status">{notice||'ڕەشنووسە؛ ناردن و ناسنامەی فەرمانی پەسەندکراو هێشتا بەردەست نین.'}</span>}>
 <CanvaStockTable columns={['ناوی کاڵا','یەکە','بڕ','نرخی یەکە','نرخی کۆ']}>
 {visible.map(({line,raw,total,valid})=><tr key={line.key}><td>{line.productName}</td><td>{getPurchaseUnits047(products.find(p=>p.id===line.productId)||null).find(u=>u.value===line.unit)?.label}</td><td><bdi>{line.quantity}</bdi></td><td><input className="stock-count-input" dir="ltr" inputMode="numeric" aria-label={`نرخی کڕین: ${line.productName}`} aria-invalid={!valid} value={raw} onChange={e=>{setPrices(p=>({...p,[line.key]:e.target.value}));setNotice('');}} /></td><td><bdi>{valid&&total!==null?money(total):'—'}</bdi></td></tr>)}
 {!visible.length&&<tr><td colSpan={5}>{query?'هیچ کاڵایەک نەدۆزرایەوە':'سەرەتا ڕەشنووسی داواکاریی کڕین پاشەکەوت بکە'}</td></tr>}
 </CanvaStockTable></CanvaStockFrame></div>;
}
