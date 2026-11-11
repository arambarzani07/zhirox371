import {useMemo,useState} from 'react';
import {useApp} from '../context/AppContext';
import {readPurchaseDraft047,getPurchaseUnits047,findPurchaseProducts047} from '../utils/purchaseRequest047';
import {
 emptyReceivingDraft049,loadReceivingDraft049,receivingSourceSignature049,
 receivingDifference049,checkedReceivingRows049,
 type ReceivingRow049
} from '../utils/receivingPreview049';
import {CanvaStockFrame,CanvaStockTable} from './CanvaStockFrame';
import './canvaReceiving049.css';

const requestKey='zhirox371_canva047_demo_purchase_draft_session';
const receivingKey='zhirox371_canva049_demo_receiving_review_session';
const fmt=(n:number|null)=>n===null?'—':n.toLocaleString('en-US',{maximumFractionDigits:3});

export function CanvaPurchaseReceiving049(){
 const {products,suppliers,navigateTo}=useApp();
 // Read saved tab-local 047 requisition, NOT an official or approved purchase order.
 const [lines]=useState(()=>{
  try{return readPurchaseDraft047(sessionStorage.getItem(requestKey),products,suppliers);}
  catch{return [];}
 });
 const [draft,setDraft]=useState(()=>{
  try{return loadReceivingDraft049(sessionStorage.getItem(receivingKey),lines,products);}
  catch{return emptyReceivingDraft049(lines);}
 });
 const [supplierId,setSupplierId]=useState(draft.supplierId||lines[0]?.supplierId||'');
 const [search,setSearch]=useState('');
 const [selectedKey,setSelectedKey]=useState<string|null>(null);
 const [notice,setNotice]=useState('');
 const supplierIds=useMemo(()=>[...new Set(lines.map(l=>l.supplierId))],[lines]);
 const activeLines=lines.filter(line=>line.supplierId===supplierId);
 const selected=activeLines.find(l=>l.key===selectedKey)||null;
 const searchedProducts=useMemo(()=>search.trim()?new Set(
  findPurchaseProducts047(products,search).map(p=>p.id)):new Set<string>(),
  [products,search]);
 const visible=activeLines.filter(line=>!search.trim()||
  searchedProducts.has(line.productId)||
  [line.productName,line.barcode].some(v=>v.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
 const summary=checkedReceivingRows049(activeLines,products,draft.rows);
 const canSave=activeLines.length>0&&summary.checked>0&&!summary.invalid
  &&draft.invoice.length<=64;
 const changeRow=(key:string,patch:Partial<ReceivingRow049>)=>{
  setDraft(prev=>({...prev,rows:{...prev.rows,[key]:{
   quantity:prev.rows[key]?.quantity||'',expiry:prev.rows[key]?.expiry||'',...patch
  }}}));
  setNotice('');
 };
 const save=()=>{
  if(!canSave)return;
  // Re-read the current 047 browser-tab draft: a stale order must not
  // be associated with a different saved requisition.
  let latest;
  try{latest=readPurchaseDraft047(sessionStorage.getItem(requestKey),products,suppliers);}
  catch{setNotice('ڕەشنووسی داواکاری بەردەست نییە');return;}
  if(receivingSourceSignature049(latest)!==draft.sourceSignature){
   setNotice('ڕەشنووسی داواکاری گۆڕاوە؛ پێداچوونەوەکە پاشەکەوت نەکرا');
   return;
  }
  const current=loadReceivingDraft049(JSON.stringify({
    ...draft,supplierId,rows:draft.rows
  }),lines,products);
  if(current.sourceSignature!==draft.sourceSignature||
    (Object.keys(draft.rows).length>0&&Object.keys(current.rows).length!==Object.keys(draft.rows).length)){
    setNotice('ڕەشنووسەکە لەگەڵ کاڵاکان هاوتا نییە؛ پاشەکەوت نەکرا');
    return;
  }
  try{
   sessionStorage.setItem(receivingKey,JSON.stringify(current));
   setNotice('تەنها ڕەشنووسی پێداچوونەوە لەم تابە پاشەکەوت کرا؛ کۆگا نەگۆڕاوە.');
  }catch{setNotice('پاشەکەوتکردنی ڕەشنووسی ناوخۆیی سەرکەوتوو نەبوو');}
 };
 return <div className="ws-stack stock-036-shell receiving049-shell" data-demo-only="true">
  <CanvaStockFrame number="049" category="کڕین و دابینکەران"
   title="وەرگرتنی کڕین لە دابینکەر"
   listTitle="هاوتاکردنەوەی کاڵا و فەرمانی کڕین"
   summaryTitle="پوختەی وەرگرتن" onHome={()=>navigateTo('home')}
   filters={<div className="stock-workflow-filters receiving049-filters">
    <div className="stock-036-filters">
     <label>ژمارەی فەرمان
      <input value="" readOnly aria-label="ناسنامەی فەرمانی کڕین"
       placeholder="ناسنامەی فەرمانی کڕین — پشتڕاست نەکراوە"/>
     </label>
     <label>پسووڵەی دابینکەر
      <input aria-label="ژمارەی پسووڵەی دابینکەر"
       value={draft.invoice} maxLength={64} autoComplete="off"
       onChange={event=>{setDraft(d=>({...d,invoice:event.target.value}));setNotice('');}}
       placeholder="ژمارەی پسووڵەی دابینکەر"/>
     </label>
    </div>
    {supplierIds.length>0&&<label>دابینکەر — ڕەشنووسی Demo
     <select aria-label="دابینکەری ڕەشنووس" value={supplierId}
      onChange={e=>{setSupplierId(e.target.value);setSelectedKey(null);setSearch('');setNotice('');}}>
      {supplierIds.map(id=><option value={id} key={id}>
       {suppliers.find(s=>s.id===id)?.name||'—'}
      </option>)}
     </select>
    </label>}
    <div className="stock-036-filters">
     <label>سکانکردن
      <input type="search" autoComplete="off"
       aria-label="سکانکردنی کاڵا" placeholder="بارکۆد یان ناوی کاڵا"
       value={search} onChange={e=>setSearch(e.target.value)}/>
     </label>
     <label>بەروار
      <input type="date" aria-label="بەرواری بەسەرچوون" disabled={!selected}
       value={selected?draft.rows[selected.key]?.expiry||'':''}
       onChange={e=>{if(selected)changeRow(selected.key,{expiry:e.target.value});}}/>
     </label>
    </div>
    <p className="receiving049-disconnected" role="status">
     فەرمانی کڕینی پەسەندکراو و ناسنامەی وەرگرتنی پشتڕاستکراو بەردەست نین؛
     خشتەکە تەنها ڕەشنووسی 047 ـە، نەک وەرگرتنی فەرمی.
    </p>
   </div>}
   summary={<dl>
    <div><dt>ڕیزی وەرگیراو</dt><dd>{summary.received}</dd></div>
    <div><dt>بڕی پشکنراو</dt><dd>{summary.checked} ڕیز</dd></div>
    <div><dt>دۆخی وەرگرتن</dt><dd>پێداچوونەوە — Demo</dd></div>
   </dl>}
   actions={<>
    <button type="button" className="stock-036-primary" disabled
     title="وەرگرتن تەنها دوای ناسنامەی فەرمانی پەسەندکراو و دەسەڵاتی سێرڤەر ئەنجام دەدرێت">
     پشتڕاستکردنەوەی وەرگرتن
    </button>
    <button type="button" disabled={!canSave} onClick={save}>پاشەکەوتکردنی ڕەشنووس</button>
    <button type="button" className="stock-workflow-link"
     onClick={()=>navigateTo('suppliers','order','purchase-order')}>گەڕانەوە بۆ فەرمانی کڕین</button>
   </>}
   note={<span className="receiving049-note">
    <span>هەموو بڕێک لە یەکەی بنەڕەتدا پشکنین دەکرێت.</span>
    <span>دووبارەکردنەوەی ناسنامەی وەرگرتن نابێت کۆگا دووبارە زیاد بکات.</span>
    <span role="status">{notice||'ئەمە تەنها پێشبینینی ڕەشنووسە؛ هیچ وەرگرتنێکی ڕاستەقینە تۆمار نەکراوە.'}</span>
   </span>}>
   <CanvaStockTable columns={['کاڵا','یەکە','داواکراو','وەرگیراو','جیاوازی']}>
    {visible.length?visible.map(line=>{
     const product=products.find(p=>p.id===line.productId);
     const compare=receivingDifference049(line,product,draft.rows[line.key]?.quantity||'');
     const label=getPurchaseUnits047(product||null).find(x=>x.value===line.unit)?.label||'—';
     const baseLabel=product?.base_unit==='kg'?'کیلۆ':'دانە';
     return <tr key={line.key} data-receiving049-row={line.key}
      className={selectedKey===line.key?'receiving049-selected':undefined}>
      <td><button className="receiving049-select" type="button"
       aria-pressed={selectedKey===line.key}
       onClick={()=>setSelectedKey(line.key)}>{line.productName}</button></td>
      <td>{label}</td>
      <td><bdi>{fmt(line.quantity)}</bdi></td>
      <td><input type="text" inputMode={line.unit==='kg'?'decimal':'numeric'}
       aria-label={'بڕی وەرگیراو: '+line.productName} dir="ltr"
       value={draft.rows[line.key]?.quantity||''}
       aria-invalid={compare.state==='invalid'}
       onFocus={()=>setSelectedKey(line.key)}
       onChange={e=>changeRow(line.key,{quantity:e.target.value})}
       placeholder="—"/></td>
      <td data-receiving049-difference={compare.state}>
       {compare.missingBase===null?'—':
        (compare.missingBase>0?'+':'')+fmt(compare.missingBase)+' '+baseLabel}
      </td>
     </tr>;
    }):Array.from({length:3},(_,i)=><tr data-receiving049-placeholder="true"
      aria-hidden="true" key={i}>
      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
     </tr>)}
   </CanvaStockTable>
  </CanvaStockFrame>
 </div>;
}
