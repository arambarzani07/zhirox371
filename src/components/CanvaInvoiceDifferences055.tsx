import {useState} from 'react';
import {useApp} from '../context/AppContext';
import {readPurchaseDraft047} from '../utils/purchaseRequest047';
import {loadReceivingDraft049} from '../utils/receivingPreview049';
import {
  compareInvoiceLine055,loadOrderPrices055,loadInvoiceReview055,
  reviewSignature055,summarizeInvoiceDifferences055,canPostInvoiceReview055
} from '../utils/invoiceDifferences055';
import {CanvaStockFrame,CanvaStockTable} from './CanvaStockFrame';
import './canvaInvoiceDifferences055.css';

const requestKey='zhirox371_canva047_demo_purchase_draft_session';
const priceKey='zhirox371_canva048_demo_order_prices_session';
const receivingKey='zhirox371_canva049_demo_receiving_review_session';
const reviewKey='zhirox371_canva055_demo_invoice_review_session';
const moneyOrUnknown=(amount:number|null)=>amount===null?'—':
 amount.toLocaleString('en-US')+' IQD';
const units={unit:'دانە',carton:'کارتۆن',bundle:'دەستە',set:'سێت',kg:'کیلۆ'};
const reasons=[
 {id:'',name:'هەڵبژاردنی هۆکاری جیاوازی'},
 {id:'short',name:'کەمی بڕ'},
 {id:'excess',name:'زیادی بڕ'},
 {id:'price',name:'جیاوازیی نرخ'},
 {id:'document',name:'ناتەواوی پسووڵە'}
];

/** Screen 055: source-based comparison of three separate browser DEMO drafts.
 * No authoritative PO-to-invoice link exists. Every comparison is labeled
 * provisional; never post funds, stock or a resolution to the server.
 */
export function CanvaInvoiceDifferences055(){
 const {navigateTo,products,suppliers}=useApp();
 const [lines]=useState(()=>{
  try{return readPurchaseDraft047(sessionStorage.getItem(requestKey),products,suppliers);}
  catch{return [];}
 });
 const [prices]=useState(()=>{
  try{return loadOrderPrices055(sessionStorage.getItem(priceKey),lines);}
  catch{return {};}
 });
 const [receipt]=useState(()=>{
  try{return loadReceivingDraft049(sessionStorage.getItem(receivingKey),lines,products);}
  catch{return loadReceivingDraft049(null,lines,products);}
 });
 const [review,setReview]=useState(()=>{
  try{return loadInvoiceReview055(sessionStorage.getItem(reviewKey),lines);}
  catch{return loadInvoiceReview055(null,lines);}
 });
 const [supplierId,setSupplierId]=useState(review.supplierId||receipt.supplierId||lines[0]?.supplierId||'');
 const [notice,setNotice]=useState('');
 const supplierIds=[...new Set(lines.map(l=>l.supplierId))];
 const sourceLines=lines.filter(l=>l.supplierId===supplierId);
 const rows=sourceLines.map(line=>{
  const product=products.find(p=>p.id===line.productId);
  const comparison=compareInvoiceLine055(line,product,receipt.rows[line.key]?.quantity||'',
    prices[line.key],review.prices[line.key]);
  return {line,comparison};
 });
 const totals=summarizeInvoiceDifferences055(rows.map(x=>x.comparison));
 const invoice=receipt.supplierId===supplierId?receipt.invoice:'';
 const hasData=sourceLines.length>0;
 const canSave=hasData&&
  (Object.values(review.prices).some(v=>v.trim()!=='')||review.reason!=='');
 const save=()=>{
  if(!canSave)return;
  let currentLines;
  try{currentLines=readPurchaseDraft047(sessionStorage.getItem(requestKey),products,suppliers);}
  catch{setNotice('ڕەشنووسی فەرمانەکە بەردەست نییە');return;}
  if(reviewSignature055(currentLines)!==review.signature){
   setNotice('ڕەشنووسی کڕین گۆڕاوە؛ پاشەکەوتکردن ڕەتکرایەوە.');
   return;
  }
  const known=loadInvoiceReview055(JSON.stringify({
   ...review,supplierId,invoice:invoice||''
  }),lines);
  if(known.signature!==review.signature||
     (Object.keys(review.prices).length>0&&Object.keys(known.prices).length!==Object.keys(review.prices).length)){
   setNotice('نرخەکانی پسووڵە نادروستن؛ ڕەشنووسەکە پاشەکەوت نەکرا.');
   return;
  }
  try{
   sessionStorage.setItem(reviewKey,JSON.stringify(known));
   setReview(known);
   setNotice('تەنها پێداچوونەوەی ناوخۆی Demo پاشەکەوت کرا؛ کۆگا و حساب نەگۆڕاون.');
  }catch{setNotice('پاشەکەوتکردن لەم تابەدا سەرکەوتوو نەبوو.');}
 };
 return <div className="ws-stack stock-036-shell canva-invoice055" data-demo-only="true">
  <CanvaStockFrame number="055" category="کڕین و دابینکەران"
   title="جیاوازیی پسووڵەی کڕین"
   listTitle="هاوتاکردنەوەی فەرمان، وەرگرتن و پسووڵە"
   summaryTitle="پوختەی جیاوازی"
   onHome={()=>navigateTo('home')}
   filters={<div className="invoice055-filters">
    <div className="invoice055-fields">
     <label>فەرمان
      <input readOnly aria-label="ژمارەی فەرمانی کڕین"
       value="" placeholder="ژمارەی فەرمانی کڕین — پشتڕاست نەکراوە"/>
     </label>
     <label>پسووڵە
      <input readOnly aria-label="ژمارەی پسووڵەی دابینکەر"
       value={invoice} placeholder="ژمارەی پسووڵەی دابینکەر — ڕەشنووس"/>
     </label>
    </div>
    {supplierIds.length>1&&<label className="invoice055-supplier-label">دابینکەری ڕەشنووس
      <select value={supplierId} aria-label="دابینکەر"
       onChange={e=>{setSupplierId(e.target.value);setNotice('');}}>
       {supplierIds.map(id=><option key={id} value={id}>
        {suppliers.find(s=>s.id===id)?.name||'—'}
       </option>)}
      </select>
    </label>}
    <p role="status" className="invoice055-unverified">
     ئەم خشتەیە تەنها بەراوردی ڕەشنووسی وێبگەڕە؛
     فەرمانی پەسەندکراو و نرخی پسووڵەی پشتڕاستکراو بەردەست نین.
    </p>
   </div>}
   summary={<dl>
    <div><dt>ڕیزی ناهاوتا</dt><dd>{totals.mismatchCount===null?'—':totals.mismatchCount}</dd></div>
    <div><dt>جیاوازیی پارە</dt><dd><bdi>{moneyOrUnknown(totals.monetaryDifference)}</bdi></dd></div>
    <div><dt>دۆخی پشکنین</dt><dd>چاوەڕوان — Demo</dd></div>
   </dl>}
   actions={<>
    <button type="button" className="stock-036-primary"
     disabled={!canPostInvoiceReview055()}
     title="ناردن بۆ چارەسەرکردن پێویستی بە سێرڤەری پشتڕاستکراو و ناسنامەی فەرمان هەیە">
     ناردن بۆ چارەسەرکردن
    </button>
    <button type="button" disabled={!canSave} onClick={save}>پاشەکەوتکردنی پێداچوونەوەی Demo</button>
    <button type="button" className="stock-workflow-link"
     onClick={()=>navigateTo('suppliers','invoice','purchase-order')}>
     گەڕانەوە بۆ پسووڵە
    </button>
   </>}
   note={<span className="invoice055-notes">
    <span>ڕیزی ناهاوتا دەبێت پشکنین و هۆکارێکی تۆمارکراوی هەبێت.</span>
    <label>هۆکاری جیاوازی
     <select value={review.reason} aria-label="هۆکاری جیاوازی"
      onChange={e=>{setReview(v=>({...v,reason:e.target.value}));setNotice('');}}>
      {reasons.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
     </select>
    </label>
    <span>پارەدان یان زیادکردنی کۆگا پێش چارەسەرکردنی جیاوازی نابێت دووبارە بکرێت.</span>
    <span role="status">{notice}</span>
   </span>}>
   <CanvaStockTable columns={['کاڵا','وەرگیراو','نرخی فەرمان','نرخی پسووڵە','جیاوازی']}>
    {rows.length?rows.map(({line,comparison})=><tr key={line.key}
     data-invoice055-row={line.key} data-invoice055-status={comparison.state}>
     <td>{line.productName} <small>({units[line.unit]})</small></td>
     <td><bdi>{comparison.received===null?'—':
      comparison.received.toLocaleString('en-US',{maximumFractionDigits:3})}</bdi></td>
     <td><bdi>{moneyOrUnknown(comparison.orderedPrice)}</bdi></td>
     <td><input dir="ltr" type="text" inputMode="numeric" autoComplete="off"
      aria-label={'نرخی پسووڵە (ڕەشنووس): '+line.productName}
      value={review.prices[line.key]||''}
      aria-invalid={review.prices[line.key]!==undefined&&review.prices[line.key]!==''&&
       comparison.invoicePrice===null}
      placeholder="—"
      onChange={e=>{setReview(v=>({...v,prices:{...v.prices,[line.key]:e.target.value}}));setNotice('');}}/></td>
     <td data-invoice055-delta={comparison.state}><bdi>{
      comparison.amountDifferenceIqd===null?'—':moneyOrUnknown(comparison.amountDifferenceIqd)
     }</bdi></td>
    </tr>):Array.from({length:4},(_,i)=><tr key={i} data-invoice055-placeholder="true"
      aria-hidden="true"><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>)}
   </CanvaStockTable>
  </CanvaStockFrame>
 </div>;
}
