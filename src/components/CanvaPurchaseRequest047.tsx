import {useMemo,useState} from 'react';
import {useApp} from '../context/AppContext';
import {
 getPurchaseUnits047,findPurchaseProducts047,purchaseUnitByScan047,
 preparePurchaseLine047,addPurchaseDraftLine047,summarizePurchaseDraft047,
 readPurchaseDraft047,type PurchaseUnit047,type PurchaseLine047
} from '../utils/purchaseRequest047';
import './canvaPurchaseRequest047.css';

const draftKey='zhirox371_canva047_demo_purchase_draft_session';
/** Canva original 047: no purchase submission, approvals or stock writes.
 * Explicit "Save draft" persists only to THIS browser tab sessionStorage.
 */
export function CanvaPurchaseRequest047(){
 const {products,suppliers,navigateTo}=useApp();
 const [search,setSearch]=useState('');
 const [productId,setProductId]=useState('');
 const [unit,setUnit]=useState<PurchaseUnit047>('unit');
 const [quantity,setQuantity]=useState('1');
 const [supplierId,setSupplierId]=useState('');
 const [lines,setLines]=useState<PurchaseLine047[]>(()=>{
   try{return readPurchaseDraft047(sessionStorage.getItem(draftKey),products,suppliers);}
   catch{return [];}
 });
 const [notice,setNotice]=useState('');
 const selected=products.find(p=>p.id===productId)||null;
 const suggestions=useMemo(()=>search.trim()&&search!==selected?.name?
   findPurchaseProducts047(products,search):[],[products,search,selected?.name]);
 const units=getPurchaseUnits047(selected);
 const summary=summarizePurchaseDraft047(lines);
 const choose=(p:typeof products[number],scanned:string)=>{
   setProductId(p.id);setSearch(p.name);
   setUnit(purchaseUnitByScan047(p,scanned)|| (p.base_unit==='kg'?'kg':'unit'));
   setNotice('');
 };
 const add=()=>{
   const prepared=preparePurchaseLine047(products,suppliers,productId,unit,quantity,supplierId);
   if(!prepared.ok){setNotice(prepared.error);return;}
   const result=addPurchaseDraftLine047(lines,prepared.line);
   if(!result.ok){setNotice(result.error);return;}
   setLines(result.lines);
   setNotice('کاڵاکە زیاد کرا بۆ ڕەشنووسی ناوخۆیی؛ هیچ داواکارییەک نەنێردراوە.');
 };
 const save=()=>{
   if(!lines.length){setNotice('سەرەتا کاڵایەک زیاد بکە بۆ ڕەشنووس');return;}
   // Source products or suppliers may have changed since rows were first added.
   const restored=readPurchaseDraft047(JSON.stringify(lines.map(x=>({
     productId:x.productId,supplierId:x.supplierId,unit:x.unit,quantity:x.quantity
   }))),products,suppliers);
   if(restored.length!==lines.length){setNotice('زانیارییەکانی کاڵا یان دابینکەر گۆڕاون؛ ڕەشنووسەکە پاشەکەوت نەکرا');return;}
   try{
     sessionStorage.setItem(draftKey,JSON.stringify(restored.map(x=>({
       productId:x.productId,supplierId:x.supplierId,unit:x.unit,quantity:x.quantity
     }))));
     setLines(restored);
     setNotice('ڕەشنووس تەنها لەم وێبگەڕەدا پاشەکەوت کرا؛ بۆ سێرڤەر نەنێردراوە.');
   }catch{setNotice('پاشەکەوتکردنی ڕەشنووسی ناوخۆیی سەرکەوتوو نەبوو');}
 };
 return <section className="canva-purchase-047" data-canva-screen="047" data-demo-only="true" dir="rtl">
  <header className="canva-purchase-heading">
   <h1>داواکاریی کڕین</h1>
   <nav aria-label="ڕێڕەوی کڕین">
    <button type="button" onClick={()=>navigateTo('home')}>ماڵەوە</button>
    <button type="button" onClick={()=>navigateTo('suppliers','list','supplier-building')}>
      کڕین و دابینکەران
    </button>
   </nav>
  </header>
  <div className="canva-purchase-layout">
   <main className="canva-purchase-main">
    <h2>کاڵاکانی پێویست بۆ کڕین</h2>
    <label className="canva-purchase-product" htmlFor="purchase-047-search">
     هەڵبژاردنی کاڵا
     <input id="purchase-047-search" type="search" autoComplete="off"
      placeholder="ناوی کاڵا یان بارکۆد" value={search}
      onChange={e=>{setSearch(e.target.value);setProductId('');setNotice('');}}/>
    </label>
    {suggestions.length>0&&<div className="canva-purchase-suggestions" role="group" aria-label="کاڵاکانی دۆزراوە">
     {suggestions.map(p=><button key={p.id} type="button"
      onClick={()=>choose(p,search)}>{p.name} — {p.unit_barcode}</button>)}
    </div>}
    <div className="canva-purchase-fields">
     <label htmlFor="purchase-047-quantity">بڕی داواکراو
      <input id="purchase-047-quantity" value={quantity}
       type="text" inputMode="decimal" dir="ltr" onChange={e=>setQuantity(e.target.value)}/>
     </label>
     <label htmlFor="purchase-047-unit">جۆری یەکە
      <select id="purchase-047-unit" value={unit} disabled={!selected}
       onChange={e=>setUnit(e.target.value as PurchaseUnit047)}>
       {units.length?units.map(x=><option key={x.value} value={x.value}>{x.label}</option>)
        :<option value="unit">دانە</option>}
      </select>
     </label>
     <label htmlFor="purchase-047-supplier">دابینکەر
      <select id="purchase-047-supplier" value={supplierId}
       onChange={e=>setSupplierId(e.target.value)}>
       <option value="">دابینکەری پێشنیارکراو</option>
       {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
     </label>
    </div>
    <div className="canva-purchase-addline">
     <button type="button" disabled={!selected} onClick={add}>هەڵبژاردن</button>
    </div>
    <div className="canva-purchase-table-wrap" role="region" aria-label="ڕەشنووسی داواکاریی کڕین" tabIndex={0}>
     <table className="canva-purchase-table"><thead><tr>
      <th>کاڵا</th><th>بارکۆد</th><th>یەکە</th><th>بڕ</th><th>هەڵبژاردن</th>
     </tr></thead><tbody>
      {lines.length?lines.map(line=><tr key={line.key} data-purchase-line={line.key}>
       <td><strong>{line.productName}</strong><span className="canva-purchase-line-supplier">{line.supplierName}</span></td><td><bdi>{line.barcode}</bdi></td>
       <td>{getPurchaseUnits047(products.find(p=>p.id===line.productId)||null)
        .find(x=>x.value===line.unit)?.label||'—'}</td>
       <td><bdi>{line.quantity.toLocaleString('en-US',{maximumFractionDigits:3})}</bdi></td>
       <td><button type="button" className="canva-purchase-delete"
        onClick={()=>{
         setLines(prev=>prev.filter(x=>x.key!==line.key));
         setNotice('ڕیزەکە تەنها لە ڕەشنووس لابرا؛ پێویستە دووبارە پاشەکەوت بکرێت.');
        }}>لابردن</button></td>
      </tr>):Array.from({length:3},(_,i)=><tr key={i} data-purchase-placeholder="true"
       aria-hidden="true"><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>)}
     </tbody></table>
    </div>
    <p className="canva-purchase-empty">
     {lines.length?'ئەم کاڵایانە تەنها لە ڕەشنووسی داواکاریی کڕیندان':
      'هیچ کاڵایەک بۆ داواکاریی کڕین زیاد نەکراوە'}
    </p>
    <p className="canva-purchase-rule">
     بڕی داواکراو نابێت کەمتر لە سفر بێت؛ داواکاری پێش کڕین پەسەند دەکرێت.
    </p>
    <p role="status" className="canva-purchase-notice">{notice||
      'ناردنی داواکاریی کڕین تا پشتڕاستکردنەوەی مۆڵەتی سێرڤەر ناچالاکە.'}</p>
   </main>
   <aside className="canva-purchase-summary" aria-label="پوختەی داواکاری">
    <h2>پوختەی داواکاری</h2>
    <dl>
     <div><dt>ژمارەی کاڵاکان</dt><dd>{summary.itemCount}</dd></div>
     <div><dt>بڕی داواکراو</dt><dd>{summary.quantityText}</dd></div>
     <div><dt>دۆخی داواکاری</dt><dd>ڕەشنووس</dd></div>
    </dl>
    <button type="button" className="canva-purchase-submit" disabled
     title="ناردنی داواکاری پێویستی بە دەسەڵاتی پشتڕاستکراوی سێرڤەر هەیە">
     ناردن بۆ پەسەندکردن
    </button>
    <button type="button" className="canva-purchase-save" onClick={save}
     disabled={!lines.length}>پاشەکەوتکردنی ڕەشنووس</button>
   </aside>
  </div>
 </section>;
}
